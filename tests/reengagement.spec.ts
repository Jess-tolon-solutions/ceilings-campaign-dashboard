import { test, expect } from '@playwright/test';

test.describe('Client Re-engagement', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the dashboard
    await page.goto('/');

    // Wait for Alpine.js to initialize
    await page.waitForTimeout(1000);
  });

  test('should show re-engagement card on overview', async ({ page }) => {
    // The overview shows campaign cards, check for re-engagement (there are 2 - one on overview, one on campaigns)
    await expect(page.locator('.campaign-card-name:has-text("Client Re-engagement")').first()).toBeVisible();
  });

  test('should navigate to re-engagement view from overview', async ({ page }) => {
    // Click on the re-engagement campaign card on overview
    await page.click('.campaign-card:has-text("Client Re-engagement")');
    await page.waitForTimeout(500);

    // Should see the re-engagement header
    await expect(page.locator('h1:has-text("Client Re-engagement")')).toBeVisible();
  });

  test('should show 5 tabs in re-engagement view', async ({ page }) => {
    // Navigate to re-engagement view
    await page.click('.campaign-card:has-text("Client Re-engagement")');
    await page.waitForTimeout(500);

    // Check for all 5 re-engagement tabs (To review, Approved, Not now, Already contacted, Can't email)
    // These are the visible tabs in the re-engagement section
    await expect(page.locator('button.tab:has-text("To review")')).toBeVisible();
    await expect(page.locator('button.tab:has-text("Approved")')).toBeVisible();
    await expect(page.locator('button.tab:has-text("Not now")')).toBeVisible();
    await expect(page.locator('button.tab:has-text("Already contacted")')).toBeVisible();
    await expect(page.locator('button.tab:has-text("Can\'t email")')).toBeVisible();
  });

  test('should show correct tab labels', async ({ page }) => {
    // Navigate to re-engagement view
    await page.click('.campaign-card:has-text("Client Re-engagement")');
    await page.waitForTimeout(500);

    // Check tab labels
    await expect(page.locator('button.tab:has-text("To review")')).toBeVisible();
    await expect(page.locator('button.tab:has-text("Approved")')).toBeVisible();
    await expect(page.locator('button.tab:has-text("Not now")')).toBeVisible();
    await expect(page.locator('button.tab:has-text("Already contacted")')).toBeVisible();
    await expect(page.locator('button.tab:has-text("Can\'t email")')).toBeVisible();
  });

  test('should show Campaign Results card', async ({ page }) => {
    // Navigate to re-engagement view
    await page.click('.campaign-card:has-text("Client Re-engagement")');
    await page.waitForTimeout(500);

    // Check for Campaign Results card
    await expect(page.locator('text=Campaign Results')).toBeVisible();
  });

  test('should show segment badges', async ({ page }) => {
    // Navigate to re-engagement view
    await page.click('.campaign-card:has-text("Client Re-engagement")');
    await page.waitForTimeout(500);

    // Check for segment badges in the results card header
    await expect(page.locator('span.badge:has-text("Recent:")')).toBeVisible();
    await expect(page.locator('span.badge:has-text("Lapsed:")')).toBeVisible();
    await expect(page.locator('span.badge:has-text("Dormant:")')).toBeVisible();
  });

  test('should switch between tabs', async ({ page }) => {
    // Navigate to re-engagement view
    await page.click('.campaign-card:has-text("Client Re-engagement")');
    await page.waitForTimeout(500);

    // Click on Approved tab
    await page.click('button.tab:has-text("Approved")');
    await page.waitForTimeout(300);

    // Approved tab should be active
    const approvedTab = page.locator('button.tab:has-text("Approved")');
    await expect(approvedTab).toHaveClass(/active/);

    // Click on Not now tab
    await page.click('button.tab:has-text("Not now")');
    await page.waitForTimeout(300);

    // Not now tab should be active
    const notNowTab = page.locator('button.tab:has-text("Not now")');
    await expect(notNowTab).toHaveClass(/active/);
  });

  test('should show tab description', async ({ page }) => {
    // Navigate to re-engagement view
    await page.click('.campaign-card:has-text("Client Re-engagement")');
    await page.waitForTimeout(500);

    // Check for the default "To review" tab description
    await expect(page.locator('text=Contacts waiting for your decision')).toBeVisible();
  });
});
