import React, { useState } from 'react';
import { RETENTION_DATA, RETENTION_STAIRS } from '../../data/mockData';
import { OverflowMenu } from '../common/OverflowMenu';

export const RetentionCard: React.FC = () => {
  const [hoveredPoint, setHoveredPoint] = useState<{ month: string; value: number } | null>(null);

  const months = RETENTION_DATA;
  const currentPeak = hoveredPoint || { month: 'Apr', value: 42 };

  // SVG dimensions
  const width = 360;
  const height = 210;
  const paddingLeft = 14;
  const paddingRight = 14;
  const paddingTop = 32;
  const paddingBottom = 26;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Scale calculations
  const maxVal = 50;
  const minVal = 10;
  const getY = (val: number) => {
    const norm = (val - minVal) / (maxVal - minVal);
    return paddingTop + chartHeight * (1 - norm);
  };

  const getX = (normX: number) => {
    return paddingLeft + chartWidth * normX;
  };

  // Build SVG Path for the staircase line
  let pathD = '';
  RETENTION_STAIRS.forEach((pt, index) => {
    const x = getX(pt.x);
    const y = getY(pt.y);
    if (index === 0) {
      pathD += `M ${x} ${y}`;
    } else {
      pathD += ` L ${x} ${y}`;
    }
  });

  // Calculate exact Y on the staircase for any normX (0 to 1)
  const getStaircaseY = (normX: number) => {
    for (let j = 0; j < RETENTION_STAIRS.length - 1; j++) {
      const p1 = RETENTION_STAIRS[j];
      const p2 = RETENTION_STAIRS[j + 1];
      if (p1.y === p2.y) {
        const minX = Math.min(p1.x, p2.x);
        const maxX = Math.max(p1.x, p2.x);
        if (normX >= minX - 0.0001 && normX <= maxX + 0.0001) {
          return p1.y;
        }
      }
    }
    for (let j = 0; j < RETENTION_STAIRS.length - 1; j++) {
      const p1 = RETENTION_STAIRS[j];
      const p2 = RETENTION_STAIRS[j + 1];
      if (normX >= p1.x && normX <= p2.x) {
        return p1.y;
      }
    }
    return RETENTION_STAIRS[0].y;
  };

  // Generate dense vertical light pink lines below the staircase
  const numRainLines = 52;
  const rainLines = [];
  for (let i = 0; i <= numRainLines; i++) {
    const normX = i / numRainLines;
    const x = getX(normX);
    const ptY = getStaircaseY(normX);
    const yTop = getY(ptY);
    const yBottom = height - paddingBottom;
    rainLines.push({ x, yTop, yBottom });
  }

  // Peak April marker coordinates (located at step 7 top-left corner)
  const peakNormX = 0.49;
  const peakX = getX(peakNormX);
  const peakY = getY(39);

  return (
    <div
      className="soft-card w-full h-full rounded-[28px] p-6 sm:p-7 flex flex-col justify-between min-h-[380px]"
      id="card-retention"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[21px] sm:text-[23px] font-[550] tracking-[-0.03em] text-[#111111] leading-none">
          Retention
        </h2>
        <OverflowMenu cardTitle="Retention" />
      </div>

      {/* Staircase Chart Container */}
      <div className="w-full relative select-none my-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible"
          preserveAspectRatio="none"
        >
          <defs>
            {/* Light pink gradient for vertical lines inside retention chart with userSpaceOnUse */}
            <linearGradient
              id="retention-lines-gradient"
              x1="0"
              y1={paddingTop}
              x2="0"
              y2={height - paddingBottom}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#F4267E" stopOpacity="0.45" />
              <stop offset="60%" stopColor="#F4267E" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#F4267E" stopOpacity="0.06" />
            </linearGradient>
          </defs>

          {/* Vertical light pink pinstripe lines inside chart */}
          {rainLines.map((line, idx) => (
            <line
              key={idx}
              x1={line.x}
              y1={line.yTop}
              x2={line.x}
              y2={line.yBottom}
              stroke="url(#retention-lines-gradient)"
              strokeWidth="2"
              strokeLinecap="butt"
            />
          ))}

          {/* Stepped solid Pink Line with sharp miter joints */}
          <path
            d={pathD}
            fill="none"
            stroke="#FF1E76"
            strokeWidth="2.8"
            strokeLinecap="square"
            strokeLinejoin="miter"
          />

          {/* Baseline */}
          <line
            x1={paddingLeft}
            y1={height - paddingBottom}
            x2={width - paddingRight}
            y2={height - paddingBottom}
            stroke="#EFEFEF"
            strokeWidth="1"
          />

          {/* Pink point circle on the line at peak */}
          <circle
            cx={peakX}
            cy={peakY}
            r="3.5"
            fill="#FF1E76"
            stroke="#FFFFFF"
            strokeWidth="1.5"
          />
        </svg>

        {/* Floating White Pill Badge with Peak (42%) and soft pink aura shadow */}
        <div
          className="absolute z-10 pointer-events-none"
          style={{
            left: `${(peakX / width) * 100}%`,
            top: `${(peakY / height) * 100}%`,
            transform: 'translate(-50%, -135%)',
          }}
        >
          <div className="bg-white px-3 py-1 rounded-full shadow-[0_4px_16px_rgba(255,30,118,0.22),0_1px_4px_rgba(0,0,0,0.06)] border border-black/[0.04] text-[12px] font-semibold text-[#111111] flex items-center justify-center leading-none">
            <span>{currentPeak.value}%</span>
          </div>
        </div>

        {/* X-Axis Month Labels */}
        <div className="flex items-center justify-between px-2 pt-2.5 text-[12.5px] text-[#9CA3AF] font-normal">
          {months.map((m) => (
            <button
              key={m.month}
              type="button"
              onMouseEnter={() => setHoveredPoint({ month: m.month, value: m.value })}
              onMouseLeave={() => setHoveredPoint(null)}
              className="hover:text-[#111111] transition-colors cursor-pointer"
            >
              {m.month}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
