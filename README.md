# PromptDevKit Web Monorepo

このリポジトリは、フロントエンドアプリケーションと Supabase リソースを 1 つの pnpm ワークスペースで管理するための土台です。共通設定とスクリプトをルートに集約し、各パッケージから同一コマンドで開発・検証を実行できます。

## 必要要件

- Node.js 20 (LTS)
- pnpm 9 以上
- Supabase CLI (オプション、ローカルで Supabase を利用する場合)

## セットアップ

1. 依存関係をインストールします。

   ```bash
   pnpm install
   ```

2. 環境変数ファイルを作成します。

   ```bash
   cp .env.example .env
   ```

   必要に応じて各アプリケーション/サービスごとの環境変数を `.env` に追記してください。

3. Supabase を利用する場合は、CLI でプロジェクトを初期化します。

   ```bash
   supabase start
   supabase db reset --seed
   ```

## ワークスペース構成

- `apps/*`: フロントエンドなどのアプリケーションパッケージを配置します。
- `supabase/*`: Functions やツール用の Supabase 関連パッケージを配置します。

各パッケージはルートの TypeScript/ESLint/Prettier 設定を継承して利用できます。

## 共通コマンド

ルートに定義したスクリプトは、すべてのパッケージに対して同一のコマンドを提供します。必要に応じて各パッケージに該当のスクリプトを実装してください。

| コマンド | 説明 |
| --- | --- |
| `pnpm -w dev` | 各パッケージの開発サーバーを起動します (`dev` スクリプトがあるパッケージが対象)。 |
| `pnpm -w build` | すべてのパッケージでビルドを実行します。 |
| `pnpm -w lint` | ルールに従った ESLint チェックを実行します。 |
| `pnpm -w typecheck` | TypeScript の型チェックを実行します。 |
| `pnpm -w test` | ユニットテストを実行します。 |
| `pnpm -w format` | Prettier を利用した整形を実行します。 |
| `pnpm -w preview` | ビルド済みアプリケーションのプレビューサーバーを起動します。 |

> **メモ:** まだスクリプトを実装していないパッケージはスキップされます。各アプリケーションで必要なスクリプトを追加してください。

## 開発フロー

1. Supabase を利用する場合は Docker を起動し、`supabase start` でローカル環境を用意します。
2. フロントエンドアプリケーションなどの開発は `pnpm -w dev` で開始できます。
3. コミット前に `pnpm -w lint`、`pnpm -w typecheck`、`pnpm -w test` を実行し、品質チェックを通過させてください。

## 追加のヒント

- TypeScript 設定は `tsconfig.base.json` で一元管理しています。パッケージ側の `tsconfig.json` から `extends` して利用してください。
- ESLint/Prettier の共通設定をルートで定義しているため、各パッケージでは最小限の個別設定で運用できます。
- VS Code を利用する場合は `.vscode/settings.json` を参照し、ワークスペースで TypeScript SDK を共有できます。
