import React, { useState, useMemo } from 'react';
import { TagDefinition } from '../types/models';
import { getTagIconComponent } from '../utils/tagIcons';
import { 
  Search, 
  X, 
  Check, 
  Sparkles,
  CheckCircle2,
  LayoutGrid,
  List,
  ChevronDown,
  ChevronUp,
  AlertTriangle
} from 'lucide-react';

export type ViewMode = 'grid' | 'list';
export type GridDensity = 'compact' | 'standard' | 'large';

export interface FilamentOption {
  hex: string;
  name: string;
  count: number;
}

interface FilterBarProps {
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  availableTags: TagDefinition[];
  selectedTags: string[];
  onToggleTag: (tagId: string) => void;
  onClearTags: () => void;
  tagCounts: Record<string, number>;
  availableFilaments: FilamentOption[];
  selectedHexes: string[];
  onToggleHex: (hex: string) => void;
  onClearHexes: () => void;
  strictAmsMatch: boolean;
  onToggleStrictAmsMatch: () => void;
  totalModels: number;
  filteredCount: number;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  gridDensity: GridDensity;
  onGridDensityChange: (density: GridDensity) => void;
  selectedStatuses: string[];
  onToggleStatus: (status: string) => void;
  onClearStatuses: () => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  searchQuery,
  onSearchQueryChange,
  availableTags,
  selectedTags,
  onToggleTag,
  onClearTags,
  tagCounts,
  availableFilaments,
  selectedHexes,
  onToggleHex,
  onClearHexes,
  strictAmsMatch,
  onToggleStrictAmsMatch,
  totalModels,
  filteredCount,
  viewMode,
  onViewModeChange,
  gridDensity,
  onGridDensityChange,
  selectedStatuses,
  onToggleStatus,
  onClearStatuses,
}) => {
  const [spoolsExpanded, setSpoolsExpanded] = useState<boolean>(false);

  // If not expanded, show selected spools first, followed by other spools up to 12 total
  const visibleFilaments = useMemo(() => {
    if (spoolsExpanded || availableFilaments.length <= 12) {
      return availableFilaments;
    }
    const selected = availableFilaments.filter((f) => selectedHexes.includes(f.hex.toLowerCase()));
    const unselected = availableFilaments.filter((f) => !selectedHexes.includes(f.hex.toLowerCase()));
    const combined = [...selected, ...unselected];
    return combined.slice(0, Math.max(12, selected.length));
  }, [availableFilaments, selectedHexes, spoolsExpanded]);

  const remainingCount = availableFilaments.length - visibleFilaments.length;

  return (
    <div className="bg-[#14161A] border-b border-[#2C323B] px-5 py-2.5 flex flex-col gap-2.5 shrink-0 transition-all">
      {/* Top Row: Search Input + Status Pills + Visual Tag Filter Pills + View Controls + Models Count */}
      <div className="flex items-center justify-between gap-3 flex-wrap lg:flex-nowrap">
        {/* Search Input Box */}
        <div className="flex items-center gap-2 w-full lg:w-72 bg-[#181B20] border border-[#2C323B] rounded-lg px-3 py-1.5 text-xs focus-within:border-[#00AE42]/60 focus-within:ring-1 focus-within:ring-[#00AE42]/30 transition-all shrink-0">
          <Search className="w-3.5 h-3.5 text-gray-500 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder="Search models, files, filaments..."
            className="bg-transparent text-gray-200 placeholder-gray-500 focus:outline-none w-full text-xs"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchQueryChange('')}
              className="text-gray-500 hover:text-gray-300 transition-colors"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* QA Status & VIP Filter Pills */}
        <div className="flex items-center gap-1 shrink-0 border-r border-[#2C323B] pr-2.5 mr-0.5">
          {/* Approved Pill */}
          <button
            type="button"
            onClick={() => onToggleStatus('approved')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all select-none ${
              selectedStatuses.includes('approved')
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/60 shadow-[0_0_8px_rgba(0,174,66,0.25)]'
                : 'bg-[#181B20] hover:bg-[#20252D] text-gray-400 border border-[#2C323B] hover:border-gray-500'
            }`}
            title="Filter models marked Approved"
          >
            <Check className="w-3 h-3 text-emerald-400" />
            <span>Approved</span>
          </button>

          {/* Needs Fix Pill */}
          <button
            type="button"
            onClick={() => onToggleStatus('needs_fix')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all select-none ${
              selectedStatuses.includes('needs_fix')
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/60 shadow-[0_0_8px_rgba(244,63,94,0.25)]'
                : 'bg-[#181B20] hover:bg-[#20252D] text-gray-400 border border-[#2C323B] hover:border-gray-500'
            }`}
            title="Filter models marked Needs Fix"
          >
            <AlertTriangle className="w-3 h-3 text-rose-400" />
            <span>Needs Fix</span>
          </button>

          {/* VIP Pill */}
          <button
            type="button"
            onClick={() => onToggleStatus('vip')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all select-none ${
              selectedStatuses.includes('vip')
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/60 shadow-[0_0_8px_rgba(245,158,11,0.25)] font-semibold'
                : 'bg-[#181B20] hover:bg-[#20252D] text-gray-400 border border-[#2C323B] hover:border-gray-500'
            }`}
            title="Filter VIP models"
          >
            <span>⭐ VIP</span>
          </button>

          {selectedStatuses.length > 0 && (
            <button
              type="button"
              onClick={onClearStatuses}
              className="text-[10px] text-gray-500 hover:text-gray-300 px-1 py-0.5 rounded transition-colors"
              title="Clear status filter"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Visual Tag Filter Pills */}
        <div className="flex items-center gap-1.5 flex-1 overflow-x-auto py-0.5 no-scrollbar">
          {availableTags.map((tag) => {
            const Icon = getTagIconComponent(tag.icon);
            const isSelected = selectedTags.includes(tag.id.toLowerCase());
            const count = tagCounts[tag.id.toLowerCase()] || 0;

            return (
              <button
                key={tag.id}
                onClick={() => onToggleTag(tag.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-150 shrink-0 select-none ${
                  isSelected
                    ? 'bg-[#1E2620] border shadow-sm ring-1'
                    : 'bg-[#181B20] hover:bg-[#20252D] text-gray-300 border border-[#2C323B] hover:border-gray-500'
                }`}
                style={
                  isSelected
                    ? {
                        borderColor: tag.color || '#00AE42',
                        color: '#FFFFFF',
                        boxShadow: `0 0 10px ${tag.color || '#00AE42'}25`,
                      }
                    : undefined
                }
                title={`Filter by tag: ${tag.label} (${count} models)`}
              >
                <Icon
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: isSelected ? tag.color || '#00AE42' : '#9CA3AF' }}
                />
                <span>{tag.label}</span>
                {count > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-[#121417] text-gray-500 border border-[#2C323B]'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}

          {selectedTags.length > 0 && (
            <button
              onClick={onClearTags}
              className="flex items-center gap-1 px-2 py-1 text-[11px] text-gray-400 hover:text-gray-200 bg-[#181B20] hover:bg-[#22272E] border border-[#2C323B] rounded-full transition-colors shrink-0"
              title="Clear tag filters"
            >
              <X className="w-3 h-3" />
              <span>Reset Tags</span>
            </button>
          )}
        </div>
      </div>

      {/* Middle Row: Filament Color Swatches + Strict AMS Spool Match Switch */}
      {availableFilaments.length > 0 && (
        <div className="flex items-center justify-between gap-4 pt-1.5 border-t border-[#2C323B]/50 flex-wrap lg:flex-nowrap">
          {/* Swatches List */}
          <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-gray-400 font-medium shrink-0 mr-1">
              <Sparkles className="w-3.5 h-3.5 text-[#00AE42]" />
              <span className="hidden sm:inline text-[11px]">Filament Spools:</span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {visibleFilaments.map((f) => {
                const isSelected = selectedHexes.includes(f.hex.toLowerCase());
                return (
                  <button
                    key={f.hex}
                    type="button"
                    onClick={() => onToggleHex(f.hex)}
                    className={`group relative flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono border transition-all ${
                      isSelected
                        ? 'bg-[#1E2620] border-[#00AE42] text-white shadow-[0_0_8px_rgba(0,174,66,0.3)] ring-1 ring-[#00AE42]/40'
                        : 'bg-[#181B20] hover:bg-[#22272E] border-[#2C323B] text-gray-400 hover:text-gray-200'
                    }`}
                    title={`${f.name} (${f.hex}) • ${f.count} ${f.count === 1 ? 'model' : 'models'}`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-white/20 shadow-inner shrink-0"
                      style={{ backgroundColor: f.hex }}
                    />
                    <span className="truncate max-w-[85px]">{f.name}</span>
                    {isSelected && <Check className="w-2.5 h-2.5 text-[#00AE42] shrink-0" />}
                  </button>
                );
              })}

              {/* Show More / Show Less Button */}
              {availableFilaments.length > 12 && (
                <button
                  type="button"
                  onClick={() => setSpoolsExpanded(!spoolsExpanded)}
                  className="flex items-center gap-1 text-[10px] text-[#00AE42] hover:text-[#00AE42]/80 bg-[#181B20] hover:bg-[#22272E] border border-[#2C323B] px-2 py-0.5 rounded-full transition-colors font-medium shrink-0"
                  title={spoolsExpanded ? 'Collapse spool list' : 'Show all available spools'}
                >
                  {spoolsExpanded ? (
                    <>
                      <ChevronUp className="w-3 h-3" />
                      <span>Show Less</span>
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-3 h-3" />
                      <span>+{remainingCount} More</span>
                    </>
                  )}
                </button>
              )}

              {selectedHexes.length > 0 && (
                <button
                  type="button"
                  onClick={onClearHexes}
                  className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-white px-2 py-0.5 rounded-md hover:bg-[#1E2228] transition-colors"
                  title="Clear selected spools"
                >
                  <X className="w-3 h-3" />
                  <span>Clear ({selectedHexes.length})</span>
                </button>
              )}
            </div>
          </div>

          {/* Strict AMS Match Toggle Switch */}
          <div className="flex items-center gap-2 shrink-0 bg-[#181B20] border border-[#2C323B] px-3 py-1 rounded-lg">
            <span
              className={`text-[11px] font-medium transition-colors ${
                !strictAmsMatch ? 'text-gray-200' : 'text-gray-500'
              }`}
            >
              Match Any Color
            </span>

            {/* Toggle switch button */}
            <button
              type="button"
              role="switch"
              aria-checked={strictAmsMatch}
              onClick={onToggleStrictAmsMatch}
              className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-1 focus:ring-[#00AE42] ${
                strictAmsMatch ? 'bg-[#00AE42]' : 'bg-[#2C323B]'
              }`}
              title={
                strictAmsMatch
                  ? 'Strict AMS Match: ONLY show models printable using your selected spools'
                  : 'Click to enable Strict AMS Spool Match'
              }
            >
              <div
                className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform duration-200 ease-in-out ${
                  strictAmsMatch ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>

            <span
              className={`text-[11px] font-semibold flex items-center gap-1 transition-colors ${
                strictAmsMatch ? 'text-[#00AE42]' : 'text-gray-400'
              }`}
            >
              <CheckCircle2
                className={`w-3.5 h-3.5 ${
                  strictAmsMatch ? 'text-[#00AE42]' : 'text-gray-600'
                }`}
              />
              Strict AMS Match
            </span>
          </div>
        </div>
      )}

      {/* Bottom Sub-Bar: Model Count on Left + Gallery Density/View Controls on Right */}
      <div className="flex items-center justify-between gap-3 pt-1 border-t border-[#2C323B]/40 text-xs">
        {/* Total Models Counter */}
        <div className="flex items-center gap-2 text-gray-400">
          <span className="text-[11px] whitespace-nowrap">
            Showing <strong className="text-white font-semibold">{filteredCount}</strong> of{' '}
            <span className="font-mono">{totalModels}</span> models
          </span>
          {(selectedTags.length > 0 || selectedHexes.length > 0 || selectedStatuses.length > 0 || searchQuery) && (
            <span className="text-[10px] text-gray-500 font-mono">
              (filtered)
            </span>
          )}
        </div>

        {/* Gallery View Controls (Grid Density + View Mode) */}
        <div className="flex items-center gap-1.5 shrink-0 bg-[#181B20] border border-[#2C323B] p-0.5 rounded-lg shadow-xs">
          {/* Density selector (only in grid mode) */}
          {viewMode === 'grid' && (
            <div className="flex items-center gap-0.5 border-r border-[#2C323B] pr-1.5 mr-0.5">
              <button
                type="button"
                onClick={() => onGridDensityChange('compact')}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                  gridDensity === 'compact'
                    ? 'bg-[#2C323B] text-white font-semibold'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
                title="Compact Grid (Smaller thumbnails, more columns)"
              >
                SM
              </button>
              <button
                type="button"
                onClick={() => onGridDensityChange('standard')}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                  gridDensity === 'standard'
                    ? 'bg-[#2C323B] text-white font-semibold'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
                title="Standard Grid (Balanced view)"
              >
                MD
              </button>
              <button
                type="button"
                onClick={() => onGridDensityChange('large')}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                  gridDensity === 'large'
                    ? 'bg-[#2C323B] text-white font-semibold'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
                title="Large Grid (Hero view, larger thumbnails)"
              >
                LG
              </button>
            </div>
          )}

          {/* Grid / List toggle */}
          <button
            type="button"
            onClick={() => onViewModeChange('grid')}
            className={`p-1 rounded transition-colors ${
              viewMode === 'grid'
                ? 'bg-[#00AE42] text-white shadow-xs'
                : 'text-gray-400 hover:text-gray-200 hover:bg-[#20252D]'
            }`}
            title="Grid View"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('list')}
            className={`p-1 rounded transition-colors ${
              viewMode === 'list'
                ? 'bg-[#00AE42] text-white shadow-xs'
                : 'text-gray-400 hover:text-gray-200 hover:bg-[#20252D]'
            }`}
            title="List View"
          >
            <List className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
