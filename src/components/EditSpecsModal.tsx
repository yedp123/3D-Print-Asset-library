import React, { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ModelEntry } from '../types/models';
import { X, Clock, Scale, Sliders, Check, AlertCircle, RefreshCw } from 'lucide-react';

interface EditSpecsModalProps {
  model: ModelEntry;
  current3mfName?: string | null;
  defaultCostPerKg?: number;
  currencySymbol?: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (updatedModel: ModelEntry) => void;
}

export const EditSpecsModal: React.FC<EditSpecsModalProps> = ({
  model,
  current3mfName,
  defaultCostPerKg = 85.0,
  currencySymbol = '¥',
  isOpen,
  onClose,
  onSaved,
}) => {
  const initial3mf = useMemo(() => {
    if (current3mfName) return current3mfName;
    if (model.formats.threemf.length === 1) return model.formats.threemf[0].name;
    return 'all';
  }, [current3mfName, model.formats.threemf]);

  const [selected3mf, setSelected3mf] = useState<string>(initial3mf);
  const [hours, setHours] = useState<string>('');
  const [minutes, setMinutes] = useState<string>('');
  const [weight, setWeight] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadValuesForTarget = (target: string) => {
    let targetTime: number | null | undefined = null;
    let targetWeight: number | null | undefined = null;

    if (target === 'all') {
      targetTime = model.print_time_sec;
      targetWeight = model.total_weight_g;
    } else {
      if (model.file_specs) {
        const matchKey = Object.keys(model.file_specs).find(
          (k) => k.toLowerCase() === target.toLowerCase()
        );
        if (matchKey && model.file_specs[matchKey]) {
          targetTime = model.file_specs[matchKey].print_time_sec;
          targetWeight = model.file_specs[matchKey].total_weight_g;
        }
      }

      if (!targetWeight || targetWeight <= 0) {
        const filSum = (model.filaments || [])
          .filter((f) => f.source_3mf.toLowerCase() === target.toLowerCase())
          .reduce((acc, f) => acc + (f.used_grams || 0), 0);
        if (filSum > 0) targetWeight = filSum;
      }
    }

    if (targetTime && targetTime > 0) {
      const h = Math.floor(targetTime / 3600);
      const m = Math.floor((targetTime % 3600) / 60);
      setHours(h > 0 ? String(h) : '');
      setMinutes(m > 0 ? String(m) : '');
    } else {
      setHours('');
      setMinutes('');
    }

    if (targetWeight && targetWeight > 0) {
      setWeight(String(targetWeight));
    } else {
      setWeight('');
    }
  };

  // Initialize or reset inputs when modal opens or model changes
  useEffect(() => {
    if (isOpen) {
      setSelected3mf(initial3mf);
      loadValuesForTarget(initial3mf);
      setError(null);
    }
  }, [isOpen, model.id, initial3mf]);

  const handleSelect3mf = (newTarget: string) => {
    setSelected3mf(newTarget);
    loadValuesForTarget(newTarget);
    setError(null);
  };

  // Live calculation of estimated cost
  const parsedWeight = parseFloat(weight);
  const liveCost = useMemo(() => {
    if (isNaN(parsedWeight) || parsedWeight <= 0) return null;
    return (parsedWeight / 1000.0) * defaultCostPerKg;
  }, [parsedWeight, defaultCostPerKg]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsedH = parseInt(hours || '0', 10);
    const parsedM = parseInt(minutes || '0', 10);
    if (parsedH < 0 || parsedM < 0 || parsedM >= 60) {
      setError('Please enter valid hours and minutes (0–59).');
      return;
    }

    const totalSeconds = parsedH * 3600 + parsedM * 60;
    const finalWeight = isNaN(parsedWeight) || parsedWeight <= 0 ? null : parsedWeight;
    const finalSeconds = totalSeconds > 0 ? totalSeconds : null;

    try {
      setSaving(true);
      console.log(
        `[DEBUG][UI] Saving manual specs for ${model.folder_path}: 3mf=${selected3mf}, time=${finalSeconds}s, weight=${finalWeight}g`
      );

      const updatedModel = await invoke<ModelEntry>('save_model_specs', {
        modelFolderPath: model.folder_path,
        target3mf: selected3mf === 'all' ? null : selected3mf,
        printTimeSec: finalSeconds,
        weightG: finalWeight,
      });

      console.log('[DEBUG][UI] Specs saved successfully:', updatedModel);
      onSaved(updatedModel);
      onClose();
    } catch (err: unknown) {
      const errorMsg = String(err);
      console.error('[DEBUG][UI] Failed to save specs:', errorMsg);
      setError(`Failed to save: ${errorMsg}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#181B20] border border-[#2C323B] rounded-2xl shadow-2xl max-w-md w-full overflow-hidden text-gray-100 flex flex-col"
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#2C323B] flex items-center justify-between bg-[#14161A]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#00AE42]/15 border border-[#00AE42]/40 flex items-center justify-center text-[#00AE42] shrink-0">
              <Sliders className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white truncate">
                Edit Production Specifications
              </h3>
              <p className="text-[11px] text-gray-400 truncate" title={model.name}>
                {model.name}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-[#1E2228] hover:bg-[#252B33] text-gray-400 hover:text-white border border-[#2C323B] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-5 flex flex-col gap-4">
          {error && (
            <div className="bg-rose-950/40 border border-rose-800/40 text-rose-300 px-3 py-2 rounded-lg text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 3MF Target Selector */}
          {model.formats.threemf.length > 1 ? (
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                Target 3MF Plate / Profile:
              </label>
              <select
                value={selected3mf}
                onChange={(e) => handleSelect3mf(e.target.value)}
                className="w-full bg-[#121417] border border-[#2C323B] focus:border-[#00AE42] rounded-lg px-3 py-2 text-xs text-gray-200 font-mono outline-none transition-colors"
              >
                <option value="all">Whole Model (All Plates Combined)</option>
                {model.formats.threemf.map((f) => (
                  <option key={f.name} value={f.name}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          ) : model.formats.threemf.length === 1 ? (
            <div className="text-xs text-gray-400 flex items-center gap-1.5 bg-[#121417] border border-[#2C323B] px-3 py-1.5 rounded-lg font-mono">
              <span className="text-[#00AE42] font-semibold">Target File:</span>
              <span className="truncate">{model.formats.threemf[0].name}</span>
            </div>
          ) : null}

          {/* Print Time Section */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1.5 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-[#00AE42]" />
              Estimated Print Duration:
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <div className="relative flex items-center">
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                    className="w-full bg-[#121417] border border-[#2C323B] focus:border-[#00AE42] rounded-lg pl-3 pr-8 py-2 text-xs font-mono text-gray-200 outline-none transition-colors"
                  />
                  <span className="absolute right-2.5 text-[11px] text-gray-500 font-sans pointer-events-none">
                    hrs
                  </span>
                </div>
              </div>
              <div>
                <div className="relative flex items-center">
                  <input
                    type="number"
                    min="0"
                    max="59"
                    placeholder="0"
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                    className="w-full bg-[#121417] border border-[#2C323B] focus:border-[#00AE42] rounded-lg pl-3 pr-8 py-2 text-xs font-mono text-gray-200 outline-none transition-colors"
                  />
                  <span className="absolute right-2.5 text-[11px] text-gray-500 font-sans pointer-events-none">
                    min
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Filament Weight Section */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1.5 flex items-center gap-1">
              <Scale className="w-3.5 h-3.5 text-blue-400" />
              Filament Weight (Grams):
            </label>
            <div className="relative flex items-center">
              <input
                type="number"
                step="0.1"
                min="0"
                placeholder="e.g. 142.5"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="w-full bg-[#121417] border border-[#2C323B] focus:border-[#00AE42] rounded-lg pl-3 pr-8 py-2 text-xs font-mono text-gray-200 outline-none transition-colors"
              />
              <span className="absolute right-2.5 text-[11px] text-gray-500 font-sans pointer-events-none">
                g
              </span>
            </div>
          </div>

          {/* Live Cost Calculation Card */}
          <div className="bg-[#121417] border border-[#2C323B] rounded-xl p-3 flex items-center justify-between font-mono text-xs shadow-inner">
            <div className="flex flex-col">
              <span className="text-[11px] text-gray-400 font-sans">
                Calculated Material Cost:
              </span>
              <span className="text-[10px] text-gray-500 font-mono">
                Formula: (weight / 1000) × {currencySymbol}{defaultCostPerKg}/kg
              </span>
            </div>
            <div className="text-right">
              <span className="text-base font-bold text-[#00AE42]">
                {liveCost !== null ? `${currencySymbol}${liveCost.toFixed(2)}` : '--'}
              </span>
            </div>
          </div>

          <p className="text-[10px] text-gray-500 leading-relaxed">
            💾 Specifications are stored directly inside this model folder in <code className="text-gray-400 font-mono">_specs.json</code>. They remain persistent and will never be overwritten by library rescans.
          </p>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#2C323B]">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg bg-[#1E2228] hover:bg-[#252B33] text-gray-300 border border-[#2C323B] text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#00AE42] hover:bg-[#009638] text-white text-xs font-semibold shadow-sm transition-all active:scale-95 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Save Specifications</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
