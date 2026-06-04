import { forwardRef, type SelectHTMLAttributes, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/utils';

// ─── Select ────────────────────────────────────────────────────────────────

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, className, id, children, ...rest }, ref) => {
    const selectId = id ?? rest.name;
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={selectId} className="block text-xs font-medium text-fg-soft mb-1.5">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={cn(
            'w-full h-9 px-3 rounded-md text-sm',
            'bg-bg-soft border border-border text-fg',
            'focus:outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/20',
            'transition-colors',
            'disabled:opacity-50',
            'appearance-none cursor-pointer',
            "bg-[length:14px_14px] bg-[right_0.5rem_center] bg-no-repeat",
            "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23999%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><polyline points=%226 9 12 15 18 9%22/></svg>')]",
            'pr-7',
            error && 'border-danger/60',
            className,
          )}
          {...rest}
        >
          {children}
        </select>
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
        {hint && !error && <p className="mt-1 text-xs text-fg-mute">{hint}</p>}
      </div>
    );
  },
);
Select.displayName = 'Select';

// ─── Toggle ────────────────────────────────────────────────────────────────

interface ToggleProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  size?: 'sm' | 'md';
}

export const Toggle = forwardRef<HTMLButtonElement, ToggleProps>(
  ({ checked, onChange, label, size = 'md', className, ...rest }, ref) => {
    const dims = size === 'sm' ? 'w-7 h-4' : 'w-9 h-5';
    const knob = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';
    const translate = size === 'sm' ? 'translate-x-3' : 'translate-x-4';
    const button = (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex shrink-0 cursor-pointer rounded-full transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-brand/30 focus:ring-offset-1 focus:ring-offset-bg-elev',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          checked ? 'bg-brand' : 'bg-bg-elev border border-border',
          dims,
          className,
        )}
        {...rest}
      >
        <span
          className={cn(
            'pointer-events-none inline-block transform rounded-full bg-white shadow-sm transition-transform',
            'absolute top-0.5 left-0.5',
            knob,
            checked && translate,
          )}
        />
      </button>
    );
    if (!label) return button;
    return (
      <label className="inline-flex items-center gap-2 cursor-pointer">
        {button}
        <span className="text-sm text-fg">{label}</span>
      </label>
    );
  },
);
Toggle.displayName = 'Toggle';
