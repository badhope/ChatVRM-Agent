import { useState, useRef, useCallback, useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface TooltipProps {
  content: string;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

const sideStyles = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
};

const SHOW_DELAY = 150;

export function Tooltip({ content, children, side = 'top', className }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useId();

  const handleMouseEnter = useCallback(() => {
    timerRef.current = setTimeout(() => {
      setVisible(true);
    }, SHOW_DELAY);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(false);
  }, []);

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div aria-describedby={visible ? tooltipId : undefined}>
        {children}
      </div>
      <div
        id={tooltipId}
        role="tooltip"
        className={cn(
          'absolute z-50 whitespace-nowrap rounded-md bg-bg-tertiary px-2.5 py-1.5 text-xs text-text shadow-lg',
          'pointer-events-none',
          'transition-all duration-150',
          visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 scale-95 pointer-events-none',
          sideStyles[side],
          className,
        )}
      >
        {content}
      </div>
    </div>
  );
}
