export type TableOfContentsItem = {
  level: 2 | 3;
  text: string;
  slug: string;
  readingMinutes: number;
};

const FENCE = /^```/;
const HEADING = /^(##|###)\s+(.+)$/;

function stripMarkdown(value: string): string {
  return value
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/[>*_~]/g, '')
    .trim();
}

export function slugifyHeading(value: string): string {
  return stripMarkdown(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

const WORDS_PER_MINUTE = 230;

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function extractTableOfContents(markdown: string): TableOfContentsItem[] {
  const items: TableOfContentsItem[] = [];
  const sectionWordCounts: number[] = [];
  const slugCounts = new Map<string, number>();
  let inFence = false;
  let currentWordCount = 0;

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trim();
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }

    if (inFence) {
      continue;
    }

    const match = line.match(HEADING);
    if (!match) {
      if (items.length > 0) {
        currentWordCount += countWords(line);
      }
      continue;
    }

    if (items.length > 0) {
      sectionWordCounts.push(currentWordCount);
    }
    currentWordCount = 0;

    const level = match[1] === '##' ? 2 : 3;
    const text = stripMarkdown(match[2]);
    const baseSlug = slugifyHeading(text);
    const seen = slugCounts.get(baseSlug) ?? 0;
    slugCounts.set(baseSlug, seen + 1);
    const slug = seen === 0 ? baseSlug : `${baseSlug}-${seen + 1}`;

    items.push({ level, text, slug, readingMinutes: 0 });
  }

  // Push word count for the last section
  if (items.length > 0) {
    sectionWordCounts.push(currentWordCount);
  }

  // Assign reading minutes to each item
  for (let i = 0; i < items.length; i++) {
    items[i].readingMinutes = Math.round(sectionWordCounts[i] / WORDS_PER_MINUTE);
  }

  return items;
}
