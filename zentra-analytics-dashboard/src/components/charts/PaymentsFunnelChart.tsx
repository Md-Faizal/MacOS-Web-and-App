import React, { useState } from 'react';
import { PAYMENT_STAGES } from '../../data/mockData';
import { PaymentFunnelStage } from '../../types';

interface PaymentsFunnelChartProps {
  onSelectStage?: (stage: PaymentFunnelStage) => void;
  selectedStageId?: string;
}

export const PaymentsFunnelChart: React.FC<PaymentsFunnelChartProps> = ({
  onSelectStage,
  selectedStageId = 'successful',
}) => {
  const [hoveredStageId, setHoveredStageId] = useState<string | null>(null);

  const stages = PAYMENT_STAGES;
  const activeId = hoveredStageId || selectedStageId || null;
  const activeStage = activeId ? stages.find((s) => s.id === activeId) || null : null;

  // Chart coordinates
  const width = 880;
  const height = 230;
  const paddingLeft = 45;
  const paddingRight = 15;
  const paddingTop = 12;
  const paddingBottom = 12;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Y-axis levels: 70k down to 30k
  const maxY = 75;
  const minY = 25;
  const getY = (val: number) => {
    const norm = (val - minY) / (maxY - minY);
    return paddingTop + chartHeight * (1 - norm);
  };

  const yTicks = [
    { label: '70k', val: 70 },
    { label: '60k', val: 60 },
    { label: '50k', val: 50 },
    { label: '40k', val: 40 },
    { label: '30k', val: 30 },
  ];

  const colWidth = chartWidth / stages.length;

  return (
    <div className="w-full relative select-none" id="payments-funnel-container">
      {/* Top stage metrics row (5 columns) */}
      <div className="relative z-10 grid grid-cols-5 gap-1.5 pb-2 pl-8 pr-2 pt-0.5 sm:gap-2 sm:pl-10 sm:pr-3">
        {stages.map((stage) => {
          const isSelected = stage.id === activeId;

          return (
            <div
              key={stage.id}
              onClick={() => onSelectStage && onSelectStage(stage)}
              onMouseEnter={() => setHoveredStageId(stage.id)}
              onMouseLeave={() => setHoveredStageId(null)}
              className="group relative cursor-pointer text-left transition-all duration-150"
            >
              <div className={`truncate text-[10px] font-normal leading-tight sm:text-[12.5px] ${
                isSelected ? 'font-medium text-[#111111]' : 'text-[#737373]'
              }`}>
                {stage.label}
              </div>
              <div className={`mt-0.5 text-[16px] leading-tight tracking-[-0.035em] sm:text-[23px] ${
                isSelected ? 'font-[600] text-[#111111]' : 'font-[500] text-[#222222]'
              }`}>
                {stage.displayValue}
              </div>

              <div className="mt-1.5 flex items-center">
                {isSelected ? (
                  <div className="h-[5px] w-8 rounded-full bg-[#2563EB] shadow-[0_0_8px_rgba(37,99,235,0.6)]" />
                ) : (
                  <div className="h-[5px] w-8 rounded-full border border-[#2563EB]/30 bg-white transition-colors group-hover:border-[#2563EB]/80" />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* SVG 3D Stepped Funnel Visualization */}
      <div className="relative mt-1 w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="block h-auto w-full overflow-visible"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            {/* Diagonal striped SVG pattern for 3D front faces */}
            <pattern
              id="funnel-diagonal-stripes-3d"
              width="9"
              height="9"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="9" height="9" fill="#2563EB" fillOpacity="0.92" />
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="9"
                stroke="#FFFFFF"
                strokeWidth="2.6"
                strokeOpacity="0.95"
              />
            </pattern>

            {/* Vertical Atmospheric Fade for striped blocks */}
            <linearGradient id="striped-fade-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
              <stop offset="60%" stopColor="#FFFFFF" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.15" />
            </linearGradient>

            <mask id="striped-3d-mask">
              <rect
                x="0"
                y="0"
                width={width}
                height={height}
                fill="url(#striped-fade-gradient)"
              />
            </mask>

            {/* Solid Royal Blue Gradient for Successful Payments 3D block */}
            <linearGradient id="solid-blue-front" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#2563EB" stopOpacity="1" />
              <stop offset="45%" stopColor="#1D4ED8" stopOpacity="0.98" />
              <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.75" />
            </linearGradient>

            {/* 3D Right Side Extruded Wall Gradients */}
            <linearGradient id="side-wall-striped" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#93C5FD" stopOpacity="0.7" />
              <stop offset="60%" stopColor="#BFDBFE" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#DBEAFE" stopOpacity="0.15" />
            </linearGradient>

            <linearGradient id="side-wall-solid" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#1E40AF" stopOpacity="0.9" />
              <stop offset="60%" stopColor="#172554" stopOpacity="0.75" />
              <stop offset="100%" stopColor="#1E3A8A" stopOpacity="0.5" />
            </linearGradient>

            {/* Top Bevel Highlight for 3D Steps */}
            <linearGradient id="top-bevel-highlight" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#93C5FD" stopOpacity="0.95" />
              <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#60A5FA" stopOpacity="0.95" />
            </linearGradient>

            {/* Soft Ambient Glow Filter */}
            <filter id="glow-3d-highlight" x="-15%" y="-15%" width="130%" height="130%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>

            {/* Atmospheric floor haze */}
            <linearGradient id="floor-haze" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#E0EDFF" stopOpacity="0" />
              <stop offset="100%" stopColor="#D8E8FF" stopOpacity="0.8" />
            </linearGradient>
          </defs>

          {/* Faint Vertical Stage Dividing Lines extending full height */}
          {stages.map((_, idx) => {
            if (idx === 0) return null;
            const xDivider = paddingLeft + idx * colWidth;
            return (
              <line
                key={`divider-${idx}`}
                x1={xDivider}
                y1={0}
                x2={xDivider}
                y2={height}
                stroke="#EEEEED"
                strokeWidth="1"
              />
            );
          })}

          {/* Y-Axis Horizontal Grid Lines and Labels */}
          {yTicks.map((tick) => {
            const y = getY(tick.val);
            return (
              <g key={tick.label}>
                <text
                  x={paddingLeft - 10}
                  y={y + 3.5}
                  textAnchor="end"
                  className="fill-[#8E8E93] text-[11px] font-normal select-none"
                >
                  {tick.label}
                </text>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="#EEEEED"
                  strokeWidth="1"
                  strokeDasharray="2 3"
                />
              </g>
            );
          })}

          {/* 3D Stepped Blocks Rendering */}
          {stages.map((stage, idx) => {
            const isSolid = stage.id === 'successful' || stage.id === hoveredStageId;
            const x0 = paddingLeft + idx * colWidth + 4;
            const stepWidth = colWidth * 0.72; // plateau width
            const x1 = x0 + stepWidth;
            const nextX0 = paddingLeft + (idx + 1) * colWidth + 4;

            const yTop = getY(stage.yValue);
            const yBottom = height + 10;

            const nextStage = stages[idx + 1];
            const nextYTop = nextStage ? getY(nextStage.yValue) : yTop + 20;

            // Front face plateau polygon
            const frontPathD = `
              M ${x0} ${yTop}
              L ${x1} ${yTop}
              L ${x1} ${yBottom}
              L ${x0} ${yBottom}
              Z
            `;

            // 3D Angled Side Facet / Transition Slope Polygon
            const sideFacetPathD = `
              M ${x1} ${yTop}
              L ${nextX0 - 4} ${nextYTop}
              L ${nextX0 - 4} ${yBottom}
              L ${x1} ${yBottom}
              Z
            `;

            return (
              <g
                key={stage.id}
                className="cursor-pointer transition-all duration-200"
                onClick={() => onSelectStage && onSelectStage(stage)}
                onMouseEnter={() => setHoveredStageId(stage.id)}
                onMouseLeave={() => setHoveredStageId(null)}
              >
                {isSolid ? (
                  // Solid Royal Blue 3D Highlight Block
                  <g filter="url(#glow-3d-highlight)">
                    {/* Front Face: Solid Royal Blue */}
                    <path
                      d={frontPathD}
                      fill="url(#solid-blue-front)"
                      className="transition-all duration-150"
                    />

                    {/* 3D Extruded Sloped Side Facet */}
                    <path
                      d={sideFacetPathD}
                      fill="url(#side-wall-solid)"
                    />

                    {/* Top Plateau 3D Bevel Cap Stroke */}
                    <path
                      d={`M ${x0} ${yTop} L ${x1} ${yTop}`}
                      stroke="url(#top-bevel-highlight)"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                    />

                    {/* Sloped Edge Highlight */}
                    <path
                      d={`M ${x1} ${yTop} L ${nextX0 - 4} ${nextYTop}`}
                      stroke="#60A5FA"
                      strokeWidth="2.5"
                      strokeOpacity="0.85"
                    />

                    {/* Corner 3D vertical edge */}
                    <line
                      x1={x1}
                      y1={yTop}
                      x2={x1}
                      y2={yBottom}
                      stroke="#1E3A8A"
                      strokeWidth="1.5"
                      strokeOpacity="0.6"
                    />
                  </g>
                ) : (
                  // Diagonal Striped 3D Block
                  <g>
                    {/* Front Face: Diagonal Striped with vertical fade mask */}
                    <path
                      d={frontPathD}
                      fill="url(#funnel-diagonal-stripes-3d)"
                      mask="url(#striped-3d-mask)"
                      opacity={0.92}
                    />

                    {/* 3D Extruded Sloped Side Facet */}
                    <path
                      d={sideFacetPathD}
                      fill="url(#side-wall-striped)"
                      mask="url(#striped-3d-mask)"
                    />

                    {/* Top Plateau Crisp Blue Stroke */}
                    <path
                      d={`M ${x0} ${yTop} L ${x1} ${yTop}`}
                      stroke="#2563EB"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />

                    {/* Sloped Edge Connecting Stroke */}
                    <path
                      d={`M ${x1} ${yTop} L ${nextX0 - 4} ${nextYTop}`}
                      stroke="#3B82F6"
                      strokeWidth="1.8"
                      strokeOpacity="0.75"
                    />

                    {/* 3D Corner Crease Line */}
                    <line
                      x1={x1}
                      y1={yTop}
                      x2={x1}
                      y2={yBottom}
                      stroke="#93C5FD"
                      strokeWidth="1"
                      strokeOpacity="0.4"
                    />
                  </g>
                )}
              </g>
            );
          })}

          {/* Atmospheric Floor Light Gradient */}
          <rect
            x={paddingLeft}
            y={height - 35}
            width={chartWidth}
            height={35}
            fill="url(#floor-haze)"
            className="pointer-events-none"
          />
        </svg>

        {/* Tooltip with black cursor pointer as shown in Image 2 */}
        {activeStage && (
          <div
            className="absolute z-30 pointer-events-none transition-all duration-150 ease-out"
            style={{
              left: `${Math.min(94, Math.max(8, ((paddingLeft + (stages.findIndex((s) => s.id === activeStage.id) + 0.8) * colWidth) / width) * 100))}%`,
              top: '46%',
              transform: 'translate(-50%, -100%)',
            }}
          >
            {/* Tooltip container */}
            <div className="relative">
              {/* Tooltip Pill */}
              <div className="bg-white/95 backdrop-blur-md px-3 py-1 rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.12),0_1px_3px_rgba(0,0,0,0.06)] border border-black/[0.08] flex items-center gap-1.5 whitespace-nowrap text-[11.5px] text-[#444444] animate-in fade-in zoom-in-95 duration-150">
                <span className="font-semibold text-[#111111]">{activeStage.displayValue} transactions</span>
                <span className="text-[#D0D0D0]">|</span>
                <span>
                  Conversion: <strong className="font-semibold text-[#111111]">{activeStage.conversion}%</strong>
                </span>
                <span className="text-[#D0D0D0]">|</span>
                <span>
                  Drop-off: <strong className="font-semibold text-[#111111]">{activeStage.dropOff}%</strong>
                </span>
              </div>

              {/* Black Mouse Pointer Arrow as in mockup screenshot */}
              <div className="absolute -left-5 -bottom-2 transform rotate-[-15deg] pointer-events-none">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M3 3L10.07 20.97L12.58 13.58L19.97 11.07L3 3Z"
                    fill="#111111"
                    stroke="#FFFFFF"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
