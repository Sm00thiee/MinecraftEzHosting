import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import Login from '@/pages/Login';
import AuthCallback from '@/pages/AuthCallback';
import Dashboard from '@/pages/Dashboard';
import AdminPanel from '@/pages/AdminPanel';
import Home from '@/pages/Home';
import ServerDetails from '@/pages/ServerDetails';
import ServerMetrics from '@/pages/ServerMetrics';
import ServerFiles from '@/pages/ServerFiles';
import PrometheusMonitoring from '@/pages/PrometheusMonitoring';

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* Protected routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/servers/:serverId"
            element={
              <ProtectedRoute>
                <ServerDetails />
              </ProtectedRoute>
            }
          />
          <Route
            path="/servers/:serverId/metrics"
            element={
              <ProtectedRoute>
                <ServerMetrics />
              </ProtectedRoute>
            }
          />
          <Route
            path="/servers/:serverId/files"
            element={
              <ProtectedRoute>
                <ServerFiles />
              </ProtectedRoute>
            }
          />
          <Route
            path="/prometheus"
            element={
              <ProtectedRoute>
                <PrometheusMonitoring />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute requireAdmin>
                <AdminPanel />
              </ProtectedRoute>
            }
          />

          {/* Redirect unknown routes to dashboard */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>

        {/* Toast notifications */}
        <Toaster position="top-right" richColors closeButton duration={4000} />
      </Router>
    </AuthProvider>
  );
}
