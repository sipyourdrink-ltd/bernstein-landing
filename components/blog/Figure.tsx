export function Figure({ src, alt, caption }: { src: string; alt: string; caption?: string }) {
  return (
    <figure style={{ marginBottom: 'var(--space-5)' }}>
      <img src={src} alt={alt} style={{ maxWidth: '100%', borderRadius: 'var(--radius)' }} />
      {caption && (
        <figcaption style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: 'var(--space-2)', textAlign: 'center' }}>
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
