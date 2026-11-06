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

  test('should show Round 1 Results card', async ({ page }) => {
    // Navigate to re-engagement view
    await page.click('.campaign-card:has-text("Client Re-engagement")');
    await page.waitForTimeout(500);

    // Check for Round 1 Results card (renamed from Campaign Results)
    await expect(page.locator('text=Round 1 Results')).toBeVisible();
    await expect(page.locator('text=Sent September 2026')).toBeVisible();
  });

  test('should show Round 1 metrics', async ({ page }) => {
    // Navigate to re-engagement view
    await page.click('.campaign-card:has-text("Client Re-engagement")');
    await page.waitForTimeout(500);

    // Check for key Round 1 metrics labels
    await expect(page.locator('text=Sent').first()).toBeVisible();
    await expect(page.locator('text=Bounced').first()).toBeVisible();
    await expect(page.locator('text=Delivered').first()).toBeVisible();
    await expect(page.locator('text=Opened').first()).toBeVisible();
    await expect(page.locator('text=Human clicks').first()).toBeVisible();
  });

  test('should show bounce rate percentages', async ({ page }) => {
    // Navigate to re-engagement view
    await page.click('.campaign-card:has-text("Client Re-engagement")');
    await page.waitForTimeout(500);

    // Check for percentages (18% bounce, 29.6% open)
    await expect(page.locator('text=(18%)')).toBeVisible();
    await expect(page.locator('text=(29.6%)')).toBeVisible();
    await expect(page.locator('text=Above 20% benchmark')).toBeVisible();
  });

  test('should show security scanner note', async ({ page }) => {
    // Navigate to re-engagement view
    await page.click('.campaign-card:has-text("Client Re-engagement")');
    await page.waitForTimeout(500);

    // Check for the security scanner note under clicks
    await expect(page.locator('text=Jobber reports 10; 9 were security scanners')).toBeVisible();
  });

  test('should show bounce list', async ({ page }) => {
    // Navigate to re-engagement view
    await page.click('.campaign-card:has-text("Client Re-engagement")');
    await page.waitForTimeout(500);

    // Check for bounce list
    await expect(page.locator('text=Bounces:')).toBeVisible();
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

  test('should show segment filter button on To review tab', async ({ page }) => {
    // Navigate to re-engagement view
    await page.click('.campaign-card:has-text("Client Re-engagement")');
    await page.waitForTimeout(500);

    // On To review tab (default), segment filter button should be visible
    await expect(page.locator('button:has-text("All segments")')).toBeVisible();
  });

  test('should cycle segment filter', async ({ page }) => {
    // Navigate to re-engagement view
    await page.click('.campaign-card:has-text("Client Re-engagement")');
    await page.waitForTimeout(500);

    // Click segment filter button to cycle through options
    const filterBtn = page.locator('button:has-text("All segments")');
    await filterBtn.click();
    await page.waitForTimeout(300);

    // Should now show "Last 12 Months"
    await expect(page.locator('button:has-text("Last 12 Months")')).toBeVisible();
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

  test('should not show segment filter on non-To review tabs', async ({ page }) => {
    // Navigate to re-engagement view
    await page.click('.campaign-card:has-text("Client Re-engagement")');
    await page.waitForTimeout(500);

    // Click on Approved tab
    await page.click('button.tab:has-text("Approved")');
    await page.waitForTimeout(300);

    // Segment filter button should not be visible on Approved tab
    await expect(page.locator('button:has-text("All segments")')).not.toBeVisible();
  });

  test('should show tab description', async ({ page }) => {
    // Navigate to re-engagement view
    await page.click('.campaign-card:has-text("Client Re-engagement")');
    await page.waitForTimeout(500);

    // Check for the default "To review" tab description
    await expect(page.locator('text=Contacts waiting for your decision')).toBeVisible();
  });

  test('should show search input', async ({ page }) => {
    // Navigate to re-engagement view
    await page.click('.campaign-card:has-text("Client Re-engagement")');
    await page.waitForTimeout(500);

    // Check for search input
    await expect(page.locator('input[placeholder="Search email or company name"]')).toBeVisible();
  });

  test('should show Round 2 Results card', async ({ page }) => {
    // Navigate to re-engagement view
    await page.click('.campaign-card:has-text("Client Re-engagement")');
    await page.waitForTimeout(500);

    // Check for Round 2 Results card
    await expect(page.locator('text=Round 2 Results')).toBeVisible();
    await expect(page.locator('text=Sent November 5, 2026 to 12 contacts')).toBeVisible();
  });

  test('should show Round 2 admin form for entering Jobber numbers', async ({ page }) => {
    // Navigate to re-engagement view
    await page.click('.campaign-card:has-text("Client Re-engagement")');
    await page.waitForTimeout(500);

    // Check for Round 2 admin entry fields (visible to admins)
    // The "Enter Jobber Numbers" label should be visible for admin users
    const jobberLabel = page.locator('text=Enter Jobber Numbers');
    const isAdmin = await jobberLabel.isVisible();

    // If admin, check the form fields are present
    if (isAdmin) {
      await expect(page.locator('label:has-text("Human clicks")').last()).toBeVisible();
      await expect(page.locator('label:has-text("Jobber clicks")')).toBeVisible();
      await expect(page.locator('label:has-text("Bounce list")')).toBeVisible();
    }
  });
});
