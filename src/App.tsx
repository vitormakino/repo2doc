import { useState, useCallback } from 'react';
import { 
  FolderPlus, 
  Github, 
  Settings2, 
  FileText, 
  History, 
  Zap, 
  Download, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  ChevronRight,
  Eye
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { SourceType, ProcessingOptions, DocFile, CommitInfo, DocState } from './types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import JSZip from 'jszip';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [sourceType, setSourceType] = useState<SourceType>('remote');
  const [repoUrl, setRepoUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
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

  const parseRepoUrl = (url: string) => {
    try {
      const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (match) return { owner: match[1], repo: match[2].replace('.git', '') };
    } catch (e) {}
    return null;
  };

  const fetchGithubRepo = async (owner: string, repo: string, path: string = ''): Promise<DocFile[]> => {
    const res = await fetch(`/api/github/repo?owner=${owner}&repo=${repo}&path=${path}`);
    if (!res.ok) throw new Error(`Failed to fetch ${path || 'repo'}`);
    const data = await res.json();
    
    const files: DocFile[] = [];
    const items = Array.isArray(data) ? data : [data];

    for (const item of items) {
      if (item.type === 'dir') {
        const subFiles = await fetchGithubRepo(owner, repo, item.path);
        files.push(...subFiles);
      } else if (item.name.match(/\.(md|txt|adoc|markdown)$/i)) {
        // Fetch content for doc files
        const contentRes = await fetch(item.download_url);
        const content = await contentRes.text();
        files.push({
          path: item.path,
          name: item.name,
          content,
          type: 'file'
        });
      }
    }
    return files;
  };

  const fetchGithubHistory = async (owner: string, repo: string): Promise<CommitInfo[]> => {
    const res = await fetch(`/api/github/commits?owner=${owner}&repo=${repo}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.map((c: any) => ({
      sha: c.sha.substring(0, 7),
      message: c.commit.message,
      author: c.commit.author.name,
      date: new Date(c.commit.author.date).toLocaleDateString()
    }));
  };

  const summarizeFile = async (file: DocFile): Promise<string> => {
    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: file.content, filename: file.name })
      });
      if (!res.ok) return '';
      const data = await res.json();
      return data.summary;
    } catch (e) {
      return '';
    }
  };

  const handleProcess = async () => {
    setIsProcessing(true);
    setError(null);
    setResult(null);
    setProgress('Initializing...');

    try {
      let files: DocFile[] = [];
      let history: CommitInfo[] = [];
      let title = 'Repository Documentation';

      if (sourceType === 'remote') {
        const repoData = parseRepoUrl(repoUrl);
        if (!repoData) throw new Error('Invalid GitHub URL. Example: https://github.com/owner/repo');
        
        title = `${repoData.owner}/${repoData.repo}`;
        setProgress(`Fetching ${title}...`);
        files = await fetchGithubRepo(repoData.owner, repoData.repo);
        
        if (options.includeHistory) {
          setProgress('Extracting commit history...');
          history = await fetchGithubHistory(repoData.owner, repoData.repo);
        }
      } else {
        // Local files handled via hidden input
        const input = document.createElement('input');
        input.type = 'file';
        input.webkitdirectory = true;
        
        const filesPromise = new Promise<File[]>((resolve) => {
          input.onchange = (e: any) => resolve(Array.from(e.target.files));
        });
        
        input.click();
        const selectedFiles = await filesPromise;
        
        setProgress(`Reading ${selectedFiles.length} files...`);
        for (const file of selectedFiles) {
          if (file.name.match(/\.(md|txt|adoc|markdown)$/i)) {
            files.push({
              path: file.webkitRelativePath || file.name,
              name: file.name,
              content: await file.text(),
              type: 'file'
            });
          }
        }
        title = selectedFiles[0]?.webkitRelativePath.split('/')[0] || 'Local Project';
      }

      if (files.length === 0) throw new Error('No documentation files found.');

      if (options.generateSummaries) {
        setProgress('Generating AI summaries...');
        for (let i = 0; i < files.length; i++) {
          setProgress(`Summarizing ${files[i].name} (${i + 1}/${files.length})...`);
          files[i].summary = await summarizeFile(files[i]);
        }
      }

      setResult({
        title,
        files,
        history,
        toc: files.map(f => f.path)
      });
      setProgress('Generation complete!');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const generateMarkdown = () => {
    if (!result) return '';
    let md = `# ${result.title}\n\n`;
    
    if (options.generateIndex) {
      md += `## Table of Contents\n\n`;
      result.files.forEach(f => {
        md += `* [${f.path}](#${f.path.toLowerCase().replace(/[^a-z0-9]/g, '-')})\n`;
      });
      md += `\n---\n\n`;
    }

    result.files.forEach(f => {
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
      result.history.forEach(c => {
        md += `### Commit [${c.sha}]\n`;
        md += `* **Message:** ${c.message}\n`;
        md += `* **Author:** ${c.author}\n`;
        md += `* **Date:** ${c.date}\n\n`;
      });
    }

    return md;
  };

  const generateHtml = () => {
    const md = generateMarkdown();
    // Simplified markdown to HTML rendering for download
    // In a real app we'd use a library, but here we can wrap it in a pretty shell
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${result?.title} Documentation</title>
          <script src="https://cdn.tailwindcss.com?plugins=typography"></script>
          <style>
            body { background: #0f172a; color: #f8fafc; }
            .prose { max-width: 65ch; margin: 0 auto; padding: 4rem 2rem; }
            a { color: #818cf8; }
          </style>
        </head>
        <body class="prose prose-invert lg:prose-xl">
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

  return (
    <div id="repo-doc-app" className="min-h-screen bg-[#FCFAF7] text-[#1A1A1A] font-serif flex flex-col">
      {/* Top Header Bar */}
      <header className="border-b border-[#1A1A1A] h-20 flex items-center justify-between px-12 shrink-0">
        <div className="text-3xl font-black uppercase tracking-tighter italic flex items-center gap-3">
          RepoDoc 
          <span className="text-[10px] font-sans font-bold not-italic tracking-[0.2em] border border-[#1A1A1A] px-2 py-0.5 mt-1 opacity-60">
            v1.0
          </span>
        </div>
        <div className="flex gap-12 font-sans text-[10px] uppercase tracking-[0.2em] font-bold">
          <a href="#" className="opacity-40 hover:opacity-100 transition-opacity">Repository</a>
          <a href="#" className="opacity-40 hover:opacity-100 transition-opacity">History</a>
          <a href="#" className="opacity-40 hover:opacity-100 transition-opacity">Export</a>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-12 overflow-hidden">
        {/* Sidebar: Input & Config */}
        <section className="col-span-12 lg:col-span-3 border-r border-[#1A1A1A] p-8 flex flex-col gap-10 overflow-y-auto">
          <div>
            <label className="font-sans text-[10px] uppercase tracking-[0.3em] font-black opacity-40 block mb-6">Input Source</label>
            <div className="flex gap-2 p-1 bg-[#1A1A1A]/5 rounded-sm mb-6">
              {(['remote', 'local'] as SourceType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setSourceType(type)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-3 px-3 text-[10px] font-sans uppercase font-bold tracking-wider transition-all",
                    sourceType === type 
                      ? "bg-[#1A1A1A] text-white" 
                      : "text-[#1A1A1A] opacity-30 hover:opacity-50"
                  )}
                >
                  {type === 'remote' ? <Github className="w-3 h-3" /> : <FolderPlus className="w-3 h-3" />}
                  {type}
                </button>
              ))}
            </div>

            {sourceType === 'remote' ? (
              <div className="space-y-4">
                <input
                  type="text"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo"
                  className="w-full bg-transparent border-b border-[#1A1A1A] py-3 font-serif text-lg italic focus:outline-none placeholder:opacity-20 transition-all"
                />
                <p className="text-[10px] font-sans font-medium opacity-40 italic">Input valid GitHub repository URL</p>
              </div>
            ) : (
              <div 
                className="p-8 border border-dashed border-[#1A1A1A] text-center hover:bg-[#1A1A1A] hover:text-white transition-all cursor-pointer group" 
                onClick={handleProcess}
              >
                <FolderPlus className="w-8 h-8 mx-auto mb-3 opacity-30 group-hover:opacity-100" />
                <p className="text-[10px] font-sans uppercase font-bold tracking-widest">Select Folder</p>
              </div>
            )}
          </div>

          <div>
            <label className="font-sans text-[10px] uppercase tracking-[0.3em] font-black opacity-40 block mb-6">Configuration</label>
            <div className="flex flex-col gap-4">
              {[
                { id: 'includeHistory', label: 'Consolidate History' },
                { id: 'generateSummaries', label: 'AI Summaries' },
                { id: 'generateIndex', label: 'Global Index' },
                { id: 'llmOptimized', label: 'LLM Optimized' },
              ].map((opt) => (
                <label key={opt.id} className="flex items-center justify-between font-sans text-xs font-bold tracking-tight cursor-pointer py-2 border-b border-[#1A1A1A]/5 hover:bg-[#1A1A1A]/5 px-2 -mx-2 transition-colors">
                  <span className={cn(options[opt.id as keyof ProcessingOptions] ? "opacity-100" : "opacity-30")}>
                    {opt.label}
                  </span>
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={!!options[opt.id as keyof ProcessingOptions]}
                      onChange={(e) => setOptions({ ...options, [opt.id]: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4 bg-transparent border border-[#1A1A1A] rounded-full transition-colors peer-checked:bg-[#1A1A1A]"></div>
                    <div className={cn(
                      "absolute top-1 w-2 h-2 rounded-full transition-all",
                      options[opt.id as keyof ProcessingOptions] 
                        ? "right-1 bg-white" 
                        : "left-1 bg-[#1A1A1A]"
                    )}></div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="mt-auto pt-8">
            <button
              disabled={isProcessing || (sourceType === 'remote' && !repoUrl)}
              onClick={handleProcess}
              className={cn(
                "w-full py-6 border-2 border-[#1A1A1A] font-sans font-black uppercase tracking-[0.2em] text-sm transition-all duration-300",
                isProcessing 
                  ? "opacity-50 cursor-not-allowed" 
                  : "hover:bg-[#1A1A1A] hover:text-[#FCFAF7] shadow-[8px_8px_0px_0px_rgba(26,26,26,0.1)] active:translate-x-1 active:translate-y-1 active:shadow-none"
              )}
            >
              {isProcessing ? 'Processing' : 'Execute Generator'}
            </button>
          </div>
        </section>

        {/* Main Body */}
        <section className="col-span-12 lg:col-span-9 p-12 flex flex-col overflow-y-auto">
          <div className="flex flex-col lg:flex-row justify-between items-start gap-8 mb-16">
            <div className="max-w-xl">
              <h1 className="text-7xl font-bold leading-[0.85] tracking-tighter mb-4">
                Transforming<br/>
                <span className="italic font-light opacity-40">Code into Context.</span>
              </h1>
              <p className="font-serif text-lg text-[#1A1A1A]/60 italic max-w-sm">
                A deterministic extraction engine for technical documentation and LLM readiness.
              </p>
            </div>
            
            <div className="text-right">
              <label className="font-sans text-[10px] uppercase tracking-[0.3em] font-black opacity-40 block mb-4 text-right">Available Exports</label>
              <div className="flex flex-col items-end gap-3 font-serif italic font-black text-3xl uppercase tracking-tighter">
                <button onClick={() => result && downloadFile(generateMarkdown(), 'docs.md', 'text/markdown')} className={cn("transition-opacity", result ? "opacity-100 hover:opacity-60" : "opacity-10")}>Markdown</button>
                <button onClick={() => result && downloadFile(generateHtml(), 'docs.html', 'text/html')} className={cn("transition-opacity", result ? "opacity-100 hover:opacity-60" : "opacity-10")}>HTML View</button>
                <button onClick={() => result && downloadFile(JSON.stringify(result), 'docs.json', 'application/json')} className={cn("transition-opacity", result ? "opacity-100 hover:opacity-60" : "opacity-10")}>JSON Data</button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-16">
            {[
              { num: '01', title: 'Discovery', desc: 'Recursive scan... locating markdown artifacts.' },
              { num: '02', title: 'Extraction', desc: 'Parsing content... maintaining relational paths.' },
              { num: '03', title: 'Consolidation', desc: 'Auto-indexing... generating semantic summaries.' }
            ].map((step) => (
              <div key={step.num} className="border-t border-[#1A1A1A] pt-6 group">
                <div className="font-sans text-[10px] uppercase tracking-[0.4em] font-black mb-4 flex items-center">
                  <span className="w-1.5 h-1.5 bg-[#1A1A1A] rounded-full mr-2 group-hover:scale-150 transition-transform"></span> 
                  {step.num} {step.title}
                </div>
                <p className="text-sm italic opacity-60 leading-relaxed font-serif">
                  {isProcessing && progress.includes(step.title) ? <span className="animate-pulse">Active: {progress}</span> : step.desc}
                </p>
              </div>
            ))}
          </div>

          {/* Preview Pane */}
          <div className="flex-1 min-h-[400px] flex flex-col relative group">
             {/* Decorative Box Shadow */}
             <div className="absolute inset-x-0 bottom-0 top-0 bg-white border border-[#1A1A1A] shadow-[16px_16px_0px_0px_rgba(26,26,26,0.03)] pointer-events-none"></div>
             
             <div className="relative flex-1 p-10 flex flex-col overflow-hidden bg-white mt-4 mx-4 mb-4 border border-[#1A1A1A]">
                <div className="absolute top-4 right-6 font-sans text-[8px] uppercase tracking-[0.3em] font-black opacity-20">
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
                      <Loader2 className="w-8 h-8 animate-spin mb-4 opacity-20" />
                      <div className="font-serif italic text-2xl mb-2 opacity-60">System actively processing</div>
                      <div className="font-sans text-[10px] uppercase tracking-widest font-bold opacity-30">{progress}</div>
                    </motion.div>
                  ) : result ? (
                    <motion.div 
                      key="result"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex-1 overflow-y-auto pr-4 font-mono text-xs text-[#1A1A1A]/80 leading-relaxed prose prose-slate max-w-none prose-headings:font-serif prose-headings:italic font-mono"
                    >
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {generateMarkdown()}
                      </ReactMarkdown>
                    </motion.div>
                  ) : error ? (
                    <motion.div 
                      key="error"
                      className="flex-1 flex flex-col items-center justify-center text-center"
                    >
                      <div className="text-red-500 font-serif italic text-xl mb-4">Pipeline Interrupted</div>
                      <div className="font-sans text-[10px] uppercase font-black opacity-30 border border-red-500/20 px-4 py-2">{error}</div>
                      <button onClick={() => setError(null)} className="mt-8 font-sans text-[10px] uppercase font-black underline underline-offset-4">Retry Operation</button>
                    </motion.div>
                  ) : (
                    <motion.div 
                      key="empty"
                      className="flex-1 flex flex-col items-center justify-center text-center opacity-10 grayscale"
                    >
                      <FileText className="w-16 h-16 mb-4 stroke-1" />
                      <div className="font-serif italic text-2xl">Awaiting Repository Input</div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Gradient Fade for Preview */}
                {!isProcessing && result && (
                  <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white to-transparent pointer-events-none"></div>
                )}
             </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="h-14 border-t border-[#1A1A1A] flex items-center justify-between px-12 font-sans text-[9px] uppercase tracking-[0.3em] font-black opacity-40 shrink-0">
        <div className="flex gap-8">
          <span>Session: {Math.random().toString(36).substring(7).toUpperCase()}</span>
          <span>Status: Deterministic</span>
        </div>
        <div className="flex gap-8">
          <span>2024 Design System</span>
          <span className="italic">Technical Documentation Redefined</span>
        </div>
      </footer>
    </div>
  );
}
