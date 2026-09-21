export interface PaymentFunnelStage {
  id: string;
  label: string;
  value: number;
  displayValue: string;
  pillColor?: string;
  isHighlighted?: boolean;
  conversion?: number;
  dropOff?: number;
  transactionsText?: string;
  yValue: number; // approximate level (70, 60, 50, etc.)
}

export interface RevenueCategory {
  id: string;
  name: string;
  amount: number;
  displayAmount: string;
  color: 'green' | 'blue' | 'pink';
  percentage: number;
}

export interface GrossVolumeData {
  total: number;
  displayTotal: string;
  growthPercentage: number;
  categories: RevenueCategory[];
}

export interface RetentionPoint {
  month: string;
  value: number; // percentage
  displayValue?: string;
  isPeak?: boolean;
}

export interface DayDotDistribution {
  day: string;
  shortDay: string;
  count: number;
  dots: number;
  isPeak?: boolean;
}

export interface InsightData {
  percentage: number;
  title: string;
  description: string;
  activeSegment: number;
  totalSegments: number;
}
