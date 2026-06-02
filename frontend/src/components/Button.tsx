import { ButtonHTMLAttributes, ReactNode, forwardRef } from 'react';
import { cn } from '@/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg' | 'icon';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const variantClass: Record<Variant, string> = {
  primary:
    'bg-brand text-brand-fg hover:brightness-110 active:brightness-95 shadow-soft',
  secondary:
    'bg-bg-elev text-fg border border-border hover:border-border-strong hover:bg-bg-soft',
  ghost: 'text-fg-soft hover:text-fg hover:bg-bg-soft',
  danger:
    'bg-danger/10 text-danger border border-danger/20 hover:bg-danger/20',
  outline:
    'bg-transparent text-fg border border-border hover:border-border-strong hover:bg-bg-soft',
};

const sizeClass: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-11 px-5 text-sm gap-2',
  icon: 'h-9 w-9 p-0',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      loading,
      leftIcon,
      rightIcon,
      className,
      children,
      disabled,
      ...rest
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center rounded-md font-medium transition-all duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
          'disabled:opacity-50 disabled:pointer-events-none',
          'select-none',
          variantClass[variant],
          sizeClass[size],
          className,
        )}
        {...rest}
      >
        {loading ? (
          <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
        ) : (
          leftIcon
        )}
        {children}
        {!loading && rightIcon}
      </button>
    );
  },
);
Button.displayName = 'Button';
