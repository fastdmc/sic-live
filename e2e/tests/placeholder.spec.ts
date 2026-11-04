import { expect, test } from '@playwright/test';

test('loads the web placeholder page', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'SIC Live' })).toBeVisible();
});
