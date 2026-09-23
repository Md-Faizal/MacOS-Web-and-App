import React, { useEffect, useState } from 'react';

interface RollingDigitProps {
  digit: string;
}

export const RollingDigit: React.FC<RollingDigitProps> = React.memo(({ digit }) => {
  const [displayed, setDisplayed] = useState(digit);
  const [previous, setPrevious] = useState<string | null>(null);
  const [isRolling, setIsRolling] = useState(false);

  useEffect(() => {
    if (digit !== displayed) {
      setPrevious(displayed);
      setDisplayed(digit);
      setIsRolling(true);
      const timer = setTimeout(() => {
        setIsRolling(false);
        setPrevious(null);
      }, 90);
      return () => clearTimeout(timer);
    }
  }, [digit, displayed]);

  return (
    <div className="relative inline-flex h-36 w-20 sm:h-44 sm:w-26 md:h-48 md:w-30 overflow-hidden items-center justify-center font-mono font-[250] text-8xl sm:text-9xl md:text-[9.5rem] leading-none text-[#111111] select-none tracking-tight">
      {isRolling && previous !== null && (
        <span 
          key={`prev-${previous}`}
          className="absolute inset-0 flex items-center justify-center animate-digit-exit-up select-none pointer-events-none"
        >
          {previous}
        </span>
      )}
      <span 
        key={`curr-${displayed}`}
        className={`absolute inset-0 flex items-center justify-center select-none pointer-events-none ${
          isRolling ? 'animate-digit-enter-up' : ''
        }`}
      >
        {displayed}
      </span>
    </div>
  );
});

interface RollingCounterProps {
  value: number;
  className?: string;
}

export const RollingCounter: React.FC<RollingCounterProps> = ({ value, className = '' }) => {
  const clamped = Math.min(100, Math.max(0, Math.floor(value)));
  const formatted = String(clamped).padStart(3, '0');
  const d0 = formatted[0];
  const d1 = formatted[1];
  const d2 = formatted[2];

  return (
    <div className={`flex items-center justify-center tracking-tight ${className}`} aria-label={`${clamped}`}>
      <RollingDigit digit={d0} />
      <RollingDigit digit={d1} />
      <RollingDigit digit={d2} />
    </div>
  );
};
