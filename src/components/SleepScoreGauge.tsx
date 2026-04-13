import React, {useEffect, useRef} from 'react';
import {Animated, StyleSheet, Text, View} from 'react-native';
import Svg, {Circle, Defs, LinearGradient, Stop} from 'react-native-svg';
import {Colors, scoreColor} from '../theme';

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  score: number;      // 0–100
  size?: number;
  strokeWidth?: number;
}

// ── Animated SVG circle progress ──────────────────────────────────────────────
// Technique: stroke-dasharray / dashoffset on a 270° arc (gap at bottom).
// The circle is rotated 135° so the gap sits at the bottom.

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export default function SleepScoreGauge({
  score,
  size = 180,
  strokeWidth = 14,
}: Props): React.JSX.Element {
  const clampedScore = Math.max(0, Math.min(100, score));

  const cx = size / 2;
  const cy = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcPercent = 0.75; // 270° / 360°
  const arcLength = circumference * arcPercent;
  const gapLength = circumference - arcLength;

  // Animated progress value (0 → score)
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: clampedScore,
      duration: 900,
      useNativeDriver: false,
    }).start();
  }, [clampedScore, progress]);

  // Map animated value → dashoffset (progress portion of the arc)
  const strokeDashoffset = progress.interpolate({
    inputRange: [0, 100],
    outputRange: [arcLength, 0],
    extrapolate: 'clamp',
  });

  const color = scoreColor(clampedScore);

  return (
    <View style={[styles.wrapper, {width: size, height: size}]}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor={color} stopOpacity={0.7} />
            <Stop offset="100%" stopColor={color} stopOpacity={1} />
          </LinearGradient>
        </Defs>

        {/* Background track */}
        <Circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={Colors.surfaceAlt}
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${gapLength}`}
          strokeLinecap="round"
          transform={`rotate(135, ${cx}, ${cy})`}
        />

        {/* Progress arc */}
        <AnimatedCircle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="url(#gaugeGradient)"
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${gapLength}`}
          // @ts-ignore — strokeDashoffset accepts Animated.Value via AnimatedCircle
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(135, ${cx}, ${cy})`}
        />
      </Svg>

      {/* Score label in centre */}
      <View style={[styles.label, {width: size, height: size}]}>
        <Text style={[styles.scoreNumber, {color}]}>{clampedScore}</Text>
        <Text style={styles.scoreUnit}>/100</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    position: 'absolute',
    top: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreNumber: {
    fontSize: 52,
    fontWeight: '700',
    letterSpacing: -2,
    lineHeight: 56,
  },
  scoreUnit: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
    marginTop: -4,
  },
});
