import React, { useState, useRef, useEffect } from 'react';
import { MoreHorizontal, Download, Share2, RefreshCw, Eye } from 'lucide-react';

interface OverflowMenuProps {
  cardTitle?: string;
  className?: string;
  onAction?: (action: string) => void;
}

export const OverflowMenu: React.FC<OverflowMenuProps> = ({
  cardTitle = 'Card',
  className = '',
  onAction,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleItemClick = (actionName: string) => {
    setIsOpen(false);
    if (onAction) {
      onAction(actionName);
    }
  };

  return (
    <div className={`relative ${className}`} ref={menuRef} id={`overflow-menu-${cardTitle.toLowerCase().replace(/\s+/g, '-')}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`Options for ${cardTitle}`}
        className="w-8 h-8 rounded-full bg-white hover:bg-black/[0.02] border border-black/[0.08] flex items-center justify-center text-[#555555] hover:text-[#111111] transition-all shadow-[0_1px_2px_rgba(0,0,0,0.02)] active:scale-95 cursor-pointer"
      >
        <MoreHorizontal className="w-4 h-4 text-[#555555]" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-10 w-48 bg-white/95 backdrop-blur-md rounded-2xl shadow-[0_12px_32px_-4px_rgba(0,0,0,0.14),0_0_1px_1px_rgba(0,0,0,0.05)] border border-black/[0.06] py-1.5 z-40 animate-in fade-in zoom-in-95 duration-150">
          <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#888888] border-b border-black/[0.04]">
            {cardTitle}
          </div>
          <button
            onClick={() => handleItemClick('export')}
            className="w-full text-left px-3.5 py-2 text-[13px] text-[#333333] hover:bg-[#F3F3F2] flex items-center gap-2.5 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-[#666666]" />
            Export CSV
          </button>
          <button
            onClick={() => handleItemClick('view')}
            className="w-full text-left px-3.5 py-2 text-[13px] text-[#333333] hover:bg-[#F3F3F2] flex items-center gap-2.5 transition-colors cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5 text-[#666666]" />
            View raw data
          </button>
          <button
            onClick={() => handleItemClick('share')}
            className="w-full text-left px-3.5 py-2 text-[13px] text-[#333333] hover:bg-[#F3F3F2] flex items-center gap-2.5 transition-colors cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5 text-[#666666]" />
            Share widget
          </button>
          <button
            onClick={() => handleItemClick('refresh')}
            className="w-full text-left px-3.5 py-2 text-[13px] text-[#333333] hover:bg-[#F3F3F2] flex items-center gap-2.5 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#666666]" />
            Refresh data
          </button>
        </div>
      )}
    </div>
  );
};
