import { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeClass = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export function Modal({ open, onClose, title, children, className, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        className={cn(
          'relative w-full bg-bg-elev border border-border rounded-xl shadow-elev',
          'max-h-[90vh] flex flex-col animate-slide-up',
          sizeClass[size],
          className,
        )}
        role="dialog"
        aria-modal="true"
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <h3 className="text-sm font-semibold">{title}</h3>
            <button
              onClick={onClose}
              className="text-fg-mute hover:text-fg transition-colors p-1 -m-1 rounded"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-auto p-5">{children}</div>
      </div>
    </div>
  );
}
