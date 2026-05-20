import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from './Button';
import { cn } from '@/lib/cn';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
    this.props.onError?.(error, info);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          className={cn(
            'flex flex-col items-center justify-center gap-4 p-8',
            'min-h-[200px] rounded-lg bg-bg-secondary border border-border',
          )}
          role="alert"
          aria-live="assertive"
        >
          <AlertTriangle className="h-10 w-10 text-warning" aria-hidden="true" />
          <div className="text-center">
            <h3 className="text-sm font-medium text-text">Something went wrong</h3>
            <p className="mt-1 text-xs text-text-muted max-w-md">
              {this.state.error?.message ?? 'An unexpected error occurred.'}
            </p>
          </div>
          <Button variant="secondary" size="sm" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={this.handleRetry}>
            Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
