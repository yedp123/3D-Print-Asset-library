import React, { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileItem } from '../types/models';
import { FolderOpen, FileText, ChevronRight, Layers } from 'lucide-react';

interface FormatBadgeProps {
  label: string;
  files: FileItem[];
  modelFolderPath: string;
  onRevealPath?: (path: string) => void;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export const FormatBadge: React.FC<FormatBadgeProps> = ({
  label,
  files,
  modelFolderPath,
  onRevealPath,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const count = files.length;
  const isDisabled = count === 0;

  // Close popover when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  const handleReveal = async (targetPath: string) => {
    try {
      console.log(`[DEBUG][UI] Revealing format item in Explorer: ${targetPath}`);
      await invoke('reveal_in_explorer', { targetPath });
      if (onRevealPath) onRevealPath(targetPath);
    } catch (err) {
      console.error('[DEBUG][UI] Failed to reveal path:', err);
    }
  };

  const handleBadgeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDisabled) return;

    if (count === 1) {
      handleReveal(files[0].full_path);
    } else {
      setIsOpen(!isOpen);
    }
  };

  // Derive format folder: check directory of the first file or fallback to modelFolderPath
  const getFormatFolder = (): string => {
    if (files.length > 0) {
      const firstPath = files[0].full_path;
      const lastSlash = Math.max(firstPath.lastIndexOf('/'), firstPath.lastIndexOf('\\'));
      if (lastSlash > 0) {
        return firstPath.substring(0, lastSlash);
      }
    }
    return modelFolderPath;
  };

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        type="button"
        onClick={handleBadgeClick}
        disabled={isDisabled}
        className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold transition-all duration-150 flex items-center gap-1 select-none ${
          isDisabled
            ? 'bg-[#16181C] text-gray-600 border border-[#23272E] cursor-not-allowed opacity-50'
            : isOpen
            ? 'bg-[#00AE42] text-white border border-[#00AE42] shadow-sm ring-1 ring-[#00AE42]/40'
            : 'bg-[#18261F] text-[#00AE42] border border-[#00AE42]/40 hover:bg-[#00AE42]/20 hover:border-[#00AE42] active:scale-95 cursor-pointer'
        }`}
        title={
          isDisabled
            ? `No ${label} files available`
            : count === 1
            ? `1 ${label} file — Click to reveal in Windows Explorer`
            : `${count} ${label} files — Click to view file list`
        }
      >
        <span>{label}</span>
        {count > 1 && (
          <span className="text-[10px] opacity-90 font-normal">({count})</span>
        )}
      </button>

      {/* Multi-File Popover */}
      {isOpen && count > 1 && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-full left-0 mb-2 w-64 bg-[#181B20] border border-[#2C323B] rounded-lg shadow-2xl z-50 overflow-hidden py-1.5 text-xs animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Popover Header */}
          <div className="px-3 py-1.5 border-b border-[#2C323B] flex items-center justify-between text-gray-400">
            <span className="font-semibold text-gray-200 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[#00AE42]" />
              {label} Files ({count})
            </span>
            <span className="text-[10px] text-gray-500">Explorer Select</span>
          </div>

          {/* Action: Open Format Folder */}
          <button
            type="button"
            onClick={() => {
              handleReveal(getFormatFolder());
              setIsOpen(false);
            }}
            className="w-full px-3 py-2 text-left hover:bg-[#22272E] flex items-center justify-between text-gray-300 hover:text-white transition-colors border-b border-[#2C323B]/60"
            title="Open folder containing these files"
          >
            <div className="flex items-center gap-2">
              <FolderOpen className="w-3.5 h-3.5 text-[#00AE42]" />
              <span className="font-medium">Open Format Folder</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
          </button>

          {/* File items list */}
          <div className="max-h-48 overflow-y-auto py-1 divide-y divide-[#2C323B]/30">
            {files.map((file, idx) => (
              <button
                key={`${file.full_path}-${idx}`}
                type="button"
                onClick={() => {
                  handleReveal(file.full_path);
                  setIsOpen(false);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-[#22272E] flex items-center justify-between group transition-colors"
                title={`Reveal "${file.name}" in Explorer`}
              >
                <div className="flex items-center gap-2 min-w-0 mr-2">
                  <FileText className="w-3.5 h-3.5 text-gray-500 group-hover:text-[#00AE42] shrink-0" />
                  <span className="truncate text-gray-300 group-hover:text-white">
                    {file.name}
                  </span>
                </div>
                <span className="text-[10px] text-gray-500 shrink-0 font-mono">
                  {formatBytes(file.size_bytes)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
