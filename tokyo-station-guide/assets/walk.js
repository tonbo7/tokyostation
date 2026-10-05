/* =========================================================================
   歩行空間・構内（東京駅周辺） ―― 歩行空間ネットワークデータ（ほこナビ／国土交通省仕様）
   ・拡大したときだけ、歩ける道を「歩きやすさ」の色で地図に重ねる
       緑＝段差なし／黄＝段差・急な坂・狭い／赤＝階段／青＝エレベーター・エスカレーター
   ・エレベーター・階段・トイレなどをスポット（🛗 構内・歩行空間）として出す
   ・東京駅周辺の駅カードに「歩きやすさ」のまとめを出す
   データ（data/indoor.js）が無ければ何もしない。作り方は data/indoor/README.md
   ========================================================================= */
(function (RG) {
"use strict";
var esc = RG.esc;
var W = {}; RG.Walk = W;
var g = null, built = false, applied = false, visible = null;
var KIND = { elevator: { e: "🛗", label: "エレベーター" }, escalator: { e: "🛗", label: "エスカレーター" },
             stairs: { e: "🪜", label: "階段" }, toilet: { e: "🚻", label: "トイレ" },
             info: { e: "ℹ️", label: "案内所" }, facility: { e: "📍", label: "施設" } };

function data() { return RG.INDOOR && RG.INDOOR.links ? RG.INDOOR : null; }
function F() { return (data() && data().flags) || {}; }
/* リンクの印から色の区分を決める */
W.levelOf = function (flags) {
  var f = F();
  if (flags & (f.elevator | f.escalator | f.moving)) return "lift";
  if (flags & f.stairs) return "stairs";
  if (flags & (f.step | f.steep | f.narrow)) return "care";
  return "ok";
};
W.describe = function (flags) {
  var f = F(), a = [];
  if (flags & f.stairs) a.push("階段");
  if (flags & f.elevator) a.push("エレベーター");
  if (flags & f.escalator) a.push("エスカレーター");
  if (flags & f.moving) a.push("動く歩道");
  if (flags & f.slope) a.push("スロープ");
  if (flags & f.step) a.push("段差あり");
  if (flags & f.steep) a.push("急な坂");
  if (flags & f.narrow) a.push("幅1m未満");
  if (flags & f.indoor) a.push("屋内");
  return a.length ? a.join("・") : "段差なし";
};

/* ---------------------------------------------------------- 地図レイヤー */
function build() {
  if (built || !data() || !RG.project) return;
  var svg = document.getElementById("map"); if (!svg) return;
  g = RG.el("g", { class: "walk" });
  var host = svg.querySelector(".poihost");
  if (host) svg.insertBefore(g, host); else svg.appendChild(g);
  var by = { ok: [], care: [], stairs: [], lift: [] };
  data().links.forEach(function (L) {
    var pts = L[0], d = "";
    for (var i = 0; i + 1 < pts.length; i += 2) {
      var P = RG.project(pts[i], pts[i + 1]);
      d += (i ? "L" : "M") + P.x.toFixed(2) + " " + P.y.toFixed(2);
    }
    by[W.levelOf(L[1])].push(d);
  });
  // 路線の太い線の上でも見えるように、白い縁取りを先に引いてから色の線を重ねる
  Object.keys(by).forEach(function (k) {
    if (!by[k].length) return;
    g.appendChild(RG.el("path", { class: "walk__h", d: by[k].join(""), fill: "none" }));
  });
  Object.keys(by).forEach(function (k) {
    if (!by[k].length) return;
    g.appendChild(RG.el("path", { class: "walk__p walk__p--" + k, d: by[k].join(""), fill: "none" }));
  });
  built = true;
  g.style.display = "none";
}
/* ズームに応じて出し入れ（app.js の lod から呼ばれる）。z=拡大率 */
W.lod = function (z) {
  if (!built) build();
  if (!g) return;
  var on = z >= 7;
  if (on !== visible) { g.style.display = on ? "" : "none"; visible = on; }
};

/* ---------------------------------------------------------- スポットへ */
function genre() { return (RG.GENRES || []).filter(function (x) { return x.id === "indoor"; })[0]; }
W.apply = function () {
  if (applied || !data()) return; applied = true;
  var ge = genre();
  if (ge) { ge.enabled = true; ge.reason = ""; }
  if (!RG.MAPPOI) RG.MAPPOI = [];
  var src = data().source || {};
  data().pois.forEach(function (p, i) {
    var k = KIND[p.k] || KIND.facility;
    RG.MAPPOI.push({ i: "in" + i, n: p.n + (p.fl !== "" && p.fl != null ? "（" + p.fl + "階）" : ""),
                     la: p.la, lo: p.lo, g: "indoor", s: 3.0, ti: 2, t: k.label + (p.t ? " ・ " + p.t : ""),
                     be: k.e, indoor: 1,
                     srcNote: "出典: " + (src.name || "歩行空間ネットワークデータ") + "（" + (src.license || "") + "）" });
  });
  try {
    if (RG.Map && RG.Map.rebuildPOI) RG.Map.rebuildPOI();
    if (RG.resetSearchIndex) RG.resetSearchIndex();
    if (RG.rebuildRail) RG.rebuildRail();
    build();
  } catch (e) { if (window.console) console.warn("歩行空間データの反映でつまずきました", e); }
};

/* ---------------------------------------------------------- 駅カード */
W.decorateStation = function (root, id) {
  var host = root.querySelector('[data-walk-st="' + id + '"]');
  var s = RG.byId && RG.byId[id], D = data();
  if (!host || !s || !D) return;
  var c = D.center, R = 300;
  if (RG.hav([s.la, s.lo], [c.la, c.lo]) * 1000 > D.radius) { host.hidden = true; return; }
  var f = D.flags, n = { links: 0, step: 0, steep: 0, stairs: 0, elevator: 0, escalator: 0, indoor: 0 };
  D.links.forEach(function (L) {
    var p = L[0], mid = Math.floor(p.length / 4) * 2;
    if (RG.hav([s.la, s.lo], [p[mid], p[mid + 1]]) * 1000 > R) return;
    n.links++;
    if (L[1] & f.step) n.step++;
    if (L[1] & f.steep) n.steep++;
    if (L[1] & f.stairs) n.stairs++;
    if (L[1] & f.elevator) n.elevator++;
    if (L[1] & f.escalator) n.escalator++;
    if (L[1] & f.indoor) n.indoor++;
  });
  var pk = {};
  D.pois.forEach(function (p) { if (RG.hav([s.la, s.lo], [p.la, p.lo]) * 1000 <= R) pk[p.k] = (pk[p.k] || 0) + 1; });
  if (!n.links && !Object.keys(pk).length) { host.hidden = true; return; }
  host.hidden = false;
  function row(k, v, sub) {
    return '<div class="ex"><span class="ex__k">' + k + '</span><span class="ex__v">' + v + "</span>" +
      (sub ? '<span class="ex__s">' + esc(sub) + "</span>" : "") + "</div>";
  }
  host.innerHTML = '<div class="sec__h"><b>🚶 歩きやすさ・構内</b><em>駅から300m</em></div>' +
    '<div class="exgrid">' +
      row("歩ける道", n.links + " 本", "うち屋内 " + n.indoor + " 本") +
      row("段差・急な坂", (n.step + n.steep) + " か所", n.step + " 本に段差、" + n.steep + " 本が急な坂") +
      row("階段", n.stairs + " か所", (pk.elevator || n.elevator) ? "エレベーター " + (pk.elevator || n.elevator) + " 基が近くにあります" : "近くにエレベーターの登録がありません") +
      (pk.toilet ? row("トイレ", pk.toilet + " か所", "地図の 🚻 を押すと場所が出ます") : "") +
    "</div>" +
    '<div class="lnks"><button class="lnk" type="button" data-walk-map="1"><span>🗺️</span>地図で歩きやすさを見る</button></div>' +
    '<p class="mini">緑＝段差なし／黄＝段差・急な坂・狭い／赤＝階段／青＝エレベーター・エスカレーター。' +
    "出典: " + esc((D.source || {}).name || "歩行空間ネットワークデータ") + "。整備時点の情報で、工事などで変わることがあります。</p>";
  var b = host.querySelector("[data-walk-map]");
  if (b) b.addEventListener("click", function (e) {
    e.stopPropagation();
    if (RG.Card && RG.Card.close) RG.Card.close();
    if (RG.Map && RG.Map.gotoLatLng) RG.Map.gotoLatLng(s.la, s.lo, 120);
    if (RG.tripStatus) RG.tripStatus("歩ける道を色で表示しています（緑＝段差なし／黄＝注意／赤＝階段／青＝エレベーター等）。", "info", 6000);
  });
};

})(window.RG);
