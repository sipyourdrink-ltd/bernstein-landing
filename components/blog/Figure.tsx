export function Figure({ src, alt, caption }: { src: string; alt: string; caption?: string }) {
  return (
    <figure style={{ marginBottom: 'var(--space-5)' }}>
      <Image src={src} alt={alt} width={800} height={450} style={{ maxWidth: "100%", height: "auto", borderRadius: "var(--radius)" }} />
      {caption && (
        <figcaption style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: 'var(--space-2)', textAlign: 'center' }}>
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
