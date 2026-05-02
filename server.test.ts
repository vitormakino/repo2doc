import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { app } from './server';

// Mock Vite
vi.mock('vite', () => ({
  createServer: vi.fn().mockResolvedValue({
    middlewares: vi.fn((req, res, next) => next()),
  }),
}));

// Mock Octokit
vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn().mockImplementation(function () {
    return {
      repos: {
        getContent: vi
          .fn()
          .mockResolvedValue({ data: { name: 'README.md', type: 'file', content: 'hello' } }),
        listCommits: vi.fn().mockResolvedValue({
          data: [
            {
              sha: '123',
              commit: { message: 'test', author: { name: 'user', date: '2024-01-01' } },
            },
          ],
        }),
      },
    };
  }),
}));

describe('API Endpoints', () => {
  it('GET /api/github/repo should return repo content', async () => {
    const response = await request(app)
      .get('/api/github/repo')
      .query({ owner: 'test', repo: 'repo' });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('name', 'README.md');
  });

  it('GET /api/github/commits should return commit history', async () => {
    const response = await request(app)
      .get('/api/github/commits')
      .query({ owner: 'test', repo: 'repo' });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body[0]).toHaveProperty('sha', '123');
  });
});
