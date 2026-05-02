import { test } from '@playwright/test';

test.describe('RepoDoc Presentation Demo', () => {
  test.beforeEach(async ({ page }) => {
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
      const repoInput = page.getByPlaceholder('vitor-makino/repodoc');
      await repoInput.click();
      await page.keyboard.type('vitor-makino/repodoc', { delay: 100 });
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
