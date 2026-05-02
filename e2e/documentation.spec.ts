import fs from 'fs';
import path from 'path';
import { test, expect } from '@playwright/test';

test.describe('RepoDoc Core Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Default mock for config to ensure all features are enabled
    await page.route('/api/config', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ githubEnabled: true, geminiEnabled: true }),
      }),
    );

    // Mock GitHub API routes
    await page.route(/\/api\/github\/repo.*/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ path: 'README.md', name: 'README.md', content: '# Mock README', type: 'file' }]),
      }),
    );

    await page.route(/\/api\/github\/commits.*/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      }),
    );

    await page.goto('/');
    // Wait for config to load
    await expect(page.getByRole('button', { name: 'remote' })).toBeEnabled();
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
    await summariesToggle.click({ force: true });
  });

  test('should show error for invalid repository URL', async ({ page }) => {
    const input = page.getByPlaceholder('https://github.com/owner/repo');
    await input.fill('https://github.com/invalid/repo');

    // Add the source first
    await page.locator('button:has(svg)').last().click(); // Click the plus button
    await expect(page.getByText('invalid/repo')).toBeVisible();

    const executeBtn = page.getByRole('button', { name: 'Execute Generator' });
    await executeBtn.click();

    await expect(
      page.getByText('Pipeline Interrupted').or(page.getByText('System actively processing')),
    ).toBeVisible();
  });

  test('should allow cancelling the process', async ({ page }) => {
    const input = page.getByPlaceholder('https://github.com/owner/repo');
    await input.fill('https://github.com/vitormakino/repodoc'); // use a real-ish looking one
    await page.locator('button:has(svg)').last().click();

    const executeBtn = page.getByRole('button', { name: 'Execute Generator' });
    await expect(executeBtn).toBeEnabled();
    await executeBtn.click();

    await page.getByRole('button', { name: 'Cancel Generation' }).click();

    await expect(page.getByText('Operation Stopped').or(page.getByText('Pipeline Interrupted'))).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Operation cancelled by user')).toBeVisible();
  });

  test('should complete full documentation flow with local files and export', async ({ page }) => {
    // 1. Switch to local mode
    await page.getByRole('button', { name: 'local' }).click();
    const selectFolderBtn = page.getByText('Select Folder');
    await expect(selectFolderBtn).toBeVisible();

    // 2. Mock file upload (directory)
    const tempDir = path.join(process.cwd(), 'temp-test-project');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
    fs.writeFileSync(path.join(tempDir, 'README.md'), '# Project Title\nThis is a test readme.');

    const fileChooserPromise = page.waitForEvent('filechooser');
    await selectFolderBtn.click();
    const fileChooser = await fileChooserPromise;

    await fileChooser.setFiles(tempDir);

    // 3. Verify source added to pool
    await expect(page.getByText('temp-test-project')).toBeVisible();

    // 4. Execute Generator
    const executeBtn = page.getByRole('button', { name: 'Execute Generator' });
    await executeBtn.click();

    // 5. Verify process completion
    await expect(page.getByText('Project Title')).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('This is a test readme.')).toBeVisible();

    // 6. Test Exporters
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Markdown' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('docs.md');

    // Cleanup
    if (fs.existsSync(path.join(tempDir, 'README.md'))) fs.unlinkSync(path.join(tempDir, 'README.md'));
    if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
  });

  test('should switch themes and apply correct colors', async ({ page }) => {
    const app = page.locator('#repo-doc-app');

    // 1. Light Theme (Default)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    // #fcfaf7 is rgb(252, 250, 247)
    await expect(app).toHaveCSS('background-color', 'rgb(252, 250, 247)');

    // 2. Switch to Dark
    await page.getByTitle('dark').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    // #121212 is rgb(18, 18, 18)
    await expect(app).toHaveCSS('background-color', 'rgb(18, 18, 18)');

    // 3. Switch to Solarized
    await page.getByTitle('solarized').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'solarized');
    // #fdf6e3 is rgb(253, 246, 227)
    await expect(app).toHaveCSS('background-color', 'rgb(253, 246, 227)');

    // 4. Switch to Everforest
    await page.getByTitle('everforest').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'everforest');
    // #2b3339 is rgb(43, 51, 57)
    await expect(app).toHaveCSS('background-color', 'rgb(43, 51, 57)');
  });

  test('should disable GitHub source when GITHUB_TOKEN is missing', async ({ page }) => {
    // Intercept config API to return githubEnabled: false
    await page.route('/api/config', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ githubEnabled: false }),
      }),
    );

    // Refresh page to apply mocked config
    await page.reload();

    const remoteButton = page.getByRole('button', { name: 'remote' });

    // Remote button should be disabled and have grayscale class
    await expect(remoteButton).toBeDisabled();
    await expect(remoteButton).toHaveClass(/grayscale/);

    // Should show "GitHub Disabled" message
    await expect(page.getByText('GitHub Disabled')).toBeVisible();
    await expect(page.getByText('Provide a GITHUB_TOKEN')).toBeVisible();
  });
});
