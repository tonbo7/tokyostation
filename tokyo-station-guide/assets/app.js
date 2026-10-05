/* =========================================================================
   東京ステーションガイド v3 — 本体
   ・路線図は Wikidata の実座標を Web メルカトルで投影して描画
   ・726駅／899区間。路線を足す＝ data/network.js を作り直すだけ
   ========================================================================= */
(function (global) {
"use strict";

var RG = global.RG = global.RG || {};
RG.details = {};
RG.HUB = "中村橋";

RG.registerDetail = function (key, d) { RG.details[key] = d; };

/* ------------------------------------------------------------ utilities */
function $(s, r) { return (r || document).querySelector(s); }
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function el(tag, attrs, kids) {
  var ns = /^(svg|g|path|circle|text|rect|line|use|tspan|polyline)$/.test(tag);
  var n = ns ? document.createElementNS("http://www.w3.org/2000/svg", tag) : document.createElement(tag);
  for (var k in (attrs || {})) {
    if (k === "text") n.textContent = attrs[k];
    else if (k === "html") n.innerHTML = attrs[k];
    else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
  }
  (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
  return n;
}
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
  return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
function num(v) { return (v || 0).toLocaleString("ja-JP"); }
function isTouch() { return !window.matchMedia("(hover:hover)").matches; }
/* 画像はファイル名だけ持たせているので、ここで Commons の URL を組み立てる */
function cimg(f, w) {
  if (!f) return null;
  if (/^https?:/.test(f)) return f;
  return "https://commons.wikimedia.org/wiki/Special:FilePath/" + encodeURIComponent(f) + "?width=" + (w || 400);
}
function cpage(f) {
  if (!f) return null;
  if (/^https?:/.test(f)) return f;
  return "https://commons.wikimedia.org/wiki/File:" + encodeURIComponent(f);
}
RG.cimg = cimg; RG.cpage = cpage;
RG.$ = $; RG.el = el; RG.esc = esc; RG.num = num; RG.isTouch = isTouch;

/* ================================================================ 索引構築 */
var VB = { x: 0, y: 0, w: 2000, h: 1400 };
RG.VIEWBOX = VB;

function hav(a, b) {
  var R = 6371, r = Math.PI / 180;
  var dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r;
  var x = Math.sin(dLa / 2) * Math.sin(dLa / 2) +
          Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
  return 2 * R * Math.asin(Math.sqrt(x));
}
RG.hav = hav;

function buildIndex() {
  var N = RG.NET;
  RG.byId = {}; RG.byName = {}; RG.adj = {};
  N.stations.forEach(function (s, i) {
    s.rank = i;                                   // 乗降人員の降順（0 が最大）
    RG.byId[s.id] = s;
    (RG.byName[s.n] = RG.byName[s.n] || []).push(s);
    RG.adj[s.id] = [];
  });
  N.edges.forEach(function (e) {
    var a = RG.byId[e[0]], b = RG.byId[e[1]];
    if (!a || !b) return;
    var km = hav([a.la, a.lo], [b.la, b.lo]) * 1.08;
    RG.adj[a.id].push({ to: b.id, km: km, line: e[2] || "" });
    RG.adj[b.id].push({ to: a.id, km: km, line: e[2] || "" });
  });
  var lats = N.stations.map(function (s) { return s.la; });
  var lngs = N.stations.map(function (s) { return s.lo; });
  var b = { s: Math.min.apply(null, lats), n: Math.max.apply(null, lats),
            w: Math.min.apply(null, lngs), e: Math.max.apply(null, lngs) };
  // Web メルカトル投影（経度・緯度ともラジアン系に揃える）
  function my(lat) { return Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)); }
  function mx(lng) { return lng * Math.PI / 180; }
  var x0 = mx(b.w), x1 = mx(b.e), y0 = my(b.n), y1 = my(b.s);
  var pad = 60, W = VB.w - pad * 2, sc = W / (x1 - x0);
  VB.h = Math.round((y0 - y1) * sc + pad * 2);   // 北が上（y0 = 最北）
  N.stations.forEach(function (s) {
    s.x = pad + (mx(s.lo) - x0) * sc;
    s.y = pad + (y0 - my(s.la)) * sc;
  });
  RG.project = function (la, lo) {
    return { x: pad + (mx(lo) - x0) * sc, y: pad + (y0 - my(la)) * sc };
  };
  RG.lineColor = {};
  N.lines.forEach(function (l) {
    var m = RG.LINEMETA && RG.LINEMETA[l.name];
    RG.lineColor[l.name] = (m && m.c) || l.color;
  });
  buildSpecRanks(N);
  RG.paxRanked = N.stations.filter(function (s) { return s.px; });
  RG.lineRanked = N.stations.slice().sort(function (a, c) { return (c.ls || []).length - (a.ls || []).length; });
  RG.oldRanked = N.stations.filter(function (s) { return s.op; })
                  .sort(function (a, c) { return +a.op - +c.op; });
}

/* --------------------------------------------- スペックの相対順位（0-100） */
var SPEC = [
  { id: "px",   label: "1日平均乗降人員", emoji: "🧍", unit: "人",
    get: function (s) { return s.px || null; },
    hi: "人が多い", lo: "人が少ない" },
  { id: "ls",   label: "乗り入れ路線",   emoji: "🔀", unit: "路線",
    get: function (s) { return (s.ls || []).length || null; },
    hi: "乗換が多い", lo: "単独路線" },
  { id: "pf",   label: "ホーム",         emoji: "🛤️", unit: "本",
    get: function (s) { return s.pf || null; },
    hi: "大規模", lo: "小規模" },
  { id: "age",  label: "開業の古さ",     emoji: "🏛️", unit: "年開業",
    get: function (s) { return s.op ? -(+s.op) : null; },   // 古いほど大きい
    fmt: function (s) { return s.op; },
    hi: "歴史が長い", lo: "新しい駅" },
  { id: "near", label: "徒歩圏の他駅",   emoji: "🚶", unit: "駅",
    get: function (s) { return RG.nearbyStations(s, 1.0).length; },
    hi: "迂回しやすい", lo: "この駅だけ" }
];
RG.SPEC = SPEC;
function buildSpecRanks(N) {
  RG.specRank = {};
  SPEC.forEach(function (m) {
    var arr = [];
    N.stations.forEach(function (s) {
      var v = m.get(s);
      if (v != null) arr.push({ id: s.id, v: v });
    });
    arr.sort(function (a, b) { return a.v - b.v; });
    var n = arr.length, r = {};
    for (var i = 0; i < n; i++) {
      var j = i; while (j + 1 < n && arr[j + 1].v === arr[i].v) j++;
      var pct = n > 1 ? Math.round(i / (n - 1) * 100) : 50;
      for (var k = i; k <= j; k++) r[arr[k].id] = { pct: pct, v: arr[k].v, rank: n - i, n: n };
      i = j;
    }
    RG.specRank[m.id] = r;
  });
}

/* ------------------------------------------- 路線に沿った駅の並び（ランチャー用） */
function bearing(a, b) { return Math.atan2(b.lo - a.lo, b.la - a.la); }
function angDiff(x, y) { var d = Math.abs(x - y) % (2 * Math.PI); return d > Math.PI ? 2 * Math.PI - d : d; }

RG.lineSequence = function (fromId, line, limit) {
  limit = limit || 200;
  var from = RG.byId[fromId];
  var starts = RG.adj[fromId].filter(function (e) { return e.line === line; });
  var dirs = [];
  starts.forEach(function (st) {
    var seen = {}, cur = st.to, prev = fromId, list = [], km = 0, lastKm = st.km;
    var head = bearing(from, RG.byId[st.to]);
    seen[fromId] = 1;
    while (cur && !seen[cur] && list.length < limit) {
      seen[cur] = 1;
      var e0 = RG.adj[prev].filter(function (e) { return e.to === cur && e.line === line; })[0];
      km += e0 ? e0.km : 0;
      list.push({ id: cur, km: km,
                  min: Math.round(km / RG.CONFIG.modes.train.speedKmh * 60 + list.length * 0.4) });
      // 次の駅は「いまの進行方向にいちばん近い隣接」を選ぶ。
      // Wikidata の隣接データには誤りが混ざるため、急な折返しや飛びは切り捨てる。
      var here = RG.byId[cur];
      var cand = RG.adj[cur].filter(function (e) {
        if (e.line !== line || seen[e.to]) return false;
        if (e.km > Math.max(3.0, lastKm * 3.2)) return false;      // 距離の飛び
        return angDiff(bearing(here, RG.byId[e.to]), head) < 2.0;  // 逆走・直角の折返し
      });
      cand.sort(function (a, b) {
        return angDiff(bearing(here, RG.byId[a.to]), head) - angDiff(bearing(here, RG.byId[b.to]), head);
      });
      if (!cand.length) { cur = null; break; }
      head = bearing(here, RG.byId[cand[0].to]);
      lastKm = cand[0].km; prev = cur; cur = cand[0].to;
    }
    if (list.length) dirs.push({ list: list, endId: list[list.length - 1].id, kind: "seq" });
  });
  if (dirs.length) return dirs;

  // フォールバック：隣接データが無い路線（Wikidataで別名になっている等）は近い順に並べる
  var near = [];
  RG.NET.stations.forEach(function (t) {
    if (t.id === fromId) return;
    if ((t.ls || []).indexOf(line) < 0) return;
    near.push({ id: t.id, km: RG.hav([from.la, from.lo], [t.la, t.lo]) });
  });
  if (!near.length) return [];
  near.sort(function (a, b) { return a.km - b.km; });
  near = near.slice(0, 120).map(function (x, i) {
    return { id: x.id, km: x.km, min: Math.round(x.km / RG.CONFIG.modes.train.speedKmh * 60 + 2) };
  });
  return [{ list: near, endId: near[near.length - 1].id, kind: "near" }];
};

/* ================================================================ 路線図 */
var Map = (function () {
  var svg, gE, gN, node = {}, selected = null, vb, wrap, lodTimer = null;

  /* ===== 現在地マーカー ===== */
  var gMe = null;
  var ME_STYLES = {
    dot:   { e: "",   label: "🔵 青い丸（Google マップ風）", c: "#1A73E8" },
    pin:   { e: "📍", label: "📍 ピン",                     c: "#EA4335" },
    arrow: { e: "➤",  label: "➤ 矢印",                      c: "#1A73E8" },
    star:  { e: "⭐", label: "⭐ 星",                        c: "#E8A100" },
    home:  { e: "🏠", label: "🏠 家",                        c: "#197A4B" },
    foot:  { e: "👟", label: "👟 くつ",                      c: "#7B3FE4" },
    heart: { e: "💙", label: "💙 ハート",                    c: "#1A73E8" }
  };
  RG.ME_STYLES = ME_STYLES;
  function paintMe(coord, accM, label) {
    if (!gMe) { gMe = el("g", { class: "me" }); svg.appendChild(gMe); }
    if (!coord) { gMe.style.display = "none"; return; }
    var st = (RG.settings && RG.settings.meStyle) || "dot";
    var sty = ME_STYLES[st] || ME_STYLES.dot;
    var col = (RG.settings && RG.settings.meColor) || sty.c;
    var P = project(coord[0], coord[1]);
    // 精度の円（メートル→地図座標。緯度から換算）
    var km = (accM || 0) / 1000;
    var r2 = km ? Math.abs(project(coord[0] + km / 111.0, coord[1]).y - P.y) : 0;
    gMe.innerHTML = "";
    gMe.style.display = "";
    if (r2 > 0.4) gMe.appendChild(el("circle", { class: "me__acc", cx: P.x, cy: P.y, r: r2,
      style: "--mc:" + col }));
    gMe.appendChild(el("circle", { class: "me__pulse", cx: P.x, cy: P.y, style: "--mc:" + col }));
    if (sty.e) {
      gMe.appendChild(el("circle", { class: "me__bg", cx: P.x, cy: P.y, style: "--mc:" + col }));
      gMe.appendChild(el("text", { class: "me__e", x: P.x, y: P.y, "text-anchor": "middle",
        "dominant-baseline": "central", text: sty.e }));
    } else {
      gMe.appendChild(el("circle", { class: "me__ring", cx: P.x, cy: P.y, style: "--mc:" + col }));
      gMe.appendChild(el("circle", { class: "me__dot", cx: P.x, cy: P.y, style: "--mc:" + col }));
    }
    if (label !== false && !(RG.settings && RG.settings.meLabel === false))
      gMe.appendChild(el("text", { class: "me__l", x: P.x, y: P.y,
      "text-anchor": "middle", text: "現在地", style: "--mc:" + col }));
    RG.mePos = { x: P.x, y: P.y };
  }
  function drawBase() {
    if (RG.buildBasemap) RG.buildBasemap(svg, project);
  }
  function draw() {
    svg = $("#map");
    svg.setAttribute("viewBox", [VB.x, VB.y, VB.w, VB.h].join(" "));
    gE = el("g", { class: "edges" });
    gPOIHost = el("g", { class: "poihost" });     // スポットはここに（駅より背面）
    gN = el("g", { class: "nodes" });             // 駅はいちばん前
    svg.appendChild(gE); svg.appendChild(gPOIHost); svg.appendChild(gN);

    var byLine = {};
    RG.NET.edges.forEach(function (e) {
      var a = RG.byId[e[0]], b = RG.byId[e[1]]; if (!a || !b) return;
      var k = e[2] || "";
      (byLine[k] = byLine[k] || []).push("M" + a.x.toFixed(1) + " " + a.y.toFixed(1) +
                                        "L" + b.x.toFixed(1) + " " + b.y.toFixed(1));
    });
    var map = {};
    Object.keys(byLine).forEach(function (k) {
      var p = el("path", { class: "ln", d: byLine[k].join(""),
                           stroke: RG.lineColor[k] || "#9AA0A6", "stroke-width": 3.4,
                           fill: "none", "stroke-linecap": "round" });
      gE.appendChild(p); map[k] = [p];
    });
    edgeByLine = map;

    RG.NET.stations.forEach(function (s) {
      var big = s.rank < 40 || (s.ls || []).length >= 4;
      var g = el("g", { class: "node" + (big ? " big" : ""), "data-id": s.id,
                        tabindex: s.rank < 200 ? "0" : "-1", role: "button", "aria-label": s.n + "駅" });
      g.appendChild(el("circle", { class: "st-dot", cx: s.x, cy: s.y, r: big ? 6 : 3.6 }));
      g.appendChild(el("text", { class: "st-lbl", x: s.x, y: s.y - (big ? 9 : 6),
                                 "text-anchor": "middle", text: s.n }));
      g.appendChild(el("circle", { class: "st-hit", cx: s.x, cy: s.y, r: 11 }));
      gN.appendChild(g); node[s.id] = g;
      var open = function (ev) { ev.preventDefault(); Card.open(s.id, ev); };
      g.addEventListener("click", open);
      g.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") open(ev); });
      if (!isTouch()) {
        g.addEventListener("mouseenter", function (ev) { Card.hover(s.id, ev); });
        g.addEventListener("mouseleave", Card.unhover);
      }
    });
    if (node[RG.HUB]) node[RG.HUB].classList.add("hub");
  }

  function lod() {
    var z = VB.w / vb.w;
    var k = Math.round(Math.min(800, Math.max(22, 22 * z * z)));
    RG.NET.stations.forEach(function (s) { node[s.id].classList.toggle("lod", s.rank >= k); });
    svg.style.setProperty("--lblscale", (1 / Math.pow(z, 0.55)).toFixed(3));
    // 画面上で常に同じ大きさの当たり判定になるよう、地図座標へ換算する
    var upp = vb.w / Math.max(320, wrap.getBoundingClientRect().width);
    svg.style.setProperty("--hitr", (12 * upp).toFixed(2));
    svg.style.setProperty("--sthitr", (15 * upp).toFixed(2));
    var lv = $("#zlevel"); if (lv) lv.textContent = z < 1.6 ? "全体" : z < 5 ? "広域" : z < 14 ? "地区" : "詳細";
    poiLOD();
    if (RG.Walk && RG.Walk.lod) RG.Walk.lod(z);
  }
  function scheduleLod() { clearTimeout(lodTimer); lodTimer = setTimeout(lod, 90); }

  function initViewport() {
    wrap = $(".mapwrap"); vb = { x: VB.x, y: VB.y, w: VB.w, h: VB.h };
    apply(); lod();
    var drag = null, pinch = null;
    wrap.addEventListener("pointerdown", function (e) {
      if (e.target.closest(".node")) return;
      wrap.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y };
      wrap.classList.add("dragging");
    });
    wrap.addEventListener("pointermove", function (e) {
      if (!drag || pinch) return;
      var r = wrap.getBoundingClientRect(), k = vb.w / r.width;
      vb.x = drag.vx - (e.clientX - drag.x) * k;
      vb.y = drag.vy - (e.clientY - drag.y) * k; apply();
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (t) {
      wrap.addEventListener(t, function () { drag = null; wrap.classList.remove("dragging"); });
    });
    wrap.addEventListener("wheel", function (e) {
      e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY > 0 ? 1.16 : 1 / 1.16);
    }, { passive: false });
    wrap.addEventListener("touchstart", function (e) {
      if (e.touches.length === 2) { drag = null;
        pinch = { d: dist(e.touches), vb: { x: vb.x, y: vb.y, w: vb.w, h: vb.h }, c: mid(e.touches) }; }
    }, { passive: true });
    wrap.addEventListener("touchmove", function (e) {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      var k = pinch.d / dist(e.touches), r = wrap.getBoundingClientRect();
      var ar = pinch.vb.h / pinch.vb.w;
      var nw = clamp(pinch.vb.w * k, 90, VB.w * 1.6), nh = nw * ar;
      var fx = (pinch.c.x - r.left) / r.width, fy = (pinch.c.y - r.top) / r.height;
      vb.x = pinch.vb.x + (pinch.vb.w - nw) * fx;
      vb.y = pinch.vb.y + (pinch.vb.h - nh) * fy;
      vb.w = nw; vb.h = nh; apply();
    }, { passive: false });
    wrap.addEventListener("touchend", function (e) { if (e.touches.length < 2) pinch = null; }, { passive: true });
    window.addEventListener("resize", scheduleLod);
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dist(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }
  function mid(t) { return { x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 }; }
  function apply() {
    // 余白へ行き過ぎないように収める
    var mx2 = VB.w * 0.25, my2 = VB.h * 0.25;
    vb.x = Math.max(-mx2, Math.min(VB.w - vb.w + mx2, vb.x));
    vb.y = Math.max(-my2, Math.min(VB.h - vb.h + my2, vb.y));
    svg.setAttribute("viewBox", [vb.x, vb.y, vb.w, vb.h].join(" ")); scheduleLod();
  }
  function zoomAt(cx, cy, k) {
    var r = wrap.getBoundingClientRect();
    var nw = clamp(vb.w * k, 90, VB.w * 1.6), nh = nw * (vb.h / vb.w);
    var fx = (cx - r.left) / r.width, fy = (cy - r.top) / r.height;
    vb.x += (vb.w - nw) * fx; vb.y += (vb.h - nh) * fy; vb.w = nw; vb.h = nh; apply();
  }
  function zoom(k) { var r = wrap.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, k); }
  function fitAll() { vb = { x: VB.x, y: VB.y, w: VB.w, h: VB.h }; apply(); }
  function focus(id, w) {
    var s = RG.byId[id]; if (!s) return;
    var r = wrap.getBoundingClientRect();
    vb.w = w || 260; vb.h = vb.w * (r.height / r.width);
    vb.x = s.x - vb.w / 2; vb.y = s.y - vb.h / 2 - (isTouch() ? vb.h * 0.16 : 0);
    apply();
  }
  function screenPosXY(x, y) {
    var r = wrap.getBoundingClientRect();
    return { x: r.left + (x - vb.x) / vb.w * r.width, y: r.top + (y - vb.y) / vb.h * r.height };
  }
  function screenPos(id) {
    var s = RG.byId[id]; if (!s) return null;
    var r = wrap.getBoundingClientRect();
    return { x: r.left + (s.x - vb.x) / vb.w * r.width, y: r.top + (s.y - vb.y) / vb.h * r.height };
  }
  function select(id) {
    if (selected && node[selected]) node[selected].classList.remove("sel");
    selected = id; if (id && node[id]) node[id].classList.add("sel");
  }
  function paintIso(map) {
    RG.NET.stations.forEach(function (s) {
      var g = node[s.id];
      g.classList.remove("iso1", "iso2", "iso3", "iso4", "iso5");
      var m = map && map[s.id]; if (m == null) return;
      g.classList.add(m <= 15 ? "iso1" : m <= 30 ? "iso2" : m <= 45 ? "iso3" : m <= 70 ? "iso4" : "iso5");
    });
    svg.classList.toggle("isomode", !!map);
  }
  function paintPick(ids) {
    var set = {}; (ids || []).forEach(function (i) { set[i] = 1; });
    RG.NET.stations.forEach(function (s) { node[s.id].classList.toggle("pick", !!set[s.id]); });
    svg.classList.toggle("pickmode", !!(ids && ids.length));
  }
  var gLM = null, edgeByLine = {};
  function project(la, lo) { return RG.project(la, lo); }
  function gotoLatLng(la, lo, w) {
    var P = project(la, lo), r = wrap.getBoundingClientRect();
    vb.w = w || 300; vb.h = vb.w * (r.height / r.width);
    vb.x = P.x - vb.w / 2; vb.y = P.y - vb.h / 2;
    apply();
  }
  function fitLine(name) {
    var xs = [], ys = [];
    RG.NET.edges.forEach(function (e) {
      if (e[2] !== name) return;
      [e[0], e[1]].forEach(function (i) {
        var t = RG.byId[i]; if (t) { xs.push(t.x); ys.push(t.y); }
      });
    });
    if (!xs.length) {
      RG.NET.stations.forEach(function (t) {
        if ((t.ls || []).indexOf(name) >= 0) { xs.push(t.x); ys.push(t.y); }
      });
    }
    if (xs.length < 2) return;
    var r = wrap.getBoundingClientRect(), ar = r.height / r.width;
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    var w = Math.max((x1 - x0) * 1.28, (y1 - y0) * 1.28 / ar, 140);
    vb.w = w; vb.h = w * ar; vb.x = cx - w / 2; vb.y = cy - vb.h / 2;
    apply();
  }
  function highlightLine(name) {
    svg.classList.toggle("linemode", !!name);
    if (name) fitLine(name);
    Object.keys(edgeByLine).forEach(function (k) {
      edgeByLine[k].forEach(function (p) { p.classList.toggle("on", k === name); });
    });
    if (!name) { RG.NET.stations.forEach(function (s) { node[s.id].classList.remove("online"); }); return; }
    var on = {};
    RG.NET.edges.forEach(function (e) { if (e[2] === name) { on[e[0]] = 1; on[e[1]] = 1; } });
    RG.NET.stations.forEach(function (s) { node[s.id].classList.toggle("online", !!on[s.id]); });
  }
  function paintWatch(ids) {
    var set = {}; (ids || []).forEach(function (i) { set[i] = 1; });
    RG.NET.stations.forEach(function (s) { node[s.id].classList.toggle("watch", !!set[s.id]); });
  }
  /* ===== スポットPOIレイヤー =====
     8,000件を超えるので、DOM は「いま画面に出す分」だけを作って使い回す（プール方式）。
     全件ぶんの <g> を最初から作ると起動も操作も重くなるため。 */
  var gPOI = null, gPOIHost = null, poiOn = null, poiScale = 1;
  var pool = [], POOL_MAX = 420, poiReady = false;

  function rebuildPOI() {
    poiReady = false;
    if (gPOI && gPOI.parentNode) gPOI.parentNode.removeChild(gPOI);
    gPOI = null; pool = []; GMAP = null;
    buildPOI(); poiLOD();
  }
  function buildPOI() {
    if (poiReady) return;
    gPOI = el("g", { class: "pois" });
    (gPOIHost || svg).appendChild(gPOI);
    // 自分で追加したスポット・東京都オープンデータを取り込んだあとに座標を計算する
    (RG.MAPPOI || []).forEach(function (p) {
      var P = project(p.la, p.lo); p.x = P.x; p.y = P.y;
    });
    poiReady = true;
  }
  function makeNode() {
    var n = el("g", { class: "poi", tabindex: "-1", role: "button" });
    n.appendChild(el("circle", { class: "poi__c", r: 5 }));
    n.appendChild(el("text", { class: "poi__e", "text-anchor": "middle" }));
    n.appendChild(el("circle", { class: "poi__hit", r: 10 }));
    n.addEventListener("click", function (ev) { ev.stopPropagation(); if (n.__p) RG.showSpot(n.__p); });
    n.addEventListener("mouseenter", function () { if (n.__p) RG.spotTip(n.__p, { x: n.__p.x, y: n.__p.y }); });
    n.addEventListener("mouseleave", function () { RG.spotTip(null); });
    n.addEventListener("keydown", function (ev) { if (ev.key === "Enter" && n.__p) RG.showSpot(n.__p); });
    gPOI.appendChild(n); pool.push(n);
    return n;
  }
  var GMAP = null;
  function genreOf(id) {
    if (!GMAP) { GMAP = {}; (RG.GENRES || []).forEach(function (g) { GMAP[g.id] = g; }); }
    return GMAP[id] || { e: "📍", c: "#888" };
  }
  var OPTIN = null;
  function optInSet() {
    if (!OPTIN) {
      OPTIN = {};
      (RG.GENRES || []).forEach(function (g) { if (g.optIn) OPTIN[g.id] = 1; });
    }
    return OPTIN;
  }
  function poiLOD() {
    if (!poiReady) return;
    var z = VB.w / vb.w;
    // ズームが浅いうちは注目度の高いものだけ、拡大するほど細かいスポットまで出す
    var maxTier = z < 2.6 ? 0 : z < 6 ? 1 : 2;
    var minStar = z < 2.6 ? 4.0 : z < 6 ? 3.0 : 0;
    var picked = poiOn && poiOn.length;
    var hideVisited = RG.settings && RG.settings.hideVisited;
    var pad = vb.w * 0.06, cand = [];
    var list = RG.MAPPOI || [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (p.ti > maxTier || p.s < minStar) continue;
      if (picked && poiOn.indexOf(p.g) < 0) continue;
      // 数が多すぎるジャンル（AED・避難場所・公園）は、選んだときだけ出す
      if (!picked && optInSet()[p.g]) continue;
      if (p.chain && RG.chainOn && RG.chainOn.length && RG.chainOn.indexOf(p.brand) < 0) continue;
      if (hideVisited && RG.visitCount && RG.visitCount(p.n) > 0) continue;
      if (p.x < vb.x - pad || p.x > vb.x + vb.w + pad ||
          p.y < vb.y - pad || p.y > vb.y + vb.h + pad) continue;
      cand.push(p);
      if (cand.length > 4000) break;         // 画面内が多すぎる時の保険
    }
    cand.sort(function (a, b) { return a.ti - b.ti || b.s - a.s || (b.sl || 0) - (a.sl || 0); });
    // 画面上のマス目に1件だけ残して重なりを防ぐ
    var wpx = Math.max(320, wrap.getBoundingClientRect().width);
    // 拡大するほどアイコンは小さく（画面が埋まらないように・描画も軽くなる）
    var shrink = z >= 12 ? 0.72 : z >= 6 ? 0.86 : 1;
    var eff = poiScale * shrink;
    var cell = (22 * eff) * (vb.w / wpx);
    var used = {}, show = [];
    for (var k = 0; k < cand.length && show.length < POOL_MAX; k++) {
      var q = cand[k];
      var key = Math.round(q.x / cell) + "," + Math.round(q.y / cell);
      if (used[key]) continue;
      used[key] = 1; show.push(q);
    }
    while (pool.length < show.length) makeNode();
    for (var j = 0; j < pool.length; j++) {
      var n = pool[j];
      if (j >= show.length) { n.style.display = "none"; n.__p = null; continue; }
      var t = show[j], g = genreOf(t.g);
      if (t.bc) g = { e: t.be || g.e, c: t.bc };
      n.__p = t; n.style.display = "";
      n.setAttribute("class", "poi poi--t" + t.ti + " poi--" + t.g +
        (RG.visitCount && RG.visitCount(t.n) > 0 ? " visited" : ""));
      n.setAttribute("aria-label", t.n);
      n.setAttribute("tabindex", t.ti === 0 ? "0" : "-1");
      var c0 = n.childNodes[0], e0 = n.childNodes[1], h0 = n.childNodes[2];
      c0.setAttribute("cx", t.x); c0.setAttribute("cy", t.y); c0.setAttribute("style", "--pc:" + g.c);
      e0.setAttribute("x", t.x); e0.setAttribute("y", t.y + 2.4); e0.textContent = g.e;
      h0.setAttribute("cx", t.x); h0.setAttribute("cy", t.y);
    }
    svg.style.setProperty("--poiscale", eff);
    svg.classList.toggle("poipick", !!picked);
    var cnt = $("#poicount");
    if (cnt) cnt.textContent = show.length + " / " + list.length;
  }
  function setGenres(list) { poiOn = list; poiLOD(); }
  function setPoiScale(v) { poiScale = v; poiLOD(); }

  var lmNode = {};
  function buildLandmarks() {
    if (gLM) return;
    gLM = el("g", { class: "lms" }); (gPOIHost || svg).appendChild(gLM);
    (RG.allLandmarks ? RG.allLandmarks() : []).forEach(function (L) {
      var P = project(L.la, L.lo);
      var g = el("g", { class: "lm lm--" + (L.c || "own"), tabindex: "-1",
                        role: "button", "aria-label": L.n, "data-lm": L.id });
      g.appendChild(el("circle", { class: "lm__c", cx: P.x, cy: P.y, r: 7 }));
      g.appendChild(el("text", { class: "lm__e", x: P.x, y: P.y + 3.2, "text-anchor": "middle", text: L.e }));
      g.appendChild(el("circle", { class: "lm__hit", cx: P.x, cy: P.y, r: 12 }));
      var open = function (ev) { ev && ev.stopPropagation(); RG.showLandmark(L); };
      g.addEventListener("click", open);
      g.addEventListener("mouseenter", function () { RG.spotTip(L, project(L.la, L.lo), true); });
      g.addEventListener("mouseleave", function () { RG.spotTip(null); });
      g.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") open(e); });
      gLM.appendChild(g); lmNode[L.id] = g;
    });
  }
  function paintLandmarks(visibleIds, scale) {
    buildLandmarks();
    var set = null;
    if (visibleIds) { set = {}; visibleIds.forEach(function (i) { set[i] = 1; }); }
    Object.keys(lmNode).forEach(function (k) {
      lmNode[k].style.display = (!set || set[k]) ? "" : "none";
      lmNode[k].setAttribute("tabindex", (!set || set[k]) ? "0" : "-1");
    });
    svg.style.setProperty("--lmscale", scale == null ? 1 : scale);
  }
  function paintFilter(ids) {
    if (!ids) { RG.NET.stations.forEach(function (s) { node[s.id].classList.remove("dim", "hit"); }); return; }
    var set = {}; ids.forEach(function (i) { set[i] = 1; });
    RG.NET.stations.forEach(function (s) {
      node[s.id].classList.toggle("hit", !!set[s.id]);
      node[s.id].classList.toggle("dim", !set[s.id]);
    });
  }
  return { draw: draw, initViewport: initViewport, zoom: zoom, fitAll: fitAll, focus: focus,
           select: select, screenPos: screenPos, screenPosXY: screenPosXY, paintIso: paintIso, paintPick: paintPick,
           paintFilter: paintFilter, lod: lod, highlightLine: highlightLine, fitLine: fitLine,
           drawBase: drawBase, project: project,
           gotoLatLng: gotoLatLng,
           paintWatch: paintWatch, paintLandmarks: paintLandmarks, buildLandmarks: buildLandmarks,
           paintMe: paintMe,
           buildPOI: buildPOI, rebuildPOI: rebuildPOI, setGenres: setGenres, setPoiScale: setPoiScale, poiLOD: poiLOD,
           registerEdgePaths: function (m) { edgeByLine = m; } };
})();
RG.Map = Map;

/* ================================================== エグゼクティブサマリ */
function nearbyStations(s, km) {
  var out = [];
  RG.NET.stations.forEach(function (t) {
    if (t.id === s.id || t.n === s.n) return;
    var d = hav([s.la, s.lo], [t.la, t.lo]);
    if (d <= km) out.push({ s: t, km: d });
  });
  out.sort(function (a, b) { return a.km - b.km; });
  return out;
}
function execSummary(s) {
  var out = [];
  if (s.px) {
    var r = RG.paxRanked.indexOf(s) + 1;
    out.push({ k: "1日平均乗降人員", v: num(s.px) + " 人",
      sub: "登録のある " + RG.paxRanked.length + " 駅中 " + r + " 位" +
           (s.pxOps ? "／" + s.pxOps + "事業者の合計" : "") + (s.py ? "（" + s.py + "年）" : ""),
      tone: r <= 20 ? "hot" : "" });
  }
  var nl = (s.ls || []).length;
  if (nl) out.push({ k: "乗り入れ路線", v: nl + " 路線",
    sub: nl >= 5 ? "乗り換えの要" : nl === 1 ? "単独路線の駅" : "", tone: nl >= 5 ? "hot" : "" });
  if (s.pf) out.push({ k: "ホーム", v: s.pf + " 本", sub: s.pf >= 10 ? "大規模駅" : "" });
  if (s.op) {
    var age = new Date().getFullYear() - (+s.op);
    out.push({ k: "開業", v: s.op + " 年",
               sub: age + " 年の歴史／古い順 " + (RG.oldRanked.indexOf(s) + 1) + " 位" });
  }
  var near = nearbyStations(s, 1.0);
  out.push({ k: "徒歩圏の他駅", v: near.length + " 駅",
    sub: near.length ? near.slice(0, 4).map(function (x) {
      return x.s.n + "(" + Math.round(x.km * 1000) + "m)"; }).join("・") : "半径1kmに他の駅なし",
    tone: near.length >= 4 ? "hot" : "" });
  return out;
}
function headline(s) {
  var bits = [];
  if (s.px) {
    var r = RG.paxRanked.indexOf(s) + 1;
    if (r <= 10) bits.push("この範囲で" + r + "番目に人が多い巨大ターミナル");
    else if (r <= 50) bits.push("乗降 " + num(s.px) + " 人規模の主要駅");
    else if (r > RG.paxRanked.length * 0.75) bits.push("人の少ない静かな駅");
  }
  var nl = (s.ls || []).length;
  if (nl >= 6) bits.push(nl + "路線が集まる結節点");
  else if (nl === 1) bits.push("1路線だけの単独駅");
  if (s.op && +s.op < 1900) bits.push("明治開業の古い駅");
  var near = nearbyStations(s, 0.7);
  if (near.length >= 3) bits.push("徒歩数分に別の駅が" + near.length + "つあり、迂回ルートを作りやすい");
  if (!bits.length) bits.push("データ登録が少ない駅。歩いて調べる価値あり");
  return bits.join("。") + "。";
}
RG.execSummary = execSummary; RG.nearbyStations = nearbyStations; RG.headline = headline;

/* ============================================== 駅カード */
var Card = (function () {
  var hover, sheet, scrim, timer = null, cur = null, tab = "food", pinned = false;

  function loadDetail(key, cb) {
    var d = RG.details[key];
    if (d !== undefined && d !== "loading") { cb(d === "none" ? null : d); return; }
    if (d === "loading") { var t = setInterval(function () {
      if (RG.details[key] !== "loading") { clearInterval(t); cb(RG.details[key] === "none" ? null : RG.details[key]); }
    }, 40); return; }
    RG.details[key] = "loading";
    var sc = document.createElement("script");
    sc.src = "data/details/" + encodeURIComponent(key) + ".js";
    sc.onload = sc.onerror = function () {
      if (RG.details[key] === "loading") RG.details[key] = "none";
      cb(RG.details[key] === "none" ? null : RG.details[key]);
    };
    document.head.appendChild(sc);
  }

  function plate(s) {
    // この駅を実際に通っている路線（隣接データにある路線）を先に、その他をあとに
    var onNet = {}, ord = [];
    RG.adj[s.id].forEach(function (e) { if (e.line && !onNet[e.line]) { onNet[e.line] = 1; ord.push(e.line); } });
    (s.ls || []).forEach(function (L) { if (!onNet[L]) ord.push(L); });
    var ls = ord.map(function (L) {
      return '<button class="lchip lchip--go" type="button" data-launch="' + esc(L) + '" ' +
        'aria-expanded="false" style="background:' + (RG.lineColor[L] || "#9AA0A6") + '">' +
        (RG.lineBadge ? RG.lineBadge(L) : "") + esc(L) + '<i class="lchip__x">▾</i></button>';
    }).join("");
    var seen = {}, hops = [];
    RG.adj[s.id].forEach(function (e) {
      if (seen[e.to]) return; seen[e.to] = 1;
      var t = RG.byId[e.to]; if (!t) return;
      hops.push('<button class="hop" type="button" data-hop="' + esc(e.to) + '">' +
        '<i style="background:' + (RG.lineColor[e.line] || "#9AA0A6") + '"></i>' + esc(t.n) + "</button>");
    });
    return '<div class="plate">' +
      '<div class="plate__top"><span class="plate__tag">' + esc((s.ls || [])[0] || "鉄道駅") + "</span>" +
      '<button class="star' + (RG.isWatched && RG.isWatched(s.id) ? " on" : "") + '" type="button" ' +
      'data-watch="' + esc(s.id) + '" aria-label="注視駅にする">' +
      (RG.isWatched && RG.isWatched(s.id) ? "⭐" : "☆") + "</button>" +
      '<button class="plate__close" aria-label="閉じる" data-close>×</button></div>' +
      '<div class="plate__name">' + esc(s.n) + "</div>" +
      (s.k ? '<div class="plate__kana">' + esc(s.k) + "</div>" : "") +
      '<div class="lchips">' + ls + '</div><div class="launcher" hidden></div>' +
      wikiIntro(s.n) +
      '<p class="plate__hl">' + esc(headline(s)) + "</p>" +
      (hops.length ? '<div class="hops"><span class="hops__l">となりの駅</span>' + hops.join("") + "</div>" : "") +
      '<div class="live" data-live-st="' + esc(s.id) + '" hidden></div>' +
      '<div class="acts">' +
        '<button class="act act--from" type="button" data-from="' + esc(s.id) + '">📍 ここから出発</button>' +
        '<button class="act act--to" type="button" data-to="' + esc(s.id) + '">🧭 ここへ行く</button>' +
      "</div></div>";
  }

  function lv(p) { return p >= 80 ? 5 : p >= 60 ? 4 : p >= 40 ? 3 : p >= 20 ? 2 : 1; }
  var LVTXT = ["", "とても低い", "低い", "ふつう", "高い", "とても高い"];
  /* Wikipedia / Wikidata から取った概要（出典表示つき） */
  function wikiIntro(name) {
    var d = RG.DESCS && RG.DESCS[name];
    if (!d) return "";
    var url = "https://ja.wikipedia.org/wiki/" + encodeURIComponent(d.t || name);
    return '<div class="wk">' +
      (d.d ? '<div class="wk__d">' + esc(d.d) + "</div>" : "") +
      (d.x ? '<p class="wk__x">' + esc(d.x) + "</p>" : "") +
      '<p class="wk__s">出典: <a href="' + url + '" target="_blank" rel="noopener">Wikipedia 日本語版</a>' +
      "（CC BY-SA 4.0）／一行説明は Wikidata（CC0）</p></div>";
  }
  RG.wikiIntro = wikiIntro;

  /* 浸水想定と地価（東京都オープンデータ） */
  function riskRow(st) {
    var out = "";
    var f = RG.FLOOD && RG.FLOOD.st && RG.FLOOD.st[st.id];
    if (f) {
      var lv = f >= 3 ? "深い" : f >= 1 ? "ふつう" : "浅い";
      out += '<div class="risk risk--f"><span class="risk__e">🌊</span>' +
        '<span class="risk__k">大雨のときの想定浸水深</span>' +
        '<span class="risk__v">' + f + '<i>m</i></span>' +
        '<span class="risk__t">' + lv + "・駅のまわり約100mの最大値。避難場所の確認を</span></div>";
    }
    var L = RG.OD2 && RG.OD2.landSta && RG.OD2.landSta[st.n];
    if (L) {
      out += '<div class="risk risk--l"><span class="risk__e">💰</span>' +
        '<span class="risk__k">この駅が最寄りの地価（令和8年公示）</span>' +
        '<span class="risk__v">' + num(L.m) + '<i>円/m²</i></span>' +
        '<span class="risk__t">標準地 ' + L.n + "地点の中央値</span></div>";
    }
    if (!out) return "";
    return '<div class="risks">' + out +
      '<p class="mini">出典: 東京都建設局「浸水予想区域図」／東京都財務局「地価公示」（CC BY 4.0）。' +
      "浸水は神田川・隅田川・石神井川の3流域のみのデータです。区域図が無い場所は「浸水しない」ではありません。</p></div>";
  }

  function summary(s) {
    var rows = RG.SPEC.map(function (m) {
      var r = RG.specRank[m.id][s.id];
      if (!r) return '<div class="sp sp--na"><span class="sp__e">' + m.emoji + '</span>' +
        '<span class="sp__k">' + esc(m.label) + '</span>' +
        '<span class="sp__v">—</span><span class="sp__t">データなし</span></div>';
      var p = r.pct, L = lv(p);
      var val = m.id === "age" ? s.op : (m.id === "px" ? num(r.v) : r.v);
      return '<div class="sp sp--l' + L + '"><span class="sp__e">' + m.emoji + "</span>" +
        '<span class="sp__k">' + esc(m.label) + "</span>" +
        '<span class="sp__v">' + esc(String(val)) + '<i>' + esc(m.unit) + "</i></span>" +
        '<span class="sp__g"><i style="width:' + Math.max(3, p) + '%"></i></span>' +
        '<span class="sp__t">' + LVTXT[L] + " ・ 上位" + (100 - p) + "%（" + r.rank + "/" + r.n + "位）</span>" +
        '<span class="sp__c">' + esc(p >= 60 ? m.hi : p <= 40 ? m.lo : "") + "</span></div>";
    }).join("");
    return '<div class="sec"><div class="sec__h"><b>駅のスペック</b>' +
      '<em>色は669駅中の相対評価</em></div><div class="spgrid">' + rows + "</div>" + riskRow(s) +
      '<div class="splegend">' + [1,2,3,4,5].map(function (i) {
        return '<span class="spl spl--l' + i + '">' + LVTXT[i] + "</span>"; }).join("") +
      "</div>" +
      '<p class="mini">出典: Wikidata (CC0)。乗降人員は「登録のある事業者ぶんの合計」であり、その駅の総数とは限りません。</p></div>';
  }

  var ICON = { stair: "🪜", elevator: "🛗", escalator: "🛗", gate: "🚪", toilet: "🚻", transfer: "🔀" };
  function boarding(s, d) {
    if (!d || !d.boarding || !d.boarding.length) {
      return '<div class="sec"><div class="sec__h"><b>駅構内 — 何号車に乗ればいいか</b></div>' +
        '<div class="todo">この駅は未調査です。ホームで階段・エレベーターの位置を見て ' +
        "<code>data/details/" + esc(s.n) + ".js</code> を作ると、ここに号車ゲージが出ます。</div></div>";
    }
    var cars = d.cars || 10, marks = {};
    d.boarding.forEach(function (b) { (marks[b.car] = marks[b.car] || []).push(ICON[b.type] || "•"); });
    var cells = "";
    for (var i = 1; i <= cars; i++)
      cells += '<div class="car' + (marks[i] ? " hot" : " dimc") + '"><b>' + i + "</b>" +
               '<div class="marks">' + (marks[i] || []).join("") + "</div></div>";
    return '<div class="sec"><div class="sec__h"><b>駅構内 — 何号車に乗ればいいか</b><em>' + cars +
      '両編成</em></div><div class="train">' + cells + "</div>" +
      '<div class="traindir"><span>← ' + esc(d.dirLeft || "") + "</span><span>" +
      esc(d.dirRight || "") + " →</span></div>" +
      '<ul class="exitlist">' + d.boarding.map(function (b) {
        return '<li><span class="pin">' + b.car + "号車</span><span>" + (ICON[b.type] || "") + " " +
          esc(b.label) + (b.pos ? '<span style="color:var(--label)">（' + esc(b.pos) + "寄り）</span>" : "") +
          "</span></li>"; }).join("") + "</ul></div>";
  }

  function congestion(s, d) {
    function bar(lv) { var h = ""; for (var i = 1; i <= 4; i++) h += '<i class="' + (i <= lv ? "lv" + lv : "") + '" style="width:25%"></i>'; return h; }
    if (d && d.congestion) {
      var rows = Object.keys(d.congestion).map(function (k) {
        var lv = d.congestion[k];
        return '<div class="cong__row"><span class="cong__lb">' + esc(k) + '</span><span class="cong__bar">' +
          bar(lv) + '</span><span class="cong__v">' + "●".repeat(lv) + "○".repeat(4 - lv) + "</span></div>";
      }).join("");
      return '<div class="sec"><div class="sec__h"><b>混雑のめやす</b><em>' +
        esc(d.congestionSource || "出典未記入") + '</em></div><div class="cong">' + rows + "</div></div>";
    }
    if (!s.px) return "";
    var ratio = s.px / RG.paxRanked[0].px;
    var lv = ratio > .35 ? 4 : ratio > .12 ? 3 : ratio > .04 ? 2 : 1;
    return '<div class="sec"><div class="sec__h"><b>混雑のめやす（推定）</b><em>乗降人員からの推定</em></div>' +
      '<div class="cong"><div class="cong__row"><span class="cong__lb">駅全体の規模</span>' +
      '<span class="cong__bar">' + bar(lv) + '</span><span class="cong__v">' +
      "●".repeat(lv) + "○".repeat(4 - lv) + "</span></div></div>" +
      '<p class="mini">⚠ 時間帯別の実測ではありません。ホームで数えた値を <code>congestion</code> に入れると置き換わります。</p></div>';
  }

  function town(s, d) {
    if (!d || !d.town) {
      var near = nearbyStations(s, 1.2).slice(0, 5);
      return '<div class="sec"><div class="sec__h"><b>駅の外 — 街のサマリ</b></div>' +
        '<div class="todo"><b>未調査の駅です</b>改札を出て見たものを <code>data/details/' + esc(s.n) +
        ".js</code> に書くと、ここに出ます。" +
        (near.length ? "<br>徒歩圏の他の駅：" + near.map(function (x) {
          return esc(x.s.n) + "(" + Math.round(x.km * 1000) + "m)"; }).join("・") : "") + "</div></div>";
    }
    var t = d.town, tabs = [
      { id: "food", label: "🍜 食べる", items: t.food || [] },
      { id: "spot", label: "⛩️ 見る・歴史", items: t.spots || [] },
      { id: "view", label: "🌇 景色", items: t.views || [] }];
    var head = tabs.map(function (x) {
      return '<button class="tab" role="tab" data-tab="' + x.id + '" aria-selected="' + (x.id === tab) +
        '">' + x.label + ' <span style="color:var(--label)">' + x.items.length + "</span></button>"; }).join("");
    var cu = tabs.filter(function (x) { return x.id === tab; })[0] || tabs[0];
    var body = cu.items.length
      ? '<ul class="poi">' + cu.items.map(function (p) {
          return '<li><span class="em">' + esc(p.emoji || "📍") + '</span><span><span class="nm">' +
            esc(p.name) + "</span>" + (p.genre ? ' <span class="gn">' + esc(p.genre) + "</span>" : "") +
            (p.note ? '<span class="ds">' + esc(p.note) + "</span>" : "") + "</span></li>"; }).join("") + "</ul>"
      : '<div class="todo">この分類はまだ未調査です。</div>';
    return '<div class="tabs" role="tablist">' + head + '</div><div class="town">' +
      (t.heroCss ? '<div class="town__hero" style="' + esc(t.heroCss) + '">' + esc(t.heroCaption || "") + "</div>" : "") +
      (t.headline ? '<p class="town__lead"><b>' + esc(t.headline) + "</b><br>" + esc(t.lead || "") + "</p>" : "") +
      body + "</div>";
  }

  function sources(s, d) {
    var a = ["駅スペック・スポット: Wikidata (CC0 1.0)。誰でも編集できるデータのため要検証",
             "公示地価: 国土数値情報「地価公示」(国土交通省) L01-26 東京都・2026年",
             "画像: Wikimedia Commons。ライセンスは画像ごとに異なります（各画像に表示）",
             "鉄道会社のロゴ・キャラクター等は著作権・商標のため掲載していません"];
    if (d) {
      if (d.surveyedAt) a.push("現地調査: " + esc(d.surveyedAt) + (d.surveyor ? " / " + esc(d.surveyor) : ""));
      (d.sources || []).forEach(function (x) { a.push("出典: " + esc(x)); });
      if (d.status === "sample") a.push("※乗車位置・混雑はサンプル値です。実地調査で置き換えてください。");
    }
    return '<div class="src">' + a.join("<br>") + "</div>";
  }


  /* ---------------- ヒーロー画像（Wikimedia Commons） ---------------- */
  function hero(st) {
    var p = RG.POI && RG.POI[st.id];
    if (!p || !p.img) return "";
    var credit = [p.lic || "ライセンスは画像ページ参照", p.by].filter(Boolean).join(" / ");
    return '<figure class="hero"><img src="' + esc(cimg(p.img, 640)) + '" alt="' + esc(st.n) + '駅の写真" ' +
      'loading="lazy" decoding="async">' +
      '<figcaption>📷 <a href="' + esc(cpage(p.img) || "#") + '" target="_blank" rel="noopener">Wikimedia Commons</a>' +
      " — " + esc(credit) + "</figcaption></figure>";
  }

  /* ---------------- 総合スコア＋レーダー ---------------- */
  function scoreBlock(st) {
    if (!RG.Score || !RG.SCORE) return "";
    var d = RG.Score.of(st.id);
    var bars = d.axes.map(function (a) {
      return '<div class="ax"><span class="ax__e">' + a.emoji + "</span>" +
        '<span class="ax__l">' + esc(a.label) + "</span>" +
        '<span class="ax__b"><i style="width:' + a.score + "%;background:" + a.color + '"></i></span>' +
        '<span class="ax__v">' + a.score + "</span>" +
        '<span class="ax__r">' + esc(RG.Score.rawText(a)) + "</span></div>";
    }).join("");
    var off = RG.SCORE.axes.filter(function (a) { return !a.enabled; });
    var offHtml = off.length ? '<details class="axoff"><summary>未実装の評価軸 ' + off.length +
      "件（設計上いつでも追加できます）</summary><ul>" + off.map(function (a) {
        return "<li>" + a.emoji + " <b>" + esc(a.label) + "</b> — " + esc(a.desc) +
               '<br><span class="why">' + esc(a.reason || "") + "</span></li>"; }).join("") +
      "</ul></details>" : "";
    return '<div class="sec sec--score"><div class="sec__h"><b>この駅の戦闘力</b>' +
      '<em><button class="rankbtn" type="button" data-rank="' + esc(st.id) + '">23区' + d.n +
      "駅中 <b>" + d.rank + "</b> 位 ▸ 全順位</button></em></div>" +
      '<div class="scorewrap">' + RG.Score.radar(st.id) + '<div class="axes">' + bars + "</div></div>" +
      '<p class="mini">各軸は' + esc(RG.SCORE.radiusLabel) + "の実データを、23区全駅の中でのパーセンタイル順位（0〜100）に直したものです。" +
      "絶対値ではなく<b>相対評価</b>なので「東京の中でどのくらいか」を表します。</p>" + offHtml + "</div>";
  }

  /* ---------------- 歴史・文化（更新頻度が低い情報＝下段） ---------------- */
  var CATLABEL = { heritage: "文化財・史跡", worship: "社寺仏閣", civic: "公共・文化施設" };
  function heritageBlock(st) {
    var p = RG.POI && RG.POI[st.id];
    if (!p) return "";
    var head = '<div class="sec__h"><b>歴史と街の資産</b><em>' + esc(RG.SCORE.radiusLabel) + "</em></div>" +
      '<div class="cntrow">' +
        cnt("🏛️", "文化財・史跡", p.hr, p.hw ? "重み " + p.hw + " 点" : "") +
        cnt("⛩️", "社寺仏閣", p.wo, "") +
        cnt("🌳", "公共・文化", p.cv, "") +
        cnt("💰", "公示地価", p.lp ? Math.round(p.lp / 10000) : null, p.lp ? "万円/m²・" + p.lpn + "地点" : "地点なし") +
      "</div>";
    var grid = (p.spots || []).length ? '<div class="spots">' + p.spots.map(function (x) {
      var q = encodeURIComponent(x.n);
      return '<a class="spot" href="https://ja.wikipedia.org/wiki/' + q + '" target="_blank" rel="noopener">' +
        (x.img ? '<img src="' + esc(cimg(x.img, 320)) + '" alt="' + esc(x.n) + '" loading="lazy" decoding="async">'
               : '<span class="spot__ph">' + (x.cat === "worship" ? "⛩️" : x.cat === "heritage" ? "🏛️" : "🌳") + "</span>") +
        '<span class="spot__n">' + esc(x.n) + "</span>" +
        '<span class="spot__t">' + esc(x.tag) + " ・ " + x.d + "m</span>" +
        (x.lic ? '<span class="spot__c">📷 ' + esc(x.lic) + "</span>" : "") + "</a>";
    }).join("") + "</div>" : '<div class="todo">この駅の徒歩10分圏には、Wikidataに登録された文化財・社寺の記録がありません。' +
      "歩いて見つけたものを追記すると、あなたが最初の記録者になります。</div>";
    return '<div class="sec">' + head + grid + "</div>";
    function cnt(e, l, v, sub) {
      return '<div class="cnt"><span class="cnt__e">' + e + '</span><span class="cnt__v">' +
        (v == null ? "—" : v) + '</span><span class="cnt__l">' + esc(l) + "</span>" +
        (sub ? '<span class="cnt__s">' + esc(sub) + "</span>" : "") + "</div>";
    }
  }

  /* ---------------- 動画（IDが登録されているときだけサムネ表示） ---------------- */
  function videoBlock(st, d) {
    var vids = (d && d.videos) || [];
    var q = encodeURIComponent(st.n + "駅");
    var body = vids.length
      ? '<div class="vids">' + vids.slice(0, 3).map(function (v) {
          return '<a class="vid" href="https://www.youtube.com/watch?v=' + esc(v.id) + '" target="_blank" rel="noopener">' +
            '<img src="https://i.ytimg.com/vi/' + esc(v.id) + '/mqdefault.jpg" alt="" loading="lazy" decoding="async">' +
            '<span class="vid__t">' + esc(v.title || "動画") + "</span></a>"; }).join("") + "</div>"
      : '<div class="todo">動画はまだ登録されていません。' +
        "検索して良いものが見つかったら、<code>data/details/" + esc(st.n) + ".js</code> の " +
        "<code>videos: [{id:\"動画ID\", title:\"…\"}]</code> に足すとサムネイルが出ます。<br>" +
        "<b>動画IDを推測で埋めることはしません</b>（存在しないURLになるため）。</div>";
    return '<div class="sec"><div class="sec__h"><b>動画で見る</b>' +
      '<em><a href="https://www.youtube.com/results?search_query=' + q + '" target="_blank" rel="noopener">' +
      "YouTubeで検索 ↗</a></em></div>" + body + "</div>";
  }

  /* ---------------- もっと詳しく（外部の一次情報へ） ---------------- */
  function linksBlock(st) {
    var q = encodeURIComponent(st.n);
    var qs = encodeURIComponent(st.n + "駅");
    var L = [
      ["🗾", "地図で見る", "https://www.openstreetmap.org/?mlat=" + st.la + "&mlon=" + st.lo + "#map=16/" + st.la + "/" + st.lo],
      ["📖", "Wikipedia", "https://ja.wikipedia.org/wiki/" + qs],
      ["🏛️", "文化庁 国指定文化財等データベース", "https://kunishitei.bunka.go.jp/heritage/heritagelist"],
      ["🏙️", "東京都オープンデータカタログ", "https://portal.data.metro.tokyo.lg.jp/"],
      ["🗄️", "国立国会図書館サーチ", "https://ndlsearch.ndl.go.jp/search?cs=bib&keyword=" + q],
      ["🎓", "CiNii Research（学術論文）", "https://cir.nii.ac.jp/all?q=" + q],
      ["🗺️", "国土地理院 地理院地図", "https://maps.gsi.go.jp/#16/" + st.la + "/" + st.lo],
      ["💴", "国土交通省 不動産情報ライブラリ", "https://www.reinfolib.mlit.go.jp/"]
    ];
    return '<div class="sec"><div class="sec__h"><b>もっと詳しく調べる</b><em>一次情報へ</em></div>' +
      '<div class="lnks">' + L.map(function (x) {
        return '<a class="lnk" href="' + x[2] + '" target="_blank" rel="noopener"><span>' + x[0] + "</span>" +
               esc(x[1]) + "</a>"; }).join("") + "</div></div>";
  }

  /* 情報の鮮度順に並べる：上＝いま使う情報／下＝変わりにくい情報 */
  function render(id, d) {
    var s = RG.byId[id]; if (!s) return "";
    return plate(s) +
           hero(s) +
           scoreBlock(s) +
           congestion(s, d) +
           boarding(s, d) +
           town(s, d) +
           summary(s) +
           '<div class="sec walk" data-walk-st="' + esc(s.id) + '" hidden></div>' +
           heritageBlock(s) +
           videoBlock(s, d) +
           linksBlock(s) +
           sources(s, d);
  }

  function launcherHtml(id, line) {
    var dirs = RG.lineSequence(id, line, 200);
    if (!dirs.length) return '<p class="lu__e">この地図には、この路線のとなり駅データがありません。</p>';
    var c = RG.lineColor[line] || "#9AA0A6";
    var cols = dirs.map(function (dd) {
      var end = RG.byId[dd.endId];
      var title = dd.kind === "near" ? "この路線の駅（近い順）"
                                     : esc(end ? end.n : "") + " 方面";
      return '<div class="lu__col"><div class="lu__h">' +
        '<span class="lu__ar" style="color:' + c + '">' + (dd.kind === "near" ? "◎" : "▸") + "</span>" +
        title + "</div>" +
        '<ol class="lu__l">' + dd.list.map(function (x, i) {
          var t = RG.byId[x.id]; if (!t) return "";
          var w = RG.isWatched && RG.isWatched(x.id);
          var sub = dd.kind === "near" ? (x.km.toFixed(1) + "km / 約" + x.min + "分")
                                       : ((i + 1) + "駅 / 約" + x.min + "分");
          return '<li><button type="button" data-hop="' + esc(x.id) + '">' +
            '<span class="lu__d" style="background:' + c + '"></span>' +
            '<span class="lu__n">' + (w ? "⭐ " : "") + esc(t.n) + "</span>" +
            '<span class="lu__m">' + sub + "</span></button></li>";
        }).join("") + "</ol></div>";
    }).join("");
    var total = dirs.reduce(function (a, d) { return a + d.list.length; }, 0);
    var here = RG.byId[id];
    return '<div class="lu"><div class="lu__t">' + (RG.lineBadge ? RG.lineBadge(line, false) : "") +
      esc(line) + '<span class="lu__c">' + (total + 1) + "駅</span>" +
      '<span class="lu__s">駅名を押すと移動します</span></div>' +
      '<div class="lu__now">現在地 <b>' + esc(here ? here.n : "") + "</b></div>" +
      '<div class="lu__cols">' + cols + "</div></div>";
  }

  function bind(root, id, d) {
    var host = root.querySelector(".launcher");
    $$("[data-launch]", root).forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        var line = b.dataset.launch, open = b.getAttribute("aria-expanded") === "true";
        $$("[data-launch]", root).forEach(function (x) { x.setAttribute("aria-expanded", "false"); });
        if (open || !host) { host.hidden = true; host.innerHTML = ""; return; }
        b.setAttribute("aria-expanded", "true");
        host.innerHTML = launcherHtml(id, line);
        host.hidden = false;
        $$("[data-hop]", host).forEach(function (h) {
          h.addEventListener("click", function (ev) { ev.stopPropagation(); open2(h.dataset.hop); });
        });
        if (RG.Map.highlightLine) RG.Map.highlightLine(line);
      });
    });
    var c = root.querySelector("[data-close]"); if (c) c.addEventListener("click", close);
    $$(".hops [data-hop]", root).forEach(function (h) {
      h.addEventListener("click", function (e) { e.stopPropagation(); open2(h.dataset.hop); }); });
    var f = root.querySelector("[data-from]");
    if (f) f.addEventListener("click", function (e) {
      e.stopPropagation(); var s = RG.byId[f.dataset.from];
      RG.setOrigin([s.la, s.lo], s.n + "駅", s.id); close(); });
    var rb = root.querySelector("[data-rank]");
    if (rb) rb.addEventListener("click", function (e) { e.stopPropagation(); RG.showRanking(rb.dataset.rank); });
    var wt = root.querySelector("[data-watch]");
    if (wt) wt.addEventListener("click", function (e) {
      e.stopPropagation();
      if (RG.toggleWatch(wt.dataset.watch) !== false) {
        var on = RG.isWatched(wt.dataset.watch);
        wt.textContent = on ? "⭐" : "☆"; wt.classList.toggle("on", on);
      }
    });
    var t2 = root.querySelector("[data-to]");
    if (t2) t2.addEventListener("click", function (e) { e.stopPropagation(); RG.showRoutes(t2.dataset.to); });
    if (RG.Live && RG.Live.decorateStation) RG.Live.decorateStation(root, id);
    if (RG.Walk && RG.Walk.decorateStation) RG.Walk.decorateStation(root, id);
    $$(".tab", root).forEach(function (b) {
      b.addEventListener("click", function () {
        tab = b.dataset.tab;
        var host = root.querySelector(".card__scroll") || root, top = host.scrollTop;
        host.innerHTML = render(id, d); bind(root, id, d); host.scrollTop = top; }); });
  }

  function open2(x) { open(x); }
  function hoverShow(id, ev) {
    hover.innerHTML = '<div class="card__scroll" style="max-height:74vh">' + render(id, null) + "</div>";
    hover.classList.add("show"); position(ev); bind(hover, id, null);
    loadDetail(RG.byId[id].n, function (d) {
      if (!hover.classList.contains("show")) return;
      hover.innerHTML = '<div class="card__scroll" style="max-height:74vh">' + render(id, d) + "</div>";
      bind(hover, id, d);
    });
  }
  function position(ev) {
    var w = 372, m = 12, x = (ev && ev.clientX ? ev.clientX : innerWidth / 2) + 18;
    var y = (ev && ev.clientY ? ev.clientY : 120) - 40;
    if (x + w + m > innerWidth) x = (ev && ev.clientX ? ev.clientX : innerWidth / 2) - w - 18;
    var h = hover.offsetHeight || 420;
    if (y + h + m > innerHeight) y = Math.max(m, innerHeight - h - m);
    hover.style.left = Math.max(m, x) + "px"; hover.style.top = Math.max(m, y) + "px";
  }
  function open(id, ev) {
    var s = RG.byId[id]; if (!s) return;
    cur = id; Map.select(id); Map.focus(id, 260);
    if (!isTouch()) {
      pinned = true;
      var p = Map.screenPos(id) || {};
      hoverShow(id, ev && ev.clientX ? ev : { clientX: p.x, clientY: p.y });
      return;
    }
    var host = sheet.querySelector(".card__scroll");
    host.innerHTML = render(id, null); bind(sheet, id, null);
    sheet.classList.add("show"); sheet.classList.remove("full"); scrim.classList.add("show");
    loadDetail(s.n, function (d) { if (cur !== id) return; host.innerHTML = render(id, d); bind(sheet, id, d); });
  }
  function close() {
    cur = null; pinned = false; Map.select(null);
    hover.classList.remove("show");
    sheet.classList.remove("show", "full"); scrim.classList.remove("show");
  }
  function init() { hover = $("#hovercard"); sheet = $("#sheet"); scrim = $("#scrim"); }
  return { init: init, open: open, refresh: function () { if (cur) open(cur); }, close: close,
    hover: function (id, ev) { if (isTouch() || pinned) return;
      clearTimeout(timer); timer = setTimeout(function () { hoverShow(id, ev); }, 150); },
    unhover: function () { if (pinned) return; clearTimeout(timer); hover.classList.remove("show"); } };
})();
RG.Card = Card;
RG.openStation = function (id) { Card.open(id); };
RG.focusStation = function (id) { Map.focus(id, 260); };
RG.paintIso = function (m) { Map.paintIso(m); };
RG.paintPick = function (a) { Map.paintPick(a); };

/* ==================================================== 検索とフィルタ chip */
function initSearch() {
  var input = $("#q"), sug = $("#sug");
  function clear() { sug.innerHTML = ""; }
  input.addEventListener("input", function () {
    var v = input.value.trim(); clear(); if (!v) return;
    RG.NET.stations.filter(function (s) {
      return s.n.indexOf(v) >= 0 || (s.k && s.k.indexOf(v) >= 0) ||
             (s.ls || []).some(function (L) { return L.indexOf(v) >= 0; });
    }).slice(0, 14).forEach(function (s) {
      var b = el("button", { type: "button", html:
        '<span class="n">' + esc(s.n) + '</span><span class="k">' + esc(s.k || "") +
        '</span><span class="l">' + (s.ls || []).slice(0, 2).map(esc).join(" / ") + "</span>" });
      b.addEventListener("click", function () { clear(); input.blur(); Card.open(s.id); });
      sug.appendChild(b);
    });
  });
  input.addEventListener("blur", function () { setTimeout(clear, 160); });
}

var CHIPS = [
  { id: "hub", label: "乗換ハブ", emoji: "🔀", f: function (s) { return (s.ls || []).length >= 4; } },
  { id: "big", label: "大きい駅", emoji: "🏙️", f: function (s) { return s.rank < 60; } },
  { id: "quiet", label: "静かな駅", emoji: "🌿", f: function (s) { return !s.px || s.rank > RG.NET.stations.length * 0.6; } },
  { id: "old", label: "古い駅", emoji: "🏛️", f: function (s) { return s.op && +s.op < 1910; } },
  { id: "surveyed", label: "調査ずみ", emoji: "📓", f: function (s) { return RG.details[s.n] && RG.details[s.n] !== "none"; } },
  { id: "new", label: "未調査", emoji: "🧭", f: function (s) { return !RG.details[s.n] || RG.details[s.n] === "none"; } }
];
function initChips() {
  var bar = $("#chips"), state = {};
  CHIPS.forEach(function (c) {
    var b = el("button", { class: "chip", type: "button", "aria-pressed": "false", html: c.emoji + " " + c.label });
    b.addEventListener("click", function () {
      state[c.id] = !state[c.id]; b.setAttribute("aria-pressed", String(!!state[c.id]));
      var on = CHIPS.filter(function (x) { return state[x.id]; });
      if (!on.length) { Map.paintFilter(null); return; }
      Map.paintFilter(RG.NET.stations.filter(function (s) {
        return on.some(function (x) { return x.f(s); }); }).map(function (s) { return s.id; }));
    });
    bar.appendChild(b);
  });
}

function initSheetDrag() {
  var sheet = $("#sheet"), grab = $("#grab"), st = null;
  grab.addEventListener("pointerdown", function (e) {
    grab.setPointerCapture(e.pointerId); st = { y: e.clientY, full: sheet.classList.contains("full") }; });
  grab.addEventListener("pointerup", function (e) {
    if (!st) return; var dy = e.clientY - st.y;
    if (dy < -40) sheet.classList.add("full");
    else if (dy > 60) { if (st.full) sheet.classList.remove("full"); else Card.close(); }
    else sheet.classList.toggle("full");
    st = null;
  });
  $("#scrim").addEventListener("click", Card.close);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { Card.close(); if (RG.closeModal) RG.closeModal(); } });
  document.addEventListener("pointerdown", function (e) {
    if (e.target.closest("#hovercard") || e.target.closest(".node") || e.target.closest(".hdr") ||
        e.target.closest(".chips") || e.target.closest(".modal") || e.target.closest("#tripbar")) return;
    Card.close();
  });
}

var mergedKeys = {};
function mergeExtraPois(key) {
  if (!RG.MAPPOI) RG.MAPPOI = [];
  function once(k, fn) { if (mergedKeys[k]) return; mergedKeys[k] = 1; fn(); }
  if (!key || key === "od" || key === "od2") {
    if (RG.OD) once("od", function () {
      var A = { museum2: "museum", park2: "park" };
      Object.keys(RG.OD).forEach(function (gid) {
        var g2 = A[gid] || gid;
        var label = (RG.GENRES.filter(function (x) { return x.id === g2; })[0] || {}).label || g2;
        RG.OD[gid].forEach(function (r, i) {
          RG.MAPPOI.push({ i: gid + i, n: r.n, la: r.la, lo: r.lo, g: g2, s: 3.0, ti: 2,
                           t: label, ad: r.ad || null, no: r.no || null,
                           st: r.st, sd: r.sd, org: r.org, od: 1 });
        });
      });
    });
    if (RG.OD2) once("od2", function () {
      Object.keys(RG.OD2).forEach(function (gid) {
        if (!Array.isArray(RG.OD2[gid])) return;
        var label = (RG.GENRES.filter(function (x) { return x.id === gid; })[0] || {}).label || gid;
        RG.OD2[gid].forEach(function (r, i) {
          RG.MAPPOI.push({ i: gid + "b" + i, n: r.n, la: r.la, lo: r.lo, g: gid, s: 3.5, ti: 2,
                           t: r.kind || label, ad: r.ad || null, url: r.url || null,
                           river: r.river || null, st: r.st, sd: r.sd, od: 1 });
        });
      });
    });
  }
  if (RG.CHAIN_ROWS) once("chains", function () {
    var BR = {};
    (RG.CHAIN_BRANDS || []).forEach(function (b) { BR[b.id] = b; });
    RG.CHAIN_ROWS.forEach(function (r, i) {
      var b = BR[r[0]]; if (!b) return;
      RG.MAPPOI.push({ i: "c" + i, n: r[3] || b.n, la: r[1], lo: r[2], g: b.cat,
                       s: 2.5, ti: 2, t: b.n, brand: b.id, bc: b.c, be: b.e, chain: 1 });
    });
  });
  if (RG.USER_POIS) once("user", function () {
    RG.USER_POIS.forEach(function (u, i) {
      if (!u || !u.n) return;
      RG.MAPPOI.push({ i: "u" + i, n: u.n, la: u.la, lo: u.lo, g: u.g || "spot",
                       s: u.s || 3, ti: 0, t: u.t || "自分で調べた場所",
                       img: u.img || null, note: u.note, fee: u.fee, user: 1 });
    });
  });
}
RG.mergeExtraPois = mergeExtraPois;

RG.boot = function () {
  if (!RG.MAPPOI) RG.MAPPOI = [];
  mergeExtraPois();
  buildIndex(); Card.init();
  Map.draw(); Map.initViewport();
  (RG.initSearchUI ? RG.initSearchUI() : initSearch()); initChips(); initSheetDrag();
  if (RG.initPlannerUI) RG.initPlannerUI();
  Map.drawBase();
  Map.buildPOI();
  if (RG.initLinesUI) RG.initLinesUI();
  if (RG.initPlan) RG.initPlan();
  if (RG.Live && RG.Live.init) RG.Live.init();
  $("#zin").addEventListener("click", function () { Map.zoom(1 / 1.45); });
  $("#zout").addEventListener("click", function () { Map.zoom(1.45); });
  $("#zfit").addEventListener("click", Map.fitAll);
  $("#zhub").addEventListener("click", function () { Map.focus(RG.HUB, 300); });
  $("#btn-hub").addEventListener("click", function () { Card.open(RG.HUB); });
  var sl = $("#statline");
  if (sl) sl.textContent = RG.NET.stations.length + "駅 / " + RG.NET.lines.length + "路線";
  Map.focus(RG.HUB, 700);
};

})(window);
