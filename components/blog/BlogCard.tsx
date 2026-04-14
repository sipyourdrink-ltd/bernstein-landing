import type { PostIndex } from '@/lib/mdx';

export function BlogCard({ post }: { post: PostIndex }) {
  return (
    <a href={`/blog/${post.slug}`} className="blog-card">
      <div className="blog-card-date">{post.fm.date}</div>
      <h2>{post.fm.title}</h2>
      <p>{post.fm.description}</p>
      <div className="blog-card-meta">
        <span>{post.readingMinutes} min read</span>
        {post.fm.tags && <span>{post.fm.tags.slice(0, 3).join(', ')}</span>}
      </div>
    </a>
  );
}
