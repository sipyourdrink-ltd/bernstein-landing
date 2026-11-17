import type { Metadata } from 'next';
import { Nav } from '@/components/landing/Nav';
import { Footer } from '@/components/landing/Footer';

export const metadata: Metadata = {
  title: 'Third-party notices',
  description: 'License and source information for elkjs, used by Mermaid on this site.',
  alternates: { canonical: 'https://bernstein.run/third-party-notices' },
};

export default function ThirdPartyNoticesPage() {
  return (
    <>
      <Nav />
      <main className="blog-post-layout">
        <article className="blog-post">
          <header className="blog-post-header">
            <h1>Third-party notices</h1>
          </header>
          <div className="prose">
            <h2>elkjs</h2>
            <p>
              This site uses elkjs, through Mermaid, under the{' '}
              <a href="https://www.eclipse.org/legal/epl-2.0/">Eclipse Public License 2.0 (EPL-2.0)</a>.
            </p>
            <p>
              The source code for elkjs is available under EPL-2.0 at{' '}
              <a href="https://github.com/kieler/elkjs">github.com/kieler/elkjs</a>.
            </p>
            <p>The original copyright and license notices are retained in the shipped elkjs JavaScript.</p>
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
