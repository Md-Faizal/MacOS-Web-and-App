import React, { useState } from 'react';
import { Sparkles, ChevronUp, ChevronDown } from 'lucide-react';

interface ExplorePanelProps {
  onExploreQuery?: (query: string) => void;
}

export const ExplorePanel: React.FC<ExplorePanelProps> = ({ onExploreQuery }) => {
  const [isOpen, setIsOpen] = useState(true);
  const [queryText, setQueryText] = useState('I want to know what caused the drop-off from authorized to');
  const [tokenText, setTokenText] = useState('/successful payments/');

  return (
    <div className="w-full relative select-none" id="ai-exploration-panel">
      {/* Light blue rounded glass container matching screenshot */}
      <div className="bg-[#EBF2FE] border border-[#D5E3FC] rounded-[16px] p-2.5 sm:p-3 transition-all duration-200">
        {/* Top Header Row */}
        <div
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center justify-between cursor-pointer select-none pb-2"
        >
          <div className="flex items-center gap-1.5 text-[13px] font-medium text-[#486284]">
            {/* Sparkle icon */}
            <Sparkles className="w-3.5 h-3.5 text-[#3B82F6] stroke-[2.2]" />
            <span>What would you like to explore next?</span>
          </div>

          <button
            type="button"
            aria-label="Toggle explore panel"
            className="w-5 h-5 rounded-full bg-blue-100/70 hover:bg-blue-200/80 flex items-center justify-center text-[#2563EB] transition-colors cursor-pointer"
          >
            {isOpen ? <ChevronUp className="w-3.5 h-3.5 stroke-[2.5]" /> : <ChevronDown className="w-3.5 h-3.5 stroke-[2.5]" />}
          </button>
        </div>

        {/* Input box */}
        {isOpen && (
          <div className="w-full bg-white rounded-[10px] border border-[#D0E0FA] px-3 py-2 flex items-center gap-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
            <span className="text-[13px] text-[#222222] whitespace-nowrap">
              {queryText}
            </span>

            {/* Peach / Orange Highlight Chip matching screenshot */}
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-[5px] bg-[#FFF4EB] border border-[#FFD2B0] text-[#DE6206] font-normal text-[12px]">
              {tokenText}
            </span>

            {/* Blinking text input cursor */}
            <span className="inline-block w-[1px] h-3.5 bg-[#111111] animate-pulse" />
          </div>
        )}
      </div>
    </div>
  );
};
