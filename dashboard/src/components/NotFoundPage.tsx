export function NotFoundPage({ onHome }: { onHome: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
      <div className="text-center max-w-md">
        <p className="font-mono text-[120px] sm:text-[160px] leading-none font-bold opacity-10" style={{ color: 'var(--red)' }}>404</p>
        <h1 className="font-display text-2xl sm:text-3xl font-bold mt-2 mb-3">Stream not found</h1>
        <p className="text-[14px] leading-relaxed" style={{ color: 'var(--tx2)' }}>
          That recording doesn't exist, has been removed, or the link is broken.
          Go back to the archive and pick another one.
        </p>
        <button onClick={onHome} className="btn btn-primary mt-6">← Back to all recordings</button>
      </div>
    </div>
  );
}
