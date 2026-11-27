/**
 * /.well-known/ai-catalog.json - SEP-2127 AI capability catalog.
 *
 * Indexes the MCP Server Cards published by `bernstein.run` so MCP registries
 * and agentic clients can discover both the SEP-1649 v1 card (`/.well-known/mcp.json`)
 * and the tool-level card (`/.well-known/mcp/server-card.json`) pre-connection.
 */
const AI_CATALOG = {
  specVersion: '1.0',
  entries: [
    {
      identifier: 'urn:air:bernstein.run:mcp:bernstein',
      type: 'application/mcp-server-card+json',
      url: 'https://bernstein.run/.well-known/mcp.json',
    },
    {
      identifier: 'urn:air:bernstein.run:mcp:server-card',
      type: 'application/mcp-server-card+json',
      url: 'https://bernstein.run/.well-known/mcp/server-card.json',
    },
  ],
};

export function GET(): Response {
  return new Response(`${JSON.stringify(AI_CATALOG, null, 2)}\n`, {
    status: 200,
    headers: {
      'Content-Type': 'application/ai-catalog+json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
      'X-Robots-Tag': 'noindex, follow',
    },
  });
}
