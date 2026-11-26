/**
 * /.well-known/mcp.json - SEP-1649 / MCP Server Card v1 discovery endpoint.
 *
 * Advertises the live anonymous Streamable HTTP verifier endpoint at
 * `https://mcp.bernstein.run/mcp` under `remotes` and documents the full
 * locally-installed stdio server (`bernstein mcp`) under `_meta` without
 * bare loopback URLs.
 */
const SERVER_CARD = {
  $schema: 'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json',
  name: 'run.bernstein/bernstein',
  title: 'Bernstein MCP Server',
  version: '4.0.2',
  description:
    'Open-source AI agent governance, worktree orchestration, and offline receipt verification.',
  websiteUrl: 'https://bernstein.run',
  repository: {
    url: 'https://github.com/sipyourdrink-ltd/bernstein',
    source: 'github',
  },
  remotes: [
    {
      type: 'streamable-http',
      url: 'https://mcp.bernstein.run/mcp',
      supportedProtocolVersions: ['2025-06-18', '2025-03-26'],
    },
  ],
  _meta: {
    'run.bernstein/stdio': {
      install: 'pipx install bernstein',
      command: 'bernstein',
      args: ['mcp'],
      fullSpecUrl: 'https://bernstein.run/mcp-server.json',
    },
  },
};

export function GET(): Response {
  return new Response(`${JSON.stringify(SERVER_CARD, null, 2)}\n`, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
      'X-Robots-Tag': 'noindex, follow',
    },
  });
}
