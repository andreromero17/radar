import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Toast, ToastContainer } from 'react-bootstrap';

type Variant = 'success' | 'danger' | 'primary';
interface ToastItem {
  id: number;
  variant: Variant;
  message: string;
}
interface ToastApi {
  success(message: string): void;
  error(message: string): void;
  info(message: string): void;
}

const ToastContext = createContext<ToastApi | null>(null);
let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (variant: Variant, message: string) => {
      const id = ++seq;
      setToasts((t) => [...t, { id, variant, message }]);
      setTimeout(() => remove(id), 3500);
    },
    [remove],
  );

  const value = useMemo<ToastApi>(
    () => ({ success: (m) => push('success', m), error: (m) => push('danger', m), info: (m) => push('primary', m) }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer position="top-end" className="p-3" style={{ zIndex: 2000, position: 'fixed' }}>
        {toasts.map((t) => (
          <Toast key={t.id} bg={t.variant} onClose={() => remove(t.id)}>
            <Toast.Body className="text-white fw-semibold d-flex align-items-center gap-2">
              <i className={`bi ${t.variant === 'danger' ? 'bi-x-circle' : 'bi-check-circle'}`} />
              {t.message}
            </Toast.Body>
          </Toast>
        ))}
      </ToastContainer>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast precisa estar dentro de <ToastProvider>');
  return ctx;
}
