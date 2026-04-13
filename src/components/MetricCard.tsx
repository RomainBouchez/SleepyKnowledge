import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Colors, SharedStyles, Spacing} from '../theme';

interface Props {
  icon: string;
  label: string;
  value: string;
  unit?: string;
  color?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendPositive?: boolean; // true if "up" is good
}

function trendArrow(trend: 'up' | 'down' | 'neutral'): string {
  if (trend === 'up')   {return '▲';}
  if (trend === 'down') {return '▼';}
  return '─';
}

function trendColor(
  trend: 'up' | 'down' | 'neutral',
  trendPositive: boolean,
): string {
  if (trend === 'neutral') {return Colors.textMuted;}
  const goodColor = Colors.success;
  const badColor  = Colors.danger;
  if (trend === 'up')   {return trendPositive ? goodColor : badColor;}
  return trendPositive ? badColor : goodColor;
}

export default function MetricCard({
  icon,
  label,
  value,
  unit,
  color = Colors.primary,
  trend,
  trendPositive = true,
}: Props): React.JSX.Element {
  return (
    <View style={[SharedStyles.card, styles.card]}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={[styles.value, {color}]}>
        {value}
        {unit ? <Text style={styles.unit}> {unit}</Text> : null}
      </Text>
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
      {trend && (
        <Text
          style={[
            styles.trend,
            {color: trendColor(trend, trendPositive)},
          ]}>
          {trendArrow(trend)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 90,
    alignItems: 'flex-start',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm + 4,
    gap: 2,
  },
  icon: {
    fontSize: 20,
    marginBottom: 2,
  },
  value: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
    lineHeight: 28,
  },
  unit: {
    fontSize: 13,
    fontWeight: '400',
    color: Colors.textSecondary,
  },
  label: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '500',
    letterSpacing: 0.3,
    marginTop: 2,
  },
  trend: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },
});
