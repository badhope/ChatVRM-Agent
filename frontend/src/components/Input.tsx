import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, ...rest }, ref) => {
    const inputId = id ?? rest.name;
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-medium text-fg-soft mb-1.5">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full h-9 px-3 rounded-md text-sm',
            'bg-bg-soft border border-border text-fg',
            'placeholder:text-fg-mute',
            'focus:outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/20',
            'transition-colors',
            'disabled:opacity-50',
            error && 'border-danger/60',
            className,
          )}
          {...rest}
        />
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
        {hint && !error && <p className="mt-1 text-xs text-fg-mute">{hint}</p>}
      </div>
    );
  },
);
Input.displayName = 'Input';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, className, id, ...rest }, ref) => {
    const inputId = id ?? rest.name;
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-medium text-fg-soft mb-1.5">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          className={cn(
            'w-full px-3 py-2.5 rounded-md text-sm resize-none',
            'bg-bg-soft border border-border text-fg',
            'placeholder:text-fg-mute',
            'focus:outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/20',
            'transition-colors',
            'disabled:opacity-50',
            error && 'border-danger/60',
            className,
          )}
          {...rest}
        />
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
        {hint && !error && <p className="mt-1 text-xs text-fg-mute">{hint}</p>}
      </div>
    );
  },
);
Textarea.displayName = 'Textarea';
