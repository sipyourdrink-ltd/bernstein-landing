import type { TableOfContentsItem } from '@/lib/blog-headings';

export function TocSidebar({ items }: { items: TableOfContentsItem[] }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Table of contents" style={{ position: 'sticky', top: '80px', fontSize: '13px' }}>
      <div style={{ color: 'var(--text-muted)', fontWeight: 600, marginBottom: 'var(--space-3)', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '11px' }}>
        On this page
      </div>
      <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {items.map((item) => (
          <li key={item.slug} style={{ paddingLeft: item.level === 3 ? 'var(--space-4)' : 0 }}>
            <a href={`#${item.slug}`} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
