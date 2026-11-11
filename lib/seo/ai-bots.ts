/**
 * Single source of truth for the named crawler-UA list.
 *
 * Consumed by:
 *   - app/robots.txt/route.ts - renders one ``User-agent: <name>`` /
 *     ``Allow: /`` block per entry, in the order declared here.
 *   - middleware.ts - sends the ai-content Link discovery headers to
 *     these user agents.
 *
 * Keeping the array here and importing it on both sides stops the two
 * lists from drifting apart.
 *
 * Ordering note: the bucketed comments and the order below mirror the
 * original in-line array. Append new entries inside the appropriate
 * bucket; do not reorder existing entries without also accepting the
 * diff that produces in the rendered robots.txt. (2026-08-10: fixed
 * two tokens that never matched a real crawler - Perplexity documents
 * 'Perplexity-User', Mistral documents 'MistralAI-User' - and appended
 * Meta-ExternalFetcher, AI2Bot, GrokBot, DeepSeekBot; the robots.txt
 * byte-diff was accepted deliberately.)
 */
export const AI_BOTS: readonly string[] = [
  // OpenAI
  'GPTBot',
  'ChatGPT-User',
  'OAI-SearchBot',
  // Anthropic
  'ClaudeBot',
  'Claude-Web',
  'Claude-SearchBot',
  'Claude-User',
  'Anthropic-ai',
  // Google / Apple / Meta
  'Google-Extended',
  'Googlebot',
  'Applebot',
  'Applebot-Extended',
  'meta-externalagent',
  'Meta-ExternalFetcher',
  'FacebookBot',
  // Perplexity / Bing / others
  'PerplexityBot',
  'Perplexity-User',
  'Bingbot',
  'CCBot',
  'cohere-ai',
  'cohere-training-data-crawler',
  'Amazonbot',
  'DuckAssistBot',
  'YouBot',
  'Bytespider',
  'Diffbot',
  'Timpibot',
  'MistralAI-User',
  'Kagibot',
  'AI2Bot',
  'GrokBot',
  'DeepSeekBot',
  // Tier-2 search engines. IndexNow protocol participants
  // (Bing/Yandex/Naver/Seznam/Yep) plus the four free-tier crawlers
  // worth indexing (Mojeek, Marginalia, DuckDuckBot, Brave). Listing
  // by name avoids most-specific-record fall-through silently
  // skipping the wildcard allow.
  'YandexBot',
  'YandexImages',
  'MojeekBot',
  'YepBot',
  'SeznamBot',
  'Yeti',
  'MarginaliaBot',
  'DuckDuckBot',
  'BraveBot',
  'PetalBot',
  'Qwantify',
  // Social preview bots - not training crawlers, but the unfurl
  // drives traffic so we keep them explicitly allowed.
  'FacebookExternalHit',
  'LinkedInBot',
  'Twitterbot',
  'Slackbot',
  'Discordbot',
] as const;
