import { slugifyHeading } from '@/lib/blog-headings';
import { AnchorLink } from './AnchorLink';

export function MdxH2({ children, id: explicitId, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  const text = typeof children === 'string' ? children : '';
  /* If the MDX author passed an explicit `id` (raw <h2 id="..."> in
     the source), honour it. Citations from the gateway can then
     deep-link to a stable anchor that doesn't drift when the heading
     text gets a copy-edit. Falls back to the slugified text otherwise
     so existing posts keep working. */
  const id = explicitId && explicitId.length > 0 ? explicitId : slugifyHeading(text);
  return (
    <h2 id={id} className="mdx-heading" {...props}>
      {children}
      {id && <AnchorLink slug={id} label={text} />}
    </h2>
  );
}
