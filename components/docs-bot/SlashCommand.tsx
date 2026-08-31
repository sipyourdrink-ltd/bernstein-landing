'use client';

/**
 * SlashCommand - keyboard `/` shortcut on `/docs/*` routes opens a
 * modal containing the same DocsBot.
 *
 * Behavioural contract from the ticket:
 *   - Trigger: `/` on routes whose pathname starts with `/docs/`.
 *   - MUST NOT fire when target is an input/textarea or has
 *     contenteditable. Otherwise typing a `/` in the input box would
 *     re-open the modal recursively.
 *   - ESC closes; focus returns to the previously focused element
 *     (focus trap on/off via `inert` on siblings, or a focus-return
 *     ref).
 *   - The URL gets `?ask=...` so the conversation is shareable.
 *
 * Note on `/docs/*`: the route doesn't exist yet in this codebase
 * - see ticket. We gate by `pathname` and ship the component as a
 * lazy import so the bundle on `/` doesn't pay for the modal's tree.
 *
 * The modal uses the native `<dialog>` element. It's the closest the
 * platform comes to a focus-trapped modal without dragging in a
 * focus-management library.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { DocsBot } from './DocsBot.tsx';

const ENABLED_PATH_PREFIX = '/docs/';

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  /* role="textbox" custom elements, e.g. rich-text editors. */
  if (target.getAttribute('role') === 'textbox') return true;
  return false;
}

export function SlashCommand() {
  const [open, setOpen] = useState(false);
  const [initialQuery, setInitialQuery] = useState('');
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  /* Mount-time gate: only register the `/` keydown when the current
     pathname is enabled. We re-check on history navigations because
     a SPA route change inside Next would otherwise leave the listener
     active where it shouldn't. */
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const update = () => {
      if (typeof location === 'undefined') return;
      setEnabled(location.pathname.startsWith(ENABLED_PATH_PREFIX));
    };
    update();
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);

  /* Heading nearest scroll-position prefill: pick whichever H1/H2/H3
     is closest to the top of the viewport. We use a generous margin
     so that hovering near a heading qualifies. */
  const computePrefill = useCallback((): string => {
    if (typeof document === 'undefined') return '';
    const headings = document.querySelectorAll<HTMLElement>('h1, h2, h3');
    let best: { el: HTMLElement; d: number } | null = null;
    for (const el of Array.from(headings)) {
      const r = el.getBoundingClientRect();
      const d = Math.abs(r.top);
      if (best === null || d < best.d) best = { el, d };
    }
    if (!best) return '';
    /* Lowercase the heading text to match the site voice; cap to 80
       chars so the input doesn't overflow on dense docs pages. */
    const text = best.el.textContent?.trim().toLowerCase() ?? '';
    return text.length > 80 ? text.slice(0, 80) : text;
  }, []);

  /* `/` opens; ESC closes. Both go through here so we can centralise
     the focus-return bookkeeping. */
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !open && !isTextEntryTarget(e.target)) {
        e.preventDefault();
        returnFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;
        setInitialQuery(computePrefill());
        setOpen(true);
        return;
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, open, computePrefill]);

  /* Native dialog show/hide and focus return. */
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open) {
      if (!d.open) {
        try {
          d.showModal();
        } catch {
          /* showModal throws if already open. Ignore. */
        }
      }
      /* Sync `?ask=...` so the URL captures intent for sharing. We
         use replaceState so the back button doesn't fill with modal
         transitions. */
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('ask', initialQuery || '1');
        window.history.replaceState(window.history.state, '', url.toString());
      } catch {
        /* URL APIs are universally available; fail quiet if not. */
      }
    } else {
      if (d.open) d.close();
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('ask');
        window.history.replaceState(window.history.state, '', url.toString());
      } catch {
        /* idem */
      }
      /* Return focus to the trigger element. */
      returnFocusRef.current?.focus?.();
    }
  }, [open, initialQuery]);

  if (!enabled) return null;

  return (
    <dialog
      ref={dialogRef}
      className="docs-bot-modal"
      aria-label="docs bot"
      onClose={() => setOpen(false)}
    >
      <div className="docs-bot-modal-inner">
        <button
          type="button"
          className="docs-bot-modal-close"
          aria-label="close"
          onClick={() => setOpen(false)}
        >
          esc ×
        </button>
        <DocsBot variant="modal" initialQuery={initialQuery} autoFocus />
      </div>
    </dialog>
  );
}
