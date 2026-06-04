import { ReactNode } from 'react';
import { cn } from '@/utils';

export interface Tab {
  id: string;
  label: ReactNode;
  badge?: ReactNode;
  count?: number;
}

interface TabsProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
  /** Optional content rendered in the right side of the tab bar */
  right?: ReactNode;
}

export function Tabs({ tabs, active, onChange, className, right }: TabsProps) {
  return (
    <div className={cn('flex items-center justify-between gap-3 border-b border-border', className)}>
      <div className="flex items-center gap-0.5 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={cn(
                'relative px-3.5 h-9 text-xs font-medium transition-colors flex items-center gap-1.5',
                isActive
                  ? 'text-brand'
                  : 'text-fg-soft hover:text-fg',
              )}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className="text-[10px] text-fg-mute font-mono">{tab.count}</span>
              )}
              {tab.badge}
              {isActive && (
                <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-brand rounded-t" />
              )}
            </button>
          );
        })}
      </div>
      {right && <div className="flex items-center gap-2 pr-1">{right}</div>}
    </div>
  );
}
