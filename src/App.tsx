import { useState, useMemo, useRef, useEffect } from 'react';
import {
  FolderPlus,
  Github,
  FileText,
  Loader2,
  Plus,
  Trash2,
  XCircle,
  Sun,
  Moon,
  Coffee,
  Trees,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { SourceType, ProcessingOptions, DocFile, CommitInfo, DocState, DocSource } from './types';
import { parseRepoUrl, generateMarkdown } from './lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { GoogleGenAI } from '@google/genai';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Theme = 'light' | 'dark' | 'solarized' | 'everforest';

export default function App() {
  const [config, setConfig] = useState<{ githubEnabled: boolean; geminiEnabled: boolean }>({
    githubEnabled: false,
    geminiEnabled: false,
  });

  useEffect(() => {
    fetch('/api/config')
      .then((res) => res.json())
      .catch(() => ({ githubEnabled: false, geminiEnabled: false }))
      .then(setConfig);
  }, []);

  const ai = useMemo(() => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' }), []);

  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const [sourceType, setSourceType] = useState<SourceType>('remote');
  const [repoUrl, setRepoUrl] = useState('');
  const [sources, setSources] = useState<DocSource[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const isCancelled = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<DocState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [options, setOptions] = useState<ProcessingOptions>({
    includeHistory: true,
    generateSummaries: true,
    generateIndex: true,
    llmOptimized: false,
    organizationStrategy: 'folder',
    formats: ['markdown', 'html'],
  });

  const addSource = () => {
    if (sourceType === 'remote') {
      if (!repoUrl) return;
      // Allow both owner/repo and full URL
      const normalizedUrl = repoUrl.includes('github.com/') ? repoUrl : `https://github.com/${repoUrl}`;
      const repoData = parseRepoUrl(normalizedUrl);
      if (!repoData) {
        setError('Invalid GitHub URL. Example: https://github.com/owner/repo');
        return;
      }
      const newSource: DocSource = {
        id: Math.random().toString(36).substring(7),
        type: 'remote',
        url: normalizedUrl,
        label: `${repoData.owner}/${repoData.repo}`,
      };
      setSources((prev) => [...prev, newSource]);
      setRepoUrl('');
      setError(null);
    } else {
      const input = document.createElement('input');
      input.type = 'file';
      input.webkitdirectory = true;
      input.onchange = (e: Event) => {
        const target = e.target as HTMLInputElement;
        const files = Array.from(target.files || []) as File[];
        if (files.length > 0) {
          const folderName = files[0].webkitRelativePath.split('/')[0] || 'Local Project';
          const newSource: DocSource = {
            id: Math.random().toString(36).substring(7),
            type: 'local',
            files,
            label: folderName,
          };
          setSources((prev) => [...prev, newSource]);
        }
      };
      input.click();
    }
  };

  const removeSource = (id: string) => {
    setSources((prev) => prev.filter((s) => s.id !== id));
  };

  const cancelProcessing = () => {
    isCancelled.current = true;
    setProgress('Cancelling...');
  };

  const handleCancel = () => {
    cancelProcessing();
    setError('Operation cancelled by user');
    setIsProcessing(false);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const fetchGithubRepo = async (
    owner: string,
    repo: string,
    path: string = '',
  ): Promise<DocFile[]> => {
    if (isCancelled.current) throw new Error('Operation cancelled by user');
    const res = await fetch(`/api/github/repo?owner=${owner}&repo=${repo}&path=${path}`);
    if (!res.ok) throw new Error(`Failed to fetch ${path || 'repo'}`);
    const data = await res.json();

    const files: DocFile[] = [];
    const items = Array.isArray(data) ? data : [data];

    for (const item of items) {
      if (isCancelled.current) throw new Error('Operation cancelled by user');
      if (item.type === 'dir') {
        const subFiles = await fetchGithubRepo(owner, repo, item.path);
        files.push(...subFiles);
      } else if (item.name.match(/\.(md|txt|adoc|markdown)$/i)) {
        const contentRes = await fetch(item.download_url);
        const content = await contentRes.text();
        files.push({
          path: item.path,
          name: item.name,
          content,
          type: 'file',
        });
      }
    }
    return files;
  };

  const fetchGithubHistory = async (owner: string, repo: string): Promise<CommitInfo[]> => {
    if (isCancelled.current) return [];
    const res = await fetch(`/api/github/commits?owner=${owner}&repo=${repo}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.map(
      (c: {
        sha: string;
        commit: { message: string; author: { name: string; date: string } };
      }) => ({
        sha: c.sha.substring(0, 7),
        message: c.commit.message,
        author: c.commit.author.name,
        date: new Date(c.commit.author.date).toLocaleDateString(),
      }),
    );
  };

  const summarizeFile = async (file: DocFile): Promise<string> => {
    if (isCancelled.current) return '';
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Summarize the following documentation file named "${file.name}". 
        Focus on key features, installation steps, and usage. Keep it concise.
      
        Content:
        ${file.content.substring(0, 10000)}`,
      });
      return response.text || '';
    } catch (e) {
      console.error('Summarization error:', e);
      return '';
    }
  };

  const handleProcess = async () => {
    setIsProcessing(true);
    isCancelled.current = false;
    setError(null);
    setResult(null);
    setProgress('Initializing...');

    try {
      const allFiles: DocFile[] = [];
      const allHistory: CommitInfo[] = [];
      const titles = sources.map((s) => s.label);
      const mainTitle =
        titles.length > 1
          ? `Multi-Repo Doc (${sources.length} sources)`
          : titles[0] || 'Repository Documentation';

      for (const source of sources) {
        if (isCancelled.current) break;

        if (source.type === 'remote') {
          const repoData = parseRepoUrl(source.url || '');
          if (!repoData) continue;

          setProgress(`Fetching ${source.label}...`);
          const sourceFiles = await fetchGithubRepo(repoData.owner, repoData.repo);
          // Add prefix to paths if multiple sources
          const processedFiles = sourceFiles.map((f) => ({
            ...f,
            path: sources.length > 1 ? `${source.label}/${f.path}` : f.path,
          }));
          allFiles.push(...processedFiles);

          if (options.includeHistory) {
            setProgress(`Extracting history for ${source.label}...`);
            const sourceHistory = await fetchGithubHistory(repoData.owner, repoData.repo);
            allHistory.push(...sourceHistory);
          }
        } else if (source.files) {
          setProgress(`Reading files from ${source.label}...`);
          for (const file of source.files) {
            if (isCancelled.current) break;
            if (file.name.match(/\.(md|txt|adoc|markdown)$/i)) {
              allFiles.push({
                path:
                  sources.length > 1
                    ? `${source.label}/${file.webkitRelativePath || file.name}`
                    : file.webkitRelativePath || file.name,
                name: file.name,
                content: await file.text(),
                type: 'file',
              });
            }
          }
        }
      }

      if (isCancelled.current) {
        throw new Error('Operation cancelled by user');
      }

      if (allFiles.length === 0) throw new Error('No documentation files found.');

      if (options.generateSummaries) {
        setProgress('Generating AI summaries...');
        for (let i = 0; i < allFiles.length; i++) {
          if (isCancelled.current) break;
          setProgress(`Summarizing ${allFiles[i].name} (${i + 1}/${allFiles.length})...`);
          allFiles[i].summary = await summarizeFile(allFiles[i]);
        }
      }

      if (isCancelled.current) {
        throw new Error('Operation cancelled by user');
      }

      setResult({
        title: mainTitle,
        files: allFiles,
        history: allHistory,
        toc: allFiles.map((f) => f.path),
      });
      setProgress('Generation complete!');
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message);
    } finally {
      setIsProcessing(false);
      isCancelled.current = false;
    }
  };

  const generateMarkdownStr = () => generateMarkdown(result, options);

  const generateHtml = () => {
    const md = generateMarkdownStr();
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${result?.title} Documentation</title>
          <script src="https://cdn.tailwindcss.com?plugins=typography"></script>
          <style>
            body { background: var(--bg, #FCFAF7); color: var(--fg, #1A1A1A); }
            .prose { max-width: 800px; margin: 0 auto; padding: 4rem 2rem; }
            a { color: var(--fg, #1A1A1A); font-weight: bold; }
          </style>
        </head>
        <body class="prose lg:prose-xl">
          ${md.replace(/# (.*)/g, '<h1>$1</h1>').replace(/## (.*)/g, '<h2>$1</h2>')}
          <p><em>Generated by RepoDoc</em></p>
        </body>
      </html>
    `;
  };

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const [sessionId] = useState(() => Math.random().toString(36).substring(7).toUpperCase());

  return (
    <div id="repo-doc-app" className="min-h-screen flex flex-col bg-theme-bg text-theme-fg">
      <header className="border-b border-theme-border h-20 flex items-center justify-between px-12 shrink-0">
        <div className="text-3xl font-black uppercase tracking-tighter italic flex items-center gap-3">
          RepoDoc
          <span className="text-[10px] font-sans font-bold not-italic tracking-[0.2em] border border-theme-border px-2 py-0.5 mt-1 opacity-60">
            v1.0
          </span>
        </div>

        <div className="flex items-center gap-8">
          <div className="flex gap-2 p-1 bg-theme-fg/5 rounded-full">
            {(
              [
                { id: 'light', icon: Sun },
                { id: 'dark', icon: Moon },
                { id: 'solarized', icon: Coffee },
                { id: 'everforest', icon: Trees },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className={cn(
                  'p-1.5 rounded-full transition-all',
                  theme === t.id ? 'bg-theme-fg text-theme-bg shadow-lg' : 'opacity-40 hover:opacity-100',
                )}
                title={t.id}
              >
                <t.icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>

          <div className="flex gap-12 font-sans text-[10px] uppercase tracking-[0.2em] font-bold">
            <a href="#" className="opacity-40 hover:opacity-100 transition-opacity">
              Repository
            </a>
            <a href="#" className="opacity-40 hover:opacity-100 transition-opacity">
              History
            </a>
            <a href="#" className="opacity-40 hover:opacity-100 transition-opacity">
              Export
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-12 overflow-hidden">
        <section className="col-span-12 lg:col-span-3 border-r border-theme-border p-8 flex flex-col gap-10 overflow-y-auto">
          <div>
            <label className="font-sans text-[10px] uppercase tracking-[0.3em] font-black opacity-40 block mb-6 text-theme-fg">
              Sources Pool
            </label>

            <AnimatePresence>
              {sources.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-6 space-y-2 max-h-48 overflow-y-auto pr-2"
                >
                  {sources.map((source) => (
                    <div
                      key={source.id}
                      className="flex items-center justify-between p-3 bg-theme-fg/5 rounded-sm group"
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        {source.type === 'remote' ? (
                          <Github className="w-3 h-3 shrink-0" />
                        ) : (
                          <FolderPlus className="w-3 h-3 shrink-0" />
                        )}
                        <span className="font-sans text-[10px] font-black uppercase truncate">
                          {source.label}
                        </span>
                      </div>
                      {!isProcessing && (
                        <button
                          onClick={() => removeSource(source.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex gap-2 p-1 bg-theme-fg/5 rounded-sm mb-6">
              {(['remote', 'local'] as SourceType[]).map((type) => (
                <button
                  key={type}
                  disabled={isProcessing || (type === 'remote' && !config.githubEnabled)}
                  onClick={() => setSourceType(type)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 py-3 px-3 text-[10px] font-sans uppercase font-bold tracking-wider transition-all',
                    sourceType === type
                      ? 'bg-theme-fg text-theme-bg'
                      : 'text-theme-fg opacity-30 hover:opacity-50',
                    type === 'remote' && !config.githubEnabled && 'grayscale cursor-not-allowed',
                  )}
                >
                  {type === 'remote' ? (
                    <Github className="w-3 h-3" />
                  ) : (
                    <FolderPlus className="w-3 h-3" />
                  )}
                  {type}
                </button>
              ))}
            </div>

            {sourceType === 'remote' && config.githubEnabled ? (
              <div className="space-y-4">
                <div className="relative">
                  <input
                    disabled={isProcessing}
                    type="text"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addSource()}
                    placeholder="https://github.com/owner/repo"
                    className="w-full bg-transparent border-b border-theme-border py-3 font-serif text-lg italic focus:outline-none placeholder:opacity-20 transition-all pr-10"
                  />
                  <button
                    disabled={isProcessing || !repoUrl}
                    onClick={addSource}
                    className="absolute right-0 bottom-3 opacity-40 hover:opacity-100 disabled:hidden"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-[10px] font-sans font-medium opacity-40 italic">
                  Add GitHub repositories to the pool
                </p>
              </div>
            ) : sourceType === 'remote' && !config.githubEnabled ? (
              <div className="p-4 border border-theme-border/20 rounded-sm bg-theme-fg/5">
                <p className="text-[10px] font-sans font-bold uppercase tracking-wider opacity-60 mb-2">
                  GitHub Disabled
                </p>
                <p className="text-[10px] font-sans opacity-40 leading-relaxed italic">
                  Provide a GITHUB_TOKEN in environment variables to enable remote repository extraction.
                </p>
              </div>
            ) : (
              <button
                disabled={isProcessing}
                className="w-full p-8 border border-dashed border-theme-border text-center hover:bg-theme-fg hover:text-theme-bg transition-all cursor-pointer group flex flex-col items-center disabled:opacity-30 disabled:cursor-not-allowed"
                onClick={addSource}
              >
                <FolderPlus className="w-8 h-8 mx-auto mb-3 opacity-30 group-hover:opacity-100" />
                <p className="text-[10px] font-sans uppercase font-bold tracking-widest">
                  Select Folder
                </p>
              </button>
            )}
          </div>

          <div>
            <label className="font-sans text-[10px] uppercase tracking-[0.3em] font-black opacity-40 block mb-6">
              Configuration
            </label>
            <div className="flex flex-col gap-4">
              {[
                { id: 'includeHistory', label: 'Consolidate History' },
                { id: 'generateSummaries', label: 'AI Summaries' },
                { id: 'generateIndex', label: 'Global Index' },
                { id: 'llmOptimized', label: 'LLM Optimized' },
              ].map((opt) => {
                const isDisabled =
                  isProcessing ||
                  ((opt.id === 'generateSummaries' || opt.id === 'llmOptimized') &&
                    !config.geminiEnabled);
                return (
                  <label
                    key={opt.id}
                    className={cn(
                      'flex items-center justify-between font-sans text-xs font-bold tracking-tight cursor-pointer py-2 border-b border-theme-border/5 hover:bg-theme-fg/5 px-2 -mx-2 transition-colors',
                      isDisabled && 'opacity-30 cursor-not-allowed grayscale',
                    )}
                  >
                    <span
                      className={cn(
                        options[opt.id as keyof ProcessingOptions] ? 'opacity-100' : 'opacity-30',
                      )}
                    >
                      {opt.label}
                      {isDisabled && !isProcessing && (
                        <span className="block text-[8px] uppercase tracking-tighter opacity-100 text-red-500">
                          Gemini Key Missing
                        </span>
                      )}
                    </span>
                    <div className="relative">
                      <input
                        disabled={isDisabled}
                        type="checkbox"
                        checked={!!options[opt.id as keyof ProcessingOptions]}
                        onChange={(e) => setOptions({ ...options, [opt.id]: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4 bg-transparent border border-theme-border rounded-full transition-colors peer-checked:bg-theme-fg"></div>
                      <div
                        className={cn(
                          'absolute top-1 w-2 h-2 rounded-full transition-all',
                          options[opt.id as keyof ProcessingOptions]
                            ? 'right-1 bg-theme-bg'
                            : 'left-1 bg-theme-fg',
                        )}
                      ></div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="mt-auto pt-8">
            {isProcessing ? (
              <button
                onClick={handleCancel}
                className="w-full py-6 border-2 border-red-500 text-red-500 font-sans font-black uppercase tracking-[0.2em] text-sm hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-2"
              >
                <XCircle className="w-4 h-4" />
                Cancel Generation
              </button>
            ) : (
              <button
                disabled={sources.length === 0}
                onClick={handleProcess}
                className={cn(
                  'w-full py-6 border-2 border-theme-border font-sans font-black uppercase tracking-[0.2em] text-sm transition-all duration-300',
                  sources.length === 0
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:bg-theme-fg hover:text-theme-bg shadow-[8px_8px_0px_0px_var(--border-shadow)] active:translate-x-1 active:translate-y-1 active:shadow-none',
                )}
              >
                Execute Generator
              </button>
            )}
          </div>
        </section>

        <section className="col-span-12 lg:col-span-9 p-12 flex flex-col overflow-y-auto">
          <div className="flex flex-col lg:flex-row justify-between items-start gap-8 mb-16">
            <div className="max-w-xl">
              <h1 className="text-7xl font-bold leading-[0.85] tracking-tighter mb-4 text-theme-fg">
                Transforming
                <br />
                <span className="italic font-light opacity-40">Code into Context.</span>
              </h1>
              <p className="font-serif text-lg text-theme-fg/60 italic max-w-sm">
                A deterministic extraction engine for technical documentation and LLM readiness.
              </p>
            </div>

            <div className="text-right">
              <label className="font-sans text-[10px] uppercase tracking-[0.3em] font-black opacity-40 block mb-4 text-right">
                Available Exports
              </label>
              <div className="flex flex-col items-end gap-3 font-serif italic font-black text-3xl uppercase tracking-tighter">
                <button
                  onClick={() =>
                    result && downloadFile(generateMarkdownStr(), 'docs.md', 'text/markdown')
                  }
                  className={cn(
                    'transition-opacity',
                    result ? 'opacity-100 hover:opacity-60' : 'opacity-10',
                  )}
                >
                  Markdown
                </button>
                <button
                  onClick={() => result && downloadFile(generateHtml(), 'docs.html', 'text/html')}
                  className={cn(
                    'transition-opacity',
                    result ? 'opacity-100 hover:opacity-60' : 'opacity-10',
                  )}
                >
                  HTML View
                </button>
                <button
                  onClick={() =>
                    result && downloadFile(JSON.stringify(result), 'docs.json', 'application/json')
                  }
                  className={cn(
                    'transition-opacity',
                    result ? 'opacity-100 hover:opacity-60' : 'opacity-10',
                  )}
                >
                  JSON Data
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-16">
            {[
              {
                num: '01',
                title: 'Discovery',
                desc: 'Recursive scan... locating markdown artifacts.',
              },
              {
                num: '02',
                title: 'Extraction',
                desc: 'Parsing content... maintaining relational paths.',
              },
              {
                num: '03',
                title: 'Consolidation',
                desc: 'Auto-indexing... generating semantic summaries.',
              },
            ].map((step) => (
              <div key={step.num} className="border-t border-theme-border pt-6 group">
                <div className="font-sans text-[10px] uppercase tracking-[0.4em] font-black mb-4 flex items-center">
                  <span className="w-1.5 h-1.5 bg-theme-fg rounded-full mr-2 group-hover:scale-150 transition-transform"></span>
                  {step.num} {step.title}
                </div>
                <p className="text-sm italic opacity-60 leading-relaxed font-serif text-theme-fg">
                  {isProcessing && progress.includes(step.title) ? (
                    <span className="animate-pulse">Active: {progress}</span>
                  ) : (
                    step.desc
                  )}
                </p>
              </div>
            ))}
          </div>

          <div className="flex-1 min-h-[400px] flex flex-col relative group">
            <div className="absolute inset-x-0 bottom-0 top-0 bg-theme-bg border border-theme-border shadow-[16px_16px_0px_0px_var(--preview-shadow)] pointer-events-none"></div>

            <div className="relative flex-1 p-10 flex flex-col overflow-hidden bg-theme-bg mt-4 mx-4 mb-4 border border-theme-border">
              <div className="absolute top-4 right-6 font-sans text-[8px] uppercase tracking-[0.3em] font-black opacity-20 text-theme-fg">
                Consolidated Output
              </div>

              <AnimatePresence mode="wait">
                {isProcessing ? (
                  <motion.div
                    key="processing"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex-1 flex flex-col items-center justify-center text-center p-12"
                  >
                    <Loader2 className="w-8 h-8 animate-spin mb-4 opacity-20 text-theme-fg" />
                    <div className="font-serif italic text-2xl mb-2 opacity-60 text-theme-fg">
                      System actively processing
                    </div>
                    <div className="font-sans text-[10px] uppercase tracking-widest font-bold opacity-30 text-theme-fg">
                      {progress}
                    </div>
                  </motion.div>
                ) : result ? (
                  <motion.div
                    key="result"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex-1 overflow-y-auto pr-4 font-mono text-xs text-theme-fg/80 leading-relaxed prose prose-slate max-w-none prose-headings:font-serif prose-headings:italic prose-headings:text-theme-fg prose-p:text-theme-fg prose-strong:text-theme-fg prose-code:text-theme-fg font-mono"
                  >
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {generateMarkdownStr()}
                    </ReactMarkdown>
                  </motion.div>
                ) : error ? (
                  <motion.div
                    key="error"
                    className="flex-1 flex flex-col items-center justify-center text-center"
                  >
                    <div
                      className={cn(
                        'font-serif italic text-xl mb-4 text-theme-fg',
                        error && error.includes('cancelled') ? 'opacity-60' : 'text-red-500',
                      )}
                    >
                      {error && error.includes('cancelled') ? 'Operation Stopped' : 'Pipeline Interrupted'}
                    </div>
                    <div className="font-sans text-[10px] uppercase font-black opacity-30 border border-theme-border/20 px-4 py-2 text-theme-fg">
                      {error}
                    </div>
                    <button
                      onClick={() => setError(null)}
                      className="mt-8 font-sans text-[10px] uppercase font-black underline underline-offset-4 text-theme-fg"
                    >
                      Reset View
                    </button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="empty"
                    className="flex-1 flex flex-col items-center justify-center text-center opacity-10 grayscale"
                  >
                    <FileText className="w-16 h-16 mb-4 stroke-1 text-theme-fg" />
                    <div className="font-serif italic text-2xl text-theme-fg">Awaiting Repository Input</div>
                  </motion.div>
                )}
              </AnimatePresence>

              {!isProcessing && result && (
                <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-theme-bg to-transparent pointer-events-none"></div>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="h-14 border-t border-theme-border flex items-center justify-between px-12 font-sans text-[9px] uppercase tracking-[0.3em] font-black opacity-40 shrink-0 text-theme-fg">
        <div className="flex gap-8">
          <span>Session: {sessionId}</span>
          <span>Status: Deterministic</span>
        </div>
        <div className="flex gap-8">
          <span>{new Date().getFullYear()} Design System</span>
          <span className="italic">Technical Documentation Redefined</span>
        </div>
      </footer>
    </div>
  );
}
