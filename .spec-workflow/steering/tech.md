# 技術スタック

## プロジェクト種別
PromptDevKit Web は、AI プロンプト資産の管理ダッシュボードを提供するマルチパッケージ構成の Web アプリケーションです。React ベースの SPA（`apps/frontend`）と Supabase リソースを単一の pnpm ワークスペースで管理し、ローカル開発と CI 検証を共通化しています。

## コアテクノロジー

### 使用言語
- **言語**: TypeScript 5.x（strict モード）
- **ランタイム / コンパイラ**: Node.js 20 LTS、Vite 5（開発時は esbuild、ビルド時は Rollup）
- **関連ツール**: pnpm 9 ワークスペーススクリプト、Supabase CLI、ESLint/TypeScript による静的解析

### 主要依存ライブラリ
- **React 18.3**: Concurrent Mode 対応の UI レンダリング
- **@tanstack/react-query 5**: データ取得とキャッシュ制御、楽観的更新
- **@tanstack/react-router 1**: クエリと連携したデータ主導型ルーティング
- **@supabase/supabase-js 2**: REST/RPC/Realtime へのブラウザ直結クライアント
- **react-hook-form + Zod**: 型安全なフォーム状態管理とバリデーション
- **Radix UI + shadcn/ui**: アクセシブルな UI プリミティブとデザインガイドライン
- **Tailwind CSS + tailwind-merge**: ユーティリティスタイルとクラス競合の解消
- **Vitest + Testing Library**: コンポーネント単位テストと DOM アサーション

### アプリケーションアーキテクチャ
`apps/frontend` 配下に単一ページアプリケーションを配置し、TanStack Router のローダーと TanStack Query のサーバー状態管理を統合。フロントエンドは Supabase の REST/RPC エンドポイントへ直接アクセスし、RLS を前提とした認可を実現します。プロバイダー層で Supabase クライアント、TanStack Query、React Hook Form、Sentry などのコンテキストをまとめて提供します。

### データストレージ
- **一次ストレージ**: Supabase PostgreSQL 15（`prompts`, `teams`, `plans`, `plan_limits` 等に RLS ポリシー適用済み）
- **キャッシュ**: クライアント側は TanStack Query、Supabase 側は REST キャッシュ/Realtime を活用
- **データ形式**: REST/RPC は JSON、マイグレーションは SQL、型共有は Supabase 生成の TypeScript 型

### 外部統合
- **API**: Supabase Auth / Database / Storage / Realtime
- **プロトコル**: HTTPS（REST）、WebSocket（Realtime）、Supabase CLI 経由の SQL
- **認証方式**: Supabase Auth による JWT。ブラウザは anon ロールのみ使用し、service role key はローカル CLI ツールに限定。

### モニタリング / ダッシュボード技術
- **ダッシュボード基盤**: React SPA + shadcn/ui コンポーネント
- **リアルタイム更新**: `supabase-js` を用いた Realtime チャネル導入を想定しつつ、現状は TanStack Query の `invalidateQueries` で整合性を確保
- **可視化ライブラリ**: 現状はカスタムコンポーネント中心。分析ダッシュボード導入時に Chart.js / Recharts 等を評価予定。
- **状態管理**: サーバー状態は TanStack Query、フォームは RHF、必要最小限の React Context でセッションや依存サービスを共有

## 開発環境

### ビルド / 開発ツール
- **ビルドシステム**: Vite 5（`@vitejs/plugin-react-swc` で高速 HMR）
- **パッケージ管理**: pnpm 9 ワークスペース（ルートスクリプトから各パッケージを一括制御）
- **開発フロー**: `pnpm -C apps/frontend dev` で HMR、`supabase start` + `supabase db reset --seed` でローカル Supabase を起動、`pnpm supabase:types` で型生成

### コード品質ツール
- **静的解析**: ESLint（`@typescript-eslint`、React Hooks ルール、`eslint-plugin-simple-import-sort`）
- **フォーマッタ**: Prettier（`.prettierrc` を共有設定）
- **テスト**: Vitest、@testing-library/react、Playwright（`pnpm e2e` でフロー検証）
- **ドキュメンテーション**: Markdown ベースの README / ステアリングドキュメント、必要箇所でのコードコメント

### バージョン管理 / コラボレーション
- **VCS**: Git（GitHub リポジトリ）  
- **ブランチ運用**: GitHub Flow に準拠した短命フィーチャーブランチ
- **コードレビュー**: PR 作成時に CI が `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm -C apps/frontend build` を実行し、RLS 安全性・スキーマ整合性・テスト網羅性を重視

### ダッシュボード開発
- **ライブリロード**: Vite HMR（デフォルトポート 5173）
- **ポート管理**: Playwright E2E は 4173 のプレビューサーバーを利用
- **複数インスタンス**: pnpm ワークスペースでパッケージごとに独立実行、Supabase CLI が各開発者環境をコンテナで隔離

## デプロイ / 配布
- **ターゲット環境**: 静的ファイルは Cloudflare Pages、BaaS は Supabase クラウド
- **配布方法**: GitHub と連携した CI/CD、Cloudflare Pages の Git 連携デプロイ
- **インストール要件**: Node.js 20 以上、pnpm 9 以上、Supabase CLI v1.144 以上、Docker Desktop もしくは Podman
- **更新手順**: PR マージで自動デプロイ。スキーマ変更時はマイグレーション適用後に `pnpm supabase:types` を再実行し型を再生成

## 技術要件 / 制約

### パフォーマンス要件
- 初期ロードとルート遷移は 200ms 以内を目標（TanStack Query キャッシュと Vite 最適化を活用）
- バンドルサイズ肥大化を回避するため、ルート単位のコード分割と Tree Shaking を徹底

### 互換性要件
- **対応プラットフォーム**: 最新の主要ブラウザ（Chrome / Edge / Safari / Firefox）。開発環境は macOS / Linux を想定。
- **依存バージョン**: Node 20.x、pnpm 9.x、Supabase CLI ≥ v1.144、React 18.3、TanStack Query 5.x
- **標準準拠**: Supabase REST/GraphQL 仕様、ES Modules、Radix UI のアクセシビリティガイドライン

### セキュリティ / コンプライアンス
- **セキュリティ要件**: Supabase RLS を順守、service role key はリポジトリに含めない、通信は HTTPS/TLS を前提
- **コンプライアンス**: 現時点で公式な規格遵守要件はなし。将来的なエンタープライズ対応を見据えて監査ログとアクセス制御を強化予定。
- **脅威モデル**: ワークスペース越境アクセス、Supabase RPC へのインジェクション、フロントのみでの権限チェックを防ぐ設計

### スケーラビリティ / 信頼性
- **想定負荷**: 数十ワークスペース・数百件規模のプロンプト資産。Supabase の垂直スケールで初期要件を満たす。
- **可用性要件**: Supabase SLA に依存。フロント側はエラーバウンダリと再試行戦略でフェイルセーフを提供。
- **成長見込み**: ドメイン別ディレクトリ（`domains/prompts`, `domains/teams` 等）で機能を拡張。ビジネスロジックが複雑化した際は Edge Functions / Worker への段階的移行を検討。

## 技術的判断と背景
PromptDevKit Web は BaaS ファーストを掲げ、サーバーサイド実装を最小化しつつ Supabase の認証・RLS・ストレージを最大活用します。TanStack Query / Router によって一貫したデータ取得とキャッシュ戦略を確立し、Supabase 生成型と Zod を単一の真実源とすることで型の不整合を防止しています。

### 判断記録
1. **Supabase を中核に採用**: 認証・RLS 対応 Postgres を迅速に提供でき、独自バックエンド構築コストを削減できるため。将来的な拡張も Supabase エコシステムで完結しやすい。
2. **TanStack Query + Router の併用**: データフェッチとルーティングを同一思想で扱えるため。React Router からの移行よりもキャッシュ一貫性と宣言的ローディングで優位。
3. **shadcn/ui + Radix UI**: アクセシビリティ担保済みのコンポーネントをベースに、デザインシステムを高速に構築できる。独自 UI ライブラリ構築コストを回避。

## 既知の制限
- **Realtime 対応の不足**: 現状は一部画面で Realtime 購読を導入しておらず、`invalidateQueries` に頼るため最新反映に遅延が発生する可能性がある。
- **バックエンド拡張性**: Supabase Edge Functions をまだ活用していないため、複雑なビジネスロジックは今後の導入が必要。
- **分析可視化**: グラフ/チャートの共通ライブラリを未選定。メトリクス可視化機能を拡張する際に Tremor / Recharts などの採用を検討。
