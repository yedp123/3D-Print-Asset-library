import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ModelEntry } from '../types/models';
import { FolderEdit, X, Check, AlertCircle, RefreshCw } from 'lucide-react';

interface RenameModelModalProps {
  model: ModelEntry;
  isOpen: boolean;
  onClose: () => void;
  onRenamed: (updatedModel: ModelEntry, oldId: string) => void;
}

export const RenameModelModal: React.FC<RenameModelModalProps> = ({
  model,
  isOpen,
  onClose,
  onRenamed,
}) => {
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setNewName(model.name);
      setError(null);
      // Auto-focus and select text
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
    }
  }, [isOpen, model.name]);

  if (!isOpen) return null;

  const validate = (name: string): string | null => {
    const trimmed = name.trim();
    if (!trimmed) {
      return 'Folder name cannot be empty';
    }
    if (trimmed === model.name) {
      return 'New name is identical to the current folder name';
    }
    const invalidChars = /[\\/:*?"<>|]/;
    if (invalidChars.test(trimmed)) {
      return 'Folder name cannot contain: \\ / : * ? " < > |';
    }
    return null;
  };

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate(newName);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setRenaming(true);
      setError(null);
      const trimmed = newName.trim();
      console.log(`[DEBUG][Rename] Invoking rename_model_folder for: ${model.folder_path} -> ${trimmed}`);

      const updated = await invoke<ModelEntry>('rename_model_folder', {
        modelFolderPath: model.folder_path,
        newName: trimmed,
      });

      console.log(`[DEBUG][Rename] Rename successful:`, updated.name, updated.folder_path);
      onRenamed(updated, model.id);
      onClose();
    } catch (err: unknown) {
      const errStr = String(err);
      console.error('[DEBUG][Rename] Rename failed:', errStr);
      setError(errStr);
    } finally {
      setRenaming(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#181B20] border border-[#2C323B] rounded-2xl shadow-2xl max-w-md w-full overflow-hidden text-gray-100 flex flex-col"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#2C323B] flex items-center justify-between bg-[#14161A]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#1E2228] border border-[#2C323B] flex items-center justify-center text-[#00AE42]">
              <FolderEdit className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Rename Model Folder</h3>
              <p className="text-[11px] text-gray-400">Renames physical directory on disk</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#20252D] transition-colors"
            title="Cancel (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleRename} className="p-5 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1.5">
              Current Folder Name
            </label>
            <div className="px-3 py-2 bg-[#121417] border border-[#2C323B] rounded-lg text-xs font-mono text-gray-400 truncate select-all">
              {model.name}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1.5">
              New Folder Name
            </label>
            <input
              ref={inputRef}
              type="text"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Enter new model folder name..."
              className="w-full px-3 py-2 bg-[#14161A] border border-[#2C323B] rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#00AE42] focus:ring-1 focus:ring-[#00AE42]/40 font-mono transition-all"
              disabled={renaming}
            />
            <p className="text-[10px] text-gray-500 mt-1">
              Valid characters: letters, numbers, spaces, underscores, dashes
            </p>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#2C323B]/50">
            <button
              type="button"
              onClick={onClose}
              disabled={renaming}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-[#1E2228] hover:bg-[#252B33] text-gray-300 border border-[#2C323B] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={renaming || !newName.trim() || newName.trim() === model.name}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-[#00AE42] hover:bg-[#009638] text-white shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {renaming ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Renaming...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Rename Folder</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
