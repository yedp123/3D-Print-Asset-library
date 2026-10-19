import React, { useEffect, useState, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { open } from '@tauri-apps/plugin-dialog';
import { ModelEntry, AppConfig } from './types/models';
import { ModelCard } from './components/ModelCard';
import { ModelDetailModal } from './components/ModelDetailModal';
import { ModelListItem } from './components/ModelListItem';
import { DuplicateWarningModal } from './components/DuplicateWarningModal';
import { FilterBar, FilamentOption, ViewMode, GridDensity } from './components/FilterBar';
import { 
  FolderOpen, 
  ExternalLink, 
  FolderCheck, 
  FolderX, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Layers, 
  Box, 
  SlidersHorizontal, 
  Search, 
  Upload 
} from 'lucide-react';

interface PendingDuplicateState {
  existingModel: ModelEntry;
  conflictingFiles: string[];
  pendingPaths: string[];
}

export const App: React.FC = () => {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState<boolean>(true);
  const [scanning, setScanning] = useState<boolean>(false);
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelEntry | null>(null);
  const [modelIndices, setModelIndices] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedHexes, setSelectedHexes] = useState<string[]>([]);
  const [strictAmsMatch, setStrictAmsMatch] = useState<boolean>(false);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [gridDensity, setGridDensity] = useState<GridDensity>('standard');
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const [dragOverModelId, setDragOverModelId] = useState<string | null>(null);
  const [isDragOverNewZone, setIsDragOverNewZone] = useState<boolean>(false);
  const [pendingDuplicate, setPendingDuplicate] = useState<PendingDuplicateState | null>(null);

  const modelsRef = useRef(models);
  modelsRef.current = models;
  const configRef = useRef(config);
  configRef.current = config;
  const isIngestingRef = useRef(false);
  const lastDropTimeRef = useRef(0);

  const handleModelIndexChange = (modelId: string, newIndex: number) => {
    setModelIndices((prev) => ({ ...prev, [modelId]: newIndex }));
  };

  const handleSelectModel = (model: ModelEntry, index: number) => {
    handleModelIndexChange(model.id, index);
    setSelectedModel(model);
  };

  const showStatus = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setStatusMessage({ text, type });
    setTimeout(() => {
      setStatusMessage((current) => (current?.text === text ? null : current));
    }, 4500);
  };

  // Scan models directory command
  const scanLibrary = async (targetRoot: string) => {
    if (!targetRoot || targetRoot.trim().length === 0) {
      setModels([]);
      return;
    }

    try {
      setScanning(true);
      console.log(`[DEBUG][UI] Triggering model scan for root_path: ${targetRoot}`);
      const scannedModels = await invoke<ModelEntry[]>('scan_models_directory', {
        rootPath: targetRoot,
      });
      console.log(`[DEBUG][UI] Loaded ${scannedModels.length} models`);
      setModels(scannedModels);
      showStatus(`Found ${scannedModels.length} models in library`, 'success');
    } catch (err: unknown) {
      const errorStr = String(err);
      console.error('[DEBUG][UI] Scan error:', errorStr);
      showStatus(`Library scan failed: ${errorStr}`, 'error');
    } finally {
      setScanning(false);
    }
  };

  // Load config on startup
  const loadAppConfig = async () => {
    try {
      setLoadingConfig(true);
      const res = await invoke<AppConfig>('load_config');
      console.log('[DEBUG][UI] Loaded config:', res);
      setConfig(res);

      if (res.root_path && res.root_path.trim().length > 0) {
        await scanLibrary(res.root_path);
      }
    } catch (err: unknown) {
      const errorStr = String(err);
      console.error('[DEBUG][UI] Failed to load config:', errorStr);
      showStatus(`Failed to load config: ${errorStr}`, 'error');
    } finally {
      setLoadingConfig(false);
    }
  };

  useEffect(() => {
    loadAppConfig();
  }, []);

  // Select folder via native dialog
  const handleSelectFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select 3D Library Root Directory',
        defaultPath: config?.root_path || undefined,
      });

      if (!selected) {
        console.log('[DEBUG][UI] Folder selection cancelled by user');
        return;
      }

      const folderPath = Array.isArray(selected) ? selected[0] : selected;
      if (typeof folderPath === 'string' && folderPath.trim().length > 0) {
        console.log('[DEBUG][UI] Selected folder:', folderPath);
        const updatedConfig = await invoke<AppConfig>('save_root_path', {
          newPath: folderPath,
        });
        setConfig(updatedConfig);
        console.log('[DEBUG][UI] Saved root_path:', updatedConfig.root_path);
        showStatus(`Library root set to: ${updatedConfig.root_path}`, 'success');

        // Automatically trigger scan upon new root selection
        await scanLibrary(updatedConfig.root_path);
      }
    } catch (err: unknown) {
      const errorStr = String(err);
      console.error('[DEBUG][UI] Error selecting folder:', errorStr);
      showStatus(`Folder selection failed: ${errorStr}`, 'error');
    }
  };

  // Reveal library root in Explorer
  const handleRevealInExplorer = async () => {
    if (!config?.root_path) {
      showStatus('No root path configured to reveal', 'error');
      return;
    }

    try {
      console.log('[DEBUG][UI] Revealing root path in Explorer:', config.root_path);
      await invoke('reveal_in_explorer', { targetPath: config.root_path });
      showStatus('Opened in Windows Explorer', 'success');
    } catch (err: unknown) {
      const errorStr = String(err);
      console.error('[DEBUG][UI] Failed to reveal in Explorer:', errorStr);
      showStatus(`Explorer reveal failed: ${errorStr}`, 'error');
    }
  };

  // Tag filter toggling
  const handleToggleTagFilter = (tagId: string) => {
    const lower = tagId.toLowerCase();
    setSelectedTags((prev) =>
      prev.includes(lower) ? prev.filter((t) => t !== lower) : [...prev, lower]
    );
  };

  // Hex filter toggling
  const handleToggleHexFilter = (hex: string) => {
    const lower = hex.toLowerCase();
    setSelectedHexes((prev) =>
      prev.includes(lower) ? prev.filter((h) => h !== lower) : [...prev, lower]
    );
  };

  // QA Status & VIP filter toggling
  const handleToggleStatusFilter = (status: string) => {
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  };

  // Real-time tag update handler when toggled from ModelCard or ModelDetailModal
  const handleUpdateModelTags = (modelId: string, newTags: string[]) => {
    setModels((prev) =>
      prev.map((m) => (m.id === modelId ? { ...m, tags: newTags } : m))
    );
    if (selectedModel && selectedModel.id === modelId) {
      setSelectedModel((prev) => (prev ? { ...prev, tags: newTags } : null));
    }
  };

  // Real-time model update handler when specs or properties are modified or folder is renamed
  const handleModelUpdated = (updatedModel: ModelEntry, oldId?: string) => {
    console.log('[DEBUG][UI] Updating model in App state:', updatedModel.id, updatedModel.name, 'oldId:', oldId);
    setModels((prev) =>
      prev.map((m) => {
        if (m.id === updatedModel.id || (oldId && m.id === oldId)) {
          return updatedModel;
        }
        return m;
      })
    );
    if (selectedModel && (selectedModel.id === updatedModel.id || (oldId && selectedModel.id === oldId))) {
      setSelectedModel(updatedModel);
    }
    if (oldId && oldId !== updatedModel.id) {
      setModelIndices((prev) => {
        const copy = { ...prev };
        if (copy[oldId] !== undefined) {
          copy[updatedModel.id] = copy[oldId];
          delete copy[oldId];
        }
        return copy;
      });
    }
  };

  // Real-time model deletion handler when card and files are permanently deleted
  const handleModelDeleted = (modelId: string) => {
    console.log('[DEBUG][UI] Removing deleted model from App state:', modelId);
    setModels((prev) => prev.filter((m) => m.id !== modelId));
    if (selectedModel && selectedModel.id === modelId) {
      setSelectedModel(null);
    }
    setModelIndices((prev) => {
      const copy = { ...prev };
      delete copy[modelId];
      return copy;
    });
    showStatus('Model and files permanently deleted', 'success');
  };

  // Update existing model by replacing files with dropped/chosen ones
  const handleUpdateExistingModel = async (targetModel: ModelEntry, paths: string[]) => {
    setPendingDuplicate(null);
    const currentRoot = configRef.current?.root_path;
    if (!currentRoot) {
      showStatus('Please configure a Library Root before updating models', 'error');
      return;
    }

    isIngestingRef.current = true;
    try {
      showStatus(`Updating files in "${targetModel.name}"...`, 'info');
      console.log(
        `[DEBUG][Ingest] Updating existing model "${targetModel.name}" at: ${targetModel.folder_path} with ${paths.length} file(s) (overwrite=true)`
      );
      const updated = await invoke<ModelEntry>('ingest_files_to_model', {
        targetFolder: targetModel.folder_path,
        filePaths: paths,
        rootPath: currentRoot,
        overwrite: true,
      });
      handleModelUpdated(updated);
      showStatus(`Updated "${updated.name}" with new files`, 'success');
    } catch (err) {
      console.error('[DEBUG][Ingest] Update failed:', err);
      showStatus(`Failed to update model: ${err}`, 'error');
    } finally {
      isIngestingRef.current = false;
    }
  };

  // Helper to detect if dropped/chosen files already exist in library
  const findPotentialDuplicate = (
    incomingPaths: string[],
    allModels: ModelEntry[]
  ): { existingModel: ModelEntry; conflictingFiles: string[] } | null => {
    if (!incomingPaths.length || !allModels.length) return null;

    for (const model of allModels) {
      const conflictingFiles: string[] = [];
      const modelExistingFileNames = new Set<string>();

      const formatLists = [
        model.formats.threemf,
        model.formats.stp,
        model.formats.stl,
        model.formats.obj,
      ];
      for (const list of formatLists) {
        if (list) {
          for (const item of list) {
            modelExistingFileNames.add(item.name.toLowerCase());
          }
        }
      }
      if (model.preview_images) {
        for (const imgPath of model.preview_images) {
          const imgName = imgPath.split(/[/\\]/).pop()?.toLowerCase();
          if (imgName) modelExistingFileNames.add(imgName);
        }
      }

      const modelNameLower = model.name.toLowerCase();

      for (const path of incomingPaths) {
        const fileName = path.split(/[/\\]/).pop() || '';
        const fileNameLower = fileName.toLowerCase();
        const stemLower = fileNameLower.replace(/\.[^/.]+$/, '');

        if (modelExistingFileNames.has(fileNameLower)) {
          conflictingFiles.push(fileName);
        } else if (
          stemLower === modelNameLower &&
          !['.png', '.jpg', '.jpeg', '.webp'].some((ext) => fileNameLower.endsWith(ext))
        ) {
          conflictingFiles.push(`${fileName} (matches model "${model.name}")`);
        }
      }

      if (conflictingFiles.length > 0) {
        return {
          existingModel: model,
          conflictingFiles,
        };
      }
    }

    return null;
  };

  // Ingest files into a new model folder
  const executeNewModelIngest = async (paths: string[]) => {
    const currentRoot = configRef.current?.root_path;
    if (!currentRoot) {
      showStatus('Please configure a Library Root before dropping models', 'error');
      return;
    }

    isIngestingRef.current = true;
    try {
      showStatus(`Ingesting ${paths.length} file(s) into new model...`, 'info');
      const newModel = await invoke<ModelEntry>('ingest_files_to_model', {
        targetFolder: '',
        filePaths: paths,
        rootPath: currentRoot,
      });
      setModels((prev) => {
        if (prev.some((m) => m.id === newModel.id || m.folder_path === newModel.folder_path)) {
          return prev.map((m) => (m.id === newModel.id || m.folder_path === newModel.folder_path ? newModel : m));
        }
        return [...prev, newModel];
      });
      showStatus(`Created new model: ${newModel.name}`, 'success');
    } catch (err) {
      console.error('[DEBUG][Ingest] Ingestion failed:', err);
      showStatus(`Ingestion failed: ${err}`, 'error');
    } finally {
      isIngestingRef.current = false;
    }
  };

  // Native Tauri v2 OS File Drag & Drop Listener
  useEffect(() => {
    let disposed = false;
    let unlistenFn: (() => void) | undefined;

    async function setupDragDrop() {
      try {
        const webview = getCurrentWebview();
        const unlisten = await webview.onDragDropEvent(async (event) => {
          if (disposed) return;
          const payload = event.payload;

          if (payload.type === 'over') {
            const clientX = payload.position.x / window.devicePixelRatio;
            const clientY = payload.position.y / window.devicePixelRatio;
            const el = document.elementFromPoint(clientX, clientY);

            const modelEl = el?.closest('[data-model-id]');
            const newZoneEl = el?.closest('[data-drop-zone="new-model"]');

            if (modelEl) {
              const mId = modelEl.getAttribute('data-model-id');
              setDragOverModelId(mId);
              setIsDragOverNewZone(false);
            } else if (newZoneEl) {
              setDragOverModelId(null);
              setIsDragOverNewZone(true);
            } else {
              setDragOverModelId(null);
              setIsDragOverNewZone(false);
            }
          } else if (payload.type === 'drop') {
            const clientX = payload.position.x / window.devicePixelRatio;
            const clientY = payload.position.y / window.devicePixelRatio;
            const el = document.elementFromPoint(clientX, clientY);

            const modelEl = el?.closest('[data-model-id]');
            const newZoneEl = el?.closest('[data-drop-zone="new-model"]');
            const galleryEl = el?.closest('#models-container');
            const paths = payload.paths || [];

            setDragOverModelId(null);
            setIsDragOverNewZone(false);

            if (paths.length === 0) return;

            // Debounce rapid duplicate drop events
            const now = Date.now();
            if (now - lastDropTimeRef.current < 600) {
              console.log('[DEBUG][Ingest] Dropping duplicate rapid event within 600ms');
              return;
            }
            lastDropTimeRef.current = now;

            if (isIngestingRef.current) {
              console.log('[DEBUG][Ingest] Ingestion already in progress, skipping duplicate');
              return;
            }

            const currentRoot = configRef.current?.root_path;
            if (!currentRoot) {
              showStatus('Please configure a Library Root before dropping models', 'error');
              return;
            }

            if (modelEl) {
              const mId = modelEl.getAttribute('data-model-id');
              const target = modelsRef.current.find((m) => m.id === mId);
              if (target) {
                isIngestingRef.current = true;
                try {
                  showStatus(`Ingesting ${paths.length} file(s) into ${target.name}...`, 'info');
                  const updated = await invoke<ModelEntry>('ingest_files_to_model', {
                    targetFolder: target.folder_path,
                    filePaths: paths,
                    rootPath: currentRoot,
                  });
                  handleModelUpdated(updated);
                  showStatus(`Ingested ${paths.length} file(s) into ${updated.name}`, 'success');
                } catch (err) {
                  console.error('[DEBUG][Ingest] Ingestion failed:', err);
                  showStatus(`Ingestion failed: ${err}`, 'error');
                } finally {
                  isIngestingRef.current = false;
                }
              }
            } else if (newZoneEl || galleryEl) {
              const duplicate = findPotentialDuplicate(paths, modelsRef.current);
              if (duplicate) {
                console.log('[DEBUG][Ingest] Potential duplicate detected on drop:', duplicate.existingModel.name);
                setPendingDuplicate({
                  existingModel: duplicate.existingModel,
                  conflictingFiles: duplicate.conflictingFiles,
                  pendingPaths: paths,
                });
                return;
              }

              await executeNewModelIngest(paths);
            }
          } else if (payload.type === 'leave') {
            setDragOverModelId(null);
            setIsDragOverNewZone(false);
          }
        });

        if (disposed) {
          unlisten();
        } else {
          unlistenFn = unlisten;
        }
      } catch (err) {
        console.error('[DEBUG][DragDrop] Failed to attach webview onDragDropEvent:', err);
      }
    }

    setupDragDrop();

    return () => {
      disposed = true;
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, []);

  // Compute tag counts across library models (excluding status_* flags)
  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const model of models) {
      if (model.tags) {
        for (const t of model.tags) {
          const lower = t.toLowerCase();
          if (!lower.startsWith('status_')) {
            counts[lower] = (counts[lower] || 0) + 1;
          }
        }
      }
    }
    return counts;
  }, [models]);

  // Compute unique filament options from all loaded models
  const availableFilaments = useMemo<FilamentOption[]>(() => {
    const map = new Map<string, { hex: string; name: string; count: number }>();
    for (const model of models) {
      if (model.filaments) {
        const modelSeenHexes = new Set<string>();
        for (const f of model.filaments) {
          const lowerHex = f.hex.toLowerCase();
          if (!modelSeenHexes.has(lowerHex)) {
            modelSeenHexes.add(lowerHex);
            const existing = map.get(lowerHex);
            if (existing) {
              existing.count += 1;
            } else {
              map.set(lowerHex, {
                hex: f.hex,
                name: f.official_name || f.preset_name || f.material_type || f.hex,
                count: 1,
              });
            }
          }
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [models]);

  // Filter models based on search query, tags, status, and filament color swatches (with Strict AMS Match)
  const filteredModels = useMemo(() => {
    const rawQuery = searchQuery.trim().toLowerCase();
    const terms = rawQuery ? rawQuery.split(/\s+/).filter(Boolean) : [];

    return models.filter((m) => {
      // 0. QA Status & VIP filtering
      if (selectedStatuses.length > 0) {
        const modelTags = (m.tags || []).map((t) => t.toLowerCase());
        const matchesStatus = selectedStatuses.some((s) => {
          if (s === 'approved') return modelTags.includes('status_approved');
          if (s === 'needs_fix') return modelTags.includes('status_needs_fix');
          if (s === 'vip') return modelTags.includes('status_vip');
          return false;
        });
        if (!matchesStatus) return false;
      }

      // 1. Tag filtering (model must contain all selected tags)
      if (selectedTags.length > 0) {
        const modelTags = (m.tags || []).map((t) => t.toLowerCase());
        const matchesAllTags = selectedTags.every((st) => modelTags.includes(st.toLowerCase()));
        if (!matchesAllTags) return false;
      }

      // 2. Filament Color Swatches filtering
      if (selectedHexes.length > 0) {
        const modelHexes = (m.filaments || []).map((f) => f.hex.toLowerCase());
        if (strictAmsMatch) {
          // Strict AMS mode: model must have filaments and ALL filaments must be among selected swatches
          if (modelHexes.length === 0) {
            return false;
          }
          const allIncluded = modelHexes.every((mh) =>
            selectedHexes.some((sh) => sh.toLowerCase() === mh)
          );
          if (!allIncluded) return false;
        } else {
          // Any mode: AT LEAST ONE filament matches selected swatches
          const hasAnyMatch = modelHexes.some((mh) =>
            selectedHexes.some((sh) => sh.toLowerCase() === mh)
          );
          if (!hasAnyMatch) return false;
        }
      }

      // 3. Search Query Terms
      if (terms.length > 0) {
        const matchesSearch = terms.every((term) => {
          // Folder / Model name
          if (m.name.toLowerCase().includes(term)) return true;

          // Tags
          if (m.tags?.some((t) => t.toLowerCase().includes(term))) return true;

          // 3MF files
          if (m.formats.threemf.some((f) => f.name.toLowerCase().includes(term))) return true;

          // STP / STEP files
          if (m.formats.stp.some((f) => f.name.toLowerCase().includes(term))) return true;

          // STL files
          if (m.formats.stl.some((f) => f.name.toLowerCase().includes(term))) return true;

          // OBJ files
          if (m.formats.obj.some((f) => f.name.toLowerCase().includes(term))) return true;

          // Filament metadata
          if (
            m.filaments?.some(
              (f) =>
                f.official_name.toLowerCase().includes(term) ||
                f.material_type.toLowerCase().includes(term) ||
                f.bambu_code.toLowerCase().includes(term)
            )
          ) {
            return true;
          }

          return false;
        });

        if (!matchesSearch) return false;
      }

      return true;
    });
  }, [models, searchQuery, selectedTags, selectedHexes, strictAmsMatch, selectedStatuses]);

  return (
    <div className="flex flex-col h-screen w-screen bg-[#121417] text-gray-100 font-sans select-none overflow-hidden">
      {/* Top Header Bar */}
      <header className="h-16 bg-[#181B20] border-b border-[#2C323B] px-5 flex items-center justify-between shadow-sm shrink-0 gap-4">
        {/* Brand / Logo */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-[#00AE42]/15 border border-[#00AE42]/40 flex items-center justify-center text-[#00AE42] shadow-inner">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-wide text-white uppercase">Bambu Studio</span>
              <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-[#00AE42]/20 text-[#00AE42] border border-[#00AE42]/30">
                Asset Hub
              </span>
            </div>
            <p className="text-[11px] text-gray-400">Phase 6: Farm Production &amp; Tag Manager</p>
          </div>
        </div>

        {/* Center / Path display & Actions */}
        <div className="flex items-center gap-2.5 max-w-2xl flex-1">
          <div className="flex items-center flex-1 bg-[#121417] border border-[#2C323B] rounded-lg px-3 py-1.5 text-xs text-gray-300 font-mono overflow-hidden focus-within:border-[#00AE42]/60 transition-colors">
            {config?.root_path ? (
              <FolderCheck className="w-4 h-4 text-[#00AE42] shrink-0 mr-2" />
            ) : (
              <FolderX className="w-4 h-4 text-amber-500 shrink-0 mr-2" />
            )}
            <span className="truncate flex-1" title={config?.root_path || 'No root path set'}>
              {loadingConfig ? 'Loading configuration...' : config?.root_path || 'No library folder selected'}
            </span>
          </div>

          {/* Select Root Folder Button */}
          <button
            onClick={handleSelectFolder}
            className="flex items-center gap-1.5 bg-[#00AE42] hover:bg-[#009638] text-white text-xs font-semibold px-3 py-2 rounded-lg transition-all duration-150 shadow-sm active:scale-95 shrink-0"
            title="Browse and select root model directory"
          >
            <FolderOpen className="w-4 h-4" />
            <span className="hidden sm:inline">Select Root</span>
          </button>

          {/* Refresh Library Button */}
          <button
            onClick={() => config?.root_path && scanLibrary(config.root_path)}
            disabled={!config?.root_path || scanning}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border transition-all duration-150 shrink-0 ${
              config?.root_path && !scanning
                ? 'bg-[#1E2228] hover:bg-[#252B33] text-gray-200 border-[#2C323B] hover:border-gray-500 active:scale-95 cursor-pointer'
                : 'bg-[#181B20] text-gray-600 border-[#22272E] cursor-not-allowed opacity-60'
            }`}
            title="Rescan library models directory"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#00AE42] ${scanning ? 'animate-spin' : ''}`} />
            <span className="hidden md:inline">{scanning ? 'Scanning...' : 'Refresh'}</span>
          </button>

          {/* Reveal Root in Explorer Button */}
          <button
            onClick={handleRevealInExplorer}
            disabled={!config?.root_path}
            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-2 rounded-lg border transition-all duration-150 shrink-0 ${
              config?.root_path
                ? 'bg-[#1E2228] hover:bg-[#252B33] text-gray-300 border-[#2C323B] hover:border-gray-500 active:scale-95 cursor-pointer'
                : 'bg-[#181B20] text-gray-600 border-[#22272E] cursor-not-allowed opacity-60'
            }`}
            title="Reveal root directory in Windows Explorer"
          >
            <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>

        {/* Right Info Pill */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <span className="text-xs font-semibold text-gray-200 block">
              {models.length} {models.length === 1 ? 'Model' : 'Models'}
            </span>
            <span className="text-[10px] text-gray-500">
              {models.reduce(
                (acc, m) =>
                  acc +
                  m.formats.threemf.length +
                  m.formats.stp.length +
                  m.formats.stl.length +
                  m.formats.obj.length,
                0
              )}{' '}
              Files
            </span>
          </div>
        </div>
      </header>

      {/* Phase 6 Interactive Icon Tag Filter Bar & Color Swatch Spool Match Row */}
      <FilterBar
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        availableTags={config?.available_tags || []}
        selectedTags={selectedTags}
        onToggleTag={handleToggleTagFilter}
        onClearTags={() => setSelectedTags([])}
        tagCounts={tagCounts}
        availableFilaments={availableFilaments}
        selectedHexes={selectedHexes}
        onToggleHex={handleToggleHexFilter}
        onClearHexes={() => setSelectedHexes([])}
        strictAmsMatch={strictAmsMatch}
        onToggleStrictAmsMatch={() => setStrictAmsMatch(!strictAmsMatch)}
        totalModels={models.length}
        filteredCount={filteredModels.length}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        gridDensity={gridDensity}
        onGridDensityChange={setGridDensity}
        selectedStatuses={selectedStatuses}
        onToggleStatus={handleToggleStatusFilter}
        onClearStatuses={() => setSelectedStatuses([])}
      />

      {/* Status banner (if message exists) */}
      {statusMessage && (
        <div
          className={`px-5 py-2 text-xs flex items-center justify-between border-b transition-all ${
            statusMessage.type === 'success'
              ? 'bg-[#00AE42]/10 border-[#00AE42]/30 text-emerald-400'
              : statusMessage.type === 'error'
              ? 'bg-rose-950/40 border-rose-800/40 text-rose-300'
              : 'bg-[#1E2228] border-[#2C323B] text-gray-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-[#00AE42]" />
            ) : statusMessage.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-400" />
            ) : (
              <SlidersHorizontal className="w-4 h-4 text-gray-400" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-[10px] text-gray-400 hover:text-white underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-5" id="models-container">
        {/* Loading / Scanning Skeleton */}
        {scanning ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-gray-400">
            <RefreshCw className="w-8 h-8 text-[#00AE42] animate-spin mb-3" />
            <p className="text-sm font-medium text-gray-200">Scanning Library Directory...</p>
            <p className="text-xs text-gray-500 mt-1">
              Extracting tags, 3MF production metadata, plate thumbnails, and CAD formats
            </p>
          </div>
        ) : !config?.root_path ? (
          /* Empty State: No Root Path */
          <div className="flex flex-col items-center justify-center h-full min-h-[360px] text-center p-8">
            <div className="w-16 h-16 rounded-2xl bg-[#181B20] border border-[#2C323B] flex items-center justify-center text-amber-400 mb-4 shadow-lg">
              <FolderX className="w-8 h-8" />
            </div>
            <h2 className="text-lg font-bold text-white mb-2">No 3D Library Selected</h2>
            <p className="text-xs text-gray-400 max-w-sm mb-6 leading-relaxed">
              Select the root folder containing your 3D models. Each top-level subfolder inside it will automatically be cataloged as an individual model.
            </p>
            <button
              onClick={handleSelectFolder}
              className="flex items-center gap-2 bg-[#00AE42] hover:bg-[#009638] text-white text-xs font-semibold py-2.5 px-5 rounded-lg transition-all shadow-md active:scale-95"
            >
              <FolderOpen className="w-4 h-4" />
              <span>Select Library Root Directory</span>
            </button>
          </div>
        ) : models.length === 0 ? (
          /* Empty State: 0 Models Found */
          <div className="flex flex-col items-center justify-center h-full min-h-[360px] text-center p-8">
            <div className="w-16 h-16 rounded-2xl bg-[#181B20] border border-[#2C323B] flex items-center justify-center text-gray-500 mb-4 shadow-lg">
              <Box className="w-8 h-8" />
            </div>
            <h2 className="text-lg font-bold text-white mb-2">No Model Folders Found</h2>
            <p className="text-xs text-gray-400 max-w-sm mb-6 leading-relaxed">
              No subdirectories were found inside <span className="font-mono text-gray-300">{config.root_path}</span>. Ensure each 3D model is organized in its own subfolder.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => scanLibrary(config.root_path)}
                className="flex items-center gap-2 bg-[#1E2228] hover:bg-[#252B33] text-gray-200 border border-[#2C323B] text-xs font-medium py-2 px-4 rounded-lg transition-all active:scale-95"
              >
                <RefreshCw className="w-4 h-4 text-[#00AE42]" />
                <span>Rescan</span>
              </button>
              <button
                onClick={handleRevealInExplorer}
                className="flex items-center gap-2 bg-[#1E2228] hover:bg-[#252B33] text-gray-200 border border-[#2C323B] text-xs font-medium py-2 px-4 rounded-lg transition-all active:scale-95"
              >
                <ExternalLink className="w-4 h-4 text-gray-400" />
                <span>Open Folder in Explorer</span>
              </button>
            </div>
          </div>
        ) : filteredModels.length === 0 ? (
          /* Search / Filter Empty State */
          <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center p-8">
            <Search className="w-8 h-8 text-gray-600 mb-3" />
            <h3 className="text-sm font-semibold text-gray-300 mb-1">No matching models found</h3>
            <p className="text-xs text-gray-500 mb-4">
              {strictAmsMatch && selectedHexes.length > 0
                ? 'No models can be printed with your currently selected spools in Strict AMS mode'
                : selectedTags.length > 0
                ? 'No models match the selected tag filters'
                : `No model names or metadata matched "${searchQuery}"`}
            </p>
            <div className="flex items-center gap-2">
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-xs text-[#00AE42] hover:underline"
                >
                  Clear search
                </button>
              )}
              {selectedTags.length > 0 && (
                <button
                  onClick={() => setSelectedTags([])}
                  className="text-xs text-[#00AE42] hover:underline ml-3"
                >
                  Clear tags
                </button>
              )}
              {selectedHexes.length > 0 && (
                <button
                  onClick={() => setSelectedHexes([])}
                  className="text-xs text-[#00AE42] hover:underline ml-3"
                >
                  Clear spools
                </button>
              )}
              {selectedStatuses.length > 0 && (
                <button
                  onClick={() => setSelectedStatuses([])}
                  className="text-xs text-[#00AE42] hover:underline ml-3"
                >
                  Clear status
                </button>
              )}
            </div>
          </div>
        ) : viewMode === 'list' ? (
          /* List View */
          <div className="flex flex-col gap-2.5">
            {filteredModels.map((model) => (
              <ModelListItem
                key={model.id}
                model={model}
                activeImageIndex={modelIndices[model.id] ?? 0}
                onSelect={(m, idx) => handleSelectModel(m, idx)}
                availableTags={config?.available_tags || []}
                defaultCostPerKg={config?.default_cost_per_kg || 85.0}
                currencySymbol={config?.currency_symbol || '¥'}
                onModelUpdated={handleModelUpdated}
                onModelDeleted={handleModelDeleted}
              />
            ))}
          </div>
        ) : (
          /* Responsive Models Grid with density */
          <div
            className={`grid gap-4 ${
              gridDensity === 'compact'
                ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3'
                : gridDensity === 'large'
                ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'
                : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4'
            }`}
          >
            {filteredModels.map((model) => (
              <ModelCard
                key={model.id}
                model={model}
                activeImageIndex={modelIndices[model.id] ?? 0}
                onActiveIndexChange={(newIndex) => handleModelIndexChange(model.id, newIndex)}
                onSelect={(m, idx) => handleSelectModel(m, idx)}
                availableTags={config?.available_tags || []}
                defaultCostPerKg={config?.default_cost_per_kg || 85.0}
                currencySymbol={config?.currency_symbol || '¥'}
                onUpdateTags={handleUpdateModelTags}
                onModelUpdated={handleModelUpdated}
                onModelDeleted={handleModelDeleted}
                rootPath={config?.root_path || ''}
                isExternalDragOver={dragOverModelId === model.id}
              />
            ))}

            {/* New Model Ingestion Card / Drop Zone */}
            <div
              data-drop-zone="new-model"
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={async () => {
                if (!config?.root_path) return;
                try {
                  const selected = await open({
                    multiple: true,
                    title: 'Select 3D Files or Previews to Create New Model',
                    filters: [
                      {
                        name: '3D Files & Previews',
                        extensions: ['3mf', 'stp', 'step', 'stl', 'obj', 'png', 'jpg', 'jpeg', 'webp'],
                      },
                    ],
                  });
                  if (selected && selected.length > 0) {
                    const paths = Array.isArray(selected) ? selected : [selected];
                    const duplicate = findPotentialDuplicate(paths, modelsRef.current);
                    if (duplicate) {
                      console.log('[DEBUG][Ingest] Potential duplicate detected on browse:', duplicate.existingModel.name);
                      setPendingDuplicate({
                        existingModel: duplicate.existingModel,
                        conflictingFiles: duplicate.conflictingFiles,
                        pendingPaths: paths,
                      });
                      return;
                    }
                    await executeNewModelIngest(paths);
                  }
                } catch (err) {
                  console.error('[DEBUG][Ingest] File selection failed:', err);
                }
              }}
              className={`border-2 border-dashed ${
                isDragOverNewZone
                  ? 'border-[#00AE42] bg-[#00AE42]/15 ring-2 ring-[#00AE42]/50 scale-[1.02]'
                  : 'border-[#2C323B] hover:border-[#00AE42] bg-[#14161A]/50 hover:bg-[#181B20]'
              } rounded-xl flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-all duration-150 min-h-[220px] group/new shadow-sm`}
              title="Drag and drop 3D files here, or click to browse"
            >
              <div
                className={`w-12 h-12 rounded-xl border flex items-center justify-center mb-3 transition-colors shadow-inner ${
                  isDragOverNewZone
                    ? 'bg-[#00AE42]/20 border-[#00AE42] text-[#00AE42] animate-bounce'
                    : 'bg-[#181B20] border-[#2C323B] group-hover/new:border-[#00AE42]/50 text-gray-500 group-hover/new:text-[#00AE42]'
                }`}
              >
                <Upload className="w-6 h-6" />
              </div>
              <span
                className={`text-xs font-semibold transition-colors ${
                  isDragOverNewZone ? 'text-[#00AE42]' : 'text-gray-300 group-hover/new:text-white'
                }`}
              >
                {isDragOverNewZone ? 'Drop to Ingest into New Model' : '+ Drop New Model Here'}
              </span>
              <span className="text-[10px] text-gray-500 mt-1 max-w-[150px] leading-tight">
                Drop .3mf, .stp, .stl, or images to auto-create folder &amp; route files
              </span>
            </div>
          </div>
        )}
      </main>

      {/* Model Detail Inspection Modal */}
      {selectedModel && (
        <ModelDetailModal
          model={selectedModel}
          initialIndex={modelIndices[selectedModel.id] ?? 0}
          onIndexChange={(newIndex) => handleModelIndexChange(selectedModel.id, newIndex)}
          onClose={() => setSelectedModel(null)}
          availableTags={config?.available_tags || []}
          defaultCostPerKg={config?.default_cost_per_kg || 85.0}
          currencySymbol={config?.currency_symbol || '¥'}
          onUpdateTags={handleUpdateModelTags}
          onModelUpdated={handleModelUpdated}
          onModelDeleted={handleModelDeleted}
        />
      )}

      {/* Duplicate Ingestion Warning Modal */}
      {pendingDuplicate && (
        <DuplicateWarningModal
          isOpen={!!pendingDuplicate}
          existingModel={pendingDuplicate.existingModel}
          conflictingFiles={pendingDuplicate.conflictingFiles}
          pendingFilePaths={pendingDuplicate.pendingPaths}
          onOpenExisting={(model) => {
            setPendingDuplicate(null);
            handleSelectModel(model, 0);
            showStatus(`Viewing existing model: ${model.name}`, 'info');
          }}
          onConfirmCreateAnyway={(paths) => {
            setPendingDuplicate(null);
            executeNewModelIngest(paths);
          }}
          onUpdateExisting={(existingModel, paths) => {
            handleUpdateExistingModel(existingModel, paths);
          }}
          onCancel={() => setPendingDuplicate(null)}
        />
      )}
    </div>
  );
};

export default App;
