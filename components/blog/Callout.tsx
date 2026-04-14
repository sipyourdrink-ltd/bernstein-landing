export function Callout({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="callout">
      {title && <div className="callout-title">{title}</div>}
      {children}
    </div>
  );
}
