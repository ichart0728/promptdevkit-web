-- Initial schema for PromptDevKit Web

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE workspace_type AS ENUM ('personal', 'team');
CREATE TYPE team_member_role AS ENUM ('admin', 'editor', 'viewer');
CREATE TYPE notification_type AS ENUM ('mention', 'system');

CREATE TABLE public.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL UNIQUE,
    name text NOT NULL,
    avatar_url text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.plans (
    id text PRIMARY KEY,
    name text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.plan_limits (
    id bigserial PRIMARY KEY,
    plan_id text NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
    key text NOT NULL,
    value_int integer,
    value_str text,
    value_json jsonb,
    note text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT plan_limits_unique_key UNIQUE (plan_id, key),
    CONSTRAINT plan_limits_value_presence CHECK (
        (CASE WHEN value_int IS NULL THEN 0 ELSE 1 END) +
        (CASE WHEN value_str IS NULL THEN 0 ELSE 1 END) +
        (CASE WHEN value_json IS NULL THEN 0 ELSE 1 END) >= 1
    )
);

CREATE TABLE public.user_plans (
    user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    plan_id text NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
    started_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.teams (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.workspaces (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type workspace_type NOT NULL,
    owner_user_id uuid,
    team_id uuid,
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT workspaces_owner_fk FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT workspaces_team_fk FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE,
    CONSTRAINT workspaces_type_check CHECK (
        (type = 'personal' AND owner_user_id IS NOT NULL AND team_id IS NULL) OR
        (type = 'team' AND team_id IS NOT NULL AND owner_user_id IS NULL)
    )
);

CREATE TABLE public.team_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role team_member_role NOT NULL,
    joined_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT team_members_unique UNIQUE (team_id, user_id)
);

CREATE TABLE public.prompts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    title text NOT NULL,
    body text NOT NULL,
    note text,
    tags text[] NOT NULL DEFAULT ARRAY[]::text[],
    created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    updated_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

CREATE TABLE public.prompt_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt_id uuid NOT NULL REFERENCES public.prompts(id) ON DELETE CASCADE,
    version integer NOT NULL CHECK (version >= 1),
    title text NOT NULL,
    body text NOT NULL,
    note text,
    tags text[] NOT NULL DEFAULT ARRAY[]::text[],
    updated_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    restored_from_version integer,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT prompt_versions_unique_version UNIQUE (prompt_id, version)
);

CREATE TABLE public.prompt_favorites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt_id uuid NOT NULL REFERENCES public.prompts(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT prompt_favorites_unique UNIQUE (prompt_id, user_id)
);

CREATE TABLE public.comment_threads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt_id uuid NOT NULL REFERENCES public.prompts(id) ON DELETE CASCADE,
    created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.comments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id uuid NOT NULL REFERENCES public.comment_threads(id) ON DELETE CASCADE,
    body text NOT NULL,
    mentions uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
    created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_public_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.set_current_timestamp_updated_at();

CREATE TRIGGER set_public_prompts_updated_at
    BEFORE UPDATE ON public.prompts
    FOR EACH ROW
    EXECUTE FUNCTION public.set_current_timestamp_updated_at();

CREATE TRIGGER set_public_comments_updated_at
    BEFORE UPDATE ON public.comments
    FOR EACH ROW
    EXECUTE FUNCTION public.set_current_timestamp_updated_at();

CREATE TABLE public.notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    type notification_type NOT NULL,
    payload jsonb NOT NULL,
    read_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_team_members_user_id ON public.team_members (user_id);
CREATE INDEX idx_prompts_workspace_updated ON public.prompts (workspace_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_prompts_tags_gin ON public.prompts USING GIN (tags);
CREATE INDEX idx_comments_thread_created ON public.comments (thread_id, created_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_notifications_user_created ON public.notifications (user_id, created_at DESC);
