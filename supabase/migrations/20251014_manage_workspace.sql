-- Add archived_at column to workspaces for soft deletion/archiving
ALTER TABLE public.workspaces
ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_workspaces_archived_at
  ON public.workspaces (archived_at)
  WHERE archived_at IS NOT NULL;
