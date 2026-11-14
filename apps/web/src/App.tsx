import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router';
import { LazyMotion, MotionConfig } from 'motion/react';
import { ThemeProvider } from './lib/theme';
import { ToastProvider } from './ui/Toast';
import { AppStateProvider } from './state/AppStateProvider';
import { AppLayout } from './app-shell/AppLayout';
import Landing from './landing/Landing';
import NotFound from './NotFound';
import { loadGuidedDemo } from './route-loaders';
import { RouteErrorBoundary } from './ui/RouteErrorBoundary';

const GuidedDemoPage = lazy(loadGuidedDemo);
const ReceivePage = lazy(() => import('./features/receive/ReceivePage'));
const SendPage = lazy(() => import('./features/send/SendPage'));
const InboxPage = lazy(() => import('./features/inbox/InboxPage'));
const InvoicePage = lazy(() => import('./features/invoice/InvoicePage'));
const PayrollPage = lazy(() => import('./features/payroll/PayrollPage'));
const DaoPage = lazy(() => import('./features/dao/DaoPage'));
const AuditPage = lazy(() => import('./features/audit/AuditPage'));
const VerifyPage = lazy(() => import('./features/verify/VerifyPage'));
const SettingsPage = lazy(() => import('./features/settings/SettingsPage'));
const PayPage = lazy(() => import('./features/pay/PayPage'));
const KitPage = lazy(() => import('./kit/KitPage'));
const loadMotionFeatures = () => import('./lib/motion-features').then((mod) => mod.default);

export default function App() {
  return (
    <ThemeProvider>
      {/* Honour prefers-reduced-motion for every motion component. */}
      <LazyMotion features={loadMotionFeatures} strict>
        <MotionConfig reducedMotion="user">
          <ToastProvider>
            <AppStateProvider>
              <HashRouter>
                <Routes>
                  <Route path="/" element={<Landing />} />
                  <Route
                    path="/pay"
                    element={
                      <RouteErrorBoundary>
                        <Suspense fallback={null}>
                          <PayPage />
                        </Suspense>
                      </RouteErrorBoundary>
                    }
                  />
                  <Route path="/app" element={<AppLayout />}>
                    <Route index element={<Navigate to="start" replace />} />
                    <Route path="start" element={<GuidedDemoPage />} />
                    <Route path="receive" element={<ReceivePage />} />
                    <Route path="send" element={<SendPage />} />
                    <Route path="inbox" element={<InboxPage />} />
                    <Route path="invoice" element={<InvoicePage />} />
                    <Route path="payroll" element={<PayrollPage />} />
                    <Route path="dao" element={<DaoPage />} />
                    <Route path="audit" element={<AuditPage />} />
                    <Route path="verify" element={<VerifyPage />} />
                    <Route path="settings" element={<SettingsPage />} />
                    <Route path="*" element={<NotFound inApp />} />
                  </Route>
                  <Route
                    path="/kit"
                    element={
                      <RouteErrorBoundary>
                        <Suspense fallback={null}>
                          <KitPage />
                        </Suspense>
                      </RouteErrorBoundary>
                    }
                  />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </HashRouter>
            </AppStateProvider>
          </ToastProvider>
        </MotionConfig>
      </LazyMotion>
    </ThemeProvider>
  );
}
