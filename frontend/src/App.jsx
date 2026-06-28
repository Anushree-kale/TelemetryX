import { Navigate, Route, Routes } from "react-router-dom";
import AuthGuard from "./components/AuthGuard";
import AppShell from "./AppShell";
import AuthPage from "./pages/AuthPage";
import HomePage from "./pages/HomePage";
import OAuthCallback from "./pages/OAuthCallback";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/signup" element={<AuthPage mode="signup" />} />
      <Route path="/auth/callback" element={<OAuthCallback />} />
      <Route
        path="/app/*"
        element={
          <AuthGuard>
            <AppShell />
          </AuthGuard>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
