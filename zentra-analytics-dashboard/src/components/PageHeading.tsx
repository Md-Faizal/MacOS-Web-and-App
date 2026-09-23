import React, { useRef, useState } from 'react';
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
  const dragState = useRef<{ startX: number; startScrollLeft: number } | null>(null);

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

  const handleToolbarPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse') return;

    const target = event.target as HTMLElement | null;
    if (target && target.closest('button')) return;

    const container = event.currentTarget;
    dragState.current = {
      startX: event.clientX,
      startScrollLeft: container.scrollLeft,
    };
    container.setPointerCapture(event.pointerId);
    container.style.cursor = 'grabbing';
    container.style.userSelect = 'none';
  };

  const handleToolbarPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current || event.pointerType !== 'mouse') return;
    const container = event.currentTarget;
    const delta = event.clientX - dragState.current.startX;
    container.scrollLeft = dragState.current.startScrollLeft - delta;
  };

  const handleToolbarPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current || event.pointerType !== 'mouse') return;
    dragState.current = null;
    event.currentTarget.style.cursor = 'grab';
    event.currentTarget.style.userSelect = '';
  };

  return (
    <div 
      id="page-header" 
      data-component="PageHeader"
      data-section="page-control-bar"
      className="relative z-40 flex w-full select-none flex-col gap-3 overflow-visible pb-5 pt-3 sm:gap-4 sm:pb-6 md:flex-row md:items-end md:justify-between"
    >
      {/* ─── GROUP 1: PAGE TITLE & RESOURCE LINK ─── */}
      <div 
        id="page-header-title-group"
        data-slot="title-group"
        className="flex min-w-0 items-center gap-2.5"
      >
        <h1 
          id="page-title"
          className="text-[2.2rem] font-[700] leading-[0.9] tracking-[-0.07em] text-[#111111] sm:text-[2.6rem] md:text-[3rem] lg:text-[3.4rem]"
        >
          {title}
        </h1>
        <button
          type="button"
          onClick={handleCopyLink}
          title={copiedLink ? 'Link Copied!' : 'Copy Overview View Link'}
          aria-label="Copy Overview Link"
          id="overview-link-btn"
          data-slot="view-share-action"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-black/[0.08] bg-white/90 text-[#555555] shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition hover:bg-white hover:text-[#111111]"
        >
          {copiedLink ? (
            <Check className="h-3.5 w-3.5 text-emerald-600" />
          ) : (
            <Link2 className="h-3.5 w-3.5 text-[#555555]" />
          )}
        </button>
      </div>

      {/* ─── GROUP 2: VIEW TOOLBAR & FILTER CONTROLS ─── */}
      <div
        id="page-view-toolbar"
        data-slot="view-toolbar"
        className="flex w-full max-w-full items-center gap-2 sm:gap-2.5 flex-wrap overflow-visible md:w-auto md:flex-nowrap md:justify-end"
      >
        <div 
          id="toolbar-controls-cluster"
          data-group="filter-controls"
          className="relative z-50 flex flex-wrap md:flex-nowrap items-center gap-2 sm:gap-2.5 text-[12px] md:text-[13px] overflow-visible"
        >
        {/* Control A: Primary Date Range Preset */}
        <div 
          id="toolbar-date-primary-control"
          data-control="date-range-primary"
          className="relative"
        >
          <button
            type="button"
            onClick={() => {
              setShowDropdown1(!showDropdown1);
              setShowDropdown2(false);
              setShowGranularityDropdown(false);
            }}
            id="toolbar-date-range-1"
            className="flex h-[42px] items-center gap-2.5 whitespace-nowrap rounded-[14px] border border-black/[0.09] bg-white px-3.5 text-[13px] font-medium text-[#111111] shadow-[0_2px_8px_-2px_rgba(17,17,17,0.08),0_1px_2px_rgba(17,17,17,0.04)] transition hover:bg-[#fafafa] active:scale-[0.99] sm:h-[46px] sm:px-4"
          >
            <Calendar className="h-4 w-4 text-[#666666] sm:h-[18px] sm:w-[18px]" />
            <span>{dateRange1}</span>
            <ChevronDown className="ml-0.5 h-3.5 w-3.5 text-[#777777]" />
          </button>

          {showDropdown1 && (
            <div className="absolute left-0 top-11 z-[120] w-52 rounded-xl border border-black/[0.09] bg-white p-1.5 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.14)]">
              {datePresets.map((preset) => (
                <button
                  key={preset}
                  onClick={() => {
                    setDateRange1(preset);
                    setShowDropdown1(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
                    dateRange1 === preset ? 'bg-black/[0.05] font-semibold text-[#111111]' : 'text-[#444444] hover:bg-black/[0.03]'
                  }`}
                >
                  <span>{preset}</span>
                  {dateRange1 === preset && <Check className="h-3.5 w-3.5 text-blue-600" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <span className="whitespace-nowrap px-0.5 text-[13px] font-medium text-[#666666]">compared to</span>

        {/* Control B: Comparison Date Range Preset */}
        <div 
          id="toolbar-date-comparison-control"
          data-control="date-range-comparison"
          className="relative"
        >
          <button
            type="button"
            onClick={() => {
              setShowDropdown2(!showDropdown2);
              setShowDropdown1(false);
              setShowGranularityDropdown(false);
            }}
            id="toolbar-date-range-2"
            className="flex h-[42px] items-center gap-2.5 whitespace-nowrap rounded-[14px] border border-black/[0.09] bg-white px-3.5 text-[13px] font-medium text-[#111111] shadow-[0_2px_8px_-2px_rgba(17,17,17,0.08),0_1px_2px_rgba(17,17,17,0.04)] transition hover:bg-[#fafafa] active:scale-[0.99] sm:h-[46px] sm:px-4"
          >
            <Calendar className="h-4 w-4 text-[#666666] sm:h-[18px] sm:w-[18px]" />
            <span>{dateRange2}</span>
            <ChevronDown className="ml-0.5 h-3.5 w-3.5 text-[#777777]" />
          </button>

          {showDropdown2 && (
            <div className="absolute left-0 top-11 z-[120] w-52 rounded-xl border border-black/[0.09] bg-white p-1.5 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.14)]">
              {datePresets.map((preset) => (
                <button
                  key={preset}
                  onClick={() => {
                    setDateRange2(preset);
                    setShowDropdown2(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
                    dateRange2 === preset ? 'bg-black/[0.05] font-semibold text-[#111111]' : 'text-[#444444] hover:bg-black/[0.03]'
                  }`}
                >
                  <span>{preset}</span>
                  {dateRange2 === preset && <Check className="h-3.5 w-3.5 text-blue-600" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Control C: Aggregation / Granularity Selector */}
        <div 
          id="toolbar-granularity-control"
          data-control="granularity-selector"
          className="relative"
        >
          <button
            type="button"
            onClick={() => {
              setShowGranularityDropdown(!showGranularityDropdown);
              setShowDropdown1(false);
              setShowDropdown2(false);
            }}
            id="toolbar-granularity"
            className="flex h-[42px] items-center gap-2.5 whitespace-nowrap rounded-[14px] border border-black/[0.09] bg-white px-3.5 text-[13px] font-medium text-[#111111] shadow-[0_2px_8px_-2px_rgba(17,17,17,0.08),0_1px_2px_rgba(17,17,17,0.04)] transition hover:bg-[#fafafa] active:scale-[0.99] sm:h-[46px] sm:px-4"
          >
            <span>{granularity}</span>
            <ChevronDown className="h-3.5 w-3.5 text-[#777777]" />
          </button>

          {showGranularityDropdown && (
            <div className="absolute right-0 top-11 z-[120] w-32 rounded-xl border border-black/[0.09] bg-white p-1.5 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.14)]">
              {granularityOptions.map((opt) => (
                <button
                  key={opt}
                  onClick={() => {
                    setGranularity(opt);
                    setShowGranularityDropdown(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
                    granularity === opt ? 'bg-black/[0.05] font-semibold text-[#111111]' : 'text-[#444444] hover:bg-black/[0.03]'
                  }`}
                >
                  <span>{opt}</span>
                  {granularity === opt && <Check className="h-3.5 w-3.5 text-blue-600" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Action: Primary View Action (Add Widget) */}
        <button
          type="button"
          onClick={onAddWidget}
          id="toolbar-add-widget-btn"
          data-action="add-widget"
          className="hidden h-[42px] items-center gap-2.5 whitespace-nowrap rounded-[14px] border border-black/[0.09] bg-white px-3.5 text-[13px] font-medium text-[#111111] shadow-[0_2px_8px_-2px_rgba(17,17,17,0.08),0_1px_2px_rgba(17,17,17,0.04)] transition hover:bg-[#fafafa] active:scale-[0.99] sm:flex sm:h-[46px] sm:px-4"
        >
          <span>Add widget</span>
          <span className="text-[15px] font-light leading-none text-[#555]">+</span>
        </button>
        </div>
      </div>
    </div>
  );
};
