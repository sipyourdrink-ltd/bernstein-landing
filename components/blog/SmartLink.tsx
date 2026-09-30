export function SmartLink(props: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const isExternal = /^https?:\/\//i.test(props.href ?? '');
  return <a {...props} {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})} />;
}
