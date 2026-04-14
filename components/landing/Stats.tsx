'use client';

import { useRef, useEffect, useState, useCallback } from 'react';

function formatNumber(value: number, format: 'k' | 'comma' | 'plain'): string {
  if (format === 'k') {
    return (value / 1000).toFixed(1) + 'k';
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

const stats = [
  { target: 110, suffix: '+', format: 'plain' as const, label: 'GitHub stars' },
  { target: 7700, suffix: '', format: 'k' as const, label: 'Monthly downloads' },
  { target: 21, suffix: '', format: 'plain' as const, label: 'Agent adapters' },
  { target: 2600, suffix: '+', format: 'comma' as const, label: 'Tests passing' },
];

export function Stats() {
  return (
    <div className="stats">
      {stats.map((s) => (
        <div className="stat" key={s.label}>
          <div className="stat-num">
            <AnimatedNumber target={s.target} suffix={s.suffix} format={s.format} />
          </div>
          <div className="stat-label">{s.label}</div>
        </div>
      ))}
    </div>
  );
}
