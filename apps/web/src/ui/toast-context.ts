import { createContext, useContext } from 'react';

export type ToastTone = 'neutral' | 'success' | 'danger';

export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** ms; 0 keeps it until dismissed. Default 4200. */
  duration?: number;
}

export interface ToastApi {
  show: (t: ToastInput) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
