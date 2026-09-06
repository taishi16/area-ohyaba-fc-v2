/**
 * AREA OHYABA FC — 公式サイト用 データ配信スクリプト
 * ==================================================================
 * Googleスプレッドシート（日本語の表）の内容を、
 * ホームページが読める形（JSON）にして返す。費用は0円。
 *
 * 【公開されるもの】このファイルに書いてある列だけ。
 *   シートに列を足しても、ここに書かなければサイトには出ない。
 *
 * 【状態の自動判定】
 *   「状態」欄が空のときは、得点が両方入っていれば「終了」、
 *   入っていなければ「予定」として扱う。
 *   延期・中止のときだけ「状態」欄を選ぶ。
 * ==================================================================
 */

var CACHE_SECONDS = 120; // シートを直してから最大2分で反映

/** シート名 → サイト内部での呼び名 */
var SHEETS = {
  '試合': 'matches',
  'ニュース': 'news',
  '選手': 'players',
  'スタッフ': 'staff',
  'スポンサー': 'sponsors',
  'Instagram': 'activity',
  '設定': 'config'
};

/** 「設定」シートの項目名 → サイト内部のキー */
var CONFIG_KEYS = {
  'クラブ名（英語）': 'club_name',
  'クラブ名（日本語）': 'club_name_ja',
  'スローガン': 'tagline',
  '設立年': 'founded',
  '活動拠点': 'home_ground',
  '所属リーグ': 'league',
  'InstagramのURL': 'instagram_url',
  'XのURL': 'x_url',
  '問い合わせメールアドレス': 'contact_email',
  'プレビュー帯を表示する': 'preview_mode',
  '選手の生年月日を公開する': 'show_birthday',
  '選手の身長を公開する': 'show_height',
  '選手の体重を公開する': 'show_weight',
  '選手の経歴を公開する': 'show_career'
};

/** 入力のプルダウン（初期設定で使う） */
var CHOICES = {
  '状態': ['（自動）', '延期', '中止'],
  'ホーム／アウェイ': ['ホーム', 'アウェイ'],
  'ポジション': ['GK', 'DF', 'MF', 'FW'],
  '表示': ['表示する', '表示しない'],
  '公開': ['公開', '下書き'],
  'サンプル': ['はい'],
  '区分': ['ユニフォームスポンサー', 'サポートスポンサー']
};

/* ================================================================
   サイトへの配信
   ================================================================ */

function doGet(e) {
  var out;
  try {
    var nocache = e && e.parameter && e.parameter.nocache;
    var cache = CacheService.getScriptCache();
    var hit = nocache ? null : cache.get('payload');
    if (hit) {
      out = hit;
    } else {
      out = JSON.stringify(buildPayload());
      try { cache.put('payload', out, CACHE_SECONDS); } catch (err) {}
    }
  } catch (err) {
    out = JSON.stringify({ error: String(err), source: 'gas-error' });
  }
  return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JSON);
}

function buildPayload() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var conf = readConfig(ss);
  var players = readPlayers(ss);

  // 「表示しない」に設定された項目は、ここで取り除いてから返す（サイトへ送らない）
  var SWITCH = { show_birthday: 'birthday', show_height: 'height',
                 show_weight: 'weight', show_career: 'career' };
  Object.keys(SWITCH).forEach(function (k) {
    if (conf[k] === false) {
      players.forEach(function (p) { delete p[SWITCH[k]]; });
    }
  });

  return {
    config: conf,
    matches: readMatches(ss),
    news: readNews(ss),
    players: players,
    staff: readStaff(ss),
    sponsors: readSponsors(ss),
    activity: readActivity(ss),
    generated_at: Utilities.formatDate(new Date(), 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ss"),
    source: 'sheets'
  };
}

/* ---------------- シートを見出し名で読む ---------------- */

function rows(ss, sheetName) {
  var sh = ss.getSheetByName(sheetName);
  if (!sh) return [];
  var v = sh.getDataRange().getValues();
  if (v.length < 2) return [];
  var header = v[0].map(function (h) { return String(h).trim(); });
  var out = [];
  for (var r = 1; r < v.length; r++) {
    var blank = true;
    for (var c = 0; c < v[r].length; c++) {
      if (String(v[r][c]).trim() !== '') { blank = false; break; }
    }
    if (blank) continue;              // 空行は飛ばす
    var o = { __row: r + 1 };
    header.forEach(function (h, i) { if (h) o[h] = v[r][i]; });
    out.push(o);
  }
  return out;
}

/* ---------------- 値の整え方 ---------------- */

function text(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy/MM/dd');
  return String(v).trim();
}

var TRUE_WORDS = ['TRUE', 'true', 'はい', '○', '◯', '表示する', '公開', 'する', '1', 'YES', 'yes'];
var FALSE_WORDS = ['FALSE', 'false', 'いいえ', '×', '表示しない', '下書き', 'しない', '0', 'NO', 'no'];

function bool(v, dflt) {
  if (v === true || v === false) return v;
  var s = text(v);
  if (TRUE_WORDS.indexOf(s) >= 0) return true;
  if (FALSE_WORDS.indexOf(s) >= 0) return false;
  return dflt === undefined ? false : dflt;
}

/** いろいろな書き方の日付を yyyy/MM/dd に揃える。読めなければ '' */
function ymd(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy/MM/dd');
  var s = String(v == null ? '' : v).trim();
  if (!s) return '';
  s = s.replace(/年/g, '/').replace(/月/g, '/').replace(/日/g, '');
  var m = s.match(/^(\d{4})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{1,2})/);
  if (!m) return '';
  return m[1] + '/' + ('0' + m[2]).slice(-2) + '/' + ('0' + m[3]).slice(-2);
}

/** 時刻を HH:mm に揃える */
function hhmm(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'HH:mm');
  var s = String(v == null ? '' : v).trim();
  if (!s) return '';
  var m = s.match(/^(\d{1,2})\s*[:：時]\s*(\d{1,2})/);
  return m ? ('0' + m[1]).slice(-2) + ':' + ('0' + m[2]).slice(-2) : s;
}

/** 「状態」欄と得点から、試合の状態を決める */
function matchStatus(stateRaw, area, opp) {
  var s = text(stateRaw);
  if (s === '延期' || s === '中止' || s === '中止・延期' || s === '順延') return ['cancelled', s];
  if (s === '予定' || s === '開催予定') return ['scheduled', ''];
  if (s === '終了' || s === '試合終了' || s === '結果あり') return ['finished', ''];
  var hasScore = text(area) !== '' && text(opp) !== '';
  return hasScore ? ['finished', ''] : ['scheduled', ''];
}

/* ---------------- 各シートの読み取り ---------------- */

function readMatches(ss) {
  return rows(ss, '試合').map(function (r, i) {
    var area = text(r['AREA得点']), opp = text(r['相手得点']);
    var st = matchStatus(r['状態'], area, opp);
    var ha = text(r['ホーム／アウェイ']);
    return {
      match_id: 'm' + ('00' + (i + 1)).slice(-3),
      date: ymd(r['開催日']),
      kickoff_time: hhmm(r['開始時刻']),
      competition: text(r['大会名']),
      opponent: text(r['対戦相手']),
      home_away: ha.charAt(0) === 'ホ' ? 'HOME' : (ha.charAt(0) === 'ア' ? 'AWAY' : ''),
      venue: text(r['会場']),
      area_score: area,
      opponent_score: opp,
      status: st[0],
      status_label: st[1],
      note: text(r['備考']),
      sample: bool(r['サンプル'])
    };
  }).filter(function (m) { return m.date; });
}

function readNews(ss) {
  var used = {};
  return rows(ss, 'ニュース').map(function (r) {
    var d = ymd(r['日付']);
    var base = 'n' + (d ? d.replace(/\//g, '') : 'x');
    used[base] = (used[base] || 0) + 1;
    return {
      news_id: used[base] === 1 ? base : base + '-' + used[base],
      date: d,
      category: text(r['カテゴリ']),
      title: text(r['見出し']),
      summary: text(r['概要']),
      body: String(r['本文'] == null ? '' : r['本文']).trim(),
      image: text(r['画像ファイル名']),
      url: text(r['外部リンク']),
      published: bool(r['公開'], true)
    };
  });
}

function readPlayers(ss) {
  return rows(ss, '選手').map(function (r) {
    return {
      number: text(r['背番号']),
      name: text(r['選手名']),
      name_kana: text(r['ふりがな']),
      position: text(r['ポジション']).toUpperCase(),
      image: text(r['写真ファイル名']) || 'players_nowprinting',
      birthday: text(r['生年月日']),
      height: text(r['身長']),
      weight: text(r['体重']),
      career: String(r['経歴'] == null ? '' : r['経歴']).trim(),
      profile: String(r['紹介文'] == null ? '' : r['紹介文']).trim(),
      active: bool(r['表示'], true),
      display_order: text(r['並び順'])
    };
  });
}

function readStaff(ss) {
  return rows(ss, 'スタッフ').map(function (r) {
    return {
      name: text(r['氏名']),
      name_kana: text(r['ふりがな']),
      role: text(r['役職']),
      image: text(r['写真ファイル名']) || 'staff_nowprinting',
      career: String(r['指導歴'] == null ? '' : r['指導歴']).trim(),
      license: text(r['指導者資格']),
      profile: String(r['紹介文'] == null ? '' : r['紹介文']).trim(),
      active: bool(r['表示'], true),
      display_order: text(r['並び順'])
    };
  });
}

function readSponsors(ss) {
  return rows(ss, 'スポンサー').map(function (r) {
    return {
      name: text(r['会社名・店名']),
      logo: text(r['ロゴファイル名']),
      url: text(r['ウェブサイトURL']),
      tier: text(r['区分']) || 'パートナー',
      active: bool(r['表示'], true),
      display_order: text(r['並び順'])
    };
  });
}

function readActivity(ss) {
  return rows(ss, 'Instagram').map(function (r) {
    return {
      post_url: text(r['投稿URL']),
      caption: text(r['メモ']),
      active: bool(r['表示'], true),
      display_order: text(r['並び順'])
    };
  });
}

function readConfig(ss) {
  var conf = {};
  rows(ss, '設定').forEach(function (r) {
    var key = CONFIG_KEYS[text(r['項目'])];
    if (!key) return;
    var v = text(r['設定値']);
    conf[key] = (key.indexOf('show_') === 0 || key === 'preview_mode') ? bool(v) : v;
  });
  return conf;
}

/* ================================================================
   スプレッドシートのメニュー
   ================================================================ */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('AREA OHYABA')
    .addItem('① 今すぐサイトへ反映する', 'clearCache')
    .addItem('② 入力内容をチェックする', 'validateSheets')
    .addSeparator()
    .addItem('はじめに1回だけ：入力しやすく整える', 'setupSheets')
    .addToUi();
}

function clearCache() {
  CacheService.getScriptCache().remove('payload');
  SpreadsheetApp.getUi().alert('サイトへ反映しました。\n\nホームページを開いて再読み込み（引っぱって更新）してください。');
}

/**
 * 入力しやすいように、見出しの固定・プルダウン・日付書式・列幅を設定する。
 * 何度実行しても問題ない。
 */
function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  function dropdown(sheetName, headerName, choices, allowOther) {
    var sh = ss.getSheetByName(sheetName);
    if (!sh) return;
    var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var col = header.indexOf(headerName) + 1;
    if (col <= 0) return;
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(choices, true)
      .setAllowInvalid(!!allowOther)
      .setHelpText(headerName + 'は ' + choices.join(' / ') + ' から選んでください')
      .build();
    sh.getRange(2, col, Math.max(sh.getMaxRows() - 1, 1), 1).setDataValidation(rule);
  }

  Object.keys(SHEETS).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) return;
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, sh.getLastColumn())
      .setBackground('#00264b').setFontColor('#ffffff').setFontWeight('bold');
  });

  // 試合シート
  var m = ss.getSheetByName('試合');
  if (m) {
    var mh = m.getRange(1, 1, 1, m.getLastColumn()).getValues()[0];
    var dCol = mh.indexOf('開催日') + 1;
    if (dCol > 0) m.getRange(2, dCol, Math.max(m.getMaxRows() - 1, 1), 1).setNumberFormat('yyyy/mm/dd');
    var tCol = mh.indexOf('開始時刻') + 1;
    if (tCol > 0) m.getRange(2, tCol, Math.max(m.getMaxRows() - 1, 1), 1).setNumberFormat('@'); // 文字列のまま
    m.setColumnWidth(1, 100);
    dropdown('試合', '状態', CHOICES['状態'], true);
    dropdown('試合', 'ホーム／アウェイ', CHOICES['ホーム／アウェイ'], true);
    dropdown('試合', 'サンプル', CHOICES['サンプル'], true);
  }

  dropdown('選手', 'ポジション', CHOICES['ポジション'], false);
  dropdown('選手', '表示', CHOICES['表示'], false);
  dropdown('スタッフ', '表示', CHOICES['表示'], false);
  dropdown('スポンサー', '表示', CHOICES['表示'], false);
  dropdown('スポンサー', '区分', CHOICES['区分'], true);
  dropdown('Instagram', '表示', CHOICES['表示'], false);
  dropdown('ニュース', '公開', CHOICES['公開'], false);
  dropdown('設定', '設定値', CHOICES['表示'], true);

  SpreadsheetApp.getUi().alert(
    '整えました。\n\n' +
    '・見出しの行を固定しました\n' +
    '・「状態」「表示」などはプルダウンで選べます\n' +
    '・開催日は 2026/09/20 の形で表示されます\n\n' +
    '※この作業は最初の1回だけで大丈夫です。');
}

/** よくある入力ミスを見つけて知らせる */
function validateSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var msg = [];

  rows(ss, '試合').forEach(function (r) {
    var line = r.__row;
    if (!ymd(r['開催日'])) {
      msg.push('［試合］' + line + '行目：開催日が読めません。2026/09/20 の形で入れてください（今: ' + text(r['開催日']) + '）');
    }
    if (!text(r['対戦相手'])) msg.push('［試合］' + line + '行目：対戦相手が空です');
    var a = text(r['AREA得点']), o = text(r['相手得点']);
    if ((a === '') !== (o === '')) msg.push('［試合］' + line + '行目：得点が片方だけ入っています（両方入れると自動で「結果」になります）');
    if (a !== '' && isNaN(Number(a))) msg.push('［試合］' + line + '行目：AREA得点が数字ではありません（' + a + '）');
    if (o !== '' && isNaN(Number(o))) msg.push('［試合］' + line + '行目：相手得点が数字ではありません（' + o + '）');
    var st = text(r['状態']);
    if (st && ['（自動）', '延期', '中止', '中止・延期', '順延', '予定', '終了'].indexOf(st) < 0) {
      msg.push('［試合］' + line + '行目：状態は空欄か「延期」「中止」です（今: ' + st + '）');
    }
  });

  rows(ss, '選手').forEach(function (r) {
    if (!bool(r['表示'], true)) return;
    if (!text(r['選手名'])) msg.push('［選手］' + r.__row + '行目：選手名が空です');
    if (['GK', 'DF', 'MF', 'FW'].indexOf(text(r['ポジション']).toUpperCase()) < 0) {
      msg.push('［選手］' + r.__row + '行目：ポジションは GK / DF / MF / FW のどれかです（今: ' + text(r['ポジション']) + '）');
    }
    if (!text(r['写真ファイル名'])) msg.push('［選手］' + r.__row + '行目：写真ファイル名が空です（写真が出ません）');
  });

  rows(ss, 'Instagram').forEach(function (r) {
    if (!bool(r['表示'], true)) return;
    if (!/^https:\/\/(www\.)?instagram\.com\/(p|reel)\//.test(text(r['投稿URL']))) {
      msg.push('［Instagram］' + r.__row + '行目：投稿URL（https://www.instagram.com/p/… ）を入れてください');
    }
  });

  rows(ss, 'ニュース').forEach(function (r) {
    if (!bool(r['公開'], true)) return;
    if (!ymd(r['日付'])) msg.push('［ニュース］' + r.__row + '行目：日付が読めません');
    if (!text(r['見出し'])) msg.push('［ニュース］' + r.__row + '行目：見出しが空です');
  });

  SpreadsheetApp.getUi().alert(
    msg.length ? '直したほうがよい点が ' + msg.length + ' 件あります：\n\n' + msg.slice(0, 30).join('\n')
               : '問題は見つかりませんでした。このまま公開して大丈夫です。');
}
