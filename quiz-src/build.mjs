// quiz-src/questions.mjs から quiz/data.js を生成する。
//   node quiz-src/build.mjs
// 正答は SHA-256 ハッシュ、解説（正答・出典込み）は AES-GCM で暗号化して書き出す。
// 鍵・ソルトは quiz/common.js にもべた書き（見る気になれば見られる、程度の目隠し）。
//
// 難問クイズ（extra）は、問題文ごと「本編の正答から作る鍵」で暗号化する。
// 本編で全問正解した人の回答からしか鍵が作れないので、全問正解者だけが問題を見られる。
import { webcrypto as crypto } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { questions, extra, LIMIT_SEC, EXTRA_LIMIT_SEC } from "./questions.mjs";

// quiz/common.js と揃えること
const SALT = "nacoco-asahikawa-quiz";
const PASSPHRASE = "9th-city-site";

const enc = new TextEncoder();
const hex = (buf) => Buffer.from(buf).toString("hex");
const b64 = (buf) => Buffer.from(buf).toString("base64");

const keyString = (q, ans) =>
  q.type === "single" ? String(ans) : q.type === "multi" ? [...ans].sort((a, b) => a - b).join(",") : ans.join(",");
const sha256 = async (s) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));

// AES-GCM で暗号化。IV は平文のハッシュから決める。同じ元データからは毎回同じ data.js ができるので、
// CI で「再生成して差分があるか」を判定できる（同一平文以外で IV が重なることはない）。
async function encrypt(keySource, obj) {
  const keyBytes = await crypto.subtle.digest("SHA-256", enc.encode(keySource));
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const plain = enc.encode(JSON.stringify(obj));
  const iv = new Uint8Array(await crypto.subtle.digest("SHA-256", plain)).slice(0, 12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  return { iv: b64(iv), ct: b64(ct) };
}

// 1つの問題セットを、公開部分（問題文・選択肢・正答ハッシュ）と暗号化した解説に分ける
async function buildSet(list, prefix) {
  // 出題順のチェック：難易度（易→中→難）、同じ難易度では形式（4択→一問多答→並び替え）の順
  const LEVELS = ["易", "中", "難"], TYPES = ["single", "multi", "order"];
  let prevRank = -1;
  const pub = [], secret = [];
  for (const [i, q] of list.entries()) {
    const id = `${prefix}${i + 1}`;
    const lv = LEVELS.indexOf(q.level), ty = TYPES.indexOf(q.type);
    if (lv < 0 || ty < 0) throw new Error(`${id}: level か type が不正（${q.level} / ${q.type}）`);
    const rank = lv * 10 + ty;
    if (rank < prevRank) throw new Error(`${id}: 出題順が「難易度 → 形式」の順になっていない`);
    prevRank = rank;
    if (q.type === "order" && q.answer.join(",") === q.choices.map((_, k) => k).join(",")) {
      throw new Error(`${id}: 並び替えの初期順が正解と同じ`);
    }
    pub.push({ id, type: q.type, q: q.q, choices: q.choices, h: await sha256(`${SALT}:${id}:${keyString(q, q.answer)}`) });
    secret.push({ answer: q.answer, explain: q.explain, refs: q.refs });
  }
  return { questions: pub, secret: await encrypt(PASSPHRASE, secret) };
}

const main = await buildSet(questions, "q");
const ex = await buildSet(extra, "x");

// 難問クイズの鍵：本編の正答を並べた文字列（quiz/common.js の extraKeySource と揃えること）
const extraKeySource = `${SALT}:extra:` + questions.map((q) => keyString(q, q.answer)).join("|");

const data = {
  QUIZ: { salt: SALT, limitSec: LIMIT_SEC, ...main },
  QUIZ_EXTRA: { salt: SALT, limitSec: EXTRA_LIMIT_SEC, count: extra.length, locked: await encrypt(extraKeySource, ex) },
};

const out =
  "// 自動生成ファイル（quiz-src/build.mjs）。直接編集しないこと。\n" +
  Object.entries(data).map(([k, v]) => `window.${k} = ${JSON.stringify(v, null, 1)};\n`).join("");
const dest = fileURLToPath(new URL("../quiz/data.js", import.meta.url));
writeFileSync(dest, out);
console.log(`wrote ${dest} (${questions.length} + ${extra.length} questions)`);
