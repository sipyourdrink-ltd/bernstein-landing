import { Nav } from '@/components/landing/Nav';
import { Footer } from '@/components/landing/Footer';

export default function NotFound() {
  return (
    <>
      <Nav />
      <div className="not-found">
        <h1>
          This page is <em>out of tempo</em>.
        </h1>
        <p>
          The orchestrator can&apos;t route to it. Pick a destination below.
        </p>
        <a href="/" className="btn btn-primary">Back to bernstein.run</a>
      </div>
      <Footer />
    </>
  );
}
