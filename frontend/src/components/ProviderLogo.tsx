import { cn } from '@/utils';
import type { ProviderType } from '@/types';
import { providerColor } from '@/utils';

interface ProviderLogoProps {
  provider: ProviderType;
  name: string;
  className?: string;
  showInitial?: boolean;
}

/**
 * Provider logo — renders the colored block with the provider initial.
 * Sized to the parent's h/w via className.
 */
export function ProviderLogo({ provider, name, className, showInitial = true }: ProviderLogoProps) {
  const initial = (name?.trim()?.[0] ?? provider[0] ?? '?').toUpperCase();
  return (
    <div
      className={cn(
        'flex items-center justify-center text-white text-sm font-semibold shrink-0 select-none',
        className,
      )}
      style={{ backgroundColor: providerColor(provider) }}
      aria-label={name}
    >
      {showInitial && initial}
    </div>
  );
}
