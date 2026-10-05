/* =========================================================================
   スポットのジャンル定義
   ―― ジャンルを1つ足す＝この配列に1エントリ足すだけ。下部レール・地図・設定に自動反映。
   enabled:false は「データ源に到達できず未取得」。reason に理由を書いてUIに出す。
   ========================================================================= */
RG.GENRES = [
  { id: "bunkazai", e: "🏛️", label: "重要文化財",       c: "#A58000", enabled: true,
    desc: "国宝・重要文化財・国指定史跡・名勝など、国が指定した建造物と史跡" },
  { id: "history",  e: "🏯", label: "歴史的建築物",     c: "#8A5A2B", enabled: true,
    desc: "登録有形文化財・東京都選定歴史的建造物・遺跡・古墳・城門・橋" },
  { id: "worship",  e: "⛩️", label: "社寺仏閣",         c: "#C81432", enabled: true,
    desc: "神社・寺院・教会" },
  { id: "leisure",  e: "🎡", label: "レジャー系建築物", c: "#E5006E", enabled: true,
    desc: "遊園地・スタジアム・アリーナ・映画館・劇場・ホール・動物園・水族館" },
  { id: "park",     e: "🌳", label: "公園・庭園",       c: "#197A4B", enabled: true, optIn: true,
    desc: "公園・庭園・緑地。数が多いので、アイコンを押して選んだときだけ地図に出ます" },
  { id: "museum",   e: "🖼️", label: "博物館・美術館",   c: "#7B5BD6", enabled: true,
    desc: "博物館・美術館・科学館・記念館" },
  { id: "library",  e: "📚", label: "図書館",           c: "#0055AD", enabled: true,
    desc: "公共図書館（Wikidata＋東京都オープンデータ）" },
  { id: "shopping", e: "🏬", label: "ショッピングセンター", c: "#D2A400", enabled: true,
    desc: "ショッピングセンター・百貨店・商店街・市場" },
  { id: "civic",    e: "🏢", label: "役所・公共施設",   c: "#0079C2", enabled: true,
    desc: "区役所・市庁舎・文化センター・公民館" },

  /* ---- ここから下は 東京都オープンデータカタログ（CC BY 4.0）由来 ---- */
  { id: "toilet",  e: "🚻", label: "公衆トイレ",     c: "#00A0B0", enabled: true, od: true,
    desc: "公園や駅前などの公衆トイレ（駅に近い順に900件）" },
  { id: "aed",     e: "🅰️", label: "AED",           c: "#E5006E", enabled: true, od: true, optIn: true,
    desc: "AED（自動体外式除細動器）の設置場所。数が多いので、アイコンを押して選んだときだけ地図に出ます" },
  { id: "shelter", e: "🏳️", label: "避難場所",       c: "#197A4B", enabled: true, od: true,
    desc: "東京都防災マップの避難所・避難場所（東京都総務局・都内全域を統一形式で公開）" },
  { id: "camera",  e: "📹", label: "監視カメラ",     c: "#5A6472", enabled: true, od: true,
    desc: "河川監視カメラ（建設局）と海面ライブカメラ（港湾局）。大雨のときの様子が見られます" },
  { id: "event",   e: "🎪", label: "イベント",       c: "#E5006E", enabled: true, od: true,
    desc: "これから開かれる催し。先の月ほど規模の大きいものだけを残しています" },
  { id: "baby",    e: "👶", label: "赤ちゃんの駅",   c: "#F0851E", enabled: true, od: true,
    desc: "授乳・おむつ替えができる場所（赤ちゃん・ふらっと等）" },
  { id: "wifi",    e: "📶", label: "無料Wi-Fi",      c: "#0079C2", enabled: true, od: true,
    desc: "自治体が公開している無料Wi-Fiスポット（駅に近い順に700件）" },
  { id: "cycle",   e: "🅿️", label: "駐輪場",         c: "#8A5A2B", enabled: true, od: true,
    desc: "公営の自転車駐車場" },
  { id: "sento",   e: "🛁", label: "銭湯",             c: "#C81432", enabled: true,
    desc: "東京都公衆浴場業生活衛生同業組合の組合員銭湯。東京都・各区の入浴支援や" +
          "クーポン施策の対象になることが多い施設です（施策の有無は各自治体で要確認）",
    src: "https://www.1010.or.jp/map/" },

  /* ---- 公共交通オープンデータセンター（ODPT）。開いたときに東京駅周辺だけ取ってきます ---- */
  { id: "sharecycle", e: "🚲", label: "シェアサイクル",   c: "#0055AD", enabled: true, live: true,
    desc: "東京駅周辺（約1km）のポート。貸出・返却できる台数は開いたときに取ってきて、取得時刻を付けて出します（ODPT GBFS）" },
  { id: "busstop",    e: "🚏", label: "バス停",           c: "#D2A400", enabled: true, live: true,
    desc: "東京駅周辺（約650m）のバス停と系統。走っているバスは「🚦 いまの状況」から見られます（ODPT）" },

  /* ---- 歩行空間ネットワークデータ（ほこナビ・国土交通省仕様）。data/indoor.js があるときだけ有効になります ---- */
  { id: "indoor",     e: "🛗", label: "構内・歩行空間",   c: "#5A6472", enabled: false,
    desc: "東京駅周辺のエレベーター・階段・トイレなど。拡大すると歩ける道が歩きやすさの色（緑＝段差なし／黄＝注意／赤＝階段／青＝エレベーター等）で出ます",
    reason: "データ未取得。data/indoor/README.md の手順で歩行空間ネットワークデータを置き、tools/build_indoor.py を実行すると出ます" },

  /* ---- チェーン店（OpenStreetMap ODbL）。件数が多いので選んだときだけ出します ---- */
  { id: "cvs",     e: "🏪", label: "コンビニ",       c: "#00A040", enabled: true, optIn: true, chain: true,
    desc: "セブン-イレブン・ローソン・ファミリーマートなど。ブランドは下の一覧から選べます" },
  { id: "food",    e: "🍴", label: "チェーン飲食店", c: "#F15A22", enabled: true, optIn: true, chain: true,
    desc: "マクドナルド・スターバックス・すき家・CoCo壱番屋など" },
  { id: "disc",    e: "🛍️", label: "ディスカウント", c: "#FFB300", enabled: true, optIn: true, chain: true,
    desc: "ドン・キホーテ・トライアルなど" },
  { id: "super",   e: "🛒", label: "スーパー",       c: "#0079C2", enabled: false, chain: true,
    desc: "イオン・ライフ・西友・まいばすけっとなど",
    reason: "収集の途中です。Overpass API が不安定なため、少しずつ集めています" },
  { id: "drug",    e: "💊", label: "ドラッグストア", c: "#E60012", enabled: false, chain: true,
    desc: "マツモトキヨシ・スギ薬局・コスモス薬品など",
    reason: "同上" },
  { id: "life",    e: "💯", label: "生活・雑貨",     c: "#7B3FE4", enabled: false, chain: true,
    desc: "ダイソー・ニトリ・ユニクロ・ブックオフなど",
    reason: "同上" },

  /* ---- ここから下はデータ源に到達できず未取得。定義だけ置いてあります ---- */
  { id: "food_top", e: "🍽️", label: "高評価飲食店TOP10", c: "#FE3939", enabled: false,
    desc: "その駅で評価の高い飲食店 上位10件",
    reason: "レビュー点数を持つ公開データがありません。グルメサイトのスコアは利用規約上使えません" },
  { id: "onsen",    e: "♨️", label: "温泉の銭湯",       c: "#EC6E00", enabled: true,
    desc: "天然温泉を使っている銭湯（東京都公衆浴場業生活衛生同業組合「東京銭湯マップ」より）",
    src: "https://www.1010.or.jp/map/" },
  { id: "meeting",  e: "💼", label: "貸会議室",         c: "#626264", enabled: false,
    desc: "レンタル会議室・コワーキング",
    reason: "公開されている機械可読データがありません" },
  { id: "manga",    e: "📖", label: "漫画喫茶",         c: "#9C5E31", enabled: false,
    desc: "漫画喫茶・ネットカフェ",
    reason: "同上" }
];
