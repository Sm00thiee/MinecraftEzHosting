import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

export default function Home() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // If user is authenticated and allowed, redirect to dashboard
  if (user && user.is_allowed) {
    return <Navigate to="/dashboard" replace />;
  }

  // If user is authenticated but not allowed, redirect to login (which will show pending message)
  if (user && !user.is_allowed) {
    return <Navigate to="/login" replace />;
  }

  // If not authenticated, redirect to login
  return <Navigate to="/login" replace />;
}
