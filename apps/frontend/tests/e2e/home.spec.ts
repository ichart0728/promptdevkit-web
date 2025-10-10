import { test, expect } from '@playwright/test';

test('トップページがダッシュボードを表示する', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await expect(
    page.getByText('Start building your prompt workflows here.', { exact: true }),
  ).toBeVisible();
});
