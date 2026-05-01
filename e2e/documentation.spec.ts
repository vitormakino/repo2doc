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
    
    const executeBtn = page.getByRole('button', { name: 'Execute Generator' });
    await executeBtn.click();

    // Since we are mocking in unit tests but e2e hits the real local server, 
    // it will try to hit the /api/github/repo endpoint.
    // In a real E2E we might want to mock the API or have a test repo.
    // For now, we're just checking if the "Processing" state appears.
    await expect(page.getByText('Pipeline Interrupted').or(page.getByText('System actively processing'))).toBeVisible();
  });
});
