import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Toast, ToastContainer } from 'react-bootstrap';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((variant, message) => {
    const id = Math.random();
    setToasts((t) => [...t, { id, variant, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const value = useMemo(
    () => ({ success: (m) => push('success', m), error: (m) => push('danger', m), info: (m) => push('primary', m) }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer position="top-end" className="p-3" style={{ zIndex: 2000, position: 'fixed' }}>
        {toasts.map((t) => (
          <Toast key={t.id} bg={t.variant} onClose={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
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

export const useToast = () => useContext(ToastContext);
