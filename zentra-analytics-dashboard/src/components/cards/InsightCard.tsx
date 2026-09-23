import React, { useState } from 'react';
import { Lightbulb } from 'lucide-react';

export const InsightCard: React.FC = () => {
  const [activeSegment, setActiveSegment] = useState(0);

  const insights = [
    {
      percentage: '75%',
      headline: 'Authorization rate increased by 4% compared to last week.',
      description:
        'This improvement reduced failed transactions by 950 and is projected to recover $12,400.',
    },
    {
      percentage: '99.4%',
      headline: 'Settlement speed reached same-day delivery across all tier 1 banks.',
      description:
        'Merchant payout latency dropped by 1.8 hours on average, improving retention by 3.2%.',
    },
    {
      percentage: '0.02%',
      headline: 'Chargeback dispute ratio remained well below industry thresholds.',
      description:
        'Automated 3DS 2.2 risk scoring deflected 1,420 fraud attempts over the last 30 days.',
    },
  ];

  const currentInsight = insights[activeSegment];

  return (
    <section
      className="soft-card relative h-full min-h-[430px] overflow-hidden rounded-[28px] border border-black/[0.09] bg-white [container-type:inline-size] area-insights"
      id="card-insights"
      aria-label="Insights"
      style={{ minHeight: '430px' }}
    >
      <div className="absolute inset-0 pointer-events-none z-0">
        <svg
          className="h-full w-full object-cover"
          viewBox="0 0 540 430"
          preserveAspectRatio="xMidYMid slice"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="bg-atmosphere-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#163554" />
              <stop offset="32%" stopColor="#28537A" />
              <stop offset="65%" stopColor="#D65F2D" />
              <stop offset="100%" stopColor="#EB7845" />
            </linearGradient>
            <radialGradient id="top-right-sunburst" cx="95%" cy="5%" r="85%">
              <stop offset="0%" stopColor="#FFC89E" stopOpacity="1" />
              <stop offset="35%" stopColor="#EB743C" stopOpacity="0.9" />
              <stop offset="75%" stopColor="#B84214" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="sand-reflection-glow" cx="90%" cy="90%" r="75%">
              <stop offset="0%" stopColor="#FEE4CC" stopOpacity="0.95" />
              <stop offset="45%" stopColor="#EAAB76" stopOpacity="0.65" />
              <stop offset="85%" stopColor="#28537A" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="chevron-top-facet" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
              <stop offset="25%" stopColor="#FEDAC9" stopOpacity="0.92" />
              <stop offset="65%" stopColor="#E99978" stopOpacity="0.82" />
              <stop offset="100%" stopColor="#C97352" stopOpacity="0.55" />
            </linearGradient>
            <linearGradient id="chevron-wall-facet" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#732408" stopOpacity="0.95" />
              <stop offset="50%" stopColor="#A23B15" stopOpacity="0.88" />
              <stop offset="100%" stopColor="#D96638" stopOpacity="0.4" />
            </linearGradient>
            <linearGradient id="inner-chevron-facet" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#FFF8F4" stopOpacity="0.98" />
              <stop offset="35%" stopColor="#F8BE9F" stopOpacity="0.88" />
              <stop offset="100%" stopColor="#D2744E" stopOpacity="0.45" />
            </linearGradient>
            <filter id="sand-grain-filter" x="0%" y="0%" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency="0.78" numOctaves="4" result="noise" />
              <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.82 0" result="denseNoise" />
              <feComposite in="denseNoise" in2="SourceGraphic" operator="in" />
            </filter>
          </defs>

          <rect width="540" height="430" fill="url(#bg-atmosphere-gradient)" />
          <rect width="540" height="430" fill="url(#top-right-sunburst)" />
          <rect width="540" height="430" fill="url(#sand-reflection-glow)" />

          <g transform="translate(190, -30) rotate(-14 200 200)">
            <path d="M 370 20 L 485 135 L 265 355 L 175 265 L 295 145 L 235 85 Z" fill="#380E02" fillOpacity="0.38" />
            <path d="M 445 95 L 485 135 L 265 355 L 225 315 Z" fill="url(#chevron-wall-facet)" />
            <path d="M 345 -10 L 455 100 L 235 320 L 125 210 L 215 120 L 255 160 L 375 40 Z" fill="url(#chevron-top-facet)" />
            <path d="M 345 -10 L 455 100 L 235 320" stroke="#FFFFFF" strokeWidth="4.2" strokeLinecap="round" strokeOpacity="0.98" />
            <path d="M 125 210 L 235 320" stroke="#FFEBE2" strokeWidth="3.2" strokeLinecap="round" strokeOpacity="0.88" />
            <path d="M 405 -45 L 505 55 L 345 215 L 245 115 L 325 35 L 355 65 Z" fill="url(#inner-chevron-facet)" opacity="0.92" />
            <path d="M 405 -45 L 505 55 L 345 215" stroke="#FFFFFF" strokeWidth="3.5" strokeOpacity="0.88" />
            <path d="M 455 100 L 235 320 L 80 470 L 520 470 Z" fill="#F9BD8A" fillOpacity="0.18" />
          </g>

          <rect width="540" height="430" filter="url(#sand-grain-filter)" opacity="0.45" style={{ mixBlendMode: 'overlay' }} />
        </svg>
      </div>

      <div
        className="absolute inset-0 z-[1] opacity-55 mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='sandNoise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.95' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23sandNoise)' opacity='0.9'/%3E%3C/svg%3E")`,
          backgroundSize: '130px 130px',
        }}
      />
      <div
        className="absolute inset-0 z-[2] opacity-35 mix-blend-soft-light pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 160 160' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='grainDepth'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.4' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23grainDepth)' opacity='0.95'/%3E%3C/svg%3E")`,
          backgroundSize: '95px 95px',
        }}
      />

      <div className="relative z-10 flex h-full flex-col px-[4.8cqi] pb-[5.6cqi] pt-[5cqi] transition-opacity delay-150 duration-1000 ease-out motion-reduce:transition-none">
        <span className="inline-flex w-fit items-center gap-[1.6cqi] rounded-full border border-white/45 bg-white/30 px-[3.2cqi] py-[1.5cqi] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-md">
          <Lightbulb className="h-[2.9cqi] w-[2.9cqi] text-black/60" aria-hidden="true" />
          <span className="text-[clamp(12px,3cqi,15px)] leading-none font-medium text-black/60">Insights</span>
        </span>

        <div className="mt-auto flex flex-col">
          <span className="text-[clamp(54px,17.4cqi,96px)] leading-[0.95] font-medium tracking-[-0.04em] text-white">
            {currentInsight.percentage}
          </span>
          <h3 className="mt-[9cqi] max-w-[64cqi] text-[clamp(16px,4.7cqi,23px)] leading-[1.2] font-semibold tracking-[-0.01em] text-white">
            {currentInsight.headline}
          </h3>
          <p className="mt-[5.5cqi] max-w-[70cqi] text-[clamp(13px,3.4cqi,17px)] leading-[1.45] text-white/85">
            {currentInsight.description}
          </p>
          <div className="mt-[8cqi] flex items-center gap-[1.8cqi]" aria-hidden="true">
            <span className="h-[clamp(2px,0.75cqi,4px)] flex-1 rounded-full bg-white" />
            <span className="h-[clamp(2px,0.75cqi,4px)] flex-1 rounded-full bg-white/35" />
            <span className="h-[clamp(2px,0.75cqi,4px)] flex-1 rounded-full bg-white/20" />
          </div>
        </div>
      </div>
    </section>
  );
};
