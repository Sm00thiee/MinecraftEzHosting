import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Folder,
  File,
  Download,
  Upload,
  Edit,
  Trash2,
  Plus,
  ArrowLeft,
  Search,
  RefreshCw,
  Eye,
  Save,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

interface FileItem {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
  readable: boolean;
  writable?: boolean;
  deletable?: boolean;
}

interface FileBrowserProps {
  serverId: string;
}

export default function FileBrowser({ serverId }: FileBrowserProps) {
  const { session } = useAuth();
  const [currentPath, setCurrentPath] = useState('');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createType, setCreateType] = useState<'file' | 'directory'>('file');
  const [createName, setCreateName] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  // Load files for current directory
  const loadFiles = async (path: string = currentPath) => {
    if (!session?.access_token) return;

    setLoading(true);
    try {
      const response = await fetch(
        `/api/files/${serverId}?directory=${encodeURIComponent(path)}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        }
      );

      if (response.ok) {
        const data = await response.json();
        setFiles(data.data.files || []);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to load files');
      }
    } catch (error) {
      console.error('Error loading files:', error);
      toast.error('Failed to load files');
    } finally {
      setLoading(false);
    }
  };

  // Load file content
  const loadFileContent = async (filePath: string) => {
    if (!session?.access_token) return;

    try {
      const response = await fetch(
        `/api/files/${serverId}/content?path=${encodeURIComponent(filePath)}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        }
      );

      if (response.ok) {
        const data = await response.json();
        setFileContent(data.data.content || '');
        setSelectedFile(filePath);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to load file content');
      }
    } catch (error) {
      console.error('Error loading file content:', error);
      toast.error('Failed to load file content');
    }
  };

  // Save file content
  const saveFileContent = async (filePath: string, content: string) => {
    if (!session?.access_token) return;

    try {
      const response = await fetch(`/api/files/${serverId}/content`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ path: filePath, content }),
      });

      if (response.ok) {
        toast.success('File saved successfully');
        setEditingFile(null);
        await loadFiles();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to save file');
      }
    } catch (error) {
      console.error('Error saving file:', error);
      toast.error('Failed to save file');
    }
  };

  // Delete file or directory
  const deleteItem = async (itemPath: string) => {
    if (!session?.access_token) return;
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
      const response = await fetch(`/api/files/${serverId}/delete`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ path: itemPath }),
      });

      if (response.ok) {
        toast.success('Item deleted successfully');
        await loadFiles();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to delete item');
      }
    } catch (error) {
      console.error('Error deleting item:', error);
      toast.error('Failed to delete item');
    }
  };

  // Create new file or directory
  const createItem = async () => {
    if (!session?.access_token || !createName.trim()) return;

    const itemPath = currentPath
      ? `${currentPath}/${createName.trim()}`
      : createName.trim();

    try {
      if (createType === 'directory') {
        const response = await fetch(`/api/files/${serverId}/directory`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ path: itemPath }),
        });

        if (response.ok) {
          toast.success('Directory created successfully');
          setShowCreateDialog(false);
          setCreateName('');
          await loadFiles();
        } else {
          const error = await response.json();
          toast.error(error.error || 'Failed to create directory');
        }
      } else {
        // Create empty file by saving empty content
        await saveFileContent(itemPath, '');
        setShowCreateDialog(false);
        setCreateName('');
      }
    } catch (error) {
      console.error('Error creating item:', error);
      toast.error('Failed to create item');
    }
  };

  // Upload file
  const handleFileUpload = async () => {
    if (!session?.access_token || !uploadFile) return;

    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('path', currentPath);

    try {
      const response = await fetch(`/api/files/${serverId}/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        credentials: 'include',
        body: formData,
      });

      if (response.ok) {
        toast.success('File uploaded successfully');
        setUploadFile(null);
        await loadFiles();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to upload file');
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error('Failed to upload file');
    }
  };

  // Download file
  const downloadFile = async (filePath: string, fileName: string) => {
    if (!session?.access_token) return;

    try {
      const response = await fetch(
        `/api/files/${serverId}/download?path=${encodeURIComponent(filePath)}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          credentials: 'include',
        }
      );

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to download file');
      }
    } catch (error) {
      console.error('Error downloading file:', error);
      toast.error('Failed to download file');
    }
  };

  // Navigate to directory
  const navigateToDirectory = (dirName: string) => {
    const newPath = currentPath ? `${currentPath}/${dirName}` : dirName;
    setCurrentPath(newPath);
  };

  // Navigate back
  const navigateBack = () => {
    const pathParts = currentPath.split('/').filter(Boolean);
    pathParts.pop();
    setCurrentPath(pathParts.join('/'));
  };

  // Filter files based on search term
  const filteredFiles = files.filter(file =>
    file.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Format file size
  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '-';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  // Format date
  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString();
  };

  // Load files on mount and path change
  useEffect(() => {
    loadFiles();
  }, [currentPath, serverId]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h2 className="text-2xl font-bold">File Manager</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadFiles()}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <div className="flex items-center space-x-2">
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-2" />
                New
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Item</DialogTitle>
                <DialogDescription>
                  Create a new file or directory in the current location.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex space-x-2">
                  <Button
                    variant={createType === 'file' ? 'default' : 'outline'}
                    onClick={() => setCreateType('file')}
                  >
                    File
                  </Button>
                  <Button
                    variant={createType === 'directory' ? 'default' : 'outline'}
                    onClick={() => setCreateType('directory')}
                  >
                    Directory
                  </Button>
                </div>
                <div>
                  <Label htmlFor="create-name">Name</Label>
                  <Input
                    id="create-name"
                    value={createName}
                    onChange={e => setCreateName(e.target.value)}
                    placeholder={`Enter ${createType} name`}
                  />
                </div>
                <div className="flex justify-end space-x-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowCreateDialog(false)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={createItem} disabled={!createName.trim()}>
                    Create
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <div className="flex items-center space-x-2">
            <input
              type="file"
              id="file-upload"
              className="hidden"
              onChange={e => setUploadFile(e.target.files?.[0] || null)}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => document.getElementById('file-upload')?.click()}
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload
            </Button>
            {uploadFile && (
              <Button size="sm" onClick={handleFileUpload}>
                Upload {uploadFile.name}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center space-x-4">
        <Button
          variant="outline"
          size="sm"
          onClick={navigateBack}
          disabled={!currentPath}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="text-sm text-gray-600">
            Path: /{currentPath || 'root'}
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Search className="h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search files..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-64"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* File List */}
        <Card>
          <CardHeader>
            <CardTitle>Files and Directories</CardTitle>
            <CardDescription>Browse and manage server files</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
                <p>Loading files...</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filteredFiles.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">
                    {searchTerm
                      ? 'No files match your search'
                      : 'No files found'}
                  </p>
                ) : (
                  filteredFiles.map(file => (
                    <div
                      key={file.name}
                      className={`flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 cursor-pointer ${
                        selectedFile ===
                        (currentPath
                          ? `${currentPath}/${file.name}`
                          : file.name)
                          ? 'bg-blue-50 border-blue-200'
                          : ''
                      }`}
                      onClick={() => {
                        if (file.type === 'directory') {
                          navigateToDirectory(file.name);
                        } else if (file.readable) {
                          loadFileContent(
                            currentPath
                              ? `${currentPath}/${file.name}`
                              : file.name
                          );
                        }
                      }}
                    >
                      <div className="flex items-center space-x-3">
                        {file.type === 'directory' ? (
                          <Folder className="h-5 w-5 text-blue-500" />
                        ) : (
                          <File className="h-5 w-5 text-gray-500" />
                        )}
                        <div>
                          <div className="font-medium">{file.name}</div>
                          <div className="text-sm text-gray-500">
                            {file.type === 'file' && (
                              <>
                                {formatFileSize(file.size)} •{' '}
                                {formatDate(file.modified)}
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {file.type === 'file' && (
                        <div className="flex items-center space-x-1">
                          {file.readable && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={e => {
                                e.stopPropagation();
                                loadFileContent(
                                  currentPath
                                    ? `${currentPath}/${file.name}`
                                    : file.name
                                );
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={e => {
                              e.stopPropagation();
                              downloadFile(
                                currentPath
                                  ? `${currentPath}/${file.name}`
                                  : file.name,
                                file.name
                              );
                            }}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          {file.deletable && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={e => {
                                e.stopPropagation();
                                deleteItem(
                                  currentPath
                                    ? `${currentPath}/${file.name}`
                                    : file.name
                                );
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* File Content Viewer/Editor */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>File Content</span>
              {selectedFile && (
                <div className="flex items-center space-x-2">
                  {editingFile === selectedFile ? (
                    <>
                      <Button
                        size="sm"
                        onClick={() =>
                          saveFileContent(selectedFile, fileContent)
                        }
                      >
                        <Save className="h-4 w-4 mr-2" />
                        Save
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingFile(null);
                          loadFileContent(selectedFile);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingFile(selectedFile)}
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                  )}
                </div>
              )}
            </CardTitle>
            <CardDescription>
              {selectedFile
                ? `Viewing: ${selectedFile}`
                : 'Select a file to view its content'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedFile ? (
              editingFile === selectedFile ? (
                <Textarea
                  value={fileContent}
                  onChange={e => setFileContent(e.target.value)}
                  className="min-h-96 font-mono text-sm"
                  placeholder="File content..."
                />
              ) : (
                <pre className="bg-gray-50 p-4 rounded-lg overflow-auto max-h-96 text-sm font-mono whitespace-pre-wrap">
                  {fileContent || 'File is empty or could not be loaded'}
                </pre>
              )
            ) : (
              <div className="text-center py-16 text-gray-500">
                <File className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select a file to view its content</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
