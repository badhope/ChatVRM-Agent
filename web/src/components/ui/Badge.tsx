import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';
type BadgeSize = 'sm' | 'md';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-bg-tertiary text-text-secondary',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  error: 'bg-error/15 text-error',
  info: 'bg-info/15 text-info',
};

const dotColors: Record<BadgeVariant, string> = {
  default: 'bg-text-muted',
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-error',
  info: 'bg-info',
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'px-1.5 py-0 text-[10px]',
  md: 'px-2 py-0.5 text-xs',
};

export function Badge({ variant = 'default', size = 'md', dot, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium',
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      {...props}
    >
      {dot && (
        <span className={cn('mr-1 inline-block h-1.5 w-1.5 rounded-full', dotColors[variant])} />
      )}
      {children}
    </span>
  );
}
