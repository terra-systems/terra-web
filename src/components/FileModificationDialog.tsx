'use client';

import { useState, useEffect } from 'react';

interface FileChange {
  path: string;
  oldContent: string;
  newContent: string;
  description: string;
}

interface Branch {
  name: string;
}

interface FileModificationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  fileChange: FileChange | null;
  repoFullName: string;
  currentBranch: string;
  branches: Branch[];
  onConfirm: (branch: string, createNew: boolean, newBranchName?: string) => Promise<void>;
}

export default function FileModificationDialog({
  isOpen,
  onClose,
  fileChange,
  repoFullName,
  currentBranch,
  branches,
  onConfirm,
}: FileModificationDialogProps) {
  const [selectedBranch, setSelectedBranch] = useState(currentBranch);
  const [createNewBranch, setCreateNewBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedBranch(currentBranch);
      setCreateNewBranch(false);
      setNewBranchName('');
      setError(null);
    }
  }, [isOpen, currentBranch]);

  if (!isOpen || !fileChange) return null;

  const handleConfirm = async () => {
    if (createNewBranch && !newBranchName.trim()) {
      setError('Please enter a branch name');
      return;
    }

    setCommitting(true);
    setError(null);

    try {
      await onConfirm(
        selectedBranch,
        createNewBranch,
        createNewBranch ? newBranchName : undefined
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to commit changes');
    } finally {
      setCommitting(false);
    }
  };

  // Simple diff display
  const renderDiff = () => {
    const oldLines = fileChange.oldContent.split('\n');
    const newLines = fileChange.newContent.split('\n');
    const maxLines = Math.max(oldLines.length, newLines.length);

    return (
      <div className="space-y-1 font-mono text-sm">
        {Array.from({ length: maxLines }).map((_, i) => {
          const oldLine = oldLines[i];
          const newLine = newLines[i];
          const changed = oldLine !== newLine;

          return (
            <div key={i} className="flex gap-2">
              <div className={`flex-1 px-2 py-1 ${changed ? 'bg-red-900/30 text-red-200' : 'bg-gray-800/30 text-gray-400'}`}>
                {oldLine || ' '}
              </div>
              <div className={`flex-1 px-2 py-1 ${changed ? 'bg-green-900/30 text-green-200' : 'bg-gray-800/30 text-gray-400'}`}>
                {newLine || ' '}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="glass-panel max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-white/10">
          <h2 className="text-2xl font-bold text-white mb-2">Confirm Changes</h2>
          <p className="text-gray-300">{fileChange.description}</p>
          <p className="text-sm text-gray-400 mt-1">
            Repository: {repoFullName} • File: {fileChange.path}
          </p>
        </div>

        {/* Diff View */}
        <div className="flex-1 overflow-auto p-6">
          <div className="mb-4">
            <div className="flex gap-4 mb-2">
              <span className="text-sm font-semibold text-red-400">Before</span>
              <span className="text-sm font-semibold text-green-400">After</span>
            </div>
          </div>
          {renderDiff()}
        </div>

        {/* Branch Selection */}
        <div className="p-6 border-t border-white/10 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Choose where to commit
            </label>

            <div className="space-y-3">
              {/* Existing Branch */}
              <label className="flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer transition-colors">
                <input
                  type="radio"
                  checked={!createNewBranch}
                  onChange={() => setCreateNewBranch(false)}
                  className="w-4 h-4"
                />
                <div className="flex-1">
                  <span className="text-white">Commit to existing branch</span>
                  <select
                    value={selectedBranch}
                    onChange={(e) => setSelectedBranch(e.target.value)}
                    disabled={createNewBranch}
                    className="input-field w-full mt-2"
                  >
                    {branches.map((branch) => (
                      <option key={branch.name} value={branch.name}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </div>
              </label>

              {/* New Branch */}
              <label className="flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer transition-colors">
                <input
                  type="radio"
                  checked={createNewBranch}
                  onChange={() => setCreateNewBranch(true)}
                  className="w-4 h-4"
                />
                <div className="flex-1">
                  <span className="text-white">Create new branch</span>
                  <input
                    type="text"
                    value={newBranchName}
                    onChange={(e) => setNewBranchName(e.target.value)}
                    placeholder="feature/update-postgres"
                    disabled={!createNewBranch}
                    className="input-field w-full mt-2"
                  />
                </div>
              </label>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/20 border border-red-500 text-red-400">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <button
              onClick={onClose}
              disabled={committing}
              className="btn-secondary px-6 py-2"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={committing}
              className="btn-primary px-6 py-2 disabled:opacity-50"
            >
              {committing ? 'Committing...' : 'Commit & Push'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
