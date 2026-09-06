#!/usr/bin/env python3
"""sheets/*.csv（日本語見出し） -> site/data/site-data.json

Googleスプレッドシートが読めないときにサイトが使う「控えデータ」を作る。
Apps Script (gas/Code.gs) が返すJSONと同じ形にすること。
"""
import csv
import json
import os
import sys
import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sheet_schema import CONFIG_KEYS, to_bool, to_date, to_time, to_text, match_status

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "sheets")
OUT = os.path.join(ROOT, "site", "data")


def load(name):
    path = os.path.join(SRC, name + ".csv")
    with open(path, encoding="utf-8-sig", newline="") as f:
        return [r for r in csv.DictReader(f) if any((v or "").strip() for v in r.values())]


def build():
    data = {}

    # ---------------- 試合 ----------------
    matches = []
    for i, r in enumerate(load("試合"), 1):
        date = to_date(r.get("開催日"))
        if not date:
            continue
        area, opp = to_text(r.get("AREA得点")), to_text(r.get("相手得点"))
        status, label = match_status(r.get("状態"), area, opp)
        ha = to_text(r.get("ホーム／アウェイ"))
        matches.append({
            "match_id": "m%03d" % i,
            "date": date,
            "kickoff_time": to_time(r.get("開始時刻")),
            "competition": to_text(r.get("大会名")),
            "opponent": to_text(r.get("対戦相手")),
            "home_away": "HOME" if ha.startswith("ホ") else ("AWAY" if ha.startswith("ア") else ""),
            "venue": to_text(r.get("会場")),
            "area_score": area,
            "opponent_score": opp,
            "status": status,
            "status_label": label,
            "note": to_text(r.get("備考")),
            "sample": to_bool(r.get("サンプル")),
        })
    data["matches"] = matches

    # ---------------- ニュース ----------------
    news, used = [], {}
    for r in load("ニュース"):
        date = to_date(r.get("日付"))
        base = "n" + (date.replace("/", "") if date else "x")
        used[base] = used.get(base, 0) + 1
        news.append({
            "news_id": base if used[base] == 1 else "%s-%d" % (base, used[base]),
            "date": date,
            "category": to_text(r.get("カテゴリ")),
            "title": to_text(r.get("見出し")),
            "summary": to_text(r.get("概要")),
            "body": (r.get("本文") or "").strip(),
            "image": to_text(r.get("画像ファイル名")),
            "url": to_text(r.get("外部リンク")),
            "published": to_bool(r.get("公開"), True),
        })
    data["news"] = news

    # ---------------- 選手 ----------------
    data["players"] = [{
        "number": to_text(r.get("背番号")),
        "name": to_text(r.get("選手名")),
        "name_kana": to_text(r.get("ふりがな")),
        "position": to_text(r.get("ポジション")).upper(),
        "image": to_text(r.get("写真ファイル名")) or "players_nowprinting",
        "birthday": to_text(r.get("生年月日")),
        "height": to_text(r.get("身長")),
        "weight": to_text(r.get("体重")),
        "career": (r.get("経歴") or "").strip(),
        "profile": (r.get("紹介文") or "").strip(),
        "active": to_bool(r.get("表示"), True),
        "display_order": to_text(r.get("並び順")),
    } for r in load("選手")]

    # ---------------- スタッフ ----------------
    data["staff"] = [{
        "name": to_text(r.get("氏名")),
        "name_kana": to_text(r.get("ふりがな")),
        "role": to_text(r.get("役職")),
        "image": to_text(r.get("写真ファイル名")) or "staff_nowprinting",
        "career": (r.get("指導歴") or "").strip(),
        "license": to_text(r.get("指導者資格")),
        "profile": (r.get("紹介文") or "").strip(),
        "active": to_bool(r.get("表示"), True),
        "display_order": to_text(r.get("並び順")),
    } for r in load("スタッフ")]

    # ---------------- スポンサー ----------------
    data["sponsors"] = [{
        "name": to_text(r.get("会社名・店名")),
        "logo": to_text(r.get("ロゴファイル名")),
        "url": to_text(r.get("ウェブサイトURL")),
        "tier": to_text(r.get("区分")) or "パートナー",
        "active": to_bool(r.get("表示"), True),
        "display_order": to_text(r.get("並び順")),
    } for r in load("スポンサー")]

    # ---------------- Instagram ----------------
    data["activity"] = [{
        "post_url": to_text(r.get("投稿URL")),
        "caption": to_text(r.get("メモ")),
        "active": to_bool(r.get("表示"), True),
        "display_order": to_text(r.get("並び順")),
    } for r in load("Instagram")]

    # ---------------- 設定 ----------------
    conf = {}
    for r in load("設定"):
        key = CONFIG_KEYS.get(to_text(r.get("項目")))
        if not key:
            continue
        val = to_text(r.get("設定値"))
        conf[key] = to_bool(val) if (key.startswith("show_") or key == "preview_mode") else val
    data["config"] = conf

    # 非公開スイッチが切られている項目は、ここで完全に取り除く
    for key, col in (("show_birthday", "birthday"), ("show_height", "height"),
                     ("show_weight", "weight"), ("show_career", "career")):
        if conf.get(key) is False:
            for p in data["players"]:
                p.pop(col, None)

    data["generated_at"] = datetime.datetime.now().isoformat(timespec="seconds")
    data["source"] = "static"
    return data


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    d = build()
    path = os.path.join(OUT, "site-data.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
    n = {k: len(v) for k, v in d.items() if isinstance(v, list)}
    st = {}
    for m in d["matches"]:
        st[m["status"]] = st.get(m["status"], 0) + 1
    print("site/data/site-data.json を生成")
    print("  件数:", n, "/ 設定", len(d["config"]), "件")
    print("  試合の自動判定:", st)
    print("  サイズ:", os.path.getsize(path), "bytes")
