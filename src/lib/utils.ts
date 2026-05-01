import { ProcessingOptions, DocState } from '../types';

export const parseRepoUrl = (url: string) => {
  try {
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (match) return { owner: match[1], repo: match[2].replace('.git', '') };
  } catch {
    // Silent fail
  }
  return null;
};

export const generateMarkdown = (result: DocState | null, options: ProcessingOptions) => {
  if (!result) return '';
  let md = `# ${result.title}\n\n`;

  if (options.generateIndex) {
    md += `## Table of Contents\n\n`;
    result.files.forEach((f) => {
      md += `* [${f.path}](#${f.path.toLowerCase().replace(/[^a-z0-9]/g, '-')})\n`;
    });
    md += `\n---\n\n`;
  }

  result.files.forEach((f) => {
    md += `<a name="${f.path.toLowerCase().replace(/[^a-z0-9]/g, '-')}"></a>\n`;
    md += `## Section: ${f.path}\n\n`;

    if (options.llmOptimized) {
      md += `<context path="${f.path}">\n`;
      if (f.summary) md += `<summary>${f.summary}</summary>\n`;
      md += `<content>\n${f.content}\n</content>\n`;
      md += `</context>\n\n`;
    } else {
      if (f.summary) {
        md += `> **AI Summary:** ${f.summary}\n\n`;
      }
      md += f.content + '\n\n---\n\n';
    }
  });

  if (options.includeHistory && result.history.length > 0) {
    md += `## Version History\n\n`;
    result.history.forEach((c) => {
      md += `### Commit [${c.sha}]\n`;
      md += `* **Message:** ${c.message}\n`;
      md += `* **Author:** ${c.author}\n`;
      md += `* **Date:** ${c.date}\n\n`;
    });
  }

  return md;
};
