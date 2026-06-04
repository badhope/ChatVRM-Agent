import { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils';

type Variant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'muted';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
  children: ReactNode;
}

const variantClass: Record<Variant, string> = {
  default: 'bg-bg-soft text-fg-soft border-border',
  success: 'bg-success/12 text-success border-success/25',
  warning: 'bg-warning/12 text-warning border-warning/25',
  danger: 'bg-danger/12 text-danger border-danger/25',
  info: 'bg-info/12 text-info border-info/25',
  brand: 'bg-brand/12 text-brand border-brand/25',
  muted: 'bg-bg-soft text-fg-mute border-border',
};

export function Badge({ variant = 'default', size = 'sm', className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-medium',
        size === 'sm' ? 'h-5 px-2 text-[10.5px]' : 'h-6 px-2.5 text-xs',
        variantClass[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

export function Dot({ variant = 'default', pulse }: { variant?: Variant; pulse?: boolean }) {
  const dotColor: Record<Variant, string> = {
    default: 'bg-fg-mute',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    info: 'bg-info',
    brand: 'bg-brand',
    muted: 'bg-fg-mute/40',
  };
  return (
    <span className="relative inline-flex h-2 w-2">
      {pulse && (
        <span
          className={cn(
            'absolute inset-0 rounded-full opacity-60 animate-ping',
            dotColor[variant],
          )}
        />
      )}
      <span className={cn('relative inline-flex rounded-full h-2 w-2', dotColor[variant])} />
    </span>
  );
}
