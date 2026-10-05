/* =========================================================================
   案内中の画面（案内バー・移動の詳細・候補の切替・やり直し・AR への切替）
   ・案内バーをタップ → 「移動の詳細」シート（区間ごとの 乗る駅／号車／乗り場／降りる駅／出口）
   ・「地図」「詳細」は1タップで行き来。候補チップで別の案に即切替。「やり直す」は現在地から再見積もり
   ・号車・乗り場・出口は data/details/<駅名>.js の現地調査データだけを使い、無い駅は「未調査」と出す（推測しない）
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc;
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
var U = {}; RG.NavUI = U;
function N() { return RG.Nav; }
function yen(v) { return "¥" + Math.round(v || 0).toLocaleString("ja-JP"); }
var ICON = { stair: "🪜", elevator: "🛗", escalator: "🛗", gate: "🚪", toilet: "🚻", transfer: "🔀" };

/* ---------------------------------------------------------- 駅の調査データ */
/* data/details/<駅名>.js を読む（駅カードと同じ仕組み）。無ければ null */
function loadDetail(name, cb) {
  var d = RG.details[name];
  if (d !== undefined && d !== "loading") { cb(d === "none" ? null : d); return; }
  if (d === "loading") { var t = setInterval(function () {
    if (RG.details[name] !== "loading") { clearInterval(t); cb(RG.details[name] === "none" ? null : RG.details[name]); } }, 40); return; }
  RG.details[name] = "loading";
  var sc = document.createElement("script");
  sc.src = "data/details/" + encodeURIComponent(name) + ".js";
  sc.onload = sc.onerror = function () {
    if (RG.details[name] === "loading") RG.details[name] = "none";
    cb(RG.details[name] === "none" ? null : RG.details[name]);
  };
  document.head.appendChild(sc);
}
function loadAll(names, cb) {
  var left = names.length, out = {};
  if (!left) { cb(out); return; }
  names.forEach(function (n) { loadDetail(n, function (d) { out[n] = d; if (--left === 0) cb(out); }); });
}

/* ---------------------------------------------------------- 案内バー */
U.bar = function (b, off, rest, acc, stopFn) {
  var n = N();
  var pct = n.startKm ? Math.max(0, Math.min(100, (1 - (rest == null ? n.startKm : rest) / n.startKm) * 100)) : 0;
  var cands = candidates();
  b.innerHTML =
    '<div class="nav__bar">' +
      '<button class="nav__main" type="button" id="nv-detail" aria-label="移動の詳細を開く">' +
        '<span class="nav__i">🧭</span>' +
        '<span class="nav__t"><b>' + esc(n.destName) + "</b> へ案内中 <u>詳細 ▸</u>" +
          '<i>' + esc(n.modeLabel) +
          (rest != null ? " ・ のこり約 " + rest.toFixed(1) + "km" : "") +
          (off != null ? " ・ ルートから " + Math.round(off) + "m" : "") +
          (acc ? " ・ 精度±" + Math.round(acc) + "m" : "") + "</i></span></button>" +
      '<button class="nav__x nav__x--ar" id="nv-ar" type="button" title="カメラで方向を見る">📷 AR</button>' +
      (n.muted ? '<button class="nav__x" id="nv-unmute" type="button" title="お知らせを再開">🔕</button>' : "") +
      '<button class="nav__x" id="nv-stop" type="button">やめる</button>' +
    "</div>" +
    '<div class="nav__step" id="nv-step">' + esc(nextStepText()) + "</div>" +
    (cands.length > 1 ? '<div class="nav__cands" id="nv-cands">' + cands.map(function (c) {
      return '<button class="nav__cand' + (c.o === n.opt ? " on" : "") + '" type="button" data-cand="' + c.i + '">' +
        c.o.m.emoji + " " + esc(c.o.m.label) + " <b>" + c.o.minutes + "分</b> " + yen(c.o.yen) + "</button>"; }).join("") +
      '<button class="nav__cand nav__cand--redo" type="button" id="nv-redo">🔁 やり直す</button></div>' :
      '<div class="nav__cands"><button class="nav__cand nav__cand--redo" type="button" id="nv-redo">🔁 現在地から案内し直す</button></div>') +
    '<div class="nav__prog"><i style="width:' + pct.toFixed(1) + '%"></i></div>';
  $("#nv-stop", b).addEventListener("click", function () { stopFn(); });
  $("#nv-detail", b).addEventListener("click", function () { U.openDetail(); });
  $("#nv-ar", b).addEventListener("click", function () { if (RG.AR) RG.AR.open(); });
  $("#nv-redo", b).addEventListener("click", function () { U.redo(); });
  var um = $("#nv-unmute", b);
  if (um) um.addEventListener("click", function () { n.muted = false; RG.tripStatus("ルートのお知らせを再開しました。", "ok", 2400); U.refresh(); });
  $$("[data-cand]", b).forEach(function (c) { c.addEventListener("click", function () { U.switchTo(+c.dataset.cand); }); });
  var cs = $("#nv-cands", b), on = cs && cs.querySelector(".on");
  if (on && on.scrollIntoView) on.scrollIntoView({ block: "nearest", inline: "center" });
};
U.refresh = function () { var n = N(), b = $("#navbar"); if (n.on && b) U.bar(b, n.lastOff, n.lastRest, n.lastAcc, RG.stopNav); };

/* 比較結果の候補（運休中のものは除く） */
function candidates() {
  var n = N(), r = n.ctx && n.ctx.result;
  if (!r) return [];
  return r.options.map(function (o, i) { return { o: o, i: i }; }).filter(function (x) { return !x.o.stopped; });
}

/* ---------------------------------------------------------- 次にすること */
/* いま居る場所から見て、つぎの目印（駅 or 目的地）を返す {name, coord, idx} */
U.nextWaypoint = function () {
  var n = N(), here = n.last || RG.Trip.origin, path = n.path || [];
  if (!here || path.length < 2) return { name: n.destName, coord: n.dest, idx: path.length - 1 };
  // いちばん近い線分を探し、その先端を次の目印にする
  var best = 1e18, bi = 0;
  for (var i = 0; i < path.length - 1; i++) {
    var d = RG.navDistToPath(here, [path[i], path[i + 1]]);
    if (d < best) { best = d; bi = i; }
  }
  var idx = Math.min(path.length - 1, bi + 1);
  var st = stationAt(idx);
  return { name: st ? st.n + "駅" : n.destName, coord: path[idx], idx: idx, station: st };
}
function stationAt(idx) {
  var n = N(), r = n.opt && n.opt.rail, ids = r && r.stations;
  if (!ids || !ids.length) return null;
  // path = [出発地, 乗る駅…降りる駅, 目的地]
  var si = idx - 1;
  return (si >= 0 && si < ids.length) ? RG.byId[ids[si]] : null;
}
function nextStepText() {
  var n = N(), r = n.opt && n.opt.rail, W = RG.CONFIG.modes.walk, DT = RG.CONFIG.detour.walk;
  if (!r || !r.stations || !r.stations.length) {
    var km = n.last ? RG.hav(n.last, n.dest) : n.startKm;
    return "▶ " + n.modeLabel + "で " + n.destName + " へ（約 " + (km || 0).toFixed(1) + "km）";
  }
  var wp = U.nextWaypoint(), here = n.last || RG.Trip.origin;
  var legs = r.legs || [];
  if (wp.idx <= 1) {
    var b = RG.byId[r.board], km1 = here ? RG.hav(here, [b.la, b.lo]) : 0;
    return "🚶 " + b.n + "駅まで徒歩約" + Math.round(km1 * DT / W.speed * 60) + "分 ／ " + (legs[0] ? legs[0].line + " → " + RG.byId[legs[0].to].n + "駅" : "");
  }
  if (wp.idx >= (n.path || []).length - 1) {
    var a = RG.byId[r.alight];
    return "🚶 " + a.n + "駅で降りて " + n.destName + " まで徒歩約" + Math.round(r.egressMin) + "分";
  }
  // 乗車中：この区間の降りる駅と、乗換があれば次の路線
  var sid = wp.station && wp.station.id, cur = null, nxt = null;
  legs.forEach(function (L, i) { if (L.stations.indexOf(sid) >= 0 && !cur) { cur = L; nxt = legs[i + 1] || null; } });
  if (!cur) return "🚃 " + n.destName + " へ";
  var toN = RG.byId[cur.to];
  // 「あと n 駅」= 次の目印の駅から降りる駅まで（次の目印そのものも数える）
  var left = Math.max(1, cur.stations.indexOf(cur.to) - cur.stations.indexOf(sid) + 1);
  return "🚃 " + cur.line + " ／ " + toN.n + "駅" + (nxt ? "で乗換 → " + nxt.line : "で降車") +
    (left === 1 ? "（次の駅）" : "（あと " + left + " 駅）");
}
U.nextStepText = nextStepText;

/* ---------------------------------------------------------- 移動の詳細 */
var detailOpen = false;
U.openDetail = function () {
  var n = N(); if (!n.on) return;
  var r = n.opt && n.opt.rail, names = [];
  if (r && r.legs) r.legs.forEach(function (L) { names.push(RG.byId[L.from].n, RG.byId[L.to].n); });
  names = names.filter(function (x, i, a) { return a.indexOf(x) === i; });
  var m = RG.openModal("🧭 移動の詳細", '<div class="nd"><p class="lvt">しらべています…</p></div>');
  detailOpen = true;
  loadAll(names, function (D) {
    if (!detailOpen) return;
    var bd = m.querySelector(".modal__bd");
    bd.innerHTML = renderDetail(D);
    bind(m);
    if (RG.Live && RG.Live.decorateRoutes) RG.Live.decorateRoutes(m, null, null);
  });
};
function bind(m) {
  var mp = $("#nd-map", m); if (mp) mp.addEventListener("click", function () { RG.closeModal(); detailOpen = false; });
  var ar = $("#nd-ar", m); if (ar) ar.addEventListener("click", function () { RG.closeModal(); detailOpen = false; if (RG.AR) RG.AR.open(); });
  var cmp = $("#nd-cmp", m); if (cmp) cmp.addEventListener("click", function () { RG.closeModal(); detailOpen = false; if (N().destId && RG.showRoutes) RG.showRoutes(N().destId); });
  var rd = $("#nd-redo", m); if (rd) rd.addEventListener("click", function () { RG.closeModal(); detailOpen = false; U.redo(); });
  $$("[data-cand]", m).forEach(function (c) { c.addEventListener("click", function () { RG.closeModal(); detailOpen = false; U.switchTo(+c.dataset.cand); }); });
  $$("[data-st]", m).forEach(function (b) { b.addEventListener("click", function () { RG.closeModal(); detailOpen = false; RG.openStation(b.dataset.st); }); });
}
function row(k, v, sub, cls) {
  return '<div class="ex' + (cls ? " " + cls : "") + '"><span class="ex__k">' + k + '</span><span class="ex__v">' + v + "</span>" +
    (sub ? '<span class="ex__s">' + sub + "</span>" : "") + "</div>";
}
/* 駅の調査データから「この目的に合う号車」を出す。無ければ未調査と言う */
function carsFor(d, purpose) {
  if (!d || !d.boarding || !d.boarding.length) return null;
  var want = purpose === "transfer" ? ["transfer", "stair", "elevator", "escalator"] : ["gate", "stair", "elevator", "escalator"];
  var rows = d.boarding.filter(function (b) { return want.indexOf(b.type) >= 0; })
    .sort(function (a, b) { return want.indexOf(a.type) - want.indexOf(b.type); });
  return rows.length ? rows : d.boarding;
}
function carsHtml(name, d, purpose) {
  var rows = carsFor(d, purpose);
  if (!rows) return '<div class="nd__na">号車：<b>未調査</b>　<code>data/details/' + esc(name) + '.js</code> を作ると出ます</div>';
  var main = rows[0];
  return '<div class="nd__cars"><span class="nd__car">' + main.car + "号車</span> " + (ICON[main.type] || "") + " " + esc(main.label) +
    (main.pos ? '<span class="lvt">（' + esc(main.pos) + "寄り）</span>" : "") +
    (rows.length > 1 ? '<div class="nd__more">ほか：' + rows.slice(1, 4).map(function (b) { return b.car + "号車 " + (ICON[b.type] || "") + esc(b.label); }).join("／") + "</div>" : "") +
    (d.status === "sample" ? '<div class="lvt lvt--ng">※ サンプル値です。実地調査で置き換えてください</div>' : "") + "</div>";
}
/* 乗り場（番線）と出口は、調査データに tracks / exits があるときだけ */
function trackHtml(d, line, dirHint) {
  if (!d || !d.tracks || !d.tracks.length) return '<div class="nd__na">乗り場：<b>未調査</b></div>';
  var hit = d.tracks.filter(function (t) { return !t.line || line.indexOf(t.line) >= 0 || t.line.indexOf(line) >= 0; });
  if (!hit.length) hit = d.tracks;
  return '<div class="nd__tracks">乗り場：' + hit.slice(0, 3).map(function (t) {
    return "<b>" + esc(t.no) + "番線</b>" + (t.dir ? "（" + esc(t.dir) + "）" : "") + (t.note ? " " + esc(t.note) : ""); }).join("／") +
    (dirHint ? '<span class="lvt"> ' + esc(dirHint) + "</span>" : "") + "</div>";
}
function exitHtml(d) {
  if (!d || !d.exits || !d.exits.length) return '<div class="nd__na">出口：<b>未調査</b>　駅カードの「駅構内」も見てください</div>';
  var rec = d.exits.filter(function (e) { return e.recommended; })[0] || d.exits[0];
  return '<div class="nd__exit">出口：<b>' + esc(rec.name) + "</b>" + (rec.for ? "（" + esc([].concat(rec.for).join("・")) + "）" : "") +
    (rec.note ? " " + esc(rec.note) : "") +
    (d.exits.length > 1 ? '<div class="nd__more">ほか：' + d.exits.filter(function (e) { return e !== rec; }).slice(0, 3).map(function (e) { return esc(e.name) + (e.for ? "（" + esc([].concat(e.for).join("・")) + "）" : ""); }).join("／") + "</div>" : "") + "</div>";
}
function renderDetail(D) {
  var n = N(), o = n.opt || {}, r = o.rail, W = RG.CONFIG.modes.walk, DT = RG.CONFIG.detour.walk;
  var here = n.last || RG.Trip.origin;
  var head = '<div class="nd__hd"><div class="nd__route"><b>' + esc(RG.Trip.label || "出発地") + "</b> → <b>" + esc(n.destName) + "</b></div>" +
    '<div class="nd__sum">' + (o.m ? o.m.emoji + " " + esc(o.m.label) : "") + "　所要 <b>" + (o.minutes || "—") + "分</b>　" + yen(o.yen) +
    (r ? "　乗換 " + r.transfers + " 回" : "") + "</div>" +
    '<div class="nd__tools">' +
      '<button class="lvb" type="button" id="nd-map">🗺️ 地図を見る</button>' +
      '<button class="lvb" type="button" id="nd-ar">📷 AR で方向を見る</button>' +
      '<button class="lvb" type="button" id="nd-cmp">🧭 候補をくらべる</button>' +
      '<button class="lvb" type="button" id="nd-redo">🔁 現在地からやり直す</button>' +
    "</div></div>";
  var cands = candidates();
  var candHtml = cands.length > 1 ? '<div class="nd__cands">' + cands.map(function (c) {
    return '<button class="nav__cand' + (c.o === o ? " on" : "") + '" type="button" data-cand="' + c.i + '">' + c.o.m.emoji + " " +
      esc(c.o.m.label) + " <b>" + c.o.minutes + "分</b> " + yen(c.o.yen) + "</button>"; }).join("") + "</div>" : "";
  var steps = [];
  if (r && r.legs && r.legs.length) {
    var b = RG.byId[r.board], a = RG.byId[r.alight];
    var km1 = here ? RG.hav(here, [b.la, b.lo]) : 0;
    steps.push('<div class="nd__step"><div class="nd__t">🚶 ' + esc(b.n) + "駅まで歩く <span>約" + Math.round(km1 * DT / W.speed * 60) + "分・" + Math.round(km1 * 1000) + "m</span></div></div>");
    r.legs.forEach(function (L, i) {
      var from = RG.byId[L.from], to = RG.byId[L.to], next = r.legs[i + 1], Dto = D[to.n], Dfrom = D[from.n];
      var dirHint = Dfrom && (Dfrom.dirLeft || Dfrom.dirRight) ? "方面の目安：" + [Dfrom.dirLeft, Dfrom.dirRight].filter(Boolean).join("／") : "";
      steps.push('<div class="nd__step nd__step--rail" style="--c:' + (RG.lineColor[L.line] || "#9AA0A6") + '">' +
        '<div class="nd__t">' + (RG.lineBadge ? RG.lineBadge(L.line) : "") + esc(L.line) + " <span>" + esc(from.n) + " → " + esc(to.n) + "（" + (L.stations.length - 1) + "駅）</span></div>" +
        '<div class="opt__live" data-live-lines="' + esc(L.line) + '"><span class="lvh">🚦 運行情報</span><span class="lvt">しらべています…</span></div>' +
        '<div class="nd__sub"><b>' + esc(from.n) + "駅で乗る</b>" + trackHtml(Dfrom, L.line, dirHint) +
          (next ? carsHtml(to.n, Dto, "transfer") : carsHtml(to.n, Dto, "exit")) +
          '<div class="lvt">' + (next ? esc(to.n) + "駅での乗換に近い号車" : esc(to.n) + "駅の改札・出口に近い号車") + "</div></div>" +
        (next ? '<div class="nd__sub"><b>🔀 ' + esc(to.n) + "駅で乗換</b> → " + esc(next.line) + trackHtml(Dto, next.line, "") + "</div>" : "") +
        '<button class="lvb" type="button" data-st="' + esc(to.id) + '">' + esc(to.n) + "駅のカード ▸</button></div>");
    });
    steps.push('<div class="nd__step"><div class="nd__t">🚶 ' + esc(a.n) + "駅から " + esc(n.destName) + " へ <span>徒歩約" + Math.round(r.egressMin) + "分</span></div>" +
      '<div class="nd__sub">' + exitHtml(D[a.n]) + "</div></div>");
  } else {
    var km = here ? RG.hav(here, n.dest) : n.startKm;
    steps.push('<div class="nd__step"><div class="nd__t">' + (o.m ? o.m.emoji : "▶") + " " + esc(n.destName) + " へ <span>約" + (km || 0).toFixed(1) + "km</span></div>" +
      '<ul class="opt__d">' + (o.detail || []).map(function (d) { return "<li>" + esc(d) + "</li>"; }).join("") + "</ul></div>");
  }
  var src = '<p class="src">号車・乗り場・出口は <code>data/details/&lt;駅名&gt;.js</code> の現地調査データだけを使っています。無い駅は「未調査」と出し、推測で埋めません。' +
    "所要時間はモデルによる概算、運行情報は公共交通オープンデータセンター（取得時刻つき）です。</p>";
  return '<div class="nd">' + head + candHtml + '<div class="nd__now">' + esc(nextStepText()) + "</div>" + steps.join("") + src + "</div>";
}

/* ---------------------------------------------------------- 候補切替・やり直し */
U.switchTo = function (i) {
  var n = N(), r = n.ctx && n.ctx.result; if (!r || !r.options[i]) return;
  var o = r.options[i];
  RG.startNav(n.dest, n.destName, o, n.ctx);
  RG.tripStatus("▶ " + o.m.emoji + " " + o.m.label + " の案で案内します（" + o.minutes + "分・" + yen(o.yen) + "）", "ok", 3200);
};
U.redo = function () {
  var n = N(); if (!n.on) return;
  var here = n.last || RG.Trip.origin; if (!here) return;
  var cur = n.opt && n.opt.id;
  RG.setOrigin(here, n.last ? "現在地（やり直し）" : (RG.Trip.label || "出発地"), null, n.lastAcc);
  var res = RG.Planner.estimate(here, n.dest, new Date(), RG.Trip.aggr);
  var pick = res.options.filter(function (o) { return o.id === cur && !o.stopped; })[0] ||
             res.options.filter(function (o) { return !o.stopped; })[0] || res.options[0];
  if (!pick) { RG.tripStatus("案を作れませんでした。", "warn"); return; }
  RG.startNav(n.dest, n.destName, pick, { result: res, destId: n.destId, destName: n.destName });
  RG.tripStatus("🔁 いまの場所から案内し直しました（" + pick.m.label + "・" + pick.minutes + "分）", "ok", 3200);
};

/* ---------------------------------------------------------- 位置の更新 */
U.update = function (c, off, rest, acc) {
  var s = $("#nv-step"); if (s) s.textContent = nextStepText();
  if (RG.AR && RG.AR.update) RG.AR.update(c, acc);
};
U.onStart = function () { detailOpen = false; };
U.onStop = function () { if (RG.AR && RG.AR.close) RG.AR.close(true); if (detailOpen) { RG.closeModal(); detailOpen = false; } };

})(window.RG);
