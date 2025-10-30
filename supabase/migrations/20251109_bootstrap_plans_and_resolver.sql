-- 既定プランを用意（何度実行しても安全）
INSERT INTO public.plans (id, name)
VALUES ('free','Free')
ON CONFLICT (id) DO NOTHING;

-- 既定プランの上限キーを用意（不足分のみ追加/更新）
INSERT INTO public.plan_limits (plan_id,key,value_int,note)
VALUES
  ('free','personal_workspaces',5,'default'),
  ('free','prompts_per_personal_ws',50,'default'),
  ('free','prompt_versions_per_prompt',20,'default'),
  ('free','comment_threads_per_prompt',5,'default'),
  ('free','comments_per_thread',100,'default')
ON CONFLICT (plan_id,key) DO UPDATE
SET value_int = EXCLUDED.value_int, note = EXCLUDED.note;

-- workspaces.id を受け取り、owner の plan_id を返す解決関数（必ず1件返すようにフォールバック）
DROP FUNCTION IF EXISTS public.resolve_workspace_plan_id(uuid);

CREATE OR REPLACE FUNCTION public.resolve_workspace_plan_id(p_workspace_id uuid)
RETURNS text
LANGUAGE sql
STABLE
AS $f$
  SELECT COALESCE(
           ( SELECT up.plan_id
             FROM public.workspaces w
             JOIN public.user_plans up ON up.user_id = w.owner_user_id
             WHERE w.id = p_workspace_id
             LIMIT 1 ),
           'free'
         )
$f$;

REVOKE EXECUTE ON FUNCTION public.resolve_workspace_plan_id(uuid) FROM PUBLIC;

-- 既存の personal workspace の owner に既定プランを紐付け（存在しなければ）
INSERT INTO public.user_plans (user_id, plan_id)
SELECT w.owner_user_id, 'free'
FROM public.workspaces w
WHERE w.type = 'personal'
ON CONFLICT (user_id) DO NOTHING;
