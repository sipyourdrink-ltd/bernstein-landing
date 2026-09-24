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
      this page is signed · verify
    </a>
  );
}
