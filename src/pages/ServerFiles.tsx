import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Server } from 'lucide-react';
import FileBrowser from '@/components/FileBrowser';

export default function ServerFiles() {
  const { serverId } = useParams<{ serverId: string }>();
  const navigate = useNavigate();

  if (!serverId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Invalid Server
          </h2>
          <p className="text-gray-600 mb-4">No server ID provided</p>
          <Button onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                onClick={() => navigate(`/servers/${serverId}`)}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Server
              </Button>
              <div className="flex items-center space-x-2">
                <Server className="h-6 w-6 text-blue-600" />
                <h1 className="text-xl font-semibold">Server Files</h1>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <FileBrowser serverId={serverId} />
      </main>
    </div>
  );
}
