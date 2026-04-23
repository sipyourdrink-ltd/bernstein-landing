'use client';
import { useRef, useEffect, useState, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
  delay?: number;
  threshold?: number;
  /**
   * X-01: Reserve ScrollReveal for section headers. When `staggerChildren`
   * is false (default), children animate as one unit with the wrapper —
   * no per-child stagger. Pass `true` only when you explicitly want each
   * child wrapped in its own ScrollReveal elsewhere; this prop is a
   * documentation signal and we cap the effective delay regardless.
   */
  staggerChildren?: boolean;
}

// X-01: cap ScrollReveal transition-delay so nothing staggers beyond 300ms
// total, keeping reveals tight even if a caller passes a large delay.
const MAX_DELAY_MS = 300;

export function ScrollReveal({
  children,
  className,
  delay = 0,
  threshold = 0.15,
  staggerChildren = false,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  const cappedDelay = Math.min(Math.max(delay, 0), MAX_DELAY_MS);

  return (
    <div
      ref={ref}
      className={`scroll-reveal ${visible ? 'revealed' : ''} ${staggerChildren ? 'scroll-reveal-stagger' : ''} ${className ?? ''}`}
      style={cappedDelay ? { transitionDelay: `${cappedDelay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
