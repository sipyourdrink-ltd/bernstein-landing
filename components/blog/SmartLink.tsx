export function SmartLink(props: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const isExternal = props.href?.startsWith('http');
  return <a {...props} {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})} />;
}
