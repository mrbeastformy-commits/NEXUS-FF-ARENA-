import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error?.message || 'An unexpected error occurred.' };
  }

  componentDidCatch(error: Error) {
    console.error('Application ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      let displayMessage = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message) as { error?: string; operationType?: string; path?: string };
        if (parsed.error) {
          displayMessage = `${parsed.error}${parsed.path ? ` (${parsed.operationType} on ${parsed.path})` : ''}`;
        }
      } catch {
        // Keep raw message
      }

      return (
        <div className="min-h-screen bg-[#06070A] text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full nexus-card rounded-2xl p-6 space-y-4 border border-[#FF1E38]/40">
            <div className="flex items-center gap-3 text-[#FF1E38]">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h2 className="font-display text-2xl font-bold tracking-wide uppercase">System Notice</h2>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed break-words">{displayMessage}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF1E38] hover:bg-[#E11D48] text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reload Application</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
