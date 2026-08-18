// 404 — a dark reel.

import { Link } from './Nav';

export default function NotFound() {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center gap-6 px-6 text-center relative">
      <div
        className="display italic select-none leading-none"
        style={{ fontSize: 'clamp(110px, 22vw, 190px)', fontWeight: 300, color: 'transparent', WebkitTextStroke: '2px var(--flame-30)' }}
        aria-hidden="true"
      >
        404
      </div>
      <h1 className="display text-2xl font-medium -mt-8">This reel doesn't exist</h1>
      <p className="text-mist text-sm max-w-sm">
        The recording you're looking for was never captured, or its link has burned out.
      </p>
      <Link href="#/" className="btn btn-flame">← Back to the archive</Link>
    </div>
  );
}
