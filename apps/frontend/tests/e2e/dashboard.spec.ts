import { expect, test } from '@playwright/test';

test('ダッシュボードでのワークスペース取得リクエストがRLS任せのクエリを発行する', async ({ page }) => {
  let workspaceRequestCaptured = false;

  await page.route('**/rest/v1/workspaces*', async (route, request) => {
    const url = new URL(request.url());

    expect(url.searchParams.get('select')).toBe('id,name,type,team_id,archived_at,created_at');
    expect(url.searchParams.has('or')).toBeFalsy();
    expect(url.searchParams.has('owner_user_id')).toBeFalsy();
    expect(url.searchParams.has('team_id')).toBeFalsy();

    workspaceRequestCaptured = true;

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '[]',
    });
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await expect.poll(() => workspaceRequestCaptured).toBeTruthy();
});
