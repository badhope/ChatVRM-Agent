import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover shadow-sm',
  secondary: 'bg-surface text-text border border-border hover:bg-bg-tertiary',
  ghost: 'text-text-secondary hover:text-text hover:bg-surface',
  danger: 'bg-error text-white hover:bg-error/80 shadow-sm',
  outline: 'border border-primary text-primary hover:bg-primary/10',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1.5 text-xs rounded-md gap-1',
  md: 'px-3.5 py-2 text-sm rounded-lg gap-1.5',
  lg: 'px-5 py-2.5 text-base rounded-lg gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          variantStyles[variant],
          sizeStyles[size],
          className,
        )}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? <Spinner size="sm" /> : icon}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
