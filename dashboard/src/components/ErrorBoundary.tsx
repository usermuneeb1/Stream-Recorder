// Full-screen fallback when React throws — the lantern gutters, but the
// archive survives. Shows the error plainly and offers a way back.

import React from 'react';

interface State { error: Error | null }

export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center gap-5 px-6 text-center" style={{ background: 'var(--ink-0)' }}>
        <div className="w-3 h-3 rounded-full" style={{ background: 'var(--flame-1)', boxShadow: '0 0 24px 8px var(--flame-glow)' }} />
        <h1 className="display text-3xl font-medium" style={{ color: 'var(--ivory)' }}>The lantern flickered</h1>
        <p className="text-sm max-w-md" style={{ color: 'var(--mist)' }}>
          Something in the page stopped working. The archive itself is safe — reload to relight.
        </p>
        <pre className="mono text-[11px] max-w-lg overflow-auto text-left p-4 rounded-lg" style={{ background: 'var(--ink-1)', border: '1px solid var(--line)', color: 'var(--ember)' }}>
          {this.state.error.name}: {this.state.error.message}
        </pre>
        <button
          className="btn btn-flame"
          onClick={() => { window.location.hash = ''; window.location.reload(); }}
        >
          Back to the archive
        </button>
      </div>
    );
  }
}
