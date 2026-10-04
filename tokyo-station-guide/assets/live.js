/* =========================================================================
   いまの状況（運行情報・バス・シェアサイクル） ―― 公共交通オープンデータセンター（ODPT）
   ・鉄道の運行情報（odpt:TrainInformation）を比較ビューと駅カードに重ねる
   ・東京駅周辺のバス停（odpt:BusstopPole）と走っているバス（odpt:Bus）
   ・東京駅周辺のシェアサイクルのポート（GBFS・キー不要）
   決まり：
   ・動くデータには必ず「取得時刻」を付ける。期限が切れたキャッシュは現在値として出さない
   ・取れなかったときは「取得できませんでした」。平常や空きありとは言わない
   ・API キーはソースに書かない（acl:consumerKey=ACL_CONSUMERKEY はプレースホルダ）。ログにも出さない
   ・取れない路線は「運行情報なし」として、行き方の案は消さない
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc;
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
var L = {}; RG.Live = L;

function cfg() { return RG.ODPT || null; }
function pad(n) { return (n < 10 ? "0" : "") + n; }
function hhmm(ms) { var d = new Date(ms); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
function ja(v) {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {                       // GBFS 3.0: [{text, language}]
    var hit = v.filter(function (x) { return x && x.language === "ja"; })[0] || v[0];
    return hit ? (hit.text || "") : "";
  }
  return v.ja || v.en || "";
}
/* GBFS の時刻：2.x は UNIX 秒、3.0 は RFC3339 文字列 */
function ts(v) {
  if (v == null) return null;
  if (typeof v === "number") return v < 1e12 ? v * 1000 : v;
  if (/^\d+$/.test(v)) return +v < 1e12 ? +v * 1000 : +v;
  var d = Date.parse(v); return isNaN(d) ? null : d;
}
function tail(id) { return String(id || "").split(":").pop(); }
function haveMap() { return !!(cfg() && cfg().rail); }

/* ------------------------------------------------------------- API キー */
var KEY_LS = "rg_odpt_key";
function getKey() {
  try { var k = localStorage.getItem(KEY_LS); if (k) return k; } catch (e) {}
  return RG.ODPT_KEY || "";
}
L.hasKey = function () { return !!getKey(); };
L.setKey = function (k) {
  k = (k || "").trim();
  try { if (k) localStorage.setItem(KEY_LS, k); else localStorage.removeItem(KEY_LS); } catch (e) {}
  mem = {};                                   // キーが変わったので取り直す
};

/* ----------------------------------------------------------- 取得の土台 */
/* URL からキーを消してから使う（ログ・エラー表示用） */
function safeUrl(u) { return String(u).replace(/acl:consumerKey=[^&]*/g, "acl:consumerKey=ACL_CONSUMERKEY"); }
function withKey(url, key) {
  if (!key) return url;
  var p = cfg().endpoints.keyParam.replace("ACL_CONSUMERKEY", encodeURIComponent(key));
  return url + (url.indexOf("?") >= 0 ? "&" : "?") + p;
}
function fetchJson(url, timeoutMs) {
  timeoutMs = timeoutMs || 12000;
  return new Promise(function (res, rej) {
    var done = false;
    function fail(msg) { if (done) return; done = true; rej(new Error(msg)); }
    var timer = setTimeout(function () { fail("時間切れ"); if (ctrl) try { ctrl.abort(); } catch (e) {} }, timeoutMs);
    var ctrl = window.AbortController ? new AbortController() : null;
    if (window.fetch) {
      fetch(url, { signal: ctrl ? ctrl.signal : undefined, credentials: "omit" }).then(function (r) {
        if (!r.ok) { clearTimeout(timer); fail("HTTP " + r.status); return null; }
        return r.json();
      }).then(function (j) {
        if (j === null) return;
        clearTimeout(timer); if (!done) { done = true; res(j); }
      }).catch(function (e) { clearTimeout(timer); fail(e && e.name === "AbortError" ? "時間切れ" : "通信エラー"); });
      return;
    }
    var x = new XMLHttpRequest();
    x.open("GET", url, true); x.timeout = timeoutMs;
    x.onload = function () {
      clearTimeout(timer);
      if (x.status < 200 || x.status >= 300) { fail("HTTP " + x.status); return; }
      try { res(JSON.parse(x.responseText)); done = true; } catch (e) { fail("JSON が読めません"); }
    };
    x.onerror = function () { clearTimeout(timer); fail("通信エラー"); };
    x.ontimeout = function () { clearTimeout(timer); fail("時間切れ"); };
    x.send();
  });
}
/* 公開 API（キー不要）→ 失敗したらキー付き API（キーがある端末だけ）の順で試す */
function odptGet(path) {
  var E = cfg().endpoints, key = getKey();
  return fetchJson(E["public"] + path).then(function (j) {
    if (Array.isArray(j)) return j;
    throw new Error("形式が違います");
  }).catch(function (e1) {
    if (!key) throw e1;
    return fetchJson(withKey(E.keyed + path, key)).then(function (j) {
      if (Array.isArray(j)) return j;
      throw new Error("形式が違います");
    });
  });
}

/* キャッシュ：mem はこのページの間だけ。persist を付けたものは端末にも残す（位置など、変わりにくいもの） */
var mem = {}, inflight = {};
function fresh(k, ttl) { var c = mem[k]; return (c && Date.now() - c.t < ttl) ? c : null; }
function store(k, data, persist) {
  var c = { t: Date.now(), data: data }; mem[k] = c;
  if (persist) try { localStorage.setItem("rg_live_" + k, JSON.stringify(c)); } catch (e) {}
  return c;
}
function restore(k, ttl) {
  try {
    var raw = localStorage.getItem("rg_live_" + k); if (!raw) return null;
    var c = JSON.parse(raw);
    if (c && Date.now() - c.t < ttl) { mem[k] = c; return c; }
  } catch (e) {}
  return null;
}
function once(k, fn) {
  if (inflight[k]) return inflight[k];
  var p = fn().then(function (v) { delete inflight[k]; return v; }, function (e) { delete inflight[k]; throw e; });
  inflight[k] = p; return p;
}
/* 「取れたか／いつか」を揃えて返す */
function okResult(c) { return { ok: true, t: c.t, data: c.data }; }
function ngResult(e, k) {
  var c = mem[k];                             // 期限切れでも「前回いつ取れたか」は見せる（現在値としては使わない）
  return { ok: false, error: (e && e.message) || "取得できませんでした", lastT: c ? c.t : null };
}
var lastError = {};
function remember(k, e) { lastError[k] = { t: Date.now(), msg: (e && e.message) || "" }; }
/* 失敗した直後（15秒以内）は同じ取得を繰り返さない。取り直すボタン（force）は別 */
function recentFail(k, force) {
  var le = lastError[k];
  return !force && le && Date.now() - le.t < 15000 ? { ok: false, error: le.msg || "取得できませんでした", lastT: mem[k] ? mem[k].t : null } : null;
}

/* ============================================================ 鉄道運行情報 */
var LEVEL = { normal: "平常", delay: "遅延", suspend: "見合わせ", other: "情報あり", none: "運行情報なし" };
L.LEVEL = LEVEL;
var RANK = { none: 0, normal: 1, other: 2, delay: 3, suspend: 4 };

/* 1レコードを「平常／遅延／見合わせ／その他」に分ける */
L.classify = function (rec) {
  var st = ja(rec["odpt:trainInformationStatus"]), tx = ja(rec["odpt:trainInformationText"]);
  var level;
  if (!st) level = /見合わせ|運休|運転を?中止/.test(tx) ? "suspend" : "normal";   // 状態が無ければ平常（JR東日本など）
  else if (/直通運転(を)?中止/.test(st)) level = "other";
  else if (/見合わせ|運休|運転を?中止|不通/.test(st)) level = "suspend";
  else if (/遅延|遅れ|ダイヤ乱れ|乱れ/.test(st)) level = "delay";
  else if (/平常|通常/.test(st)) level = "normal";
  else level = "other";
  return { level: level, status: st, text: tx, date: rec["dc:date"] || rec["odpt:timeOfOrigin"] || null,
           railway: rec["odpt:railway"] || null, operator: rec["odpt:operator"] || null };
};
function indexRail(list) {
  var byRailway = {}, byOperator = {};
  (list || []).forEach(function (rec) {
    if (!rec || typeof rec !== "object") return;
    var c = L.classify(rec);
    var op = tail(c.operator);
    (byOperator[op] = byOperator[op] || []).push(c);
    if (c.railway) {
      var cur = byRailway[c.railway];
      // 同じ路線に複数あれば、重いほうを残す（上下線で別レコードの事業者がある）
      if (!cur || RANK[c.level] > RANK[cur.level]) byRailway[c.railway] = c;
    }
  });
  return { byRailway: byRailway, byOperator: byOperator };
}
L.indexRail = indexRail;

L.fetchRail = function (force) {
  var k = "rail", ttl = cfg().ttl.rail;
  var c = !force && fresh(k, ttl);
  if (c) return Promise.resolve(okResult(c));
  var rf = recentFail(k, force); if (rf) return Promise.resolve(rf);
  return once(k, function () {
    return odptGet("odpt:TrainInformation").then(function (list) {
      return okResult(store(k, indexRail(list)));
    }).catch(function (e) { remember(k, e); return ngResult(e, k); });
  });
};

/* 路線名 → ODPT の路線ID 一覧 */
function idsOf(line) {
  var m = cfg().rail[line];
  if (!m) return [];
  return Array.isArray(m) ? m : [m];
}
L.idsOf = idsOf;
function railName(id, line) {
  var N = cfg().railNames || {};
  return N[id] || line;
}
/* 1路線の状況（複数系統なら系統ごと）。data は fetchRail の data */
L.statusForLine = function (line, data) {
  var ids = idsOf(line);
  if (!ids.length) return [{ level: "none", label: LEVEL.none, name: line, reason: "この路線は ODPT に対応表がありません" }];
  return ids.map(function (id) {
    var op = id.split(".")[0], name = railName(id, line);
    if (!data) return { level: "none", label: LEVEL.none, name: name, id: id };
    var rec = data.byRailway["odpt.Railway:" + id];
    if (rec) return { level: rec.level, label: rec.level === "other" ? (rec.status || LEVEL.other) : LEVEL[rec.level],
                      name: name, id: id, text: rec.text, status: rec.status, date: rec.date };
    var ops = data.byOperator[op];
    if (ops && ops.length) {
      var whole = ops.filter(function (r) { return !r.railway; })[0];
      if (whole) return { level: whole.level, label: whole.level === "other" ? (whole.status || LEVEL.other) : LEVEL[whole.level],
                          name: name, id: id, text: whole.text, status: whole.status, date: whole.date, wholeOp: true };
    }
    return { level: "none", label: LEVEL.none, name: name, id: id,
             reason: ops ? "この路線の情報が届いていません" : "この事業者の情報が取れていません" };
  });
};
function worst(items) {
  var w = "none";
  items.forEach(function (x) { if (RANK[x.level] > RANK[w]) w = x.level; });
  return w;
}
L.worst = worst;

function chip(x) {
  var tip = [x.name, x.label, x.text ? x.text : "", x.reason || ""].filter(Boolean).join(" / ");
  return '<span class="lvc lvc--' + x.level + '" title="' + esc(tip) + '">' +
    '<i></i>' + esc(x.name) + " <b>" + esc(x.label) + "</b></span>";
}
L.chip = chip;
function stamp(r, k) {
  if (r.ok) return '<span class="lvt">' + hhmm(r.t) + " 取得</span>";
  var le = lastError[k || "rail"];
  return '<span class="lvt lvt--ng">取得できませんでした' + (le ? "（" + hhmm(le.t) + "）" : "") + "</span>";
}

/* ------------------------------------------ 比較ビューの各案に重ねる */
L.decorateRoutes = function (root, result, ctx) {
  if (!root || !haveMap()) return;
  var slots = $$("[data-live-lines]", root);
  if (slots.length) {
    L.fetchRail().then(function (r) {
      slots.forEach(function (s) {
        var lines = (s.getAttribute("data-live-lines") || "").split("|").filter(Boolean);
        if (!lines.length) { s.innerHTML = '<span class="lvt">乗る路線が分かりません</span>'; return; }
        var items = [];
        lines.forEach(function (ln) { items = items.concat(L.statusForLine(ln, r.ok ? r.data : null)); });
        var w = worst(items);
        s.innerHTML = '<span class="lvh">🚦 運行情報</span>' + items.map(chip).join("") + stamp(r) +
          (!r.ok ? '<button class="lvb" type="button" data-live-retry="1">再取得</button>' : "");
        var card = s.closest ? s.closest(".opt") : null;
        if (card) {
          var bd = card.querySelector(".opt__badges");
          var old = bd && bd.querySelector(".ob--live"); if (old) old.parentNode.removeChild(old);
          if (bd && (w === "suspend" || w === "delay" || w === "other")) {
            var b = document.createElement("span");
            b.className = "ob ob--live ob--live-" + w;
            b.textContent = (w === "suspend" ? "⚠ 見合わせの路線あり" : w === "delay" ? "⚠ 遅延あり" : "ℹ 運行情報あり") +
                            "（" + hhmm(r.t) + "）";
            bd.appendChild(b);
          }
        }
      });
      $$("[data-live-retry]", root).forEach(function (b) {
        b.addEventListener("click", function () { L.fetchRail(true).then(function () { L.decorateRoutes(root, result, ctx); }); });
      });
    });
  }
  // 自転車の案：東京駅周辺なら近いポートの台数を添える
  var bikes = $$("[data-live-bike]", root);
  if (bikes.length && ctx) {
    var pts = [ctx.from, ctx.to].filter(Boolean);
    var near = pts.some(function (p) { return distM(p[0], p[1], cfg().center.la, cfg().center.lo) <= cfg().radius.cycle + 400; });
    if (!near) { bikes.forEach(function (s) { s.parentNode.removeChild(s); }); return; }
    L.ports().then(function (res) {
      bikes.forEach(function (s) {
        if (!res.info.ok) { s.innerHTML = '<span class="lvh">🚲 ポート</span><span class="lvt lvt--ng">取得できませんでした</span>'; return; }
        var html = pts.map(function (p, i) {
          var list = res.list.slice().map(function (q) { q.__d = distM(p[0], p[1], q.la, q.lo); return q; })
            .filter(function (q) { return q.__d <= 600; }).sort(function (a, b) { return a.__d - b.__d; }).slice(0, 2);
          if (!list.length) return "";
          return '<div class="lvrow"><span class="lvh">' + (i === 0 && pts.length > 1 ? "出発側" : "到着側") + "のポート</span>" +
            list.map(function (q) { return portLine(q, res.status); }).join("") + "</div>";
        }).join("");
        s.innerHTML = html ? html + stampCycle(res) : "";
      });
    });
  }
};
function portLine(q, st) {
  var v = st.ok ? st.data.by[q.key] : null;
  var n = v ? ("貸出可 <b>" + v.bikes + "</b> 台／返却可 <b>" + v.docks + "</b> 台" +
               (v.renting === false ? "・貸出停止中" : "")) : '<span class="lvt--ng">台数は取得できませんでした</span>';
  return '<span class="lvport"><em>' + esc(q.n) + "</em>" + (q.__d != null ? "（約" + Math.round(q.__d) + "m）" : "") + " " + n + "</span>";
}
function stampCycle(res) {
  return res.status.ok ? '<span class="lvt">台数 ' + hhmm(res.status.t) + " 取得</span>"
                       : '<span class="lvt lvt--ng">台数は取得できませんでした</span>';
}

/* ------------------------------------------ 駅カード */
L.decorateStation = function (root, id) {
  if (!root || !haveMap()) return;
  var host = root.querySelector('[data-live-st="' + id + '"]');
  var s = RG.byId && RG.byId[id];
  if (!host || !s) return;
  var lines = (s.ls || []).filter(function (ln) { return idsOf(ln).length; });
  var unmapped = (s.ls || []).length - lines.length;
  if (!lines.length) { host.hidden = true; return; }
  host.hidden = false;
  host.innerHTML = '<span class="lvh">🚦 運行情報</span><span class="lvt">しらべています…</span>';
  L.fetchRail().then(function (r) {
    if (!root.querySelector('[data-live-st="' + id + '"]')) return;        // すでに別の駅に切り替わっている
    var items = [];
    lines.forEach(function (ln) { items = items.concat(L.statusForLine(ln, r.ok ? r.data : null)); });
    var seen = {}, uniq = items.filter(function (x) { if (seen[x.id || x.name]) return false; seen[x.id || x.name] = 1; return true; });
    var shown = uniq.filter(function (x) { return x.level !== "none"; });
    var noneN = uniq.length - shown.length + unmapped;
    var body;
    if (!r.ok) body = '<span class="lvt lvt--ng">取得できませんでした</span>';
    else if (!shown.length) body = '<span class="lvt">この駅の路線の運行情報は届いていません</span>';
    else body = shown.map(chip).join("");
    host.innerHTML = '<span class="lvh">🚦 運行情報</span>' + body +
      (r.ok ? '<span class="lvt">' + hhmm(r.t) + " 取得</span>" : stamp(r)) +
      (noneN && r.ok ? '<span class="lvt">他 ' + noneN + " 路線・系統は運行情報なし</span>" : "") +
      '<button class="lvb" type="button" data-live-open="1">' + (r.ok ? "いまの状況 ▸" : "再取得 ▸") + "</button>";
    var b = host.querySelector("[data-live-open]");
    if (b) b.addEventListener("click", function (e) {
      e.stopPropagation();
      if (!r.ok) { L.fetchRail(true).then(function () { L.decorateStation(root, id); }); return; }
      L.open();
    });
  });
};

/* ========================================================== シェアサイクル */
function distM(la1, lo1, la2, lo2) { return RG.hav([la1, lo1], [la2, lo2]) * 1000; }
/* gbfs.json から station_information / station_status の URL を探す（GBFS 2.x の言語キー、3.x の直接形式の両方） */
L.parseGbfs = function (root) {
  var out = {};
  if (!root || !root.data) return out;
  var d = root.data, feeds = null;
  if (Array.isArray(d.feeds)) feeds = d.feeds;
  else {
    var langs = Object.keys(d);
    var pick = langs.indexOf("ja") >= 0 ? "ja" : langs.indexOf("en") >= 0 ? "en" : langs[0];
    if (pick && d[pick] && Array.isArray(d[pick].feeds)) feeds = d[pick].feeds;
  }
  (feeds || []).forEach(function (f) { if (f && f.name && f.url) out[f.name] = f.url; });
  return out;
};
function gbfsFeeds(p) {
  var k = "gbfs_" + p.id;
  var c = fresh(k, cfg().ttl.cycleInfo) || restore(k, cfg().ttl.cycleInfo);
  if (c) return Promise.resolve(c.data);
  return fetchJson(p.url).then(function (j) { var f = L.parseGbfs(j); if (!f.station_information) throw new Error("feed がありません"); store(k, f, true); return f; });
}
/* 東京駅周辺のポート（位置は1日キャッシュ） */
L.fetchCycleInfo = function (force) {
  var k = "cycle_info", ttl = cfg().ttl.cycleInfo;
  var c = !force && (fresh(k, ttl) || restore(k, ttl));
  if (c) return Promise.resolve(okResult(c));
  var rf = recentFail(k, force); if (rf) return Promise.resolve(rf);
  return once(k, function () {
    var C = cfg().center, R = cfg().radius.cycle, all = [], anyOk = false, lastE = null;
    return Promise.all(cfg().gbfs.map(function (p) {
      return gbfsFeeds(p).then(function (f) { return fetchJson(f.station_information); }).then(function (j) {
        anyOk = true;
        ((j && j.data && j.data.stations) || []).forEach(function (s) {
          if (s.lat == null || s.lon == null) return;
          var d = distM(C.la, C.lo, +s.lat, +s.lon);
          if (d > R) return;
          all.push({ key: p.id + ":" + s.station_id, sid: String(s.station_id), prov: p.id, provLabel: p.label, c: p.c,
                     n: ja(s.name) || s.short_name || ("ポート " + s.station_id), la: +s.lat, lo: +s.lon,
                     cap: s.capacity != null ? +s.capacity : null, ad: ja(s.address) || null, d: Math.round(d) });
        });
      }).catch(function (e) { lastE = e; });
    })).then(function () {
      if (!anyOk) { var e = lastE || new Error("取得できませんでした"); remember(k, e); return ngResult(e, k); }
      all.sort(function (a, b) { return a.d - b.d; });
      return okResult(store(k, all, true));
    });
  });
};
/* 台数（2分で期限切れ。端末には残さない） */
L.fetchCycleStatus = function (force) {
  var k = "cycle_status", ttl = cfg().ttl.cycleStatus;
  var c = !force && fresh(k, ttl);
  if (c) return Promise.resolve(okResult(c));
  var rf = recentFail(k, force); if (rf) return Promise.resolve(rf);
  return once(k, function () {
    var by = {}, updated = {}, anyOk = false, lastE = null;
    return Promise.all(cfg().gbfs.map(function (p) {
      return gbfsFeeds(p).then(function (f) {
        if (!f.station_status) throw new Error("status feed がありません");
        return fetchJson(f.station_status);
      }).then(function (j) {
        anyOk = true;
        if (j && j.last_updated) updated[p.id] = ts(j.last_updated);
        ((j && j.data && j.data.stations) || []).forEach(function (s) {
          by[p.id + ":" + s.station_id] = {
            bikes: s.num_bikes_available != null ? +s.num_bikes_available : (s.num_vehicles_available != null ? +s.num_vehicles_available : null),
            docks: s.num_docks_available != null ? +s.num_docks_available : null,
            renting: s.is_renting == null ? null : !!+s.is_renting,
            returning: s.is_returning == null ? null : !!+s.is_returning,
            reported: ts(s.last_reported)
          };
        });
      }).catch(function (e) { lastE = e; });
    })).then(function () {
      if (!anyOk) { var e = lastE || new Error("取得できませんでした"); remember(k, e); return ngResult(e, k); }
      return okResult(store(k, { by: by, updated: updated }));
    });
  });
};
/* 位置＋台数をまとめて */
L.ports = function (force) {
  return L.fetchCycleInfo(force).then(function (info) {
    if (!info.ok) return { info: info, status: { ok: false }, list: [] };
    return L.fetchCycleStatus(force).then(function (st) {
      return { info: info, status: st, list: info.data };
    });
  });
};

/* ================================================================== バス */
var BUSOP = { Toei: "都営バス", KeiseiBus: "京成バス", KokusaiKogyoBus: "国際興業バス", KantoBus: "関東バス",
              SeibuBus: "西武バス", TokyuBus: "東急バス", OdakyuBus: "小田急バス", KeioBus: "京王バス",
              TobuBus: "東武バス", KeikyuBus: "京急バス", NishiTokyoBus: "西東京バス", HinomaruBus: "日の丸自動車" };
function busOpName(id) { var t = tail(id); return BUSOP[t] || t; }
function patternName(id, names) {
  if (names && names[id] && names[id].n) return names[id].n;
  var parts = tail(id).split(".");            // Toei.To01.1101.1 → To01
  return parts[1] || tail(id);
}
/* 東京駅周辺のバス停（1日キャッシュ）。系統名も一緒に取る */
L.fetchBusStops = function (force) {
  var k = "bus_stops", ttl = cfg().ttl.busStops;
  var c = !force && (fresh(k, ttl) || restore(k, ttl));
  if (c) return Promise.resolve(okResult(c));
  var rf = recentFail(k, force); if (rf) return Promise.resolve(rf);
  return once(k, function () {
    var C = cfg().center, R = cfg().radius.bus;
    return odptGet("places/odpt:BusstopPole?lon=" + C.lo + "&lat=" + C.la + "&radius=" + R).then(function (list) {
      var poles = [], pats = {};
      list.forEach(function (p) {
        var la = p["geo:lat"], lo = p["geo:long"];
        if (la == null || lo == null) return;
        var ids = [].concat(p["odpt:busroutePattern"] || []);
        ids.forEach(function (x) { pats[x] = 1; });
        poles.push({ id: p["owl:sameAs"] || p["@id"], n: ja(p["dc:title"]) || ja(p["odpt:busstopPoleTitle"]) || "バス停",
                     no: p["odpt:busstopPoleNumber"] || null, la: +la, lo: +lo,
                     ops: [].concat(p["odpt:operator"] || []).map(busOpName),
                     pats: ids, d: Math.round(distM(C.la, C.lo, +la, +lo)) });
      });
      poles.sort(function (a, b) { return a.d - b.d; });
      var ids = Object.keys(pats).slice(0, 80);
      if (!ids.length) return { poles: poles, names: {} };
      // 系統の名前と停留所の順番（「あと何停留所か」を出すのに使う）
      return odptGet("odpt:BusroutePattern?owl:sameAs=" + encodeURIComponent(ids.join(","))).then(function (ps) {
        var names = {};
        ps.forEach(function (q) {
          var order = {};
          (q["odpt:busstopPoleOrder"] || []).forEach(function (o) { order[o["odpt:busstopPole"]] = +o["odpt:index"]; });
          names[q["owl:sameAs"]] = { n: ja(q["dc:title"]) || "", note: ja(q["odpt:note"]) || "", dir: q["odpt:direction"] || "", order: order };
        });
        return { poles: poles, names: names };
      }).catch(function () { return { poles: poles, names: {} }; });
    }).then(function (data) {
      return okResult(store(k, data, true));
    }).catch(function (e) { remember(k, e); return ngResult(e, k); });
  });
};
/* いま走っているバス（指定した系統だけ） */
L.fetchBuses = function (patternIds) {
  var ids = (patternIds || []).slice(0, 12);
  if (!ids.length) return Promise.resolve({ ok: true, t: Date.now(), data: [] });
  var k = "bus_" + ids.join(","), ttl = cfg().ttl.bus;
  var c = fresh(k, ttl);
  if (c) return Promise.resolve(okResult(c));
  return once(k, function () {
    return odptGet("odpt:Bus?odpt:busroutePattern=" + encodeURIComponent(ids.join(","))).then(function (list) {
      var out = list.map(function (b) {
        return { pat: b["odpt:busroutePattern"], no: b["odpt:busNumber"] || "", from: b["odpt:fromBusstopPole"] || null,
                 to: b["odpt:toBusstopPole"] || null, date: b["dc:date"] || null, occ: tail(b["odpt:occupancyStatus"] || "") };
      });
      return okResult(store(k, out));
    }).catch(function (e) { remember("bus", e); return ngResult(e, k); });
  });
};
var OCC = { EMPTY: "空いています", MANY_SEATS_AVAILABLE: "席に余裕あり", FEW_SEATS_AVAILABLE: "席は少なめ",
            STANDING_ROOM_ONLY: "立っている人あり", CRUSHED_STANDING_ROOM_ONLY: "とても混んでいます", FULL: "満員",
            ManySeatsAvailable: "席に余裕あり", FewSeatsAvailable: "席は少なめ", StandingRoomOnly: "立っている人あり",
            CrushedStandingRoomOnly: "とても混んでいます", Full: "満員", Empty: "空いています" };

/* ============================================================ 地図に載せる */
var poiReg = {};
function upsertPoi(key, make) {
  var p = poiReg[key];
  if (p) { make(p); return false; }
  p = { i: "lv:" + key, live: 1, s: 3.5, ti: 1 }; make(p);
  poiReg[key] = p;
  if (!RG.MAPPOI) RG.MAPPOI = [];
  RG.MAPPOI.push(p);
  return true;
}
function mergePois(ports, status, stops) {
  var added = false, C = cfg(), t;
  if (ports && ports.ok) {
    t = status && status.ok ? hhmm(status.t) : null;
    ports.data.forEach(function (q) {
      var v = status && status.ok ? status.data.by[q.key] : null;
      added = upsertPoi("cycle:" + q.key, function (p) {
        p.n = q.n; p.la = q.la; p.lo = q.lo; p.g = "sharecycle"; p.t = q.provLabel; p.ad = q.ad;
        p.no = v ? ("貸出可 " + v.bikes + " 台／返却可 " + v.docks + " 台" + (v.renting === false ? "・貸出停止中" : "") +
                    "（" + t + " 取得）")
                 : "台数は取得できませんでした";
        p.srcNote = "出典: 公共交通オープンデータセンター GBFS（" + q.provLabel + "）。台数は開いたときに取り直します";
      }) || added;
    });
  }
  if (stops && stops.ok) {
    stops.data.poles.forEach(function (q) {
      added = upsertPoi("bus:" + q.id, function (p) {
        p.n = q.n + (q.no ? "（" + q.no + "）" : ""); p.la = q.la; p.lo = q.lo; p.g = "busstop";
        p.t = q.ops.join("・") || "バス停";
        p.no = q.pats.length ? q.pats.map(function (x) { return patternName(x, stops.data.names); })
                 .filter(function (x, i, a) { return a.indexOf(x) === i; }).slice(0, 8).join("・") + " 系統"
             : "系統の情報なし";
        p.srcNote = "出典: 公共交通オープンデータセンター（odpt:BusstopPole）。位置は " + hhmm(stops.t) + " に取得";
      }) || added;
    });
  }
  if (added && RG.Map) {
    try {
      if (RG.Map.rebuildPOI) RG.Map.rebuildPOI();
      if (RG.resetSearchIndex) RG.resetSearchIndex();
      if (RG.rebuildRail) RG.rebuildRail();
    } catch (e) { if (window.console) console.warn("いまの状況の地図反映でつまずきました", e); }
  }
}
L.mergePois = mergePois;

/* 起動後、手が空いたら東京駅周辺のポートとバス停だけを取ってくる（1回だけ） */
var warmed = false;
L.warm = function () {
  if (warmed || !cfg()) return; warmed = true;
  L.ports().then(function (res) { mergePois(res.info, res.status, null); });
  L.fetchBusStops().then(function (st) { mergePois(null, null, st); });
};

/* ============================================================== パネル */
var panel = null, timer = null;
function noteBox() {
  var C = cfg();
  return '<div class="lvnote">' + C.notice.map(function (s) { return "<p>" + esc(s) + "</p>"; }).join("") +
    '<p><a href="' + esc(C.issues) + '" target="_blank" rel="noopener">GitHub Issues ↗</a>　' +
    '<a href="credits.html" target="_blank" rel="noopener">出典とライセンス ↗</a></p></div>';
}
function secHead(title, r, k, retryKey) {
  return '<div class="lvs__h"><b>' + title + "</b>" + (r ? stamp(r, k) : "") +
    '<button class="lvb" type="button" data-lv-reload="' + retryKey + '">↻ 取り直す</button></div>';
}
function railSection(r) {
  var C = cfg(), ops = C.operators, byOp = {};
  Object.keys(C.rail).forEach(function (line) {
    idsOf(line).forEach(function (id) {
      var op = id.split(".")[0];
      byOp[op] = byOp[op] || {};
      if (!byOp[op][id]) byOp[op][id] = { id: id, name: railName(id, line) };
    });
  });
  var body;
  if (!r.ok) {
    body = '<p class="lvng">運行情報を取得できませんでした（' + esc(r.error || "") + "）。" +
      "通信の状態を確かめて「取り直す」を押してください。この間は<b>平常とも遅延とも言えません</b>。</p>";
  } else {
    var bad = [], okOps = [];
    Object.keys(ops).forEach(function (op) {
      var rails = byOp[op]; if (!rails) return;
      var items = Object.keys(rails).map(function (id) {
        return L.statusForLine(Object.keys(C.rail).filter(function (ln) { return idsOf(ln).indexOf(id) >= 0; })[0], r.data)
          .filter(function (x) { return x.id === id; })[0];
      }).filter(Boolean);
      var hasData = items.some(function (x) { return x.level !== "none"; });
      items.forEach(function (x) { if (x.level === "delay" || x.level === "suspend" || x.level === "other") bad.push({ op: op, x: x }); });
      okOps.push({ op: op, items: items, hasData: hasData });
    });
    body = (bad.length
      ? '<div class="lvbad"><div class="lvbad__h">⚠ 乱れている路線（' + bad.length + "）</div>" + bad.map(function (b) {
          return '<div class="lvbad__i">' + chip(b.x) + '<span class="lvbad__t">' + esc(b.x.text || b.x.status || "") +
            (b.x.date ? '<i>（情報 ' + esc(String(b.x.date).replace(/^.*T(\d\d:\d\d).*$/, "$1")) + "）</i>" : "") + "</span></div>";
        }).join("") + "</div>"
      : '<p class="lvok">✅ 対応している路線に、遅延・見合わせの情報はありません（' + hhmm(r.t) + " 時点）。</p>") +
      '<details class="lvall"><summary>全路線を見る</summary>' + okOps.map(function (o) {
        return '<div class="lvop"><div class="lvop__h">' + esc(ops[o.op] || o.op) +
          (o.hasData ? "" : '<span class="lvt lvt--ng">情報が取れていません</span>') + "</div>" +
          '<div class="lvchips">' + o.items.map(chip).join("") + "</div></div>";
      }).join("") + "</details>";
  }
  return '<section class="lvs" id="lv-rail">' + secHead("🚃 鉄道の運行情報", r, "rail", "rail") + body +
    '<p class="lvsrc">出典: 公共交通オープンデータセンター（odpt:TrainInformation）。' +
    "対応表にない路線（東海道新幹線など）は「運行情報なし」になります。</p></section>";
}
function cycleSection(res) {
  var C = cfg(), info = res.info, st = res.status, body;
  if (!info.ok) body = '<p class="lvng">ポートの一覧を取得できませんでした（' + esc(info.error || "") + "）。</p>";
  else if (!res.list.length) body = '<p class="lvok">' + C.center.label + "から約" + C.radius.cycle + "m にポートが見つかりませんでした。</p>";
  else {
    body = '<div class="lvports">' + res.list.slice(0, 40).map(function (q) {
      var v = st.ok ? st.data.by[q.key] : null;
      return '<div class="lvp" style="--c:' + q.c + '"><div class="lvp__h"><b>' + esc(q.n) + "</b>" +
        '<span class="lvp__d">' + q.d + "m・" + esc(q.provLabel) + "</span></div>" +
        (v ? '<div class="lvp__n"><span>🚲 貸出可 <b>' + (v.bikes == null ? "—" : v.bikes) + "</b> 台</span>" +
             "<span>🅿️ 返却可 <b>" + (v.docks == null ? "—" : v.docks) + "</b> 台</span>" +
             (v.renting === false ? '<span class="lvt--ng">貸出停止中</span>' : "") + "</div>"
           : '<div class="lvp__n lvt--ng">台数は取得できませんでした</div>') +
        '<button class="lvb" type="button" data-lv-go="' + q.la + "," + q.lo + '">地図で見る</button></div>';
    }).join("") + "</div>" + (res.list.length > 40 ? '<p class="lvt">近い順に 40 か所まで表示</p>' : "");
  }
  var head = secHead("🚲 シェアサイクル（" + C.center.label + "周辺 約" + C.radius.cycle + "m）", st.ok ? st : info, "cycle_status", "cycle");
  return '<section class="lvs" id="lv-cycle">' + head + body +
    '<p class="lvsrc">出典: 公共交通オープンデータセンター GBFS（キー不要の公開URL）。台数は約2分で期限切れになり、取り直すまで現在値としては出しません。</p></section>';
}
function busSection(r, bus) {
  var C = cfg(), body;
  if (!r.ok) body = '<p class="lvng">バス停の一覧を取得できませんでした（' + esc(r.error || "") + "）。" +
    (L.hasKey() ? "" : "公開 API にバスのデータが無い場合は、ODPT の API キーが必要です（下の「API キー」）。") + "</p>";
  else if (!r.data.poles.length) body = '<p class="lvok">' + C.center.label + "から約" + C.radius.bus + "m にバス停が見つかりませんでした。</p>";
  else {
    body = '<div class="lvstops">' + r.data.poles.slice(0, 40).map(function (q, i) {
      var pats = q.pats.map(function (x) { return patternName(x, r.data.names); })
        .filter(function (x, k, a) { return a.indexOf(x) === k; });
      var open = bus && bus.poleId === q.id;
      return '<div class="lvst' + (open ? " open" : "") + '"><div class="lvst__h"><b>' + esc(q.n) + "</b>" +
        (q.no ? '<span class="lvst__no">' + esc(q.no) + "</span>" : "") +
        '<span class="lvp__d">' + q.d + "m・" + esc(q.ops.join("・") || "—") + "</span></div>" +
        '<div class="lvst__p">' + (pats.length ? pats.map(function (x) { return '<span class="lvtag">' + esc(x) + "</span>"; }).join("") : '<span class="lvt">系統の情報なし</span>') + "</div>" +
        '<div class="lvst__a">' +
          (q.pats.length ? '<button class="lvb" type="button" data-lv-bus="' + i + '">🚌 いま走っているバス</button>' : "") +
          '<button class="lvb" type="button" data-lv-go="' + q.la + "," + q.lo + '">地図で見る</button></div>' +
        (open ? busList(q, bus, r.data.names) : "") + "</div>";
    }).join("") + "</div>";
  }
  return '<section class="lvs" id="lv-bus">' + secHead("🚏 バス（" + C.center.label + "周辺 約" + C.radius.bus + "m）", r, "bus_stops", "bus") + body +
    '<p class="lvsrc">出典: 公共交通オープンデータセンター（odpt:BusstopPole／odpt:BusroutePattern／odpt:Bus）。' +
    "走っているバスの位置は約2分で期限切れになります。</p></section>";
}
function busList(q, bus, names) {
  var r = bus.result;
  if (!r) return '<div class="lvbus"><span class="lvt">しらべています…</span></div>';
  if (!r.ok) return '<div class="lvbus"><span class="lvt lvt--ng">走っているバスを取得できませんでした（' + esc(r.error || "") + "）</span></div>";
  if (!r.data.length) return '<div class="lvbus"><span class="lvt">いま走っているバスの情報はありません（' + hhmm(r.t) + " 取得）</span></div>";
  var rows = r.data.map(function (b) {
    var nm = names[b.pat], here = nm && nm.order ? nm.order[q.id] : null, toI = nm && nm.order && b.to ? nm.order[b.to] : null;
    var where = "";
    if (here != null && toI != null) where = toI <= here ? "あと " + (here - toI + 1) + " 停留所" : "このバス停は通過ずみ";
    return '<div class="lvbus__i"><span class="lvtag">' + esc(patternName(b.pat, names)) + "</span>" +
      (b.no ? '<span class="lvt">車両 ' + esc(b.no) + "</span>" : "") +
      (where ? "<b>" + where + "</b>" : "") +
      (b.occ && OCC[b.occ] ? '<span class="lvt">' + OCC[b.occ] + "</span>" : "") +
      (b.date ? '<i class="lvt">情報 ' + esc(String(b.date).replace(/^.*T(\d\d:\d\d).*$/, "$1")) + "</i>" : "") + "</div>";
  });
  return '<div class="lvbus">' + rows.join("") + '<span class="lvt">' + hhmm(r.t) + " 取得</span></div>";
}
function keySection() {
  var has = L.hasKey();
  return '<details class="lvkey"><summary>🔑 ODPT の API キー（任意）' + (has ? "　— 設定ずみ" : "") + "</summary>" +
    "<p>公開 API（キー不要）で取れないデータがあるときだけ使います。キーは<b>この端末のブラウザにだけ</b>保存され、" +
    "サイトのファイルや GitHub には入りません。開発者登録は <a href=\"https://developer.odpt.org/\" target=\"_blank\" rel=\"noopener\">developer.odpt.org ↗</a>。</p>" +
    '<div class="set__add"><input id="lv-key" type="password" placeholder="acl:consumerKey の値" autocomplete="off"' + (has ? ' value="********"' : "") + ">" +
    '<button id="lv-key-save" class="set__b" type="button">保存</button>' +
    (has ? '<button id="lv-key-del" class="set__b2" type="button">消す</button>' : "") + "</div></details>";
}
var state = { rail: null, ports: null, stops: null, bus: null };
function render() {
  if (!panel) return;
  var bd = panel.querySelector(".modal__bd");
  if (!bd) return;
  var top = bd.scrollTop;
  bd.innerHTML = noteBox() +
    (state.rail ? railSection(state.rail) : '<section class="lvs"><div class="lvs__h"><b>🚃 鉄道の運行情報</b><span class="lvt">しらべています…</span></div></section>') +
    (state.ports ? cycleSection(state.ports) : '<section class="lvs"><div class="lvs__h"><b>🚲 シェアサイクル</b><span class="lvt">しらべています…</span></div></section>') +
    (state.stops ? busSection(state.stops, state.bus) : '<section class="lvs"><div class="lvs__h"><b>🚏 バス</b><span class="lvt">しらべています…</span></div></section>') +
    keySection() +
    '<p class="src">' + esc(cfg().source.name) + "（" + esc(cfg().source.license) + "）。表示の時刻はこの端末の時計です。</p>";
  bd.scrollTop = top;
  bind(bd);
}
function bind(bd) {
  $$("[data-lv-reload]", bd).forEach(function (b) {
    b.addEventListener("click", function () {
      var w = b.dataset.lvReload;
      if (w === "rail") { state.rail = null; render(); L.fetchRail(true).then(function (r) { state.rail = r; render(); }); }
      if (w === "cycle") { state.ports = null; render(); L.ports(true).then(function (r) { state.ports = r; mergePois(r.info, r.status, null); render(); }); }
      if (w === "bus") { state.stops = null; state.bus = null; render(); L.fetchBusStops(true).then(function (r) { state.stops = r; mergePois(null, null, r); render(); }); }
    });
  });
  $$("[data-lv-go]", bd).forEach(function (b) {
    b.addEventListener("click", function () {
      var c = b.dataset.lvGo.split(",");
      RG.closeModal(); if (RG.Map && RG.Map.gotoLatLng) RG.Map.gotoLatLng(+c[0], +c[1], 160);
    });
  });
  $$("[data-lv-bus]", bd).forEach(function (b) {
    b.addEventListener("click", function () {
      var q = state.stops.data.poles[+b.dataset.lvBus];
      if (state.bus && state.bus.poleId === q.id) { state.bus = null; render(); return; }
      state.bus = { poleId: q.id, result: null }; render();
      L.fetchBuses(q.pats).then(function (r) { if (state.bus && state.bus.poleId === q.id) { state.bus.result = r; render(); } });
    });
  });
  var ks = $("#lv-key-save", bd);
  if (ks) ks.addEventListener("click", function () {
    var v = ($("#lv-key", bd).value || "").trim();
    if (!v || v === "********") return;
    L.setKey(v); RG.tripStatus && RG.tripStatus("🔑 API キーをこの端末に保存しました。データを取り直します。", "ok", 4000);
    state = { rail: null, ports: null, stops: null, bus: null }; load(); render();
  });
  var kd = $("#lv-key-del", bd);
  if (kd) kd.addEventListener("click", function () {
    L.setKey(""); RG.tripStatus && RG.tripStatus("API キーを消しました。", "ok", 3000);
    state = { rail: null, ports: null, stops: null, bus: null }; load(); render();
  });
}
function load() {
  L.fetchRail().then(function (r) { state.rail = r; render(); });
  L.ports().then(function (r) { state.ports = r; mergePois(r.info, r.status, null); render(); });
  L.fetchBusStops().then(function (r) { state.stops = r; mergePois(null, null, r); render(); });
}
L.open = function () {
  if (!cfg()) { if (RG.tripStatus) RG.tripStatus("いまの状況のデータ定義（data/odpt_lines.js）がまだ読み込まれていません。少し待ってからもう一度押してください。", "warn"); return; }
  panel = RG.openModal("🚦 いまの状況（" + cfg().center.label + "周辺）", '<div class="lvload">しらべています…</div>');
  render(); load();
  // 開いている間だけ、期限が切れたものを静かに取り直す
  clearInterval(timer);
  timer = setInterval(function () {
    if (!panel || !panel.classList.contains("show")) { clearInterval(timer); timer = null; return; }
    L.fetchRail().then(function (r) { if (r.t !== (state.rail || {}).t) { state.rail = r; render(); } });
    L.ports().then(function (r) { if (r.status.t !== ((state.ports || {}).status || {}).t) { state.ports = r; mergePois(r.info, r.status, null); render(); } });
  }, 30000);
};

/* ヘッダのボタン */
L.init = function () {
  var b = $("#btn-live");
  if (b) b.addEventListener("click", L.open);
};

})(window.RG);
