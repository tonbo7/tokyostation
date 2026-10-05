# 引き継ぎ：案内中の画面（詳細・候補切替・AR）と警報設定を kouchift/tokyostation へ移植する

このリポジトリ（tonbo7/tokyostation = fork）に **参照実装** があります。公開サイト（kouchift.github.io/tokyostation）の
コードは fork より進んでいるため、そのままマージせず、以下を見ながら移植してください。
この文書を kouchift 側のセッションにそのまま貼って使えます。

## 1. 要望（元の依頼）

1. 案内中バーをタップすると移動の詳細（何号車だと乗換が容易か、何番乗り場、推奨の出口）を出す
2. 外に出て分かりにくいときは AR 画面へ切り替えやすく。地図表示と詳細案内も切替容易に
3. 案内の候補が複数あるので、一覧の切替と「案内のやり直し」を手数少なく
4. 警報バナーは「どのレベルを表示するか」を設定可能に。確認後はすぐ消す

## 2. 参照実装のファイル（fork 側）

| ファイル | 役割 | 依存 |
|---|---|---|
| `assets/navui.js` | 案内バー（詳細 ▸／📷 AR／候補チップ／🔁 やり直す）、移動の詳細シート、候補切替、やり直し | `RG.Nav`（nav.js）, `RG.Planner.estimate`, `RG.Trip`, `RG.openModal`, `RG.details`, `RG.lineBadge`, `RG.Live.decorateRoutes`（任意） |
| `assets/ar.js` | 簡易 AR（カメラ＋方位矢印＋距離） | `RG.Nav`, `RG.NavUI.nextWaypoint / nextStepText`, `RG.hav` |
| `assets/alerts.js` | 警報バナー・一覧・設定（レベル／既読） | `RG.openModal`, `#alertbar` 要素 |
| `assets/planner.js` | `railRoute()` が `stations`（通った駅ID）と `legs`（路線ごとの区間）を返す | — |
| `assets/nav.js` | `startNav(dest, name, opt, ctx)` に `ctx = {result, destId, destName}` を追加。`bar()`／`onPos`／`stop` から NavUI を呼ぶ | — |
| `assets/plannerui.js` | 「🧭 この道で案内」で `ctx` を渡す（1行） | — |
| `assets/lines_ui.js` | 設定画面に `RG.Alerts.settingsHtml()` / `bindSettings(m)` を差し込む（2行） | — |
| `assets/app.css` | `.nav__*`（追加分）, `.nd__*`, `.ar*`, `.alertbar*`, `.alw__*` | — |
| `data/details/_TEMPLATE.js.txt` | `tracks`（乗り場）と `exits`（出口）の任意フィールドを追加 | — |

## 3. kouchift 側で確認・調整すること

1. **案内バーの DOM とクラス名**：公開サイトは「中村橋駅へ案内中／電車・のこり約10.8km／案内をやめる」の下に「🚶 麹町駅まで徒歩6分 ／ 東京メトロ有楽町線 → 池袋駅 ／ …」の行がある。
   fork の `nav.js#bar()` に相当する関数を見つけ、`RG.NavUI.bar(container, off, rest, acc, stopFn)` に委ねる（または同じ内容を既存の描画に足す）。
2. **経路データ**：kouchift 側の経路エンジンが「通った駅の並び」を持っているか。無ければ `planner.js` の `stopsTo()` / `legsOf()` を移植する。`rail.stations`（駅IDの配列）と `rail.legs`（`[{line, from, to, stations}]`）があれば NavUI はそのまま動く。
3. **現地調査データ**：`data/details/<駅名>.js` の `boarding` はそのまま使える。乗り場・出口を出すには `tracks` / `exits` を追加する（無ければ「未調査」と出る。推測で埋めない）。
4. **警報の取得元**：公開サイトには既に警報バナーがある。その取得処理の結果を `RG.Alerts.set(list)` に渡す形にし、既存のバナー描画を `alerts.js` の描画に置き換える。1件の形：
   `{ id: "一意なID（発表時刻＋地域＋種別）", level: "special"|"warning"|"advisory", area: "千代田区", title: "大雨警報", text: "…", url: "出典URL", at: "2026-10-05 14:00" }`
   - `level` は気象庁の3区分（特別警報／警報／注意報）に合わせる（提案どおり）。
   - 既読は `id` 単位。発表が更新されて id が変われば再表示される。
5. **AR**：HTTPS 必須。iOS は `DeviceOrientationEvent.requestPermission()`（ユーザー操作内で呼ぶ必要がある＝ボタンの click から呼んでいる）。Android は `deviceorientationabsolute`。カメラは `getUserMedia({video:{facingMode:"environment"}})`。
6. **地図 ⇄ 詳細**：fork はモーダル（モバイルでは下からのシート）を使っている。kouchift 側にボトムシートがあればそれに載せ替えてよい。切替は「詳細 ▸」と「🗺️ 地図を見る」の1タップずつ。

## 4. 受け入れ確認（fork で通したもの）

- 案内開始 → バーに「詳細 ▸」「📷 AR」「やめる」、2段目に次の行動、3段目に候補チップと「🔁 やり直す」
- 「詳細 ▸」→ 区間ごとの乗る駅・路線・乗換・降車、乗換駅の号車（調査データがある駅）、無い駅は「未調査」
- 候補チップをタップ → 即切替（バーのラベル・所要が変わる）。「🔁 やり直す」→ 現在地が出発地になり再見積もり
- 「📷 AR」→ カメラ・方位が無い環境では注意文が出て「地図に戻る」で復帰。案内は続く
- 警報：`RG.Alerts.set([...])` で level 設定に応じた件数がバナーに出る。× で消え、同じ id は再表示されず、新しい id で再表示。設定の「表示する警報」で切替
- 単体テスト・ODPT E2E・地図操作 E2E に回帰なし

## 5. 移植後に kouchift 側で直すべき既知の差

- fork の PR #1〜#3（ODPT 運行情報／歩行空間の受け皿／地図の性能改善）も未移植。必要なら同じ要領で。
