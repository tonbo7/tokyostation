#!/usr/bin/env node
/* =========================================================================
   単一ファイル版 standalone.html を生成（配布・提出用） ―― Node 版
   tools/build_standalone.py と同じ結果になります。どちらを使っても構いません。
   実行: node tools/build_bundle.js

   やること
   1. index.html のローカル <link>/<script> をすべてインライン化
   2. data/*.js（段階読み込みのデータ）と data/details/*.js を埋め込む
   3. 地形・浸水の画像を data URI に
   4. 段階読み込みをやめて、その場で起動するように差し替え
   5. ⚠ ODPT の API キーが混ざっていないか確かめる（混ざっていたら止める）
      data/local_keys.js（git 管理外）は絶対に同梱しません
   ========================================================================= */
"use strict";
var fs = require("fs"), path = require("path");
process.chdir(path.join(__dirname, ".."));

function read(p) { return fs.readFileSync(p, "utf8"); }
function exists(p) { try { fs.statSync(p); return true; } catch (e) { return false; } }

var html = read("index.html");

html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, function (m, p) {
  return exists(p) ? "<style>\n" + read(p) + "\n</style>" : m;
});
html = html.replace(/<script src="([^"]+)"><\/script>/g, function (m, p) {
  if (/local_keys/.test(p)) return "";                    // 念のため。index.html には書かないこと
  return exists(p) ? "<script>\n" + read(p) + "\n</script>" : m;
});

/* 段階読み込み用のデータも、単一ファイル版では直接埋め込む（local_keys は入れない） */
var DATA = ["network", "config", "lines_meta", "genres", "score", "areas", "odpt_lines",
            "landmarks", "mappois", "heat", "admin", "relief", "poi", "descs",
            "tokyo_od2", "tokyo_od", "flood", "events", "chains", "user_pois", "indoor"];
var blob = DATA.filter(function (d) { return exists("data/" + d + ".js"); })
               .map(function (d) { return read("data/" + d + ".js"); }).join("\n");
var START = "<script>RG.startApp();</script>";
html = html.replace(START, "<script>\n" + blob + "\n</script>\n" + START);

/* 駅の詳細データを全部埋め込む */
var details = fs.readdirSync("data/details").filter(function (f) { return /\.js$/.test(f); }).sort()
  .map(function (f) { return read("data/details/" + f); }).join("\n");
html = html.replace(START, "<script>\n" + details + "\n</script>\n" + START);

/* 画像も data URI にして 1 ファイルに収める */
[["assets/relief.jpg", "image/jpeg"], ["assets/flood.png", "image/png"]].forEach(function (pr) {
  if (!exists(pr[0])) return;
  var b64 = fs.readFileSync(pr[0]).toString("base64");
  html = html.split('"' + pr[0] + '"').join('"data:' + pr[1] + ";base64," + b64 + '"');
});

/* 全部入りなので段階読み込みは使わず即起動する。
   地図が出たあとに東京駅周辺のポート・バス停を取りに行く処理も同じように呼ぶ */
html = html.replace(START,
  "<script>RG.boot(); if (RG.Live && RG.Live.warm) setTimeout(function () { RG.Live.warm(); }, 1500);</script>");

/* ⚠ キーの混入チェック：プレースホルダ以外の consumerKey があれば止める */
/* 実キーは英数字だけの長い文字列。プレースホルダ（ACL_CONSUMERKEY）やソース内の正規表現には当たらない */
if (/consumerKey=[A-Za-z0-9]{16,}/.test(html) || /RG\.ODPT_KEY\s*=\s*["'][^"']+["']/.test(html)) {
  console.error("⚠ API キーらしき文字列が含まれています。ビルドを中止しました");
  process.exit(1);
}

fs.writeFileSync("standalone.html", html, "utf8");
var left = [], re = /(?:src|href)="((?!http)[^"]+)"/g, m;
while ((m = re.exec(html))) left.push(m[1]);
console.log("standalone.html", fs.statSync("standalone.html").size, "bytes");
console.log("残った外部参照:", left.length ? left.join(", ") : "なし");
