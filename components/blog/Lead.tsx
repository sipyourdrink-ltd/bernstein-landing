/**
 * Authorial lede for blog posts.
 *
 * MDX wraps the inner content in a `<p>` automatically (block content
 * inside a JSX block always becomes a paragraph). Rendering another
 * `<p>` around it would produce `<p><p>…</p></p>`, which the HTML parser
 * silently fixes by closing the outer `<p>` immediately and leaving an
 * empty `.lead` element. That collapsed the styling and dumped the lede
 * text into a normal-looking paragraph.
 *
 * Using a `<div>` keeps the wrapper valid; styles are applied to the
 * inner `<p>` via the `.prose .lead p` selector in `styles/ux-blog.css`.
 */
export function Lead({ children }: { children: React.ReactNode }) {
  return <div className="lead">{children}</div>;
}
