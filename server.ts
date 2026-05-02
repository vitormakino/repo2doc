import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { Octokit } from '@octokit/rest';
import dotenv from 'dotenv';

dotenv.config();

export const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

// API routes go here
app.get('/api/config', (req, res) => {
  res.json({
    githubEnabled: !!process.env.GITHUB_TOKEN,
    geminiEnabled: !!process.env.GEMINI_API_KEY,
  });
});

// GitHub Content Fetching
app.get('/api/github/repo', async (req, res) => {
  try {
    const {
      owner,
      repo,
      path: repoPath = '',
    } = req.query as { owner: string; repo: string; path: string };

    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: repoPath,
    });

    res.json(data);
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GitHub Commit History
app.get('/api/github/commits', async (req, res) => {
  try {
    const { owner, repo } = req.query as { owner: string; repo: string };
    const { data } = await octokit.repos.listCommits({
      owner,
      repo,
      per_page: 20,
    });
    res.json(data);
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    res.status(err.status || 500).json({ error: err.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  startServer();
}
