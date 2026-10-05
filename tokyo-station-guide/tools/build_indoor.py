# -*- coding: utf-8 -*-
"""歩行空間ネットワークデータ（ほこナビ／国土交通省仕様）→ data/indoor.js

東京駅周辺の「歩きやすさ」（段差・坂・幅・階段・エレベーター・屋内）と、
トイレ・エレベーターなどの構内 POI を、地図と駅カードに出せる形にまとめます。

入力: data/indoor/raw/ に置いた GeoJSON（WGS84）
      ・リンク（線）… プロパティに link_id がある
      ・ノード（点）… プロパティに node_id がある
      ・施設（点）  … 上のどちらでもない Point（name / facil_type / toilet などを見る）
      Shapefile しかない場合は QGIS か ogr2ogr で GeoJSON に変換してから置いてください。
出力: data/indoor.js（RG.INDOOR = {...}）。東京駅から半径 RADIUS_M 以内だけを残します。

実行: python3 tools/build_indoor.py [--raw data/indoor/raw] [--out data/indoor.js] [--radius 900]

⚠ 属性コードの意味（CODES）は「歩行空間ネットワークデータ等整備仕様（国土交通省）」で必ず確かめてください。
   仕様の版によって番号が違うことがあります。違っていたら CODES を直すだけで済むようにしてあります。
"""
import io, os, sys, json, glob, math, argparse

CENTER = (35.681268, 139.766756)        # 東京駅（Wikidata）
RADIUS_M = 900

# ---- 属性コード（仕様書で要確認。ここだけ直せば全体に効く） ----
CODES = {
    # rt_struct 経路の構造
    "stairs":    [12],          # 階段
    "elevator":  [10],          # エレベーター
    "escalator": [11],          # エスカレーター
    "slope":     [13],          # スロープ
    "moving":    [7],           # 動く歩道
    # lev_diff 段差：この値以上なら「段差あり」
    "step_min": 1,
    # vtcl_slope 縦断勾配：この値以上なら「急な坂」
    "steep_min": 2,
    # width 幅員：この値なら「狭い（1m未満）」
    "narrow": [1],
    # in_out（ノード）：屋内を表す値
    "indoor": [1],
}

# リンク1本に付ける印（ビット）。assets/walk.js と同じ並び
FLAG = {"step": 1, "steep": 2, "narrow": 4, "stairs": 8, "elevator": 16, "escalator": 32,
        "slope": 64, "indoor": 128, "moving": 256}

def hav(a, b):
    R = 6371000.0
    la1, lo1, la2, lo2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    x = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(x))

def num(v):
    try:
        return int(float(v))
    except Exception:
        return None

def prop(p, *names):
    """大文字小文字・前後の空白のゆれを吸収して属性を取る"""
    low = {str(k).strip().lower(): v for k, v in p.items()}
    for n in names:
        if n.lower() in low and low[n.lower()] not in ("", None):
            return low[n.lower()]
    return None

def coords_of(geom):
    if not geom: return []
    t, c = geom.get("type"), geom.get("coordinates")
    if t == "LineString": return [c]
    if t == "MultiLineString": return list(c)
    if t == "Point": return [[c]]
    if t == "MultiPoint": return [list(c)]
    return []

def load(raw_dir):
    feats = []
    for p in sorted(glob.glob(os.path.join(raw_dir, "*.geojson")) + glob.glob(os.path.join(raw_dir, "*.json"))):
        try:
            j = json.load(io.open(p, encoding="utf-8"))
        except Exception as e:
            print("  読めません:", p, str(e)[:60]); continue
        fs = j.get("features") if isinstance(j, dict) else None
        if not fs: continue
        print("  %s: %d features" % (os.path.basename(p), len(fs)))
        feats += fs
    return feats

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default="data/indoor/raw")
    ap.add_argument("--out", default="data/indoor.js")
    ap.add_argument("--radius", type=float, default=RADIUS_M)
    ap.add_argument("--source", default="国土交通省 歩行空間ネットワークデータ（ほこナビ・東京駅周辺）")
    ap.add_argument("--license", default="出典明示で利用可（配布元の利用規約を確認）")
    ap.add_argument("--fetched", default="")
    a = ap.parse_args()
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

    print("■ 読み込み:", a.raw)
    feats = load(a.raw)
    if not feats:
        print("GeoJSON がありません。data/indoor/README.md の手順でデータを置いてください。")
        sys.exit(1)

    nodes, links, pois = {}, [], []
    # 1) ノード（屋内外・階）
    for f in feats:
        p = f.get("properties") or {}
        nid = prop(p, "node_id", "nodeid", "node")
        if nid is None or (f.get("geometry") or {}).get("type") not in ("Point",): continue
        c = f["geometry"]["coordinates"]
        nodes[str(nid)] = {"la": c[1], "lo": c[0], "fl": prop(p, "floor", "flr", "level"),
                           "io": num(prop(p, "in_out", "inout"))}
    # 2) リンク
    cnt = {k: 0 for k in FLAG}
    for f in feats:
        p = f.get("properties") or {}
        if prop(p, "link_id", "linkid", "link") is None: continue
        rt = num(prop(p, "rt_struct", "rtstruct", "struct"))
        flags = 0
        for key in ("stairs", "elevator", "escalator", "slope", "moving"):
            if rt is not None and rt in CODES[key]: flags |= FLAG[key]
        lev = num(prop(p, "lev_diff", "levdiff", "step"))
        if lev is not None and lev >= CODES["step_min"]: flags |= FLAG["step"]
        vs = num(prop(p, "vtcl_slope", "vtclslope", "slope_v"))
        if vs is not None and vs >= CODES["steep_min"]: flags |= FLAG["steep"]
        wd = num(prop(p, "width", "wid"))
        if wd is not None and wd in CODES["narrow"]: flags |= FLAG["narrow"]
        ev = num(prop(p, "elevator", "elev"))
        if ev == 1: flags |= FLAG["elevator"]
        s, e = str(prop(p, "start_id", "startid") or ""), str(prop(p, "end_id", "endid") or "")
        ns, ne = nodes.get(s), nodes.get(e)
        if (ns and ns["io"] in CODES["indoor"]) or (ne and ne["io"] in CODES["indoor"]): flags |= FLAG["indoor"]
        fl = prop(p, "floor", "flr", "level")
        if fl is None and ns: fl = ns.get("fl")
        lines = coords_of(f.get("geometry"))
        if not lines and ns and ne: lines = [[[ns["lo"], ns["la"]], [ne["lo"], ne["la"]]]]
        for ln in lines:
            pts = [(round(c[1], 6), round(c[0], 6)) for c in ln if len(c) >= 2]
            if len(pts) < 2: continue
            # 線の「まん中」（両端の平均）が範囲内のものだけ残す。遠くから入ってくる長い線は落とす
            mid = ((pts[0][0] + pts[-1][0]) / 2, (pts[0][1] + pts[-1][1]) / 2)
            if hav(mid, CENTER) > a.radius: continue
            flat = []
            for q in pts: flat += [q[0], q[1]]
            links.append([flat, flags, fl if fl is not None else ""])
            for k in FLAG:
                if flags & FLAG[k]: cnt[k] += 1
            # エレベーター・階段・エスカレーターは、ふきだしで押せるように点としても残す
            for key, kind in (("elevator", "elevator"), ("stairs", "stairs"), ("escalator", "escalator")):
                if flags & FLAG[key]:
                    pois.append({"n": {"elevator": "エレベーター", "stairs": "階段", "escalator": "エスカレーター"}[kind],
                                 "la": mid[0], "lo": mid[1], "k": kind, "fl": fl if fl is not None else ""})
    # 3) 施設（トイレなど）
    for f in feats:
        p = f.get("properties") or {}
        if prop(p, "link_id", "linkid", "link") is not None or prop(p, "node_id", "nodeid", "node") is not None: continue
        if (f.get("geometry") or {}).get("type") != "Point": continue
        c = f["geometry"]["coordinates"]
        if hav((c[1], c[0]), CENTER) > a.radius: continue
        name = str(prop(p, "name", "facil_name", "title") or "")
        ft = str(prop(p, "facil_type", "type", "category") or "")
        toilet = num(prop(p, "toilet", "wc"))
        kind = "toilet" if (toilet == 1 or "トイレ" in name or "toilet" in ft.lower()) else \
               "elevator" if ("エレベーター" in name or "elevator" in ft.lower()) else \
               "info" if ("案内" in name or "info" in ft.lower()) else "facility"
        pois.append({"n": name or {"toilet": "トイレ", "elevator": "エレベーター", "info": "案内所"}.get(kind, "施設"),
                     "la": round(c[1], 6), "lo": round(c[0], 6), "k": kind,
                     "fl": prop(p, "floor", "flr", "level") or "", "t": ft})
    if not links and not pois:
        print("東京駅から %dm 以内のデータがありませんでした。" % a.radius); sys.exit(1)

    out = {"source": {"name": a.source, "license": a.license, "fetched": a.fetched,
                      "url": "https://www.hokonavi.jp/"},
           "center": {"la": CENTER[0], "lo": CENTER[1]}, "radius": a.radius,
           "flags": FLAG, "links": links, "pois": pois, "count": cnt}
    head = ("/* 東京駅周辺の歩行空間ネットワーク（自動生成: tools/build_indoor.py）\n"
            "   出典: %s ／ %s\n"
            "   links: [[lat,lon,lat,lon,...], flags, floor]  flags は本ファイル末尾の flags のビット\n"
            "   pois:  エレベーター・階段・エスカレーター・トイレなど（k=種類 fl=階）\n"
            "   ⚠ 属性コードの読み方は仕様書の版で変わります。tools/build_indoor.py の CODES を確認してください。 */\n"
            % (a.source, a.license))
    body = "RG.INDOOR = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n"
    io.open(a.out, "w", encoding="utf-8").write(head + body)
    print("■ 書き出し:", a.out, os.path.getsize(a.out), "bytes")
    print("   リンク %d 本 / POI %d 件 / 印: %s" % (len(links), len(pois), cnt))

if __name__ == "__main__":
    main()
