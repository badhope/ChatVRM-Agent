import { useEffect, useRef, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  const titleId = title ? 'modal-title' : undefined;

  // Body scroll lock
  useEffect(() => {
    if (!open) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  // Escape key handler
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Focus trap
  useEffect(() => {
    if (!open) return;

    previousActiveElement.current = document.activeElement as HTMLElement;

    // Focus the modal container on open
    const timer = requestAnimationFrame(() => {
      modalRef.current?.focus();
    });

    return () => {
      cancelAnimationFrame(timer);
      // Restore focus on close
      previousActiveElement.current?.focus();
    };
  }, [open]);

  // Focus trap: keep focus within modal
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Tab' || !modalRef.current) return;

      const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    },
    [],
  );

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop with fade-in */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-[fadeIn_150ms_ease-out]"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Modal content with fade-in + scale */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={cn(
          'relative z-10 w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-2xl',
          'animate-[modalIn_200ms_ease-out]',
          className,
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          {title && (
            <h2 id={titleId} className="text-lg font-semibold text-text">
              {title}
            </h2>
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-text-muted hover:bg-bg-tertiary hover:text-text transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
      {/* Inline keyframes for animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>,
    document.body,
  );
}
