import React, { useMemo, useState } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { ModelEntry, TagDefinition } from '../types/models';
import { FormatBadge } from './FormatBadge';
import { EditSpecsModal } from './EditSpecsModal';
import {
  formatPrintTime,
  calculateCost,
  formatBedType,
  resolve3mfForImage,
  getFilamentsForImage,
  formatFilamentLabel,
  getModelStatus,
  isModelVip,
  getDisplayTags,
  getMetricsForImage,
} from '../utils/modelUtils';
import { getTagIconComponent } from '../utils/tagIcons';
import {
  Folder,
  ExternalLink,
  Layers,
  Clock,
  Scale,
  AlertTriangle,
  Play,
  Pencil,
  Box,
  Check,
  FolderEdit,
  Trash2,
} from 'lucide-react';
import { RenameModelModal } from './RenameModelModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';

interface ModelListItemProps {
  model: ModelEntry;
  activeImageIndex?: number;
  onSelect?: (model: ModelEntry, index: number) => void;
  availableTags?: TagDefinition[];
  defaultCostPerKg?: number;
  currencySymbol?: string;
  onUpdateTags?: (modelId: string, newTags: string[]) => void;
  onModelUpdated?: (updatedModel: ModelEntry, oldId?: string) => void;
  onModelDeleted?: (modelId: string) => void;
}

export const ModelListItem: React.FC<ModelListItemProps> = ({
  model,
  activeImageIndex = 0,
  onSelect,
  availableTags = [],
  defaultCostPerKg = 85.0,
  currencySymbol = '¥',
  onModelUpdated,
  onModelDeleted,
}) => {
  const [isEditingSpecs, setIsEditingSpecs] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const activeImagePath = model.preview_images[activeImageIndex];
  const active3mfName = useMemo(() => {
    return resolve3mfForImage(activeImagePath, activeImageIndex, model);
  }, [activeImagePath, activeImageIndex, model]);

  const activeFilaments = useMemo(() => {
    return getFilamentsForImage(activeImagePath, activeImageIndex, model);
  }, [activeImagePath, activeImageIndex, model]);

  // Production metadata calculations resolved per active 3MF
  const currentMetrics = useMemo(() => {
    return getMetricsForImage(activeImagePath, activeImageIndex, model);
  }, [activeImagePath, activeImageIndex, model]);

  const nozzleMm = currentMetrics.nozzleMm;
  const isNozzleWarning = Boolean(nozzleMm && nozzleMm.trim() !== '0.4');
  const printTimeStr = useMemo(() => formatPrintTime(currentMetrics.printTimeSec), [currentMetrics.printTimeSec]);
  const totalGrams = currentMetrics.totalGrams;
  const estimatedCost = useMemo(
    () => calculateCost(totalGrams, defaultCostPerKg),
    [totalGrams, defaultCostPerKg]
  );

  const modelStatus = useMemo(() => getModelStatus(model.tags), [model.tags]);
  const isVip = useMemo(() => isModelVip(model.tags), [model.tags]);
  const displayTags = useMemo(() => getDisplayTags(model.tags), [model.tags]);

  const handleRowClick = () => {
    if (onSelect) {
      onSelect(model, activeImageIndex);
    }
  };

  const handleOpenFolder = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      console.log(`[DEBUG][UI] Revealing folder: ${model.folder_path}`);
      await invoke('reveal_in_explorer', { targetPath: model.folder_path });
    } catch (err) {
      console.error('[DEBUG][UI] Failed to open folder:', err);
    }
  };

  const handleLaunchFirst3mf = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (model.formats.threemf.length === 0) return;
    try {
      const first3mf = model.formats.threemf[0].full_path;
      console.log(`[DEBUG][UI] Launching in Bambu Studio: ${first3mf}`);
      await invoke('launch_in_bambu_studio', { filePath: first3mf });
    } catch (err) {
      console.error('[DEBUG][UI] Failed to launch Bambu Studio:', err);
    }
  };

  const totalFiles =
    model.formats.threemf.length +
    model.formats.stp.length +
    model.formats.stl.length +
    model.formats.obj.length;

  const thumbnailSrc = activeImagePath ? convertFileSrc(activeImagePath) : null;

  return (
    <div
      data-model-id={model.id}
      onClick={handleRowClick}
      className="group bg-[#181B20] hover:bg-[#1E2228] border border-[#2C323B] hover:border-[#00AE42]/60 rounded-xl px-4 py-3 flex items-center justify-between gap-4 transition-all duration-150 cursor-pointer shadow-sm select-none"
    >
      {/* Left: Thumbnail & Model Identity */}
      <div className="flex items-center gap-3.5 min-w-0 flex-1">
        {/* Thumbnail Viewport */}
        <div className="relative w-16 h-16 rounded-lg bg-[#14161A] border border-[#2C323B] overflow-hidden shrink-0 flex items-center justify-center">
          {thumbnailSrc ? (
            <img
              src={thumbnailSrc}
              alt={model.name}
              className="w-full h-full object-contain p-1"
              loading="lazy"
            />
          ) : (
            <Box className="w-6 h-6 text-gray-600" />
          )}

          {model.preview_images.length > 1 && (
            <span className="absolute bottom-1 right-1 px-1 py-0.2 rounded bg-black/75 text-[9px] font-mono text-gray-300 backdrop-blur-xs flex items-center gap-0.5">
              <Layers className="w-2.5 h-2.5 text-[#00AE42]" />
              {model.preview_images.length}
            </span>
          )}
        </div>

        {/* Model Title & Tags */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-semibold text-gray-100 group-hover:text-white truncate">
              {model.name}
            </h4>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsRenaming(true);
              }}
              className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-gray-500 hover:text-white hover:bg-[#252B33] transition-all"
              title="Rename folder"
            >
              <FolderEdit className="w-3.5 h-3.5" />
            </button>

            {/* VIP Star */}
            {isVip && (
              <span
                className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40"
                title="VIP Model"
              >
                ⭐ VIP
              </span>
            )}

            {/* QA Status */}
            {modelStatus === 'approved' && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                title="Model QA Status: Approved"
              >
                <Check className="w-2.5 h-2.5 stroke-[3]" />
                Approved
              </span>
            )}
            {modelStatus === 'needs_fix' && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/40"
                title="Model QA Status: Needs Fix"
              >
                <AlertTriangle className="w-2.5 h-2.5 text-rose-300" />
                Needs Fix
              </span>
            )}

            {/* Nozzle Badge */}
            {nozzleMm && (
              <span
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-mono border ${
                  isNozzleWarning
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold'
                    : 'bg-[#14161A] text-gray-400 border-[#2C323B]'
                }`}
                title={`Nozzle diameter: ${nozzleMm}mm`}
              >
                {isNozzleWarning && <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />}
                <span>{nozzleMm}mm</span>
              </span>
            )}

            {/* Bed Type Badge */}
            {model.bed_type && (
              <span
                className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-mono bg-[#14161A] text-gray-400 border border-[#2C323B]"
                title={`Target Build Plate: ${model.bed_type}`}
              >
                {formatBedType(model.bed_type)}
              </span>
            )}
          </div>

          <div className="text-[11px] text-gray-500 font-mono flex items-center gap-2 mt-1 truncate">
            <span className="flex items-center gap-1 shrink-0">
              <Folder className="w-3 h-3 text-gray-500" />
              <span>{totalFiles} files</span>
            </span>
            <span className="truncate text-gray-600">• {model.folder_path}</span>
          </div>

          {/* Active Tags */}
          {displayTags.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
              {displayTags.map((tagId) => {
                const def = availableTags.find((t) => t.id.toLowerCase() === tagId.toLowerCase());
                const Icon = getTagIconComponent(def?.icon);
                return (
                  <span
                    key={tagId}
                    className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-medium bg-[#121417] border border-[#2C323B] text-gray-300"
                    style={def?.color ? { borderColor: `${def.color}40` } : undefined}
                  >
                    <Icon className="w-2.5 h-2.5 shrink-0" style={{ color: def?.color || '#00AE42' }} />
                    <span>{def?.label || tagId}</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Center: Filament Swatches & Format Badges */}
      <div className="hidden lg:flex items-center gap-1.5 shrink-0">
        {activeFilaments.slice(0, 3).map((f, idx) => (
          <div
            key={`${f.hex}-${idx}`}
            className="flex items-center gap-1 bg-[#14161A] border border-[#2C323B] px-1.5 py-0.5 rounded-full text-[10px] font-mono text-gray-300"
            title={`${f.material_type} • ${formatFilamentLabel(f)} • Hex: ${f.hex}`}
          >
            <span
              className="w-2.5 h-2.5 rounded-full border border-white/20 shadow-inner shrink-0"
              style={{ backgroundColor: f.hex }}
            />
            <span className="truncate max-w-[70px]">{formatFilamentLabel(f)}</span>
          </div>
        ))}
        {activeFilaments.length > 3 && (
          <span className="text-[10px] text-gray-500 font-mono">
            +{activeFilaments.length - 3}
          </span>
        )}
      </div>

      {/* Format Badges */}
      <div className="hidden md:flex items-center gap-1.5 shrink-0">
        <FormatBadge label="3MF" files={model.formats.threemf} modelFolderPath={model.folder_path} />
        <FormatBadge label="STP" files={model.formats.stp} modelFolderPath={model.folder_path} />
        <FormatBadge label="STL" files={model.formats.stl} modelFolderPath={model.folder_path} />
        <FormatBadge label="OBJ" files={model.formats.obj} modelFolderPath={model.folder_path} />
      </div>

      {/* Right-Center: Dedicated Print Metrics Box */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="relative group/metrics bg-[#14161A] border border-[#2C323B] hover:border-[#00AE42]/40 rounded-lg px-3 py-1.5 flex items-center gap-3 text-xs font-mono transition-colors">
          {/* Quick Edit Specs Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsEditingSpecs(true);
            }}
            className="p-1 rounded bg-[#181B20] hover:bg-[#00AE42] text-gray-400 hover:text-white border border-[#2C323B] hover:border-[#00AE42] transition-colors shadow-xs"
            title="Edit print duration and weight specifications"
          >
            <Pencil className="w-3 h-3" />
          </button>

          {/* Time */}
          <div className="flex items-center gap-1 text-gray-300" title={`Print Time: ${printTimeStr}`}>
            <Clock className="w-3.5 h-3.5 text-gray-400" />
            <span>{printTimeStr}</span>
          </div>

          <span className="text-[#2C323B]">|</span>

          {/* Weight */}
          <div
            className="flex items-center gap-1 text-gray-300"
            title={totalGrams ? `Total Weight: ${totalGrams.toFixed(1)}g` : 'Weight not calculated'}
          >
            <Scale className="w-3.5 h-3.5 text-blue-400" />
            <span>{totalGrams ? `${Math.round(totalGrams)}g` : '--'}</span>
          </div>

          <span className="text-[#2C323B]">|</span>

          {/* Cost */}
          <div
            className={`font-semibold ${estimatedCost ? 'text-[#00AE42]' : 'text-gray-500'}`}
            title={
              estimatedCost
                ? `Estimated material cost at ${currencySymbol}${defaultCostPerKg}/kg`
                : 'File not yet sliced in Bambu Studio'
            }
          >
            <span>{estimatedCost ? `${currencySymbol}${estimatedCost.toFixed(2)}` : 'Unsliced'}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          {model.formats.threemf.length > 0 && (
            <button
              type="button"
              onClick={handleLaunchFirst3mf}
              className="flex items-center gap-1 bg-[#00AE42]/15 hover:bg-[#00AE42] text-[#00AE42] hover:text-white border border-[#00AE42]/40 hover:border-[#00AE42] text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-all active:scale-95"
              title="Launch in Bambu Studio"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span className="hidden lg:inline">Bambu</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleOpenFolder}
            className="p-1.5 rounded-lg bg-[#14161A] hover:bg-[#252B33] text-gray-400 hover:text-white border border-[#2C323B] transition-colors"
            title="Reveal model folder in Explorer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsDeleting(true);
            }}
            className="p-1.5 rounded-lg bg-[#14161A] hover:bg-rose-500/20 text-gray-400 hover:text-rose-400 border border-[#2C323B] hover:border-rose-500/40 transition-colors"
            title="Delete model and files completely from library"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
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
