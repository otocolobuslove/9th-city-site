// 旭川クイズ：問題ページの処理（本編 quiz/index.html と難問 quiz/extra.html で共通）。
//   runQuiz(Q, payload)
//     Q       … 問題セット（questions / salt / limitSec）
//     payload … 解説ページへ渡すデータに追加する項目（難問クイズでは { s: "x", m: 本編の回答 }）
window.runQuiz = (Q, payload = {}) => {
  const LIMIT = Q.limitSec * 1000;   // 制限時間（ミリ秒）。quiz-src/questions.mjs で設定
  const TYPE = { single: "4択", multi: "一問多答", order: "並び替え" };
  const $ = (id) => document.getElementById(id);
  const form = $("quiz");
  let startAt = 0, timerId = 0, graded = false;
  let cards = [], cur = 0;    // 1問ずつ表示：問題カードと、表示中の問題の番号（0始まり）
  const seen = new Set();     // 表示した並び替え問題（表示した時点で「回答済み」扱い。未表示でも初期の並びで採点する）
  const orders = {};          // 並び替えの現在の並び（選択肢番号の配列）。初期の並びも回答として扱う

  const fmt = (ms) => {
    const s = Math.floor(ms / 1000), m = Math.floor(s / 60), ss = s % 60;
    return m + ":" + String(ss).padStart(2, "0");
  };
  const el = (tag, attrs = {}, text) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text != null) e.textContent = text;
    return e;
  };

  function render() {
    Q.questions.forEach((q, i) => {
      const card = el("fieldset", { class: "card", id: "card-" + q.id });
      card.style.margin = "0 0 16px";
      const head = el("div", { class: "qhead" });
      head.append(el("span", { class: "qnum" }, "第" + (i + 1) + "問"), el("span", { class: "qtype" }, TYPE[q.type]));
      card.append(head, el("p", { class: "qtext" }, q.q));

      if (q.type === "order") {
        orders[q.id] = q.choices.map((_, k) => k);
        card.append(
          el("ol", { class: "order", id: "order-" + q.id }),
          el("p", { class: "hint" }, "行をドラッグ（スマホは左の ⠿ をつまむ）するか、▲▼ボタンで並べ替えてください。"),
        );
      } else {
        const ul = el("ul", { class: "choices" });
        q.choices.forEach((c, k) => {
          const li = el("li"), lab = el("label");
          const inp = el("input", { type: q.type === "single" ? "radio" : "checkbox", name: q.id, value: k });
          lab.append(inp, el("span", {}, c));
          li.append(lab); ul.append(li);
        });
        card.append(ul);
      }
      form.append(card);
      if (q.type === "order") drawOrder(q);
    });
    form.addEventListener("change", updateProgress);
    cards = [...form.children];
    Q.questions.forEach((q, i) => {
      const li = el("li"), b = el("button", { type: "button", "aria-label": `第${i + 1}問へ` }, i + 1);
      b.onclick = () => show(i);
      li.append(b); $("qnav").append(li);
    });
  }

  // ---- 1問ずつ表示 ----
  function show(i) {
    const dir = i < cur ? "back" : "enter";
    cur = i;
    seen.add(Q.questions[i].id);
    cards.forEach((c, k) => (c.hidden = k !== i));
    const c = cards[i];
    c.classList.remove("enter", "back");
    void c.offsetWidth;            // アニメーションをやり直すため
    if (dir) c.classList.add(dir);
    const last = i === cards.length - 1;
    $("count").textContent = `${i + 1} / ${cards.length}`;
    $("prev").disabled = i === 0;
    $("next").textContent = last ? "採点する" : "次の問題 →";
    updateProgress();
    const top = form.getBoundingClientRect().top;
    if (top < 0) window.scrollTo({ top: window.scrollY + top - 70 });   // 問題の先頭が隠れていたら戻す
  }
  $("prev").onclick = () => cur > 0 && show(cur - 1);
  $("next").onclick = () => (cur === cards.length - 1 ? grade(false) : show(cur + 1));

  // ---- 並び替え ----
  function drawOrder(q, flashK) {
    const ol = $("order-" + q.id);
    ol.textContent = "";
    const cur = orders[q.id], locked = !!form.dataset.locked;
    cur.forEach((k, pos) => {
      const li = el("li", { "data-k": k });
      if (k === flashK) li.classList.add("flash");
      const moves = el("span", { class: "moves" });
      const up = el("button", { type: "button", "aria-label": "1つ上へ" }, "▲");
      const down = el("button", { type: "button", "aria-label": "1つ下へ" }, "▼");
      up.disabled = locked || pos === 0;
      down.disabled = locked || pos === cur.length - 1;
      up.onclick = () => swap(q, pos, pos - 1);
      down.onclick = () => swap(q, pos, pos + 1);
      moves.append(up, down);
      li.append(el("span", { class: "grip", "aria-hidden": "true" }, "⠿"), el("span", { class: "pos" }, pos + 1),
        el("span", { class: "label" }, q.choices[k]), moves);
      li.addEventListener("pointerdown", (e) => startDrag(e, q, li));
      ol.append(li);
    });
    if (flashK != null) setTimeout(() => ol.querySelector(".flash")?.classList.remove("flash"), 350);
  }
  function swap(q, a, b) {
    const arr = orders[q.id], k = arr[a];
    [arr[a], arr[b]] = [arr[b], arr[a]];
    drawOrder(q, k);
  }
  function renumber(ol) {
    [...ol.children].forEach((li, i) => (li.querySelector(".pos").textContent = i + 1));
  }
  function startDrag(e, q, li) {
    if (form.dataset.locked || e.button > 0 || e.target.closest("button")) return;
    // タッチではページのスクロールと区別するため、つまみ部分からのみドラッグ
    if (e.pointerType !== "mouse" && !e.target.closest(".grip")) return;
    e.preventDefault();
    const ol = li.parentElement;
    li.setPointerCapture(e.pointerId);
    li.classList.add("dragging");
    let startY = e.clientY;

    const onMove = (ev) => {
      // 掴んだ行は DOM 上で動かさず（ポインタキャプチャが外れるため）、隣の行を入れ替える
      // 素早く動かした場合に備え、位置が落ち着くまで繰り返す
      const mid = (r) => r.top + r.height / 2;
      for (;;) {
        li.style.transform = `translateY(${ev.clientY - startY}px)`;
        const self = li.getBoundingClientRect();
        const prev = li.previousElementSibling, next = li.nextElementSibling;
        const before = li.offsetTop;
        if (prev && mid(self) < mid(prev.getBoundingClientRect())) ol.insertBefore(prev, li.nextSibling);
        else if (next && mid(self) > mid(next.getBoundingClientRect())) ol.insertBefore(next, li);
        else break;
        startY += li.offsetTop - before;
      }
      renumber(ol);
    };
    const onEnd = () => {
      li.removeEventListener("pointermove", onMove);
      li.removeEventListener("pointerup", onEnd);
      li.removeEventListener("pointercancel", onEnd);
      orders[q.id] = [...ol.children].map((x) => +x.dataset.k);
      drawOrder(q);
    };
    li.addEventListener("pointermove", onMove);
    li.addEventListener("pointerup", onEnd);
    li.addEventListener("pointercancel", onEnd);
  }

  // ---- 回答の収集と採点 ----
  function collect() {
    return Q.questions.map((q) => {
      if (q.type === "order") return orders[q.id].slice();
      const picked = [...form.querySelectorAll(`input[name="${q.id}"]:checked`)].map((x) => +x.value);
      if (!picked.length) return null;
      return q.type === "single" ? picked[0] : picked;
    });
  }
  // 回答済みかどうか（表示用・未回答の確認用）。並び替えは一度表示したら回答済み
  const answeredFlags = () => collect().map((a, i) => (Q.questions[i].type === "order" ? seen.has(Q.questions[i].id) : a !== null));
  function updateProgress() {
    const done = answeredFlags();
    $("progress").textContent = `回答済み ${done.filter(Boolean).length} / ${Q.questions.length}`;
    [...$("qnav").querySelectorAll("button")].forEach((b, i) => {
      b.classList.toggle("done", done[i]);
      b.classList.toggle("current", i === cur);
    });
  }

  function tick() {
    const remain = LIMIT - (Date.now() - startAt);
    $("remain").textContent = fmt(Math.max(0, remain) + 999);   // 秒は切り上げで表示（4:00 → 0:01 → 0:00）
    $("timerbar").classList.toggle("low", remain <= 60 * 1000);
    if (remain <= 0) grade(true);
  }

  $("start").onclick = () => {
    $("intro").hidden = true;
    form.hidden = $("timerbar").hidden = $("stage-nav").hidden = false;
    show(0);
    startAt = Date.now();
    timerId = setInterval(tick, 200);
    window.addEventListener("beforeunload", warnLeave);
    window.scrollTo(0, 0);
  };
  const warnLeave = (e) => { e.preventDefault(); e.returnValue = ""; };

  async function grade(timeUp) {
    if (graded) return;
    const answers = collect();
    if (!timeUp) {
      const blank = answeredFlags().map((d, i) => (d ? 0 : i + 1)).filter(Boolean);
      if (blank.length && !confirm(`未回答の問題があります（第${blank.join("・")}問）。\nこのまま採点しますか？`)) return;
      if (graded) return;
      // 確認ダイアログ表示中はタイマーが止まるので、閉じた時点で時間切れなら時間切れ扱い
      if (Date.now() - startAt >= LIMIT) timeUp = true;
    }
    graded = true;
    const ms = Math.min(Date.now() - startAt, LIMIT);
    clearInterval(timerId);
    window.removeEventListener("beforeunload", warnLeave);
    $("remain").textContent = fmt(LIMIT - ms + 999);

    form.dataset.locked = "1";
    form.querySelectorAll("input").forEach((x) => (x.disabled = true));
    Q.questions.filter((q) => q.type === "order").forEach((q) => drawOrder(q));
    form.hidden = $("stage-nav").hidden = true;

    let score = 0;
    for (const [i, q] of Q.questions.entries()) {
      if (await QuizCommon.isCorrect(Q.salt, q, answers[i])) score++;
    }

    $("timeup").hidden = !timeUp;
    $("score").textContent = `${score} / ${Q.questions.length} 問正解`;
    $("time").textContent = fmt(ms);
    $("golink").href = "answer.html#r=" + QuizCommon.encodeParam({ a: answers, t: ms, ...payload });
    $("result").hidden = false;
    $("result").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // 制限時間・問題数の表示（.js-limit / .js-count）
  const limitText = Q.limitSec % 60 ? `${Q.limitSec}秒` : `${Q.limitSec / 60}分`;
  document.querySelectorAll(".js-limit").forEach((e) => (e.textContent = limitText));
  document.querySelectorAll(".js-count").forEach((e) => (e.textContent = Q.questions.length));
  $("remain").textContent = fmt(LIMIT);
  render();
  $("start").disabled = false;
  $("start").textContent = "回答を始める";
};
