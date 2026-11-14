import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router';
import { LazyMotion, MotionConfig } from 'motion/react';
import { ThemeProvider } from './lib/theme';
import { ToastProvider } from './ui/Toast';
import { AppLayout } from './app-shell/AppLayout';
import Landing from './landing/Landing';
import NotFound from './NotFound';

const ReceivePage = lazy(() => import('./features/receive/ReceivePage'));
const SendPage = lazy(() => import('./features/send/SendPage'));
const InboxPage = lazy(() => import('./features/inbox/InboxPage'));
const InvoicePage = lazy(() => import('./features/invoice/InvoicePage'));
const PayrollPage = lazy(() => import('./features/payroll/PayrollPage'));
const AuditPage = lazy(() => import('./features/audit/AuditPage'));
const VerifyPage = lazy(() => import('./features/verify/VerifyPage'));
const SettingsPage = lazy(() => import('./features/settings/SettingsPage'));
const KitPage = lazy(() => import('./kit/KitPage'));
const loadMotionFeatures = () => import('./lib/motion-features').then((mod) => mod.default);

export default function App() {
  return (
    <ThemeProvider>
      {/* Honour prefers-reduced-motion for every motion component. */}
      <LazyMotion features={loadMotionFeatures} strict>
      <MotionConfig reducedMotion="user">
        <ToastProvider>
          <HashRouter>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/app" element={<AppLayout />}>
                <Route index element={<Navigate to="receive" replace />} />
                <Route path="receive" element={<ReceivePage />} />
                <Route path="send" element={<SendPage />} />
                <Route path="inbox" element={<InboxPage />} />
                <Route path="invoice" element={<InvoicePage />} />
                <Route path="payroll" element={<PayrollPage />} />
                <Route path="audit" element={<AuditPage />} />
                <Route path="verify" element={<VerifyPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="*" element={<NotFound inApp />} />
              </Route>
              <Route
                path="/kit"
                element={
                  <Suspense fallback={null}>
                    <KitPage />
                  </Suspense>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </HashRouter>
        </ToastProvider>
      </MotionConfig>
      </LazyMotion>
    </ThemeProvider>
  );
}
