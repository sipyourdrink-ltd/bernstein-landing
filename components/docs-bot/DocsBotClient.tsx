'use client';

/**
 * Client-only mount for DocsBot.
 *
 * Next 15 disallows `next/dynamic({ ssr: false })` from a Server
 * Component (where `app/page.tsx` and `app/ask/page.tsx` live). The
 * official upgrade path is to keep the dynamic-import call inside a
 * Client Component and have the Server Component import that wrapper.
 *
 * The bot itself uses `window` and `performance.mark` and a
 * useReducer that never matches SSR - so we deliberately skip server
 * rendering it and reserve a min-height placeholder to avoid CLS.
 */
import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import type { DocsBot as DocsBotType } from './DocsBot';

type DocsBotProps = ComponentProps<typeof DocsBotType>;

const DocsBot = dynamic(
  () => import('./DocsBot').then((m) => m.DocsBot),
  {
    ssr: false,
    loading: () => (
      <div
        className="docs-bot-loading"
        aria-hidden
        style={{ minHeight: '14rem' }}
      />
    ),
  },
);

export function DocsBotClient(props: DocsBotProps) {
  return <DocsBot {...props} />;
}
