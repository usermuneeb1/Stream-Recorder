import React from 'react';
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react';
import { Link } from 'react-router-dom';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message || 'Unexpected application error' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Archive UI crashed:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-50 dark:bg-[#09090b] px-4 text-dark-900 dark:text-white">
        <div className="relative max-w-lg w-full overflow-hidden rounded-[2rem] border border-white/20 dark:border-white/10 bg-white/80 dark:bg-dark-900/80 p-8 text-center shadow-2xl backdrop-blur-2xl">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-500 via-orange-500 to-yellow-400" />
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-500 ring-1 ring-brand-500/20">
            <AlertTriangle size={34} />
          </div>
          <h1 className="text-2xl font-black font-display mb-2">Something went wrong</h1>
          <p className="text-dark-500 dark:text-dark-400 text-sm leading-relaxed mb-6">
            The archive interface hit an unexpected issue. Your recordings are safe — refresh the page or return home.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button onClick={() => window.location.reload()} className="btn-primary">
              <RefreshCcw size={16} /> Refresh
            </button>
            <Link to="/" className="btn-secondary">
              <Home size={16} /> Home
            </Link>
          </div>
          <details className="mt-6 text-left text-xs text-dark-400">
            <summary className="cursor-pointer text-center">Technical details</summary>
            <pre className="mt-3 max-h-32 overflow-auto rounded-xl bg-dark-100 dark:bg-dark-950 p-3 whitespace-pre-wrap">
              {this.state.message}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
