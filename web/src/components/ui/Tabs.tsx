import { useState, useRef, useCallback, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface Tab {
  key: string;
  label: string;
  icon?: ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  activeKey?: string;
  defaultActiveKey?: string;
  onChange?: (key: string) => void;
  className?: string;
}

export function Tabs({ tabs, activeKey, defaultActiveKey, onChange, className }: TabsProps) {
  const [internalKey, setInternalKey] = useState(defaultActiveKey || tabs[0]?.key || '');
  const currentKey = activeKey ?? internalKey;
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleChange = (key: string) => {
    setInternalKey(key);
    onChange?.(key);
  };

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const enabledTabs = tabs.map((t, i) => ({ ...t, index: i }));
      const currentIndex = enabledTabs.findIndex((t) => t.key === currentKey);
      let nextIndex = currentIndex;

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          nextIndex = (currentIndex + 1) % enabledTabs.length;
          break;
        case 'ArrowLeft':
          e.preventDefault();
          nextIndex = (currentIndex - 1 + enabledTabs.length) % enabledTabs.length;
          break;
        case 'Home':
          e.preventDefault();
          nextIndex = 0;
          break;
        case 'End':
          e.preventDefault();
          nextIndex = enabledTabs.length - 1;
          break;
        default:
          return;
      }

      const nextTab = enabledTabs[nextIndex];
      if (nextTab) {
        handleChange(nextTab.key);
        tabRefs.current[nextTab.index]?.focus();
      }
    },
    [tabs, currentKey],
  );

  return (
    <div className={cn('flex border-b border-border', className)} role="tablist">
      {tabs.map((tab, index) => (
        <button
          key={tab.key}
          ref={(el) => {
            tabRefs.current[index] = el;
          }}
          role="tab"
          aria-selected={currentKey === tab.key}
          tabIndex={currentKey === tab.key ? 0 : -1}
          onClick={() => handleChange(tab.key)}
          onKeyDown={handleKeyDown}
          className={cn(
            'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px',
            'transition-all duration-200',
            currentKey === tab.key
              ? 'border-primary text-primary'
              : 'border-transparent text-text-muted hover:text-text-secondary hover:border-border',
          )}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
