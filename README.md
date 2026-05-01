# RepoDoc | Repository-to-Documentation Generator

RepoDoc is a precision tool designed to transform complex, distributed repository knowledge into clean, structured, and AI-ready documentation. It bridges the gap between raw source code and human-readable (or machine-optimized) context.

## 🚀 Core Purpose

Maintaining documentation across large projects is difficult. RepoDoc scans your local or remote repositories, extracts documentation files, and consolidates them into a single, navigable source of truth. It's built for developers who need to:

- High-quality technical onboarding.
- Consolidate project knowledge for LLM context windows.
- Generate automatic summaries for large codebases.

## 🛠️ Feature Breakdown

### 1. Source Input

- **GitHub URL:** Connect directly to any public GitHub repository.
- **Local Folder:** Scan your machine locally without uploading code to a third-party server (browser-side processing).

### 2. Processing Pipeline

- **Discovery:** Recursively identifies documentation artifacts (`.md`, `.txt`, `.markdown`, `.adoc`).
- **AI Summarization:** Uses Google Gemini to generate concise summaries for every file found.
- **Commit History:** Pulls recent version logs to provide context on recent project movements.
- **Deterministic Indexing:** Creates a consistent Table of Contents with internal linking.

### 3. LLM-Optimized Mode

When enabled, the output wraps content in structured XML tags:

```xml
<context path="src/docs/setup.md">
  <summary>Brief overview of the setup instructions...</summary>
  <content>...full body content...</content>
</context>
```

This is specifically designed to maximize token efficiency and retrieval accuracy for AI assistants.

## 📤 Export Options

- **Markdown:** The standard for developer documentation. Features GFM support and internal linking.
- **HTML:** A polished "Editorial" theme view for browser-based reading.
- **JSON:** Machine-readable data structure containing files, metadata, and history.

---

## ⚙️ Configuration Guide

| Field                   | Description                                                                                |
| :---------------------- | :----------------------------------------------------------------------------------------- |
| **Consolidate History** | Includes author, date, and messages of recent commits at the end of the doc.               |
| **AI Summaries**        | Triggers the Gemini API to pre-read and explain sections before they appear.               |
| **Global Index**        | Injects a Table of Contents with jump-links to all identified sections.                    |
| **LLM Optimized**       | Switches formatting to a machine-parseable structure instead of standard markdown headers. |

---

## 🛠️ Technical Stack

- **Frontend:** React + Tailwind CSS (Editorial Theme).
- **Animations:** Motion (Framer Motion).
- **AI:** Google Generative AI (Gemini 1.5/2.0).
- **Tools:** Octokit (GitHub API), React-Markdown.
