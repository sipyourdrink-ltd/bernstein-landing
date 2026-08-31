/**
 * Server-rendered JSON-LD <script> tag.
 *
 * Centralised so we get one consistent shape across the site:
 *   - `type="application/ld+json"` exact (Google requires it).
 *   - `dangerouslySetInnerHTML` because React would otherwise escape the
 *     curly braces and produce text instead of a script body.
 *   - `JSON.stringify` rather than template literals so we never accidentally
 *     emit unescaped quotes or trailing commas - both kill the parser in
 *     Search Console without surfacing a useful error.
 */
export type JsonLdData = Record<string, unknown>;

export function JsonLd({ data }: { data: JsonLdData | JsonLdData[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
