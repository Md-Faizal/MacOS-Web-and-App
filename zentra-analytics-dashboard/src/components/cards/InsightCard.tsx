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
    <div
      className="w-full h-full min-h-[380px] rounded-[24px] p-6 sm:p-7 flex flex-col justify-between relative overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)] select-none group"
      id="card-insights"
    >
      {/* 3D Architectural Chevron & Sunset Atmosphere Backdrop */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <svg
          className="w-full h-full object-cover"
          viewBox="0 0 540 430"
          preserveAspectRatio="xMidYMid slice"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Smooth Diagonal Atmosphere: Slate Blue to Warm Sunset Amber/Coral */}
            <linearGradient id="bg-atmosphere-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#163554" />
              <stop offset="32%" stopColor="#28537A" />
              <stop offset="65%" stopColor="#D65F2D" />
              <stop offset="100%" stopColor="#EB7845" />
            </linearGradient>

            {/* Radiant Top-Right Warm Sand Sunburst */}
            <radialGradient id="top-right-sunburst" cx="95%" cy="5%" r="85%">
              <stop offset="0%" stopColor="#FFC89E" stopOpacity="1" />
              <stop offset="35%" stopColor="#EB743C" stopOpacity="0.9" />
              <stop offset="75%" stopColor="#B84214" stopOpacity="0" />
            </radialGradient>

            {/* Bottom-Right Golden Sand Ambient Glow */}
            <radialGradient id="sand-reflection-glow" cx="90%" cy="90%" r="75%">
              <stop offset="0%" stopColor="#FEE4CC" stopOpacity="0.95" />
              <stop offset="45%" stopColor="#EAAB76" stopOpacity="0.65" />
              <stop offset="85%" stopColor="#28537A" stopOpacity="0" />
            </radialGradient>

            {/* 3D Chevron Arrow Top Satin Face */}
            <linearGradient id="chevron-top-facet" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
              <stop offset="25%" stopColor="#FEDAC9" stopOpacity="0.92" />
              <stop offset="65%" stopColor="#E99978" stopOpacity="0.82" />
              <stop offset="100%" stopColor="#C97352" stopOpacity="0.55" />
            </linearGradient>

            {/* 3D Chevron Extruded Side Wall */}
            <linearGradient id="chevron-wall-facet" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#732408" stopOpacity="0.95" />
              <stop offset="50%" stopColor="#A23B15" stopOpacity="0.88" />
              <stop offset="100%" stopColor="#D96638" stopOpacity="0.4" />
            </linearGradient>

            {/* Inner Nested Chevron Face */}
            <linearGradient id="inner-chevron-facet" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#FFF8F4" stopOpacity="0.98" />
              <stop offset="35%" stopColor="#F8BE9F" stopOpacity="0.88" />
              <stop offset="100%" stopColor="#D2744E" stopOpacity="0.45" />
            </linearGradient>

            {/* Native SVG Filter for Tactile Sand / Film Stipple Noise */}
            <filter id="sand-grain-filter" x="0%" y="0%" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency="0.78" numOctaves="4" result="noise" />
              <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.82 0" result="denseNoise" />
              <feComposite in="denseNoise" in2="SourceGraphic" operator="in" />
            </filter>
          </defs>

          {/* 1. Base Gradient Atmosphere */}
          <rect width="540" height="430" fill="url(#bg-atmosphere-gradient)" />

          {/* 2. Top-Right Sun Glow */}
          <rect width="540" height="430" fill="url(#top-right-sunburst)" />

          {/* 3. Bottom-Right Sand Ambient Light */}
          <rect width="540" height="430" fill="url(#sand-reflection-glow)" />

          {/* 4. 3D Architectural Arrow Chevron Structure pointing down-right */}
          <g transform="translate(190, -30) rotate(-14 200 200)">
            {/* Soft Depth Ambient Shadow */}
            <path
              d="M 370 20 L 485 135 L 265 355 L 175 265 L 295 145 L 235 85 Z"
              fill="#380E02"
              fillOpacity="0.38"
            />

            {/* 3D Extruded Lower/Side Wall */}
            <path
              d="M 445 95 L 485 135 L 265 355 L 225 315 Z"
              fill="url(#chevron-wall-facet)"
            />

            {/* Main Outer Arrow Top Face */}
            <path
              d="M 345 -10 L 455 100 L 235 320 L 125 210 L 215 120 L 255 160 L 375 40 Z"
              fill="url(#chevron-top-facet)"
            />

            {/* Specular White Rim Highlight along Outer Edge */}
            <path
              d="M 345 -10 L 455 100 L 235 320"
              stroke="#FFFFFF"
              strokeWidth="4.2"
              strokeLinecap="round"
              strokeOpacity="0.98"
            />

            {/* Specular Edge along Bottom Bevel */}
            <path
              d="M 125 210 L 235 320"
              stroke="#FFEBE2"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeOpacity="0.88"
            />

            {/* Secondary Inner Nested Chevron */}
            <path
              d="M 405 -45 L 505 55 L 345 215 L 245 115 L 325 35 L 355 65 Z"
              fill="url(#inner-chevron-facet)"
              opacity="0.92"
            />

            {/* Specular Rim on Inner Chevron */}
            <path
              d="M 405 -45 L 505 55 L 345 215"
              stroke="#FFFFFF"
              strokeWidth="3.5"
              strokeOpacity="0.88"
            />

            {/* Ambient Diagonal Light Sweep */}
            <path
              d="M 455 100 L 235 320 L 80 470 L 520 470 Z"
              fill="#F9BD8A"
              fillOpacity="0.18"
            />
          </g>

          {/* Direct SVG Noise Layer */}
          <rect
            width="540"
            height="430"
            filter="url(#sand-grain-filter)"
            opacity="0.45"
            style={{ mixBlendMode: 'overlay' }}
          />
        </svg>
      </div>

      {/* Layer 1: Tactile Fine Sand Noise Texture */}
      <div
        className="absolute inset-0 pointer-events-none z-[1] opacity-55 mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='sandNoise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.95' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23sandNoise)' opacity='0.9'/%3E%3C/svg%3E")`,
          backgroundSize: '130px 130px',
        }}
      />
      {/* Layer 2: Soft Film Grain Depth */}
      <div
        className="absolute inset-0 pointer-events-none z-[2] opacity-35 mix-blend-soft-light"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 160 160' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='grainDepth'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.4' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23grainDepth)' opacity='0.95'/%3E%3C/svg%3E")`,
          backgroundSize: '95px 95px',
        }}
      />

      {/* Content Layer (z-10) */}
      <div className="relative z-10 flex flex-col items-start gap-2.5">
        {/* Frosted Glass "💡 Insights" Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md border border-white/30 text-white text-[12.5px] font-medium shadow-[0_2px_8px_rgba(0,0,0,0.1)]">
          <Lightbulb className="w-3.5 h-3.5 text-white fill-white/20 stroke-[2.2]" />
          <span>Insights</span>
        </div>

        {/* Large Percentage Headline */}
        <div className="mt-1">
          <span className="text-[52px] sm:text-[58px] font-[550] tracking-[-0.04em] text-white leading-none drop-shadow-sm">
            {currentInsight.percentage}
          </span>
        </div>

        {/* Insight Copy */}
        <div className="space-y-1.5 max-w-[320px] text-left mt-1.5">
          <h3 className="text-[15px] sm:text-[16px] font-[600] text-white leading-[1.3] tracking-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)]">
            {currentInsight.headline}
          </h3>
          <p className="text-[12.5px] sm:text-[13px] text-white/85 font-normal leading-[1.42] tracking-normal drop-shadow-[0_1px_2px_rgba(0,0,0,0.15)]">
            {currentInsight.description}
          </p>
        </div>
      </div>

      {/* Bottom Segmented Progress Pagination (3 Bars) */}
      <div className="relative z-10 w-full pt-4 flex items-center gap-2">
        {insights.map((_, idx) => {
          const isActive = idx === activeSegment;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => setActiveSegment(idx)}
              aria-label={`View insight ${idx + 1}`}
              className={`h-[3.5px] rounded-full transition-all duration-300 cursor-pointer flex-1 ${
                isActive
                  ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]'
                  : 'bg-white/30 hover:bg-white/50'
              }`}
            />
          );
        })}
      </div>
    </div>
  );
};
