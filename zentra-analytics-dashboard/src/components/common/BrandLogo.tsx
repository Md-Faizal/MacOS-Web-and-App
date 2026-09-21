import React from 'react';

interface BrandLogoProps {
  className?: string;
  size?: number;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ className = '', size = 32 }) => {
  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`} id="brand-logo">
      {/* Exact Zentra Orange Geometric Logo Mark from reference */}
      <div
        className="flex items-center justify-center rounded-[8px] bg-[#FF8000] shadow-[0_2px_8px_rgba(255,128,0,0.35)] text-white relative overflow-hidden shrink-0"
        style={{ width: `${size}px`, height: `${size}px` }}
      >
        <svg
          viewBox="0 0 28 28"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-[19px] h-[19px]"
        >
          {/* Rounded outer loop frame */}
          <rect
            x="3.5"
            y="3.5"
            width="21"
            height="21"
            rx="5.5"
            stroke="white"
            strokeWidth="3.2"
          />
          {/* Diagonal internal slash connecting opposite corners */}
          <path
            d="M7 21L21 7"
            stroke="white"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* Brand typography */}
      <span className="text-[24px] font-[600] tracking-[-0.04em] text-[#111111] leading-none">
        zentra
      </span>
    </div>
  );
};
