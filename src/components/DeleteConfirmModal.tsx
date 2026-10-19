import React, { useState, useEffect, useRef } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { ModelEntry } from '../types/models';
import { Trash2, X, AlertTriangle, RefreshCw, Box, Folder } from 'lucide-react';

interface DeleteConfirmModalProps {
  model: ModelEntry;
  isOpen: boolean;
  onClose: () => void;
  onDeleted: (modelId: string) => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  model,
  isOpen,
  onClose,
  onDeleted,
}) => {
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setConfirmText('');
      setError(null);
      setIsDeleting(false);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDeleting, onClose]);

  if (!isOpen) return null;

  const isConfirmed = confirmText.trim().toLowerCase() === 'yes';

  const totalFiles =
    model.formats.threemf.length +
    model.formats.stp.length +
    model.formats.stl.length +
    model.formats.obj.length;

  const thumbnailSrc =
    model.preview_images && model.preview_images.length > 0
      ? convertFileSrc(model.preview_images[0])
      : null;

  const handleDelete = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isConfirmed || isDeleting) return;

    try {
      setIsDeleting(true);
      setError(null);
      console.log(`[DEBUG][UI] Invoking delete_model for: ${model.folder_path}`);
      await invoke('delete_model', {
        modelFolderPath: model.folder_path,
      });
      console.log(`[DEBUG][UI] Successfully deleted model folder: ${model.folder_path}`);
      onDeleted(model.id);
      onClose();
    } catch (err: unknown) {
      const errStr = String(err);
      console.error('[DEBUG][UI] Delete failed:', errStr);
      setError(errStr);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      onClick={() => {
        if (!isDeleting) onClose();
      }}
      className="fixed inset-0 bg-black/85 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#181B20] border border-rose-500/40 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden text-gray-100 flex flex-col"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#2C323B] flex items-center justify-between bg-[#14161A]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-500/15 border border-rose-500/40 flex items-center justify-center text-rose-400">
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Delete Model & Files</h3>
              <p className="text-[11px] text-gray-400">Permanent removal from drive</p>
            </div>
          </div>
          <button
            onClick={() => {
              if (!isDeleting) onClose();
            }}
            disabled={isDeleting}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#20252D] transition-colors disabled:opacity-40"
            title="Cancel (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleDelete} className="p-5 flex flex-col gap-4">
          {/* Target Model Preview */}
          <div className="p-3 bg-[#121417] border border-[#2C323B] rounded-xl flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-[#181B20] border border-[#2C323B] overflow-hidden shrink-0 flex items-center justify-center">
              {thumbnailSrc ? (
                <img
                  src={thumbnailSrc}
                  alt={model.name}
                  className="w-full h-full object-contain p-1"
                />
              ) : (
                <Box className="w-5 h-5 text-gray-600" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-xs font-semibold text-white truncate" title={model.name}>
                {model.name}
              </h4>
              <p className="text-[10px] text-gray-400 font-mono truncate mt-0.5" title={model.folder_path}>
                {model.folder_path}
              </p>
              <p className="text-[10px] text-gray-500 flex items-center gap-1 mt-0.5">
                <Folder className="w-2.5 h-2.5 text-gray-500 shrink-0" />
                <span>{totalFiles} 3D model {totalFiles === 1 ? 'file' : 'files'}</span>
              </p>
            </div>
          </div>

          {/* Warning Banner */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs leading-relaxed">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <div>
              <span className="font-semibold text-rose-300 block mb-0.5">Warning: Irreversible Action</span>
              Deleting this will delete the actual files and folder completely from your storage drive. This cannot be undone.
            </div>
          </div>

          {/* Typing confirmation */}
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1.5">
              To proceed, please type <span className="font-bold text-rose-400 font-mono">yes</span> below:
            </label>
            <input
              ref={inputRef}
              type="text"
              value={confirmText}
              onChange={(e) => {
                setConfirmText(e.target.value);
                if (error) setError(null);
              }}
              placeholder='Type "yes" to confirm...'
              disabled={isDeleting}
              className="w-full px-3 py-2 bg-[#14161A] border border-[#2C323B] focus:border-rose-500 focus:ring-1 focus:ring-rose-500/40 rounded-lg text-sm text-white placeholder-gray-500 font-mono transition-all outline-none"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-400 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#2C323B]/50">
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-[#1E2228] hover:bg-[#252B33] text-gray-300 border border-[#2C323B] transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isConfirmed || isDeleting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
            >
              {isDeleting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Deleting Files...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Completely</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
