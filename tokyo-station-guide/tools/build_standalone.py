# -*- coding: utf-8 -*-
"""単一ファイル版 standalone.html を生成（配布・提出用）。
   index.html 内のローカル <link>/<script> をすべてインライン化し、
   さらに data/details/*.js を全部埋め込む（遅延ロードが不要になる）。
   実行: python3 tools/build_standalone.py"""
import io, os, re, glob
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

def read(p): return io.open(p, encoding="utf-8").read()

html = read("index.html")

def sub_link(m):
    p = m.group(1)
    return "<style>\n" + read(p) + "\n</style>" if os.path.exists(p) else m.group(0)
html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', sub_link, html)

def sub_script(m):
    p = m.group(1)
    return "<script>\n" + read(p) + "\n</script>" if os.path.exists(p) else m.group(0)
html = re.sub(r'<script src="([^"]+)"></script>', sub_script, html)

# 段階読み込み用のデータも、単一ファイル版では直接埋め込む
# ⚠ data/local_keys.js（ODPT の API キー・git 管理外）は絶対に同梱しない
DATA = ["network", "config", "lines_meta", "genres", "score", "areas", "odpt_lines",
        "landmarks", "mappois", "heat", "admin", "relief", "poi", "descs",
        "tokyo_od2", "tokyo_od", "flood", "events", "chains", "user_pois"]
blob = "\n".join(read("data/%s.js" % d) for d in DATA if os.path.exists("data/%s.js" % d))
html = html.replace("<script>RG.startApp();</script>",
                    "<script>\n" + blob + "\n</script>\n<script>RG.startApp();</script>")

# 駅の詳細データを全部埋め込む（単一ファイルでは動的ロードできないため）
details = "\n".join(read(p) for p in sorted(glob.glob("data/details/*.js")))
html = html.replace("<script>RG.startApp();</script>",
                    "<script>\n" + details + "\n</script>\n<script>RG.startApp();</script>")

# 地形画像も data URI にして 1 ファイルに収める
import base64
for _rp, _mt in (("assets/relief.jpg", "image/jpeg"), ("assets/flood.png", "image/png")):
    if os.path.exists(_rp):
        _b = base64.b64encode(open(_rp, "rb").read()).decode()
        html = html.replace('"' + _rp + '"', '"data:' + _mt + ";base64," + _b + '"')

# standalone 版は全部が1ファイルに入っているので、段階読み込みは使わず即起動する
# 地図が出たあとに東京駅周辺のポート・バス停を取りに行く処理（loader.js と同じ）も呼ぶ
html = html.replace("<script>RG.startApp();</script>",
                    "<script>RG.boot(); if (RG.Live && RG.Live.warm) setTimeout(function () { RG.Live.warm(); }, 1500);</script>")

# キーが混ざっていないか最後に確かめる（プレースホルダ以外の consumerKey があれば止める）
# 実キーは英数字だけの長い文字列。プレースホルダ（ACL_CONSUMERKEY）やソース内の正規表現には当たらない
if re.search(r"consumerKey=[A-Za-z0-9]{16,}", html) or re.search(r"RG\.ODPT_KEY\s*=\s*[\"'][^\"']+[\"']", html):
    raise SystemExit("⚠ API キーらしき文字列が含まれています。ビルドを中止しました")
io.open("standalone.html", "w", encoding="utf-8").write(html)
left = re.findall(r'(?:src|href)="((?!http)[^"]+)"', html)
print("standalone.html", os.path.getsize(html and "standalone.html"), "bytes")
print("残った外部参照:", left or "なし")
