/**
 * AREA OHYABA FC — 公式サイト用 データ配信スクリプト
 * ------------------------------------------------------------------
 * Googleスプレッドシートの内容を、ホームページが読める形（JSON）で返す。
 * 費用は0円。Googleアカウントがあれば動く。
 *
 * 【重要】公開されるのは下の PUBLIC_COLUMNS に書いた列だけ。
 *         ここに無い列は、シートに入れてあってもサイトには出ない。
 * ------------------------------------------------------------------
 */

/** サイトに公開してよい列だけをシートごとに列挙する（ホワイトリスト方式） */
var PUBLIC_COLUMNS = {
  MATCHES:  ['match_id','date','kickoff_time','competition','opponent','home_away',
             'venue','area_score','opponent_score','status','note','sample'],
  NEWS:     ['news_id','date','category','title','summary','body','image','url','published'],
  PLAYERS:  ['player_id','number','name','name_kana','position','image',
             'birthday','height','weight','career','profile','active','display_order'],
  STAFF:    ['staff_id','name','name_kana','role','image','career','license','profile','active','display_order'],
  SPONSORS: ['sponsor_id','name','logo','url','tier','active','display_order'],
  ACTIVITY: ['activity_id','post_url','caption','active','display_order']
};

/** CONFIGの公開スイッチが FALSE のとき、PLAYERSから消す列 */
var PLAYER_FIELD_SWITCHES = {
  show_birthday: 'birthday',
  show_height:   'height',
  show_weight:   'weight',
  show_career:   'career'
};

var CACHE_SECONDS = 120; // シート編集は最大2分で反映される

/* ============================================================ */

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
  var config = readConfig(ss);

  var payload = {
    config: config,
    generated_at: Utilities.formatDate(new Date(), 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ss"),
    source: 'sheets'
  };

  Object.keys(PUBLIC_COLUMNS).forEach(function (name) {
    payload[name.toLowerCase()] = readSheet(ss, name, PUBLIC_COLUMNS[name]);
  });

  // 非公開スイッチが切られている項目は、ここで完全に取り除く（サイトへ渡さない）
  Object.keys(PLAYER_FIELD_SWITCHES).forEach(function (key) {
    if (config[key] === false) {
      var col = PLAYER_FIELD_SWITCHES[key];
      payload.players.forEach(function (p) { delete p[col]; });
    }
  });

  return payload;
}

function readSheet(ss, name, allowed) {
  var sh = ss.getSheetByName(name);
  if (!sh) return [];
  var values = sh.getDataRange().getDisplayValues();
  if (values.length < 2) return [];

  var header = values[0].map(function (h) { return String(h).trim(); });
  var idx = {};
  header.forEach(function (h, i) { if (allowed.indexOf(h) >= 0) idx[h] = i; });

  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var raw = values[r];
    if (raw.join('').trim() === '') continue; // 空行は飛ばす
    var o = {};
    allowed.forEach(function (col) {
      o[col] = (col in idx) ? normalize(raw[idx[col]]) : '';
    });
    rows.push(o);
  }
  return rows;
}

function readConfig(ss) {
  var sh = ss.getSheetByName('CONFIG');
  var conf = {};
  if (!sh) return conf;
  var v = sh.getDataRange().getDisplayValues();
  for (var r = 1; r < v.length; r++) {
    var key = String(v[r][0]).trim();
    if (!key) continue;
    conf[key] = normalize(v[r][1]);
  }
  return conf;
}

/** TRUE/FALSE は真偽値に、日付は yyyy/MM/dd に、それ以外は文字列に揃える */
function normalize(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy/MM/dd');
  var s = String(v).trim();
  var u = s.toUpperCase();
  if (u === 'TRUE')  return true;
  if (u === 'FALSE') return false;
  return s;
}

/* ============================================================
   便利機能（任意）
   スプレッドシートを開くとメニュー「AREA OHYABA」が出る。
   内容を直したのにサイトが変わらないときは「今すぐ反映する」を押す。
   ============================================================ */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('AREA OHYABA')
    .addItem('今すぐ反映する（キャッシュを消す）', 'clearCache')
    .addItem('入力内容をチェックする', 'validateSheets')
    .addToUi();
}

function clearCache() {
  CacheService.getScriptCache().remove('payload');
  SpreadsheetApp.getUi().alert('反映しました。ホームページを再読み込みしてください。');
}

/** よくある入力ミスを見つけて知らせる */
function validateSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var msg = [];
  var ok = ['scheduled', 'finished', 'cancelled'];

  var m = readSheet(ss, 'MATCHES', PUBLIC_COLUMNS.MATCHES);
  m.forEach(function (r, i) {
    var line = i + 2;
    if (!r.date) msg.push('MATCHES ' + line + '行目: 日付が空です');
    else if (!/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(r.date)) msg.push('MATCHES ' + line + '行目: 日付は 2026/09/13 の形で入れてください（今: ' + r.date + '）');
    if (ok.indexOf(r.status) < 0) msg.push('MATCHES ' + line + '行目: statusは scheduled / finished / cancelled のどれかです（今: ' + r.status + '）');
    if (r.status === 'finished' && (r.area_score === '' || r.opponent_score === ''))
      msg.push('MATCHES ' + line + '行目: finished なのに得点が空です');
    if (!r.opponent) msg.push('MATCHES ' + line + '行目: 対戦相手が空です');
  });

  var p = readSheet(ss, 'PLAYERS', PUBLIC_COLUMNS.PLAYERS);
  p.forEach(function (r, i) {
    if (r.active === true && !r.image) msg.push('PLAYERS ' + (i + 2) + '行目: 写真ファイル名が空です（写真が出ません）');
    if (r.active === true && !r.name)  msg.push('PLAYERS ' + (i + 2) + '行目: 名前が空です');
  });

  var a = readSheet(ss, 'ACTIVITY', PUBLIC_COLUMNS.ACTIVITY);
  a.forEach(function (r, i) {
    if (r.active === true && !/^https:\/\/www\.instagram\.com\/(p|reel)\//.test(r.post_url))
      msg.push('ACTIVITY ' + (i + 2) + '行目: Instagramの投稿URL（https://www.instagram.com/p/… ）を入れてください');
  });

  SpreadsheetApp.getUi().alert(msg.length ? '見つかった問題:\n\n' + msg.join('\n') : '問題は見つかりませんでした。');
}
