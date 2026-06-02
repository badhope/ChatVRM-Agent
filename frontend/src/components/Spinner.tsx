import { HTMLAttributes } from 'react';
import { cn } from '@/utils';

interface SpinnerProps extends HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg';
}

export function Spinner({ size = 'md', className, ...rest }: SpinnerProps) {
  const dim = size === 'sm' ? 'h-3 w-3' : size === 'lg' ? 'h-6 w-6' : 'h-4 w-4';
  return (
    <div
      role="status"
      aria-label="loading"
      className={cn('inline-block', dim, className)}
      {...rest}
    >
      <span className="block h-full w-full rounded-full border-2 border-current border-t-transparent animate-spin opacity-70" />
    </div>
  );
}

export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-md bg-bg-soft animate-pulse',
        className,
      )}
      {...rest}
    />
  );
}
