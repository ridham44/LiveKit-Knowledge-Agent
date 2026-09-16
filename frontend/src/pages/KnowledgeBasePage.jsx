import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, FileUp, Trash2 } from 'lucide-react';
import * as api from '../services/api';

export default function KnowledgeBasePage() {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadFiles();
  }, []);

  const loadFiles = async () => {
    try {
      setLoading(true);
      const fileList = await api.files.list();
      setFiles(fileList);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const fileInput = e.target;
    const selectedFile = fileInput.files[0];
    if (!selectedFile) return;

    setUploading(true);
    setError('');

    try {
      const result = await api.files.upload(selectedFile);
      setFiles(prev => [result, ...prev]);
      fileInput.value = '';
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteFile = async (fileId) => {
    try {
      await api.files.delete(fileId);
      setFiles(prev => prev.filter(f => f._id !== fileId));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-4">Upload Documents</h3>
          <label className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-8 text-center hover:border-purple-400 dark:hover:border-purple-500 transition cursor-pointer flex flex-col items-center gap-2 bg-white dark:bg-gray-900">
            <FileUp size={28} className="text-gray-400 dark:text-gray-500" />
            <p className="text-gray-600 dark:text-gray-300">Drag files here or click to browse</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Supported: PDF, DOCX, TXT</p>
            <input
              type="file"
              onChange={handleFileUpload}
              disabled={uploading}
              accept=".pdf,.docx,.doc,.txt"
              className="hidden"
            />
          </label>
          {uploading && <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Uploading...</p>}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-4">Your Documents</h3>
          {loading ? (
            <p className="text-gray-500 dark:text-gray-400">Loading...</p>
          ) : files.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No documents uploaded yet</p>
          ) : (
            <div className="space-y-2">
              {files.map(file => (
                <div
                  key={file._id}
                  className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{file.fileName}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                      {file.status === 'processed' ? (
                        <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                          <CheckCircle2 size={13} /> Processed
                        </span>
                      ) : (
                        <span className="text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                          <Clock size={13} /> {file.status}
                        </span>
                      )}
                      {file.chunkCount > 0 && ` (${file.chunkCount} chunks)`}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteFile(file._id)}
                    className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition shrink-0 ml-3"
                    title="Delete"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
