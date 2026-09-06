#!/usr/bin/env bash
# 現行サイトの元画像 → V2用の最適化画像(WebP + JPEGフォールバック)を生成
# 元画像は BACKUP/ に保持したまま、site/assets/img/ へ出力する
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/BACKUP/area-ohyaba.sub.jp/images"
OUT="$ROOT/site/assets/img"
mkdir -p "$OUT"/{hero,players,staff,sponsors,news,club,brand}

webp () { # webp <入力> <出力> <幅> <品質>
  ffmpeg -y -hide_banner -loglevel error -i "$1" \
    -vf "scale='min($3,iw)':-2:flags=lanczos" -c:v libwebp -quality "$4" -compression_level 6 "$2"
}
jpg () { ffmpeg -y -hide_banner -loglevel error -i "$1" -vf "scale='min($3,iw)':-2:flags=lanczos" -q:v "$4" "$2"; }
crop_webp () { # crop_webp <入力> <出力> <幅> <高> <品質>  中央を指定比率で切り抜き
  ffmpeg -y -hide_banner -loglevel error -i "$1" \
    -vf "scale=$3:$4:force_original_aspect_ratio=increase:flags=lanczos,crop=$3:$4" \
    -c:v libwebp -quality "$5" -compression_level 6 "$2"
}

echo "--- ブランド ---"
webp "$SRC/emblem.png" "$OUT/brand/emblem-512.webp" 512 92
webp "$SRC/emblem.png" "$OUT/brand/emblem-192.webp" 192 92
ffmpeg -y -hide_banner -loglevel error -i "$SRC/emblem.png" -vf "scale=512:512:flags=lanczos" "$OUT/brand/emblem-512.png"
ffmpeg -y -hide_banner -loglevel error -i "$SRC/emblem.png" -vf "scale=180:180:flags=lanczos" "$OUT/brand/apple-touch-icon.png"
ffmpeg -y -hide_banner -loglevel error -i "$SRC/emblem.png" -vf "scale=32:32:flags=lanczos" "$ROOT/site/favicon.png"

echo "--- ヒーロー(集合写真) ---"
for w in 1920 1280 800; do crop_webp "$SRC/slide7.jpg" "$OUT/hero/hero-$w.webp" $w $((w*9/16)) 74; done
jpg "$SRC/slide7.jpg" "$OUT/hero/hero-1280.jpg" 1280 6
# OGP (1200x630)
crop_webp "$SRC/slide7.jpg" "$OUT/hero/ogp.webp" 1200 630 80
ffmpeg -y -hide_banner -loglevel error -i "$SRC/slide7.jpg" \
  -vf "scale=1200:630:force_original_aspect_ratio=increase:flags=lanczos,crop=1200:630" -q:v 4 "$OUT/hero/ogp.jpg"

echo "--- クラブ写真 ---"
for f in slide6:away slide4:community about_us_top:story fixtures_top_2023:squad; do
  s="${f%%:*}"; d="${f##*:}"
  crop_webp "$SRC/$s.jpg" "$OUT/club/$d-1200.webp" 1200 800 76
  crop_webp "$SRC/$s.jpg" "$OUT/club/$d-640.webp"   640 427 76
done
webp "$SRC/mobile_top.jpg" "$OUT/club/tagline-800.webp" 800 78

echo "--- 選手 (3:4) ---"
for f in "$SRC"/players_*.jpg; do
  b="$(basename "$f" .jpg)"
  crop_webp "$f" "$OUT/players/$b-480.webp" 480 640 80
  crop_webp "$f" "$OUT/players/$b-240.webp" 240 320 80
done
echo "--- スタッフ (3:4) ---"
for f in "$SRC"/staff_*.jpg; do
  b="$(basename "$f" .jpg)"
  crop_webp "$f" "$OUT/staff/$b-480.webp" 480 640 80
  crop_webp "$f" "$OUT/staff/$b-240.webp" 240 320 80
done
echo "--- スポンサーロゴ ---"
for f in "$SRC"/partners_*.jpg; do
  b="$(basename "$f" .jpg)"
  webp "$f" "$OUT/sponsors/$b.webp" 410 88
done
echo "--- ニュース画像 ---"
for f in "$SRC"/news_*.jpg; do
  b="$(basename "$f" .jpg)"
  crop_webp "$f" "$OUT/news/$b-800.webp" 800 450 78
done
echo "完了"
