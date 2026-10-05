/* =========================================================================
   案内モード（カーナビ風のリルート提案）
   ・出発地→目的地を決めたあと「案内スタート」で現在地の追跡を始める
   ・ルートから離れたら「案内し直しますか？」と一度だけ聞く
   ・「もう聞かない」を選ぶと、その移動が終わるまで黙る
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, el = RG.el, esc = RG.esc;

var N = {
  on: false, watchId: null, dest: null, destName: "", mode: "walk",
  path: [], startedAt: 0, muted: false, offCount: 0, lastPrompt: 0,
  last: null, startKm: 0
};
RG.Nav = N;

/* 手段ごとの「外れた」と判断する距離（m）と、追跡の間隔 */
var TOL = { walk: 160, bike: 260, bus: 320, train: 500, taxi: 400, car: 400, moto: 400 };
function tolOf(m) { return TOL[m] || 300; }

/* 点と線分の距離（m）。緯度経度を平面に近似して測る */
function segDist(p, a, b) {
  var kx = 111320 * Math.cos(p[0] * Math.PI / 180), ky = 110540;
  var px = (p[1] - a[1]) * kx, py = (p[0] - a[0]) * ky;
  var bx = (b[1] - a[1]) * kx, by = (b[0] - a[0]) * ky;
  var n2 = bx * bx + by * by;
  var t = n2 ? Math.max(0, Math.min(1, (px * bx + py * by) / n2)) : 0;
  return Math.hypot(px - bx * t, py - by * t);
}
function distToPath(p, path) {
  if (!path || path.length < 2) return path && path.length === 1 ? RG.hav(p, path[0]) * 1000 : 0;
  var best = Infinity;
  for (var i = 0; i < path.length - 1; i++) {
    var d = segDist(p, path[i], path[i + 1]);
    if (d < best) best = d;
  }
  return best;
}
RG.navDistToPath = distToPath;

/* 選んだ手段のルート形状を作る（電車は駅の並び、それ以外は直線） */
function buildPath(origin, destCoord, opt) {
  if (opt && opt.rail && opt.rail.stations && opt.rail.stations.length) {
    var pts = [origin];
    opt.rail.stations.forEach(function (id) {
      var t = RG.byId[id]; if (t) pts.push([t.la, t.lo]);
    });
    pts.push(destCoord);
    return pts;
  }
  return [origin, destCoord];
}

RG.startNav = function (destCoord, destName, opt, ctx) {
  if (!navigator.geolocation) { RG.tripStatus("この端末では位置情報が使えないため、案内モードは始められません。", "warn"); return; }
  if (RG.secureOK && !RG.secureOK()) { if (RG.showGeoHelp) RG.showGeoHelp({ code: 0 }); return; }
  if (!RG.Trip.origin) { RG.tripStatus("先に出発地を決めてください。", "warn"); return; }
  stop(true);
  N.on = true; N.dest = destCoord; N.destName = destName || "目的地";
  N.mode = (opt && opt.id) || "walk";
  N.modeLabel = (opt && opt.m && opt.m.label) || "徒歩";
  N.path = buildPath(RG.Trip.origin, destCoord, opt);
  N.startedAt = Date.now(); N.muted = false; N.offCount = 0; N.lastPrompt = 0;
  N.startKm = RG.hav(RG.Trip.origin, destCoord);
  N.opt = opt || null;
  N.ctx = ctx || N.ctx || null;                 // 比較結果（候補切替・やり直し用）
  if (ctx && ctx.destId) N.destId = ctx.destId;
  bar();
  if (RG.NavUI && RG.NavUI.onStart) RG.NavUI.onStart();
  RG.tripStatus("🧭 案内をはじめました。道をそれたら教えます。", "ok", 3200);
  N.watchId = navigator.geolocation.watchPosition(onPos, onErr,
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 8000 });
};
/* 位置が一時的に取れない（トンネル・屋内・タイムアウト）だけでは案内を止めない。許可が無いときだけ止める */
function onErr(e) {
  if (e && e.code === 1) {                      // PERMISSION_DENIED
    RG.tripStatus("位置情報の許可がないため、案内を止めます。", "warn", 6000);
    stop(); return;
  }
  RG.tripStatus("現在地を取得できていません（" + esc(e && e.message || "") + "）。取れしだい続けます。", "warn", 5000);
  N.lostAt = Date.now();
}
/* 位置を1件流し込む（デバッグ・テスト用。watchPosition と同じ形） */
RG.navFeed = function (p) { onPos(p); };
function onPos(p) {
  if (!N.on) return;
  var c = [p.coords.latitude, p.coords.longitude];
  N.last = c;
  if (RG.Map.paintMe) RG.Map.paintMe(c, p.coords.accuracy);
  var off = distToPath(c, N.path);
  var rest = RG.hav(c, N.dest);
  N.lastOff = off; N.lastRest = rest; N.lastAcc = p.coords.accuracy;
  bar(off, rest, p.coords.accuracy);
  if (RG.NavUI && RG.NavUI.update) RG.NavUI.update(c, off, rest, p.coords.accuracy);
  // GPS の誤差より十分に大きいときだけ「外れた」とみなす
  var tol = Math.max(tolOf(N.mode), (p.coords.accuracy || 0) * 1.6);
  if (off > tol) N.offCount++; else N.offCount = 0;
  if (N.offCount >= 2 && !N.muted && Date.now() - N.lastPrompt > 60000) {
    N.lastPrompt = Date.now(); N.offCount = 0;
    askReroute(Math.round(off), c);
  }
}
function askReroute(offM, here) {
  var near = RG.nearestStation ? RG.nearestStation(here[0], here[1]) : null;
  var html = '<div class="nav__ask">' +
    '<p class="nav__q">いまの道は、はじめに決めたルートから <b>約' + offM + "m</b> 離れています。<br>" +
    "ここから <b>" + esc(N.destName) + "</b> まで案内し直しますか？</p>" +
    (near ? '<p class="nav__n">いまいちばん近い駅は <b>' + esc(near.t.n) + "駅</b>（約" +
      Math.round(near.km * 1000) + "m）です。</p>" : "") +
    '<div class="nav__btns">' +
      '<button id="nv-re" class="nav__b nav__b--main" type="button">🔁 ここから案内し直す</button>' +
      '<button id="nv-keep" class="nav__b" type="button">このまま進む<br><small>寄り道中ならこちら</small></button>' +
      '<button id="nv-mute" class="nav__b nav__b--mute" type="button">🔕 この移動のあいだ、もう聞かない</button>' +
    "</div></div>";
  var m = RG.openModal("🧭 ルートから外れています", html);
  $("#nv-re", m).addEventListener("click", function () {
    RG.closeModal();
    RG.setOrigin(here, "現在地（案内し直し）", null, null);
    N.path = buildPath(here, N.dest, N.opt);
    N.offCount = 0;
    RG.tripStatus("🔁 いまの場所から案内し直します。", "ok", 3000);
    if (RG.showRoutes && N.destId) RG.showRoutes(N.destId);
  });
  $("#nv-keep", m).addEventListener("click", function () { RG.closeModal(); });
  $("#nv-mute", m).addEventListener("click", function () {
    N.muted = true; RG.closeModal();
    RG.tripStatus("🔕 この移動が終わるまで、ルートのお知らせは出しません。", "info", 3600);
    bar();
  });
}
function bar(off, rest, acc) {
  var b = $("#navbar");
  if (!b) return;
  if (!N.on) { b.hidden = true; b.innerHTML = ""; return; }
  b.hidden = false;
  if (RG.NavUI && RG.NavUI.bar) { RG.NavUI.bar(b, off, rest, acc, stop); return; }   // 新しいバー（詳細・候補・AR）
  var pct = N.startKm ? Math.max(0, Math.min(100, (1 - (rest == null ? N.startKm : rest) / N.startKm) * 100)) : 0;
  b.innerHTML =
    '<div class="nav__bar">' +
      '<span class="nav__i">🧭</span>' +
      '<span class="nav__t"><b>' + esc(N.destName) + "</b> へ案内中" +
        '<i>' + esc(N.modeLabel) +
        (rest != null ? " ・ のこり約 " + rest.toFixed(1) + "km" : "") +
        (off != null ? " ・ ルートから " + Math.round(off) + "m" : "") +
        (acc ? " ・ 精度±" + Math.round(acc) + "m" : "") + "</i></span>" +
      (N.muted ? '<button class="nav__x" id="nv-unmute" type="button" title="お知らせを再開">🔕</button>' : "") +
      '<button class="nav__x" id="nv-stop" type="button">案内をやめる</button>' +
    "</div>" +
    '<div class="nav__prog"><i style="width:' + pct.toFixed(1) + '%"></i></div>';
  var st = $("#nv-stop", b); if (st) st.addEventListener("click", function () { stop(); });
  var um = $("#nv-unmute", b);
  if (um) um.addEventListener("click", function () {
    N.muted = false; RG.tripStatus("ルートのお知らせを再開しました。", "ok", 2400); bar(); });
}
function stop(quiet) {
  if (N.watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(N.watchId);
  N.watchId = null; N.on = false; N.muted = false; N.offCount = 0;
  bar();
  if (RG.NavUI && RG.NavUI.onStop) RG.NavUI.onStop();
  if (!quiet) RG.tripStatus("案内を終わりました。おつかれさまでした。", "ok", 2800);
}
RG.stopNav = stop;

})(window.RG);
