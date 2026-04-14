import { slugifyHeading } from '@/lib/blog-headings';

export function MdxH3({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  const text = typeof children === 'string' ? children : '';
  const id = slugifyHeading(text);
  return <h3 id={id} {...props}>{children}</h3>;
}
