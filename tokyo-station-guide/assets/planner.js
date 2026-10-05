/* =========================================================================
   ルート推定エンジン v3
   ・726駅の鉄道ネットワークをダイクストラで探索
   ・徒歩／自転車／バス／電車／タクシー／レンタカー／レンタルバイクを横並び比較
   ・終電後は「深夜レスキュー」として組み合わせ案（タクシー＋徒歩など）を生成
   ※ すべてモデルによる概算。時刻表・道路状況・バス系統は見ていません。
   ========================================================================= */
(function (RG) {
"use strict";
var P = {}; RG.Planner = P;
var hav = RG.hav;

/* ------------------------------------------------------------ 時間帯 */
function inR(h, rs) { return rs.some(function (r) { return h >= r[0] && h < r[1]; }); }
P.hourKind = function (d) {
  var h = d.getHours(), C = RG.CONFIG.hours;
  if (inR(h, C.night)) return "night";
  if (inR(h, C.peak)) return "peak";
  return "day";
};
function hm(s) { var a = s.split(":"); return +a[0] * 60 + +a[1]; }
/* 終電後（＝電車が動いていない可能性が高い時間帯）か */
P.isAfterLastTrain = function (d) {
  var m = d.getHours() * 60 + d.getMinutes();
  var last = hm(RG.CONFIG.service.lastTrain), first = hm(RG.CONFIG.service.firstTrain);
  // 終電〜始発の「電車が動いていない窓」に入っているか
  return (last < first) ? (m >= last && m < first) : (m >= last || m < first);
};
P.minutesToFirstTrain = function (d) {
  var m = d.getHours() * 60 + d.getMinutes(), first = hm(RG.CONFIG.service.firstTrain);
  return m < first ? first - m : 24 * 60 - m + first;
};
function speedOf(mo, kind) { return (mo.speedByHour && mo.speedByHour[kind]) || mo.speed; }

/* ------------------------------------------------------------ 運賃 */
function fareKeyOf(line) {
  var F = RG.CONFIG.fares;
  for (var i = 0; i < F.operatorRule.length; i++) {
    var r = F.operatorRule[i];
    for (var j = 0; j < r.match.length; j++) if (line.indexOf(r.match[j]) >= 0) return r.fare;
  }
  return F.defaultFare;
}
function tableFare(t, km) { for (var i = 0; i < t.length; i++) if (km <= t[i][0]) return t[i][1]; return t[t.length - 1][1]; }
function taxiFare(km, date) {
  var f = RG.CONFIG.fares.taxi, y = f.baseYen;
  if (km > f.baseKm) y += Math.ceil((km - f.baseKm) * 1000 / f.stepM) * f.stepYen;
  var h = date.getHours();
  if (h >= f.lateNight.fromHour || h < f.lateNight.toHour) y = Math.round(y * f.lateNight.multiplier);
  return y;
}
function bikeFare(min, date) {
  var f = RG.CONFIG.fares.bike, p = f;
  if (f.newPlan && date >= new Date(f.newPlan.startsOn + "T00:00:00")) p = f.newPlan;
  return Math.max(1, Math.ceil(min / p.unitMin)) * p.unitYen;
}
P.taxiFare = taxiFare; P.bikeFare = bikeFare;
/* 予算 X 円でタクシーは何 km 進めるか */
P.taxiReachKm = function (budget, date) {
  var f = RG.CONFIG.fares.taxi, h = date.getHours();
  var mul = (h >= f.lateNight.fromHour || h < f.lateNight.toHour) ? f.lateNight.multiplier : 1;
  var b = budget / mul;
  if (b < f.baseYen) return 0;
  return f.baseKm + Math.floor((b - f.baseYen) / f.stepYen) * f.stepM / 1000;
};

/* ============================================================ 鉄道探索 */
function accessPoints(coord, limitMin, kmMax) {
  var w = RG.CONFIG.modes.walk, dt = RG.CONFIG.detour.walk, out = [];
  RG.NET.stations.forEach(function (s) {
    var km = hav(coord, [s.la, s.lo]);
    if (km > (kmMax || 2.5)) return;
    var wm = km * dt / w.speed * 60;
    if (wm <= limitMin) out.push({ id: s.id, min: wm, km: km * dt });
  });
  out.sort(function (a, b) { return a.min - b.min; });
  return out.slice(0, 5);
}
P.accessPoints = accessPoints;

/* 出発地からの全駅への最短所要時間（ダイクストラ 1 回）。
   戻り値 { id: {min, yen, transfers, board, prev} } */
function railField(from, date) {
  var C = RG.CONFIG, T = C.modes.train;
  var ins = accessPoints(from, 25, 3.0);
  if (!ins.length) return {};
  var dist = {}, info = {}, heap = [];
  function push(id, d) { heap.push([d, id]); }
  ins.forEach(function (i) {
    var t = i.min + T.waitMin;
    if (dist[i.id] == null || t < dist[i.id]) {
      dist[i.id] = t;
      info[i.id] = { access: i.min, km: {}, transfers: 0, board: i.id, line: null };
      push(i.id, t);
    }
  });
  var done = {};
  while (heap.length) {
    heap.sort(function (a, b) { return a[0] - b[0]; });
    var top = heap.shift(), u = top[1];
    if (done[u]) continue; done[u] = 1;
    var iu = info[u];
    RG.adj[u].forEach(function (e) {
      var line = e.line || "(不明)";
      var xfer = (iu.line && iu.line !== line) ? T.transferMin : 0;
      var nd = dist[u] + e.km / T.speedKmh * 60 + xfer;
      if (dist[e.to] == null || nd < dist[e.to]) {
        dist[e.to] = nd;
        var km = {}; for (var k in iu.km) km[k] = iu.km[k];
        var fk = fareKeyOf(line); km[fk] = (km[fk] || 0) + e.km;
        info[e.to] = { access: iu.access, km: km, transfers: iu.transfers + (xfer ? 1 : 0),
                       board: iu.board, line: line, prev: u };
        push(e.to, nd);
      }
    });
  }
  /* 乗車駅からこの駅までに通った駅の並び（{id, line}）。line は「その駅に着くときに乗っていた路線」 */
  function stopsTo(id) {
    var acc = [], cur = id, guard = 0;
    while (cur && info[cur] && guard++ < 400) { acc.push({ id: cur, line: info[cur].line || null }); cur = info[cur].prev; }
    return acc.reverse();
  }
  /* 乗車駅からこの駅まで、どの路線に乗ったか（乗った順・重複なし）。運行情報を重ねるために使う */
  function linesTo(id) {
    var seen = {}, acc = [];
    stopsTo(id).forEach(function (s) { if (s.line && !seen[s.line]) { seen[s.line] = 1; acc.push(s.line); } });
    return acc;
  }
  var out = {};
  Object.keys(dist).forEach(function (id) {
    var i = info[id], yen = 0, note = [];
    Object.keys(i.km).forEach(function (fk) {
      var f = C.fares.rail[fk], v = tableFare(f.table, i.km[fk]);
      yen += v; note.push(f.operator + " " + i.km[fk].toFixed(1) + "km → " + v + "円");
    });
    out[id] = { min: dist[id], yen: yen, transfers: i.transfers, board: i.board,
                accessMin: i.access, fareNote: note, prev: i.prev, lines: linesTo(id), stops: stopsTo(id) };
  });
  return out;
}
P.railField = railField;

function railRoute(from, to, date) {
  var field = railField(from, date);
  var outs = accessPoints(to, 25, 3.0);
  if (!outs.length) return null;
  var best = null;
  outs.forEach(function (o) {
    var f = field[o.id]; if (!f) return;
    var total = f.min + o.min;
    if (!best || total < best.minutes)
      best = { minutes: total, yen: f.yen, transfers: f.transfers, board: f.board,
               alight: o.id, accessMin: f.accessMin, egressMin: o.min, fareNote: f.fareNote,
               lines: f.lines || [], stations: (f.stops || []).map(function (x) { return x.id; }),
               legs: legsOf(f.stops || []) };
  });
  return best;
}
P.railRoute = railRoute;
/* 駅の並びを「同じ路線に乗っている区間」にまとめる → [{line, from, to, stations}] */
function legsOf(stops) {
  var legs = [];
  for (var i = 1; i < stops.length; i++) {
    var L = stops[i].line || "(不明)", last = legs[legs.length - 1];
    if (last && last.line === L) { last.to = stops[i].id; last.stations.push(stops[i].id); }
    else legs.push({ line: L, from: stops[i - 1].id, to: stops[i].id, stations: [stops[i - 1].id, stops[i].id] });
  }
  return legs;
}
P.legsOf = legsOf;

/* ======================================================= 単一手段の見積り */
function baseOptions(from, to, date, aggr) {
  var C = RG.CONFIG, kind = P.hourKind(date), st = hav(from, to), A = C.aggr[aggr], out = [];
  function push(o) { o.minutes = Math.max(1, Math.round(o.minutes)); o.yen = Math.round(o.yen); out.push(o); }

  var mw = C.modes.walk, wkm = st * C.detour.walk;
  if (st <= A.walkKm && !P.isAfterLastTrain(date)) push({ id: "walk", m: mw, minutes: wkm / mw.speed * 60, yen: 0,
    detail: ["歩く距離 約" + wkm.toFixed(1) + "km", "分速80mで計算"], conf: mw.conf });

  var mb = C.modes.bike, bkm = st * C.detour.bike;
  if (st <= A.bikeKm && !P.isAfterLastTrain(date)) {
    var bmin = bkm / mb.speed * 60 + mb.fixed;
    push({ id: "bike", m: mb, minutes: bmin, yen: bikeFare(bmin - mb.fixed / 2, date),
      detail: ["走る距離 約" + bkm.toFixed(1) + "km", mb.note,
               "⚠ ポートの位置と台数は東京駅周辺（約1km）だけ取得します。それ以外は近くにポートがあるか要確認"], conf: mb.conf });
  }

  var mbs = C.modes.bus;
  if (st >= mbs.minKm && st <= mbs.maxKm) {
    var bf = C.fares.bus, by = bf.flatYen * (kind === "night" ? bf.nightMultiplier : 1);
    push({ id: "bus", m: mbs, minutes: st * C.detour.bus / mbs.speed * 60 + mbs.fixed, yen: by,
      detail: [mbs.note, "均一運賃 " + by + "円",
               kind === "night" ? "深夜バス扱い（通常の2倍）で計算" : "",
               "⚠ 直通する系統があるかは未確認"].filter(Boolean), conf: "低" });
  }

  var r = railRoute(from, to, date);
  if (r) {
    var stopped = P.isAfterLastTrain(date);
    push({ id: "train", m: C.modes.train, minutes: r.minutes, yen: r.yen, rail: r, stopped: stopped,
      detail: [(RG.byId[r.board] ? RG.byId[r.board].n : r.board) + "駅から乗車（徒歩" +
                 Math.round(r.accessMin) + "分）",
               (RG.byId[r.alight] ? RG.byId[r.alight].n : r.alight) + "駅で下車（徒歩" +
                 Math.round(r.egressMin) + "分）",
               "乗換 " + r.transfers + " 回"].concat(r.fareNote)
        .concat(stopped ? ["🌙 いまは終電後の時間帯です。この案は始発以降でないと成立しません"] : []),
      conf: "中（運賃テーブルは要検証）" });
  }

  var mt = C.modes.taxi, tkm = st * C.detour.car;
  if (st <= mt.maxKm) push({ id: "taxi", m: mt, minutes: tkm / speedOf(mt, kind) * 60 + mt.fixed,
    yen: taxiFare(tkm, date),
    detail: ["走る距離 約" + tkm.toFixed(1) + "km",
             "初乗り500円/1.0km＋100円/232m" + (kind === "night" ? "／深夜割増2割" : ""), mt.note],
    conf: mt.conf });

  [["car", C.fares.car], ["moto", C.fares.moto]].forEach(function (pr) {
    var m = C.modes[pr[0]], fc = pr[1], km = st * C.detour.car;
    if (st > m.maxKm) return;
    push({ id: pr[0], m: m, minutes: km / speedOf(m, kind) * 60 + m.fixed,
      yen: fc.baseYen + fc.fuelYenPerKm * km + (fc.parkingYen || 0),
      detail: ["走る距離 約" + km.toFixed(1) + "km", "基本料金＋燃料＋駐車",
               "⚠ 事業者・車種で大きく変わります"], conf: "低" });
  });
  return out;
}

/* =================================================== 攻めた提案（組み合わせ） */
function combo(from, to, date, aggr) {
  var C = RG.CONFIG, kind = P.hourKind(date), A = C.aggr[aggr];
  var st = hav(from, to), out = [], night = P.isAfterLastTrain(date);

  /* 1. 始発待ち：いま待って、始発で帰る */
  if (night) {
    var r = railRoute(from, to, date);
    if (r) {
      var wait = P.minutesToFirstTrain(date);
      out.push({ id: "wait_first", m: { label: "始発を待つ", emoji: "🌅", color: "#A58000" },
        minutes: wait + r.minutes, yen: r.yen, rail: r, kicker: "いちばん安い",
        detail: ["始発（" + C.service.firstTrain + "ごろ）まで あと " + wait + " 分待つ",
                 "そこから電車で " + Math.round(r.minutes) + " 分",
                 "⚠ 始発時刻は概算です。駅・路線ごとの実際の時刻は各社の時刻表で確認してください",
                 "待つ場所（24時間の店・待合スペース）は自分で確保する必要があります"],
        conf: "低（始発時刻は概算）" });
    }
  }

  /* 2. タクシー分割：途中までタクシー、残りは徒歩／自転車 */
  [[0.4, "walk"], [0.6, "walk"], [0.75, "bike"], [0.55, "bike"]].forEach(function (pair) {
    var ratio = pair[0], rest = pair[1];
    var tkm = st * ratio * C.detour.car, rkm = st * (1 - ratio) * C.detour[rest];
    var rm = C.modes[rest];
    var restMin = rkm / rm.speed * 60 + (rest === "bike" ? rm.fixed : 0);
    if (rest === "walk" && restMin > A.walkMaxMin) return;
    if (rest === "bike" && st * (1 - ratio) > A.bikeKm) return;
    if (tkm < 1.2) return;
    var mt = C.modes.taxi;
    var min = tkm / speedOf(mt, kind) * 60 + mt.fixed + restMin;
    var yen = taxiFare(tkm, date) + (rest === "bike" ? bikeFare(restMin - rm.fixed / 2, date) : 0);
    var full = taxiFare(st * C.detour.car, date);
    out.push({ id: "taxi_" + rest + "_" + Math.round(ratio * 100),
      m: { label: "タクシー" + Math.round(ratio * 100) + "%＋" + rm.label, emoji: "🚕" + rm.emoji, color: "#C81432" },
      minutes: min, yen: yen, kicker: yen < full ? "タクシー全区間より " + (full - yen).toLocaleString("ja-JP") + " 円節約" : "",
      detail: ["タクシーで約 " + tkm.toFixed(1) + "km（" + taxiFare(tkm, date).toLocaleString("ja-JP") + "円）",
               "そこから" + rm.label + "で約 " + rkm.toFixed(1) + "km（" + Math.round(restMin) + "分）",
               "降りる地点は直線上の目安です。実際は幹線道路沿いで降りてください"],
      conf: "低（降車地点は概算）" });
  });

  /* 3. 自転車リレー：全区間シェアサイクル（深夜でも動く） */
  if (st <= A.bikeKm && night) {
    var mb2 = C.modes.bike, bkm2 = st * C.detour.bike;
    var bmin2 = bkm2 / mb2.speed * 60 + mb2.fixed;
    out.push({ id: "bike_night", m: { label: "深夜の自転車リレー", emoji: "🚲🌙", color: "#0055AD" },
      minutes: bmin2, yen: bikeFare(bmin2 - mb2.fixed / 2, date),
      kicker: "電車が動いていなくても使える",
      detail: ["約 " + bkm2.toFixed(1) + "km を自転車で",
               "シェアサイクルは24時間借りられるポートが多い（要確認）",
               "⚠ 夜間はライト必須・交通量の少ない道を選ぶこと"],
      conf: "中" });
  }

  /* 4. 歩ききる */
  if (night) {
    var wkm2 = st * C.detour.walk, wmin = wkm2 / C.modes.walk.speed * 60;
    if (wmin <= A.walkMaxMin) out.push({
      id: "walk_night", m: { label: "歩ききる", emoji: "🚶🌙", color: "#197A4B" },
      minutes: wmin, yen: 0, kicker: "0円",
      detail: ["約 " + wkm2.toFixed(1) + "km・" + Math.round(wmin) + "分",
               "始発まであと " + P.minutesToFirstTrain(date) + " 分。歩いたほうが早いかどうかの判断材料に"],
      conf: "高（距離のみ）" });
  }
  return out;
}

/* ============================================================== 見積り本体 */
P.estimate = function (from, to, date, aggr) {
  aggr = aggr == null ? 1 : aggr;
  var st = hav(from, to);
  var opts = baseOptions(from, to, date, aggr).concat(combo(from, to, date, aggr));
  opts.forEach(function (o) { o.minutes = Math.round(o.minutes); o.yen = Math.round(o.yen); });
  opts.sort(function (a, b) {
    if (!!a.stopped !== !!b.stopped) return a.stopped ? 1 : -1;   // 運休中の案は末尾へ
    return a.minutes - b.minutes;
  });
  markPareto(opts);
  return { options: opts, straightKm: st, hourKind: P.hourKind(date),
           night: P.isAfterLastTrain(date), toFirstTrain: P.minutesToFirstTrain(date),
           at: date, aggr: aggr };
};
function markPareto(list) {
  if (!list.length) return;
  var live = list.filter(function (o) { return !o.stopped; });
  var best = Infinity;
  list.forEach(function (o) { o.pareto = false; });
  live.slice().sort(function (a, b) { return a.minutes - b.minutes || a.yen - b.yen; })
      .forEach(function (o) { o.pareto = o.yen < best; if (o.yen < best) best = o.yen; });
  var cheap = (live.length ? live : list).reduce(function (a, b) { return b.yen < a.yen ? b : a; },
                                                 (live.length ? live : list)[0]);
  list.forEach(function (o) {
    var dm = cheap.minutes - o.minutes, dy = o.yen - cheap.yen;
    o.yenPerMin = dm > 0 ? Math.round(dy / dm) : null;
    o.vsCheapest = { min: dm, yen: dy };
  });
}

/* ================================================ 等時線 / 目的地さがし */
P.isochrone = function (from, date) {
  var field = railField(from, date), C = RG.CONFIG, out = {};
  RG.NET.stations.forEach(function (s) {
    var walk = hav(from, [s.la, s.lo]) * C.detour.walk / C.modes.walk.speed * 60;
    var f = field[s.id];
    out[s.id] = Math.round(f ? Math.min(f.min, walk) : walk);
  });
  return out;
};

P.discover = function (from, date, budget, moods, aggr) {
  var field = railField(from, date), C = RG.CONFIG, res = [];
  var maxPax = RG.paxRanked.length ? RG.paxRanked[0].px : 1;
  RG.NET.stations.forEach(function (s) {
    var walk = hav(from, [s.la, s.lo]) * C.detour.walk / C.modes.walk.speed * 60;
    var f = field[s.id];
    var min = f ? Math.min(f.min, walk) : walk;
    if (min > budget || min < 2) return;

    var d = RG.details[s.n], tags = [];
    var has = d && d !== "none" && d !== "loading";
    if (has && d.town) {
      if ((d.town.food || []).length) tags.push("food");
      if ((d.town.spots || []).length) tags.push("spot");
      if ((d.town.views || []).length) tags.push("view");
    }
    if (!has) tags.push("new");
    if ((s.ls || []).length >= 4) tags.push("hub");
    if (!s.px || s.rank > RG.NET.stations.length * 0.6) tags.push("quiet");

    var score = 0;
    if (!moods.length) score = 0.6 + (s.px ? s.px / maxPax : 0);
    else { moods.forEach(function (m) { if (tags.indexOf(m) >= 0) score += 1; }); if (!score) return; }
    score += (budget - min) / budget * 0.4;
    res.push({ id: s.id, name: s.n, minutes: Math.round(min), yen: f ? f.yen : 0,
               tags: tags, score: score, px: s.px, lines: (s.ls || []).length });
  });
  res.sort(function (a, b) { return b.score - a.score || a.minutes - b.minutes; });
  return res;
};

/* 「予算◯円ならどこまで行けるか」— タクシー予算の到達圏 */
P.taxiBudgetReach = function (from, date, budget) {
  var km = P.taxiReachKm(budget, date) / RG.CONFIG.detour.car, out = [];
  RG.NET.stations.forEach(function (s) {
    var d = hav(from, [s.la, s.lo]);
    if (d <= km) out.push({ id: s.id, name: s.n, km: d });
  });
  out.sort(function (a, b) { return b.km - a.km; });
  return { reachKm: km, stations: out };
};

})(window.RG);
