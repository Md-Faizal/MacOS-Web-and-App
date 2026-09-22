import React, { useEffect, useState } from 'react';
import { OverflowMenu } from '../common/OverflowMenu';
import { loadDashboardOverview } from '../../lib/dashboard-data';

export const GrossVolumeCard: React.FC = () => {
  const [data, setData] = useState<any>({
    displayTotal: '$0',
    growthPercentage: 0,
    categories: [],
  });

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const overview = await loadDashboardOverview();
        if (!active) return;

        const total = Number(overview.totalRevenue || 0);
        const growth = Number(overview.collectionRate || 0);
        const categories = [
          {
            id: 'billed',
            name: 'Billed Value',
            amount: total,
            displayAmount: formatCurrency(total),
            color: 'green',
            percentage: 100,
          },
          {
            id: 'collected',
            name: 'Collected',
            amount: Number(overview.totalCollected || 0),
            displayAmount: formatCurrency(Number(overview.totalCollected || 0)),
            color: 'blue',
            percentage: total ? (Number(overview.totalCollected || 0) / total) * 100 : 0,
          },
          {
            id: 'due',
            name: 'Outstanding',
            amount: Number(overview.amountDue || 0),
            displayAmount: formatCurrency(Number(overview.amountDue || 0)),
            color: 'pink',
            percentage: total ? (Number(overview.amountDue || 0) / total) * 100 : 0,
          },
        ];

        setData({
          displayTotal: formatCurrency(total),
          growthPercentage: Math.max(0, Math.min(100, growth)),
          categories,
        });
      } catch (error) {
        console.warn('[Zentra] GrossVolumeCard fallback', error);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  function formatCurrency(value: number) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(value || 0);
  }

  return (
    <div
      className="soft-card w-full h-full rounded-[28px] p-5 sm:p-6 flex flex-col justify-between"
      id="card-gross-volume"
    >
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[20px] sm:text-[22px] font-[550] tracking-[-0.03em] text-[#111111] leading-none">
            Gross Volume
          </h2>
          <OverflowMenu cardTitle="Gross Volume" />
        </div>

        <div className="flex items-center gap-3 mt-3">
          <span className="text-[40px] sm:text-[46px] font-[550] tracking-[-0.05em] text-[#111111] leading-none">
            {data.displayTotal}
          </span>
          <div className="metric-pill bg-[#ebf8ee] border-[#cfeee0] text-[#14b83c] px-2.5 py-1">
            <span className="text-[10px] leading-none">▲</span>
            <span>{data.growthPercentage}%</span>
          </div>
        </div>
      </div>

      <div className="w-full h-px bg-black/[0.05] my-4" />

      <div className="space-y-4 my-auto">
        {data.categories.map((cat: any) => {
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

              <div className="w-full h-3 bg-[#F2F2F0] rounded-full overflow-hidden p-0 relative">
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out ${stripeClass}`}
                  style={{ width: `${Math.min(100, Number(cat.percentage || 0))}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
