import { ImageResponse } from '@vercel/og';
import type { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get('title') || 'Bernstein';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '60px 80px',
          background: '#131316',
          color: '#f0f0f2',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        <div style={{ fontSize: 24, color: '#6e6e80', marginBottom: 24, fontWeight: 500 }}>
          bernstein.run
        </div>
        <div style={{ fontSize: 56, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.2, maxWidth: '900px' }}>
          {title}
        </div>
        <div style={{ fontSize: 20, color: '#6e6e80', marginTop: 32 }}>
          Multi-agent orchestration for CLI coding agents
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
