Minimal working rules. The Coding Agent must follow this document.

## 1) Test workflow / Required services

**Prereqs**

- Node 20+ / pnpm 9+ / Docker Desktop
- Supabase CLI (`npm i -g supabase`)

**Bootstrap**

```bash
pnpm i
supabase start                   # start local DB/auth/storage (Docker)
supabase db reset --seed         # run all migrations + supabase/seed/seed.sql
pnpm supabase:types              # generate TS types into apps/frontend/src/lib/types.ts
```

**Dev**

```bash
pnpm -C apps/frontend dev        # Vite dev server
```

**Verification**

```bash
pnpm lint && pnpm typecheck
pnpm test                        # Vitest (unit)
pnpm e2e                         # Playwright (if present)
pnpm -C apps/frontend build      # production build
```

## 2) Repository layout / Design principles / Naming

**Layout**

```
promptdevkit-web/
├─ apps/
│  └─ frontend/
│     ├─ index.html
│     ├─ vite.config.ts
│     ├─ tsconfig.json
│     ├─ package.json
│     └─ src/
│        ├─ main.tsx
│        ├─ app/
│        │  ├─ router.tsx           # TanStack Router
│        │  ├─ queryClient.ts       # TanStack Query
│        │  └─ providers.tsx        # RHF/Zod/Sentry bootstrap
│        ├─ lib/
│        │  ├─ supabase.ts          # supabase-js client init
│        │  ├─ limits.ts            # plan_limits resolve/evaluate
│        │  └─ types.ts             # generated types (do not edit)
│        ├─ components/
│        │  ├─ ui/                  # shadcn/ui wrappers
│        │  └─ common/
│        ├─ domains/
│        │  ├─ prompts/
│        │  │  ├─ pages/
│        │  │  ├─ api/              # supabase queries (document Query Keys)
│        │  │  ├─ forms/            # RHF + Zod
│        │  │  └─ components/
│        │  └─ teams/
│        ├─ pages/
│        │  ├─ dashboard.tsx
│        │  └─ _layout.tsx
│        ├─ styles/
│        │  └─ globals.css
│        └─ hooks/
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/
│  │  └─ 20251009_init.sql
│  ├─ seed/
│  │  ├─ 001_plans.sql
│  │  └─ 002_plan_limits.sql
│  ├─ policies/                    # RLS policies per table
│  │  ├─ prompts.sql
│  │  └─ teams.sql
│  └─ functions/                   # Edge Functions (only if needed)
├─ .github/workflows/ci.yml        # lint/typecheck/test/build
├─ .env.example
├─ package.json                    # workspace root
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ .eslintrc.cjs
├─ .prettierrc
├─ AGENTS.md
└─ README.md
```

**Principles**

- **BaaS-first**: CRUD via Supabase REST/RPC/SQL. Custom API only if unavoidable.
- **RLS-by-default**: Authorization in SQL policies. Never rely on client-only checks.
- **Minimal data hops**: TanStack Query for fetching, optimistic updates, proper error/empty/loading states.
- **Types single-source**: Zod DTOs for forms; DB types re-generated via `supabase:types`.
- **Query Keys**: `['prompts', workspaceId, { q, tags, page }]` 等を**モジュール先頭で定義**し再利用。

**Naming**

- DB: tables **plural**, columns **snake_case**, PK `id`, FKs `xxx_id`.
- TS: variables/functions **camelCase**, types/components **PascalCase**, files \*\*kebab-case.tsx`.

## 3) Do not

- Do not commit secrets. No Supabase keys in the repo.
- Do not use **service_role** key in the browser. Do not bypass/disable RLS.
- Do not change schema destructively without a migration plan (no silent drops/renames/types).
- Do not commit generated files (`src/lib/types.ts`, build outputs).
- Avoid `select *` on large sets. Always paginate and select explicit columns.

## 4) Sample settings / Seed

**`.env.example` (no secrets)**

```dotenv
# Frontend (public)
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY

# Local dev/test only (server-side tools; never used in client)
SUPABASE_SERVICE_ROLE_KEY=DO_NOT_COMMIT_REAL_VALUE
```

**Seed policy**

- Location: `supabase/seed/seed.sql` (+ split files under `seed/` as needed).
- Content: dummy users/workspaces/teams/prompts/plans/plan_limits. No sensitive data.
- Run: `supabase db reset --seed`.

## 5) CI as the source of truth

PRs must pass. Red checks block merge.

```bash
pnpm i --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm -C apps/frontend build
```

Optional: `pnpm e2e` for critical flows only.

## 6) Create many small issues

- Prefer **well-defined, repetitive micro-tasks** for the agent.
  Examples: naming unification, dead-code removal, stricter types, unit tests, a11y props, minor UI polish.
- One PR = one theme. Keep diffs small.

## 7) Task Packet template

Use this for every task handed to the agent.

```
# Goal
<One line. Include user impact/background.>

# Scope
<Target paths, impact, and no-touch areas.>

# Acceptance Criteria
- Tests: `pnpm test` / `pnpm e2e` pass
- Code/Types: `pnpm lint` / `pnpm typecheck` pass
- Add: create new tests if needed (cover regressions)

# Constraints
<Performance/compat limits. Do not break RLS. No destructive schema changes, etc.>

# Hints
<Refs: relevant modules/paths, design notes, fastest route.>
```

## 8) Root scripts (suggested)

Add to root `package.json`:

```json
{
  "scripts": {
    "supabase:types": "supabase gen types typescript --local --schema public > apps/frontend/src/lib/types.ts",
    "lint": "pnpm -C apps/frontend lint",
    "typecheck": "pnpm -C apps/frontend typecheck",
    "test": "pnpm -C apps/frontend test",
    "e2e": "pnpm -C apps/frontend e2e"
  }
}
```
