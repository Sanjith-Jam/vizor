import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ProductNav } from "./components/ProductNav";
import { LandingPage } from "./pages/LandingPage";
import { lazy, Suspense } from "react";
const DashboardPage = lazy(() =>
  import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const PhotoLabPage = lazy(() => import("./pages/PhotoLabPage").then(m => ({ default: m.PhotoLabPage })));
import {
  AuthPage,
  AccountPage,
  DownloadPage,
  PrivacyPage,
} from "./pages/AccountPages";
import { ProtectedRoute } from "./components/ProtectedRoute";
export function App() {
  const location = useLocation();
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <ProductNav />
      <main id="main" key={location.pathname}>
        <Suspense
          fallback={
            <p role="status" className="info-note">
              Loading your map…
            </p>
          }
        >
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/demo" element={<DashboardPage />} />
            <Route path="/lab" element={<ProtectedRoute><PhotoLabPage /></ProtectedRoute>} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/account"
              element={
                <ProtectedRoute>
                  <AccountPage />
                </ProtectedRoute>
              }
            />
            {["/login", "/signup", "/reset-password"].map((p) => (
              <Route key={p} path={p} element={<AuthPage />} />
            ))}
            <Route path="/download" element={<DownloadPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
    </>
  );
}
