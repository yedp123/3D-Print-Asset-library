import React, { useState, useEffect, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ModelEntry, FileItem, TagDefinition } from '../types/models';
import { ImageCarousel } from './ImageCarousel';
import { formatBytes } from './FormatBadge';
import { EditSpecsModal } from './EditSpecsModal';
import { RenameModelModal } from './RenameModelModal';
import { 
  resolve3mfForImage, 
  getFilamentsForImage, 
  formatFilamentLabel,
  formatPrintTime,
  calculateCost,
  formatBedType,
  getModelStatus,
  isModelVip,
  getDisplayTags,
  getMetricsForImage
} from '../utils/modelUtils';
import { getTagIconComponent } from '../utils/tagIcons';
import { 
  X, 
  FolderOpen, 
  ExternalLink, 
  Play, 
  Copy, 
  Check, 
  Layers, 
  FileText, 
  Sparkles, 
  PackageCheck, 
  Eye, 
  Clock, 
  Scale, 
  AlertTriangle, 
  Plus, 
  Tag as TagIcon,
  Pencil,
  FolderEdit,
  Trash2
} from 'lucide-react';
import { DeleteConfirmModal } from './DeleteConfirmModal';

interface ModelDetailModalProps {
  model: ModelEntry | null;
  initialIndex?: number;
  onIndexChange?: (newIndex: number) => void;
  onClose: () => void;
  availableTags?: TagDefinition[];
  defaultCostPerKg?: number;
  currencySymbol?: string;
  onUpdateTags?: (modelId: string, newTags: string[]) => void;
  onModelUpdated?: (updatedModel: ModelEntry, oldId?: string) => void;
  onModelDeleted?: (modelId: string) => void;
}

export const ModelDetailModal: React.FC<ModelDetailModalProps> = ({
  model,
  initialIndex = 0,
  onIndexChange,
  onClose,
  availableTags = [],
  defaultCostPerKg = 85.0,
  currencySymbol = '¥',
  onUpdateTags,
  onModelUpdated,
  onModelDeleted,
}) => {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [copiedSpec, setCopiedSpec] = useState<boolean>(false);
  const [activeImageIndex, setActiveImageIndex] = useState(initialIndex);
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [isEditingSpecs, setIsEditingSpecs] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const tagMenuRef = useRef<HTMLDivElement>(null);
  const statusMenuRef = useRef<HTMLDivElement>(null);

  // Sync image index when opened model or initialIndex changes
  useEffect(() => {
    setActiveImageIndex(initialIndex);
  }, [model?.id, initialIndex]);

  const handleImageIndexChange = (newIndex: number) => {
    setActiveImageIndex(newIndex);
    if (onIndexChange) {
      onIndexChange(newIndex);
    }
  };

  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Close tag menu & status menu on outside click
  useEffect(() => {
    if (!showTagMenu && !showStatusMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (tagMenuRef.current && !tagMenuRef.current.contains(e.target as Node)) {
        setShowTagMenu(false);
      }
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) {
        setShowStatusMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showTagMenu, showStatusMenu]);

  const activeImagePath = model?.preview_images[activeImageIndex];

  // Resolve which 3MF corresponds to currently viewed thumbnail
  const active3mfName = useMemo(() => {
    if (!model) return null;
    return resolve3mfForImage(activeImagePath, activeImageIndex, model);
  }, [activeImagePath, activeImageIndex, model]);

  // Resolve specific filaments for the viewed file
  const activeFilaments = useMemo(() => {
    if (!model) return [];
    return getFilamentsForImage(activeImagePath, activeImageIndex, model);
  }, [activeImagePath, activeImageIndex, model]);

  // Auto-scroll the active 3MF into view in the right-hand list
  useEffect(() => {
    if (active3mfName) {
      const el = document.getElementById(`3mf-item-${encodeURIComponent(active3mfName)}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [active3mfName]);

  // Jump gallery to the thumbnail for a clicked 3MF file
  const handleJumpTo3mf = (filename: string) => {
    if (!model) return;
    for (let i = 0; i < model.preview_images.length; i++) {
      const resolved = resolve3mfForImage(model.preview_images[i], i, model);
      if (resolved && resolved.toLowerCase() === filename.toLowerCase()) {
        handleImageIndexChange(i);
        break;
      }
    }
  };

  const handleToggleTag = async (tagId: string) => {
    if (!model) return;
    try {
      console.log(`[DEBUG][Tags] Modal toggling tag '${tagId}' for: ${model.folder_path}`);
      const updatedTags = await invoke<string[]>('toggle_model_tag', {
        modelFolderPath: model.folder_path,
        tagId,
      });
      console.log(`[DEBUG][Tags] Modal updated tags:`, updatedTags);
      if (onUpdateTags) {
        onUpdateTags(model.id, updatedTags);
      }
    } catch (err) {
      console.error('[DEBUG][Tags] Modal failed to toggle tag:', err);
    }
  };

  const handleSetStatus = async (status: string) => {
    if (!model) return;
    setShowStatusMenu(false);
    try {
      console.log(`[DEBUG][Status] Modal setting status '${status}' for: ${model.folder_path}`);
      const updatedTags = await invoke<string[]>('set_model_status', {
        modelFolderPath: model.folder_path,
        status,
      });
      console.log(`[DEBUG][Status] Modal updated tags:`, updatedTags);
      if (onUpdateTags) {
        onUpdateTags(model.id, updatedTags);
      }
    } catch (err) {
      console.error('[DEBUG][Status] Modal failed to set status:', err);
    }
  };

  // Production metadata calculations resolved per active 3MF
  const currentMetrics = useMemo(() => {
    if (!model) {
      return {
        printTimeSec: null,
        totalGrams: null,
        nozzleMm: null,
        bedType: null,
        active3mfName: null,
        isSpecific3mf: false,
      };
    }
    return getMetricsForImage(activeImagePath, activeImageIndex, model);
  }, [activeImagePath, activeImageIndex, model]);

  const nozzleMm = currentMetrics.nozzleMm;
  const isNozzleWarning = Boolean(nozzleMm && nozzleMm.trim() !== '0.4');
  const bedType = currentMetrics.bedType || model?.bed_type;

  const printTimeStr = useMemo(() => {
    return formatPrintTime(currentMetrics.printTimeSec);
  }, [currentMetrics.printTimeSec]);

  const totalGrams = currentMetrics.totalGrams;

  const estimatedCost = useMemo(() => {
    return calculateCost(totalGrams, defaultCostPerKg);
  }, [totalGrams, defaultCostPerKg]);

  const modelStatus = useMemo(() => getModelStatus(model?.tags), [model?.tags]);
  const isVip = useMemo(() => isModelVip(model?.tags), [model?.tags]);
  const displayTags = useMemo(() => getDisplayTags(model?.tags), [model?.tags]);

  if (!model) return null;

  const handleReveal = async (targetPath: string) => {
    try {
      console.log(`[DEBUG][UI] Revealing in Explorer: ${targetPath}`);
      await invoke('reveal_in_explorer', { targetPath });
    } catch (err) {
      console.error('[DEBUG][UI] Failed to reveal in explorer:', err);
    }
  };

  const handleLaunchBambuStudio = async (filePath: string) => {
    try {
      console.log(`[DEBUG][UI] Launching in Bambu Studio: ${filePath}`);
      await invoke('launch_in_bambu_studio', { filePath });
    } catch (err) {
      console.error('[DEBUG][UI] Failed to launch Bambu Studio:', err);
    }
  };

  const handleCopySku = (code: string) => {
    if (!code || code === 'Custom') return;
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => {
      setCopiedCode((curr) => (curr === code ? null : curr));
    }, 2000);
  };

  const handleCopySpecSheet = () => {
    if (!model) return;
    const na = (v: any) => (v !== undefined && v !== null && v !== '' ? v : 'N/A');
    const filamentLines = model.filaments.map((f) =>
      `  - Slot ${f.slot_id + 1}: [${f.official_name}] SKU: ${f.bambu_code || 'Custom'} (${f.material_type}, Hex: ${f.hex}) — ${f.used_grams !== undefined && f.used_grams !== null ? `${f.used_grams.toFixed(1)}g` : 'N/A'}`
    ).join('\n');

    const ticketText = [
      `📦 MODEL SPEC SHEET: ${model.name}`,
      `${'—'.repeat(50)}`,
      `⏱ Print Time: ${na(printTimeStr !== '--' ? printTimeStr : null)}`,
      `⚖ Total Weight: ${totalGrams ? `${totalGrams.toFixed(1)}g` : 'N/A'}${estimatedCost ? ` (~${currencySymbol}${estimatedCost.toFixed(2)})` : ''}`,
      `🔧 Nozzle: ${na(nozzleMm ? `${nozzleMm}mm` : null)} | 🛏 Bed: ${na(formatBedType(bedType))}`,
      `📁 Formats: 3MF (${model.formats.threemf.length}), STP (${model.formats.stp.length}), STL (${model.formats.stl.length}), OBJ (${model.formats.obj.length})`,
      ``,
      `🎨 FILAMENT SPECIFICATIONS:`,
      model.filaments.length > 0 ? filamentLines : '  No filament data available',
      `${'—'.repeat(50)}`,
      `📂 Path: ${model.folder_path}`,
    ].join('\n');

    navigator.clipboard
      .writeText(ticketText)
      .then(() => {
        setCopiedSpec(true);
        console.log(`[DEBUG][UI] Spec sheet copied to clipboard for: ${model.name}`);
        setTimeout(() => setCopiedSpec(false), 2500);
      })
      .catch((err) => {
        console.error('[DEBUG][UI] Clipboard write failed:', err);
      });
  };

  const formatGroups: { label: string; files: FileItem[]; is3mf?: boolean }[] = [
    { label: '3MF Files', files: model.formats.threemf, is3mf: true },
    { label: 'STP / STEP Files', files: model.formats.stp },
    { label: 'STL Meshes', files: model.formats.stl },
    { label: 'OBJ Models', files: model.formats.obj },
  ];

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#181B20] border border-[#2C323B] rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden text-gray-100"
      >
        {/* Modal Header */}
        <div className="px-6 py-3.5 border-b border-[#2C323B] flex items-center justify-between bg-[#14161A] shrink-0">
          <div className="min-w-0 mr-4">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-semibold tracking-wider px-2 py-0.5 rounded bg-[#00AE42]/20 text-[#00AE42] border border-[#00AE42]/30">
                Model Inspector
              </span>
              <h2 className="text-lg font-bold text-white truncate" title={model.name}>
                {model.name}
              </h2>
              <button
                type="button"
                onClick={() => setIsRenaming(true)}
                className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-[#20252D] border border-[#2C323B] transition-colors"
                title="Rename model folder on disk"
              >
                <FolderEdit className="w-3.5 h-3.5 text-[#00AE42]" />
              </button>
            </div>
            <p className="text-xs text-gray-400 font-mono truncate mt-0.5" title={model.folder_path}>
              {model.folder_path}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* One-Click Copy Spec Sheet */}
            <button
              onClick={handleCopySpecSheet}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                copiedSpec
                  ? 'bg-[#00AE42] text-white border-[#00AE42]'
                  : 'bg-[#1E2228] hover:bg-[#252B33] text-gray-200 border-[#2C323B]'
              }`}
              title="Copy production spec sheet to clipboard"
            >
              {copiedSpec ? (
                <>
                  <Check className="w-4 h-4" />
                  <span className="hidden sm:inline">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-gray-400" />
                  <span className="hidden sm:inline">Copy Spec</span>
                </>
              )}
            </button>

            <button
              onClick={() => handleReveal(model.folder_path)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1E2228] hover:bg-[#252B33] text-gray-200 border border-[#2C323B] text-xs font-medium transition-colors"
              title="Open model directory in Windows Explorer"
            >
              <FolderOpen className="w-4 h-4 text-[#00AE42]" />
              <span className="hidden sm:inline">Open Folder</span>
            </button>
            <button
              onClick={() => setIsDeleting(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1E2228] hover:bg-rose-500/20 text-gray-300 hover:text-rose-300 border border-[#2C323B] hover:border-rose-500/40 text-xs font-medium transition-colors"
              title="Delete model and files completely from library"
            >
              <Trash2 className="w-4 h-4 text-rose-400" />
              <span className="hidden sm:inline">Delete</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-[#1E2228] hover:bg-[#252B33] text-gray-400 hover:text-white border border-[#2C323B] transition-colors"
              title="Close modal (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Phase 6 Production & Tags Strip */}
        <div className="px-6 py-2.5 bg-[#121417] border-b border-[#2C323B] flex items-center justify-between gap-3 flex-wrap">
          {/* Active Tags with + Tag Button */}
          <div className="flex items-center gap-1.5 flex-wrap" ref={tagMenuRef}>
            <span className="text-xs text-gray-400 font-medium mr-1 flex items-center gap-1">
              <TagIcon className="w-3.5 h-3.5 text-[#00AE42]" />
              Tags:
            </span>

            {displayTags.map((tagId) => {
              const def = availableTags.find((t) => t.id.toLowerCase() === tagId.toLowerCase());
              const Icon = getTagIconComponent(def?.icon);
              return (
                <span
                  key={tagId}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-[#181B20] border border-[#2C323B] text-gray-200 shadow-sm"
                  style={def?.color ? { borderColor: `${def.color}50` } : undefined}
                >
                  <Icon
                    className="w-3 h-3 shrink-0"
                    style={{ color: def?.color || '#00AE42' }}
                  />
                  <span>{def?.label || tagId}</span>
                </span>
              );
            })}

            {/* + Tag Popover */}
            <div className="relative inline-block">
              <button
                type="button"
                onClick={() => {
                  setShowTagMenu(!showTagMenu);
                  setShowStatusMenu(false);
                }}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-[#181B20] hover:bg-[#252B33] text-gray-300 hover:text-white border border-[#2C323B] hover:border-gray-500 transition-colors"
                title="Add or remove tags for this model"
              >
                <Plus className="w-3 h-3 text-[#00AE42]" />
                <span>Tag</span>
              </button>

              {showTagMenu && (
                <div className="absolute left-0 top-full mt-1.5 w-52 bg-[#181B20] border border-[#2C323B] rounded-xl shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="text-[10px] uppercase font-semibold text-gray-400 px-2 py-1 flex items-center gap-1 border-b border-[#2C323B] mb-1">
                    <TagIcon className="w-3 h-3 text-[#00AE42]" />
                    <span>Model Tags</span>
                  </div>
                  <div className="max-h-56 overflow-y-auto space-y-0.5">
                    {availableTags.map((tag) => {
                      const isTagActive = displayTags.some(
                        (t: string) => t.toLowerCase() === tag.id.toLowerCase()
                      );
                      const Icon = getTagIconComponent(tag.icon);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => handleToggleTag(tag.id)}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                            isTagActive
                              ? 'bg-[#1E2620] text-white font-medium'
                              : 'hover:bg-[#22272E] text-gray-300'
                          }`}
                        >
                          <span className="flex items-center gap-2 truncate">
                            <Icon
                              className="w-3.5 h-3.5 shrink-0"
                              style={{ color: tag.color || '#00AE42' }}
                            />
                            <span className="truncate">{tag.label}</span>
                          </span>
                          {isTagActive && (
                            <Check className="w-3.5 h-3.5 text-[#00AE42] shrink-0 ml-1" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Production Badges */}
          <div className="flex items-center gap-2 flex-wrap text-xs font-mono">
            {/* QA Status & VIP Dropdown */}
            <div className="relative inline-flex items-center gap-1.5" ref={statusMenuRef}>
              {/* VIP Star Toggle */}
              <button
                type="button"
                onClick={() => handleSetStatus('vip')}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border transition-colors ${
                  isVip
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold'
                    : 'bg-[#181B20] text-gray-400 hover:text-gray-200 border-[#2C323B]'
                }`}
                title="Click to toggle VIP priority"
              >
                <span>⭐ {isVip ? 'VIP' : 'Mark VIP'}</span>
              </button>

              {/* Status Pill */}
              <button
                type="button"
                onClick={() => {
                  setShowStatusMenu(!showStatusMenu);
                  setShowTagMenu(false);
                }}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border transition-colors ${
                  modelStatus === 'approved'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 font-bold'
                    : modelStatus === 'needs_fix'
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 font-bold'
                    : 'bg-[#181B20] text-gray-400 hover:text-gray-200 border-[#2C323B]'
                }`}
                title="Click to change QA status"
              >
                {modelStatus === 'approved' ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span>Approved</span>
                  </>
                ) : modelStatus === 'needs_fix' ? (
                  <>
                    <AlertTriangle className="w-3 h-3 text-rose-400" />
                    <span>Needs Fix</span>
                  </>
                ) : (
                  <span>+ Set Status</span>
                )}
              </button>

              {/* Status Popover */}
              {showStatusMenu && (
                <div className="absolute left-0 top-full mt-1.5 w-44 bg-[#181B20] border border-[#2C323B] rounded-xl shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="text-[10px] uppercase font-semibold text-gray-400 px-2 py-1 border-b border-[#2C323B] mb-1">
                    QA Status
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSetStatus('approved')}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                      modelStatus === 'approved'
                        ? 'bg-emerald-500/20 text-emerald-300 font-semibold'
                        : 'text-gray-300 hover:bg-[#20252D] hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-400" /> Approved
                    </span>
                    {modelStatus === 'approved' && <Check className="w-3 h-3 text-emerald-400" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetStatus('needs_fix')}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                      modelStatus === 'needs_fix'
                        ? 'bg-rose-500/20 text-rose-300 font-semibold'
                        : 'text-gray-300 hover:bg-[#20252D] hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400" /> Needs Fix
                    </span>
                    {modelStatus === 'needs_fix' && <Check className="w-3 h-3 text-rose-400" />}
                  </button>
                  {modelStatus && (
                    <button
                      type="button"
                      onClick={() => handleSetStatus('none')}
                      className="w-full text-left px-2.5 py-1 rounded-lg text-[11px] text-gray-400 hover:bg-[#20252D] hover:text-gray-200"
                    >
                      Clear QA Status
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Active 3MF Context Badge */}
            {model.formats.threemf.length > 1 && (
              <span
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#14161A] border border-[#00AE42]/40 text-emerald-400 font-mono text-xs shadow-xs"
                title={`Currently active plate / profile: ${currentMetrics.active3mfName || 'All combined'}`}
              >
                <span>📄 {currentMetrics.active3mfName ? currentMetrics.active3mfName : 'All Combined'}</span>
                <span className="text-[10px] text-gray-500 font-sans">({currentMetrics.isSpecific3mf ? 'Plate' : 'Total'})</span>
              </span>
            )}

            {/* Nozzle Badge */}
            {nozzleMm && (
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border ${
                  isNozzleWarning
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold animate-pulse'
                    : 'bg-[#181B20] text-gray-300 border-[#2C323B]'
                }`}
                title={
                  isNozzleWarning
                    ? `Warning: Sliced for non-standard ${nozzleMm}mm nozzle diameter!`
                    : `Nozzle diameter: ${nozzleMm}mm`
                }
              >
                {isNozzleWarning && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                <span>{nozzleMm}mm Nozzle</span>
              </span>
            )}

            {/* Bed Type */}
            {bedType && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#181B20] border border-[#2C323B] text-gray-300"
                title={`Target Build Plate: ${bedType}`}
              >
                <span>{formatBedType(bedType)}</span>
              </span>
            )}

            {/* Print Time */}
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#181B20] border border-[#2C323B] text-gray-300"
              title={printTimeStr !== '--' ? `Estimated print time: ${printTimeStr}` : 'Print duration not calculated'}
            >
              <Clock className="w-3.5 h-3.5 text-[#00AE42]" />
              <span>Time: {printTimeStr}</span>
            </span>

            {/* Total Weight */}
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#181B20] border border-[#2C323B] text-gray-300"
              title={totalGrams ? `Total filament weight: ${totalGrams.toFixed(1)}g` : 'Weight not calculated'}
            >
              <Scale className="w-3.5 h-3.5 text-blue-400" />
              <span>Weight: {totalGrams ? `${totalGrams.toFixed(1)}g` : '--'}</span>
            </span>

            {/* Cost */}
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#181B20] border border-[#2C323B] font-semibold ${
                estimatedCost ? 'text-emerald-400' : 'text-gray-500'
              }`}
              title={
                estimatedCost
                  ? `Estimated material cost: ${currencySymbol}${estimatedCost.toFixed(2)}`
                  : 'File not yet sliced in Bambu Studio'
              }
            >
              <span>Cost: {estimatedCost ? `${currencySymbol}${estimatedCost.toFixed(2)}` : 'Unsliced'}</span>
            </span>

            {/* Edit Specs Button */}
            <button
              type="button"
              onClick={() => setIsEditingSpecs(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-[#181B20] hover:bg-[#252B33] text-gray-300 hover:text-white border border-[#2C323B] hover:border-[#00AE42]/60 text-xs font-mono transition-colors cursor-pointer shadow-sm ml-1"
              title="Edit print duration and weight specifications"
            >
              <Pencil className="w-3 h-3 text-[#00AE42]" />
              <span>Edit Specs</span>
            </button>
          </div>
        </div>

        {/* Modal Body - 2 Columns */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[#2C323B]">
          {/* Left Column: Large Image Carousel & Specific Filaments for Viewed File */}
          <div className="lg:col-span-6 p-6 flex flex-col justify-start gap-4 bg-[#121417]/50 overflow-y-auto">
            <div className="rounded-xl overflow-hidden border border-[#2C323B] shadow-inner bg-[#14161A]">
              <ImageCarousel
                images={model.preview_images}
                alt={model.name}
                aspectRatio="aspect-[4/3]"
                enableKeyboard={true}
                currentIndex={activeImageIndex}
                onIndexChange={handleImageIndexChange}
                current3mfName={active3mfName}
              />
            </div>

            <div className="flex items-center justify-between text-xs text-gray-400 px-1">
              <span className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[#00AE42]" />
                {model.preview_images.length} Gallery {model.preview_images.length === 1 ? 'Image' : 'Images'}
              </span>
              <span className="text-[11px] text-gray-500">
                Use Left / Right arrow keys to navigate
              </span>
            </div>

            {/* Specific Filaments Tag Name / Code / Color Underneath for Viewed File */}
            <div className="bg-[#14161A] border border-[#2C323B] rounded-xl p-4 flex flex-col gap-2.5 shadow-sm">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-gray-200 flex items-center gap-1.5 truncate">
                  <Sparkles className="w-3.5 h-3.5 text-[#00AE42] shrink-0" />
                  <span className="truncate">
                    Filaments for {active3mfName || 'Current Preview'}
                  </span>
                </span>
                <span className="text-[11px] text-gray-400 font-mono shrink-0 ml-2">
                  {activeFilaments.length} {activeFilaments.length === 1 ? 'color' : 'colors'}
                </span>
              </div>

              {activeFilaments.length === 0 ? (
                <p className="text-xs text-gray-500 italic py-1">
                  No filament metadata available for this preview file
                </p>
              ) : (
                <div className="flex flex-wrap gap-2 pt-1">
                  {activeFilaments.map((f, idx) => {
                    const label = formatFilamentLabel(f);
                    return (
                      <div
                        key={`${f.hex}-${idx}`}
                        className="flex items-center gap-2 bg-[#181B20] border border-[#2C323B] hover:border-[#00AE42]/40 px-2.5 py-1.5 rounded-lg text-xs transition-colors"
                        title={`${f.material_type} • ${label} • Hex: ${f.hex}${f.used_grams ? ` • ${f.used_grams.toFixed(1)}g` : ''}`}
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-white/20 shadow-inner shrink-0"
                          style={{ backgroundColor: f.hex }}
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="text-gray-100 font-medium truncate">
                            {label}
                          </span>
                          <div className="flex items-center gap-2 text-[10px] text-gray-400 font-mono">
                            <span>{f.material_type}</span>
                            <span>{f.hex}</span>
                            {f.used_grams !== undefined && f.used_grams !== null && (
                              <span className="text-emerald-400 font-semibold">{f.used_grams.toFixed(1)}g</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Files Breakdown & Filament BOM */}
          <div className="lg:col-span-6 p-6 flex flex-col gap-6 overflow-y-auto">
            {/* 1. Files Breakdown Section with Real-Time Highlight */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-300 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-[#00AE42]" />
                  Model Files by Format
                </h3>
              </div>

              <div className="space-y-3">
                {formatGroups.map((group) => {
                  if (group.files.length === 0) return null;
                  return (
                    <div
                      key={group.label}
                      className="bg-[#14161A] border border-[#2C323B] rounded-lg p-3"
                    >
                      <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center justify-between">
                        <span>{group.label} ({group.files.length})</span>
                      </div>

                      <div className="space-y-1.5">
                        {group.files.map((file, idx) => {
                          const isPreviewed = Boolean(
                            group.is3mf &&
                            active3mfName &&
                            file.name.toLowerCase() === active3mfName.toLowerCase()
                          );

                          return (
                            <div
                              key={`${file.full_path}-${idx}`}
                              id={group.is3mf ? `3mf-item-${encodeURIComponent(file.name)}` : undefined}
                              onClick={() => group.is3mf && handleJumpTo3mf(file.name)}
                              className={`flex items-center justify-between rounded-md p-2 text-xs group transition-all ${
                                isPreviewed
                                  ? 'bg-[#00AE42]/15 border-2 border-[#00AE42] shadow-[0_0_12px_rgba(0,174,66,0.25)] ring-1 ring-[#00AE42]/50'
                                  : 'bg-[#181B20] border border-[#2C323B]/60 hover:border-gray-500'
                              } ${group.is3mf ? 'cursor-pointer' : ''}`}
                            >
                              <div className="min-w-0 mr-2 flex-1">
                                <div className="flex items-center gap-1.5">
                                  {isPreviewed && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#00AE42] text-white uppercase tracking-wider flex items-center gap-1 shrink-0 animate-pulse">
                                      <Eye className="w-2.5 h-2.5" />
                                      Viewing
                                    </span>
                                  )}
                                  <p
                                    className={`font-mono truncate ${
                                      isPreviewed
                                        ? 'text-white font-semibold'
                                        : 'text-gray-200 group-hover:text-white'
                                    }`}
                                    title={file.name}
                                  >
                                    {file.name}
                                  </p>
                                </div>
                                <span className="text-[10px] text-gray-500 font-mono">
                                  {formatBytes(file.size_bytes)}
                                </span>
                              </div>

                              <div
                                className="flex items-center gap-1.5 shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {group.is3mf && (
                                  <button
                                    type="button"
                                    onClick={() => handleLaunchBambuStudio(file.full_path)}
                                    className="flex items-center gap-1 bg-[#00AE42]/15 hover:bg-[#00AE42] text-[#00AE42] hover:text-white border border-[#00AE42]/40 hover:border-[#00AE42] text-[11px] font-semibold px-2 py-1 rounded transition-all active:scale-95"
                                    title="Launch this 3MF plate in Bambu Studio"
                                  >
                                    <Play className="w-3 h-3 fill-current" />
                                    <span>Bambu Studio</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleReveal(file.full_path)}
                                  className="p-1 rounded bg-[#1E2228] hover:bg-[#252B33] text-gray-400 hover:text-white border border-[#2C323B] transition-colors"
                                  title="Open in Explorer with file highlighted"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 2. Filament Bill of Materials (BOM) Table */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-300 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-[#00AE42]" />
                  Filament Bill of Materials (BOM)
                </h3>
                {totalGrams && totalGrams > 0 && (
                  <span className="text-[11px] font-mono font-medium text-[#00AE42] bg-[#00AE42]/10 border border-[#00AE42]/30 px-2 py-0.5 rounded">
                    Est. Total: {totalGrams.toFixed(1)} g
                  </span>
                )}
              </div>

              {model.filaments.length === 0 ? (
                <div className="bg-[#14161A] border border-[#2C323B] rounded-lg p-5 text-center text-gray-500 text-xs">
                  <PackageCheck className="w-6 h-6 mx-auto mb-2 text-gray-600" />
                  No filament metadata found in .3mf project settings or slice configs.
                </div>
              ) : (
                <div className="border border-[#2C323B] rounded-lg overflow-hidden bg-[#14161A]">
                  <table className="w-full text-left text-xs divide-y divide-[#2C323B]">
                    <thead className="bg-[#181B20] text-gray-400 font-semibold text-[11px] uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3">Color</th>
                        <th className="py-2.5 px-3">Filament / Preset</th>
                        <th className="py-2.5 px-3">Bambu SKU</th>
                        <th className="py-2.5 px-3 text-right">Weight</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#2C323B]/60 text-gray-300">
                      {model.filaments.map((f, idx) => (
                        <tr key={`${f.hex}-${idx}`} className="hover:bg-[#1E2228]/50 transition-colors">
                          {/* Color Swatch */}
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-5 h-5 rounded-full border border-white/25 shadow-inner shrink-0"
                                style={{ backgroundColor: f.hex }}
                                title={f.hex}
                              />
                              <span className="font-mono text-[10px] text-gray-400">{f.hex}</span>
                            </div>
                          </td>

                          {/* Material & Official Name */}
                          <td className="py-2.5 px-3">
                            <div className="font-medium text-white">{f.official_name}</div>
                            <div className="text-[10px] text-gray-400 font-mono">
                              {f.material_type}
                            </div>
                          </td>

                          {/* 5-Digit Bambu SKU with click-to-copy */}
                          <td className="py-2.5 px-3">
                            {f.bambu_code && f.bambu_code !== 'Custom' ? (
                              <button
                                type="button"
                                onClick={() => handleCopySku(f.bambu_code)}
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#18261F] hover:bg-[#00AE42]/20 border border-[#00AE42]/40 text-[#00AE42] font-mono text-[11px] font-semibold transition-colors group"
                                title="Click to copy 5-digit Bambu SKU code"
                              >
                                <span>{f.bambu_code}</span>
                                {copiedCode === f.bambu_code ? (
                                  <Check className="w-3 h-3 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3 h-3 opacity-60 group-hover:opacity-100" />
                                )}
                              </button>
                            ) : (
                              <span className="text-[11px] text-gray-500 font-mono">Custom</span>
                            )}
                          </td>

                          {/* Est Grams */}
                          <td className="py-2.5 px-3 text-right font-mono text-gray-300">
                            {f.used_grams !== undefined && f.used_grams !== null
                              ? `${f.used_grams.toFixed(1)} g`
                              : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Specs Modal */}
      {isEditingSpecs && model && (
        <EditSpecsModal
          model={model}
          current3mfName={active3mfName}
          defaultCostPerKg={defaultCostPerKg}
          currencySymbol={currencySymbol}
          isOpen={isEditingSpecs}
          onClose={() => setIsEditingSpecs(false)}
          onSaved={(updated) => {
            if (onModelUpdated) onModelUpdated(updated);
          }}
        />
      )}

      {/* Rename Model Folder Modal */}
      {isRenaming && model && (
        <RenameModelModal
          model={model}
          isOpen={isRenaming}
          onClose={() => setIsRenaming(false)}
          onRenamed={(updated, oldId) => {
            if (onModelUpdated) onModelUpdated(updated, oldId);
          }}
        />
      )}

      {/* Delete Model Confirmation Modal */}
      {isDeleting && model && (
        <DeleteConfirmModal
          model={model}
          isOpen={isDeleting}
          onClose={() => setIsDeleting(false)}
          onDeleted={(deletedId) => {
            if (onModelDeleted) onModelDeleted(deletedId);
            onClose();
          }}
        />
      )}
    </div>
  );
};
