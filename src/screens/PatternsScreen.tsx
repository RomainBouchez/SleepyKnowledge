import React, {useCallback, useState} from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect} from '@react-navigation/native';
import {
  VictoryChart,
  VictoryLine,
  VictoryAxis,
  VictoryScatter,
  VictoryTheme,
  VictoryArea,
  VictoryLabel,
} from 'victory-native';

import {getSleepRecords, getLifestyleLogs} from '../services/database';
import {Colors, SharedStyles, Spacing} from '../theme';
import {SleepRecord, LifestyleLog, DataPoint, CorrelationPoint} from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

type Range = '7j' | '30j';

interface CorrelationData {
  title: string;
  xLabel: string;
  yLabel: string;
  points: CorrelationPoint[];
  color: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function shortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

// Pearson correlation coefficient
function pearson(points: CorrelationPoint[]): number {
  const n = points.length;
  if (n < 2) {return 0;}
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  const num = points.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
  const den = Math.sqrt(
    points.reduce((s, p) => s + (p.x - mx) ** 2, 0) *
      points.reduce((s, p) => s + (p.y - my) ** 2, 0),
  );
  return den === 0 ? 0 : num / den;
}

function correlationLabel(r: number): string {
  const abs = Math.abs(r);
  const dir = r >= 0 ? 'positive' : 'négative';
  if (abs > 0.6) {return `Forte corrélation ${dir}`;}
  if (abs > 0.3) {return `Corrélation ${dir} modérée`;}
  return 'Pas de corrélation claire';
}

// ── Victory theme override ────────────────────────────────────────────────────

const chartTheme = {
  ...VictoryTheme.material,
  axis: {
    ...VictoryTheme.material.axis,
    style: {
      ...VictoryTheme.material.axis?.style,
      grid: {stroke: Colors.surfaceAlt, strokeWidth: 1},
      tickLabels: {fill: Colors.textMuted, fontSize: 10},
      axis: {stroke: Colors.border},
    },
  },
};

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({title}: {title: string}): React.JSX.Element {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function PatternsScreen(): React.JSX.Element {
  const [range, setRange] = useState<Range>('7j');
  const [sleepRecords, setSleepRecords] = useState<SleepRecord[]>([]);
  const [lifestyleLogs, setLifestyleLogs] = useState<LifestyleLog[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        const [sr, ll] = await Promise.all([
          getSleepRecords(30),
          getLifestyleLogs(30),
        ]);
        setSleepRecords(sr);
        setLifestyleLogs(ll);
        setLoading(false);
      })();
    }, []),
  );

  const displayed = range === '7j' ? sleepRecords.slice(-7) : sleepRecords;

  // ── Chart data ──────────────────────────────────────────────────────────────

  const durationData: DataPoint[] = displayed.map((r, i) => ({
    x: shortDate(r.date),
    y: Math.round(r.duration_min / 60 * 10) / 10,
  }));

  const deepData: DataPoint[] = displayed.map(r => ({
    x: shortDate(r.date),
    y: pct(r.deep_sleep_min, r.duration_min),
  }));

  const remData: DataPoint[] = displayed.map(r => ({
    x: shortDate(r.date),
    y: pct(r.rem_sleep_min, r.duration_min),
  }));

  const scoreData: DataPoint[] = displayed.map(r => ({
    x: shortDate(r.date),
    y: r.sleep_score,
  }));

  // ── Correlations ────────────────────────────────────────────────────────────

  const logMap = new Map(lifestyleLogs.map(l => [l.date, l]));

  function corr(
    title: string,
    xLabel: string,
    yLabel: string,
    getX: (l: LifestyleLog) => number,
    getY: (r: SleepRecord) => number,
    color: string,
  ): CorrelationData {
    const points: CorrelationPoint[] = [];
    for (const r of sleepRecords) {
      const l = logMap.get(r.date);
      if (l && getX(l) > 0) {
        points.push({x: getX(l), y: getY(r), date: r.date});
      }
    }
    return {title, xLabel, yLabel, points, color};
  }

  const correlations: CorrelationData[] = [
    corr(
      '☕ Caféine → Deep sleep',
      'Caféine (mg)',
      'Deep sleep (%)',
      l => l.caffeine_mg,
      r => pct(r.deep_sleep_min, r.duration_min),
      Colors.primary,
    ),
    corr(
      '🌿 Weed → REM',
      'Weed (1=oui)',
      'REM (%)',
      l => l.weed ? 1 : 0,
      r => pct(r.rem_sleep_min, r.duration_min),
      Colors.secondary,
    ),
    corr(
      '🏋️ Intensité sport → Score',
      'Intensité sport (1–10)',
      'Score sommeil',
      l => l.sport_intensity,
      r => r.sleep_score,
      Colors.success,
    ),
    corr(
      '🍽️ Repas lourd → FC noc.',
      'Repas (1=léger, 3=lourd)',
      'FC moy (bpm)',
      l => l.meal_heaviness === 'léger' ? 1 : l.meal_heaviness === 'normal' ? 2 : 3,
      r => r.hr_avg,
      Colors.warning,
    ),
  ];

  // ── Top factors ─────────────────────────────────────────────────────────────

  const factors = correlations
    .filter(c => c.points.length >= 5)
    .map(c => ({...c, r: pearson(c.points)}))
    .sort((a, b) => Math.abs(b.r) - Math.abs(a.r));

  if (loading) {
    return (
      <SafeAreaView style={SharedStyles.screen}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (sleepRecords.length < 3) {
    return (
      <SafeAreaView style={SharedStyles.screen}>
        <View style={styles.centered}>
          <Text style={styles.emptyEmoji}>📊</Text>
          <Text style={styles.emptyText}>
            Pas assez de données pour afficher des patterns.{'\n'}
            Synchronise quelques nuits d'abord.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={SharedStyles.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>

        {/* ── Range selector ─────────────────────────────────────────────── */}
        <View style={styles.rangeRow}>
          <Text style={styles.screenTitle}>Patterns & Corrélations</Text>
          <View style={styles.rangeButtons}>
            {(['7j', '30j'] as Range[]).map(r => (
              <TouchableOpacity
                key={r}
                style={[
                  styles.rangeBtn,
                  range === r && styles.rangeBtnActive,
                ]}
                onPress={() => setRange(r)}>
                <Text
                  style={[
                    styles.rangeBtnText,
                    range === r && styles.rangeBtnTextActive,
                  ]}>
                  {r}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Score trend ────────────────────────────────────────────────── */}
        <View style={SharedStyles.card}>
          <Text style={SharedStyles.cardTitle}>Score de sommeil</Text>
          <VictoryChart
            height={180}
            padding={{top: 10, bottom: 30, left: 40, right: 10}}
            theme={chartTheme}>
            <VictoryAxis
              tickFormat={(_t, i) =>
                i % Math.max(1, Math.floor(scoreData.length / 5)) === 0
                  ? scoreData[i]?.x
                  : ''
              }
              style={{tickLabels: {fontSize: 9, fill: Colors.textMuted}}}
            />
            <VictoryAxis
              dependentAxis
              domain={[0, 100]}
              style={{tickLabels: {fontSize: 9, fill: Colors.textMuted}}}
            />
            <VictoryArea
              data={scoreData}
              style={{
                data: {
                  fill: Colors.primary + '22',
                  stroke: Colors.primary,
                  strokeWidth: 2,
                },
              }}
            />
          </VictoryChart>
        </View>

        {/* ── Duration ───────────────────────────────────────────────────── */}
        <View style={[SharedStyles.card, {marginTop: Spacing.sm}]}>
          <Text style={SharedStyles.cardTitle}>Durée de sommeil (h)</Text>
          <VictoryChart
            height={160}
            padding={{top: 10, bottom: 30, left: 35, right: 10}}
            theme={chartTheme}>
            <VictoryAxis
              tickFormat={(_t, i) =>
                i % Math.max(1, Math.floor(durationData.length / 5)) === 0
                  ? durationData[i]?.x
                  : ''
              }
              style={{tickLabels: {fontSize: 9, fill: Colors.textMuted}}}
            />
            <VictoryAxis
              dependentAxis
              style={{tickLabels: {fontSize: 9, fill: Colors.textMuted}}}
            />
            <VictoryLine
              data={durationData}
              style={{data: {stroke: Colors.accent, strokeWidth: 2}}}
            />
          </VictoryChart>
        </View>

        {/* ── Deep + REM ─────────────────────────────────────────────────── */}
        <View style={[SharedStyles.card, {marginTop: Spacing.sm}]}>
          <Text style={SharedStyles.cardTitle}>Deep sleep & REM (%)</Text>
          <VictoryChart
            height={180}
            padding={{top: 10, bottom: 30, left: 35, right: 10}}
            theme={chartTheme}>
            <VictoryAxis
              tickFormat={(_t, i) =>
                i % Math.max(1, Math.floor(deepData.length / 5)) === 0
                  ? deepData[i]?.x
                  : ''
              }
              style={{tickLabels: {fontSize: 9, fill: Colors.textMuted}}}
            />
            <VictoryAxis
              dependentAxis
              style={{tickLabels: {fontSize: 9, fill: Colors.textMuted}}}
            />
            <VictoryLine
              data={deepData}
              style={{data: {stroke: Colors.deepSleep, strokeWidth: 2}}}
            />
            <VictoryLine
              data={remData}
              style={{data: {stroke: Colors.remSleep, strokeWidth: 2}}}
            />
          </VictoryChart>
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, {backgroundColor: Colors.deepSleep}]} />
              <Text style={styles.legendLabel}>Deep</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, {backgroundColor: Colors.remSleep}]} />
              <Text style={styles.legendLabel}>REM</Text>
            </View>
          </View>
        </View>

        {/* ── Correlations ───────────────────────────────────────────────── */}
        <SectionHeader title="Corrélations lifestyle → sommeil" />

        {correlations.map((c, idx) => {
          const r = pearson(c.points);
          return (
            <View
              key={idx}
              style={[SharedStyles.card, {marginTop: idx === 0 ? 0 : Spacing.sm}]}>
              <Text style={SharedStyles.cardTitle}>{c.title}</Text>
              {c.points.length < 5 ? (
                <Text style={styles.notEnoughData}>
                  Pas assez de données (min. 5 nuits avec ce facteur)
                </Text>
              ) : (
                <>
                  <VictoryChart
                    height={160}
                    padding={{top: 10, bottom: 36, left: 40, right: 10}}
                    theme={chartTheme}>
                    <VictoryAxis
                      label={c.xLabel}
                      style={{
                        axisLabel: {
                          fontSize: 9,
                          fill: Colors.textMuted,
                          padding: 24,
                        },
                        tickLabels: {fontSize: 8, fill: Colors.textMuted},
                      }}
                    />
                    <VictoryAxis
                      dependentAxis
                      label={c.yLabel}
                      style={{
                        axisLabel: {
                          fontSize: 9,
                          fill: Colors.textMuted,
                          padding: 26,
                          angle: -90,
                        },
                        tickLabels: {fontSize: 8, fill: Colors.textMuted},
                      }}
                    />
                    <VictoryScatter
                      data={c.points}
                      size={4}
                      style={{
                        data: {fill: c.color, opacity: 0.75},
                      }}
                    />
                  </VictoryChart>
                  <View style={styles.corrInfo}>
                    <View
                      style={[
                        styles.corrBadge,
                        {
                          backgroundColor:
                            Math.abs(r) > 0.3
                              ? c.color + '33'
                              : Colors.surfaceAlt,
                          borderColor:
                            Math.abs(r) > 0.3 ? c.color : Colors.border,
                        },
                      ]}>
                      <Text style={[styles.corrR, {color: c.color}]}>
                        r = {r.toFixed(2)}
                      </Text>
                    </View>
                    <Text style={styles.corrLabel}>
                      {correlationLabel(r)}
                    </Text>
                  </View>
                </>
              )}
            </View>
          );
        })}

        {/* ── Top factors ────────────────────────────────────────────────── */}
        {factors.length > 0 && (
          <>
            <SectionHeader title="Top facteurs du mois" />
            <View style={SharedStyles.card}>
              {factors.slice(0, 3).map((f, i) => (
                <View
                  key={i}
                  style={[styles.factorRow, i > 0 && styles.factorBorder]}>
                  <Text style={styles.factorRank}>#{i + 1}</Text>
                  <View style={styles.factorInfo}>
                    <Text style={styles.factorTitle}>{f.title}</Text>
                    <Text style={styles.factorDesc}>
                      {correlationLabel(f.r)} (r={f.r.toFixed(2)})
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.factorDir,
                      {color: f.r >= 0 ? Colors.success : Colors.danger},
                    ]}>
                    {f.r >= 0 ? '▲' : '▼'}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        <View style={{height: Spacing.xl}} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyEmoji: {fontSize: 48, marginBottom: Spacing.md},
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 32,
  },
  screenTitle: {
    color: Colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
  },
  rangeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  rangeButtons: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 8,
    padding: 2,
  },
  rangeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 6,
  },
  rangeBtnActive: {
    backgroundColor: Colors.primary,
  },
  rangeBtnText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  rangeBtnTextActive: {
    color: '#fff',
  },
  sectionTitle: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  legend: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  corrInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: 4,
  },
  corrBadge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  corrR: {
    fontSize: 13,
    fontWeight: '700',
  },
  corrLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    flex: 1,
  },
  notEnoughData: {
    color: Colors.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
    paddingVertical: Spacing.sm,
  },
  factorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  factorBorder: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  factorRank: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
    width: 24,
  },
  factorInfo: {flex: 1},
  factorTitle: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  factorDesc: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  factorDir: {
    fontSize: 16,
    fontWeight: '700',
  },
});
