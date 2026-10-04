# データの出どころとライセンス

このサイトのデータは、すべて公開されているオープンデータです。
どこから取ってきて、どういう条件で使えるのかを、ここに全部書いておきます。

## 一覧

| データ | 件数 | 出どころ | ライセンス | 表示義務 |
|---|---|---|---|---|
| 駅・路線・隣接・乗降人員・ホーム数・開業年 | 669駅 / 77路線 | [Wikidata](https://www.wikidata.org) | **CC0 1.0** | なし（謝意として表示） |
| 文化財・史跡・社寺・博物館・公園・ランドマーク | 約1,400 | Wikidata | **CC0 1.0** | なし |
| 駅とスポットの説明文（一行） | 716 | Wikidata description | **CC0 1.0** | なし |
| 駅とスポットの概要（2〜3文） | 716 | [Wikipedia 日本語版](https://ja.wikipedia.org) | **CC BY-SA 4.0** | **出典＋リンク＋継承** |
| 写真 | 約2,000 | [Wikimedia Commons](https://commons.wikimedia.org) | ファイルごとに異なる | **個別に表示** |
| 公衆トイレ・AED・避難場所・Wi-Fi・駐輪場・赤ちゃんの駅・図書館・博物館・公園 | 6,672 | [東京都オープンデータカタログ](https://portal.data.metro.tokyo.lg.jp/) | **CC BY 4.0** | **出典表示** |
| 河川監視・海面ライブカメラ | 94 | 東京都建設局・港湾局 | 東京都のオープンデータ | **出典表示** |
| 銭湯・温泉銭湯 | 283 | [東京銭湯マップ](https://www.1010.or.jp/map/)（東京都公衆浴場業生活衛生同業組合） | 公開情報（事実データのみ利用） | **出典表示** |
| チェーン店 | 10,143 / 21ブランド | [OpenStreetMap](https://www.openstreetmap.org/) | **ODbL 1.0** | **出典表示＋継承** |
| 住所・建物名の検索 | 都度 | OpenStreetMap Nominatim | **ODbL 1.0** | **出典表示** |
| 行政区域ポリゴン | 45自治体 | [国土数値情報 N03](https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-v3_1.html)（国土交通省） | 出典明示で利用可 | **出典表示** |
| 公示地価 | 2,560地点 | 国土数値情報 L01（国土交通省） | 出典明示で利用可 | **出典表示** |
| 標高・陰影起伏 | 96×96グリッド＋画像1枚 | [国土地理院 標高タイル](https://maps.gsi.go.jp/development/ichiran.html) | 国土地理院コンテンツ利用規約 | **出典表示** |
| 人口・面積（ヒートマップ） | 23区 | Wikidata | **CC0 1.0** | なし |
| 鉄道の運行情報（odpt:TrainInformation） | 開いたときに取得（3分で期限切れ） | [公共交通オープンデータセンター ODPT](https://www.odpt.org/)（JR東日本・東京メトロ・東京都交通局ほか各社提供） | 公共交通オープンデータ基本ライセンス | **出典表示＋注意書き** |
| バス停・系統・走っているバス（odpt:BusstopPole／BusroutePattern／Bus） | 東京駅から約650m・開いたときに取得 | 公共交通オープンデータセンター ODPT（東京都交通局ほか） | 同上 | **出典表示＋注意書き** |
| シェアサイクルのポート・台数（GBFS） | 東京駅から約1km・開いたときに取得（台数は2分で期限切れ） | [ODPT の GBFS 公開URL](https://api-public.odpt.org/api/v4/gbfs/)（ドコモ・バイクシェア、HELLO CYCLING 提供・キー不要） | 各提供元の公開データ | **出典表示** |

## 公共交通オープンデータセンター（ODPT）について

「🚦 いまの状況」と比較ビューの運行情報・東京駅周辺のバス・シェアサイクルは、
[公共交通オープンデータセンター（ODPT）](https://www.odpt.org/) のデータをブラウザから直接取得して表示します。
静的ファイルには入っていません（`data/odpt_lines.js` は路線名と ODPT の路線IDの対応表だけです）。

- このデータは ODPT がまとめて公開しているもので、各事業者が直接このサイトに出しているものではありません
- 内容が正確・完全であるとは限りません。表示には必ず**取得時刻**を付け、期限切れのキャッシュは現在値として出しません。取れないときは「取得できませんでした」と表示します
- このサイトの表示について、鉄道・バス・シェアサイクルの事業者に**直接問い合わせないでください**。問題は [GitHub Issues](https://github.com/tonbo7/tokyostation/issues) へ
- **API キー（`acl:consumerKey`）はソース・ビルド結果・ログ・Issue に書きません。** ソースには `acl:consumerKey=ACL_CONSUMERKEY` というプレースホルダだけがあります。
  自分のキーを使うときは、git 管理外の `data/local_keys.js`（`RG.ODPT_KEY = "..."`）を置くか、「🚦 いまの状況」パネルで端末のブラウザに保存します。
  ビルド（`node tools/build_bundle.js`／`python3 tools/build_standalone.py`）はキーらしき文字列を見つけると止まります
- まずキー不要の公開 API（`api-public.odpt.org`）を試し、取れないときだけキー付き API（`api.odpt.org`）を使います
- 同じ注意書きは `credits.html` と「🚦 いまの状況」パネルの先頭にも出しています

### まだ載せていないもの（スコープ外）

| 候補 | 状況 |
|---|---|
| ほこナビ 歩行空間ネットワークデータ（東京駅周辺） | 未着手。リンク・ノードの前処理（段差・幅員・勾配の抽出）と地図への載せ方の設計が必要 |
| 東京駅周辺 屋内地図（通路・エレベータ・トイレ等の POI） | 未着手。駅構内の情報は当面 `data/details/<駅名>.js`（現地調査）で扱う |
| 鉄道の列車位置（odpt:Train） | 使っていません。列車位置の生データを経路上に散らすと見づらいため、運行情報（平常／遅延／見合わせ）だけを重ねています |

## 使わなかったもの（と、その理由）

| 候補 | 理由 |
|---|---|
| 食べログのランキング・百名店 | 利用規約で複製・転載・改変が禁止されています。ランキングは編集著作物にあたる可能性が高く、robots.txt が許していても規約は別です |
| インスタベース（レンタルスペース） | 商用予約サイトの在庫データで、取得の許諾がありません |
| 鉄道会社・チェーン店のロゴ画像 | 商標権と著作権の両方で保護されています。公表されているブランドカラーと絵文字で代用しています |
| 銭湯の写真 | 組合の著作物です。直リンク表示は権利上グレーで、先方のサーバー負荷にもなります |

## CC BY-SA 4.0 について（継承が必要な部分）

`data/descs.js` に入っている **`x` フィールド（Wikipedia の冒頭抜粋）** は
CC BY-SA 4.0 です。この部分を再利用する場合は、

1. 出典（Wikipedia 日本語版の記事名とリンク）を示す
2. 同じ CC BY-SA 4.0 で公開する

の2つが必要です。アプリ内では、駅カードとスポットカードに
「出典: Wikipedia 日本語版（CC BY-SA 4.0）」と記事へのリンクを必ず表示しています。

## ODbL について（OpenStreetMap 由来）

チェーン店データ（`data/chains.js`）と、検索の住所照会（Nominatim）は
OpenStreetMap 由来です。画面に **「© OpenStreetMap contributors」** を表示しています。
このデータを加工して再配布する場合は ODbL 1.0 の継承が必要です。

## データを作り直したいとき

`tools/` にすべてのビルドスクリプトがあります。

```
tools/build_network.py     駅・路線（Wikidata SPARQL）
tools/build_poi.py         駅まわりの文化財・社寺・地価・写真
tools/build_mappois.py     地図に出すスポット
tools/build_landmarks.py   ランドマーク TOP100
tools/build_lines_meta.py  ラインカラー
tools/build_admin.py       行政区域ポリゴン（N03 を簡略化）
tools/build_relief.py      標高グリッドと陰影起伏画像（国土地理院）
tools/build_heat.py        区ごとのヒートマップ因子
tools/fetch_tokyo_od.py    東京都オープンデータの収集
tools/merge_tokyo_od.py    同・整形
tools/fetch_chains.py      チェーン店（Overpass API）
tools/build_chains.py      同・整形
tools/build_standalone.py  単一ファイル版の生成（Python）
tools/build_bundle.js      単一ファイル版の生成（Node・同じ結果。キー混入チェック付き）
```

外部サービスに負荷をかけないよう、どのスクリプトも間隔をあけてアクセスします。
実行する前に、各サービスの利用規約を確認してください。
