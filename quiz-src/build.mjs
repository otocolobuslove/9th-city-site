// quiz-src/questions.mjs から quiz/data.js を生成する。
//   node quiz-src/build.mjs
// 正答は SHA-256 ハッシュ、解説（正答・参考資料込み）は AES-GCM で暗号化して書き出す。
// 鍵・ソルトは quiz/ 側の JS にもべた書き（見る気になれば見られる、程度の目隠し）。
import { webcrypto as crypto } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { questions } from "./questions.mjs";

const SALT = "nacoco-asahikawa-quiz";
const PASSPHRASE = "9th-city-site";

const enc = new TextEncoder();
const hex = (buf) => Buffer.from(buf).toString("hex");
const b64 = (buf) => Buffer.from(buf).toString("base64");

const keyString = (q, ans) =>
  q.type === "single" ? String(ans) : q.type === "multi" ? [...ans].sort((a, b) => a - b).join(",") : ans.join(",");

const sha256 = async (s) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));

const pub = [];
const secret = [];
for (const [i, q] of questions.entries()) {
  const id = `q${i + 1}`;
  if (q.type === "order" && q.answer.join(",") === q.choices.map((_, k) => k).join(",")) {
    throw new Error(`${id}: 並び替えの初期順が正解と同じ`);
  }
  pub.push({ id, type: q.type, q: q.q, choices: q.choices, h: await sha256(`${SALT}:${id}:${keyString(q, q.answer)}`) });
  secret.push({ answer: q.answer, explain: q.explain, refs: q.refs });
}

const keyBytes = await crypto.subtle.digest("SHA-256", enc.encode(PASSPHRASE));
const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
// IV は平文のハッシュから決める。同じ元データからは毎回同じ data.js ができるので、
// CI で「再生成して差分があるか」を判定できる（同一平文以外で IV が重なることはない）。
const plainBytes = enc.encode(JSON.stringify(secret));
const iv = new Uint8Array(await crypto.subtle.digest("SHA-256", plainBytes)).slice(0, 12);
const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plainBytes);

const out =
  "// 自動生成ファイル（quiz-src/build.mjs）。直接編集しないこと。\n" +
  "window.QUIZ = " +
  JSON.stringify({ salt: SALT, questions: pub, secret: { iv: b64(iv), ct: b64(ct) } }, null, 1) +
  ";\n";
const dest = fileURLToPath(new URL("../quiz/data.js", import.meta.url));
writeFileSync(dest, out);
console.log(`wrote ${dest} (${questions.length} questions)`);
