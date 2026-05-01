import { describe, it, expect } from 'vitest';
import { parseRepoUrl, generateMarkdown } from './utils';
import { DocState, ProcessingOptions } from '../types';

describe('Utility Functions', () => {
  describe('parseRepoUrl', () => {
    it('should correctly parse a valid GitHub URL', () => {
      const url = 'https://github.com/owner/repo';
      const result = parseRepoUrl(url);
      expect(result).toEqual({ owner: 'owner', repo: 'repo' });
    });

    it('should handle .git suffix', () => {
      const url = 'https://github.com/owner/repo.git';
      const result = parseRepoUrl(url);
      expect(result).toEqual({ owner: 'owner', repo: 'repo' });
    });

    it('should return null for invalid URL', () => {
      expect(parseRepoUrl('not-a-url')).toBeNull();
      expect(parseRepoUrl('https://google.com')).toBeNull();
    });
  });

  describe('generateMarkdown', () => {
    const mockState: DocState = {
      title: 'Test Repo',
      files: [
        {
          path: 'README.md',
          name: 'README.md',
          content: 'Hello World',
          type: 'file',
          summary: 'Brief intro',
        },
      ],
      history: [],
      toc: ['README.md'],
    };

    const mockOptions: ProcessingOptions = {
      includeHistory: false,
      generateSummaries: true,
      generateIndex: true,
      llmOptimized: false,
      organizationStrategy: 'folder',
      formats: ['markdown'],
    };

    it('should generate basic markdown with TOC', () => {
      const md = generateMarkdown(mockState, mockOptions);
      expect(md).toContain('# Test Repo');
      expect(md).toContain('## Table of Contents');
      expect(md).toContain('* [README.md](#readme-md)');
      expect(md).toContain('## Section: README.md');
      expect(md).toContain('> **AI Summary:** Brief intro');
      expect(md).toContain('Hello World');
    });

    it('should generate LLM optimized format', () => {
      const options = { ...mockOptions, llmOptimized: true };
      const md = generateMarkdown(mockState, options);
      expect(md).toContain('<context path="README.md">');
      expect(md).toContain('<summary>Brief intro</summary>');
      expect(md).toContain('<content>\nHello World\n</content>');
    });
  });
});
