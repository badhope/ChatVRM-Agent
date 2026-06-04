import { Modal } from './Modal';
import { Button } from './Button';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: string;
  details?: string;
  confirmLabel: string;
  cancelLabel: string;
  variant?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Accessible, stylable replacement for the native `window.confirm()`.
 * We deliberately do NOT block the event loop, so the UI stays responsive
 * and the dialog is testable with Playwright.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  details,
  confirmLabel,
  cancelLabel,
  variant = 'danger',
  loading,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} size="sm" title={title}>
      <div className="flex gap-3">
        {variant === 'danger' && (
          <div className="shrink-0 h-9 w-9 rounded-full bg-danger/10 text-danger flex items-center justify-center">
            <AlertTriangle size={18} />
          </div>
        )}
        <div className="flex-1 min-w-0 space-y-1.5">
          {message && <p className="text-sm text-fg">{message}</p>}
          {details && <p className="text-xs text-fg-soft">{details}</p>}
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" size="md" onClick={onCancel} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button
          variant={variant === 'danger' ? 'danger' : 'primary'}
          size="md"
          onClick={onConfirm}
          loading={loading}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
