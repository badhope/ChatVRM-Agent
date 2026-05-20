import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export const Skeleton = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('animate-shimmer rounded-md', className)}
      aria-hidden="true"
      {...props}
    />
  ),
);
Skeleton.displayName = 'Skeleton';

interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            'h-4 rounded',
            i === lines - 1 && 'w-3/4',
          )}
        />
      ))}
    </div>
  );
}

interface SkeletonCardProps {
  className?: string;
}

export function SkeletonCard({ className }: SkeletonCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-bg-secondary p-4 space-y-3',
        className,
      )}
      aria-hidden="true"
    >
      <Skeleton className="h-40 w-full rounded-md" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}
