'use client';

import { useMemo, useState } from 'react';
import type { PostIndex } from '@/lib/mdx';
import { BlogCard } from './BlogCard';

interface BlogListProps {
  posts: PostIndex[];
}

const ALL = '__all__';

export function BlogList({ posts }: BlogListProps) {
  const [active, setActive] = useState<string>(ALL);

  const { tagCounts, tagOrder } = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of posts) {
      for (const t of p.fm.tags ?? []) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    // Sort tags by count desc, then alphabetical
    const order = Array.from(counts.entries())
      .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
      .map(([t]) => t);
    return { tagCounts: counts, tagOrder: order };
  }, [posts]);

  const visible = useMemo(() => {
    if (active === ALL) return posts;
    return posts.filter((p) => (p.fm.tags ?? []).includes(active));
  }, [active, posts]);

  if (posts.length === 0) {
    return (
      <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
        No posts yet. Check back soon.
      </p>
    );
  }

  return (
    <div className="blog-list">
      {tagOrder.length > 0 && (
        <div className="blog-tag-filter" role="tablist" aria-label="Filter posts by tag">
          <button
            type="button"
            role="tab"
            aria-selected={active === ALL}
            className={
              active === ALL ? 'blog-tag-filter-chip is-active' : 'blog-tag-filter-chip'
            }
            onClick={() => setActive(ALL)}
          >
            all · {posts.length}
          </button>
          {tagOrder.map((tag) => (
            <button
              key={tag}
              type="button"
              role="tab"
              aria-selected={active === tag}
              className={
                active === tag ? 'blog-tag-filter-chip is-active' : 'blog-tag-filter-chip'
              }
              onClick={() => setActive(tag)}
            >
              {tag} · {tagCounts.get(tag) ?? 0}
            </button>
          ))}
        </div>
      )}
      <div className="blog-list-items">
        {visible.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
            No posts match this tag.
          </p>
        ) : (
          visible.map((post) => <BlogCard key={post.slug} post={post} />)
        )}
      </div>
    </div>
  );
}
