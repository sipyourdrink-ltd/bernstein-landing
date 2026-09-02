import type { Metadata, Viewport } from "next";
import { OrganizationJsonLd } from "@/components/seo/OrganizationJsonLd";
import { fraunces, inter, jetbrainsMono } from "@/lib/fonts";
import { OPERATOR_EXCLUDE_INLINE_SCRIPT } from "@/lib/analytics/disable";
import "@/styles/globals.css";
import "@/styles/ux-typography.css";
import "@/styles/ux-layout.css";
import "@/styles/ux-hero.css";
import "@/styles/ux-cards.css";
import "@/styles/ux-editorial.css";
import "@/styles/ux-blog.css";
import "@/styles/ux-ask.css";
import "@/styles/ux-docs-bot.css";
import "@/styles/ux-sponsors.css";
/* Loaded LAST so its .v2-* selectors can override the older hero/pipeline
   rules should any class collide. (None do today; defensive.) */
import "@/styles/ux-redesign.css";
/* /cost token-bill calculator. Scoped under .cost-* so it never collides
   with v2-* or the older classes. */
import "@/styles/ux-cost.css";
/* /tools/* (agent-md-bench + orchestra picker).
   Scoped under .amd-* / .orch-* - never collides with cost-*, v2-*. */
import "@/styles/ux-tools.css";
/* Sticky pricing CTA, sponsor strip, social proof, watch CTA, RSS links.
   Scoped under .pricing-peek / .sponsor-strip-fold / .social-proof-strip /
   .watch-cta / .rss-subscribe-link / .cost-headline-ab. */
import "@/styles/ux-conv.css";

const SITE_URL = "https://bernstein.run";

/* One description string for the SERP snippet, the OG card, and the
   Twitter card. Kept as a single const so the three can never drift
   apart again - they had, and each carried a different agent count. */
const SITE_DESCRIPTION =
  "The open-source governance layer for AI agents. Runs Claude Code, Codex, Gemini CLI and 40+ agents in parallel worktrees with no model in the coordination loop.";

export const viewport: Viewport = {
  /* Cream paper background - matches --bg-paper. Hex fallback for browsers
     that ignore OKLCH in <meta theme-color>. */
  themeColor: "#f4ecdc",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Bernstein - the open-source governance layer for AI agents",
    template: "%s | Bernstein",
  },
  description: SITE_DESCRIPTION,
  authors: [{ name: "Alex Chernysh", url: "https://alexchernysh.com" }],
  creator: "Alex Chernysh",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "Bernstein",
    title: "Bernstein - the open-source governance layer for AI agents",
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/api/og",
        width: 1200,
        height: 630,
        alt: "Bernstein - the open-source governance layer for AI agents: Claude Code, Codex, Gemini CLI, and 40+ more, with runs a reviewer can verify offline",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@alex_chernysh",
    creator: "@alex_chernysh",
    title: "Bernstein - the open-source governance layer for AI agents",
    description: SITE_DESCRIPTION,
    images: ["/api/og"],
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: {
      url: "/apple-touch-icon.png",
      sizes: "180x180",
      type: "image/png",
    },
    other: [
      {
        rel: "icon",
        url: "/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        rel: "icon",
        url: "/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  },
  manifest: "/manifest.json",
  alternates: {
    canonical: SITE_URL,
    types: {
      /* Single emitter per alternate target. The head below used to
         carry a second hand-written <link rel="alternate"
         type="application/rss+xml"> for the same feed, so the served
         document declared the feed twice (once relative, once
         absolute) with only one of them titled. Next resolves the
         relative href against metadataBase, so the rendered tag is the
         absolute https://bernstein.run/rss.xml and keeps the title. */
      "application/rss+xml": [{ url: "/rss.xml", title: "Bernstein Blog" }],
      "text/markdown": "/llms.txt",
    },
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
    "mobile-web-app-capable": "yes",
    "msapplication-TileColor": "#f4ecdc",
    "format-detection": "telephone=no",
    "ai-content": "https://bernstein.run/llms.txt",
    "ai-content-full": "https://bernstein.run/llms-full.txt",
    "agent-card": "https://bernstein.run/.well-known/agent-card.json",
    "mcp-server": "https://bernstein.run/.well-known/mcp/server-card.json",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        {/* No explicit <head> element.
            A `<head>` rendered as a host element makes React reconcile its
            children by position, and the elements it lands among are Next's
            own font preloads and stylesheets. Anything that inserts a node
            into <head> ahead of those - a CDN HTML rewrite, a corporate
            proxy, a browser extension - shifts every following node by one
            and the whole document fails to hydrate.

            That is not hypothetical: the edge in front of this site began
            injecting a `<script type="module">` immediately after the
            viewport meta, and every page threw React #418 and re-inserted a
            second copy of the analytics tag. Injecting the same node at the
            END of <head> hydrated cleanly, which is what identifies the
            cause as position rather than the node itself.

            Rendered from <body> instead, these are hoistable resources:
            React lifts the <link>s into <head> and matches them by identity
            on hydration, so a foreign node among them is simply a node React
            does not own. The inline script stays in <body>, which is where
            it has to run anyway - during parse, before the deferred tracker
            below it. */}
        {/* Warm DNS + TLS for the self-hosted Umami endpoint and the
              Cloudflare Insights beacon (injected by CF edge when the
              project is fronted by their CDN). Preconnecting early shaves
              ~80-200ms off the first analytics request and unblocks
              LCP/FCP on cold connections. */}
        <link
          rel="preconnect"
          href="https://analytics.bernstein.run"
          crossOrigin="anonymous"
        />
        {/* The RSS <link> is emitted once, from
              metadata.alternates.types above. A duplicate hand-written tag
              used to sit here as belt-and-braces for older readers; it
              shipped a second rss+xml declaration for the same feed with a
              different href form, which readers and link-graph parsers
              counted as two feeds. */}
        {/* AIO: extended LLM reference alongside the primary llms.txt alternate */}
        <link
          rel="alternate"
          type="text/markdown"
          href="/llms-full.txt"
          title="Bernstein - full technical reference for LLMs"
        />
        {/* Author identity - signals crawler/LLM graph connections.
              `rel="author"` is emitted once, by metadata.authors above (a
              hand-written copy here made it two identical tags); the
              rel="me" set stays hand-written because Next has no
              metadata field for it. */}
        <link rel="me" href="https://alexchernysh.com" />
        <link rel="me" href="https://github.com/chernistry" />
        <link rel="me" href="https://x.com/alex_chernysh" />
        {/* Operator-traffic exclusion - runs synchronously before the
              Umami tracker so a stub ``window.umami`` is in place when
              ``script.js`` boots. Toggle by running
              ``localStorage.setItem('umami:disabled','true')`` in the
              operator's own browser console. Visitor traffic is unaffected
              because their localStorage flag is unset. */}
        <script
          // eslint-disable-next-line react/no-danger -- inline string is a
          // hardcoded constant from lib/analytics/disable.ts; not user input.
          dangerouslySetInnerHTML={{ __html: OPERATOR_EXCLUDE_INLINE_SCRIPT }}
        />
        {/* Umami self-host (analytics.bernstein.run) - cookieless RUM,
              grouped by UTM parameters on inbound links.
              Defer-loaded; zero impact on LCP. UUID lives in
              NEXT_PUBLIC_UMAMI_WEBSITE_ID (build-time env var) so a
              registration in the Umami DB is the single source of truth
              and Caddy/compose can swap it without a source patch. When
              the env var is unset we skip emitting the tag entirely
              instead of falling back to a hardcoded UUID, so a
              mis-configured staging build can't silently contaminate the
              production dashboard (BUG-AUDIT 2026-05-09). The
              `data-domains` allowlist pins this tracker to the bernstein
              surfaces - events from any other host are dropped client-side
              so a stolen `script.js` URL can't pollute our pixel stream. */}
        {process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID ? (
          <script
            defer
            src="https://analytics.bernstein.run/script.js"
            data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
            data-domains="bernstein.run,www.bernstein.run,getbernstein.com,www.getbernstein.com"
            data-performance="true"
          />
        ) : null}
        {children}
        {/* Organization JSON-LD lives at the layout level so every page
              (landing, blog, blog post, llms.txt-ish surfaces) emits a
              consistent publisher node. SoftwareApplication is page-level
              because it only describes the landing surface. */}
        <OrganizationJsonLd />
      </body>
    </html>
  );
}
