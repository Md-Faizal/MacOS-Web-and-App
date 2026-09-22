import React from 'react';

interface BrandLogoProps {
  className?: string;
  size?: number;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ className = '', size = 32 }) => {
  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`} id="brand-logo">
      <div
        className="flex items-center justify-center rounded-[10px] bg-[#ff7a1a] shadow-[0_2px_8px_rgba(255,122,26,0.22)] text-white relative overflow-hidden shrink-0"
        style={{ width: `${size}px`, height: `${size}px` }}
      >
        <svg
          viewBox="0 0 28 28"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-[18px] w-[18px]"
        >
          <rect
            x="4"
            y="4"
            width="20"
            height="20"
            rx="5.5"
            stroke="white"
            strokeWidth="3.2"
          />
          <path d="M8 20L20 8" stroke="white" strokeWidth="3.2" strokeLinecap="round" />
        </svg>
      </div>

      <span className="text-[24px] font-[600] tracking-[-0.04em] text-[#111111] leading-none">
        zentra
      </span>
    </div>
  );
};
