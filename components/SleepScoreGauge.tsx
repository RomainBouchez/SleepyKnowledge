'use client';

import { useEffect, useRef } from 'react';

interface Props {
  score: number;   // 0–100
  size?: number;
  strokeWidth?: number;
}

export default function SleepScoreGauge({ score, size = 160, strokeWidth = 10 }: Props) {
  const clamped      = Math.max(0, Math.min(100, score));
  const progressRef  = useRef<SVGCircleElement>(null);

  const cx            = size / 2;
  const cy            = size / 2;
  const radius        = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength     = circumference * 0.75;
  const gapLength     = circumference - arcLength;
  const progressLen   = (clamped / 100) * arcLength;

  useEffect(() => {
    const el = progressRef.current;
    if (!el) return;
    el.style.strokeDashoffset = String(arcLength);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.strokeDashoffset = String(arcLength - progressLen);
      });
    });
  }, [clamped, arcLength, progressLen]);

  // Score as X.X / 10
  const display  = (clamped / 10).toFixed(1);
  const rotation = `rotate(135, ${cx}, ${cy})`;

  // Color band based on score
  const arcColor = clamped >= 80 ? '#ff6b35'
                 : clamped >= 60 ? '#ff8c00'
                 : clamped >= 40 ? '#ffb040'
                 : '#e05a4a';

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={arcColor} stopOpacity={0.5} />
            <stop offset="100%" stopColor={arcColor} stopOpacity={1} />
          </linearGradient>
        </defs>

        {/* Track */}
        <circle
          cx={cx} cy={cy} r={radius}
          fill="none"
          stroke="#2a2320"
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${gapLength}`}
          strokeLinecap="round"
          transform={rotation}
        />

        {/* Progress */}
        <circle
          ref={progressRef}
          cx={cx} cy={cy} r={radius}
          fill="none"
          stroke="url(#gaugeGrad)"
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${gapLength}`}
          strokeDashoffset={arcLength}
          strokeLinecap="round"
          transform={rotation}
          className="gauge-progress"
        />
      </svg>

      {/* Label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ paddingBottom: 8 }}>
        <div className="flex items-baseline gap-0.5">
          <span
            className="font-black leading-none"
            style={{ fontSize: 42, letterSpacing: -2, color: arcColor }}>
            {display}
          </span>
          <span className="font-bold" style={{ fontSize: 16, color: arcColor, opacity: 0.6 }}>/10</span>
        </div>
        <span className="section-label mt-1">Score</span>
      </div>
    </div>
  );
}
