import React, { useState } from 'react';
import { PaymentsFunnelChart } from '../charts/PaymentsFunnelChart';
import { ExplorePanel } from './ExplorePanel';
import { OverflowMenu } from '../common/OverflowMenu';
import { PaymentFunnelStage } from '../../types';

export const PaymentsCard: React.FC = () => {
  const [selectedStage, setSelectedStage] = useState<PaymentFunnelStage | null>(null);

  return (
    <div
      className="w-full h-full bg-white rounded-[24px] border border-black/[0.04] p-5 sm:p-6 flex flex-col justify-between gap-3 relative shadow-[0_1px_3px_rgba(0,0,0,0.02)]"
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
      <div className="w-full">
        <PaymentsFunnelChart
          onSelectStage={(stage) => setSelectedStage(stage)}
          selectedStageId={selectedStage?.id || 'successful'}
        />
      </div>

      {/* AI Exploration Panel at bottom */}
      <div className="w-full mt-auto">
        <ExplorePanel />
      </div>
    </div>
  );
};
