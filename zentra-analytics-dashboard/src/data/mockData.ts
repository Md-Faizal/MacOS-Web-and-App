import {
  PaymentFunnelStage,
  GrossVolumeData,
  RetentionPoint,
  DayDotDistribution,
  InsightData,
} from '../types';

export const PAYMENT_STAGES: PaymentFunnelStage[] = [
  {
    id: 'initiated',
    label: 'Initiated Payments',
    value: 65200,
    displayValue: '65.2k',
    yValue: 65.2,
    conversion: 100,
    dropOff: 0,
    transactionsText: '65.2k transactions',
  },
  {
    id: 'authorized',
    label: 'Authorized Payments',
    value: 54800,
    displayValue: '54.8k',
    yValue: 54.8,
    conversion: 84,
    dropOff: -16,
    transactionsText: '54.8k transactions',
  },
  {
    id: 'successful',
    label: 'Successful Payments',
    value: 48600,
    displayValue: '48.6k',
    yValue: 48.6,
    isHighlighted: true,
    conversion: 89,
    dropOff: -11,
    transactionsText: '48.6k transactions',
  },
  {
    id: 'payouts',
    label: 'Payouts to Merchants',
    value: 38300,
    displayValue: '38.3k',
    yValue: 38.3,
    conversion: 79,
    dropOff: -21,
    transactionsText: '38.3k transactions',
  },
  {
    id: 'completed',
    label: 'Completed Transactions',
    value: 32900,
    displayValue: '32.9k',
    yValue: 32.9,
    conversion: 86,
    dropOff: -14,
    transactionsText: '32.9k transactions',
  },
];

export const GROSS_VOLUME_DATA: GrossVolumeData = {
  total: 41540,
  displayTotal: '$41,540',
  growthPercentage: 15,
  categories: [
    {
      id: 'online',
      name: 'Online Payments',
      amount: 26800,
      displayAmount: '$26,800',
      color: 'green',
      percentage: 64.5,
    },
    {
      id: 'subscriptions',
      name: 'Subscriptions',
      amount: 10400,
      displayAmount: '$10,400',
      color: 'blue',
      percentage: 25.0,
    },
    {
      id: 'instore',
      name: 'In-Store Sales',
      amount: 4340,
      displayAmount: '$4,340',
      color: 'pink',
      percentage: 10.5,
    },
  ],
};

export const RETENTION_DATA: RetentionPoint[] = [
  { month: 'Jan', value: 24 },
  { month: 'Feb', value: 31 },
  { month: 'Mar', value: 33 },
  { month: 'Apr', value: 42, displayValue: '42%', isPeak: true },
  { month: 'May', value: 28 },
  { month: 'Jun', value: 29 },
];

// Staircase points representation across timeline
export const RETENTION_STAIRS = [
  { x: 0.0, y: 20 },
  { x: 0.07, y: 20 },
  { x: 0.07, y: 17 },
  { x: 0.14, y: 17 },
  { x: 0.14, y: 23 },
  { x: 0.21, y: 23 },
  { x: 0.21, y: 33 },
  { x: 0.35, y: 33 },
  { x: 0.35, y: 29 },
  { x: 0.42, y: 29 },
  { x: 0.42, y: 31 },
  { x: 0.49, y: 31 },
  { x: 0.49, y: 39 }, // Peak marker dot position
  { x: 0.55, y: 39 },
  { x: 0.55, y: 42 }, // Highest top plateau in Apr
  { x: 0.63, y: 42 },
  { x: 0.63, y: 33 },
  { x: 0.70, y: 33 },
  { x: 0.70, y: 38 },
  { x: 0.77, y: 38 },
  { x: 0.77, y: 20 },
  { x: 0.84, y: 20 },
  { x: 0.84, y: 26 },
  { x: 0.91, y: 26 },
  { x: 0.91, y: 23 },
  { x: 1.0, y: 23 },
];

export const TRANSACTIONS_DATA = {
  total: '106k',
  vsLastPeriod: '+34,002',
  peakDay: 'Wed',
  days: [
    { day: 'Monday', shortDay: 'Mon', count: 12400, dots: 1 },
    { day: 'Tuesday', shortDay: 'Tue', count: 15200, dots: 2 },
    { day: 'Wednesday', shortDay: 'Wed', count: 34100, dots: 6, isPeak: true },
    { day: 'Thursday', shortDay: 'Thu', count: 21800, dots: 4 },
    { day: 'Friday', shortDay: 'Fri', count: 14500, dots: 2 },
    { day: 'Saturday', shortDay: 'Sat', count: 11000, dots: 2 },
    { day: 'Sunday', shortDay: 'Sun', count: 7000, dots: 1 },
  ],
};

export const CUSTOMERS_DATA = {
  total: '1,284',
  vsLastPeriod: '+320',
  peakDay: 'Thu',
  days: [
    { day: 'Monday', shortDay: 'Mon', count: 140, dots: 1 },
    { day: 'Tuesday', shortDay: 'Tue', count: 190, dots: 1 },
    { day: 'Wednesday', shortDay: 'Wed', count: 320, dots: 4 },
    { day: 'Thursday', shortDay: 'Thu', count: 480, dots: 6, isPeak: true },
    { day: 'Friday', shortDay: 'Fri', count: 210, dots: 2 },
    { day: 'Saturday', shortDay: 'Sat', count: 160, dots: 3 },
    { day: 'Sunday', shortDay: 'Sun', count: 110, dots: 1 },
  ],
};

export const INSIGHT_DATA: InsightData = {
  percentage: 75,
  title: 'Authorization rate increased by 4% compared to last week.',
  description:
    'This improvement reduced failed transactions by 950 and is projected to recover $12,400.',
  activeSegment: 0,
  totalSegments: 3,
};
