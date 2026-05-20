import { forwardRef, type ReactNode, type HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type CardVariant = 'default' | 'outlined' | 'elevated';
type CardPadding = 'none' | 'sm' | 'md' | 'lg';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  children: ReactNode;
  hoverable?: boolean;
  variant?: CardVariant;
  padding?: CardPadding;
}

const variantStyles: Record<CardVariant, string> = {
  default: 'rounded-xl border border-border bg-surface',
  outlined: 'rounded-xl border border-border bg-transparent',
  elevated: 'rounded-xl shadow-lg border-0 bg-surface',
};

const paddingStyles: Record<CardPadding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ title, description, children, hoverable, variant = 'default', padding = 'md', className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          variantStyles[variant],
          paddingStyles[padding],
          hoverable && 'transition-shadow hover:shadow-lg hover:border-primary/30 cursor-pointer',
          className,
        )}
        {...props}
      >
        {(title || description) && (
          <div className="mb-3">
            {title && <h3 className="text-sm font-semibold text-text">{title}</h3>}
            {description && <p className="mt-1 text-xs text-text-muted">{description}</p>}
          </div>
        )}
        {children}
      </div>
    );
  },
);

Card.displayName = 'Card';
