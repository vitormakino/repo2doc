export type SourceType = 'local' | 'remote';

export interface DocFile {
  path: string;
  name: string;
  content: string;
  summary?: string;
  type: 'file' | 'dir';
}

export interface CommitInfo {
  sha: string;
  message: string;
  author: string;
  date: string;
}

export interface ProcessingOptions {
  includeHistory: boolean;
  generateSummaries: boolean;
  generateIndex: boolean;
  llmOptimized: boolean;
  organizationStrategy: 'folder' | 'headings';
  formats: ('markdown' | 'json' | 'html')[];
}

export interface DocState {
  title: string;
  files: DocFile[];
  history: CommitInfo[];
  toc: string[];
}
