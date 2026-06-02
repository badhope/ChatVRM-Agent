import { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  elevated?: boolean;
  bordered?: boolean;
}

export function Card({ className, children, elevated, bordered = true, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl bg-bg-elev',
        bordered && 'border border-border',
        elevated && 'shadow-elev',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('px-5 py-4 border-b border-border flex items-center justify-between', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardBody({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-5 py-4', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('px-5 py-3 border-t border-border text-fg-mute text-xs', className)}
      {...rest}
    >
      {children}
    </div>
  );
}
