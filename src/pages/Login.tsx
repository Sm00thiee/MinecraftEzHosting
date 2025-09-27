import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Chrome, Server, Shield, Users } from 'lucide-react';

export default function Login() {
  const { user, loading, signInWithGoogle } = useAuth();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/dashboard';

  // If user is already authenticated, redirect to dashboard
  if (user && user.is_allowed) {
    return <Navigate to={from} replace />;
  }

  // If user is authenticated but not allowed, show pending message
  if (user && !user.is_allowed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-3 bg-yellow-100 rounded-full w-fit">
              <Shield className="h-6 w-6 text-yellow-600" />
            </div>
            <CardTitle className="text-xl">Access Pending</CardTitle>
            <CardDescription>
              Your account is pending approval from an administrator
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-gray-600 mb-4">
              Signed in as: {user.email}
            </p>
            <p className="text-sm text-gray-500">
              Please contact your administrator to gain access to the Minecraft
              server management system.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto mb-4 p-3 bg-blue-100 rounded-full w-fit">
            <Server className="h-8 w-8 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">
            MC Server Manager
          </h1>
          <p className="mt-2 text-gray-600">
            Manage your Minecraft servers with ease
          </p>
        </div>

        {/* Login Card */}
        <Card>
          <CardHeader className="text-center">
            <CardTitle>Sign In</CardTitle>
            <CardDescription>
              Use your Google account to access the server management dashboard
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={signInWithGoogle}
              disabled={loading}
              className="w-full"
              size="lg"
            >
              <Chrome className="mr-2 h-4 w-4" />
              {loading ? 'Signing in...' : 'Continue with Google'}
            </Button>

            <div className="text-xs text-gray-500 text-center">
              By signing in, you agree to our terms of service and privacy
              policy.
            </div>
          </CardContent>
        </Card>

        {/* Features */}
        <div className="grid grid-cols-1 gap-4 text-center">
          <div className="space-y-2">
            <h3 className="font-medium text-gray-900">What you can do:</h3>
            <div className="grid grid-cols-3 gap-4 text-sm text-gray-600">
              <div className="flex flex-col items-center space-y-1">
                <Server className="h-4 w-4" />
                <span>Manage Servers</span>
              </div>
              <div className="flex flex-col items-center space-y-1">
                <Shield className="h-4 w-4" />
                <span>Monitor Performance</span>
              </div>
              <div className="flex flex-col items-center space-y-1">
                <Users className="h-4 w-4" />
                <span>View Logs</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
