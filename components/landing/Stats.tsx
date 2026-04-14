'use client';

import { useRef, useEffect, useState, useCallback } from 'react';

function formatNumber(value: number, format: 'k' | 'comma' | 'plain'): string {
  if (format === 'k') {
    return value >= 1000 ? (value / 1000).toFixed(1) + 'k' : String(value);
  }
  if (format === 'comma') {
    return value.toLocaleString('en-US');
  }
  return String(value);
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

interface AnimatedNumberProps {
  target: number;
  suffix?: string;
  format?: 'k' | 'comma' | 'plain';
}

function AnimatedNumber({ target, suffix = '', format = 'plain' }: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(formatNumber(0, format) + suffix);
  const hasAnimated = useRef(false);

  const animate = useCallback(() => {
    const duration = 1200;
    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);
      const current = Math.round(eased * target);
      setDisplay(formatNumber(current, format) + suffix);
      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    }

    requestAnimationFrame(tick);
  }, [target, suffix, format]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(formatNumber(target, format) + suffix);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          animate();
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, suffix, format, animate]);

  return <span ref={ref}>{display}</span>;
}

const FALLBACK_DOWNLOADS = 8600;

export function Stats() {
  const [downloads, setDownloads] = useState(FALLBACK_DOWNLOADS);

  useEffect(() => {
    fetch('https://pypistats.org/api/packages/bernstein/recent')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.data?.last_month) {
          setDownloads(data.data.last_month);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="stats">
      <div className="stat">
        <div className="stat-num">
          <AnimatedNumber target={110} suffix="+" />
        </div>
        <div className="stat-label">GitHub stars</div>
      </div>
      <a
        href="https://pypistats.org/packages/bernstein"
        target="_blank"
        rel="noopener noreferrer"
        className="stat stat-link"
      >
        <div className="stat-num">
          <AnimatedNumber target={downloads} format="comma" />
        </div>
        <div className="stat-label">Monthly downloads</div>
      </a>
      <div className="stat">
        <div className="stat-num">
          <AnimatedNumber target={21} />
        </div>
        <div className="stat-label">Agent adapters</div>
      </div>
      <div className="stat">
        <div className="stat-num">
          <AnimatedNumber target={2600} suffix="+" format="comma" />
        </div>
        <div className="stat-label">Tests passing</div>
      </div>
    </div>
  );
}
