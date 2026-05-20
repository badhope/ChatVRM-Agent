import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './Button';

interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 py-12 px-4 text-center',
        className,
      )}
      role="status"
    >
      {icon ?? <Inbox className="h-10 w-10 text-text-muted" aria-hidden="true" />}
      <h3 className="text-sm font-medium text-text">{title}</h3>
      {description && (
        <p className="max-w-sm text-xs text-text-secondary">{description}</p>
      )}
      {action && (
        <Button variant="secondary" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
