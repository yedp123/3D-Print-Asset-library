import React, { useState, useEffect, useCallback } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { ChevronLeft, ChevronRight, Box } from 'lucide-react';

interface ImageCarouselProps {
  images: string[];
  alt: string;
  aspectRatio?: string;
  enableKeyboard?: boolean;
  onImageClick?: () => void;
  className?: string;
  currentIndex?: number;
  onIndexChange?: (index: number) => void;
  current3mfName?: string | null;
}

export const ImageCarousel: React.FC<ImageCarouselProps> = ({
  images,
  alt,
  aspectRatio = 'aspect-[4/3]',
  enableKeyboard = false,
  onImageClick,
  className = '',
  currentIndex: externalIndex,
  onIndexChange,
  current3mfName,
}) => {
  const [internalIndex, setInternalIndex] = useState(0);

  const isControlled = externalIndex !== undefined;
  const activeIndex = isControlled ? externalIndex : internalIndex;

  const updateIndex = useCallback(
    (newIndex: number) => {
      if (!isControlled) {
        setInternalIndex(newIndex);
      }
      if (onIndexChange) {
        onIndexChange(newIndex);
      }
    },
    [isControlled, onIndexChange]
  );

  // Reset index if image list changes or shrinks
  useEffect(() => {
    if (activeIndex >= images.length && images.length > 0) {
      updateIndex(0);
    }
  }, [images.length, activeIndex, updateIndex]);

  const goToPrev = useCallback(
    (e?: React.MouseEvent | KeyboardEvent) => {
      if (e && 'stopPropagation' in e) e.stopPropagation();
      if (images.length <= 1) return;
      const next = activeIndex === 0 ? images.length - 1 : activeIndex - 1;
      updateIndex(next);
    },
    [images.length, activeIndex, updateIndex]
  );

  const goToNext = useCallback(
    (e?: React.MouseEvent | KeyboardEvent) => {
      if (e && 'stopPropagation' in e) e.stopPropagation();
      if (images.length <= 1) return;
      const next = activeIndex === images.length - 1 ? 0 : activeIndex + 1;
      updateIndex(next);
    },
    [images.length, activeIndex, updateIndex]
  );

  // Keyboard navigation when enabled (e.g. in Modal)
  useEffect(() => {
    if (!enableKeyboard || images.length <= 1) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        goToPrev(e);
      } else if (e.key === 'ArrowRight') {
        goToNext(e);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enableKeyboard, images.length, goToNext, goToPrev]);

  if (images.length === 0) {
    return (
      <div
        className={`w-full ${aspectRatio} bg-[#14161A] flex flex-col items-center justify-center text-gray-500 select-none ${className}`}
      >
        <div className="w-14 h-14 rounded-2xl bg-[#181B20] border border-[#2C323B] flex items-center justify-center text-gray-500 mb-2 shadow-inner">
          <Box className="w-7 h-7 stroke-[1.5]" />
        </div>
        <span className="text-xs font-medium text-gray-500">No Preview Available</span>
      </div>
    );
  }

  const currentPath = images[activeIndex];
  const webviewSrc = convertFileSrc(currentPath);

  return (
    <div
      onClick={onImageClick}
      className={`relative w-full ${aspectRatio} bg-[#14161A] overflow-hidden flex items-center justify-center select-none group ${className}`}
    >
      {/* Active Image */}
      <img
        src={webviewSrc}
        alt={`${alt} preview ${activeIndex + 1}`}
        className="w-full h-full object-contain p-2 transition-all duration-200"
        loading="lazy"
      />

      {/* Top-Center 3MF Filename Badge */}
      {current3mfName && (
        <div
          className="absolute top-2.5 left-1/2 -translate-x-1/2 max-w-[calc(100%-120px)] px-2.5 py-0.5 rounded-full bg-black/75 backdrop-blur-md text-[11px] font-mono text-gray-100 font-medium z-20 border border-white/15 shadow-md truncate text-center flex items-center gap-1.5 pointer-events-none"
          title={current3mfName}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#00AE42] shrink-0" />
          <span className="truncate">{current3mfName}</span>
        </div>
      )}

      {/* Left / Right Hover Arrows (visible on hover if > 1 image) */}
      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={goToPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 backdrop-blur-sm z-20 shadow-lg border border-white/10 active:scale-95"
            title="Previous image"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={goToNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 backdrop-blur-sm z-20 shadow-lg border border-white/10 active:scale-95"
            title="Next image"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </>
      )}

      {/* Top-Right 1 / N Counter Badge */}
      {images.length > 1 && (
        <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-black/65 backdrop-blur-md text-[10px] font-mono text-gray-200 font-medium z-20 border border-white/10 shadow-sm">
          {activeIndex + 1} / {images.length}
        </div>
      )}

      {/* Bottom Center Pagination Dots Bar */}
      {images.length > 1 && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-2.5 inset-x-0 flex items-center justify-center z-20 pointer-events-auto"
        >
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 shadow-sm max-w-[90%] overflow-x-auto">
            {images.slice(0, 10).map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  updateIndex(idx);
                }}
                className={`rounded-full transition-all duration-150 ${
                  idx === activeIndex
                    ? 'w-4 h-1.5 bg-[#00AE42] shadow-sm shadow-[#00AE42]/50'
                    : 'w-1.5 h-1.5 bg-gray-400/60 hover:bg-white/80'
                }`}
                title={`Jump to image ${idx + 1}`}
              />
            ))}
            {images.length > 10 && (
              <span className="text-[9px] text-gray-400 font-mono ml-0.5">
                +{images.length - 10}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
