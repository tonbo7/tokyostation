/* =========================================================================
   ルートプランナー UI v3
   出発バー／アグレッシブ度／比較ビュー（パレート図）／行き先さがし／深夜レスキュー
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, el = RG.el, esc = RG.esc;
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function pad(n) { return (n < 10 ? "0" : "") + n; }
function yen(v) { return "¥" + Math.round(v).toLocaleString("ja-JP"); }
function hhmm(d) { return pad(d.getHours()) + ":" + pad(d.getMinutes()); }

var Trip = { origin: null, label: "", id: null, when: new Date(), aggr: 1 };
RG.Trip = Trip;

/* ---------------------------------------------------------- 出発バー */
function initBar() {
  var bar = $("#tripbar");
  bar.innerHTML =
    '<button id="t-geo" class="tb__btn" type="button">📍 現在地</button>' +
    '<span id="t-from" class="tb__from">駅をタップ →「ここから出発」</span>' +
    '<input id="t-dt" class="tb__dt" type="datetime-local" aria-label="出発日時">' +
    '<button id="t-now" class="tb__btn" type="button">今</button>' +
    '<span class="aggr" role="group" aria-label="アグレッシブ度">' +
      RG.CONFIG.aggr.map(function (a) {
        return '<button class="aggr__b" type="button" data-aggr="' + a.id + '" aria-pressed="' +
          (a.id === 1) + '" title="' + esc(a.tone) + '">' + a.emoji + " " + esc(a.label) + "</button>";
      }).join("") + "</span>" +
    '<button id="t-find" class="tb__btn tb__btn--go" type="button">🧭 行き先をさがす</button>' +
    '<button id="t-rescue" class="tb__btn tb__btn--night" type="button" hidden>🌙 終電を逃した</button>';

  if (RG.secureOK && !RG.secureOK()) {
    var g = $("#t-geo"); if (g) { g.classList.add("tb__btn--warn"); g.textContent = "📍 現在地 ⚠"; }
  }
  setWhen(new Date());
  $("#t-dt").addEventListener("change", function () { if (this.value) { Trip.when = new Date(this.value); afterWhen(); } });
  $("#t-now").addEventListener("click", function () { setWhen(new Date()); afterWhen(); });
  $("#t-geo").addEventListener("click", useGeo);
  $("#t-find").addEventListener("click", openDiscover);
  $("#t-rescue").addEventListener("click", openRescue);
  $$("[data-aggr]").forEach(function (b) {
    b.addEventListener("click", function () {
      Trip.aggr = +b.dataset.aggr;
      $$("[data-aggr]").forEach(function (x) { x.setAttribute("aria-pressed", String(+x.dataset.aggr === Trip.aggr)); });
      status(RG.CONFIG.aggr[Trip.aggr].emoji + " 「" + RG.CONFIG.aggr[Trip.aggr].label +
             "」に切り替えました（" + RG.CONFIG.aggr[Trip.aggr].tone + "提案します）", "info", 2600);
    });
  });
  afterWhen();
}
function setWhen(d) {
  Trip.when = d;
  $("#t-dt").value = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
                     "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
}
function afterWhen() {
  var night = RG.Planner.isAfterLastTrain(Trip.when);
  $("#t-rescue").hidden = !night;
  document.body.classList.toggle("night", night);
  if (night) {
    var m = RG.Planner.minutesToFirstTrain(Trip.when);
    status("🌙 いまは終電後の時間帯です（始発まであと " + m + " 分）。電車以外の手段を優先して提案します。",
           "night", 6000);
  }
  if (Trip.origin) refreshIso();
}
function setOrigin(coord, label, id, accuracy) {
  Trip.origin = coord; Trip.label = label; Trip.id = id || null;
  Trip.acc = accuracy || null;
  Trip.isGeo = !id;                       // 駅ではなく実際の現在地かどうか
  if (RG.Map.paintMe) RG.Map.paintMe(coord, Trip.isGeo ? accuracy : 0);
  var f = $("#t-from"); f.textContent = "出発：" + label; f.classList.add("on");
  status(label + " を出発地にしました。行き先の駅をタップするか「🧭 行き先をさがす」へ。", "ok", 3500);
  refreshIso();
}
RG.setOrigin = setOrigin;

function useGeo(retry) {
  if (!navigator.geolocation) {
    status("このブラウザには位置情報の機能がありません。", "warn");
    if (RG.showGeoHelp) RG.showGeoHelp({ code: 0 });
    return;
  }
  if (RG.secureOK && !RG.secureOK()) {      // http:// や file:// では最初から動かない
    if (RG.showGeoHelp) RG.showGeoHelp({ code: 0 });
    return;
  }
  status("現在地を取得しています…" + (retry ? "（再試行）" : ""), "info", 0);
  navigator.geolocation.getCurrentPosition(function (p) {
    var c = [p.coords.latitude, p.coords.longitude], best = null;
    RG.NET.stations.forEach(function (s) {
      var km = RG.hav(c, [s.la, s.lo]);
      if (!best || km < best.km) best = { s: s, km: km };
    });
    var acc = p.coords.accuracy ? "±" + Math.round(p.coords.accuracy) + "m" : "";
    setOrigin(c, "現在地（" + best.s.n + "駅から約" + best.km.toFixed(1) + "km" +
                 (acc ? " / 精度" + acc : "") + "）", null, p.coords.accuracy);
    RG.Map.gotoLatLng(c[0], c[1], 340);
  }, function (e) {
    status("", "");
    if (RG.showGeoHelp) RG.showGeoHelp(e);
    else status("現在地を取得できませんでした（" + esc(e.message) + "）", "warn", 9000);
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
}
RG.useGeo = useGeo;
var stTimer = null;
function status(msg, kind, ms) {
  var s = $("#t-status");
  clearTimeout(stTimer);
  s.textContent = msg || ""; s.className = "tb__status" + (kind ? " " + kind : "");
  s.style.display = msg ? "block" : "none";
  if (msg && ms !== 0) stTimer = setTimeout(function () { s.style.display = "none"; }, ms || 5000);
}
RG.tripStatus = status;

RG.tripMapLink = function () {
  return Trip.origin ? RG.mapLinks(Trip.origin, Trip.origin, "transit") : null;
};
function refreshIso() {
  if (!Trip.origin) return;
  RG.paintIso(RG.Planner.isochrone(Trip.origin, Trip.when));
}

/* ------------------------------------------------------------- モーダル */
var M = null;
function modal(title, html) {
  if (!M) {
    M = document.createElement("div"); M.className = "modal";
    M.innerHTML = '<div class="modal__box"><div class="modal__hd"><b></b>' +
      '<button class="modal__x" aria-label="閉じる">×</button></div><div class="modal__bd"></div></div>';
    document.body.appendChild(M);
    M.addEventListener("click", function (e) {
      if (e.target === M || e.target.classList.contains("modal__x")) M.classList.remove("show");
    });
  }
  $(".modal__hd b", M).textContent = title;
  $(".modal__bd", M).innerHTML = html;
  M.classList.add("show"); $(".modal__bd", M).scrollTop = 0;
  return M;
}
RG.closeModal = function () { if (M) M.classList.remove("show"); };
RG.openModal = modal;

/* ---------------------------------------------- ☆評価の表示 */
function stars(v) {
  var full = Math.floor(v), half = (v - full) >= 0.5, out = "";
  for (var i = 0; i < 5; i++) out += (i < full) ? "★" : (i === full && half) ? "⯨" : "☆";
  return '<span class="stars">' + out.replace(/⯨/g, "★") + '<b>' + v.toFixed(1) + "</b></span>";
}
RG.stars = stars;

/* いちばん近い駅と徒歩の分数 */
function nearestStation(la, lo) {
  var best = null;
  RG.NET.stations.forEach(function (t) {
    var km = RG.hav([la, lo], [t.la, t.lo]);
    if (!best || km < best.km) best = { t: t, km: km };
  });
  if (!best) return null;
  var W = RG.CONFIG.modes.walk, DT = RG.CONFIG.detour.walk;
  best.min = Math.round(best.km * DT / W.speed * 60);
  return best;
}
RG.nearestStation = nearestStation;

/* ---------------------------------------------- スポットのホバーPOPUP */
var poiPop = null, tipTimer = null, tipOver = false, tipCur = null;
function tipInit() {
  if (poiPop) return;
  poiPop = $("#poipop");
  // ふきだしの上にカーソルが来たら消さない（中のボタンを押せるようにするため）
  poiPop.addEventListener("pointerenter", function () { tipOver = true; clearTimeout(tipTimer); });
  poiPop.addEventListener("pointerleave", function () { tipOver = false; RG.spotTip(null); });
}
RG.spotTip = function (p, P, isOwn) {
  tipInit();
  if (!p) {
    // すぐには消さない。カーソルがふきだしへ移る時間をとる
    clearTimeout(tipTimer);
    tipTimer = setTimeout(function () {
      if (!tipOver) { poiPop.style.display = "none"; tipCur = null; }
    }, 550);
    return;
  }
  clearTimeout(tipTimer);
  tipCur = p;
  var g = (RG.GENRES || []).filter(function (x) { return x.id === p.g; })[0] ||
          { e: p.e || "📍", label: p.cl || "自分で追加した場所", c: "#0055AD" };
  var near = nearestStation(p.la, p.lo);
  var vc = RG.visitCount ? RG.visitCount(p.n) : 0;
  var d = RG.DESCS && RG.DESCS[p.n];
  poiPop.innerHTML =
    (p.img
      ? '<img class="pp__i" src="' + esc(RG.cimg(p.img, 320)) + '" alt="" loading="lazy">'
      : '<div class="pp__ph" style="--lc:' + (p.bc || g.c || "#888") + '">' +
        (p.be || g.e || p.e || "📍") + "</div>") +
    '<div class="pp__h"><span class="pp__e">' + (p.be || p.e || g.e) + "</span>" +
    "<b>" + esc(p.n) + "</b></div>" +
    '<div class="pp__b">' + esc(g.label) +
      (p.t && p.t !== g.label && p.t !== p.n ? " ・ " + esc(p.t) : "") + "</div>" +
    (p.s ? '<div class="pp__s">' + stars(p.s) + "</div>" : "") +
    (d && d.d ? '<div class="pp__d">' + esc(d.d) + "</div>" : "") +
    (near ? '<div class="pp__n">🚉 ' + esc(near.t.n) + "駅から徒歩約" + near.min + "分（" +
       Math.round(near.km * 1000) + "m）</div>" : "") +
    (p.ad ? '<div class="pp__n">🏠 ' + esc(p.ad) + "</div>" : "") +
    (p.live && p.no ? '<div class="pp__n pp__live">🚦 ' + esc(p.no) + "</div>" : "") +
    (vc ? '<div class="pp__v">✅ ' + vc + "回 行ったことがあります</div>" : "") +
    (p.g === "camera" && p.url ? '<div class="pp__cam">📹 クリックで映像が見られます</div>' : "") +
    '<div class="pp__a">' +
      '<button class="pp__b" type="button" id="pp-more">' +
        (p.g === "camera" && p.url ? "📹 映像を見る" : "くわしく見る") + " ▸</button>" +
      '<button class="pp__c" type="button" id="pp-close" aria-label="閉じる">✕</button>' +
    "</div>";
  poiPop.style.pointerEvents = "auto";
  poiPop.style.display = "block";
  var mb = $("#pp-more", poiPop);
  if (mb) mb.addEventListener("click", function (ev) {
    ev.stopPropagation(); tipOver = false; poiPop.style.display = "none"; RG.showSpot(p);
  });
  var cb = $("#pp-close", poiPop);
  if (cb) cb.addEventListener("click", function (ev) {
    ev.stopPropagation(); tipOver = false; poiPop.style.display = "none";
  });
  var sp = RG.Map.screenPosXY ? RG.Map.screenPosXY(P.x, P.y) : null;
  if (sp) {
    var w = poiPop.offsetWidth;
    poiPop.style.left = Math.min(innerWidth - w - 8, Math.max(8, sp.x - w / 2)) + "px";
    poiPop.style.top = Math.max(8, sp.y - poiPop.offsetHeight - 14) + "px";
  }
};

/* YouTube のURLから動画IDを取り出す（youtu.be / watch?v= / live/ に対応） */
function ytId(u) {
  if (!u) return null;
  var m = /(?:youtu\.be\/|[?&]v=|\/live\/|\/embed\/)([A-Za-z0-9_-]{6,})/.exec(u);
  return m ? m[1] : null;
}
RG.ytId = ytId;

/* 監視カメラの映像ブロック */
function cameraBlock(p) {
  if (p.g !== "camera" || !p.url) return "";
  var id = ytId(p.url);
  var head = '<div class="cam"><div class="cam__h">📹 いまの映像' +
    (p.kind ? '<span class="cam__k">' + esc(p.kind) + "</span>" : "") +
    (p.river ? '<span class="cam__k">' + esc(p.river) + "</span>" : "") + "</div>";
  if (!id) {
    return head + '<a class="lnk cam__l" href="' + esc(p.url) + '" target="_blank" rel="noopener">' +
      "<span>▶️</span>カメラの映像を見る</a>" +
      '<p class="cam__s">出典: 東京都（建設局・港湾局）のライブカメラ</p></div>';
  }
  return head +
    '<div class="cam__w"><iframe class="cam__f" src="https://www.youtube-nocookie.com/embed/' + esc(id) +
      '?rel=0&modestbranding=1" title="' + esc(p.n) + ' のライブ映像" loading="lazy" ' +
      'allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>' +
    '<div class="lnks"><a class="lnk" href="' + esc(p.url) + '" target="_blank" rel="noopener">' +
      "<span>▶️</span>YouTube で開く（全画面・音声）</a></div>" +
    '<p class="cam__s">東京都（建設局・港湾局）が YouTube で公開しているライブ映像を、' +
    "そのまま埋め込んで表示しています。大雨のときの川の様子などが見られます。<br>" +
    "映像が出ないときは配信が止まっている可能性があります。</p></div>";
}

/* ---------------------------------------------- スポットのエグゼクティブサマリ */
/* 近くの同じジャンルのスポット */
function sameGenre(p) {
  var near = [];
  (RG.MAPPOI || []).forEach(function (q) {
    if (q.i === p.i || q.g !== p.g) return;
    var km = RG.hav([p.la, p.lo], [q.la, q.lo]);
    if (km < 2.5) near.push({ q: q, km: km });
  });
  if (!near.length) return "";
  near.sort(function (a, b) { return a.km - b.km; });
  var g = (RG.GENRES || []).filter(function (x) { return x.id === p.g; })[0] || {};
  return '<div class="samegenre"><div class="samegenre__h">' + (g.e || "📍") +
    " 近くの" + esc(g.label || "スポット") + "</div>" +
    near.slice(0, 4).map(function (x) {
      return '<button class="sgbtn" type="button" data-spot="' + esc(x.q.i) + '">' +
        (x.q.img ? '<img src="' + esc(RG.cimg(x.q.img, 240)) + '" alt="" loading="lazy">' : '<span class="sgbtn__ph">' + (g.e || "📍") + "</span>") +
        '<span class="sgbtn__n">' + esc(x.q.n) + "</span>" +
        '<span class="sgbtn__m">' + Math.round(x.km * 1000) + "m ・ " + RG.stars(x.q.s) + "</span></button>";
    }).join("") + "</div>";
}

RG.showSpot = function (p) {
  RG.spotTip(null);
  var g = (RG.GENRES || []).filter(function (x) { return x.id === p.g; })[0] || { e: "📍", label: "スポット", c: "#0055AD" };
  // 最寄り駅とそこまでの徒歩時間
  var near = [];
  RG.NET.stations.forEach(function (t) {
    var km = RG.hav([p.la, p.lo], [t.la, t.lo]);
    if (km < 2.0) near.push({ t: t, km: km });
  });
  near.sort(function (a, b) { return a.km - b.km; });
  near = near.slice(0, 3);
  var nb = near[0] || null;
  var W = RG.CONFIG.modes.walk, DT = RG.CONFIG.detour.walk;
  var q = encodeURIComponent(p.n);
  // 半径400m にある便利施設を数える（トイレ・AED・Wi-Fi・授乳・銭湯）
  var HANDY = { toilet: "🚻 トイレ", aed: "🅰️ AED", wifi: "📶 Wi-Fi",
                baby: "👶 授乳・おむつ", sento: "🛁 銭湯", onsen: "♨️ 温泉",
                cycle: "🅿️ 駐輪場", shelter: "🏳️ 避難場所" };
  var handy = {};
  (RG.MAPPOI || []).forEach(function (x) {
    if (!HANDY[x.g] || x.i === p.i) return;
    if (RG.hav([p.la, p.lo], [x.la, x.lo]) < 0.4) handy[x.g] = (handy[x.g] || 0) + 1;
  });
  var handyHtml = Object.keys(handy).length
    ? '<div class="handy"><div class="handy__h">🧭 まわり400mにあるもの</div>' +
      Object.keys(handy).map(function (k) {
        return '<span class="handy__i">' + HANDY[k] + " <b>" + handy[k] + "</b></span>"; }).join("") +
      "</div>" : "";
  // 出発地からの行き方（出発地が決まっているときだけ）
  var fromHtml = "";
  if (Trip.origin) {
    var km0 = RG.hav(Trip.origin, [p.la, p.lo]);
    var Wk = RG.CONFIG.modes.walk, DTk = RG.CONFIG.detour.walk;
    fromHtml = '<div class="fromhere"><span class="fromhere__h">🧳 ' + esc(Trip.label) + " から</span>" +
      '<span class="fromhere__v">直線 ' + km0.toFixed(1) + "km ・ 歩くと約" +
      Math.round(km0 * DTk / Wk.speed * 60) + "分</span>" +
      (nb ? '<button class="fromhere__b" type="button" data-dest2="' + esc(nb.t.id) +
        '">🧭 ' + esc(nb.t.n) + "駅までの行き方をくらべる</button>" : "") + "</div>";
  }
  var vcount = RG.visitCount ? RG.visitCount(p.n) : 0;
  var html = '<div class="spotcard">' +
    (p.img
      ? '<img class="spotcard__i" src="' + esc(RG.cimg(p.img, 640)) + '" alt="" loading="lazy">'
      : p.chain
      ? '<div class="spotcard__ph spotcard__ph--s" style="--lc:' + (p.bc || "#888") + '">' +
        '<span class="spotcard__phe">' + (p.be || "🏪") + "</span>" +
        '<span class="spotcard__phn">' + esc(p.t || p.n) + "</span>" +
        '<span class="spotcard__pht">お店のロゴは商標のため出せません。ブランドカラーで表しています</span></div>'
      : '<div class="spotcard__ph" style="--lc:' + (g.c || "#888") + '">' +
        '<span class="spotcard__phe">' + (p.be || p.e || g.e || "📍") + "</span>" +
        '<span class="spotcard__phn">' + esc(p.n) + "</span>" +
        '<span class="spotcard__pht">' +
          (p.url ? "自由に使える写真がありません。公式ページでご覧ください"
                 : "自由に使える写真が見つかりませんでした") + "</span></div>") +
    '<div class="spotcard__hd"><span class="gbadge gbadge--b" style="--lc:' + (p.bc || g.c) + '">' +
      (p.be || g.e) + "</span>" +
      "<div><h3>" + esc(p.n) + "</h3>" +
      '<p class="spotcard__k">' + esc(g.label) +
        (p.t && p.t !== p.n ? " ・ " + esc(p.t) : "") + "</p></div></div>" +
    '<div class="spotcard__st">' + stars(p.s || 3) +
      '<span class="spotcard__why">行く価値のめやす</span>' +
      (vcount ? '<span class="spotcard__v">✅ ' + vcount + "回 訪問ずみ</span>" : "") + "</div>" +
    cameraBlock(p) +
    fromHtml +
    (RG.wikiIntro ? RG.wikiIntro(p.n) : "") +
    '<div class="exgrid">' +
      exrow("📍 最寄り駅", near.length ? near[0].t.n + "駅" : "—",
            near.length ? "徒歩 約" + Math.round(near[0].km * DT / W.speed * 60) + "分（" +
              Math.round(near[0].km * 1000) + "m）" : "半径2km内に駅なし") +
      exrow("🚉 徒歩圏の駅", near.length + " 駅",
            near.map(function (x) { return x.t.n + "(" + Math.round(x.km * 1000) + "m)"; }).join("・")) +
      (p.sl ? exrow("🌏 注目度", p.sl + " 言語版", "Wikipediaで" + p.sl + "か国語の記事があります") : "") +
      (p.ad ? exrow("🏠 所在地", "—", p.ad) : "") +
      (p.no && !p.live ? exrow("ℹ️ 備考", "—", p.no) : "") +
      (p.live ? exrow("🚦 いまの状況", "—", p.no || "取得できませんでした") : "") +
      (p.st ? exrow("🚉 最寄り駅", p.st + "駅", "直線 約" + p.sd + "m") : "") +
      (p.fee ? exrow("💴 めやすの料金", "1人 ¥" + Number(p.fee).toLocaleString("ja-JP"),
                     "おでかけプランに入れると人数分で計算します") : "") +
      (p.note ? exrow("📝 自分のメモ", "—", p.note) : "") +
    "</div>" +
    handyHtml +
    sameGenre(p) +
    '<div class="lnks">' +
      '<a class="lnk" href="https://ja.wikipedia.org/wiki/' + q + '" target="_blank" rel="noopener"><span>📖</span>Wikipedia</a>' +
      (p.url ? '<a class="lnk" href="' + esc(p.url) + '" target="_blank" rel="noopener"><span>🔗</span>公式ページ</a>' : "") +
      '<a class="lnk" href="https://www.openstreetmap.org/?mlat=' + p.la + "&mlon=" + p.lo +
        "#map=17/" + p.la + "/" + p.lo + '" target="_blank" rel="noopener"><span>🗾</span>地図で見る</a>' +
      '<a class="lnk" href="https://maps.gsi.go.jp/#17/' + p.la + "/" + p.lo +
        '" target="_blank" rel="noopener"><span>🗺️</span>地理院地図</a>' +
      (near.length ? '<button class="lnk" type="button" data-goto="' + esc(near[0].t.id) +
        '"><span>🚉</span>' + esc(near[0].t.n) + "駅を見る</button>" : "") +
      '<button class="lnk" type="button" data-plan="1"><span>🧳</span>立ち寄る（リストに追加）</button>' +
    "</div>" +
    RG.mapButtons(RG.Trip.origin, [p.la, p.lo], "walk", "出発地からの道順") +
    (p.chain ? '<p class="src od">出典: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">' +
       "© OpenStreetMap contributors</a>（ODbL 1.0）<br>" +
       "OSM の登録状況によるため、実際の全店舗を網羅しているわけではありません。" +
       "営業時間や営業の有無は各社の公式情報でご確認ください。</p>" : "") +
    (p.od ? '<p class="src od">出典: <a href="https://portal.data.metro.tokyo.lg.jp/" target="_blank" rel="noopener">' +
       "東京都オープンデータカタログサイト</a>（" + esc(p.org || "") + "）／ライセンス CC BY 4.0<br>" +
       "更新のタイミングは団体ごとに異なります。最新情報は各自治体の公開データでご確認ください。</p>" : "") +
    (p.srcNote ? '<p class="src">' + esc(p.srcNote) + "</p>" : "") +
    '<p class="src">☆は「行く価値のめやす」です。文化財は指定の格（国宝5.0／重要文化財4.5／史跡4.5／登録有形3.5…）、' +
    "それ以外は Wikipedia の言語版数と写真の有無から機械的に付けています。" +
    "<b>レビューサイトの評価点ではありません。</b><br>出典: Wikidata (CC0 1.0) / 画像: Wikimedia Commons</p></div>";
  var m = modal(g.e + " " + p.n, html);
  var gb = m.querySelector("[data-goto]");
  if (gb) gb.addEventListener("click", function () { RG.closeModal(); RG.openStation(gb.dataset.goto); });
  var db2 = m.querySelector("[data-dest2]");
  if (db2) db2.addEventListener("click", function () { RG.closeModal(); showRoutes(db2.dataset.dest2); });
  var pb = m.querySelector("[data-plan]");
  if (pb) pb.addEventListener("click", function () {
    RG.addSpotToPlan(p, p.fee || 0, p.note || ""); pb.innerHTML = "<span>✓</span>リストに追加ずみ"; pb.disabled = true; });
  $$("[data-spot]", m).forEach(function (b) {
    b.addEventListener("click", function () {
      var q2 = (RG.MAPPOI || []).filter(function (x) { return x.i === b.dataset.spot; })[0];
      if (q2) { RG.Map.gotoLatLng(q2.la, q2.lo, 180); RG.showSpot(q2); }
    });
  });
  function exrow(k, v, sub) {
    return '<div class="ex"><span class="ex__k">' + esc(k) + '</span><span class="ex__v">' + esc(v) + "</span>" +
      (sub ? '<span class="ex__s">' + esc(sub) + "</span>" : "") + "</div>";
  }
};

/* ---------------------------------------------- 住所・地点のカード */
RG.showPlace = function (r) {
  var near = [];
  RG.NET.stations.forEach(function (t) {
    var km = RG.hav([r.la, r.lo], [t.la, t.lo]);
    if (km < 2.5) near.push({ t: t, km: km });
  });
  near.sort(function (a, b) { return a.km - b.km; });
  near = near.slice(0, 4);
  var W = RG.CONFIG.modes.walk, DT = RG.CONFIG.detour.walk;
  var html = '<div class="spotcard"><div class="spotcard__hd">' +
    '<span class="gbadge gbadge--b" style="--lc:#0055AD">📍</span>' +
    "<div><h3>" + esc(r.n) + '</h3><p class="spotcard__k">' + esc(r.sub || "") + "</p></div></div>" +
    '<div class="exgrid">' + (near.length
      ? near.map(function (x) {
          return '<div class="ex"><span class="ex__k">🚉 ' + esc(x.t.n) + '駅</span><span class="ex__v">徒歩' +
            Math.round(x.km * DT / W.speed * 60) + '分</span><span class="ex__s">' +
            Math.round(x.km * 1000) + "m ・ " + ((x.t.ls || []).slice(0, 3).join(" / ") || "路線情報なし") + "</span></div>"; }).join("")
      : '<div class="ex"><span class="ex__k">最寄り駅</span><span class="ex__v">—</span>' +
        '<span class="ex__s">半径2.5km内に駅がありません</span></div>') + "</div>" +
    (near.length ? '<div class="lnks"><button class="lnk" type="button" data-goto="' + esc(near[0].t.id) +
      '"><span>🚉</span>' + esc(near[0].t.n) + '駅のカードを見る</button>' +
      '<button class="lnk" type="button" data-dest="1"><span>🧭</span>ここへ行く（手段をくらべる）</button></div>' : "") +
    RG.mapButtons(RG.Trip.origin, [r.la, r.lo], "walk", "地図アプリで答え合わせ") +
    '<p class="src">' + esc(r.licence || "座標: このアプリの索引") + "</p></div>";
  var m = modal("📍 " + r.n, html);
  var gb = m.querySelector("[data-goto]");
  if (gb) gb.addEventListener("click", function () { RG.closeModal(); RG.openStation(gb.dataset.goto); });
  var db = m.querySelector("[data-dest]");
  if (db) db.addEventListener("click", function () { RG.closeModal(); RG.showRoutes(near[0].t.id); });
};

/* ---------------------------------------------- これからのイベント */
RG.showEvents = function () {
  var GATE = RG.EVENT_GATE || [0, 40, 55, 65, 75];
  var all = (RG.EVENTS || []).map(function (e) {
    return { e: e, gate: GATE[Math.min(e.ma, GATE.length - 1)], pass: e.sc >= GATE[Math.min(e.ma, GATE.length - 1)] };
  });
  var byMonth = {};
  all.forEach(function (x) { (byMonth[x.e.s.slice(0, 7)] = byMonth[x.e.s.slice(0, 7)] || []).push(x); });
  var months = Object.keys(byMonth).sort();
  var showAll = false;
  function badge(sc) {
    var t = sc >= 70 ? "大" : sc >= 50 ? "中" : "小";
    return '<span class="evb evb--' + t + '">' + t + "</span>";
  }
  function render() {
    var body = months.map(function (mk) {
      var list = byMonth[mk].filter(function (x) { return showAll || x.pass; })
                            .sort(function (a, b) { return b.e.sc - a.e.sc; });
      if (!list.length) return "";
      var g = byMonth[mk][0].gate;
      return '<div class="evm"><div class="evm__h">' + mk.replace("-", "年") + "月" +
        '<span class="evm__g">' + (g ? "規模スコア " + g + " 以上を表示" : "すべて表示") +
        "（" + list.length + "/" + byMonth[mk].length + "件）</span></div>" +
        list.map(function (x) {
          var e = x.e;
          return '<div class="ev' + (x.pass ? "" : " ev--dim") + '">' +
            '<div class="ev__t">' + badge(e.sc) + "<b>" + esc(e.n) + "</b></div>" +
            '<div class="ev__d">📅 ' + esc(e.s === e.e ? e.s : e.s + " 〜 " + e.e) +
              (e.p ? " ／ 📍 " + esc(e.p) : "") + (e.f ? " ／ 💴 " + esc(e.f) : "") + "</div>" +
            (e.d ? '<div class="ev__x">' + esc(e.d) + "</div>" : "") +
            '<div class="ev__f"><span>' + esc(e.org) + " ・ 規模スコア " + e.sc + "</span>" +
              (e.u ? '<a href="' + esc(e.u) + '" target="_blank" rel="noopener">公式ページ ↗</a>' : "") +
              (e.la != null ? '<button type="button" data-evgo="' + esc(e.la + "," + e.lo) + '">地図で見る</button>' : "") +
            "</div></div>";
        }).join("") + "</div>";
    }).join("");
    return '<div class="evwrap">' +
      '<p class="ev__lead">これから開かれる催しです。<b>先の月ほど規模の大きいものだけ</b>を残しています。' +
      "細かい行事で先の予定が埋まらないようにするためです。</p>" +
      '<div class="ev__gate">' + GATE.map(function (g, i) {
        return '<span>' + (i === 0 ? "今月" : i >= 4 ? i + "か月先〜" : i + "か月先") +
          "：" + (g ? "スコア" + g + "以上" : "ぜんぶ") + "</span>"; }).join("") + "</div>" +
      '<label class="set__sw"><input id="ev-all" type="checkbox"' + (showAll ? " checked" : "") +
      "> しぼりこみをやめて全部見る</label>" +
      (body || '<p class="set__d">これから開かれる催しのデータが見つかりませんでした。</p>') +
      '<p class="src">出典: 東京都オープンデータカタログサイト（CC BY 4.0）。' +
      "<b>規模スコアは主催者の公表値ではなく、会期の長さ・名前のことば・説明文の量などから" +
      "本アプリが機械的に推定した値です。</b>行く前に主催者の公式情報をご確認ください。</p></div>";
  }
  function draw() {
    var m = modal("🎪 これからのイベント（" + all.filter(function (x) { return x.pass; }).length + "件）", render());
    $("#ev-all", m).addEventListener("change", function () { showAll = this.checked; draw(); });
    $$("[data-evgo]", m).forEach(function (b) {
      b.addEventListener("click", function () {
        var c = b.dataset.evgo.split(",");
        RG.closeModal(); RG.Map.gotoLatLng(+c[0], +c[1], 200);
      });
    });
  }
  draw();
};

/* ---------------------------------------------- 駅ランキング（全件） */
RG.showRanking = function (focusId) {
  var all = RG.NET.stations.map(function (s) {
    var d = RG.Score.of(s.id);
    return { s: s, total: d.total, rank: d.rank, axes: d.axes };
  }).sort(function (a, b) { return a.rank - b.rank; });
  var html =
    '<div class="rk__ctl"><input id="rk-q" type="search" placeholder="駅名でしぼりこむ" autocomplete="off">' +
      '<span class="rk__n">' + all.length + " 駅</span>" +
      '<button id="rk-rev" class="set__b2" type="button">下位から見る ⇅</button></div>' +
    '<div class="rk__head"><span>順位</span><span>駅</span><span>路線</span><span>総合</span></div>' +
    '<div id="rk-list" class="rk__list"></div>' +
    '<p class="src">総合スコアは6つの軸（交通力・歴史文化・社寺・くらし公共・地価のやさしさ・終電後の帰りやすさ）を' +
    "23区内のパーセンタイル順位にして加重平均したものです。定義は data/score.js にあります。</p>";
  var m = modal("駅ランキング 全" + all.length + "駅", html);
  var rev = false;
  function render() {
    var q = ($("#rk-q", m).value || "").trim();
    var list = all.filter(function (x) {
      return !q || x.s.n.indexOf(q) >= 0 || (x.s.k && x.s.k.indexOf(q) >= 0); });
    if (rev) list = list.slice().reverse();
    $("#rk-list", m).innerHTML = list.map(function (x) {
      var lines = (x.s.ls || []).slice(0, 6).map(function (L) {
        return RG.lineBadge ? RG.lineBadge(L) : ""; }).join("");
      var more = (x.s.ls || []).length > 6 ? '<span class="rk__more">+' + ((x.s.ls || []).length - 6) + "</span>" : "";
      return '<button class="rk__r' + (x.s.id === focusId ? " on" : "") + '" type="button" data-st="' + esc(x.s.id) + '">' +
        '<span class="rk__i">' + x.rank + "</span>" +
        '<span class="rk__nm">' + esc(x.s.n) + '<i>' + ((x.s.ls || []).length) + "路線</i></span>" +
        '<span class="rk__lb">' + lines + more + "</span>" +
        '<span class="rk__sc"><i style="width:' + x.total + '%"></i><b>' + x.total + "</b></span></button>";
    }).join("");
    $$(".rk__r", m).forEach(function (b) {
      b.addEventListener("click", function () { RG.closeModal(); RG.openStation(b.dataset.st); });
    });
    var cur = m.querySelector(".rk__r.on");
    if (cur) cur.scrollIntoView({ block: "center" });
  }
  $("#rk-q", m).addEventListener("input", render);
  $("#rk-rev", m).addEventListener("click", function () {
    rev = !rev; this.textContent = rev ? "上位から見る ⇅" : "下位から見る ⇅"; render(); });
  render();
};

/* ランドマーク（駅以外の目印）のカード */
RG.showLandmark = function (L) {
  // 同じ場所がスポット一覧にあれば、そちらの厚いデータで見せる
  var same = (RG.MAPPOI || []).filter(function (p) { return p.n === L.n; })[0];
  if (same) { RG.showSpot(same); return; }
  var gid = (RG.GENRES || []).some(function (g) { return g.id === L.c; }) ? L.c : "spot";
  RG.showSpot({
    i: L.id, n: L.n, la: L.la, lo: L.lo, g: gid,
    s: L.s || (L.rank ? (L.rank <= 30 ? 4.5 : 4.0) : 4.0),
    t: L.t || L.cl || "", img: L.img || null, sl: L.sl || null,
    note: L.note || null, url: L.wp || null, ad: L.ad || null,
    e: L.e || L.emoji, be: L.e || L.emoji, own: 1, srcNote: L.src
  });
};

/* ----------------------------------------------------------- パレート図 */
function pareto(r) {
  var os = r.options.filter(function (o) { return !o.stopped; });
  if (!os.length) return "";
  var W = 100, H = 60, ml = 14, mb = 10, mt = 5, mr = 4;
  var maxT = Math.max.apply(null, os.map(function (o) { return o.minutes; })) * 1.12 || 1;
  var maxY = Math.max.apply(null, os.map(function (o) { return o.yen; })) * 1.12 || 1;
  var X = function (t) { return ml + t / maxT * (W - ml - mr); };
  var Y = function (v) { return H - mb - v / maxY * (H - mb - mt); };
  var g = "";
  for (var i = 1; i <= 3; i++) {
    var gy = Y(maxY * i / 3), gx = X(maxT * i / 3);
    g += '<line x1="' + ml + '" y1="' + gy + '" x2="' + (W - mr) + '" y2="' + gy + '" stroke="#E6E6E6" stroke-width=".3"/>' +
         '<text x="' + (ml - 1.5) + '" y="' + (gy + 1.2) + '" font-size="2.5" fill="#626264" text-anchor="end">' +
         Math.round(maxY * i / 3 / 100) * 100 + "</text>" +
         '<line x1="' + gx + '" y1="' + mt + '" x2="' + gx + '" y2="' + (H - mb) + '" stroke="#E6E6E6" stroke-width=".3"/>' +
         '<text x="' + gx + '" y="' + (H - mb + 4) + '" font-size="2.5" fill="#626264" text-anchor="middle">' +
         Math.round(maxT * i / 3) + "分</text>";
  }
  var pf = os.filter(function (o) { return o.pareto; }).sort(function (a, b) { return a.minutes - b.minutes; });
  var path = pf.map(function (o, k) { return (k ? "L" : "M") + X(o.minutes) + " " + Y(o.yen); }).join(" ");
  var dots = os.map(function (o) {
    var k = r.options.indexOf(o);
    return '<g class="pt' + (o.pareto ? " pf" : "") + '" data-i="' + k + '" tabindex="0" role="button" aria-label="' +
      esc(o.m.label) + " " + o.minutes + "分 " + o.yen + '円"><circle cx="' + X(o.minutes) + '" cy="' + Y(o.yen) +
      '" r="' + (o.pareto ? 2.5 : 1.8) + '" fill="' + o.m.color + '" stroke="#fff" stroke-width=".7"/>' +
      '<text x="' + X(o.minutes) + '" y="' + (Y(o.yen) - 3.3) + '" font-size="2.9" text-anchor="middle">' +
      o.m.emoji + "</text></g>";
  }).join("");
  return '<div class="chartwrap"><svg viewBox="0 0 ' + W + " " + H + '" class="pareto" role="img" ' +
    'aria-label="所要時間と費用の比較"><text x="' + ml + '" y="' + (mt + 2.4) + '" font-size="2.6" fill="#626264">円</text>' +
    g + (path ? '<path d="' + path + '" fill="none" stroke="#0055AD" stroke-width=".6" stroke-dasharray="1.6 1.2" opacity=".75"/>' : "") +
    dots + '</svg><p class="chartnote">青い破線＝<b>パレート最適</b>。それより速くて安い手段が無い選択肢です。' +
    "線より上の点は、時間でも費用でも他に負けています。</p></div>";
}

function optCard(o, i, ctx) {
  var b = [];
  if (o.stopped) b.push('<span class="ob ob--stop">いまは運休の時間帯</span>');
  if (o.pareto) b.push('<span class="ob ob--pf">パレート最適</span>');
  if (o.kicker) b.push('<span class="ob ob--kick">' + esc(o.kicker) + "</span>");
  if (o.yenPerMin != null) b.push('<span class="ob">最安より' + o.vsCheapest.min + "分速い／+" +
    yen(o.vsCheapest.yen) + "（1分 " + yen(o.yenPerMin) + "）</span>");
  else if (o.vsCheapest && o.vsCheapest.yen === 0) b.push('<span class="ob ob--cheap">最安</span>');
  b.push('<span class="ob ob--conf">確信度 ' + esc(o.conf || (o.m && o.m.conf) || "—") + "</span>");
  var pc = RG.partyCost ? RG.partyCost(o, RG.Plan.adults, RG.Plan.kids) : o.yen;
  var head = RG.Plan.adults + RG.Plan.kids;
  return '<div class="opt' + (o.stopped ? " opt--stop" : "") + '" data-i="' + i + '" style="--c:' + o.m.color + '">' +
    '<div class="opt__hd"><span class="opt__em">' + o.m.emoji + '</span><b>' + esc(o.m.label) + "</b>" +
    '<span class="opt__t">' + o.minutes + "<i>分</i></span><span class=\"opt__y\">" + yen(o.yen) +
    (head > 1 ? '<i class="opt__party">' + head + "人 " + yen(pc) + "</i>" : "") + "</span></div>" +
    '<div class="opt__bar"><i style="width:' + Math.min(100, o.minutes / 120 * 100) + '%"></i></div>' +
    '<div class="opt__badges">' + b.join("") + "</div>" +
    '<ul class="opt__d">' + (o.detail || []).map(function (d) { return "<li>" + esc(d) + "</li>"; }).join("") + "</ul>" +
    (o.rail ? '<div class="opt__live" data-live-lines="' + esc((o.rail.lines || []).join("|")) + '">' +
       '<span class="lvh">🚦 運行情報</span><span class="lvt">しらべています…</span></div>' : "") +
    (/bike/.test(o.id) ? '<div class="opt__live" data-live-bike="1"></div>' : "") +
    (o.stopped ? "" :
      '<div class="opt__acts">' +
        '<button class="opt__b" type="button" data-add="' + i + '">🧳 リストに追加</button>' +
        '<button class="opt__b opt__b--nav" type="button" data-nav="' + i + '">🧭 この道で案内</button>' +
        (ctx && ctx.to ? RG.mapButtons(ctx.from, ctx.to, o.id, "") : "") +
      "</div>") +
    "</div>";
}

function showRoutes(destId) {
  if (!Trip.origin) { status("先に出発地を決めてください（📍現在地、または駅カードの「ここから出発」）", "warn"); return; }
  var s = RG.byId[destId]; if (!s) return;
  var r = RG.Planner.estimate(Trip.origin, [s.la, s.lo], Trip.when, Trip.aggr);
  var kl = { day: "日中", peak: "ラッシュ", night: "深夜・早朝" }[r.hourKind];
  var head = '<div class="rt__hd"><div><b>' + esc(Trip.label) + "</b> → <b>" + esc(s.n) + "駅</b></div>" +
    '<div class="rt__meta">' + (r.at.getMonth() + 1) + "/" + r.at.getDate() + " " + hhmm(r.at) +
    " 発（" + kl + "）／直線 " + r.straightKm.toFixed(1) + "km／" +
    RG.CONFIG.aggr[r.aggr].emoji + RG.CONFIG.aggr[r.aggr].label + "</div></div>";
  var night = r.night ? '<div class="nightbar">🌙 <b>終電後の時間帯です。</b>始発（' +
    RG.CONFIG.service.firstTrain + "ごろ）まであと " + r.toFirstTrain + " 分。" +
    "電車の案は成立しないものとして下に降ろし、代わりに<b>組み合わせ案</b>を上位に出しています。</div>" : "";
  var ctx = { from: Trip.origin, to: [s.la, s.lo] };
  // 並び替え（既定＝おすすめ順／早い順／安い順）
  var SORTS = { rec: "おすすめ順", time: "早い順", yen: "安い順" };
  var sortKey = RG.routeSort || "rec";
  var base = r.options.slice();
  base.forEach(function (o, i) { o.__i = i; });
  var head3 = RG.Plan.adults + RG.Plan.kids;
  function partyOf(o) { return RG.partyCost ? RG.partyCost(o, RG.Plan.adults, RG.Plan.kids) : o.yen; }
  if (sortKey === "time") base.sort(function (a, b) {
    return (a.stopped ? 1 : 0) - (b.stopped ? 1 : 0) || a.minutes - b.minutes || partyOf(a) - partyOf(b); });
  else if (sortKey === "yen") base.sort(function (a, b) {
    return (a.stopped ? 1 : 0) - (b.stopped ? 1 : 0) || partyOf(a) - partyOf(b) || a.minutes - b.minutes; });
  var sortBar = '<div class="sortbar"><span class="sortbar__l">並び替え</span>' +
    Object.keys(SORTS).map(function (k) {
      return '<button class="sortbar__b" type="button" data-sort="' + k + '" aria-pressed="' +
        (k === sortKey) + '">' + (k === "time" ? "⚡ " : k === "yen" ? "💴 " : "⭐ ") + SORTS[k] + "</button>";
    }).join("") + "</div>";
  var head2 = RG.Plan.adults + RG.Plan.kids;
  var party = '<div class="party"><span>人数</span>' +
    '<label>大人 <input id="pt-a" type="number" min="0" max="20" value="' + RG.Plan.adults + '"></label>' +
    '<label>子ども <input id="pt-k" type="number" min="0" max="20" value="' + RG.Plan.kids + '"></label>' +
    '<span class="party__n">' + head2 + "人ぶんの合計も表示します</span></div>";
  var html = head + night + party + pareto(r) + sortBar +
    '<div class="opts">' + base.map(function (o) { return optCard(o, o.__i, ctx); }).join("") + "</div>" +
    '<div class="disclaim">⚠ これはモデルによる<b>概算</b>です。時刻表・道路状況・バス系統は見ていません。' +
    "電車の案に付く🚦運行情報と、東京駅周辺のシェアサイクルの台数だけは公共交通オープンデータセンター（ODPT）から" +
    "取得したもので、取得時刻を添えています（取れないときは「取得できませんでした」）。" +
    "前提の数字はすべて <code>data/config.js</code> にあります。移動前に各事業者の公式情報で必ず確認してください。</div>";
  var m = modal("移動手段をくらべる", html);
  if (RG.Live && RG.Live.decorateRoutes) RG.Live.decorateRoutes(m, r, ctx);
  $("#pt-a", m).addEventListener("change", function () {
    RG.Plan.adults = Math.max(0, +this.value || 0); showRoutes(destId); });
  $("#pt-k", m).addEventListener("change", function () {
    RG.Plan.kids = Math.max(0, +this.value || 0); showRoutes(destId); });
  $$("[data-nav]", m).forEach(function (b) {
    b.addEventListener("click", function () {
      RG.Nav.destId = s.id;
      RG.closeModal();
      RG.startNav([s.la, s.lo], s.n + "駅", r.options[+b.dataset.nav]);
    });
  });
  $$("[data-sort]", m).forEach(function (b) {
    b.addEventListener("click", function () { RG.routeSort = b.dataset.sort; showRoutes(destId); });
  });
  $$("[data-add]", m).forEach(function (b) {
    b.addEventListener("click", function () {
      RG.addRouteToPlan(r.options[+b.dataset.add], r, Trip.label, s.n + "駅", s.id);
      b.textContent = "✓ 追加ずみ"; b.disabled = true;
    });
  });
  $$(".pt", m).forEach(function (g) {
    var i = g.dataset.i;
    function on() {
      $$(".opt", m).forEach(function (c) { c.classList.remove("hi"); });
      var c = m.querySelector('.opt[data-i="' + i + '"]');
      if (c) { c.classList.add("hi"); c.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
    }
    g.addEventListener("mouseenter", on); g.addEventListener("click", on); g.addEventListener("focus", on);
  });
}
RG.showRoutes = showRoutes;

/* --------------------------------------------------------- 行き先さがし */
function openDiscover() {
  if (!Trip.origin) { status("先に出発地を決めてください", "warn"); return; }
  var moods = RG.CONFIG.moods;
  var html = '<div class="dc__ctl"><label>ここから <select id="dc-budget">' +
    [15, 30, 45, 60, 90, 120].map(function (v) {
      return '<option value="' + v + '"' + (v === 30 ? " selected" : "") + ">" + v + "分以内</option>"; }).join("") +
    "</select> で行けるところ</label>" +
    '<div class="dc__moods">' + moods.map(function (m) {
      return '<button class="chip" type="button" data-mood="' + m.id + '" aria-pressed="false">' +
        m.emoji + " " + esc(m.label) + "</button>"; }).join("") + "</div></div>" +
    '<div id="dc-list" class="dc__list"></div>';
  var m = modal("行き先をさがす", html), sel = [];
  $$("[data-mood]", m).forEach(function (b) {
    b.addEventListener("click", function () {
      var i = sel.indexOf(b.dataset.mood);
      if (i >= 0) sel.splice(i, 1); else sel.push(b.dataset.mood);
      b.setAttribute("aria-pressed", String(i < 0)); run();
    });
  });
  $("#dc-budget", m).addEventListener("change", run);
  run();
  function run() {
    var budget = +$("#dc-budget", m).value;
    var list = RG.Planner.discover(Trip.origin, Trip.when, budget, sel, Trip.aggr).slice(0, 30);
    $("#dc-list", m).innerHTML = list.length ? list.map(function (x) {
      return '<button class="dc__item" type="button" data-id="' + esc(x.id) + '">' +
        '<span class="dc__n">' + esc(x.name) + "</span>" +
        '<span class="dc__t">約' + x.minutes + "分" + (x.yen ? " / " + yen(x.yen) : "") + "</span>" +
        '<span class="dc__tags">' + x.tags.map(function (t) {
          var mm = moods.filter(function (z) { return z.id === t; })[0];
          return mm ? '<span class="dc__tag">' + mm.emoji + " " + esc(mm.label) + "</span>" : ""; }).join("") +
        "</span></button>"; }).join("")
      : '<p class="dc__empty">条件に合う駅が見つかりません。時間を延ばすか、タグを外してみてください。</p>';
    $$(".dc__item", m).forEach(function (b) {
      b.addEventListener("click", function () { RG.closeModal(); RG.openStation(b.dataset.id); });
    });
    RG.paintPick(list.map(function (x) { return x.id; }));
  }
}

/* ------------------------------------------------------- 深夜レスキュー */
function openRescue() {
  if (!Trip.origin) { status("先に出発地を決めてください（いまいる場所）", "warn"); return; }
  var P = RG.Planner, wait = P.minutesToFirstTrain(Trip.when);
  var html =
    '<div class="rs__lead">いまは <b>' + hhmm(Trip.when) + "</b>。始発（" + RG.CONFIG.service.firstTrain +
    "ごろ）まで <b>" + wait + " 分</b>あります。<br>" +
    "予算をずらすと、<b>タクシーでどこまで行けて、そこから何分歩く／漕ぐことになるか</b>が変わります。</div>" +
    '<div class="rs__ctl"><label>タクシーに出せる予算 <output id="rs-out">3,000円</output>' +
    '<input id="rs-budget" type="range" min="500" max="15000" step="500" value="3000"></label></div>' +
    '<div id="rs-body"></div>' +
    '<div class="disclaim">⚠ 終電・始発の時刻は<b>概算</b>（' + RG.CONFIG.service.lastTrain + "／" +
    RG.CONFIG.service.firstTrain + "）です。駅・路線ごとの実際の時刻は各社の時刻表で必ず確認してください。" +
    "深夜の徒歩・自転車は、明るい道を選び、無理をしないこと。</div>";
  var m = modal("🌙 終電を逃した — 深夜レスキュー", html);
  var slider = $("#rs-budget", m);
  slider.addEventListener("input", run); run();

  function run() {
    var budget = +slider.value;
    $("#rs-out", m).textContent = budget.toLocaleString("ja-JP") + "円";
    var reach = P.taxiBudgetReach(Trip.origin, Trip.when, budget);
    var W = RG.CONFIG.modes.walk, B = RG.CONFIG.modes.bike, A = RG.CONFIG.aggr[Trip.aggr];
    var walkKm = A.walkMaxMin / 60 * W.speed / RG.CONFIG.detour.walk;
    var bikeKm = A.bikeKm;

    // タクシーで行ける駅のうち、そこから徒歩／自転車で更に遠くへ行ける「前線」を出す
    var rows = reach.stations.slice(0, 40).map(function (x) {
      var s = RG.byId[x.id];
      var wmin = 0;
      return { s: s, km: x.km };
    });
    var far = rows.slice(0, 12);

    // 徒歩だけ／自転車だけの到達圏
    function circle(km, mode) {
      var out = [];
      RG.NET.stations.forEach(function (s) {
        var d = RG.hav(Trip.origin, [s.la, s.lo]);
        if (d <= km) out.push({ s: s, km: d });
      });
      out.sort(function (a, b) { return b.km - a.km; });
      return out;
    }
    var wc = circle(walkKm), bc = circle(bikeKm);

    $("#rs-body", m).innerHTML =
      '<div class="rs__grid">' +
        rsCard("🚕", "タクシー " + budget.toLocaleString("ja-JP") + "円",
          reach.reachKm.toFixed(1) + " km 圏", reach.stations.length + " 駅が射程内",
          far.slice(0, 6).map(function (x) { return x.s.n; }).join("・") || "射程内に駅なし", "#FE3939") +
        rsCard("🚲", "シェアサイクル", bikeKm + " km 圏", bc.length + " 駅",
          bc.slice(0, 6).map(function (x) { return x.s.n; }).join("・") || "—", "#0055AD") +
        rsCard("🚶", "歩ける限界（" + A.walkMaxMin + "分）", walkKm.toFixed(1) + " km 圏", wc.length + " 駅",
          wc.slice(0, 6).map(function (x) { return x.s.n; }).join("・") || "—", "#197A4B") +
        rsCard("🌅", "始発を待つ", "あと " + wait + " 分", "0円で全線が復活",
          "待てるなら、これがいちばん安い", "#A58000") +
      "</div>" +
      '<p class="rs__hint">行き先の駅をタップして「🧭 ここへ行く」を押すと、' +
      "この時刻での具体的な組み合わせ案（タクシー◯%＋徒歩、など）が出ます。</p>";
    RG.paintPick(reach.stations.map(function (x) { return x.id; }));
  }
  function rsCard(em, t, big, sub, list, c) {
    return '<div class="rs__c" style="--c:' + c + '"><div class="rs__t">' + em + " " + esc(t) + "</div>" +
      '<div class="rs__big">' + esc(big) + '</div><div class="rs__sub">' + esc(sub) + "</div>" +
      '<div class="rs__list">' + esc(list) + "</div></div>";
  }
}

RG.initPlannerUI = function () { initBar(); };

})(window.RG);
