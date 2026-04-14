# bernstein.run Next.js Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate bernstein.run from static HTML/nginx to Next.js 14 App Router with MDX blog engine, preserving all 98 SEO/AIO optimizations and the existing visual design.

**Architecture:** Next.js 14 standalone build in Docker (node:20-alpine), Caddy reverse proxy on VPS, MDX blog engine ported from homepage with i18n stripped. Landing page decomposed into React Server Components. All SEO files become dynamic route handlers that auto-include blog posts.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS 3, next-mdx-remote 5, gray-matter, rehype-pretty-code, Zod, Docker multi-stage build, Caddy reverse proxy.

---

## File Structure

```
bernstein_landing/
├── app/
│   ├── layout.tsx                    # Root layout: fonts, metadata, JSON-LD, analytics
│   ├── page.tsx                      # Landing page (all sections composed)
│   ├── not-found.tsx                 # Custom 404
│   ├── robots.ts                     # Dynamic robots.txt
│   ├── sitemap.ts                    # Dynamic sitemap with blog posts
│   ├── blog/
│   │   ├── page.tsx                  # Blog index
│   │   └── [slug]/
│   │       └── page.tsx              # Individual blog post
│   ├── llms.txt/route.ts             # Dynamic llms.txt
│   ├── llms-full.txt/route.ts        # Dynamic llms-full.txt
│   ├── ai.txt/route.ts               # Dynamic ai.txt
│   ├── humans.txt/route.ts           # Dynamic humans.txt
│   └── api/
│       └── og/route.tsx              # Dynamic OG image via Satori
├── components/
│   ├── landing/
│   │   ├── Nav.tsx
│   │   ├── Hero.tsx
│   │   ├── Stats.tsx
│   │   ├── HowItWorks.tsx
│   │   ├── EmailCapture.tsx
│   │   ├── AgentsGrid.tsx
│   │   ├── Features.tsx
│   │   ├── Compare.tsx
│   │   ├── FooterCTA.tsx
│   │   └── Footer.tsx
│   ├── blog/
│   │   ├── BlogCard.tsx
│   │   ├── Callout.tsx
│   │   ├── Figure.tsx
│   │   ├── Lead.tsx
│   │   ├── CodeBlock.tsx
│   │   ├── SmartLink.tsx
│   │   ├── InlineCode.tsx
│   │   ├── MdxH2.tsx
│   │   ├── MdxH3.tsx
│   │   └── TocSidebar.tsx
│   └── CopyButton.tsx
├── content/
│   └── blog/
│       └── community-spotlight-april-2026/
│           └── index.mdx
├── lib/
│   ├── mdx.ts                        # Blog engine (from homepage, no i18n)
│   ├── blog-headings.ts              # TOC extraction (verbatim from homepage)
│   ├── seo.ts                        # JSON-LD builders, OG helpers, llms.txt generator
│   └── fonts.ts                      # Inter + JetBrains Mono via next/font/google
├── styles/
│   └── globals.css                   # Tailwind directives + OKLCH custom properties + all component styles
├── public/
│   ├── favicon.svg                   # (existing)
│   ├── manifest.json                 # (existing)
│   ├── structured-data.json          # (existing)
│   └── .well-known/
│       ├── security.txt              # (existing)
│       └── ai-plugin.json            # (existing)
├── Dockerfile
├── docker-compose.yml
├── next.config.mjs
├── tailwind.config.ts
├── tsconfig.json
├── postcss.config.mjs
├── package.json
└── .github/workflows/deploy-vps.yml
```

---

### Task 1: Scaffold Next.js project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.mjs`
- Create: `tailwind.config.ts`
- Create: `postcss.config.mjs`
- Create: `.gitignore` (update existing)

- [ ] **Step 1: Create package.json**

```json
{
  "name": "bernstein-landing",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "^14.2.10",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "gray-matter": "^4.0.3",
    "next-mdx-remote": "^5.0.0",
    "reading-time": "^1.5.0",
    "rehype-pretty-code": "^0.14.3",
    "remark-gfm": "^4.0.1",
    "shiki": "^4.0.2",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.4",
    "typescript": "^5.5.2"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create next.config.mjs**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://app.kit.com; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self' https://app.kit.com;",
          },
          {
            key: 'X-Robots-Tag',
            value: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
```

- [ ] **Step 4: Create tailwind.config.ts**

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)'],
        mono: ['var(--font-jetbrains)'],
      },
      maxWidth: {
        content: '1080px',
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 5: Create postcss.config.mjs**

```js
/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;
```

- [ ] **Step 6: Update .gitignore**

Append to existing `.gitignore`:
```
node_modules/
.next/
out/
*.tsbuildinfo
next-env.d.ts
```

- [ ] **Step 7: Install dependencies**

Run: `cd /Users/sasha/IdeaProjects/personal_projects/bernstein_landing && npm install`
Expected: `node_modules/` created, `package-lock.json` generated.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.mjs tailwind.config.ts postcss.config.mjs .gitignore
git commit -m "chore: scaffold Next.js 14 project with Tailwind"
```

---

### Task 2: Fonts, globals.css, and root layout

**Files:**
- Create: `lib/fonts.ts`
- Create: `styles/globals.css`
- Create: `app/layout.tsx`

- [ ] **Step 1: Create lib/fonts.ts**

```ts
import { Inter, JetBrains_Mono } from 'next/font/google';

export const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});
```

- [ ] **Step 2: Create styles/globals.css**

Copy the entire `<style>` block from the current `index.html` (lines 30–651) into this file, prepended with Tailwind directives. The CSS custom properties and all component styles are preserved verbatim.

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg: oklch(0.19 0.01 255);
  --surface: oklch(0.22 0.008 255);
  --surface-hover: oklch(0.24 0.008 255);
  --border: oklch(0.32 0.008 255);
  --border-subtle: oklch(0.28 0.006 255);
  --text: oklch(0.95 0.006 100);
  --text-secondary: oklch(0.75 0.01 255);
  --text-muted: oklch(0.58 0.01 255);
  --accent: oklch(0.55 0.028 252);
  --accent-hover: oklch(0.62 0.032 252);
  --accent-subtle: oklch(0.25 0.02 252);
  --green: oklch(0.65 0.15 145);
  --red: oklch(0.55 0.15 25);
  --code-bg: oklch(0.20 0.012 260);

  --font-body: var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  --font-mono: var(--font-jetbrains), 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;

  --shadow-xs: 0 1px 2px oklch(0 0 0 / 0.2);
  --shadow-sm: 0 2px 4px oklch(0 0 0 / 0.15), 0 1px 2px oklch(0 0 0 / 0.1);
  --shadow-md: 0 4px 12px -2px oklch(0 0 0 / 0.2), 0 2px 4px oklch(0 0 0 / 0.1);
  --shadow-lg: 0 8px 24px -4px oklch(0 0 0 / 0.25), 0 4px 8px oklch(0 0 0 / 0.1);
  --shadow-xl: 0 16px 48px -8px oklch(0 0 0 / 0.3);

  --radius: 8px;
  --radius-lg: 12px;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 40px;
  --space-8: 48px;
  --space-9: 64px;
  --space-10: 80px;
  --space-11: 96px;
  --space-12: 128px;
}

/* Then paste ALL remaining CSS from index.html lines 72-651 verbatim:
   *, *::before, *::after { box-sizing ... }
   through
   @supports (padding: env(safe-area-inset-bottom)) { ... }
*/
```

The full CSS is 620 lines. Copy it exactly — font-family references change from quoted strings to `var(--font-inter)` etc. which are already in the `:root` block above.

- [ ] **Step 3: Add blog article styles to globals.css**

Append after the existing landing styles:

```css
/* ---- BLOG ---- */
.blog-index {
  max-width: 720px;
  margin: 0 auto;
  padding: 120px var(--space-5) var(--space-11);
}

.blog-index h1 {
  font-size: clamp(1.5rem, 3vw, 2rem);
  font-weight: 700;
  letter-spacing: -0.03em;
  margin-bottom: var(--space-2);
}

.blog-index > p {
  color: var(--text-muted);
  font-size: 15px;
  margin-bottom: var(--space-8);
}

.blog-card {
  display: block;
  padding: var(--space-5) 0;
  border-bottom: 1px solid var(--border-subtle);
  transition: opacity 0.15s ease-out;
}
.blog-card:hover { opacity: 0.8; }

.blog-card-date {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: var(--space-1);
}

.blog-card h2 {
  font-size: 1.125rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  margin-bottom: var(--space-1);
  color: var(--text);
}

.blog-card p {
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.blog-card-meta {
  display: flex;
  gap: var(--space-3);
  margin-top: var(--space-2);
  font-size: 12px;
  color: var(--text-muted);
}

/* ---- BLOG POST ---- */
.blog-post {
  max-width: 720px;
  margin: 0 auto;
  padding: 120px var(--space-5) var(--space-11);
}

.blog-post-header {
  margin-bottom: var(--space-8);
}

.blog-post-header h1 {
  font-size: clamp(1.5rem, 3.5vw, 2.25rem);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.2;
  margin-bottom: var(--space-3);
}

.blog-post-meta {
  display: flex;
  gap: var(--space-4);
  font-size: 14px;
  color: var(--text-muted);
}

.blog-post-meta time {
  font-family: var(--font-mono);
  font-size: 13px;
}

/* Article prose */
.prose {
  color: var(--text-secondary);
  font-size: 16px;
  line-height: 1.75;
}

.prose h2 {
  font-size: 1.375rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--text);
  margin-top: var(--space-9);
  margin-bottom: var(--space-4);
  scroll-margin-top: 80px;
}

.prose h3 {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text);
  margin-top: var(--space-7);
  margin-bottom: var(--space-3);
  scroll-margin-top: 80px;
}

.prose p {
  margin-bottom: var(--space-5);
}

.prose a {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.prose a:hover { color: var(--accent-hover); }

.prose ul, .prose ol {
  margin-bottom: var(--space-5);
  padding-left: var(--space-5);
}

.prose li {
  margin-bottom: var(--space-2);
}

.prose code {
  font-family: var(--font-mono);
  font-size: 0.875em;
  background: var(--code-bg);
  padding: 2px 6px;
  border-radius: 4px;
}

.prose pre {
  margin-bottom: var(--space-5);
  background: var(--code-bg);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  padding: var(--space-4);
  overflow-x: auto;
  font-size: 14px;
}

.prose pre code {
  background: none;
  padding: 0;
  border-radius: 0;
}

.prose blockquote {
  border-left: 3px solid var(--accent);
  padding-left: var(--space-4);
  color: var(--text-muted);
  margin-bottom: var(--space-5);
}

.prose img {
  max-width: 100%;
  height: auto;
  border-radius: var(--radius);
  margin-bottom: var(--space-5);
}

.prose hr {
  border: none;
  border-top: 1px solid var(--border-subtle);
  margin: var(--space-8) 0;
}

/* Callout MDX component */
.callout {
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius);
  padding: var(--space-4) var(--space-5);
  margin-bottom: var(--space-5);
}

.callout-title {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: var(--space-2);
  color: var(--text);
}

/* Lead MDX component */
.lead {
  font-size: 1.125rem;
  color: var(--text);
  line-height: 1.65;
  margin-bottom: var(--space-6);
}

/* Back link */
.blog-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: var(--text-muted);
  margin-bottom: var(--space-6);
}
.blog-back:hover { color: var(--text-secondary); }
```

- [ ] **Step 4: Create app/layout.tsx**

```tsx
import type { Metadata } from 'next';
import { inter, jetbrainsMono } from '@/lib/fonts';
import '@/styles/globals.css';

const SITE_URL = 'https://bernstein.run';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Bernstein — Multi-Agent Orchestration for CLI Coding Agents',
    template: '%s | Bernstein',
  },
  description:
    'Open-source orchestrator for parallel AI coding agents. Run Claude Code, Codex, Gemini CLI simultaneously with deterministic scheduling, quality gates, and cost tracking.',
  keywords: [
    'multi-agent orchestration',
    'AI coding agents',
    'Claude Code orchestrator',
    'parallel AI agents',
    'deterministic scheduling',
  ],
  authors: [{ name: 'Alex Chernysh', url: 'https://alexchernysh.com' }],
  creator: 'Alex Chernysh',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    siteName: 'Bernstein',
    title: 'Bernstein — Multi-Agent Orchestration for CLI Coding Agents',
    description:
      'Run multiple AI coding agents in parallel on your codebase. Deterministic scheduling. Quality gates. Any model. One command.',
    images: [{ url: '/api/og', width: 1200, height: 630, alt: 'Bernstein' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Bernstein — Multi-Agent Orchestration for CLI Coding Agents',
    description:
      'Run multiple AI coding agents in parallel on your codebase. Deterministic scheduling. Quality gates. Any model. One command.',
    images: ['/api/og'],
  },
  icons: { icon: '/favicon.svg' },
  manifest: '/manifest.json',
  alternates: { canonical: SITE_URL },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 5: Verify dev server starts**

Run: `cd /Users/sasha/IdeaProjects/personal_projects/bernstein_landing && npm run dev`
Expected: Server starts on `http://localhost:3000` (will show 404 since page.tsx doesn't exist yet — that's fine).

- [ ] **Step 6: Commit**

```bash
git add lib/fonts.ts styles/globals.css app/layout.tsx
git commit -m "feat: root layout with fonts, OKLCH design tokens, and global styles"
```

---

### Task 3: Landing page components

**Files:**
- Create: `components/CopyButton.tsx`
- Create: `components/landing/Nav.tsx`
- Create: `components/landing/Hero.tsx`
- Create: `components/landing/Stats.tsx`
- Create: `components/landing/HowItWorks.tsx`
- Create: `components/landing/EmailCapture.tsx`
- Create: `components/landing/AgentsGrid.tsx`
- Create: `components/landing/Features.tsx`
- Create: `components/landing/Compare.tsx`
- Create: `components/landing/FooterCTA.tsx`
- Create: `components/landing/Footer.tsx`
- Create: `app/page.tsx`

Each component is a direct React port of the corresponding HTML section from `index.html`. All use the CSS classes already defined in `globals.css`. Components are React Server Components by default (no `'use client'` unless they need interactivity).

- [ ] **Step 1: Create components/CopyButton.tsx** (client component — needs onClick)

```tsx
'use client';

import { useState } from 'react';

export function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      className={`copy-btn ${copied ? 'copied' : ''} ${className ?? ''}`}
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}
```

- [ ] **Step 2: Create components/landing/Nav.tsx**

```tsx
const GITHUB_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

export function Nav() {
  return (
    <header>
      <div className="nav-inner">
        <a href="/" className="nav-logo">
          bernstein<span>.run</span>
        </a>
        <nav className="nav-links">
          <a href="/#how">How it works</a>
          <a href="/#agents">Agents</a>
          <a href="/#features">Features</a>
          <a href="/#compare">Compare</a>
          <a href="/blog">Blog</a>
          <a href="https://github.com/chernistry/bernstein" className="nav-github">
            {GITHUB_ICON}
            GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}
```

Note: Added `/blog` link to nav. All section links prefixed with `/#` so they work from the blog pages too.

- [ ] **Step 3: Create components/landing/Hero.tsx**

```tsx
import { CopyButton } from '@/components/CopyButton';

const GITHUB_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

export function Hero() {
  return (
    <div className="hero">
      <h1>Orchestrate parallel AI&nbsp;agents on your codebase</h1>
      <p className="hero-sub">
        Run Claude Code, Codex, and Gemini CLI simultaneously. Deterministic scheduling, quality
        gates, cost tracking. You come back to working code.
      </p>
      <div className="hero-actions">
        <a href="https://github.com/chernistry/bernstein" className="btn btn-primary">
          {GITHUB_ICON}
          View on GitHub
        </a>
        <a href="https://bernstein.readthedocs.io/" className="btn btn-secondary">
          Documentation
        </a>
      </div>
      <div className="install-block">
        <div className="install-code">
          <span className="prompt">$</span> <span className="cmd">pipx install bernstein</span>
        </div>
        <CopyButton text="pipx install bernstein" />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create components/landing/Stats.tsx**

```tsx
const STATS = [
  { num: '110+', label: 'GitHub stars' },
  { num: '7.7k', label: 'Monthly downloads' },
  { num: '29', label: 'Agent adapters' },
  { num: '2,600+', label: 'Tests passing' },
];

export function Stats() {
  return (
    <div className="stats">
      {STATS.map((s) => (
        <div key={s.label} className="stat">
          <div className="stat-num">{s.num}</div>
          <div className="stat-label">{s.label}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Create components/landing/HowItWorks.tsx**

```tsx
const STEPS = [
  {
    num: '01',
    title: 'Set a goal',
    desc: 'Describe what you want built. Bernstein decomposes it into tasks with the right roles, models, and dependencies.',
  },
  {
    num: '02',
    title: 'Agents work in parallel',
    desc: 'Each agent gets its own git worktree. Opus for architecture, Sonnet for implementation, Haiku for tests. Automatically routed.',
  },
  {
    num: '03',
    title: 'Verified and merged',
    desc: "Quality gates run lint, types, and tests on every result. Only verified work gets merged. Failed tasks retry with escalated models.",
  },
];

export function HowItWorks() {
  return (
    <section id="how">
      <div className="section-header">
        <h2>How it works</h2>
        <p>Three steps. No babysitting.</p>
      </div>
      <div className="steps">
        {STEPS.map((step) => (
          <div key={step.num} className="step">
            <div className="step-num">{step.num}</div>
            <h3>{step.title}</h3>
            <p>{step.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Create components/landing/EmailCapture.tsx** (client component)

```tsx
'use client';

import { useState, type FormEvent } from 'react';

export function EmailCapture() {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const email = new FormData(form).get('email_address') as string;
    setStatus('submitting');
    fetch('https://app.kit.com/forms/9325480/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `email_address=${encodeURIComponent(email)}`,
      mode: 'no-cors',
    })
      .then(() => setStatus('success'))
      .catch(() => setStatus('error'));
  }

  return (
    <div className="email-section">
      <div className="email-inner">
        <p className="email-kicker">Something new is coming</p>
        <h2>Be the first to know</h2>
        <p>
          We&apos;re building hosted orchestration and a cloud runtime. Early subscribers get first
          access, architecture deep-dives, and a voice in what ships next.
        </p>
        <form className="email-form" onSubmit={handleSubmit}>
          <input
            type="email"
            name="email_address"
            placeholder="you@company.com"
            required
            aria-label="Email address"
            disabled={status === 'success'}
          />
          <button
            type="submit"
            disabled={status === 'submitting' || status === 'success'}
            style={status === 'success' ? { background: '#16a34a' } : undefined}
          >
            {status === 'submitting'
              ? 'Submitting\u2026'
              : status === 'success'
                ? "You're in \u2713"
                : 'Get early access'}
          </button>
        </form>
        <p className="email-note">
          {status === 'success'
            ? 'Check your inbox to confirm.'
            : status === 'error'
              ? 'Something went wrong. Try again.'
              : 'No spam. Unsubscribe anytime.'}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Create components/landing/AgentsGrid.tsx**

```tsx
const AGENTS = [
  { name: 'Claude Code', models: 'Opus, Sonnet, Haiku' },
  { name: 'Codex CLI', models: 'GPT-5.4, GPT-5.4-mini' },
  { name: 'Gemini CLI', models: 'Gemini 3.1 Pro, 3 Flash' },
  { name: 'Cursor', models: 'Any model via Cursor' },
  { name: 'Aider', models: 'Any OpenAI/Anthropic' },
  { name: 'Ollama', models: 'Local, fully offline' },
  { name: 'Amp', models: 'Sourcegraph Amp' },
  { name: 'Goose', models: 'Block Goose CLI' },
  { name: 'Roo Code', models: 'VS Code extension CLI' },
  { name: 'Kiro', models: 'AWS Kiro CLI' },
  { name: 'Qwen', models: 'Alibaba Qwen Agent' },
  { name: '+18 more', models: 'Generic CLI adapter' },
];

export function AgentsGrid() {
  return (
    <section id="agents">
      <div className="section-header">
        <h2>Works with every major coding agent</h2>
        <p>Mix local models for boilerplate with cloud models for architecture. In the same run.</p>
      </div>
      <div className="agents-grid">
        {AGENTS.map((agent) => (
          <div key={agent.name} className="agent-card">
            <div>
              <div className="agent-name">{agent.name}</div>
              <div className="agent-models">{agent.models}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 8: Create components/landing/Features.tsx**

Port the 6 feature cards from index.html lines 853-901. Each feature has an inline SVG icon, title, and description. The SVGs are copied verbatim.

```tsx
const FEATURES = [
  {
    icon: <svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>,
    title: 'Deterministic scheduling',
    desc: 'The orchestrator is pure Python. Zero LLM tokens on coordination. Predictable, debuggable, fast.',
  },
  {
    icon: <svg viewBox="0 0 24 24"><path d="M16 18l6-6-6-6"/><path d="M8 6l-6 6 6 6"/></svg>,
    title: '29 agent adapters',
    desc: 'Claude Code, Codex, Gemini CLI, Aider, and 25 more. Mix models in one run. Switch providers without changing config.',
  },
  {
    icon: <svg viewBox="0 0 24 24"><path d="M9 12l2 2 4-4"/><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>,
    title: 'Quality gates',
    desc: 'Lint, type check, tests, security scan, architecture conformance. All run before merge. Failed work retries automatically.',
  },
  {
    icon: <svg viewBox="0 0 24 24"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
    title: 'Cost-aware routing',
    desc: 'Epsilon-greedy bandit learns which model works best per task type. Typical savings of 50-60% vs uniform model selection.',
  },
  {
    icon: <svg viewBox="0 0 24 24"><path d="M6 3v12"/><path d="M18 9a3 3 0 100-6 3 3 0 000 6z"/><path d="M6 21a3 3 0 100-6 3 3 0 000 6z"/><path d="M18 9c-3 0-6 1-6 5v1"/></svg>,
    title: 'Git worktree isolation',
    desc: 'Each agent works in its own worktree. No merge conflicts between agents. Clean, linear commit history.',
  },
  {
    icon: <svg viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M18 9l-5 5-2-2-4 4"/></svg>,
    title: 'Full observability',
    desc: 'Per-agent cost tracking, token monitoring, quality trends, Prometheus metrics. Know what happened and what it cost.',
  },
];

export function Features() {
  return (
    <section id="features">
      <div className="section-header">
        <h2>Built for production use</h2>
        <p>Not a demo. A system you can run unsupervised.</p>
      </div>
      <div className="features-grid">
        {FEATURES.map((f) => (
          <div key={f.title} className="feature">
            <div className="feature-icon">{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 9: Create components/landing/Compare.tsx**

Port the comparison table from index.html lines 904-965 verbatim.

```tsx
type Cell = { text: string; className?: string };
type Row = [string, ...Cell[]];

const HEADERS = ['', 'Bernstein', 'CrewAI', 'AutoGen', 'LangGraph'];

const ROWS: Row[] = [
  ['Orchestrator', { text: 'Deterministic code' }, { text: 'LLM-driven', className: 'partial' }, { text: 'LLM-driven', className: 'partial' }, { text: 'Graph + LLM', className: 'partial' }],
  ['CLI agent support', { text: '29 adapters', className: 'check' }, { text: 'No', className: 'cross' }, { text: 'No', className: 'cross' }, { text: 'No', className: 'cross' }],
  ['Git isolation', { text: 'Worktrees', className: 'check' }, { text: 'No', className: 'cross' }, { text: 'No', className: 'cross' }, { text: 'No', className: 'cross' }],
  ['Quality gates', { text: 'Built-in', className: 'check' }, { text: 'No', className: 'cross' }, { text: 'No', className: 'cross' }, { text: 'Partial', className: 'partial' }],
  ['Cost tracking', { text: 'Per-agent', className: 'check' }, { text: 'No', className: 'cross' }, { text: 'No', className: 'cross' }, { text: 'No', className: 'cross' }],
  ['Self-evolution', { text: 'Built-in', className: 'check' }, { text: 'No', className: 'cross' }, { text: 'No', className: 'cross' }, { text: 'No', className: 'cross' }],
];

export function Compare() {
  return (
    <section id="compare">
      <div className="section-header">
        <h2>How it compares</h2>
        <p>Different category, different architecture.</p>
      </div>
      <div className="table-wrap">
        <table className="compare-table">
          <thead>
            <tr>
              {HEADERS.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row[0] as string}>
                <td>{row[0] as string}</td>
                {(row.slice(1) as Cell[]).map((cell, i) => (
                  <td key={i}>
                    {cell.className ? (
                      <span className={cell.className}>{cell.text}</span>
                    ) : (
                      cell.text
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 10: Create components/landing/FooterCTA.tsx**

```tsx
import { CopyButton } from '@/components/CopyButton';

const GITHUB_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

export function FooterCTA() {
  return (
    <div className="cta-section">
      <h2>Start orchestrating</h2>
      <p>Install, set a goal, walk away.</p>
      <div className="install-block">
        <div className="install-code">
          <span className="prompt">$</span>{' '}
          <span className="cmd">pipx install bernstein && bernstein -g &quot;your goal&quot;</span>
        </div>
        <CopyButton text='pipx install bernstein && bernstein -g "your goal"' />
      </div>
      <a href="https://github.com/chernistry/bernstein" className="btn btn-primary">
        {GITHUB_ICON}
        View on GitHub
      </a>
    </div>
  );
}
```

- [ ] **Step 11: Create components/landing/Footer.tsx**

```tsx
export function Footer() {
  return (
    <footer>
      <p>
        Made by <a href="https://alexchernysh.com">Alex Chernysh</a> &middot;{' '}
        <a href="https://github.com/chernistry/bernstein">GitHub</a> &middot;{' '}
        <a href="https://pypi.org/project/bernstein/">PyPI</a> &middot; Apache 2.0
      </p>
    </footer>
  );
}
```

- [ ] **Step 12: Create app/page.tsx**

```tsx
import { Nav } from '@/components/landing/Nav';
import { Hero } from '@/components/landing/Hero';
import { Stats } from '@/components/landing/Stats';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { EmailCapture } from '@/components/landing/EmailCapture';
import { AgentsGrid } from '@/components/landing/AgentsGrid';
import { Features } from '@/components/landing/Features';
import { Compare } from '@/components/landing/Compare';
import { FooterCTA } from '@/components/landing/FooterCTA';
import { Footer } from '@/components/landing/Footer';

export default function LandingPage() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Stats />
        <HowItWorks />
        <EmailCapture />
        <AgentsGrid />
        <Features />
        <Compare />
      </main>
      <FooterCTA />
      <Footer />
    </>
  );
}
```

- [ ] **Step 13: Add JSON-LD scripts to app/page.tsx**

Import the JSON-LD data from `lib/seo.ts` (created in Task 5) and render as `<script type="application/ld+json">` tags. For now, hardcode inline — will be extracted in Task 5.

Add before the return in `LandingPage`:
```tsx
const jsonLd = { /* SoftwareApplication schema — copy from current index.html lines 1004-1031 */ };
const faqJsonLd = { /* FAQPage schema — copy from current index.html lines 1033-1079 */ };
const orgJsonLd = { /* Organization schema — copy from current index.html lines 1081-1092 */ };
```

Add inside the `<>` fragment after `<Footer />`:
```tsx
<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }} />
```

- [ ] **Step 14: Verify landing page renders correctly**

Run: `npm run dev`
Open: `http://localhost:3000`
Expected: Landing page renders with all sections, same visual appearance as current site. Test: nav links, copy buttons, email form, responsive behavior (resize browser).

- [ ] **Step 15: Commit**

```bash
git add components/ app/page.tsx
git commit -m "feat: port landing page to React components"
```

---

### Task 4: Blog engine

**Files:**
- Create: `lib/mdx.ts`
- Create: `lib/blog-headings.ts`
- Create: `components/blog/Callout.tsx`
- Create: `components/blog/Lead.tsx`
- Create: `components/blog/Figure.tsx`
- Create: `components/blog/SmartLink.tsx`
- Create: `components/blog/InlineCode.tsx`
- Create: `components/blog/CodeBlock.tsx`
- Create: `components/blog/MdxH2.tsx`
- Create: `components/blog/MdxH3.tsx`
- Create: `components/blog/BlogCard.tsx`
- Create: `components/blog/TocSidebar.tsx`

- [ ] **Step 1: Create lib/blog-headings.ts**

Copy verbatim from homepage at `/Users/sasha/IdeaProjects/personal_core_services/homepage/lib/blog-headings.ts`. No changes needed — it has zero dependencies on the homepage project.

- [ ] **Step 2: Create lib/mdx.ts**

Simplified from homepage — no i18n, no research sections, no locale resolution:

```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { z } from 'zod';
import readingTime from 'reading-time';
import { compileMDX } from 'next-mdx-remote/rsc';
import { extractTableOfContents, type TableOfContentsItem } from '@/lib/blog-headings';

export const BLOG_DIR = path.resolve(process.cwd(), 'content', 'blog');

export const Frontmatter = z.object({
  title: z.string().min(3),
  description: z.string().min(3),
  date: z.union([z.string(), z.date()]).transform((v) =>
    v instanceof Date ? v.toISOString().split('T')[0] : v,
  ),
  tags: z.array(z.string()).optional(),
  draft: z.boolean().optional(),
  hero: z.string().optional(),
});
export type FrontmatterT = z.infer<typeof Frontmatter>;

export type PostIndex = {
  slug: string;
  fm: FrontmatterT;
  readingMinutes: number;
};

export type PostResult = {
  mdx: React.ReactNode;
  fm: FrontmatterT;
  readingMinutes: number;
  tableOfContents: TableOfContentsItem[];
};

// Import MDX components lazily to keep this file focused
import { Callout } from '@/components/blog/Callout';
import { Lead } from '@/components/blog/Lead';
import { Figure } from '@/components/blog/Figure';
import { SmartLink } from '@/components/blog/SmartLink';
import { InlineCode } from '@/components/blog/InlineCode';
import { CodeBlock } from '@/components/blog/CodeBlock';
import { MdxH2 } from '@/components/blog/MdxH2';
import { MdxH3 } from '@/components/blog/MdxH3';

const mdxComponents = {
  Callout,
  Lead,
  Figure,
  a: SmartLink,
  code: InlineCode,
  h2: MdxH2,
  h3: MdxH3,
  pre: CodeBlock,
};

async function listDirs(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

export async function getAllPosts(): Promise<PostIndex[]> {
  const slugs = await listDirs(BLOG_DIR);
  const posts: PostIndex[] = [];
  for (const slug of slugs) {
    const raw = await fs.readFile(path.join(BLOG_DIR, slug, 'index.mdx'), 'utf8');
    const { data, content } = matter(raw);
    const fm = Frontmatter.parse(data);
    if (fm.draft) continue;
    posts.push({ slug, fm, readingMinutes: Math.max(1, Math.ceil(readingTime(content).minutes)) });
  }
  return posts.sort((a, b) => (a.fm.date < b.fm.date ? 1 : -1));
}

export async function getPost(slug: string): Promise<PostResult | null> {
  try {
    const raw = await fs.readFile(path.join(BLOG_DIR, slug, 'index.mdx'), 'utf8');
    const { data, content } = matter(raw);
    const fm = Frontmatter.parse(data);
    if (fm.draft) return null;

    const [remarkGfm, rehypePrettyCode] = await Promise.all([
      import('remark-gfm').then((m) => m.default),
      import('rehype-pretty-code').then((m) => m.default),
    ]);

    const { content: mdx } = await compileMDX({
      source: content,
      components: mdxComponents,
      options: {
        mdxOptions: {
          remarkPlugins: [remarkGfm],
          rehypePlugins: [
            [rehypePrettyCode, {
              theme: { dark: 'github-dark', light: 'github-light' },
              keepBackground: false,
              defaultLang: 'plaintext',
            }],
          ],
        },
      },
    });

    return {
      mdx,
      fm,
      readingMinutes: Math.max(1, Math.ceil(readingTime(content).minutes)),
      tableOfContents: extractTableOfContents(content),
    };
  } catch (error) {
    console.error(`Error getting post ${slug}:`, error);
    return null;
  }
}

export async function getSlugs(): Promise<string[]> {
  return listDirs(BLOG_DIR);
}
```

- [ ] **Step 3: Create MDX components**

Each component is minimal. Create these files:

**components/blog/Callout.tsx:**
```tsx
export function Callout({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="callout">
      {title && <div className="callout-title">{title}</div>}
      {children}
    </div>
  );
}
```

**components/blog/Lead.tsx:**
```tsx
export function Lead({ children }: { children: React.ReactNode }) {
  return <p className="lead">{children}</p>;
}
```

**components/blog/Figure.tsx:**
```tsx
export function Figure({ src, alt, caption }: { src: string; alt: string; caption?: string }) {
  return (
    <figure style={{ marginBottom: 'var(--space-5)' }}>
      <img src={src} alt={alt} style={{ maxWidth: '100%', borderRadius: 'var(--radius)' }} />
      {caption && (
        <figcaption style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: 'var(--space-2)', textAlign: 'center' }}>
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
```

**components/blog/SmartLink.tsx:**
```tsx
export function SmartLink(props: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const isExternal = props.href?.startsWith('http');
  return (
    <a {...props} {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})} />
  );
}
```

**components/blog/InlineCode.tsx:**
```tsx
export function InlineCode(props: React.HTMLAttributes<HTMLElement>) {
  return <code {...props} />;
}
```

**components/blog/CodeBlock.tsx:**
```tsx
export function CodeBlock(props: React.HTMLAttributes<HTMLPreElement>) {
  return <pre {...props} />;
}
```

**components/blog/MdxH2.tsx:**
```tsx
import { slugifyHeading } from '@/lib/blog-headings';

export function MdxH2({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  const text = typeof children === 'string' ? children : '';
  const id = slugifyHeading(text);
  return <h2 id={id} {...props}>{children}</h2>;
}
```

**components/blog/MdxH3.tsx:**
```tsx
import { slugifyHeading } from '@/lib/blog-headings';

export function MdxH3({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  const text = typeof children === 'string' ? children : '';
  const id = slugifyHeading(text);
  return <h3 id={id} {...props}>{children}</h3>;
}
```

**components/blog/BlogCard.tsx:**
```tsx
import type { PostIndex } from '@/lib/mdx';

export function BlogCard({ post }: { post: PostIndex }) {
  return (
    <a href={`/blog/${post.slug}`} className="blog-card">
      <div className="blog-card-date">{post.fm.date}</div>
      <h2>{post.fm.title}</h2>
      <p>{post.fm.description}</p>
      <div className="blog-card-meta">
        <span>{post.readingMinutes} min read</span>
        {post.fm.tags && <span>{post.fm.tags.slice(0, 3).join(', ')}</span>}
      </div>
    </a>
  );
}
```

**components/blog/TocSidebar.tsx:**
```tsx
import type { TableOfContentsItem } from '@/lib/blog-headings';

export function TocSidebar({ items }: { items: TableOfContentsItem[] }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Table of contents" style={{ position: 'sticky', top: '80px', fontSize: '13px' }}>
      <div style={{ color: 'var(--text-muted)', fontWeight: 600, marginBottom: 'var(--space-3)', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '11px' }}>
        On this page
      </div>
      <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {items.map((item) => (
          <li key={item.slug} style={{ paddingLeft: item.level === 3 ? 'var(--space-4)' : 0 }}>
            <a href={`#${item.slug}`} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/mdx.ts lib/blog-headings.ts components/blog/
git commit -m "feat: blog engine with MDX pipeline and components"
```

---

### Task 5: Blog pages and SEO routes

**Files:**
- Create: `app/blog/page.tsx`
- Create: `app/blog/[slug]/page.tsx`
- Create: `app/not-found.tsx`
- Create: `lib/seo.ts`
- Create: `app/robots.ts`
- Create: `app/sitemap.ts`
- Create: `app/llms.txt/route.ts`
- Create: `app/llms-full.txt/route.ts`
- Create: `app/ai.txt/route.ts`
- Create: `app/humans.txt/route.ts`
- Create: `content/blog/community-spotlight-april-2026/index.mdx`

- [ ] **Step 1: Create lib/seo.ts**

```ts
import { getAllPosts, type PostIndex, type FrontmatterT } from '@/lib/mdx';

export const SITE_URL = 'https://bernstein.run';
export const SITE_NAME = 'Bernstein';
export const AUTHOR = 'Alex Chernysh';

export function buildBlogPostJsonLd(slug: string, fm: FrontmatterT, readingMinutes: number) {
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: fm.title,
    description: fm.description,
    datePublished: fm.date,
    author: { '@type': 'Person', name: AUTHOR, url: 'https://alexchernysh.com' },
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    url: `${SITE_URL}/blog/${slug}`,
    timeRequired: `PT${readingMinutes}M`,
    ...(fm.tags ? { keywords: fm.tags.join(', ') } : {}),
  };
}

export function buildBlogIndexJsonLd(posts: PostIndex[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: `${SITE_NAME} Blog`,
    url: `${SITE_URL}/blog`,
    author: { '@type': 'Person', name: AUTHOR, url: 'https://alexchernysh.com' },
    blogPost: posts.map((p) => ({
      '@type': 'BlogPosting',
      headline: p.fm.title,
      description: p.fm.description,
      datePublished: p.fm.date,
      url: `${SITE_URL}/blog/${p.slug}`,
    })),
  };
}

export async function buildLlmsTxt(): Promise<string> {
  const posts = await getAllPosts();
  const postList = posts
    .map((p) => `- [${p.fm.title}](${SITE_URL}/blog/${p.slug}) — ${p.fm.description}`)
    .join('\n');

  return `# Bernstein

> Orchestrate any AI coding agent. Any model. One command.

Bernstein is an open-source multi-agent orchestration system for AI coding agents. It takes a goal, decomposes it into tasks, assigns them to AI coding agents running in parallel, verifies output via quality gates, and merges results.

## Key Facts

- **Type**: Multi-agent orchestrator for CLI coding agents
- **License**: Apache 2.0
- **Language**: Python 3.12+
- **Install**: \`pipx install bernstein\`
- **Author**: ${AUTHOR}
- **Website**: ${SITE_URL}
- **GitHub**: https://github.com/chernistry/bernstein
- **PyPI**: https://pypi.org/project/bernstein/
- **Documentation**: https://bernstein.readthedocs.io/

## What It Does

1. Takes a goal in plain English
2. Decomposes it into tasks with roles, priorities, and dependencies
3. Spawns AI coding agents in isolated git worktrees
4. Routes tasks to the right model (Opus for architecture, Sonnet for implementation, Haiku for tests)
5. Runs quality gates (lint, type check, tests, security scan) on every result
6. Merges verified work, retries failures with escalated models

## Supported Agents (29 adapters)

Claude Code, Codex CLI, Gemini CLI, Cursor, Aider, Amp, Roo Code, Kiro, Qwen, Goose, Ollama, Cody, Continue, OpenCode, Tabby, Kilo, IaC, and more via a generic CLI adapter.

${posts.length > 0 ? `## Blog Posts\n\n${postList}` : ''}

## Links

- Documentation: https://bernstein.readthedocs.io/
- GitHub Issues: https://github.com/chernistry/bernstein/issues
- PyPI: https://pypi.org/project/bernstein/
`;
}
```

- [ ] **Step 2: Create app/robots.ts**

```ts
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
      },
      ...[
        'GPTBot', 'ChatGPT-User', 'Claude-Web', 'Anthropic-ai', 'PerplexityBot',
        'Google-Extended', 'Googlebot', 'Bingbot', 'Applebot', 'FacebookExternalHit',
        'LinkedInBot', 'Twitterbot', 'Slackbot', 'Discordbot',
      ].map((bot) => ({ userAgent: bot, allow: '/' as const })),
    ],
    sitemap: 'https://bernstein.run/sitemap.xml',
  };
}
```

- [ ] **Step 3: Create app/sitemap.ts**

```ts
import type { MetadataRoute } from 'next';
import { getAllPosts } from '@/lib/mdx';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getAllPosts();
  const blogEntries = posts.map((post) => ({
    url: `https://bernstein.run/blog/${post.slug}`,
    lastModified: new Date(post.fm.date),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  return [
    { url: 'https://bernstein.run', lastModified: new Date(), changeFrequency: 'weekly', priority: 1.0 },
    { url: 'https://bernstein.run/blog', lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    ...blogEntries,
  ];
}
```

- [ ] **Step 4: Create dynamic text route handlers**

**app/llms.txt/route.ts:**
```ts
import { buildLlmsTxt } from '@/lib/seo';

export async function GET() {
  const content = await buildLlmsTxt();
  return new Response(content, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' },
  });
}
```

**app/llms-full.txt/route.ts:**
Copy the full content of the current `llms-full.txt` (567 lines) as a template string. Append a dynamic blog section using `getAllPosts()`. Same pattern as above.

**app/ai.txt/route.ts:**
Copy the current `ai.txt` content as a template string. Same response pattern.

**app/humans.txt/route.ts:**
```ts
export function GET() {
  return new Response(
    `/* TEAM */\nAuthor: Alex Chernysh\nSite: https://alexchernysh.com\nGitHub: https://github.com/chernistry\n\n/* SITE */\nFramework: Next.js 14\nLanguage: TypeScript\nCSS: Tailwind CSS + OKLCH\nHosting: OVH VPS + Caddy\nDomain: bernstein.run\n`,
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
}
```

- [ ] **Step 5: Create app/not-found.tsx**

```tsx
import { Nav } from '@/components/landing/Nav';
import { Footer } from '@/components/landing/Footer';

export default function NotFound() {
  return (
    <>
      <Nav />
      <div style={{ maxWidth: '500px', margin: '0 auto', padding: '160px 24px 96px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '4rem', fontWeight: 700, letterSpacing: '-0.04em', marginBottom: '16px' }}>404</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '15px', marginBottom: '32px' }}>
          This page doesn&apos;t exist. The orchestrator can&apos;t route to it.
        </p>
        <a href="/" className="btn btn-primary">Back to bernstein.run</a>
      </div>
      <Footer />
    </>
  );
}
```

- [ ] **Step 6: Create app/blog/page.tsx**

```tsx
import type { Metadata } from 'next';
import { getAllPosts } from '@/lib/mdx';
import { buildBlogIndexJsonLd, SITE_URL } from '@/lib/seo';
import { Nav } from '@/components/landing/Nav';
import { Footer } from '@/components/landing/Footer';
import { BlogCard } from '@/components/blog/BlogCard';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Engineering deep-dives, community spotlights, and updates from the Bernstein project.',
  alternates: { canonical: `${SITE_URL}/blog` },
  openGraph: {
    title: 'Bernstein Blog',
    description: 'Engineering deep-dives, community spotlights, and updates from the Bernstein project.',
    url: `${SITE_URL}/blog`,
    type: 'website',
  },
};

export default async function BlogIndex() {
  const posts = await getAllPosts();
  const jsonLd = buildBlogIndexJsonLd(posts);

  return (
    <>
      <Nav />
      <div className="blog-index">
        <h1>Blog</h1>
        <p>Engineering deep-dives, community spotlights, and updates from the Bernstein project.</p>
        {posts.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No posts yet. Check back soon.</p>
        ) : (
          posts.map((post) => <BlogCard key={post.slug} post={post} />)
        )}
      </div>
      <Footer />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
```

- [ ] **Step 7: Create app/blog/[slug]/page.tsx**

```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPost, getSlugs } from '@/lib/mdx';
import { buildBlogPostJsonLd, SITE_URL, AUTHOR } from '@/lib/seo';
import { Nav } from '@/components/landing/Nav';
import { Footer } from '@/components/landing/Footer';

type Props = { params: { slug: string } };

export async function generateStaticParams() {
  const slugs = await getSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPost(params.slug);
  if (!post) return {};
  return {
    title: post.fm.title,
    description: post.fm.description,
    authors: [{ name: AUTHOR }],
    alternates: { canonical: `${SITE_URL}/blog/${params.slug}` },
    openGraph: {
      type: 'article',
      title: post.fm.title,
      description: post.fm.description,
      url: `${SITE_URL}/blog/${params.slug}`,
      publishedTime: post.fm.date,
      authors: [AUTHOR],
      images: [{ url: `/api/og?title=${encodeURIComponent(post.fm.title)}`, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.fm.title,
      description: post.fm.description,
      images: [`/api/og?title=${encodeURIComponent(post.fm.title)}`],
    },
  };
}

export default async function BlogPost({ params }: Props) {
  const post = await getPost(params.slug);
  if (!post) notFound();

  const jsonLd = buildBlogPostJsonLd(params.slug, post.fm, post.readingMinutes);

  return (
    <>
      <Nav />
      <article className="blog-post">
        <a href="/blog" className="blog-back">&larr; Back to blog</a>
        <header className="blog-post-header">
          <h1>{post.fm.title}</h1>
          <div className="blog-post-meta">
            <time dateTime={post.fm.date}>{new Date(post.fm.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</time>
            <span>{post.readingMinutes} min read</span>
          </div>
        </header>
        <div className="prose">{post.mdx}</div>
      </article>
      <Footer />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
```

- [ ] **Step 8: Create first blog post**

Create `content/blog/community-spotlight-april-2026/index.mdx`:

```mdx
---
title: "Community Spotlight: April 2026"
description: "Celebrating contributors, highlighting outstanding contributions, and sharing what's new in the Bernstein ecosystem."
date: "2026-04-14"
tags: ["community", "spotlight", "open-source"]
---

<Lead>
Every month we spotlight the people who make Bernstein better. Here are April's highlights.
</Lead>

## Outstanding contributions

Our contributors have been busy. Here are some highlights from the past month:

- **Architecture decomposition** — 52 oversized modules broken into focused sub-packages, each under 600 lines. The codebase is now easier to navigate, test, and extend.
- **18 agent adapters** — We went from 7 adapters to 29. Claude Code, Codex, Gemini CLI, Cursor, Aider, Amp, Roo Code, Kiro, Qwen, Goose, and more now work out of the box.
- **Cost-aware routing** — The contextual bandit router learns which model works best per task type. Early users report 50-60% cost savings vs uniform model selection.

## Get involved

Bernstein is Apache 2.0 licensed and welcomes contributions of all sizes. Check the [good first issues](https://github.com/chernistry/bernstein/labels/good%20first%20issue) or drop into the discussion.

All contributors are listed in [CONTRIBUTORS.md](https://github.com/chernistry/bernstein/blob/main/CONTRIBUTORS.md).
```

- [ ] **Step 9: Verify blog works end-to-end**

Run: `npm run dev`
Open: `http://localhost:3000/blog` — should show blog index with one card
Open: `http://localhost:3000/blog/community-spotlight-april-2026` — should render the MDX post
Open: `http://localhost:3000/llms.txt` — should include blog post in output
Open: `http://localhost:3000/sitemap.xml` — should list blog post URL

- [ ] **Step 10: Commit**

```bash
git add app/blog/ app/not-found.tsx app/robots.ts app/sitemap.ts app/llms.txt/ app/llms-full.txt/ app/ai.txt/ app/humans.txt/ lib/seo.ts content/
git commit -m "feat: blog engine, SEO routes, and first community spotlight post"
```

---

### Task 6: OG image generation

**Files:**
- Create: `app/api/og/route.tsx`

- [ ] **Step 1: Install @vercel/og**

Run: `npm install @vercel/og`

- [ ] **Step 2: Create app/api/og/route.tsx**

```tsx
import { ImageResponse } from '@vercel/og';
import type { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get('title') || 'Bernstein';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '60px 80px',
          background: '#131316',
          color: '#f0f0f2',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        <div style={{ fontSize: 24, color: '#6e6e80', marginBottom: 24, fontWeight: 500 }}>
          bernstein.run
        </div>
        <div style={{ fontSize: 56, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.2, maxWidth: '900px' }}>
          {title}
        </div>
        <div style={{ fontSize: 20, color: '#6e6e80', marginTop: 32 }}>
          Multi-agent orchestration for CLI coding agents
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
```

- [ ] **Step 3: Verify OG image**

Open: `http://localhost:3000/api/og?title=Community%20Spotlight%3A%20April%202026`
Expected: 1200x630 dark image with title text.

- [ ] **Step 4: Commit**

```bash
git add app/api/og/ package.json package-lock.json
git commit -m "feat: dynamic OG image generation via Satori"
```

---

### Task 7: Docker + deployment

**Files:**
- Modify: `Dockerfile` (replace nginx with Next.js standalone)
- Modify: `docker-compose.yml` (update port)
- Modify: `.github/workflows/deploy-vps.yml` (update health check port)

- [ ] **Step 1: Replace Dockerfile**

```dockerfile
FROM node:20-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache libc6-compat

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --prefer-offline --no-audit --no-fund

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -q --spider "http://127.0.0.1:3000/" || exit 1
CMD ["node", "server.js"]
```

- [ ] **Step 2: Update docker-compose.yml**

```yaml
services:
  bernstein-landing:
    build: .
    container_name: bernstein-landing
    restart: unless-stopped
    networks:
      - deploy_homepage

networks:
  deploy_homepage:
    external: true
```

No port mapping needed — Caddy connects via Docker network. The container listens on 3000 internally.

- [ ] **Step 3: Update deploy workflow health check**

In `.github/workflows/deploy-vps.yml`, change the verification step's curl from port 80 to port 3000:

Change:
```bash
if curl -sf -o /dev/null "http://${CONTAINER_IP}:80"; then
```
To:
```bash
if curl -sf -o /dev/null "http://${CONTAINER_IP}:3000"; then
```

Also increase sleep from 3 to 10 seconds (Next.js standalone takes a moment to start):
```bash
sleep 10
```

- [ ] **Step 4: Update Caddy on VPS**

SSH into VPS and update the Caddyfile to proxy to port 3000 instead of 80:

```bash
ssh -i ~/.ssh/homepage_ovh_admin ubuntu@135.125.243.120 '
  sudo sed -i "s/reverse_proxy bernstein-landing:80/reverse_proxy bernstein-landing:3000/" /srv/homepage/deploy/Caddyfile
  sudo docker exec caddy caddy reload --config /etc/caddy/Caddyfile
'
```

- [ ] **Step 5: Remove old static files that are now handled by Next.js**

Delete these files (they're now dynamic routes or handled by Next.js):
- `nginx.conf` (no longer using nginx)
- `robots.txt` (now `app/robots.ts`)
- `sitemap.xml` (now `app/sitemap.ts`)
- `llms.txt` (now `app/llms.txt/route.ts`)
- `llms-full.txt` (now `app/llms-full.txt/route.ts`)
- `ai.txt` (now `app/ai.txt/route.ts`)
- `humans.txt` (now `app/humans.txt/route.ts`)
- `index.html` (now `app/page.tsx`)
- `404.html` (now `app/not-found.tsx`)
- `og-image.html` (now `app/api/og/route.tsx`)

Keep in `public/`:
- `favicon.svg`
- `manifest.json`
- `structured-data.json`
- `.well-known/security.txt`
- `.well-known/ai-plugin.json`

- [ ] **Step 6: Verify local Docker build**

Run: `docker build -t bernstein-landing-test .`
Run: `docker run --rm -p 3000:3000 bernstein-landing-test`
Open: `http://localhost:3000` — landing page
Open: `http://localhost:3000/blog` — blog index
Open: `http://localhost:3000/llms.txt` — dynamic llms.txt
Expected: All pages render correctly.

- [ ] **Step 7: Commit**

```bash
git add Dockerfile docker-compose.yml .github/workflows/deploy-vps.yml
git rm nginx.conf robots.txt sitemap.xml llms.txt llms-full.txt ai.txt humans.txt index.html 404.html og-image.html seo-checklist.md DEPLOY.md
git commit -m "feat: migrate to Next.js standalone Docker, remove nginx"
```

- [ ] **Step 8: Push and deploy**

```bash
git push origin master
```

Monitor the GitHub Actions deploy. After it completes, verify:
- `https://bernstein.run` — landing page
- `https://bernstein.run/blog` — blog index
- `https://bernstein.run/blog/community-spotlight-april-2026` — blog post
- `https://bernstein.run/llms.txt` — dynamic llms.txt with blog links
- `https://bernstein.run/sitemap.xml` — includes blog URLs
- `https://bernstein.run/robots.txt` — valid robots.txt
- `https://bernstein.run/api/og?title=Test` — OG image

---

## Verification Checklist

After all tasks are complete:

- [ ] Landing page pixel-matches the current site (same OKLCH colors, typography, layout)
- [ ] All nav links work (including from blog pages back to landing sections)
- [ ] Email capture form submits to Kit successfully
- [ ] Blog index shows posts sorted by date descending
- [ ] Blog posts render MDX with syntax highlighting
- [ ] `robots.txt` lists AI bots and sitemap URL
- [ ] `sitemap.xml` includes landing page and all blog posts
- [ ] `llms.txt` includes blog post links
- [ ] `llms-full.txt` includes full technical content
- [ ] `ai.txt` serves correctly
- [ ] JSON-LD validates (check via Google Rich Results Test)
- [ ] OG images generate dynamically
- [ ] 404 page renders with nav and footer
- [ ] Docker health check passes
- [ ] Caddy TLS works (HTTPS, no cert errors)
- [ ] Response headers include CSP, X-Frame-Options, etc.
- [ ] `prefers-reduced-motion` respected
- [ ] Mobile responsive (nav collapses, grids stack)
