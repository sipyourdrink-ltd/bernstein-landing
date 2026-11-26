import { buildLlmsTxt } from '@/lib/seo';
import { enrichLlmsTxt } from '@/lib/markdown-view';

export async function GET() {
  const content = enrichLlmsTxt(await buildLlmsTxt());
  return new Response(content, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' },
  });
}
