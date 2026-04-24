import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/' },
      ...[
        // OpenAI crawlers
        'GPTBot',
        'ChatGPT-User',
        'OAI-SearchBot',
        // Anthropic crawlers
        'ClaudeBot',
        'Claude-Web',
        'Claude-SearchBot',
        'Claude-User',
        'Anthropic-ai',
        // Google / Apple / Meta AI crawlers
        'Google-Extended',
        'Googlebot',
        'Applebot',
        'Applebot-Extended',
        'meta-externalagent',
        'FacebookBot',
        // Other AI / search crawlers
        'PerplexityBot',
        'PerplexityBot-User',
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
        'Mistral-AI-Bot',
        'Kagibot',
        // Social preview bots (not AI training, but traffic source)
        'FacebookExternalHit',
        'LinkedInBot',
        'Twitterbot',
        'Slackbot',
        'Discordbot',
      ].map((bot) => ({ userAgent: bot, allow: '/' as const })),
    ],
    sitemap: 'https://bernstein.run/sitemap.xml',
    host: 'https://bernstein.run',
  };
}
