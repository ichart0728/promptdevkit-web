#!/usr/bin/env bash
set -euo pipefail

if ! command -v supabase >/dev/null 2>&1; then
  echo "Supabase CLI が見つかりません。\`npm i -g supabase\` などでインストールしてください。" >&2
  exit 1
fi

STATUS_OUTPUT=$(supabase status -o env 2>/dev/null || true)

if ! echo "$STATUS_OUTPUT" | grep -q '^SUPABASE_DB_URL='; then
  # Fallback for older CLI versions that exposed the flag as --env
  STATUS_OUTPUT=$(supabase status --env 2>/dev/null || true)
fi

if ! echo "$STATUS_OUTPUT" | grep -q '^SUPABASE_DB_URL='; then
  echo "Supabase ローカル環境が起動していないか、接続情報を取得できませんでした。\`supabase start\` を実行してから再度試してください。" >&2
  exit 1
fi

SUPABASE_DB_URL=$(echo "$STATUS_OUTPUT" | grep '^SUPABASE_DB_URL=' | tail -n1 | cut -d '=' -f2-)

if [ -z "$SUPABASE_DB_URL" ]; then
  echo "SUPABASE_DB_URL を取得できませんでした。\`supabase status --debug\` で状態を確認してください。" >&2
  exit 1
fi

supabase gen types typescript --schema public --db-url "$SUPABASE_DB_URL" > apps/frontend/src/lib/supabase.types.ts

echo "Generated apps/frontend/src/lib/supabase.types.ts from local Supabase instance."
