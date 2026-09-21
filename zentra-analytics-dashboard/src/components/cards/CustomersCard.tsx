import React, { useState } from 'react';
import { CUSTOMERS_DATA } from '../../data/mockData';
import { OverflowMenu } from '../common/OverflowMenu';

export const CustomersCard: React.FC = () => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const data = CUSTOMERS_DATA;

  // 11 dot columns matching reference image:
  // Col 1: 1, Col 2: 1, Col 3: 2, Col 4: 3, Col 5 (Peak Thu): 5, Col 6: 4, Col 7: 2, Col 8: 1, Col 9: 2, Col 10: 1, Col 11: 1
  const dotColumns = [
    { id: 0, count: 1, isPeak: false },
    { id: 1, count: 1, isPeak: false },
    { id: 2, count: 2, isPeak: false },
    { id: 3, count: 3, isPeak: false },
    { id: 4, count: 5, isPeak: true, label: 'Thu' }, // Peak Thu
    { id: 5, count: 4, isPeak: true },
    { id: 6, count: 2, isPeak: false },
    { id: 7, count: 1, isPeak: false },
    { id: 8, count: 2, isPeak: false },
    { id: 9, count: 1, isPeak: false },
    { id: 10, count: 1, isPeak: false },
  ];

  return (
    <div
      className="w-full flex-1 bg-white rounded-[24px] border border-black/[0.04] p-6 sm:p-7 flex flex-col justify-between shadow-[0_1px_3px_rgba(0,0,0,0.02)] min-h-[185px]"
      id="card-customers"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-[20px] sm:text-[22px] font-[550] tracking-[-0.03em] text-[#111111] leading-none">
          Customers
        </h2>
        <OverflowMenu cardTitle="Customers" />
      </div>

      {/* Main Row: KPI on left, Dot matrix in middle, vs last period on right */}
      <div className="flex items-end justify-between gap-3 mt-4 select-none">
        {/* Large KPI */}
        <div className="shrink-0">
          <span className="text-[40px] sm:text-[46px] font-[550] tracking-[-0.05em] text-[#111111] leading-none">
            {data.total}
          </span>
        </div>

        {/* Dot Distribution Histogram */}
        <div className="relative flex flex-col items-center">
          {/* Floating Pill Badge: Highest: Thu */}
          <div className="mb-2 bg-white/95 backdrop-blur-md px-3 py-0.5 rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.08),0_0_1px_rgba(0,0,0,0.08)] border border-black/[0.06] text-[11.5px] text-[#737373] whitespace-nowrap">
            Highest: <strong className="font-semibold text-[#111111]">{data.peakDay}</strong>
          </div>

          {/* Dot matrix columns */}
          <div className="flex items-end gap-1.5 sm:gap-2 h-[52px]">
            {dotColumns.map((col) => {
              const isPeak = col.isPeak;
              const isHovered = hoveredIdx === col.id;

              return (
                <div
                  key={col.id}
                  onMouseEnter={() => setHoveredIdx(col.id)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  className="flex flex-col-reverse items-center gap-1 cursor-pointer group"
                >
                  {Array.from({ length: col.count }).map((_, i) => (
                    <div
                      key={i}
                      className={`w-[7.5px] h-[7.5px] sm:w-[8px] sm:h-[8px] rounded-full transition-all duration-200 ${
                        isPeak
                          ? 'bg-[#2677FF] shadow-[0_0_4px_rgba(38,119,255,0.4)]'
                          : 'bg-[#A8CCFF] group-hover:bg-[#609EFF]'
                      } ${isHovered ? 'scale-125' : ''}`}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right side metric: vs last period */}
        <div className="text-right shrink-0">
          <div className="text-[12px] text-[#737373] leading-none mb-1">vs last period</div>
          <div className="text-[19px] sm:text-[21px] font-[600] tracking-tight text-[#111111] leading-none">
            {data.vsLastPeriod}
          </div>
        </div>
      </div>
    </div>
  );
};
