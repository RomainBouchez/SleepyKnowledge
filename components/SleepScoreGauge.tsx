'use client';

import { useEffect, useRef } from 'react';
import { scoreColor } from '@/lib/claude-client';

interface Props {
  score: number;
  size?: number;
  strokeWidth?: number;
}

export default function SleepScoreGauge({ score, size = 180, strokeWidth = 14 }: Props) {
  const clampedScore = Math.max(0, Math.min(100, score));
  const progressRef  = useRef<SVGCircleElement>(null);

  const cx           = size / 2;
  const cy           = size / 2;
  const radius       = (size - strokeWidth) / 2;
  const circumference= 2 * Math.PI * radius;
  const arcLength    = circumference * 0.75;       // 270° track
  const gapLength    = circumference - arcLength;
  const progressLen  = (clampedScore / 100) * arcLength;

  // Animate on score change via CSS transition
  useEffect(() => {
    const el = progressRef.current;
    if (!el) return;
    // Start at full offset (0 progress) then transition to target
    el.style.strokeDashoffset = String(arcLength); // instant reset
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.strokeDashoffset = String(arcLength - progressLen);
      });
    });
  }, [clampedScore, arcLength, progressLen]);

  const color = scoreColor(clampedScore);
  const rotation = `rotate(135, ${cx}, ${cy})`;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={color} stopOpacity={0.7} />
            <stop offset="100%" stopColor={color} stopOpacity={1} />
          </linearGradient>
        </defs>

        {/* Background track */}
        <circle
          cx={cx} cy={cy} r={radius}
          fill="none"
          stroke="#1E293B"
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${gapLength}`}
          strokeLinecap="round"
          transform={rotation}
        />

        {/* Progress arc */}
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

      {/* Score label */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center"
        style={{ top: 0 }}>
        <span
          className="font-bold leading-none"
          style={{ fontSize: 52, letterSpacing: -2, color }}>
          {clampedScore}
        </span>
        <span className="text-sl-muted text-sm font-medium">/100</span>
      </div>
    </div>
  );
}
