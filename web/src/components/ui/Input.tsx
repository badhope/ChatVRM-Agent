import { type InputHTMLAttributes, forwardRef, useState, useCallback } from 'react';
import { cn } from '@/lib/cn';
import { X } from 'lucide-react';

type InputSize = 'sm' | 'md';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix' | 'size'> {
  label?: string;
  error?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  size?: InputSize;
  clearable?: boolean;
}

const sizeStyles: Record<InputSize, string> = {
  sm: 'py-1.5 text-xs',
  md: 'py-2 text-sm',
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, prefix, suffix, size = 'md', clearable, className, id, value, onChange, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    const [internalValue, setInternalValue] = useState<string>(String(value ?? ''));
    const isControlled = value !== undefined;
    const currentValue = isControlled ? String(value) : internalValue;

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!isControlled) {
          setInternalValue(e.target.value);
        }
        onChange?.(e);
      },
      [isControlled, onChange],
    );

    const handleClear = useCallback(() => {
      if (!isControlled) {
        setInternalValue('');
      }
      // Trigger a synthetic change event for controlled usage
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      const inputEl = (ref as React.RefObject<HTMLInputElement>).current;
      if (nativeInputValueSetter && inputEl) {
        nativeInputValueSetter.call(inputEl, '');
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
      onChange?.({ target: { value: '' } } as React.ChangeEvent<HTMLInputElement>);
    }, [isControlled, onChange, ref]);

    const showClear = clearable && currentValue.length > 0;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-text-secondary">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {prefix && (
            <span className="absolute left-3 text-text-muted">{prefix}</span>
          )}
          <input
            ref={ref}
            id={inputId}
            value={currentValue}
            onChange={handleChange}
            className={cn(
              'w-full rounded-lg border bg-surface px-3 text-text',
              'placeholder:text-text-muted',
              'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary',
              'transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              sizeStyles[size],
              error ? 'border-error' : 'border-border',
              prefix && 'pl-10',
              (suffix || showClear) && 'pr-10',
              className,
            )}
            aria-invalid={!!error}
            aria-describedby={error ? `${inputId}-error` : undefined}
            {...props}
          />
          {showClear ? (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-3 text-text-muted hover:text-text transition-colors"
              aria-label="Clear input"
              tabIndex={-1}
            >
              <X size={14} />
            </button>
          ) : suffix ? (
            <span className="absolute right-3 text-text-muted">{suffix}</span>
          ) : null}
        </div>
        {error && (
          <p id={`${inputId}-error`} className="text-xs text-error" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';
