import React, { useState } from 'react';
import { CUSTOMERS_DATA } from '../../data/mockData';
import { OverflowMenu } from '../common/OverflowMenu';

export const CustomersCard: React.FC = () => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const data = CUSTOMERS_DATA;

  const dotColumns = [
    { id: 0, count: 1, isPeak: false },
    { id: 1, count: 1, isPeak: false },
    { id: 2, count: 2, isPeak: false },
    { id: 3, count: 3, isPeak: false },
    { id: 4, count: 5, isPeak: true, label: 'Thu' },
    { id: 5, count: 4, isPeak: true },
    { id: 6, count: 2, isPeak: false },
    { id: 7, count: 1, isPeak: false },
    { id: 8, count: 2, isPeak: false },
    { id: 9, count: 1, isPeak: false },
    { id: 10, count: 1, isPeak: false },
  ];

  return (
    <section
      className="soft-card relative flex h-full flex-col rounded-[28px] p-6 transition-[box-shadow,border-color] duration-200 ease-out hover:shadow-[0_20px_44px_-28px_rgba(17,17,17,0.28)] sm:p-7 area-customers"
      id="card-customers"
      aria-label="Customers"
      style={{ minHeight: '298px' }}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-medium leading-none tracking-[-0.025em] text-ink-primary" style={{ fontSize: 'var(--text-card-title)', fontWeight: 550 }}>
          Customers
        </h2>
        <div className="relative">
          <OverflowMenu cardTitle="Customers" />
        </div>
      </div>

      <div className="flex flex-1 flex-wrap items-end justify-between gap-x-4 gap-y-4 pt-3">
        <p className="leading-none font-medium tracking-[-0.05em] text-ink-primary" style={{ fontSize: 'var(--text-kpi, 40px)' }}>
          {data.total}
        </p>

        <div className="relative min-w-[190px] flex-1">
          <div className="pointer-events-none absolute z-10" style={{ left: '76%', top: '32%', transform: 'translate(-50%, -100%)' }}>
            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-black/[0.05] bg-white px-2.5 py-[5px] text-[12px] leading-none text-ink-secondary shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
              <strong className="font-semibold text-ink-primary">{data.peakDay}</strong>
              <span>· ~{Math.max(80, Number(data.total.replace(/[^0-9]/g, '')) / 4 || 80)}</span>
            </span>
          </div>

          <div role="list" aria-label="Dot distribution of customers by weekday: Monday 1, Tuesday 2, Wednesday 3, Thursday 5, Friday 3, Saturday 2, Sunday 1. Peak on Thursday." className="w-full" style={{ minHeight: '72px' }}>
            <div className="flex items-end gap-1.5 sm:gap-2 h-[52px]">
              {dotColumns.map((col) => {
                const isPeak = col.isPeak;
                const isHovered = hoveredIdx === col.id;

                return (
                  <div
                    key={col.id}
                    onMouseEnter={() => setHoveredIdx(col.id)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    className="flex flex-col-reverse items-center gap-1 cursor-pointer outline-none"
                    role="listitem"
                    tabIndex={0}
                  >
                    {Array.from({ length: col.count }).map((_, i) => (
                      <div
                        key={i}
                        className={`h-[7.5px] w-[7.5px] rounded-full transition-all duration-200 sm:h-[8px] sm:w-[8px] ${
                          isPeak
                            ? 'bg-[#3771F6] shadow-[0_0_4px_rgba(55,113,246,0.32)]'
                            : 'bg-[#B4CFF5] group-hover:bg-[#609EFF]'
                        } ${isHovered ? 'scale-125' : ''}`}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="shrink-0 self-center text-right">
          <p className="text-[13px] leading-tight text-ink-secondary">vs last period</p>
          <p className="mt-1.5 text-[20px] leading-none font-semibold tracking-[-0.01em] text-ink-primary">{data.vsLastPeriod}</p>
        </div>
      </div>
    </section>
  );
};
