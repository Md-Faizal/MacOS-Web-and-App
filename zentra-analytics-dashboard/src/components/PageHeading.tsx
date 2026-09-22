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
    <div className="relative z-40 flex w-full select-none flex-col gap-3 overflow-visible pb-5 pt-3 sm:gap-4 sm:pb-6 md:flex-row md:items-end md:justify-between" id="page-heading-section">
      <div className="flex min-w-0 items-center gap-2.5">
        <h1 className="text-[2.2rem] font-[700] leading-[0.9] tracking-[-0.07em] text-[#111111] sm:text-[2.6rem] md:text-[3rem] lg:text-[3.4rem]">
          {title}
        </h1>
        <button
          type="button"
          onClick={handleCopyLink}
          title={copiedLink ? 'Link Copied!' : 'Copy Overview View Link'}
          aria-label="Copy Overview Link"
          id="overview-link-btn"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-black/[0.08] bg-white/90 text-[#555555] shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition hover:bg-white hover:text-[#111111]"
        >
          {copiedLink ? (
            <Check className="h-3.5 w-3.5 text-emerald-600" />
          ) : (
            <Link2 className="h-3.5 w-3.5 text-[#555555]" />
          )}
        </button>
      </div>

      <div
        className="flex w-full max-w-full cursor-grab touch-pan-y items-center gap-2.5 overflow-x-auto overflow-y-visible pb-1 active:cursor-grabbing md:w-auto md:justify-end [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        onPointerDown={handleToolbarPointerDown}
        onPointerMove={handleToolbarPointerMove}
        onPointerUp={handleToolbarPointerUp}
        onPointerLeave={handleToolbarPointerUp}
        onPointerCancel={handleToolbarPointerUp}
      >
        <div className="relative z-50 flex min-w-max items-center gap-2.5 text-[12px] md:text-[13px]">
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowDropdown1(!showDropdown1);
              setShowDropdown2(false);
              setShowGranularityDropdown(false);
            }}
            id="toolbar-date-range-1"
            className="flex h-[42px] items-center gap-2.5 whitespace-nowrap rounded-[14px] border border-black/[0.08] bg-white/90 px-3.5 text-[13px] font-medium text-[#222222] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition hover:bg-white active:scale-[0.99] sm:h-[46px] sm:px-4"
          >
            <Calendar className="h-4 w-4 text-[#666666] sm:h-[18px] sm:w-[18px]" />
            <span>{dateRange1}</span>
            <ChevronDown className="ml-0.5 h-3.5 w-3.5 text-[#777777]" />
          </button>

          {showDropdown1 && (
            <div className="absolute left-0 top-11 z-[120] w-52 rounded-xl border border-black/[0.08] bg-white p-1.5 shadow-lg">
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

        <span className="whitespace-nowrap px-0.5 text-[13px] font-medium text-[#737373]">compared to</span>

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowDropdown2(!showDropdown2);
              setShowDropdown1(false);
              setShowGranularityDropdown(false);
            }}
            id="toolbar-date-range-2"
            className="flex h-[42px] items-center gap-2.5 whitespace-nowrap rounded-[14px] border border-black/[0.08] bg-white/90 px-3.5 text-[13px] font-medium text-[#222222] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition hover:bg-white active:scale-[0.99] sm:h-[46px] sm:px-4"
          >
            <Calendar className="h-4 w-4 text-[#666666] sm:h-[18px] sm:w-[18px]" />
            <span>{dateRange2}</span>
            <ChevronDown className="ml-0.5 h-3.5 w-3.5 text-[#777777]" />
          </button>

          {showDropdown2 && (
            <div className="absolute left-0 top-11 z-[120] w-52 rounded-xl border border-black/[0.08] bg-white p-1.5 shadow-lg">
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

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowGranularityDropdown(!showGranularityDropdown);
              setShowDropdown1(false);
              setShowDropdown2(false);
            }}
            id="toolbar-granularity"
            className="flex h-[42px] items-center gap-2.5 whitespace-nowrap rounded-[14px] border border-black/[0.08] bg-white/90 px-3.5 text-[13px] font-medium text-[#222222] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition hover:bg-white active:scale-[0.99] sm:h-[46px] sm:px-4"
          >
            <span>{granularity}</span>
            <ChevronDown className="h-3.5 w-3.5 text-[#777777]" />
          </button>

          {showGranularityDropdown && (
            <div className="absolute right-0 top-11 z-[120] w-32 rounded-xl border border-black/[0.08] bg-white p-1.5 shadow-lg">
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

        <button
          type="button"
          onClick={onAddWidget}
          id="toolbar-add-widget-btn"
          className="hidden h-[42px] items-center gap-2.5 whitespace-nowrap rounded-[14px] border border-black/[0.08] bg-white/90 px-3.5 text-[13px] font-medium text-[#222222] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition hover:bg-white active:scale-[0.99] sm:flex sm:h-[46px] sm:px-4"
        >
          <span>Add widget</span>
          <span className="text-[15px] font-light leading-none text-[#555]">+</span>
        </button>
        </div>
      </div>
    </div>
  );
};
