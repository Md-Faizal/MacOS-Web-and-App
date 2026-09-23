import React from 'react';
import { PageHeading } from '../components/PageHeading';
import { PaymentsCard } from '../components/cards/PaymentsCard';
import { GrossVolumeCard } from '../components/cards/GrossVolumeCard';
import { RetentionCard } from '../components/cards/RetentionCard';
import { TransactionsCard } from '../components/cards/TransactionsCard';
import { CustomersCard } from '../components/cards/CustomersCard';
import { InsightCard } from '../components/cards/InsightCard';

interface HomeViewProps {
  layer2Class?: string;
  layer3Class?: string;
  onAddWidget?: () => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  layer2Class = '',
  layer3Class = '',
  onAddWidget,
}) => {
  return (
    <>
      {/* ═════════════════════════════════════════════════════════════════════════
          LAYER 2: PAGE CONTROL BAR & VIEW TOOLBAR (Contextual Controls)
         ═════════════════════════════════════════════════════════════════════════ */}
      <section 
        id="layer-page-header"
        data-layer="page-header"
        data-layer-order="2"
        className={`relative z-40 ${layer2Class}`}
      >
        <PageHeading
          title="Overview"
          onAddWidget={onAddWidget}
        />
      </section>

      {/* ═════════════════════════════════════════════════════════════════════════
          LAYER 3: WIDGET CANVAS & METRICS GRID (Analytical Content Area)
         ═════════════════════════════════════════════════════════════════════════ */}
      <main 
        id="layer-widget-canvas"
        data-layer="widget-canvas"
        data-layer-order="3"
        role="main"
        className={`relative z-10 w-full ${layer3Class}`}
      >
        <div 
          id="widget-grid" 
          data-group="widget-grid"
          className="dashboard-grid gap-4 sm:gap-5"
        >
          {/* Slot 1: Payments & Volume (8 cols LG) */}
          <section 
            id="widget-slot-payments"
            data-widget-slot="payments-volume"
            className="col-span-1 md:col-span-12 lg:col-span-8 flex flex-col" 
            aria-label="Payments and Volume"
          >
            <PaymentsCard />
          </section>

          {/* Slot 2: Gross Volume (4 cols LG) */}
          <section 
            id="widget-slot-gross-volume"
            data-widget-slot="gross-volume"
            className="col-span-1 md:col-span-12 lg:col-span-4 flex flex-col" 
            aria-label="Gross Volume"
          >
            <GrossVolumeCard />
          </section>

          {/* Slot 3: Retention (3 cols LG) */}
          <section 
            id="widget-slot-retention"
            data-widget-slot="retention"
            className="col-span-1 md:col-span-6 lg:col-span-3 flex flex-col" 
            aria-label="Retention"
          >
            <RetentionCard />
          </section>

          {/* Slot 4: Transactions & Customers Stack (5 cols LG) */}
          <div 
            id="widget-slot-activity-stack"
            data-widget-slot="activity-stack"
            className="col-span-1 md:col-span-6 lg:col-span-5 flex flex-col gap-4 sm:gap-5 justify-between" 
            aria-label="Transaction and customer metrics"
          >
            <TransactionsCard />
            <CustomersCard />
          </div>

          {/* Slot 5: Insights (4 cols LG) */}
          <section 
            id="widget-slot-insights"
            data-widget-slot="insights"
            className="col-span-1 md:col-span-12 lg:col-span-4 flex flex-col" 
            aria-label="Insights"
          >
            <InsightCard />
          </section>
        </div>
      </main>
    </>
  );
};
