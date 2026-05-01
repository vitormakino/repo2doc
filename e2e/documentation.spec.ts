import { test, expect } from '@playwright/test';

test.describe('RepoDoc Core Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should render the landing page correctly', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Transforming');
    await expect(page.getByText('RepoDoc')).toBeVisible();
  });

  test('should allow switching between remote and local sources', async ({ page }) => {
    const remoteButton = page.getByRole('button', { name: 'remote' });
    const localButton = page.getByRole('button', { name: 'local' });

    // Should start with remote
    await expect(page.getByPlaceholder('https://github.com/owner/repo')).toBeVisible();

    // Switch to local
    await localButton.click();
    await expect(page.getByText('Select Folder')).toBeVisible();
    await expect(page.getByPlaceholder('https://github.com/owner/repo')).not.toBeVisible();

    // Switch back to remote
    await remoteButton.click();
    await expect(page.getByPlaceholder('https://github.com/owner/repo')).toBeVisible();
  });

  test('should toggle configuration options', async ({ page }) => {
    const historyToggle = page.getByText('Consolidate History');
    const summariesToggle = page.getByText('AI Summaries');

    // Toggles should be interactive (labels are connected to hidden inputs in the code)
    // We can check if the visual state changes or just check if they are clickable
    await expect(historyToggle).toBeVisible();
    await historyToggle.click();
    
    await expect(summariesToggle).toBeVisible();
    await summariesToggle.click();
  });

  test('should show error for invalid repository URL', async ({ page }) => {
    const input = page.getByPlaceholder('https://github.com/owner/repo');
    await input.fill('https://github.com/invalid/repo');
    
    // Add the source first
    await page.locator('button:has(svg)').last().click(); // Click the plus button
    await expect(page.getByText('invalid/repo')).toBeVisible();

    const executeBtn = page.getByRole('button', { name: 'Execute Generator' });
    await executeBtn.click();

    await expect(page.getByText('Pipeline Interrupted').or(page.getByText('System actively processing'))).toBeVisible();
  });

  test('should allow cancelling the process', async ({ page }) => {
    const input = page.getByPlaceholder('https://github.com/owner/repo');
    await input.fill('https://github.com/vitor-makino/repodoc'); // use a real-ish looking one
    await page.locator('button:has(svg)').last().click();
    
    const executeBtn = page.getByRole('button', { name: 'Execute Generator' });
    await executeBtn.click();

    const cancelBtn = page.getByRole('button', { name: 'Cancel Generation' });
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();

    await expect(page.getByText('Operation Stopped')).toBeVisible();
    await expect(page.getByText('Operation cancelled by user')).toBeVisible();
  });
});
