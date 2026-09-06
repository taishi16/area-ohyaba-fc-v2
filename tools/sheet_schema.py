#!/usr/bin/env python3
"""スプレッドシート（日本語見出し）の定義と、サイト用データへの変換ルール。

このファイルが「利用者が触る日本語の表」と「サイトが読む形」の対応表になる。
Apps Script (gas/Code.gs) にも同じルールを実装してあるので、
片方を変えたら必ず両方を合わせること。
"""

# ---------------------------------------------------------------- シート定義
# (シート名, 見出しの並び)
SHEETS = {
    "試合": ["開催日", "開始時刻", "大会名", "対戦相手", "ホーム／アウェイ", "会場",
             "AREA得点", "相手得点", "状態", "備考", "サンプル"],
    "ニュース": ["日付", "カテゴリ", "見出し", "概要", "本文", "画像ファイル名", "外部リンク", "公開"],
    "選手": ["背番号", "選手名", "ふりがな", "ポジション", "写真ファイル名",
             "生年月日", "身長", "体重", "経歴", "紹介文", "表示", "並び順"],
    "スタッフ": ["氏名", "ふりがな", "役職", "写真ファイル名", "指導歴", "指導者資格",
                 "紹介文", "表示", "並び順"],
    "スポンサー": ["会社名・店名", "ロゴファイル名", "ウェブサイトURL", "区分", "表示", "並び順"],
    "Instagram": ["投稿URL", "メモ", "表示", "並び順"],
    "設定": ["項目", "設定値", "説明"],
}

# 入力の選択肢（スプレッドシートのプルダウンにも使う）
CHOICES = {
    "状態": ["（自動）", "延期", "中止"],
    "ホーム／アウェイ": ["ホーム", "アウェイ"],
    "ポジション": ["GK", "DF", "MF", "FW"],
    "表示": ["表示する", "表示しない"],
    "公開": ["公開", "下書き"],
    "サンプル": ["", "はい"],
    "区分": ["ユニフォームスポンサー", "サポートスポンサー"],
}

# 設定シートの「項目」→ サイト内部のキー
CONFIG_KEYS = {
    "クラブ名（英語）": "club_name",
    "クラブ名（日本語）": "club_name_ja",
    "スローガン": "tagline",
    "設立年": "founded",
    "活動拠点": "home_ground",
    "所属リーグ": "league",
    "InstagramのURL": "instagram_url",
    "XのURL": "x_url",
    "問い合わせメールアドレス": "contact_email",
    "プレビュー帯を表示する": "preview_mode",
    "選手の生年月日を公開する": "show_birthday",
    "選手の身長を公開する": "show_height",
    "選手の体重を公開する": "show_weight",
    "選手の経歴を公開する": "show_career",
}

# ---------------------------------------------------------------- 値の正規化
TRUE_WORDS = {"TRUE", "true", "True", "はい", "○", "◯", "表示する", "公開", "する", "1", "YES", "yes"}
FALSE_WORDS = {"FALSE", "false", "False", "いいえ", "×", "表示しない", "下書き", "しない", "0", "NO", "no"}


def to_bool(v, default=False):
    if isinstance(v, bool):
        return v
    s = str(v).strip()
    if s in TRUE_WORDS:
        return True
    if s in FALSE_WORDS:
        return False
    return default


def to_date(v):
    """いろいろな書き方の日付を 'YYYY/MM/DD' に揃える。読めなければ ''。"""
    import re
    import datetime
    if isinstance(v, (datetime.datetime, datetime.date)):
        return "%04d/%02d/%02d" % (v.year, v.month, v.day)
    s = str(v).strip()
    if not s:
        return ""
    s = s.replace("年", "/").replace("月", "/").replace("日", "")
    m = re.match(r"^(\d{4})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{1,2})", s)
    if m:
        return "%04d/%02d/%02d" % (int(m.group(1)), int(m.group(2)), int(m.group(3)))
    return ""


def to_time(v):
    """'10:00' の形に揃える。読めなければ ''。"""
    import re
    import datetime
    if isinstance(v, (datetime.datetime, datetime.time)):
        return "%02d:%02d" % (v.hour, v.minute)
    s = str(v).strip()
    if not s:
        return ""
    m = re.match(r"^(\d{1,2})\s*[:：時]\s*(\d{1,2})", s)
    if m:
        return "%02d:%02d" % (int(m.group(1)), int(m.group(2)))
    return s


def to_text(v):
    if v is None:
        return ""
    if isinstance(v, float) and v == int(v):
        return str(int(v))
    return str(v).strip()


def match_status(state_raw, area_score, opp_score):
    """状態欄が空でも、得点の有無と日付から自動で判定する。
    戻り値: (status, 画面に出す日本語ラベル)"""
    s = to_text(state_raw)
    if s in ("延期", "中止", "中止・延期", "順延"):
        return "cancelled", s
    if s in ("予定", "開催予定"):
        return "scheduled", ""
    if s in ("終了", "試合終了", "結果あり"):
        return "finished", ""
    has_score = to_text(area_score) != "" and to_text(opp_score) != ""
    return ("finished", "") if has_score else ("scheduled", "")
