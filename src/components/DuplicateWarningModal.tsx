import React from 'react';
import { ModelEntry } from '../types/models';
import { convertFileSrc } from '@tauri-apps/api/core';
import { AlertTriangle, FolderOpen, Copy, X, FileCode, RefreshCw } from 'lucide-react';

interface DuplicateWarningModalProps {
  isOpen: boolean;
  existingModel: ModelEntry;
  conflictingFiles: string[];
  pendingFilePaths: string[];
  onOpenExisting: (model: ModelEntry) => void;
  onConfirmCreateAnyway: (paths: string[]) => void;
  onUpdateExisting?: (model: ModelEntry, paths: string[]) => void;
  onCancel: () => void;
}

export const DuplicateWarningModal: React.FC<DuplicateWarningModalProps> = ({
  isOpen,
  existingModel,
  conflictingFiles,
  pendingFilePaths,
  onOpenExisting,
  onConfirmCreateAnyway,
  onUpdateExisting,
  onCancel,
}) => {
  if (!isOpen) return null;

  const thumbnailSrc =
    existingModel.preview_images && existingModel.preview_images.length > 0
      ? convertFileSrc(existingModel.preview_images[0])
      : null;

  return (
    <div
      onClick={onCancel}
      className="fixed inset-0 bg-black/85 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#181B20] border border-amber-500/40 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden text-gray-100 flex flex-col"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#2C323B] flex items-center justify-between bg-[#14161A]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Potential Duplicate Detected</h3>
              <p className="text-[11px] text-gray-400">These assets may already be cataloged</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#20252D] transition-colors"
            title="Cancel (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col gap-4">
          <p className="text-xs text-gray-300 leading-relaxed">
            One or more dropped files match an existing model in your library. Would you like to update the current entry by replacing the old files with the new ones, create a new separate entry, or inspect the existing model?
          </p>

          {/* Existing Model Card Snippet */}
          <div className="p-3 bg-[#121417] border border-[#2C323B] rounded-xl flex items-center gap-3">
            <div className="w-14 h-14 rounded-lg bg-[#181B20] border border-[#2C323B] overflow-hidden shrink-0 flex items-center justify-center">
              {thumbnailSrc ? (
                <img
                  src={thumbnailSrc}
                  alt={existingModel.name}
                  className="w-full h-full object-contain p-1"
                />
              ) : (
                <FileCode className="w-6 h-6 text-gray-600" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Existing Model
                </span>
                <span className="text-xs font-semibold text-white truncate">
                  {existingModel.name}
                </span>
              </div>
              <p className="text-[10px] text-gray-400 font-mono truncate mt-0.5" title={existingModel.folder_path}>
                {existingModel.folder_path}
              </p>
            </div>
          </div>

          {/* Conflicting Files List */}
          {conflictingFiles.length > 0 && (
            <div>
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">
                Matching Files ({conflictingFiles.length})
              </span>
              <div className="max-h-28 overflow-y-auto bg-[#14161A] border border-[#2C323B] rounded-lg p-2 space-y-1 text-xs font-mono text-amber-200/90">
                {conflictingFiles.map((fn, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 truncate">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                    <span className="truncate">{fn}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-[#2C323B]/50 flex-wrap">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-2 rounded-lg text-xs font-medium bg-[#1E2228] hover:bg-[#252B33] text-gray-400 hover:text-gray-200 border border-[#2C323B] transition-colors order-4 sm:order-1"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onOpenExisting(existingModel)}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[#1E2228] hover:bg-[#2A313C] text-gray-300 border border-[#2C323B] transition-colors order-3 sm:order-2"
              title="Open and inspect the existing model"
            >
              <FolderOpen className="w-3.5 h-3.5 text-gray-400" />
              <span>View Existing Model</span>
            </button>
            <button
              type="button"
              onClick={() => onConfirmCreateAnyway(pendingFilePaths)}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[#1E2228] hover:bg-[#2A313C] text-gray-200 border border-[#2C323B] transition-colors order-2 sm:order-3"
              title="Create new folder with collision avoidance suffix"
            >
              <Copy className="w-3.5 h-3.5 text-gray-400" />
              <span>Create New Entry</span>
            </button>
            {onUpdateExisting && (
              <button
                type="button"
                onClick={() => onUpdateExisting(existingModel, pendingFilePaths)}
                className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-[#00AE42] hover:bg-[#009638] text-white shadow-md transition-all order-1 sm:order-4"
                title="Replace old files with the new ones and update this library entry"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Update Current Entry</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
