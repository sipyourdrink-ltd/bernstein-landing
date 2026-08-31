/**
 * Blog summary contract - mirrors alex/lib/blog-summary/types.ts.
 *
 * Bernstein.run is single-locale so the locale field is dropped; modes are
 * unchanged so the prompt-engineering carries over without re-tuning.
 */

export const summaryModes = ['quick', 'takeaways', 'technical'] as const;

export type SummaryMode = (typeof summaryModes)[number];
export type SummaryFormat = 'bullets' | 'paragraphs';

export type ArticleSummary = {
  title: string;
  format: SummaryFormat;
  /* Tuple-typed in alex's source; we keep it as a 1-4 length string array
     here because TypeScript narrowing on tuple lengths is more grief than
     it's worth for this read-only payload. The schema in service.ts caps
     items at min(1) max(4). */
  items: string[];
  whyItMatters: string;
  mode: SummaryMode;
  model: string;
  cached: boolean;
};

export type ArticleSummaryRequest = {
  slug: string;
  mode: SummaryMode;
};

export type ArticleSummaryErrorCode =
  | 'TEMPORARILY_UNAVAILABLE'
  | 'INVALID_ARTICLE'
  | 'NOT_CONFIGURED';

export type ArticleSummaryError = {
  code: ArticleSummaryErrorCode;
  message: string;
};
