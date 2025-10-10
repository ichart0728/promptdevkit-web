# PromptDevKit Web Monorepo

このリポジトリは、フロントエンドアプリケーションと Supabase リソースを 1 つの pnpm ワークスペースで管理するための土台です。共通設定とスクリプトをルートに集約し、各パッケージから同一コマンドで開発・検証を実行できます。

## 必要要件

- Node.js 20 (LTS)
- pnpm 9 以上
- Docker Desktop もしくは Podman (Supabase ローカル実行に必要)
- Supabase CLI v1.144 以上 (ローカル DB リセット時のシード自動実行と `supabase status -o env` に対応)

### Supabase CLI のバージョン確認と更新

```bash
supabase --version
```

- npm グローバルインストールの場合: `npm install -g supabase@latest`
- Homebrew の場合: `brew upgrade supabase/tap/supabase`

バージョンが `v1.144.0` 未満の場合は必ず更新してください。旧バージョンでは `supabase status -o env` が利用できず、本手順のスクリプトが失敗します。

## 環境変数

`.env.example` に記載している環境変数は以下の通りです。秘密情報は絶対にコミットしないでください。

| 変数名 | 用途 | 必須 | 備考 |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | Supabase プロジェクトの URL | 必須 | ブラウザで利用する公開 URL。 |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key | 必須 | ブラウザで利用する公開 anon key。 |
| `SUPABASE_SERVICE_ROLE_KEY` | ローカル開発用の service role key | 任意 | サーバーサイド CLI/seed 用。**本番では利用しない & コミット禁止。** |
| `PLAYWRIGHT_HOST` | E2E テスト用のホスト | 任意 | `pnpm e2e` 実行時に上書き可能。 |
| `PLAYWRIGHT_PORT` | E2E テスト用のポート | 任意 | 既定は `4173`。 |
| `PLAYWRIGHT_BASE_URL` | E2E テストのベース URL | 任意 | `http://{HOST}:{PORT}` がデフォルト。 |

## セットアップ & ローカル起動手順

クリーンな環境で README の手順をそのまま実行すればローカル開発サーバーを起動できます。

1. 依存関係をインストールします。

   ```bash
   pnpm install
   ```

2. 環境変数ファイルを `.env.example` から複製し、必要な値を設定します。

   ```bash
   cp .env.example .env
   ```

3. Supabase をローカルで起動し、スキーマを最新化します。

   ```bash
   supabase start
   supabase db reset          # ローカル DB を最新化 (seed.sql も自動実行)
   ```

   - `supabase db push` は **リンク済みのリモートプロジェクト専用** です。ローカル環境では `Cannot find project ref` エラーになるため、`db reset` や `migration up --local` を利用してください。
   - CLI v1.144 以降では `db reset` 実行時に自動で `supabase/seed/seed.sql` が流れるため、旧バージョンで使用していた `--seed` フラグは不要になりました。シードをスキップしたい場合は `supabase db reset --no-seed` を指定してください。
   - 既存データを保持したままマイグレーションのみ適用したい場合は `supabase migration up --local` を利用できます。
   - `supabase status -o env` で `SUPABASE_DB_URL` が表示されることを確認し、Docker 上のコンテナが正しく起動しているかチェックしてください。旧バージョンの CLI を利用している場合は `supabase status --env` でも確認できます。

4. 型生成スクリプトを実行し、フロントエンドの Supabase 型を最新化します。

   ```bash
   pnpm supabase:types
   ```

   - ルート直下の `scripts/generate-supabase-types.sh` が呼び出され、`supabase status -o env` (旧バージョンでは `--env`) から取得した `SUPABASE_DB_URL` に対して `supabase gen types ... --db-url` を実行します。必ず**リポジトリのルートで**コマンドを実行してください。
   - `Supabase ローカル環境が起動していないか、接続情報を取得できませんでした` というメッセージが出た場合は、`supabase start` の完了を待ち、`supabase status -o env` または `supabase status --env` で URL が得られる状態か再度確認してください。
   - `Cannot find project ref` が表示される場合は、古いスクリプトが残っている可能性があります。`git pull` で最新の `package.json` を取得したうえで再実行してください。
   - リモートプロジェクトに対して型生成を行いたい場合は、`supabase link --project-ref <ref>` を実行したうえで `supabase gen types typescript --linked` を直接利用してください。

5. 開発サーバーを起動します。

   ```bash
   pnpm -w dev
   ```

   `apps/frontend` の Vite サーバーが起動し、Supabase ローカル環境と接続できるようになります。

## 検証 (テスト / 静的解析)

コミット前後に以下のコマンドを実行して品質を保ちます。

```bash
pnpm -w lint
pnpm -w typecheck
pnpm -w test
pnpm -C apps/frontend build
```

E2E テストが必要な場合は `pnpm -w e2e` を利用してください。

## ワークスペース構成

- `apps/*`: フロントエンドなどのアプリケーションパッケージを配置します。
- `supabase/*`: Functions やツール用の Supabase 関連パッケージを配置します。

各パッケージはルートの TypeScript/ESLint/Prettier 設定を継承して利用できます。

## 共通コマンド

ルートに定義したスクリプトは、すべてのパッケージに対して同一のコマンドを提供します。必要に応じて各パッケージに該当のスクリプトを実装してください。

| コマンド | 説明 |
| --- | --- |
| `pnpm -w dev` | 各パッケージの開発サーバーを起動します (`apps/frontend` では Vite)。 |
| `pnpm -w build` | すべてのパッケージでビルドを実行します。 |
| `pnpm -w lint` | ルールに従った ESLint チェックを実行します。 |
| `pnpm -w typecheck` | TypeScript の型チェックを実行します。 |
| `pnpm -w test` | ユニットテストを実行します。 |
| `pnpm -w format` | Prettier を利用した整形を実行します。 |
| `pnpm -w preview` | ビルド済みアプリケーションのプレビューサーバーを起動します。 |

> **メモ:** まだスクリプトを実装していないパッケージはスキップされます。各アプリケーションで必要なスクリプトを追加してください。

## Cloudflare Pages へのデプロイ概要

1. Cloudflare Pages プロジェクトを新規作成し、Git リポジトリを接続します。
2. ビルドコマンドに `pnpm -C apps/frontend build`、ビルド出力ディレクトリに `apps/frontend/dist` を指定します。
3. 環境変数として `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` を Cloudflare Pages に設定します。
4. 必要に応じて Preview/Production で値を分けてください (service role key は絶対に登録しないでください)。
5. デプロイ後、Cloudflare 側で Supabase の CORS 設定が適切か確認します。

## トラブルシューティング

- **Node.js / pnpm のバージョンエラー:** `node -v` / `pnpm -v` でバージョンを確認し、指定バージョン以上に更新してください。`corepack enable` を実行すると pnpm の管理が楽になります。
- **`tailwindcss` コマンドが見つからない:** ルートで `pnpm install` が完了しているか確認し、`pnpm -C apps/frontend exec tailwindcss -h` でコマンドが呼び出せるかテストしてください。
- **Supabase CLI の Docker 接続エラー:** Docker Desktop / Podman を起動し、`supabase status` で状態を確認してから `supabase start` を再実行してください。

## 今後のドキュメント拡充案

- アーキテクチャ判断を記録するための ADR (Architecture Decision Record)
- リリースノートを整理する CHANGELOG

## 追加のヒント

- TypeScript 設定は `tsconfig.base.json` で一元管理しています。パッケージ側の `tsconfig.json` から `extends` して利用してください。
- ESLint/Prettier の共通設定をルートで定義しているため、各パッケージでは最小限の個別設定で運用できます。
- VS Code を利用する場合は `.vscode/settings.json` を参照し、ワークスペースで TypeScript SDK を共有できます。
