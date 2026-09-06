/* ==========================================================================
   AREA OHYABA FC — V2 application
   データ取得 → 自動振り分け → 描画。HTMLを編集しなくても内容が入れ替わる。
   ========================================================================== */
(function () {
  "use strict";

  var CACHE_KEY = "ao_site_data_v1";
  var CACHE_TTL = 5 * 60 * 1000; // 5分

  var AO = (window.AO = {});
  var D = null; // 読み込んだデータ

  /* ---------- 汎用 ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function truthy(v) { return v === true || v === "TRUE" || v === "true" || v === "1" || v === 1; }

  /* ---------- 日付 ---------- */
  var DOW = ["日", "月", "火", "水", "木", "金", "土"];
  function parseDate(s) {
    if (!s) return null;
    var m = String(s).trim().match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
    if (!m) { var d = new Date(s); return isNaN(d) ? null : d; }
    return new Date(+m[1], +m[2] - 1, +m[3]);
  }
  function fmtMD(d) { return d ? (d.getMonth() + 1) + "." + ("0" + d.getDate()).slice(-2) : ""; }
  function fmtYMD(d) { return d ? d.getFullYear() + "." + ("0" + (d.getMonth() + 1)).slice(-2) + "." + ("0" + d.getDate()).slice(-2) : ""; }
  function dow(d) { return d ? DOW[d.getDay()] : ""; }
  function today0() { var t = new Date(); t.setHours(0, 0, 0, 0); return t; }

  /* ---------- データ取得 ---------- */
  function readCache() {
    try {
      var raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || Date.now() - o.t > CACHE_TTL) return null;
      return o.d;
    } catch (e) { return null; }
  }
  function writeCache(d) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), d: d })); } catch (e) {}
  }
  function fetchJSON(url, timeout) {
    return new Promise(function (res, rej) {
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; rej(new Error("timeout")); } }, timeout || 8000);
      fetch(url, { cache: "no-store" })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(function (j) { if (!done) { done = true; clearTimeout(timer); res(j); } })
        .catch(function (e) { if (!done) { done = true; clearTimeout(timer); rej(e); } });
    });
  }
  function loadData() {
    var cached = readCache();
    if (cached) { D = cached; return Promise.resolve(D); }
    var api = window.AO_API_URL;
    var fallback = function () {
      return fetchJSON("data/site-data.json", 8000).then(function (j) {
        j.source = j.source || "static";
        return j;
      });
    };
    var p = api ? fetchJSON(api, 8000).catch(function () { return fallback(); }) : fallback();
    return p.then(function (j) { D = j; writeCache(j); return j; });
  }

  /* ---------- 設定 ---------- */
  function cfg(k, dflt) {
    var v = D && D.config ? D.config[k] : undefined;
    if (v === undefined || v === "") return dflt;
    return v;
  }
  function active(list) {
    return (list || []).filter(function (r) { return truthy(r.active); })
      .sort(function (a, b) { return (+a.display_order || 0) - (+b.display_order || 0); });
  }

  /* ---------- 試合の自動振り分け（要件10） ---------- */
  function withDate(list) {
    return (list || []).map(function (m) {
      var o = {}; for (var k in m) o[k] = m[k];
      o._d = parseDate(m.date);
      return o;
    }).filter(function (m) { return m._d; });
  }
  AO.matches = {
    next: function () {
      var t = today0();
      return withDate(D.matches).filter(function (m) { return m.status === "scheduled" && m._d >= t; })
        .sort(function (a, b) { return a._d - b._d; })[0] || null;
    },
    last: function () {
      return withDate(D.matches).filter(function (m) { return m.status === "finished"; })
        .sort(function (a, b) { return b._d - a._d; })[0] || null;
    },
    results: function () {
      return withDate(D.matches).filter(function (m) { return m.status === "finished"; })
        .sort(function (a, b) { return b._d - a._d; });
    },
    schedule: function () {
      var t = today0();
      return withDate(D.matches).filter(function (m) { return m.status !== "finished" && m._d >= t; })
        .sort(function (a, b) { return a._d - b._d; });
    },
    all: function () {
      return withDate(D.matches).sort(function (a, b) { return b._d - a._d; });
    },
    seasons: function () {
      var s = {};
      withDate(D.matches).forEach(function (m) { s[m._d.getFullYear()] = 1; });
      return Object.keys(s).map(Number).sort(function (a, b) { return b - a; });
    }
  };
  function outcome(m) {
    var a = parseInt(m.area_score, 10), b = parseInt(m.opponent_score, 10);
    if (isNaN(a) || isNaN(b)) return null;
    return a > b ? "W" : a < b ? "L" : "D";
  }

  /* ---------- 画像パス ---------- */
  function img(dir, name, size, alt, cls, lazy) {
    if (!name) return el("div", "skeleton");
    var src = "assets/img/" + dir + "/" + name + (size ? "-" + size : "") + ".webp";
    var i = el("img");
    i.src = src; i.alt = alt || ""; if (cls) i.className = cls;
    i.loading = lazy === false ? "eager" : "lazy";
    i.decoding = "async";
    i.addEventListener("error", function () { i.style.visibility = "hidden"; });
    return i;
  }

  /* ---------- 共通パーツ ---------- */
  var NAV = [
    { href: "index.html", en: "Home", ja: "ホーム", key: "home" },
    { href: "club.html", en: "Club", ja: "クラブ", key: "club" },
    { href: "players.html", en: "Players", ja: "選手・スタッフ", key: "players" },
    { href: "matches.html", en: "Matches", ja: "試合", key: "matches" },
    { href: "news.html", en: "News", ja: "ニュース", key: "news" }
  ];
  var IG_SVG = '<svg class="btn__ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.2c3.2 0 3.6 0 4.9.07 1.2.05 1.8.25 2.2.42.6.22 1 .48 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c0 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2 0-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c0-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4C8.4 2.2 8.8 2.2 12 2.2m0 2c-3.1 0-3.5 0-4.7.07-1.1.05-1.7.24-2.1.4-.5.2-.9.44-1.3.83-.4.4-.63.8-.83 1.3-.16.4-.35 1-.4 2.1C2.6 10.1 2.6 10.5 2.6 12s0 1.9.07 3.1c.05 1.1.24 1.7.4 2.1.2.5.44.9.83 1.3.4.4.8.63 1.3.83.4.16 1 .35 2.1.4 1.2.07 1.6.07 4.7.07s3.5 0 4.7-.07c1.1-.05 1.7-.24 2.1-.4.5-.2.9-.44 1.3-.83.4-.4.63-.8.83-1.3.16-.4.35-1 .4-2.1.07-1.2.07-1.6.07-3.1s0-1.9-.07-3.1c-.05-1.1-.24-1.7-.4-2.1a3.5 3.5 0 0 0-.83-1.3 3.5 3.5 0 0 0-1.3-.83c-.4-.16-1-.35-2.1-.4-1.2-.07-1.6-.07-4.7-.07z"/><path d="M12 6.9a5.1 5.1 0 1 0 0 10.2 5.1 5.1 0 0 0 0-10.2zm0 8.4a3.3 3.3 0 1 1 0-6.6 3.3 3.3 0 0 1 0 6.6z"/><circle cx="17.3" cy="6.7" r="1.2"/></svg>';

  function mountPreviewBar() {
    if (!truthy(cfg("preview_mode", false))) return;
    var bar = el("div", "preview-bar");
    bar.innerHTML =
      '<div class="wrap preview-bar__in"><b>PREVIEW</b>' +
      '<span>これは新しい公式サイトの<strong>確認用プレビュー</strong>です。現在の公式サイトは変更していません。' +
      '<span class="tag-sample">SAMPLE</span> が付いた試合は<strong>表示確認用のサンプル</strong>で、実際の予定ではありません。</span></div>';
    document.body.insertBefore(bar, document.body.firstChild);
  }

  function mountHeader() {
    var page = document.body.dataset.page;
    var hd = el("header", "hd");
    var nav = NAV.map(function (n) {
      return '<a href="' + n.href + '"' + (n.key === page ? ' aria-current="page"' : "") + '>' + n.ja + "</a>";
    }).join("");
    hd.innerHTML =
      '<div class="wrap hd__in">' +
        '<a class="hd__brand" href="index.html">' +
          '<img class="hd__emblem" src="assets/img/brand/emblem-192.webp" width="34" height="34" alt="">' +
          '<span class="hd__names"><span class="hd__en">AREA OHYABA FC</span>' +
          '<span class="hd__ja">エリア大谷場フットボールクラブ</span></span>' +
        "</a>" +
        '<nav class="hd__nav" aria-label="メインメニュー">' + nav + "</nav>" +
        '<a class="btn btn--ig btn--sm hd__ig" href="' + esc(cfg("instagram_url", "#")) + '" target="_blank" rel="noopener">' + IG_SVG + "Instagram</a>" +
        '<button class="burger" type="button" aria-label="メニューを開く" aria-expanded="false"><span></span></button>' +
      "</div>";

    var drawer = el("div", "drawer");
    drawer.innerHTML =
      "<nav aria-label='メインメニュー'>" +
      NAV.map(function (n) {
        return '<a href="' + n.href + '"' + (n.key === page ? ' aria-current="page"' : "") +
          '><span class="en">' + n.en + '</span><span class="ja">' + n.ja + "</span></a>";
      }).join("") +
      "</nav>" +
      '<div class="drawer__social">' +
        '<a class="btn btn--ig btn--sm" href="' + esc(cfg("instagram_url", "#")) + '" target="_blank" rel="noopener">' + IG_SVG + "Instagram</a>" +
        (cfg("x_url", "") ? '<a class="btn btn--on-dark btn--sm" href="' + esc(cfg("x_url")) + '" target="_blank" rel="noopener">X</a>' : "") +
      "</div>";

    document.body.insertBefore(drawer, document.body.firstChild);
    document.body.insertBefore(hd, document.body.firstChild);

    var burger = $(".burger", hd);
    burger.addEventListener("click", function () {
      var open = document.documentElement.classList.toggle("nav-open");
      burger.setAttribute("aria-expanded", String(open));
      burger.setAttribute("aria-label", open ? "メニューを閉じる" : "メニューを開く");
      document.body.style.overflow = open ? "hidden" : "";
    });
    $$("a", drawer).forEach(function (a) {
      a.addEventListener("click", function () {
        document.documentElement.classList.remove("nav-open");
        document.body.style.overflow = "";
      });
    });
  }

  function mountFooter() {
    var ft = el("footer", "ft");
    var year = new Date().getFullYear();
    ft.innerHTML =
      '<div class="wrap">' +
        '<div class="ft__top">' +
          "<div>" +
            '<div class="ft__brand">' +
              '<img src="assets/img/brand/emblem-192.webp" width="54" height="54" alt="">' +
              '<span class="ft__nm">AREA OHYABA FC<small>エリア大谷場フットボールクラブ / SINCE 2019</small></span>' +
            "</div>" +
            '<div class="ft__social" style="margin-top:18px">' +
              '<a class="btn btn--ig btn--sm" href="' + esc(cfg("instagram_url", "#")) + '" target="_blank" rel="noopener">' + IG_SVG + "@area.ohyaba</a>" +
              (cfg("x_url", "") ? '<a class="btn btn--on-dark btn--sm" href="' + esc(cfg("x_url")) + '" target="_blank" rel="noopener">X</a>' : "") +
              (cfg("contact_email", "") ? '<a class="btn btn--on-dark btn--sm" href="mailto:' + esc(cfg("contact_email")) + '">お問い合わせ</a>' : "") +
            "</div>" +
          "</div>" +
          '<nav class="ft__nav" aria-label="フッターメニュー">' +
            NAV.map(function (n) { return '<a href="' + n.href + '">' + n.ja + "</a>"; }).join("") +
          "</nav>" +
        "</div>" +
        '<p class="ft__cr">©2019 - ' + year + " AREA OHYABA FOOTBALL CLUB<br>" +
        "お問い合わせ・取材のご依頼は Instagram のダイレクトメッセージへお願いします。</p>" +
      "</div>";
    document.body.appendChild(ft);
  }

  /* ---------- 試合カード ---------- */
  function matchCard(m, kind) {
    // kind: "next" | "last"
    var card = el("article", "mcard mcard--" + kind);
    var isNext = kind === "next";
    var oc = outcome(m);
    var top = el("div", "mcard__top");
    top.innerHTML =
      '<span class="mcard__label">' + (isNext ? "Next Match" : "Last Match") + "</span>" +
      (truthy(m.sample) ? '<span class="tag-sample">SAMPLE</span>' : "") +
      '<span class="mcard__comp">' + esc(m.competition || "") + "</span>";
    card.appendChild(top);

    var body = el("div", "mcard__body");
    var dt = el("div", "mcard__date");
    dt.innerHTML =
      '<span class="mcard__d">' + fmtMD(m._d) + "</span>" +
      '<span class="mcard__dow">(' + dow(m._d) + ") " + m._d.getFullYear() + "</span>" +
      (m.kickoff_time ? '<span class="mcard__time">KICK OFF ' + esc(m.kickoff_time) + "</span>" : "");
    body.appendChild(dt);

    var vs = el("div", "mcard__vs");
    var home = el("div", "mcard__team");
    home.appendChild(img("brand", "emblem-192", null, "AREA OHYABA FC"));
    home.appendChild(el("span", "mcard__tn", "AREA OHYABA"));
    var mid = el("div", "mcard__score");
    if (oc) {
      mid.innerHTML = esc(m.area_score) + " - " + esc(m.opponent_score) +
        '<small><span class="mcard__badge badge--' + oc.toLowerCase() + '">' +
        (oc === "W" ? "WIN" : oc === "L" ? "LOSE" : "DRAW") + "</span></small>";
    } else {
      mid.innerHTML = "VS";
    }
    var away = el("div", "mcard__team");
    var ph = el("div", "mcard__team");
    away.innerHTML = '<div style="width:42px;height:42px;border-radius:50%;background:var(--paper-2);display:grid;place-items:center;font-weight:800;color:var(--text-2);font-size:15px">' +
      esc((m.opponent || "?").slice(0, 1)) + "</div>";
    away.appendChild(el("span", "mcard__tn", esc(m.opponent || "未定")));
    vs.appendChild(home); vs.appendChild(mid); vs.appendChild(away);
    body.appendChild(vs);
    card.appendChild(body);

    var foot = el("div", "mcard__foot");
    var bits = [];
    if (m.venue) bits.push("<span>📍 " + esc(m.venue) + "</span>");
    if (m.home_away) bits.push("<span>" + (m.home_away === "HOME" ? "🏠 ホーム" : "✈️ アウェイ") + "</span>");
    if (m.note) bits.push("<span>" + esc(m.note) + "</span>");
    if (bits.length) { foot.innerHTML = bits.join(""); card.appendChild(foot); }
    return card;
  }

  function matchRow(m) {
    var row = el("article", "mrow");
    var oc = outcome(m);
    var right = m.status === "finished"
      ? '<span class="mrow__sc">' + esc(m.area_score) + " - " + esc(m.opponent_score) + "</span>" +
        (oc ? '<span class="mcard__badge badge--' + oc.toLowerCase() + '">' + (oc === "W" ? "WIN" : oc === "L" ? "LOSE" : "DRAW") + "</span>" : "")
      : m.status === "cancelled"
        ? '<span class="mrow__st">中止・延期</span>'
        : '<span class="mrow__sc">VS</span><span class="mrow__st">' + (m.kickoff_time ? esc(m.kickoff_time) + " KO" : "予定") + "</span>";
    row.innerHTML =
      '<div class="mrow__date">' + fmtMD(m._d) + "<small>" + m._d.getFullYear() + " (" + dow(m._d) + ")</small></div>" +
      '<div class="mrow__main"><div class="mrow__opp">' + esc(m.opponent || "未定") +
        (truthy(m.sample) ? ' <span class="tag-sample">SAMPLE</span>' : "") + "</div>" +
        '<div class="mrow__meta">' + esc(m.competition || "") +
        (m.venue ? " ／ " + esc(m.venue) : "") +
        (m.home_away ? " ／ " + esc(m.home_away === "HOME" ? "ホーム" : "アウェイ") : "") + "</div></div>" +
      '<div class="mrow__right">' + right + "</div>";
    return row;
  }

  /* ---------- 選手 ---------- */
  function playerCard(p) {
    var b = el("button", "pcard");
    b.type = "button";
    b.setAttribute("aria-label", p.name + " の詳細を開く");
    var ph = el("div", "pcard__ph");
    ph.appendChild(img("players", p.image, "480", p.name + " 選手"));
    ph.appendChild(el("span", "pcard__no", esc(p.number || "")));
    ph.appendChild(el("span", "pcard__pos", esc(p.position || "")));
    b.appendChild(ph);
    b.appendChild(el("div", "pcard__info",
      '<div class="pcard__nm">' + esc(p.name) + "</div>" +
      '<div class="pcard__kn">' + esc(p.name_kana || "") + "</div>"));
    b.addEventListener("click", function () { openPlayer(p); });
    return b;
  }

  function openPlayer(p) {
    var modal = $("#player-modal");
    var panel = $(".modal__panel", modal);
    var rows = [];
    if (truthy(cfg("show_birthday", true)) && p.birthday) rows.push(["生年月日", p.birthday]);
    if (truthy(cfg("show_height", true)) && p.height) rows.push(["身長", p.height]);
    if (truthy(cfg("show_weight", true)) && p.weight) rows.push(["体重", p.weight]);
    if (truthy(cfg("show_career", true)) && p.career) rows.push(["経歴", p.career]);
    if (p.profile) rows.push(["プロフィール", p.profile]);

    panel.innerHTML =
      '<button class="modal__close" type="button" aria-label="閉じる">×</button>' +
      '<div class="modal__hero">' +
        '<img src="assets/img/players/' + esc(p.image) + '-480.webp" alt="' + esc(p.name) + '">' +
        '<div class="modal__id"><div class="modal__no">' + esc(p.number || "") + "</div>" +
        '<div class="modal__nm">' + esc(p.name) + "</div>" +
        '<div class="modal__kn">' + esc(p.name_kana || "") + "</div></div>" +
        '<div class="modal__pos">' + esc(p.position || "") + "</div>" +
      "</div>" +
      (rows.length
        ? '<dl class="dl">' + rows.map(function (r) {
            return "<dt>" + esc(r[0]) + "</dt><dd>" + esc(r[1]) + "</dd>";
          }).join("") + "</dl>"
        : '<p style="padding:22px 18px;color:var(--text-2);font-size:13px">登録されている情報はありません。</p>');

    modal.classList.add("is-open");
    document.body.style.overflow = "hidden";
    $(".modal__close", panel).addEventListener("click", closeModal);
    $(".modal__close", panel).focus();
  }
  function openStaff(s) {
    var modal = $("#player-modal");
    var panel = $(".modal__panel", modal);
    var rows = [];
    if (s.career) rows.push(["指導歴", s.career]);
    if (s.license) rows.push(["指導者資格", s.license]);
    if (s.profile) rows.push(["プロフィール", s.profile]);
    panel.innerHTML =
      '<button class="modal__close" type="button" aria-label="閉じる">×</button>' +
      '<div class="modal__hero">' +
        '<img src="assets/img/staff/' + esc(s.image) + '-480.webp" alt="' + esc(s.name) + '">' +
        '<div class="modal__id"><div class="modal__nm" style="font-size:22px">' + esc(s.name) + "</div>" +
        '<div class="modal__kn">' + esc(s.name_kana || "") + "</div></div>" +
        '<div class="modal__pos">' + esc(s.role || "") + "</div>" +
      "</div>" +
      (rows.length ? '<dl class="dl">' + rows.map(function (r) {
        return "<dt>" + esc(r[0]) + "</dt><dd>" + esc(r[1]) + "</dd>";
      }).join("") + "</dl>" : "");
    modal.classList.add("is-open");
    document.body.style.overflow = "hidden";
    $(".modal__close", panel).addEventListener("click", closeModal);
  }
  function closeModal() {
    var m = $("#player-modal");
    if (m) m.classList.remove("is-open");
    document.body.style.overflow = "";
  }
  function mountModal() {
    if ($("#player-modal")) return;
    var m = el("div", "modal");
    m.id = "player-modal";
    m.setAttribute("role", "dialog");
    m.setAttribute("aria-modal", "true");
    m.innerHTML = '<div class="modal__scrim"></div><div class="modal__panel"></div>';
    document.body.appendChild(m);
    $(".modal__scrim", m).addEventListener("click", closeModal);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });
  }

  /* ---------- Instagram（公式埋め込み・トークン不要） ---------- */
  var igLoaded = false;
  function loadIgScript() {
    if (igLoaded) { if (window.instgrm) window.instgrm.Embeds.process(); return; }
    igLoaded = true;
    var s = document.createElement("script");
    s.src = "https://www.instagram.com/embed.js";
    s.async = true;
    s.onload = function () { if (window.instgrm) window.instgrm.Embeds.process(); };
    document.body.appendChild(s);
  }
  function renderActivity(host) {
    var list = active(D.activity).slice(0, 3);
    host.innerHTML = "";
    if (!list.length) { host.appendChild(el("p", "loading", "現在表示できる投稿がありません。")); return; }
    list.forEach(function (a) {
      var slot = el("div", "ig-slot");
      var permalink = String(a.post_url || "").split("?")[0];
      slot.innerHTML =
        '<blockquote class="instagram-media" data-instgrm-permalink="' + esc(permalink) +
        '" data-instgrm-version="14" style="margin:0;width:100%;min-width:0;border:0"></blockquote>';
      host.appendChild(slot);
      // 埋め込みが表示されない・中身が空のままのときは、投稿へのリンクカードへ切り替える
      // （通信環境やブラウザの設定でInstagramが読み込めない場合の保険）
      setTimeout(function () {
        var f = slot.querySelector("iframe");
        var h = f ? f.getBoundingClientRect().height : 0;
        if (!f || h < 150) {
          slot.innerHTML =
            '<div class="ig-fallback">' +
              '<div class="ig-fallback__t">Instagramの最新投稿</div>' +
              '<div class="ig-fallback__d">投稿がここに表示されない場合は、下のボタンからご覧ください。</div>' +
              '<a class="btn btn--ig btn--sm" href="' + esc(permalink) + '" target="_blank" rel="noopener">' + IG_SVG + "投稿を見る</a>" +
            "</div>";
        }
      }, 9000);
    });
    // 画面に入ったときだけ読み込む（初期表示を軽くする）
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (ents) {
        if (ents.some(function (e) { return e.isIntersecting; })) { loadIgScript(); io.disconnect(); }
      }, { rootMargin: "300px" });
      io.observe(host);
    } else { loadIgScript(); }
  }

  /* ---------- スポンサー ---------- */
  function renderSponsors(host) {
    var list = active(D.sponsors);
    var tiers = {};
    list.forEach(function (s) { (tiers[s.tier || "パートナー"] = tiers[s.tier || "パートナー"] || []).push(s); });
    host.innerHTML = "";
    Object.keys(tiers).forEach(function (t, idx) {
      var sec = el("div", "tier");
      sec.appendChild(el("h3", "tier__h", esc(t)));
      var grid = el("div", "sponsors" + (idx === 0 ? " sponsors--main" : ""));
      tiers[t].forEach(function (s) {
        var box = s.url ? el("a", "sponsor") : el("div", "sponsor");
        if (s.url) { box.href = s.url; box.target = "_blank"; box.rel = "noopener"; }
        var i = img("sponsors", s.logo, null, s.name && s.name.indexOf("【") !== 0 ? s.name : "スポンサーロゴ");
        box.appendChild(i);
        if (s.name && s.name.indexOf("【") !== 0) box.title = s.name;
        grid.appendChild(box);
      });
      sec.appendChild(grid);
      host.appendChild(sec);
    });
  }

  /* ---------- ニュース ---------- */
  function newsList() {
    return (D.news || []).filter(function (n) { return truthy(n.published); })
      .map(function (n) { var o = {}; for (var k in n) o[k] = n[k]; o._d = parseDate(n.date); return o; })
      .sort(function (a, b) { return (b._d || 0) - (a._d || 0); });
  }
  function newsCard(n) {
    var href = n.url ? n.url : "news-detail.html?id=" + encodeURIComponent(n.news_id);
    var a = el("a", "ncard");
    a.href = href;
    if (n.url) { a.target = "_blank"; a.rel = "noopener"; }
    if (n.image) {
      var ph = el("div", "ncard__ph");
      ph.appendChild(img("news", n.image, "800", ""));
      a.appendChild(ph);
    } else {
      a.classList.add("ncard--noimg");
    }
    a.appendChild(el("div", "ncard__b",
      '<div class="ncard__m"><span class="ncard__date">' + fmtYMD(n._d) + "</span>" +
      (n.category ? '<span class="ncard__cat">' + esc(n.category) + "</span>" : "") + "</div>" +
      '<div class="ncard__t">' + esc(n.title) + "</div>" +
      (n.summary ? '<div class="ncard__s">' + esc(n.summary) + "</div>" : "")));
    return a;
  }

  /* ==========================================================================
     ページ別の描画
     ========================================================================== */
  var pages = {};

  pages.home = function () {
    // NEXT / LAST
    var fx = $("#fixtures");
    fx.innerHTML = "";
    var nx = AO.matches.next(), lt = AO.matches.last();
    if (nx) fx.appendChild(matchCard(nx, "next"));
    else {
      var c = el("article", "mcard mcard--next");
      c.innerHTML = '<div class="mcard__top"><span class="mcard__label">Next Match</span></div>' +
        '<div class="mcard__empty">次の試合が決まりしだい、ここに自動で表示されます。</div>';
      fx.appendChild(c);
    }
    if (lt) fx.appendChild(matchCard(lt, "last"));

    // LATEST ACTIVITY
    renderActivity($("#activity"));

    // PLAYERS（TOPは8名）
    var pg = $("#players-preview");
    if (pg) {
      var ps = active(D.players).slice(0, 8);
      pg.innerHTML = "";
      ps.forEach(function (p) { pg.appendChild(playerCard(p)); });
    }

    // MATCHES（直近6件）
    var ml = $("#matches-preview");
    var recent = AO.matches.schedule().slice(0, 3).concat(AO.matches.results().slice(0, 3));
    recent.sort(function (a, b) { return b._d - a._d; });
    ml.innerHTML = "";
    recent.forEach(function (m) { ml.appendChild(matchRow(m)); });

    // NEWS（3件）
    var ng = $("#news-preview");
    ng.innerHTML = "";
    newsList().slice(0, 3).forEach(function (n) { ng.appendChild(newsCard(n)); });

    // PARTNERS
    renderSponsors($("#sponsors"));

    // ヒーローの帯
    var chips = $("#hero-chips");
    if (chips) {
      chips.innerHTML =
        '<span class="hero__chip">SINCE ' + esc(cfg("founded", "2019")) + "</span>" +
        '<span class="hero__chip">' + esc(cfg("league", "")) + "</span>" +
        '<span class="hero__chip">' + esc(cfg("home_ground", "")) + "</span>";
    }
    var tag = $("#hero-tagline");
    if (tag) tag.textContent = cfg("tagline", "");
    var igb = $$(".js-ig-link");
    igb.forEach(function (a) { a.href = cfg("instagram_url", "#"); });
  };

  pages.club = function () {
    var igb = $$(".js-ig-link");
    igb.forEach(function (a) { a.href = cfg("instagram_url", "#"); });
    var f = $("#club-facts");
    if (f) {
      f.innerHTML =
        "<div><dt>クラブ名</dt><dd>" + esc(cfg("club_name", "AREA OHYABA FC")) + "（" + esc(cfg("club_name_ja", "")) + "）</dd></div>" +
        "<div><dt>設立</dt><dd>" + esc(cfg("founded", "2019")) + "年</dd></div>" +
        "<div><dt>所属リーグ</dt><dd>" + esc(cfg("league", "")) + "</dd></div>" +
        "<div><dt>活動拠点</dt><dd>" + esc(cfg("home_ground", "")) + "</dd></div>" +
        "<div><dt>スローガン</dt><dd>" + esc(cfg("tagline", "")) + "</dd></div>";
    }
  };

  pages.players = function () {
    var host = $("#players");
    var list = active(D.players);
    var ORDER = ["GK", "DF", "MF", "FW"];
    host.innerHTML = "";
    ORDER.forEach(function (pos) {
      var g = list.filter(function (p) { return (p.position || "").toUpperCase() === pos; });
      if (!g.length) return;
      var LABEL = { GK: "ゴールキーパー", DF: "ディフェンダー", MF: "ミッドフィールダー", FW: "フォワード" };
      var h = el("h3", "pos-head", pos + "<span>" + LABEL[pos] + "</span>");
      host.appendChild(h);
      var grid = el("div", "pgrid");
      g.forEach(function (p) { grid.appendChild(playerCard(p)); });
      host.appendChild(grid);
    });
    var other = list.filter(function (p) { return ORDER.indexOf((p.position || "").toUpperCase()) < 0; });
    if (other.length) {
      host.appendChild(el("h3", "pos-head", "OTHER"));
      var g2 = el("div", "pgrid");
      other.forEach(function (p) { g2.appendChild(playerCard(p)); });
      host.appendChild(g2);
    }

    var sh = $("#staff");
    var st = active(D.staff);
    sh.innerHTML = "";
    var sg = el("div", "sgrid");
    st.forEach(function (s) {
      var b = el("button", "scard");
      b.type = "button";
      var ph = el("div", "scard__ph");
      ph.appendChild(img("staff", s.image, "480", s.name));
      b.appendChild(ph);
      b.appendChild(el("div", "scard__info",
        '<div class="scard__role">' + esc(s.role || "") + "</div>" +
        '<div class="scard__nm">' + esc(s.name) + "</div>" +
        '<div class="scard__kn">' + esc(s.name_kana || "") + "</div>"));
      b.addEventListener("click", function () { openStaff(s); });
      sg.appendChild(b);
    });
    sh.appendChild(sg);
    $("#players-count").textContent = list.length;
    $("#staff-count").textContent = st.length;
  };

  pages.matches = function () {
    var fx = $("#fixtures");
    fx.innerHTML = "";
    var nx = AO.matches.next(), lt = AO.matches.last();
    if (nx) fx.appendChild(matchCard(nx, "next"));
    if (lt) fx.appendChild(matchCard(lt, "last"));

    var seasons = AO.matches.seasons();
    var state = { season: seasons[0], mode: "all" };

    var fs = $("#filters");
    function paintFilters() {
      fs.innerHTML =
        '<div class="filters" id="f-season">' +
          seasons.map(function (y) {
            return '<button class="chip" type="button" data-y="' + y + '" aria-pressed="' + (y === state.season) + '">' + y + "年</button>";
          }).join("") +
        "</div>" +
        '<div class="filters" id="f-mode">' +
          [["all", "すべて"], ["scheduled", "予定"], ["finished", "結果"]].map(function (m) {
            return '<button class="chip" type="button" data-m="' + m[0] + '" aria-pressed="' + (m[0] === state.mode) + '">' + m[1] + "</button>";
          }).join("") +
        "</div>";
      $$("#f-season .chip").forEach(function (b) {
        b.addEventListener("click", function () { state.season = +b.dataset.y; paintFilters(); paintList(); });
      });
      $$("#f-mode .chip").forEach(function (b) {
        b.addEventListener("click", function () { state.mode = b.dataset.m; paintFilters(); paintList(); });
      });
    }
    function paintList() {
      var host = $("#match-list");
      var rows = AO.matches.all().filter(function (m) {
        if (m._d.getFullYear() !== state.season) return false;
        if (state.mode === "finished") return m.status === "finished";
        if (state.mode === "scheduled") return m.status !== "finished";
        return true;
      });
      host.innerHTML = "";
      if (!rows.length) { host.appendChild(el("p", "loading", "この条件に当てはまる試合はありません。")); return; }
      var list = el("div", "mlist");
      rows.forEach(function (m) { list.appendChild(matchRow(m)); });
      host.appendChild(list);
    }
    paintFilters(); paintList();
  };

  pages.news = function () {
    var host = $("#news-list");
    var list = newsList();
    host.innerHTML = "";
    if (!list.length) { host.appendChild(el("p", "loading", "お知らせはまだありません。")); return; }
    var grid = el("div", "ngrid");
    list.forEach(function (n) { grid.appendChild(newsCard(n)); });
    host.appendChild(grid);
  };

  pages["news-detail"] = function () {
    var id = new URLSearchParams(location.search).get("id");
    var n = newsList().filter(function (x) { return x.news_id === id; })[0];
    var host = $("#article");
    if (!n) {
      host.innerHTML = '<p class="err">お探しのお知らせが見つかりませんでした。<a href="news.html">ニュース一覧へ戻る</a></p>';
      return;
    }
    document.title = n.title + " | AREA OHYABA FC";
    var paras = String(n.body || n.summary || "").split(/\n+/).filter(Boolean);
    host.innerHTML =
      '<div class="article__head">' +
        '<div class="ncard__m"><span class="ncard__date">' + fmtYMD(n._d) + "</span>" +
        (n.category ? '<span class="ncard__cat">' + esc(n.category) + "</span>" : "") + "</div>" +
        '<h1 class="article__t">' + esc(n.title) + "</h1>" +
      "</div>" +
      (n.image ? '<div class="article__figs"><img src="assets/img/news/' + esc(n.image) + '-800.webp" alt=""></div>' : "") +
      '<div class="article__body">' + paras.map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("") + "</div>" +
      '<p style="margin-top:30px"><a class="btn btn--ghost" href="news.html">← ニュース一覧へ戻る</a></p>';
  };

  /* ---------- 起動 ---------- */
  function boot() {
    var page = document.body.dataset.page;
    loadData().then(function () {
      mountPreviewBar();
      mountHeader();
      mountModal();
      try { (pages[page] || function () {})(); }
      catch (e) {
        console.error(e);
        var m = $("main");
        if (m) m.insertBefore(el("div", "err", "内容の表示中に問題が発生しました。ページを再読み込みしてください。"), m.firstChild);
      }
      mountFooter();
      document.body.classList.add("is-ready");
      $$(".loading").forEach(function (n) { if (!n.dataset.keep) n.remove(); });
    }).catch(function (e) {
      console.error(e);
      mountHeader();
      var m = $("main") || document.body;
      m.insertBefore(el("div", "wrap"), m.firstChild);
      $(".wrap", m).appendChild(el("div", "err",
        "データを読み込めませんでした。通信環境を確認して、ページを再読み込みしてください。"));
      mountFooter();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
