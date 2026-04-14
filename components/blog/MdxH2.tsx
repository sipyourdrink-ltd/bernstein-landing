import { slugifyHeading } from '@/lib/blog-headings';

export function MdxH2({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  const text = typeof children === 'string' ? children : '';
  const id = slugifyHeading(text);
  return <h2 id={id} {...props}>{children}</h2>;
}
