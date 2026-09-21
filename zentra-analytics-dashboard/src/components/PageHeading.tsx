import React, { useState } from 'react';
import { Calendar, ChevronDown, Plus, Link2, Check } from 'lucide-react';

interface PageHeadingProps {
  title?: string;
  onAddWidget?: () => void;
}

export const PageHeading: React.FC<PageHeadingProps> = ({
  title = 'Overview',
  onAddWidget,
}) => {
  const [dateRange1, setDateRange1] = useState('Jan 01 – July 31');
  const [dateRange2, setDateRange2] = useState('Aug 01 – Dec 31');
  const [granularity, setGranularity] = useState('Daily');
  const [showDropdown1, setShowDropdown1] = useState(false);
  const [showDropdown2, setShowDropdown2] = useState(false);
  const [showGranularityDropdown, setShowGranularityDropdown] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyLink = () => {
    navigator.clipboard?.writeText?.(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const datePresets = [
    'Jan 01 – July 31',
    'Aug 01 – Dec 31',
    'Last 30 Days',
    'Last Quarter',
    'Year to Date (YTD)',
    'Full Year 2026',
  ];

  const granularityOptions = ['Hourly', 'Daily', 'Weekly', 'Monthly'];

  return (
    <div className="w-full flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2 pb-1 px-1 select-none" id="page-heading-section">
      {/* Left side: Overview Heading + floating link icon */}
      <div className="flex items-center gap-2.5">
        <h1 className="text-[38px] sm:text-[44px] font-[550] tracking-[-0.035em] text-[#111111] leading-none">
          {title}
        </h1>
        <button
          type="button"
          onClick={handleCopyLink}
          title={copiedLink ? 'Link Copied!' : 'Copy Overview View Link'}
          aria-label="Copy Overview Link"
          id="overview-link-btn"
          className="w-7 h-7 rounded-full bg-white/90 hover:bg-white border border-black/[0.08] flex items-center justify-center text-[#555555] hover:text-[#111111] transition-all shadow-[0_1px_2px_rgba(0,0,0,0.03)] cursor-pointer active:scale-95 shrink-0"
        >
          {copiedLink ? (
            <Check className="w-3.5 h-3.5 text-emerald-600" />
          ) : (
            <Link2 className="w-3.5 h-3.5 text-[#555555]" />
          )}
        </button>
      </div>

      {/* Right side: Date Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        {/* Date Range 1 */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowDropdown1(!showDropdown1);
              setShowDropdown2(false);
              setShowGranularityDropdown(false);
            }}
            id="toolbar-date-range-1"
            className="h-[36px] px-3 rounded-[10px] bg-white hover:bg-black/[0.02] border border-black/[0.08] flex items-center gap-1.5 font-normal text-[#222222] transition-all shadow-[0_1px_2px_rgba(0,0,0,0.02)] cursor-pointer active:scale-[0.99]"
          >
            <Calendar className="w-3.5 h-3.5 text-[#666666]" />
            <span>{dateRange1}</span>
            <ChevronDown className="w-3 h-3 text-[#777777] ml-0.5" />
          </button>

          {showDropdown1 && (
            <div className="absolute left-0 sm:right-0 sm:left-auto top-10 w-52 bg-white rounded-xl shadow-lg border border-black/[0.08] p-1.5 z-40 animate-in fade-in zoom-in-95 duration-150">
              {datePresets.map((preset) => (
                <button
                  key={preset}
                  onClick={() => {
                    setDateRange1(preset);
                    setShowDropdown1(false);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-between cursor-pointer ${
                    dateRange1 === preset ? 'bg-black/[0.05] font-semibold text-[#111111]' : 'text-[#444444] hover:bg-black/[0.03]'
                  }`}
                >
                  <span>{preset}</span>
                  {dateRange1 === preset && <Check className="w-3.5 h-3.5 text-blue-600" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* "compared to" separator label */}
        <span className="text-[#737373] text-[13px] px-0.5">compared to</span>

        {/* Date Range 2 */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowDropdown2(!showDropdown2);
              setShowDropdown1(false);
              setShowGranularityDropdown(false);
            }}
            id="toolbar-date-range-2"
            className="h-[36px] px-3 rounded-[10px] bg-white hover:bg-black/[0.02] border border-black/[0.08] flex items-center gap-1.5 font-normal text-[#222222] transition-all shadow-[0_1px_2px_rgba(0,0,0,0.02)] cursor-pointer active:scale-[0.99]"
          >
            <Calendar className="w-3.5 h-3.5 text-[#666666]" />
            <span>{dateRange2}</span>
            <ChevronDown className="w-3 h-3 text-[#777777] ml-0.5" />
          </button>

          {showDropdown2 && (
            <div className="absolute left-0 sm:right-0 sm:left-auto top-10 w-52 bg-white rounded-xl shadow-lg border border-black/[0.08] p-1.5 z-40 animate-in fade-in zoom-in-95 duration-150">
              {datePresets.map((preset) => (
                <button
                  key={preset}
                  onClick={() => {
                    setDateRange2(preset);
                    setShowDropdown2(false);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-between cursor-pointer ${
                    dateRange2 === preset ? 'bg-black/[0.05] font-semibold text-[#111111]' : 'text-[#444444] hover:bg-black/[0.03]'
                  }`}
                >
                  <span>{preset}</span>
                  {dateRange2 === preset && <Check className="w-3.5 h-3.5 text-blue-600" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Granularity Dropdown (Daily) */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowGranularityDropdown(!showGranularityDropdown);
              setShowDropdown1(false);
              setShowDropdown2(false);
            }}
            id="toolbar-granularity"
            className="h-[36px] px-3 rounded-[10px] bg-white hover:bg-black/[0.02] border border-black/[0.08] flex items-center gap-1 text-[#222222] transition-all shadow-[0_1px_2px_rgba(0,0,0,0.02)] cursor-pointer active:scale-[0.99]"
          >
            <span>{granularity}</span>
            <ChevronDown className="w-3 h-3 text-[#777777] ml-0.5" />
          </button>

          {showGranularityDropdown && (
            <div className="absolute right-0 top-10 w-32 bg-white rounded-xl shadow-lg border border-black/[0.08] p-1.5 z-40 animate-in fade-in zoom-in-95 duration-150">
              {granularityOptions.map((opt) => (
                <button
                  key={opt}
                  onClick={() => {
                    setGranularity(opt);
                    setShowGranularityDropdown(false);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-between cursor-pointer ${
                    granularity === opt ? 'bg-black/[0.05] font-semibold text-[#111111]' : 'text-[#444444] hover:bg-black/[0.03]'
                  }`}
                >
                  <span>{opt}</span>
                  {granularity === opt && <Check className="w-3.5 h-3.5 text-blue-600" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Add Widget Button */}
        <button
          type="button"
          onClick={onAddWidget}
          id="toolbar-add-widget-btn"
          className="h-[36px] px-3.5 rounded-[10px] bg-white hover:bg-black/[0.02] border border-black/[0.08] flex items-center gap-1 text-[#222222] font-normal transition-all shadow-[0_1px_2px_rgba(0,0,0,0.02)] cursor-pointer active:scale-[0.99]"
        >
          <span>Add widget</span>
          <span className="text-[15px] font-light text-[#555] leading-none ml-0.5">+</span>
        </button>
      </div>
    </div>
  );
};
