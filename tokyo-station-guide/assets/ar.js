/* =========================================================================
   簡易 AR（カメラ＋方位の矢印）
   ・案内中に「📷 AR」で開く。カメラ映像の上に、次の目印（駅・目的地）への矢印と距離を重ねる
   ・方位は DeviceOrientation（iOS は webkitCompassHeading、要・許可ダイアログ）。HTTPS が必要
   ・カメラや方位が取れないときは、その旨を出して地図に戻れるようにする（勝手に続けない）
   ・建物の認識などはしない。矢印は「おおよその方向」で、屋内や GPS 精度が悪いときは地図をすすめる
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc;
var A = {}; RG.AR = A;
var box = null, video = null, stream = null, heading = null, hdrTimer = null, last = null, lastAcc = null, listening = false;

function bearing(a, b) {
  var la1 = a[0] * Math.PI / 180, la2 = b[0] * Math.PI / 180, dlo = (b[1] - a[1]) * Math.PI / 180;
  var y = Math.sin(dlo) * Math.cos(la2), x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dlo);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
function onOrient(e) {
  var h = null;
  if (typeof e.webkitCompassHeading === "number" && !isNaN(e.webkitCompassHeading)) h = e.webkitCompassHeading;   // iOS
  else if (e.absolute === true && typeof e.alpha === "number") h = (360 - e.alpha) % 360;                    // Android（絶対方位）
  else if (e.type === "deviceorientationabsolute" && typeof e.alpha === "number") h = (360 - e.alpha) % 360;
  if (h != null) { heading = h; render(); }
}
function startOrient() {
  if (listening) return;
  listening = true;
  if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === "function") {
    DeviceOrientationEvent.requestPermission().then(function (st) {
      if (st === "granted") window.addEventListener("deviceorientation", onOrient, true);
      else note("方位センサーの許可がありません。地図で確かめてください。");
    }).catch(function () { note("方位センサーを使えませんでした。地図で確かめてください。"); });
  } else {
    if ("ondeviceorientationabsolute" in window) window.addEventListener("deviceorientationabsolute", onOrient, true);
    window.addEventListener("deviceorientation", onOrient, true);
  }
  clearTimeout(hdrTimer);
  hdrTimer = setTimeout(function () { if (heading == null) note("この端末では方位が取れないようです。矢印は出せないので、距離と目印の名前だけ出します。"); }, 6000);
}
function stopOrient() {
  window.removeEventListener("deviceorientation", onOrient, true);
  window.removeEventListener("deviceorientationabsolute", onOrient, true);
  listening = false; heading = null; clearTimeout(hdrTimer);
}
function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { note("この端末ではカメラが使えません。矢印だけ出します。"); return; }
  navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false }).then(function (s) {
    stream = s; if (video) { video.srcObject = s; video.play().catch(function () {}); }
  }).catch(function () { note("カメラを使えませんでした（許可がないか、他のアプリが使用中）。矢印だけ出します。"); });
}
function stopCamera() {
  if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
  if (video) video.srcObject = null;
}
function note(msg) { var n = box && $("#ar-note", box); if (n) { n.textContent = msg; n.hidden = !msg; } }

function render() {
  if (!box) return;
  var n = RG.Nav, wp = RG.NavUI && RG.NavUI.nextWaypoint ? RG.NavUI.nextWaypoint() : { name: n.destName, coord: n.dest };
  var here = last || n.last || RG.Trip.origin;
  var dist = here && wp.coord ? RG.hav(here, wp.coord) * 1000 : null;
  var brg = here && wp.coord ? bearing(here, wp.coord) : null;
  $("#ar-target", box).textContent = wp.name || "";
  $("#ar-dist", box).textContent = dist == null ? "—" : dist >= 1000 ? (dist / 1000).toFixed(1) + " km" : Math.round(dist) + " m";
  var arrow = $("#ar-arrow", box);
  if (heading != null && brg != null) {
    var rel = (brg - heading + 360) % 360;
    arrow.style.transform = "rotate(" + rel.toFixed(0) + "deg)";
    arrow.classList.remove("ar__arrow--na");
    $("#ar-hint", box).textContent = rel < 20 || rel > 340 ? "この向きに進む" : rel < 180 ? "右へ " + Math.round(rel) + "°" : "左へ " + Math.round(360 - rel) + "°";
  } else {
    arrow.classList.add("ar__arrow--na");
    $("#ar-hint", box).textContent = brg == null ? "現在地を待っています" : "方位を取得中…（端末を軽く8の字に動かすと取れることがあります）";
  }
  var step = $("#ar-step", box); if (step && RG.NavUI) step.textContent = RG.NavUI.nextStepText();
  var acc = lastAcc || n.lastAcc;
  $("#ar-acc", box).textContent = acc ? "GPS 精度 ±" + Math.round(acc) + "m" + (acc > 60 ? "（屋内かも。地図のほうが確実です）" : "") : "";
}

A.open = function () {
  var n = RG.Nav; if (!n || !n.on) { if (RG.tripStatus) RG.tripStatus("AR は案内中に使えます。", "warn"); return; }
  if (RG.secureOK && !RG.secureOK()) { if (RG.showGeoHelp) RG.showGeoHelp({ code: 0 }); return; }
  if (!box) {
    box = document.createElement("div"); box.className = "ar"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "AR で方向を見る");
    box.innerHTML =
      '<video class="ar__v" playsinline muted autoplay></video>' +
      '<div class="ar__top"><span class="ar__t">📷 AR ・ <b id="ar-target"></b> まで <b id="ar-dist">—</b></span>' +
        '<button class="ar__b" type="button" id="ar-close">🗺️ 地図に戻る</button></div>' +
      '<div class="ar__mid"><div class="ar__arrow ar__arrow--na" id="ar-arrow">⬆</div><div class="ar__hint" id="ar-hint"></div></div>' +
      '<div class="ar__bot"><div class="ar__step" id="ar-step"></div><div class="ar__acc" id="ar-acc"></div>' +
        '<div class="ar__note" id="ar-note" hidden></div>' +
        '<div class="ar__tools"><button class="ar__b" type="button" id="ar-detail">詳細</button>' +
        '<button class="ar__b ar__b--x" type="button" id="ar-close2">案内をやめる</button></div></div>';
    document.body.appendChild(box);
    video = $(".ar__v", box);
    $("#ar-close", box).addEventListener("click", function () { A.close(); });
    $("#ar-detail", box).addEventListener("click", function () { A.close(); if (RG.NavUI) RG.NavUI.openDetail(); });
    $("#ar-close2", box).addEventListener("click", function () { A.close(); RG.stopNav(); });
  }
  box.classList.add("show"); document.body.classList.add("ar-on");
  note(""); heading = null;
  startCamera(); startOrient(); render();
};
A.update = function (c, acc) { last = c; lastAcc = acc; if (box && box.classList.contains("show")) render(); };
A.close = function (quiet) {
  if (!box) return;
  box.classList.remove("show"); document.body.classList.remove("ar-on");
  stopCamera(); stopOrient();
  if (!quiet && RG.tripStatus) RG.tripStatus("地図に戻りました。案内は続いています。", "info", 2500);
};
A.isOpen = function () { return !!(box && box.classList.contains("show")); };
A.bearing = bearing;

})(window.RG);
