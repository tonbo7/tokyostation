/* =========================================================================
   公共交通オープンデータセンター（ODPT）との対応表 ―― 手入力
   ・この地図の路線名（Wikidata 由来）を ODPT の路線ID（odpt.Railway:〜）に結びつけます
   ・対応が無い路線は「運行情報なし」と表示され、行き方の案は消しません
   ・ロゴやマークは使いません。文字と色だけで示します

   ⚠ ODPT の API キー（acl:consumerKey）は、このファイルにも他のファイルにも書かないこと。
     キーは git 管理外の data/local_keys.js（RG.ODPT_KEY に値を入れる）か、
     「🚦 いまの状況」パネルで端末のブラウザに保存する方法だけを使います。

   出典: 公共交通オープンデータセンター https://www.odpt.org/
         GBFS（シェアサイクル）: https://api-public.odpt.org/api/v4/gbfs/
   ========================================================================= */
RG.ODPT = {
  /* 取得先。public はキー不要。keyed はキーがある端末だけ使います。
     ACL_CONSUMERKEY はプレースホルダで、実行時に端末内のキーへ置き換えます（置き換え先はログに出しません） */
  endpoints: {
    "public": "https://api-public.odpt.org/api/v4/",
    keyed:    "https://api.odpt.org/api/v4/",
    keyParam: "acl:consumerKey=ACL_CONSUMERKEY"
  },

  /* 動的データの「新しいとみなす時間」（ミリ秒）。これを過ぎたら現在値としては出さない */
  ttl: { rail: 3 * 60 * 1000, bus: 2 * 60 * 1000, cycleStatus: 2 * 60 * 1000,
         cycleInfo: 24 * 60 * 60 * 1000, busStops: 24 * 60 * 60 * 1000 },

  /* バス停・シェアサイクルを取る範囲（東京駅を中心に） */
  center: { la: 35.681268, lo: 139.766756, label: "東京駅" },
  radius: { bus: 650, cycle: 1000 },

  /* 事業者（odpt.Operator:〜）の表示名 */
  operators: {
    "JR-East": "JR東日本", "TokyoMetro": "東京メトロ", "Toei": "東京都交通局",
    "Tokyu": "東急電鉄", "Keio": "京王電鉄", "Odakyu": "小田急電鉄", "Seibu": "西武鉄道",
    "Tobu": "東武鉄道", "Keisei": "京成電鉄", "Keikyu": "京急電鉄", "TWR": "東京臨海高速鉄道",
    "Yurikamome": "ゆりかもめ", "TokyoMonorail": "東京モノレール", "MIR": "首都圏新都市鉄道",
    "Hokuso": "北総鉄道", "SaitamaRailway": "埼玉高速鉄道", "YokohamaMunicipal": "横浜市交通局"
  },

  /* 地図の路線名 → ODPT 路線ID（"odpt.Railway:" を省いた形）。複数の系統が走る区間は配列 */
  rail: {
    "山手線": "JR-East.Yamanote",
    "中央本線": ["JR-East.ChuoRapid", "JR-East.ChuoSobuLocal"],
    "総武本線": ["JR-East.SobuRapid", "JR-East.ChuoSobuLocal"],
    "東北本線": ["JR-East.KeihinTohokuNegishi", "JR-East.Utsunomiya", "JR-East.Takasaki"],
    "東海道本線": ["JR-East.Tokaido", "JR-East.KeihinTohokuNegishi", "JR-East.Yokosuka"],
    "常磐線": ["JR-East.JobanRapid", "JR-East.JobanLocal"],
    "京葉線": "JR-East.Keiyo",
    "武蔵野線": "JR-East.Musashino",
    "南武線": "JR-East.Nambu",
    "横浜線": "JR-East.Yokohama",
    "鶴見線": "JR-East.Tsurumi",
    "鶴見線大川支線": "JR-East.Tsurumi",
    "鶴見線海芝浦支線": "JR-East.Tsurumi",
    "赤羽線": "JR-East.SaikyoKawagoe",
    "品鶴線": ["JR-East.Yokosuka", "JR-East.ShonanShinjuku"],
    "大崎支線": "JR-East.ShonanShinjuku",
    "東北新幹線": "JR-East.TohokuShinkansen",
    "上越新幹線": "JR-East.JoetsuShinkansen",
    "北陸新幹線": "JR-East.HokurikuShinkansen",

    "東京メトロ銀座線": "TokyoMetro.Ginza",
    "東京メトロ丸ノ内線": "TokyoMetro.Marunouchi",
    "東京メトロ丸ノ内線方南町支線": "TokyoMetro.MarunouchiBranch",
    "東京メトロ日比谷線": "TokyoMetro.Hibiya",
    "東京メトロ東西線": "TokyoMetro.Tozai",
    "東京メトロ千代田線": "TokyoMetro.Chiyoda",
    "東京メトロ有楽町線": "TokyoMetro.Yurakucho",
    "東京メトロ半蔵門線": "TokyoMetro.Hanzomon",
    "東京メトロ南北線": "TokyoMetro.Namboku",
    "東京メトロ副都心線": "TokyoMetro.Fukutoshin",

    "都営地下鉄浅草線": "Toei.Asakusa",
    "都営地下鉄三田線": "Toei.Mita",
    "都営地下鉄新宿線": "Toei.Shinjuku",
    "都営地下鉄大江戸線": "Toei.Oedo",
    "都電荒川線": "Toei.Arakawa",
    "日暮里・舎人ライナー": "Toei.NipporiToneri",

    "東急東横線": "Tokyu.Toyoko",
    "東急目黒線": "Tokyu.Meguro",
    "東急田園都市線": "Tokyu.DenEnToshi",
    "東急大井町線": "Tokyu.Oimachi",
    "東急池上線": "Tokyu.Ikegami",
    "東急多摩川線": "Tokyu.TokyuTamagawa",
    "東急世田谷線": "Tokyu.Setagaya",
    "東急新横浜線": "Tokyu.ShinYokohama",

    "京王線": "Keio.Keio",
    "京王新線": "Keio.KeioNew",
    "京王井の頭線": "Keio.Inokashira",

    "小田急小田原線": "Odakyu.Odawara",

    "西武池袋線": "Seibu.Ikebukuro",
    "西武新宿線": "Seibu.Shinjuku",
    "西武有楽町線": "Seibu.SeibuYurakucho",
    "西武豊島線": "Seibu.Toshima",

    "東武東上本線": "Tobu.Tojo",
    "東武伊勢崎線": ["Tobu.TobuSkytree", "Tobu.Isesaki"],
    "東武亀戸線": "Tobu.Kameido",
    "東武大師線": "Tobu.Daishi",

    "京成本線": "Keisei.Main",
    "京成押上線": "Keisei.Oshiage",
    "京成金町線": "Keisei.Kanamachi",
    "京成松戸線": "Keisei.Matsudo",

    "京急本線": "Keikyu.Main",
    "京急空港線": "Keikyu.Airport",
    "京急大師線": "Keikyu.Daishi",

    "東京臨海高速鉄道りんかい線": "TWR.Rinkai",
    "ゆりかもめ東京臨海新交通臨海線": "Yurikamome.Yurikamome",
    "東京モノレール羽田空港線": "TokyoMonorail.HanedaAirport",
    "つくばエクスプレス": "MIR.TsukubaExpress",
    "北総鉄道北総線": "Hokuso.Hokuso",
    "埼玉高速鉄道線": "SaitamaRailway.SaitamaRailway",
    "横浜市営地下鉄ブルーライン": "YokohamaMunicipal.Blue",
    "横浜市営地下鉄グリーンライン": "YokohamaMunicipal.Green"
    /* 対応なし（運行情報なしと表示）: 東海道新幹線（JR東海は ODPT 未参加）、流鉄流山線、
       貨物線、構想路線、飛鳥山公園モノレール など */
  },

  /* 路線ID → 表示名（地図の路線名と違う呼び方になる系統だけ。無ければ地図の路線名を使う） */
  railNames: {
    "JR-East.ChuoRapid": "中央線快速", "JR-East.ChuoSobuLocal": "中央・総武線各駅停車",
    "JR-East.SobuRapid": "総武線快速", "JR-East.KeihinTohokuNegishi": "京浜東北線",
    "JR-East.Utsunomiya": "宇都宮線", "JR-East.Takasaki": "高崎線", "JR-East.Tokaido": "東海道線",
    "JR-East.Yokosuka": "横須賀線", "JR-East.JobanRapid": "常磐線快速", "JR-East.JobanLocal": "常磐線各駅停車",
    "JR-East.ShonanShinjuku": "湘南新宿ライン", "JR-East.SaikyoKawagoe": "埼京線",
    "Tobu.TobuSkytree": "東武スカイツリーライン", "Tobu.Isesaki": "東武伊勢崎線（久喜以北）",
    "TokyoMetro.MarunouchiBranch": "丸ノ内線（方南町支線）"
  },

  /* シェアサイクルの GBFS（キー不要の公開URL） */
  gbfs: [
    { id: "docomo-cycle-tokyo", label: "ドコモ・バイクシェア（東京）", c: "#C81432",
      url: "https://api-public.odpt.org/api/v4/gbfs/docomo-cycle-tokyo/gbfs.json" },
    { id: "docomo-cycle", label: "ドコモ・バイクシェア", c: "#C81432",
      url: "https://api-public.odpt.org/api/v4/gbfs/docomo-cycle/gbfs.json" },
    { id: "hellocycling", label: "HELLO CYCLING", c: "#D2A400",
      url: "https://api-public.odpt.org/api/v4/gbfs/hellocycling/gbfs.json" }
  ],

  /* 画面に出す注意書き（credits.html と同じ趣旨） */
  notice: [
    "このデータは公共交通オープンデータセンター（ODPT）がまとめて公開しているものです。各事業者が直接このサイトに出しているものではありません。",
    "内容が正確・完全であるとは限りません。実際の運行は駅の案内や各社の公式ページで確かめてください。",
    "このサイトの表示について、鉄道・バス・シェアサイクルの事業者に直接問い合わせないでください。問題や質問は GitHub の Issues へお願いします。"
  ],
  issues: "https://github.com/tonbo7/tokyostation/issues",
  source: { name: "公共交通オープンデータセンター", url: "https://www.odpt.org/",
            license: "公共交通オープンデータ基本ライセンス（ODPT）／GBFS は各提供元の公開データ" }
};
