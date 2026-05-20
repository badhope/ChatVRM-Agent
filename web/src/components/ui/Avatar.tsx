import { useState } from 'react';
import { cn } from '@/lib/cn';

type AvatarSize = 'sm' | 'md' | 'lg';
type AvatarStatus = 'online' | 'offline' | 'busy';

interface AvatarProps {
  src?: string;
  alt?: string;
  size?: AvatarSize;
  fallback?: string;
  status?: AvatarStatus;
  className?: string;
}

const sizeStyles: Record<AvatarSize, string> = {
  sm: 'h-7 w-7 text-xs',
  md: 'h-9 w-9 text-sm',
  lg: 'h-12 w-12 text-base',
};

const statusColors: Record<AvatarStatus, string> = {
  online: 'bg-success',
  offline: 'bg-text-muted',
  busy: 'bg-error',
};

const statusSizeStyles: Record<AvatarSize, string> = {
  sm: 'h-1.5 w-1.5 ring-1',
  md: 'h-2 w-2 ring-1.5',
  lg: 'h-2.5 w-2.5 ring-2',
};

export function Avatar({ src, alt, size = 'md', fallback, status, className }: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const showImage = src && !imgError;

  const initials = fallback
    ? fallback.slice(0, 2).toUpperCase()
    : (alt || 'U').slice(0, 2).toUpperCase();

  return (
    <div className={cn('relative inline-flex', className)}>
      {showImage ? (
        <img
          src={src}
          alt={alt || 'Avatar'}
          onError={() => setImgError(true)}
          className={cn('rounded-full object-cover', sizeStyles[size])}
        />
      ) : (
        <div
          className={cn(
            'flex items-center justify-center rounded-full bg-primary/20 text-primary font-medium',
            sizeStyles[size],
          )}
          role="img"
          aria-label={alt || 'Avatar'}
        >
          {initials}
        </div>
      )}
      {status && (
        <span
          className={cn(
            'absolute bottom-0 right-0 rounded-full ring-surface',
            statusColors[status],
            statusSizeStyles[size],
          )}
          aria-label={status}
        />
      )}
    </div>
  );
}
