import { NextResponse, type NextRequest } from 'next/server';

const AI_BOT_PATTERNS = [
  'GPTBot', 'ChatGPT-User', 'Google-Extended', 'Googlebot',
  'ClaudeBot', 'Anthropic-ai', 'Claude-Web',
  'PerplexityBot', 'Bytespider', 'CCBot',
  'cohere-ai', 'Diffbot', 'FacebookBot',
  'YouBot', 'AI2Bot', 'Applebot-Extended',
];

export function middleware(request: NextRequest) {
  const ua = request.headers.get('user-agent') ?? '';
  const isAiBot = AI_BOT_PATTERNS.some((bot) => ua.includes(bot));

  const response = NextResponse.next();

  // Add AI-friendly headers for all responses
  response.headers.set('X-Robots-Tag', 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');

  if (isAiBot) {
    // Signal that AI-optimized content is available
    response.headers.set('X-AI-Content-Available', 'true');
    response.headers.set('Link', [
      `<${request.nextUrl.origin}/llms.txt>; rel="ai-content"; type="text/markdown"`,
      `<${request.nextUrl.origin}/llms-full.txt>; rel="ai-content-full"; type="text/markdown"`,
      `<${request.nextUrl.origin}/.well-known/agent-card.json>; rel="agent-card"; type="application/json"`,
      `<${request.nextUrl.origin}/.well-known/mcp/server-card.json>; rel="mcp-server"; type="application/json"`,
    ].join(', '));
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.svg|manifest.json).*)',
  ],
};
