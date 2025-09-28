import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import {
  Loader2,
  Users,
  Shield,
  Activity,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react';

interface User {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  is_allowed: boolean;
  role: 'admin' | 'user';
  created_at: string;
  last_sign_in_at: string | null;
}

interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, string | number | boolean> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  user?: {
    email: string;
    full_name: string | null;
  };
}

const AdminPanel: React.FC = () => {
  const { user, session } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'users' | 'audit'>('users');

  useEffect(() => {
    if (user?.role === 'admin' && session?.access_token) {
      fetchUsers();
      fetchAuditLogs();
    }
  }, [user, session, fetchUsers, fetchAuditLogs]);

  const fetchUsers = useCallback(async () => {
    try {
      if (!session?.access_token) {
        toast.error('No authentication token available');
        return;
      }

      const response = await fetch('/api/admin/users', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      } else {
        toast.error('Failed to fetch users');
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Error fetching users');
    }
  }, [session?.access_token]);

  const fetchAuditLogs = useCallback(async () => {
    try {
      if (!session?.access_token) {
        toast.error('No authentication token available');
        return;
      }

      const response = await fetch('/api/admin/audit-logs', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setAuditLogs(data);
      } else {
        toast.error('Failed to fetch audit logs');
      }
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      toast.error('Error fetching audit logs');
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  const updateUserPermissions = async (
    userId: string,
    updates: { is_allowed?: boolean; role?: string }
  ) => {
    try {
      if (!session?.access_token) {
        toast.error('No authentication token available');
        return;
      }

      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(updates),
      });

      if (response.ok) {
        toast.success('User permissions updated');
        fetchUsers();
      } else {
        const error = await response.json();
        toast.error(error.message || 'Failed to update user permissions');
      }
    } catch (error) {
      console.error('Error updating user permissions:', error);
      toast.error('Error updating user permissions');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getActionIcon = (action: string) => {
    switch (action.toLowerCase()) {
      case 'login':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'logout':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'server_start':
      case 'server_stop':
      case 'server_restart':
        return <Activity className="h-4 w-4 text-blue-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  if (user?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Access Denied
            </CardTitle>
            <CardDescription>
              You don't have admin privileges to access this page.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Admin Panel</h1>
          <p className="text-gray-600 mt-2">
            Manage users and monitor system activity
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('users')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'users'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Users className="h-4 w-4 inline mr-2" />
                User Management
              </button>
              <button
                onClick={() => setActiveTab('audit')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'audit'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Activity className="h-4 w-4 inline mr-2" />
                Audit Logs
              </button>
            </nav>
          </div>
        </div>

        {/* Users Tab */}
        {activeTab === 'users' && (
          <Card>
            <CardHeader>
              <CardTitle>User Management</CardTitle>
              <CardDescription>
                Manage user permissions and access levels
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Role
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Last Sign In
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {users.map(u => (
                      <tr key={u.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            {u.avatar_url && (
                              <img
                                className="h-10 w-10 rounded-full mr-4"
                                src={u.avatar_url}
                                alt={u.full_name || u.email}
                              />
                            )}
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                {u.full_name || 'No name'}
                              </div>
                              <div className="text-sm text-gray-500">
                                {u.email}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              u.is_allowed
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {u.is_allowed ? 'Allowed' : 'Pending'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              u.role === 'admin'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {u.role === 'admin' ? 'Admin' : 'User'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {u.last_sign_in_at
                            ? formatDate(u.last_sign_in_at)
                            : 'Never'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                          {!u.is_allowed && (
                            <Button
                              size="sm"
                              onClick={() =>
                                updateUserPermissions(u.id, {
                                  is_allowed: true,
                                })
                              }
                            >
                              Approve
                            </Button>
                          )}
                          {u.is_allowed && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() =>
                                updateUserPermissions(u.id, {
                                  is_allowed: false,
                                })
                              }
                            >
                              Revoke
                            </Button>
                          )}
                          {u.role !== 'admin' && u.id !== user.id && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                updateUserPermissions(u.id, { role: 'admin' })
                              }
                            >
                              Make Admin
                            </Button>
                          )}
                          {u.role === 'admin' && u.id !== user.id && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                updateUserPermissions(u.id, { role: 'user' })
                              }
                            >
                              Remove Admin
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Audit Logs Tab */}
        {activeTab === 'audit' && (
          <Card>
            <CardHeader>
              <CardTitle>Audit Logs</CardTitle>
              <CardDescription>
                Monitor system activity and user actions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {auditLogs.map(log => (
                  <div key={log.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        {getActionIcon(log.action)}
                        <div>
                          <div className="font-medium text-sm">
                            {log.user?.full_name ||
                              log.user?.email ||
                              'Unknown User'}
                          </div>
                          <div className="text-sm text-gray-500">
                            {log.action.replace('_', ' ').toUpperCase()} -{' '}
                            {log.resource_type}
                            {log.resource_id && ` (${log.resource_id})`}
                          </div>
                          {log.details && (
                            <div className="text-xs text-gray-400 mt-1">
                              {JSON.stringify(log.details)}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatDate(log.created_at)}
                      </div>
                    </div>
                    {log.ip_address && (
                      <div className="text-xs text-gray-400 mt-2">
                        IP: {log.ip_address}
                      </div>
                    )}
                  </div>
                ))}
                {auditLogs.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No audit logs found
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
