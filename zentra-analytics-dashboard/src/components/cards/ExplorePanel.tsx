import React, { useState } from 'react';
import { Sparkles, ChevronUp, ChevronDown } from 'lucide-react';

interface ExplorePanelProps {
  onExploreQuery?: (query: string) => void;
}

export const ExplorePanel: React.FC<ExplorePanelProps> = ({ onExploreQuery }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [queryText, setQueryText] = useState('I want to know what caused the drop-off from authorized to');
  const [tokenText, setTokenText] = useState('/successful payments/');

  return (
    <div className="relative z-20 mt-2 w-full" id="ai-exploration-panel">
      {!isOpen ? (
        <div
          onClick={() => setIsOpen(true)}
          className="flex cursor-pointer select-none items-center justify-between gap-2 rounded-[18px] border border-white/60 bg-[linear-gradient(135deg,rgba(213,229,251,0.9),rgba(190,212,246,0.8))] px-3 py-2.5 shadow-[0_8px_22px_-12px_rgba(76,145,255,0.38),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-md"
        >
          <div className="flex min-w-0 items-center gap-1.5 text-[12.5px] font-medium text-[#486284]">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#3B82F6] stroke-[2.2]" />
            <span className="truncate">What would you like to explore next?</span>
          </div>

          <button
            type="button"
            aria-label="Toggle explore panel"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100/80 text-[#2563EB] transition-colors hover:bg-blue-200/80"
          >
            <ChevronDown className="h-3.5 w-3.5 stroke-[2.4]" />
          </button>
        </div>
      ) : (
        <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 rounded-[18px] border border-white/60 bg-[linear-gradient(135deg,rgba(213,229,251,0.98),rgba(190,212,246,0.92))] p-3 shadow-[0_18px_42px_-18px_rgba(76,145,255,0.5),inset_0_1px_0_rgba(255,255,255,0.8)] backdrop-blur-md">
          <div
            onClick={() => setIsOpen(false)}
            className="flex cursor-pointer select-none items-center justify-between gap-2"
          >
            <div className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-[#486284]">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#3B82F6] stroke-[2.2]" />
              <span className="truncate">What would you like to explore next?</span>
            </div>

            <button
              type="button"
              aria-label="Toggle explore panel"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100/80 text-[#2563EB] transition-colors hover:bg-blue-200/80"
            >
              <ChevronUp className="h-3.5 w-3.5 stroke-[2.4]" />
            </button>
          </div>

          <div className="mt-2 overflow-hidden">
            <div className="flex items-center gap-1.5 rounded-[10px] border border-[#D0E0FA] bg-white px-2.5 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
              <span className="min-w-0 text-[12px] text-[#222222] whitespace-nowrap">
                {queryText}
              </span>
              <span className="inline-flex shrink-0 items-center rounded-[5px] border border-[#FFD2B0] bg-[#FFF4EB] px-1.5 py-0.5 text-[11px] text-[#DE6206]">
                {tokenText}
              </span>
              <span className="inline-block h-3.5 w-[1px] animate-pulse bg-[#111111]" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
