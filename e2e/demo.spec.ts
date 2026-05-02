import { test, expect } from '@playwright/test';

test.describe('RepoDoc Presentation Demo', () => {
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
    await page.route(/\/api\/github\/repo.*/, async (route) => {
      // Add a delay to make demo look good and show processing state
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { path: 'README.md', name: 'README.md', content: '# Mock README', type: 'file' },
        ]),
      });
    });
    // 1. Inject Visual Cursor Effect
    await page.addInitScript(() => {
      const box = document.createElement('div');
      box.id = 'playwright-cursor';
      box.style.position = 'fixed';
      box.style.top = '0';
      box.style.left = '0';
      box.style.width = '30px';
      box.style.height = '30px';
      box.style.border = '2px solid rgba(255, 0, 0, 0.8)';
      box.style.borderRadius = '50%';
      box.style.backgroundColor = 'rgba(255, 0, 0, 0.2)';
      box.style.pointerEvents = 'none';
      box.style.zIndex = '999999';
      box.style.transition = 'transform 0.1s ease-out';
      box.style.display = 'none';
      document.documentElement.appendChild(box);

      document.addEventListener('mousemove', (e) => {
        box.style.display = 'block';
        box.style.transform = `translate(${e.clientX - 15}px, ${e.clientY - 15}px)`;
      });

      document.addEventListener('mousedown', () => {
        box.style.background = 'rgba(255, 0, 0, 0.6)';
        box.style.width = '20px';
        box.style.height = '20px';
        box.style.marginTop = '5px';
        box.style.marginLeft = '5px';
      });

      document.addEventListener('mouseup', () => {
        box.style.background = 'rgba(255, 0, 0, 0.2)';
        box.style.width = '30px';
        box.style.height = '30px';
        box.style.marginTop = '0';
        box.style.marginLeft = '0';
      });
    });

    // 2. Hide UI Clutter
    await page.addStyleTag({
      content: `
        .developer-banner, .cookie-banner { display: none !important; }
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 10px; }
      `,
    });
  });

  test('main-feature-demo', async ({ page }) => {
    await page.goto('/');
    // Wait for config to load
    const remote = page.getByRole('button', { name: 'remote' });
    const local = page.getByRole('button', { name: 'local' });

    await expect(remote.or(local)).toHaveCount(2); // ambos no DOM

    await expect(remote).toBeVisible();
    await expect(local).toBeVisible();

    // [NARRATION]: "Welcome to RepoDoc, the tool that turns your codebase into beautiful documentation."
    await page.waitForTimeout(2000);

    // [NARRATION]: "We support multiple themes to match your creative flow. Let's explore them."
    const themes = ['dark', 'solarized', 'everforest', 'light'];
    for (const themeName of themes) {
      const themeBtn = page.getByTitle(themeName);
      if (await themeBtn.isVisible()) {
        await themeBtn.click();
        await page.waitForTimeout(1500);
      }
    }

    // [NARRATION]: "Adding a project is simple. You can use a local folder or a remote repository."
    // Check if remote is enabled before trying to type
    const githubStatus = await page.evaluate(async () => {
      const res = await fetch('/api/config');
      return res.json();
    });

    if (githubStatus.githubEnabled) {
      await page.getByRole('button', { name: 'remote' }).click();
      const repoInput = page.getByPlaceholder('https://github.com/owner/repo');
      await repoInput.click();
      await page.keyboard.type('vitormakino/repodoc', { delay: 100 });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);
    } else {
      // Demo with local if remote is disabled
      await page.getByRole('button', { name: 'local' }).click();
      await page.waitForTimeout(1000);
    }

    // [NARRATION]: "Once configured, simply execute the generator to build your documentation site."
    const executeBtn = page.getByRole('button', { name: 'Execute Generator' });
    if (await executeBtn.isVisible()) {
      await executeBtn.click();
      // [NARRATION]: "RepoDoc processes your files, generates summaries, and builds a comprehensive index."
      await page.waitForTimeout(5000);
      await page.waitForTimeout(3000);
    }
  });
});
