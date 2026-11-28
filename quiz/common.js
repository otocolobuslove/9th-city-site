// 旭川クイズ：問題ページ・解説ページ共通の処理。
// ソルト・パスフレーズ・鍵の作り方は quiz-src/build.mjs と揃えること。
window.QuizCommon = (() => {
  const SALT = "nacoco-asahikawa-quiz";
  const PASSPHRASE = "9th-city-site";
  const enc = new TextEncoder(), dec = new TextDecoder();

  // 回答 → ハッシュ化する文字列（multi は順不同なので並べ替える）
  const keyString = (q, a) =>
    q.type === "single" ? String(a) : q.type === "multi" ? [...a].sort((x, y) => x - y).join(",") : a.join(",");

  async function sha256hex(s) {
    const buf = await crypto.subtle.digest("SHA-256", enc.encode(s));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  const isCorrect = async (salt, q, a) =>
    a !== null && a !== undefined && (await sha256hex(`${salt}:${q.id}:${keyString(q, a)}`)) === q.h;

  // AES-GCM の復号（鍵は keySource の SHA-256）。鍵が違えば例外になる
  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function decrypt(keySource, box) {
    const keyBytes = await crypto.subtle.digest("SHA-256", enc.encode(keySource));
    const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(box.iv) }, key, fromB64(box.ct));
    return JSON.parse(dec.decode(plain));
  }
  const decryptSecret = (box) => decrypt(PASSPHRASE, box);

  // 難問クイズの鍵：本編の回答を並べた文字列。全問正解のときだけ build 時の鍵と一致する
  const extraKeySource = (mainQuestions, answers) =>
    `${SALT}:extra:` + mainQuestions.map((q, i) => (answers[i] == null ? "" : keyString(q, answers[i]))).join("|");
  // 本編の回答から難問クイズ（問題と暗号化された解説）を取り出す。全問正解でなければ例外
  const unlockExtra = (mainAnswers) => decrypt(extraKeySource(window.QUIZ.questions, mainAnswers), window.QUIZ_EXTRA.locked);

  // URL の # に載せるデータ（JSON → URL 向け base64）
  const encodeParam = (obj) =>
    btoa(String.fromCharCode(...enc.encode(JSON.stringify(obj)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const decodeParam = (s) => JSON.parse(dec.decode(fromB64(s.replace(/-/g, "+").replace(/_/g, "/"))));
  const readHash = (name) => {
    const m = location.hash.match(new RegExp(`[#&]${name}=([A-Za-z0-9_-]+)`));
    return m ? m[1] : null;
  };

  return { keyString, sha256hex, isCorrect, decryptSecret, unlockExtra, encodeParam, decodeParam, readHash };
})();
