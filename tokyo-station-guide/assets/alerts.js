/* =========================================================================
   警報バナー（レベルで絞り、確認したらすぐ消す）
   ・データは外から RG.Alerts.set(list) で渡す。list の1件：
       { id, level: "special"|"warning"|"advisory", area, title, text, url, at }
     （このリポジトリには警報の取得元はまだ無い。取得元を足すときは set() を呼ぶだけ）
   ・設定「表示する警報」：特別警報だけ／警報以上（既定）／注意報も／表示しない（端末に保存）
   ・バナーの × で閉じると、その id は既読になり二度と出ない。新しい id が来たときだけ再表示
   ・一覧を開いて「確認した」を押すと、表示中の全部が既読になる
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc;
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
var AL = {}; RG.Alerts = AL;
var LEVEL = { special: 3, warning: 2, advisory: 1 };
var LABEL = { special: "特別警報", warning: "警報", advisory: "注意報" };
AL.LEVELS = [
  { id: "special", label: "特別警報だけ" },
  { id: "warning", label: "警報以上（既定）" },
  { id: "advisory", label: "注意報も出す" },
  { id: "none", label: "表示しない" }
];
var KEY_MIN = "rg_alert_min", KEY_SEEN = "rg_alert_seen";
var list = [], seen = {};
try { (JSON.parse(localStorage.getItem(KEY_SEEN) || "[]") || []).forEach(function (id) { seen[id] = 1; }); } catch (e) {}

AL.minLevel = function () { try { return localStorage.getItem(KEY_MIN) || "warning"; } catch (e) { return "warning"; } };
AL.setMinLevel = function (v) { try { localStorage.setItem(KEY_MIN, v); } catch (e) {} render(); };
function saveSeen() {
  try { var ids = Object.keys(seen); localStorage.setItem(KEY_SEEN, JSON.stringify(ids.slice(-200))); } catch (e) {}
}
AL.markSeen = function (ids) { (ids || []).forEach(function (id) { seen[id] = 1; }); saveSeen(); render(); };
AL.resetSeen = function () { seen = {}; saveSeen(); render(); };

/* いま出すべきもの（レベルで絞り、既読は除く） */
AL.visible = function () {
  var min = AL.minLevel();
  if (min === "none") return [];
  var th = LEVEL[min] || 2;
  return list.filter(function (a) { return a && a.id && (LEVEL[a.level] || 0) >= th && !seen[a.id]; });
}
AL.set = function (items) {
  list = (items || []).filter(function (a) { return a && a.id; });
  render();
};
AL.all = function () { return list.slice(); };

function render() {
  var b = $("#alertbar"); if (!b) return;
  var v = AL.visible();
  if (!v.length) { b.hidden = true; b.innerHTML = ""; return; }
  var top = v.slice().sort(function (a, c) { return (LEVEL[c.level] || 0) - (LEVEL[a.level] || 0); })[0];
  var cls = top.level === "special" ? "alertbar--special" : top.level === "advisory" ? "alertbar--adv" : "";
  b.className = "alertbar " + cls; b.hidden = false;
  b.innerHTML = '<button class="alertbar__b" type="button" id="al-open">⚠ ' + esc(LABEL[top.level] || "警報") + " " + v.length +
    " 件（押すと一覧）</button>" +
    '<button class="alertbar__x" type="button" id="al-x" aria-label="確認して閉じる">×</button>';
  $("#al-open", b).addEventListener("click", AL.openList);
  $("#al-x", b).addEventListener("click", function () { AL.markSeen(v.map(function (a) { return a.id; })); if (RG.tripStatus) RG.tripStatus("警報を確認済みにしました。新しい警報が出たらまた出ます。", "ok", 2600); });
}
AL.render = render;

AL.openList = function () {
  var v = AL.visible(), min = AL.minLevel();
  var html = '<div class="alw">' +
    (v.length ? v.map(function (a) {
      return '<div class="alw__i alw__i--' + esc(a.level) + '"><div class="alw__h"><span class="alw__lv">' + esc(LABEL[a.level] || a.level) + "</span><b>" + esc(a.title || "") + "</b>" +
        (a.area ? '<span class="alw__a">' + esc(a.area) + "</span>" : "") + "</div>" +
        (a.text ? '<p class="alw__t">' + esc(a.text) + "</p>" : "") +
        '<div class="alw__f">' + (a.at ? '<span class="lvt">' + esc(a.at) + "</span>" : "") +
          (a.url ? '<a href="' + esc(a.url) + '" target="_blank" rel="noopener">出典 ↗</a>' : "") + "</div></div>";
    }).join("") : '<p class="set__d">いま表示する警報はありません。</p>') +
    '<div class="alw__ctl"><label>表示する警報 <select id="al-min">' + AL.LEVELS.map(function (L) {
      return '<option value="' + L.id + '"' + (L.id === min ? " selected" : "") + ">" + esc(L.label) + "</option>"; }).join("") + "</select></label>" +
      '<button class="set__b" type="button" id="al-ok">✓ 確認した（閉じる）</button></div>' +
    '<p class="src">確認した警報は、同じものが再び出ません。新しい警報が出たときだけバナーが戻ります。' +
    "設定はこの端末に保存されます。</p></div>";
  var m = RG.openModal("⚠ 警報・注意報", html);
  $("#al-min", m).addEventListener("change", function () { AL.setMinLevel(this.value); });
  $("#al-ok", m).addEventListener("click", function () { AL.markSeen(v.map(function (a) { return a.id; })); RG.closeModal(); });
};

/* 設定画面に入れる一片（lines_ui.js から呼ぶ） */
AL.settingsHtml = function () {
  var min = AL.minLevel();
  return '<div class="set__sec"><h4>⚠ 警報の表示</h4>' +
    '<p class="set__d">地図の上に出る警報バナーを、どのレベルから出すか決めます。× で閉じた警報は二度と出ません（新しい警報が出たときだけ再表示）。</p>' +
    '<div class="set__row"><span>表示する警報</span><select id="set-al-min">' + AL.LEVELS.map(function (L) {
      return '<option value="' + L.id + '"' + (L.id === min ? " selected" : "") + ">" + esc(L.label) + "</option>"; }).join("") + "</select></div>" +
    '<div class="set__btns"><button id="set-al-reset" class="set__b2" type="button">確認済みをリセット（' + Object.keys(seen).length + "件）</button></div></div>";
};
AL.bindSettings = function (m) {
  var s = $("#set-al-min", m); if (s) s.addEventListener("change", function () { AL.setMinLevel(this.value); });
  var r = $("#set-al-reset", m); if (r) r.addEventListener("click", function () { AL.resetSeen(); r.textContent = "確認済みをリセット（0件）"; });
};

})(window.RG);
