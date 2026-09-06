#!/usr/bin/env bash
# site/ の中身を gh-pages ブランチのルートへ公開する（確認用プレビュー）
# 使い方: tools/deploy_preview.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
TMP="$(mktemp -d)"
cp -a site/. "$TMP/"
git worktree remove --force .gh-pages 2>/dev/null || true
git worktree add --force -B gh-pages .gh-pages 2>/dev/null || git worktree add --force .gh-pages gh-pages
find .gh-pages -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -a "$TMP/." .gh-pages/
rm -rf "$TMP"
cd .gh-pages
git add -A
if git diff --cached --quiet; then
  echo "変更なし"
else
  git -c user.name="taishi16" -c user.email="sss.kanto@spool.co.jp" \
      commit -q -m "プレビュー更新 $(date '+%Y-%m-%d %H:%M')"
  git push -q -f origin gh-pages
  echo "公開しました"
fi
cd "$ROOT"
git worktree remove --force .gh-pages
