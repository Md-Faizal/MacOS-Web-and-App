import React, { useState } from 'react';
import { PaymentsFunnelChart } from '../charts/PaymentsFunnelChart';
import { ExplorePanel } from './ExplorePanel';
import { OverflowMenu } from '../common/OverflowMenu';
import { PaymentFunnelStage } from '../../types';

export const PaymentsCard: React.FC = () => {
  const [selectedStage, setSelectedStage] = useState<PaymentFunnelStage | null>(null);

  return (
    <div
      className="soft-card relative flex h-full min-h-[300px] w-full flex-col justify-between gap-3 overflow-hidden rounded-[28px] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(252,252,250,0.94))] p-4 shadow-[0_22px_48px_-30px_rgba(17,17,17,0.22)] sm:min-h-[500px] sm:p-6"
      id="card-payments"
    >
      {/* Card Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-[20px] sm:text-[22px] font-[550] tracking-[-0.03em] text-[#111111] leading-none">
          Payments
        </h2>
        <OverflowMenu cardTitle="Payments" />
      </div>

      {/* Main Funnel Visualization */}
      <div className="w-full min-h-[180px] flex-1 sm:min-h-0">
        <PaymentsFunnelChart
          onSelectStage={(stage) => setSelectedStage(stage)}
          selectedStageId={selectedStage?.id}
        />
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-28 bg-gradient-to-t from-white via-white/80 to-transparent" aria-hidden="true" />
      <ExplorePanel />
    </div>
  );
};
