-- Ensure useful extensions are available for UUID generation and case-insensitive text
create extension if not exists "pgcrypto" with schema public;
create extension if not exists "citext" with schema public;

-- Reusable trigger to automatically bump updated_at timestamps
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

-- Workspace and team level role enums
create type public.workspace_role as enum ('owner', 'admin', 'editor', 'viewer');
create type public.team_role as enum ('admin', 'editor', 'viewer');

-- Application users mapped 1:1 to auth.users
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext not null,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create unique index users_email_active_key on public.users (email) where deleted_at is null;
create index users_active_idx on public.users (id) where deleted_at is null;

create trigger users_set_updated_at
before update on public.users
for each row
execute function public.set_updated_at();

-- Workspaces aggregate prompts and teams under a single billing entity
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  slug citext not null,
  name text not null,
  description text,
  primary_owner_id uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create unique index workspaces_slug_active_key on public.workspaces (slug) where deleted_at is null;
create index workspaces_primary_owner_idx on public.workspaces (primary_owner_id) where deleted_at is null;

create trigger workspaces_set_updated_at
before update on public.workspaces
for each row
execute function public.set_updated_at();

-- Members connect users to workspaces with scoped roles
create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role public.workspace_role not null default 'viewer',
  invited_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create unique index workspace_members_unique_active on public.workspace_members (workspace_id, user_id) where deleted_at is null;
create index workspace_members_user_idx on public.workspace_members (user_id) where deleted_at is null;

create trigger workspace_members_set_updated_at
before update on public.workspace_members
for each row
execute function public.set_updated_at();

-- Teams enable finer grained organisation within a workspace
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create unique index teams_workspace_name_active_key on public.teams (workspace_id, lower(name)) where deleted_at is null;
create index teams_workspace_idx on public.teams (workspace_id) where deleted_at is null;

create trigger teams_set_updated_at
before update on public.teams
for each row
execute function public.set_updated_at();

-- Team members reflect prompt editing permissions and notifications routing
create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role public.team_role not null default 'viewer',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create unique index team_members_unique_active on public.team_members (team_id, user_id) where deleted_at is null;
create index team_members_user_idx on public.team_members (user_id) where deleted_at is null;

create trigger team_members_set_updated_at
before update on public.team_members
for each row
execute function public.set_updated_at();

-- Prompts represent versioned prompt templates for LLM orchestration
create table public.prompts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  slug text not null,
  title text not null,
  description text,
  tags text[] not null default '{}',
  is_published boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create unique index prompts_workspace_slug_active_key on public.prompts (workspace_id, lower(slug)) where deleted_at is null;
create index prompts_workspace_updated_at_idx on public.prompts (workspace_id, updated_at desc) where deleted_at is null;
create index prompts_tags_gin_idx on public.prompts using gin (tags);

create trigger prompts_set_updated_at
before update on public.prompts
for each row
execute function public.set_updated_at();

-- Individual prompt versions capture the executable template payload
create table public.prompt_versions (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references public.prompts(id) on delete cascade,
  version integer not null,
  name text not null,
  summary text,
  prompt_template text not null,
  variables jsonb not null default '{}'::jsonb,
  model text,
  temperature numeric(4,3) check (temperature >= 0 and temperature <= 2),
  max_tokens integer,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.prompt_versions
add constraint prompt_versions_unique_version unique (prompt_id, version);

create index prompt_versions_prompt_desc_idx on public.prompt_versions (prompt_id, version desc);

create trigger prompt_versions_set_updated_at
before update on public.prompt_versions
for each row
execute function public.set_updated_at();

-- Track the latest active version on the prompt record itself for fast lookup
alter table public.prompts
add column active_version_id uuid references public.prompt_versions(id);

create unique index prompts_active_version_unique on public.prompts (active_version_id) where active_version_id is not null;

-- User facing notifications for activity streams and approvals
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index notifications_user_created_at_idx on public.notifications (user_id, created_at desc);
create index notifications_workspace_idx on public.notifications (workspace_id);
