import type { PostIndex } from '@/lib/mdx';

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

interface BlogCardProps {
  post: PostIndex;
  featured?: boolean;
}

export function BlogCard({ post, featured = false }: BlogCardProps) {
  const tags = post.fm.tags ?? [];
  return (
    <a
      href={`/blog/${post.slug}`}
      className={featured ? 'blog-card blog-card--featured' : 'blog-card'}
    >
      {featured && (
        <div className="blog-card-eyebrow">◆ Featured · read first</div>
      )}
      <div className="blog-card-date">
        <time dateTime={post.fm.date}>{formatDate(post.fm.date)}</time>
      </div>
      <h2>{post.fm.title}</h2>
      <p>{post.fm.description}</p>
      <div className="blog-card-meta">
        <span>{post.readingMinutes} min read</span>
      </div>
      {tags.length > 0 && (
        <div className="blog-card-tags">
          {tags.slice(0, 4).map((tag) => (
            <span key={tag} className="blog-tag-chip">
              {tag}
            </span>
          ))}
        </div>
      )}
    </a>
  );
}
