import React from 'react';
import { GROSS_VOLUME_DATA } from '../../data/mockData';
import { OverflowMenu } from '../common/OverflowMenu';

export const GrossVolumeCard: React.FC = () => {
  const data = GROSS_VOLUME_DATA;

  return (
    <div
      className="w-full h-full bg-white rounded-[24px] border border-black/[0.04] p-5 sm:p-6 flex flex-col justify-between shadow-[0_1px_3px_rgba(0,0,0,0.02)]"
      id="card-gross-volume"
    >
      {/* Header & KPI */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[20px] sm:text-[22px] font-[550] tracking-[-0.03em] text-[#111111] leading-none">
            Gross Volume
          </h2>
          <OverflowMenu cardTitle="Gross Volume" />
        </div>

        {/* Large KPI + Percentage Pill */}
        <div className="flex items-center gap-3 mt-3">
          <span className="text-[40px] sm:text-[46px] font-[550] tracking-[-0.05em] text-[#111111] leading-none">
            {data.displayTotal}
          </span>
          <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#EBF8EE] border border-[#CEEED6] text-[#14B83C] text-[12.5px] font-semibold tracking-tight shadow-2xs">
            <span className="text-[10px] leading-none">▲</span>
            <span>{data.growthPercentage}%</span>
          </div>
        </div>
      </div>

      {/* Horizontal Divider Line */}
      <div className="w-full h-px bg-black/[0.05] my-4" />

      {/* Breakdown Rows */}
      <div className="space-y-4 my-auto">
        {data.categories.map((cat) => {
          const stripeClass =
            cat.color === 'green'
              ? 'stripe-green'
              : cat.color === 'blue'
              ? 'stripe-blue'
              : 'stripe-pink';

          return (
            <div key={cat.id} className="space-y-1.5 group">
              <div className="flex items-center justify-between text-[13.5px]">
                <span className="text-[#737373] font-normal group-hover:text-[#444444] transition-colors">
                  {cat.name}
                </span>
                <span className="text-[#111111] font-[550] tracking-tight">
                  {cat.displayAmount}
                </span>
              </div>

              {/* Striped Diagonal Progress Bar with track */}
              <div className="w-full h-3 bg-[#F2F2F0] rounded-full overflow-hidden p-0 relative">
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out ${stripeClass}`}
                  style={{ width: `${cat.percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
