'use client';

import { usePathname } from 'next/navigation';

/* Pages under /blog are served with a signed page receipt (edge seal).
   The link asks the seal for the receipt of this exact page and lands on
   the verifier with it. Rendered only where the seal runs, so the link is
   never dead. */
export function PageSeal() {
  const pathname = usePathname();
  if (!pathname || !pathname.startsWith('/blog/')) return null;
  return (
    <a
      className="page-seal"
      href={`/.well-known/page-receipt?p=${encodeURIComponent(pathname)}`}
      rel="nofollow"
      data-umami-event="page-seal-verify"
    >
      <svg
        className="page-seal-check"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M3.5 8.5L6.5 11.5L12.5 4.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      this page is signed · verify
    </a>
  );
}
