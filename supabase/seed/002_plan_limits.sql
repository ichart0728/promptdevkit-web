INSERT INTO public.plan_limits (plan_id, key, value_int, note)
VALUES
  ('free', 'personal_workspaces', 1, '個人ワークスペースは1つまで'),
  ('free', 'team_workspaces', 0, 'FREEではチームワークスペースを作成不可'),
  ('free', 'members_per_team', 3, 'チーム機能が有効になった際の想定上限'),
  ('free', 'prompts_per_personal_ws', 20, '個人ワークスペース内のプロンプト数'),
  ('free', 'prompts_per_team_ws', 0, 'チームワークスペースが無いため0件'),
  ('free', 'prompt_versions_per_prompt', 10, 'バージョン履歴の最大数'),
  ('free', 'comment_threads_per_prompt', 5, '1プロンプト当たりのスレッド数'),
  ('free', 'comments_per_thread', 50, '1スレッド当たりのコメント数'),
  ('free', 'favorites_per_user', 50, 'お気に入り登録の上限'),
  ('pro', 'personal_workspaces', 10, '個人ワークスペース最大数'),
  ('pro', 'team_workspaces', 10, 'チームワークスペース最大数'),
  ('pro', 'members_per_team', 50, 'チームメンバーの上限'),
  ('pro', 'prompts_per_personal_ws', 1000, '個人ワークスペース内のプロンプト数'),
  ('pro', 'prompts_per_team_ws', 2000, 'チームワークスペース内のプロンプト数'),
  ('pro', 'prompt_versions_per_prompt', 100, 'バージョン履歴の最大数'),
  ('pro', 'comment_threads_per_prompt', 100, '1プロンプト当たりのスレッド数'),
  ('pro', 'comments_per_thread', 1000, '1スレッド当たりのコメント数'),
  ('pro', 'favorites_per_user', 500, 'お気に入り登録の上限')
ON CONFLICT (plan_id, key) DO UPDATE
SET
  value_int = EXCLUDED.value_int,
  note = EXCLUDED.note;
