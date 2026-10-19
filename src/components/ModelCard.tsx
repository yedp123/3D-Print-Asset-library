import React, { useState, useEffect, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ModelEntry, TagDefinition } from '../types/models';
import { FormatBadge } from './FormatBadge';
import { ImageCarousel } from './ImageCarousel';
import { EditSpecsModal } from './EditSpecsModal';
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
  Folder, 
  ExternalLink, 
  Layers, 
  Clock, 
  Scale, 
  AlertTriangle, 
  Plus, 
  Check, 
  Tag as TagIcon,
  Pencil,
  Upload,
  ChevronDown,
  FolderEdit,
  Trash2
} from 'lucide-react';
import { RenameModelModal } from './RenameModelModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';

interface ModelCardProps {
  model: ModelEntry;
  activeImageIndex?: number;
  onActiveIndexChange?: (newIndex: number) => void;
  onSelect?: (model: ModelEntry, index: number) => void;
  availableTags?: TagDefinition[];
  defaultCostPerKg?: number;
  currencySymbol?: string;
  onUpdateTags?: (modelId: string, newTags: string[]) => void;
  onModelUpdated?: (updatedModel: ModelEntry, oldId?: string) => void;
  onModelDeleted?: (modelId: string) => void;
  rootPath?: string;
  isExternalDragOver?: boolean;
}

export const ModelCard: React.FC<ModelCardProps> = ({
  model,
  activeImageIndex: externalIndex,
  onActiveIndexChange,
  onSelect,
  availableTags = [],
  defaultCostPerKg = 85.0,
  currencySymbol = '¥',
  onUpdateTags,
  onModelUpdated,
  onModelDeleted,
  rootPath: _rootPath,
  isExternalDragOver = false,
}) => {
  const [internalIndex, setInternalIndex] = useState(0);
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [isEditingSpecs, setIsEditingSpecs] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const statusMenuRef = useRef<HTMLDivElement>(null);

  const activeImageIndex = externalIndex !== undefined ? externalIndex : internalIndex;

  const handleIndexChange = (newIndex: number) => {
    if (externalIndex === undefined) {
      setInternalIndex(newIndex);
    }
    if (onActiveIndexChange) {
      onActiveIndexChange(newIndex);
    }
  };

  // Reset internal index when model changes
  useEffect(() => {
    setInternalIndex(0);
  }, [model.id]);

  // Close tag menu and status menu when clicking outside
  useEffect(() => {
    if (!showTagMenu && !showStatusMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowTagMenu(false);
      }
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) {
        setShowStatusMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showTagMenu, showStatusMenu]);

  const handleSetStatus = async (e: React.MouseEvent, status: string) => {
    e.stopPropagation();
    setShowStatusMenu(false);
    try {
      console.log(`[DEBUG][Status] Setting status '${status}' for model: ${model.folder_path}`);
      const updatedTags = await invoke<string[]>('set_model_status', {
        modelFolderPath: model.folder_path,
        status,
      });
      console.log(`[DEBUG][Status] Updated tags:`, updatedTags);
      if (onUpdateTags) {
        onUpdateTags(model.id, updatedTags);
      }
    } catch (err) {
      console.error('[DEBUG][Status] Failed to set status:', err);
    }
  };

  const handleOpenModelFolder = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      console.log(`[DEBUG][UI] Revealing model root folder: ${model.folder_path}`);
      await invoke('reveal_in_explorer', { targetPath: model.folder_path });
    } catch (err) {
      console.error('[DEBUG][UI] Failed to open model folder:', err);
    }
  };

  const handleCardClick = () => {
    if (onSelect) {
      onSelect(model, activeImageIndex);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleToggleTag = async (e: React.MouseEvent, tagId: string) => {
    e.stopPropagation();
    try {
      console.log(`[DEBUG][Tags] Toggling tag '${tagId}' for model: ${model.folder_path}`);
      const updatedTags = await invoke<string[]>('toggle_model_tag', {
        modelFolderPath: model.folder_path,
        tagId,
      });
      console.log(`[DEBUG][Tags] Updated tags:`, updatedTags);
      if (onUpdateTags) {
        onUpdateTags(model.id, updatedTags);
      }
    } catch (err) {
      console.error('[DEBUG][Tags] Failed to toggle tag:', err);
    }
  };

  const totalFiles =
    model.formats.threemf.length +
    model.formats.stp.length +
    model.formats.stl.length +
    model.formats.obj.length;

  const activeImagePath = model.preview_images[activeImageIndex];

  // Resolve which 3MF file corresponds to the currently previewed image
  const active3mfName = useMemo(() => {
    return resolve3mfForImage(activeImagePath, activeImageIndex, model);
  }, [activeImagePath, activeImageIndex, model]);

  // Specific filaments used by the currently previewed file thumbnail
  const activeFilaments = useMemo(() => {
    return getFilamentsForImage(activeImagePath, activeImageIndex, model);
  }, [activeImagePath, activeImageIndex, model]);

  // Production metadata calculations resolved per active 3MF
  const currentMetrics = useMemo(() => {
    return getMetricsForImage(activeImagePath, activeImageIndex, model);
  }, [activeImagePath, activeImageIndex, model]);

  const nozzleMm = currentMetrics.nozzleMm;
  const isNozzleWarning = Boolean(nozzleMm && nozzleMm.trim() !== '0.4');
  const bedType = currentMetrics.bedType || model.bed_type;

  const printTimeStr = useMemo(() => {
    return formatPrintTime(currentMetrics.printTimeSec);
  }, [currentMetrics.printTimeSec]);

  const totalGrams = currentMetrics.totalGrams;

  const estimatedCost = useMemo(() => {
    return calculateCost(totalGrams, defaultCostPerKg);
  }, [totalGrams, defaultCostPerKg]);

  useEffect(() => {
    console.log(
      `[DEBUG][UI] Rendered dedicated metrics box for: ${model.name} (active3mf=${currentMetrics.active3mfName}, weight=${totalGrams}, cost=${estimatedCost})`
    );
  }, [model.name, currentMetrics.active3mfName, totalGrams, estimatedCost]);

  const modelStatus = useMemo(() => getModelStatus(model.tags), [model.tags]);
  const isVip = useMemo(() => isModelVip(model.tags), [model.tags]);
  const displayTags = useMemo(() => getDisplayTags(model.tags), [model.tags]);

  return (
    <div
      data-model-id={model.id}
      onClick={handleCardClick}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`group relative bg-[#1E2228] hover:bg-[#232830] border ${
        isDragOver || isExternalDragOver
          ? 'border-[#00AE42] ring-2 ring-[#00AE42]/50 scale-[1.01]'
          : 'border-[#2C323B] hover:border-[#00AE42]/60'
      } rounded-xl overflow-visible shadow-sm hover:shadow-lg transition-all duration-200 flex flex-col cursor-pointer`}
    >
      {/* Drag & Drop Ingestion Overlay */}
      {(isDragOver || isExternalDragOver) && (
        <div className="absolute inset-0 z-50 border-2 border-dashed border-[#00AE42] bg-[#00AE42]/20 rounded-xl flex flex-col items-center justify-center pointer-events-none backdrop-blur-xs animate-in fade-in duration-100 shadow-2xl">
          <Upload className="w-8 h-8 text-[#00AE42] mb-1 animate-bounce" />
          <span className="text-xs font-bold text-white">Drop Files to Ingest</span>
          <span className="text-[10px] text-gray-200 mt-0.5">Auto-sorts 3MF, CAD, &amp; previews</span>
        </div>
      )}

      {/* 1-Image Gallery Viewport using reusable ImageCarousel */}
      <div className="border-b border-[#2C323B] relative rounded-t-xl overflow-hidden">
        <ImageCarousel
          images={model.preview_images}
          alt={model.name}
          aspectRatio="aspect-[4/3]"
          currentIndex={activeImageIndex}
          onIndexChange={handleIndexChange}
          current3mfName={active3mfName}
          onImageClick={handleCardClick}
        />

        {/* Floating Nozzle & Bed Type Badges on Gallery Viewport */}
        {(nozzleMm || bedType) && (
          <div className="absolute top-2.5 left-2.5 z-20 flex items-center gap-1.5 pointer-events-none">
            {nozzleMm && (
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono backdrop-blur-md border shadow-sm ${
                  isNozzleWarning
                    ? 'bg-amber-500/80 text-white border-amber-300 font-bold animate-pulse'
                    : 'bg-black/65 text-gray-200 border-white/10'
                }`}
                title={
                  isNozzleWarning
                    ? `Warning: Sliced for non-standard ${nozzleMm}mm nozzle diameter!`
                    : `Nozzle diameter: ${nozzleMm}mm`
                }
              >
                {isNozzleWarning && <AlertTriangle className="w-2.5 h-2.5 text-amber-200" />}
                <span>{nozzleMm}mm</span>
              </span>
            )}
            {bedType && (
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-black/65 backdrop-blur-md text-gray-300 border border-white/10 shadow-sm truncate max-w-[110px]"
                title={`Target Build Plate: ${bedType}`}
              >
                {formatBedType(bedType)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Model Info Body */}
      <div className="p-3.5 flex flex-col flex-1 justify-between gap-2.5">
        <div>
          {/* Title & Quick Open */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3
                  className="text-sm font-semibold text-gray-100 group-hover:text-white truncate"
                  title={model.name}
                >
                  {model.name}
                </h3>
                {isVip && (
                  <span
                    className="inline-flex items-center text-xs text-amber-400 select-none shrink-0"
                    title="VIP Model (Priority Farm Print)"
                  >
                    ⭐
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsRenaming(true);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-500 hover:text-white hover:bg-[#2C323B] transition-opacity shrink-0"
                  title="Rename model folder on disk"
                >
                  <FolderEdit className="w-3 h-3 text-[#00AE42]" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsDeleting(true);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-500 hover:text-rose-400 hover:bg-[#2C323B] transition-opacity shrink-0"
                  title="Delete model and files completely from library"
                >
                  <Trash2 className="w-3 h-3 text-rose-400" />
                </button>
              </div>
              <p className="text-[11px] text-gray-400 flex items-center gap-1.5 mt-0.5">
                <Folder className="w-3 h-3 text-gray-500 shrink-0" />
                <span className="truncate">
                  {totalFiles} 3D {totalFiles === 1 ? 'file' : 'files'}
                </span>
              </p>
            </div>

            {/* QA Status Dropdown & Explorer Open */}
            <div className="flex items-center gap-1 shrink-0" ref={statusMenuRef}>
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowStatusMenu(!showStatusMenu);
                    setShowTagMenu(false);
                  }}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold border shadow-xs flex items-center gap-1 transition-all select-none active:scale-95 ${
                    modelStatus === 'approved'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                      : modelStatus === 'needs_fix'
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30'
                      : 'bg-[#14161A] text-gray-400 hover:text-gray-200 border-[#2C323B] hover:border-gray-500'
                  }`}
                  title="Model QA Status (Click to set Approved, Needs Fix, or VIP)"
                >
                  {modelStatus === 'approved' ? (
                    <>
                      <Check className="w-2.5 h-2.5 stroke-[3] text-emerald-400" />
                      <span>Approved</span>
                    </>
                  ) : modelStatus === 'needs_fix' ? (
                    <>
                      <AlertTriangle className="w-2.5 h-2.5 text-rose-400" />
                      <span>Needs Fix</span>
                    </>
                  ) : (
                    <span>+ Status</span>
                  )}
                  <ChevronDown className="w-2.5 h-2.5 opacity-60 ml-0.5" />
                </button>

                {/* Status Selection Popover */}
                {showStatusMenu && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-full mt-1.5 w-40 bg-[#181B20] border border-[#2C323B] rounded-xl shadow-2xl p-1.5 z-40 animate-in fade-in zoom-in-95 duration-100"
                  >
                    <div className="text-[10px] uppercase font-semibold text-gray-400 px-2 py-1 border-b border-[#2C323B] mb-1">
                      Set QA Status
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handleSetStatus(e, 'approved')}
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition-colors ${
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
                      onClick={(e) => handleSetStatus(e, 'needs_fix')}
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition-colors ${
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
                        onClick={(e) => handleSetStatus(e, 'none')}
                        className="w-full text-left px-2 py-1 rounded-lg text-[11px] text-gray-400 hover:bg-[#20252D] hover:text-gray-200"
                      >
                        Clear QA Status
                      </button>
                    )}
                    <div className="my-1 border-t border-[#2C323B]" />
                    <button
                      type="button"
                      onClick={(e) => handleSetStatus(e, 'vip')}
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition-colors ${
                        isVip
                          ? 'bg-amber-500/20 text-amber-300 font-semibold'
                          : 'text-gray-300 hover:bg-[#20252D] hover:text-white'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">⭐ VIP Star</span>
                      {isVip && <Check className="w-3 h-3 text-amber-400" />}
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleOpenModelFolder}
                className="p-1 rounded-md text-gray-500 hover:text-[#00AE42] hover:bg-[#252B33] transition-colors"
                title="Reveal model folder in Windows Explorer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsDeleting(true);
                }}
                className="p-1 rounded-md text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                title="Delete model and files completely from library"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Active Tags & Quick Tag Toggler Popover */}
          <div className="relative flex items-center gap-1.5 flex-wrap mt-2" ref={popoverRef}>
            {displayTags.map((tagId) => {
              const def = availableTags.find((t) => t.id.toLowerCase() === tagId.toLowerCase());
              const Icon = getTagIconComponent(def?.icon);
              return (
                <span
                  key={tagId}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#14161A] border border-[#2C323B] text-gray-300"
                  style={def?.color ? { borderColor: `${def.color}40` } : undefined}
                >
                  <Icon
                    className="w-2.5 h-2.5 shrink-0"
                    style={{ color: def?.color || '#00AE42' }}
                  />
                  <span>{def?.label || tagId}</span>
                </span>
              );
            })}

            {/* + Tag Popover Button */}
            <div className="relative inline-block">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowTagMenu(!showTagMenu);
                  setShowStatusMenu(false);
                }}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#181B20] hover:bg-[#252B33] text-gray-400 hover:text-white border border-[#2C323B] hover:border-gray-500 transition-colors"
                title="Add or remove model tags"
              >
                <Plus className="w-2.5 h-2.5" />
                <span>Tag</span>
              </button>

              {/* Tag Selection Dropdown Popover */}
              {showTagMenu && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute left-0 bottom-full mb-1 w-48 bg-[#181B20] border border-[#2C323B] rounded-xl shadow-2xl p-1.5 z-40 animate-in fade-in zoom-in-95 duration-100"
                >
                  <div className="text-[10px] uppercase font-semibold text-gray-400 px-2 py-1 flex items-center gap-1 border-b border-[#2C323B] mb-1">
                    <TagIcon className="w-2.5 h-2.5 text-[#00AE42]" />
                    <span>Toggle Tags</span>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-0.5">
                    {availableTags.map((tag) => {
                      const isTagActive = displayTags.some(
                        (t: string) => t.toLowerCase() === tag.id.toLowerCase()
                      );
                      const Icon = getTagIconComponent(tag.icon);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={(e) => handleToggleTag(e, tag.id)}
                          className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition-colors ${
                            isTagActive
                              ? 'bg-[#1E2620] text-white font-medium'
                              : 'hover:bg-[#22272E] text-gray-300'
                          }`}
                        >
                          <span className="flex items-center gap-1.5 truncate">
                            <Icon
                              className="w-3 h-3 shrink-0"
                              style={{ color: tag.color || '#00AE42' }}
                            />
                            <span className="truncate">{tag.label}</span>
                          </span>
                          {isTagActive && (
                            <Check className="w-3 h-3 text-[#00AE42] shrink-0 ml-1" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Dedicated Print Metrics Box with Edit Button */}
          <div className="relative group/metrics bg-[#14161A] border border-[#2C323B] hover:border-[#00AE42]/40 rounded-lg p-2 grid grid-cols-3 gap-1 text-center font-mono select-none mt-2.5 transition-colors">
            {/* Quick Edit Specs Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditingSpecs(true);
              }}
              className="absolute -top-2 -right-1.5 p-1 rounded-full bg-[#181B20] hover:bg-[#00AE42] text-gray-400 hover:text-white border border-[#2C323B] hover:border-[#00AE42] opacity-0 group-hover/metrics:opacity-100 transition-all duration-150 shadow-md z-10"
              title={
                currentMetrics.active3mfName
                  ? `Edit specifications for ${currentMetrics.active3mfName}`
                  : 'Edit print duration and weight specifications'
              }
            >
              <Pencil className="w-2.5 h-2.5" />
            </button>

            {/* Multi-3MF active file indicator */}
            {model.formats.threemf.length > 1 && (
              <div className="col-span-3 flex items-center justify-between text-[9px] text-gray-400 font-mono pb-1 border-b border-[#2C323B]/60 mb-0.5 px-0.5">
                <span className="truncate max-w-[170px] text-left text-gray-300 font-medium" title={currentMetrics.active3mfName || 'All combined'}>
                  {currentMetrics.active3mfName ? `📄 ${currentMetrics.active3mfName}` : '📄 All Combined'}
                </span>
                <span className="text-[8px] uppercase tracking-wider text-emerald-400 font-sans font-semibold shrink-0">
                  {currentMetrics.isSpecific3mf ? 'Plate' : 'Total'}
                </span>
              </div>
            )}

            {/* 1. Print Time */}
            <div className="flex flex-col items-center justify-center border-r border-[#2C323B]/60 pr-1">
              <span className="text-[9px] uppercase text-gray-500 font-sans flex items-center gap-0.5">
                <Clock className="w-2.5 h-2.5 text-gray-400" /> Time
              </span>
              <span
                className="text-xs font-semibold text-gray-200 mt-0.5 truncate w-full"
                title={printTimeStr !== '--' ? `Print time: ${printTimeStr}` : 'Print duration not calculated'}
              >
                {printTimeStr}
              </span>
            </div>

            {/* 2. Weight */}
            <div className="flex flex-col items-center justify-center border-r border-[#2C323B]/60 px-1">
              <span className="text-[9px] uppercase text-gray-500 font-sans flex items-center gap-0.5">
                <Scale className="w-2.5 h-2.5 text-blue-400" /> Weight
              </span>
              <span
                className="text-xs font-semibold text-gray-200 mt-0.5 truncate w-full"
                title={totalGrams ? `Total material weight: ${totalGrams.toFixed(1)}g` : 'Weight not calculated'}
              >
                {totalGrams ? `${Math.round(totalGrams)}g` : '--'}
              </span>
            </div>

            {/* 3. Cost */}
            <div className="flex flex-col items-center justify-center pl-1">
              <span className="text-[9px] uppercase text-gray-500 font-sans flex items-center gap-0.5">
                <span className="text-emerald-400 font-bold">$</span> Cost
              </span>
              <span
                className={`text-xs font-bold mt-0.5 truncate w-full ${
                  estimatedCost ? 'text-[#00AE42]' : 'text-gray-500 text-[10px]'
                }`}
                title={
                  estimatedCost
                    ? `Estimated material cost at ${currencySymbol}${defaultCostPerKg}/kg`
                    : 'File not yet sliced in Bambu Studio'
                }
              >
                {estimatedCost ? `${currencySymbol}${estimatedCost.toFixed(2)}` : 'Unsliced'}
              </span>
            </div>
          </div>

          {/* Filament Color Swatches Pill Bar for Currently Previewed File */}
          {activeFilaments.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              {activeFilaments.slice(0, 4).map((f, idx) => {
                const label = formatFilamentLabel(f);
                return (
                  <div
                    key={`${f.hex}-${idx}`}
                    className="flex items-center gap-1 bg-[#14161A] border border-[#2C323B] px-1.5 py-0.5 rounded-full text-[10px] font-mono text-gray-300"
                    title={`${f.material_type} • ${label} • Hex: ${f.hex}`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-white/20 shadow-inner shrink-0"
                      style={{ backgroundColor: f.hex }}
                    />
                    <span className="truncate max-w-[95px]">{label}</span>
                  </div>
                );
              })}
              {activeFilaments.length > 4 && (
                <span className="text-[10px] text-gray-500 font-mono">
                  +{activeFilaments.length - 4}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Format Badges Row */}
        <div className="pt-2 border-t border-[#2C323B]/60 flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <FormatBadge
              label="3MF"
              files={model.formats.threemf}
              modelFolderPath={model.folder_path}
            />
            <FormatBadge
              label="STP"
              files={model.formats.stp}
              modelFolderPath={model.folder_path}
            />
            <FormatBadge
              label="STL"
              files={model.formats.stl}
              modelFolderPath={model.folder_path}
            />
            <FormatBadge
              label="OBJ"
              files={model.formats.obj}
              modelFolderPath={model.folder_path}
            />
          </div>

          <div className="text-[10px] text-gray-500 shrink-0">
            {model.preview_images.length > 0 && (
              <span className="flex items-center gap-1">
                <Layers className="w-3 h-3 text-[#00AE42]" />
                {model.preview_images.length}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Edit Specs Modal */}
      {isEditingSpecs && (
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
      {isRenaming && (
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
      {isDeleting && (
        <DeleteConfirmModal
          model={model}
          isOpen={isDeleting}
          onClose={() => setIsDeleting(false)}
          onDeleted={(deletedId) => {
            if (onModelDeleted) onModelDeleted(deletedId);
          }}
        />
      )}
    </div>
  );
};
