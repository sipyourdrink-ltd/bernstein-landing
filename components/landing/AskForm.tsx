'use client';

/**
 * /ask form.
 *
 * Plain GET-form: submitting reloads the page with `?q=<value>`. The
 * server component does the search and renders results. No fetch, no
 * client-side state machine, no SSE. The simplest thing that could
 * possibly work - and the cheapest to host.
 */
import { useEffect, useRef, useState } from 'react';

interface AskFormProps {
  initialQuery: string;
}

export function AskForm({ initialQuery }: AskFormProps) {
  const [value, setValue] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement | null>(null);

  /* Focus on mount when the page loaded with no query - the search
     box is the obvious next action. Don't steal focus when the user
     has already submitted (they may be reading results). */
  useEffect(() => {
    if (!initialQuery && inputRef.current) inputRef.current.focus();
  }, [initialQuery]);

  return (
    <form
      method="get"
      action="/ask"
      className="ask-form"
      role="search"
      aria-label="search the bernstein blog"
    >
      <label htmlFor="ask-input" className="ask-form-label">
        your question
      </label>
      <div className="ask-form-row">
        <input
          ref={inputRef}
          id="ask-input"
          name="q"
          type="search"
          inputMode="search"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          maxLength={200}
          placeholder="how do i configure a plan file?"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="ask-form-input"
        />
        <button
          type="submit"
          className="ask-form-submit"
          data-umami-event="ask-submit"
        >
          ask
        </button>
      </div>
      <p className="ask-form-hint">
        plain text only. one question per try. case-insensitive.
      </p>
    </form>
  );
}
