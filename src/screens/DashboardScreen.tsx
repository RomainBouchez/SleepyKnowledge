import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {SafeAreaView} from 'react-native-safe-area-context';

import SleepScoreGauge from '../components/SleepScoreGauge';
import MetricCard from '../components/MetricCard';
import LifestyleForm from '../components/LifestyleForm';

import {
  getLatestSleepRecord,
  getTodayLifestyleLog,
  getSleepRecords,
  upsertLifestyleLog,
  getAiInsight,
  saveAiInsight,
  todayStr,
} from '../services/database';
import {generateMorningScore} from '../services/claude';
import {syncFromVps} from '../services/sync';
import {Colors, SharedStyles, Spacing, Typography, scoreColor} from '../theme';
import {LifestyleLog, SleepRecord} from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${m > 0 ? String(m).padStart(2, '0') : ''}`;
}

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function DashboardScreen(): React.JSX.Element {
  const [sleep, setSleep] = useState<SleepRecord | null>(null);
  const [lifestyle, setLifestyle] = useState<LifestyleLog | null>(null);
  const [aiComment, setAiComment] = useState<string>('');
  const [trend, setTrend] = useState<{score: number; duration: number} | null>(null);

  const [loadingData, setLoadingData] = useState(true);
  const [loadingAi, setLoadingAi] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [formVisible, setFormVisible] = useState(false);

  const aiAborted = useRef(false);

  // ── Load data ───────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [latestSleep, todayLog, allRecords] = await Promise.all([
        getLatestSleepRecord(),
        getTodayLifestyleLog(),
        getSleepRecords(14),
      ]);

      setSleep(latestSleep);
      setLifestyle(todayLog);

      // Trend: compare last 7 days avg with previous 7 days
      if (allRecords.length >= 2) {
        const recent = allRecords.slice(-7);
        const prev   = allRecords.slice(-14, -7);
        if (recent.length > 0 && prev.length > 0) {
          const avgScore = (arr: SleepRecord[]) =>
            arr.reduce((s, r) => s + r.sleep_score, 0) / arr.length;
          const avgDur = (arr: SleepRecord[]) =>
            arr.reduce((s, r) => s + r.duration_min, 0) / arr.length;
          setTrend({
            score: avgScore(recent) - avgScore(prev),
            duration: avgDur(recent) - avgDur(prev),
          });
        }
      }

      // Load or generate AI morning comment
      if (latestSleep) {
        await loadAiComment(latestSleep, todayLog);
      }
    } finally {
      setLoadingData(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      aiAborted.current = false;
      loadData();
      return () => {
        aiAborted.current = true;
      };
    }, [loadData]),
  );

  // ── AI comment ──────────────────────────────────────────────────────────────

  async function loadAiComment(
    sleepRecord: SleepRecord,
    lifestyleLog: LifestyleLog | null,
  ) {
    const cached = await getAiInsight(sleepRecord.date, 'morning_score');
    if (cached) {
      setAiComment(cached.content);
      return;
    }

    if (!process.env.CLAUDE_API_KEY && !require('react-native-config').default?.CLAUDE_API_KEY) {
      setAiComment('Configure ta clé CLAUDE_API_KEY dans .env pour activer le coach IA.');
      return;
    }

    setLoadingAi(true);
    try {
      const comment = await generateMorningScore(sleepRecord, lifestyleLog);
      if (!aiAborted.current) {
        setAiComment(comment);
        await saveAiInsight({
          date: sleepRecord.date,
          type: 'morning_score',
          content: comment,
          generated_at: new Date().toISOString(),
        });
      }
    } catch (err) {
      if (!aiAborted.current) {
        setAiComment('Impossible de contacter le coach IA pour l\'instant.');
      }
    } finally {
      if (!aiAborted.current) {
        setLoadingAi(false);
      }
    }
  }

  // ── Sync ────────────────────────────────────────────────────────────────────

  async function handleSync() {
    setSyncing(true);
    try {
      const result = await syncFromVps();
      if (result.success) {
        Alert.alert(
          'Synchronisation réussie',
          `${result.imported} nuit(s) importée(s).`,
        );
        await loadData();
      } else {
        Alert.alert('Erreur de sync', result.error);
      }
    } finally {
      setSyncing(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loadingData) {
    return (
      <SafeAreaView style={SharedStyles.screen}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const scoreVal = sleep?.sleep_score ?? 0;
  const deepPct  = pct(sleep?.deep_sleep_min ?? 0, sleep?.duration_min ?? 1);
  const remPct   = pct(sleep?.rem_sleep_min  ?? 0, sleep?.duration_min ?? 1);

  return (
    <SafeAreaView style={SharedStyles.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={syncing}
            onRefresh={handleSync}
            tintColor={Colors.primary}
          />
        }>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.greeting}>Bonjour 👋</Text>
            <Text style={styles.dateLabel}>{formatDate(sleep?.date)}</Text>
          </View>
          <TouchableOpacity
            style={styles.syncBtn}
            onPress={handleSync}
            disabled={syncing}>
            <Text style={styles.syncBtnText}>
              {syncing ? '⟳' : '↓ Sync'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Score + AI comment ──────────────────────────────────────── */}
        {sleep ? (
          <View style={styles.scoreSection}>
            <SleepScoreGauge score={scoreVal} />

            <View style={styles.aiCommentBox}>
              {loadingAi ? (
                <View style={styles.aiLoading}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={styles.aiLoadingText}>
                    Analyse en cours…
                  </Text>
                </View>
              ) : (
                <Text style={styles.aiComment}>{aiComment}</Text>
              )}
            </View>

            {/* Trend badge */}
            {trend && (
              <View style={styles.trendRow}>
                <TrendBadge
                  label="Score"
                  delta={trend.score}
                  format={v => `${v > 0 ? '+' : ''}${Math.round(v)} pts`}
                />
                <TrendBadge
                  label="Durée"
                  delta={trend.duration}
                  format={v => `${v > 0 ? '+' : ''}${Math.round(v)} min`}
                />
              </View>
            )}
          </View>
        ) : (
          <View style={styles.noData}>
            <Text style={styles.noDataEmoji}>🌙</Text>
            <Text style={styles.noDataText}>
              Aucune donnée de sommeil.{'\n'}Tire vers le bas pour synchroniser.
            </Text>
          </View>
        )}

        {/* ── Metrics grid ────────────────────────────────────────────── */}
        {sleep && (
          <>
            <Text style={styles.sectionTitle}>Métriques</Text>
            <View style={styles.metricsGrid}>
              <MetricCard
                icon="⏱"
                label="Durée totale"
                value={fmtDuration(sleep.duration_min)}
                color={Colors.textPrimary}
                trend={trend ? (trend.duration > 0 ? 'up' : 'down') : undefined}
                trendPositive
              />
              <MetricCard
                icon="🌊"
                label="Deep sleep"
                value={String(deepPct)}
                unit="%"
                color={Colors.deepSleep}
              />
            </View>
            <View style={[styles.metricsGrid, {marginTop: Spacing.sm}]}>
              <MetricCard
                icon="💜"
                label="REM"
                value={String(remPct)}
                unit="%"
                color={Colors.remSleep}
              />
              <MetricCard
                icon="❤️"
                label="FC moy."
                value={String(sleep.hr_avg)}
                unit="bpm"
                color={Colors.danger}
              />
            </View>
            <View style={[styles.metricsGrid, {marginTop: Spacing.sm}]}>
              <MetricCard
                icon="🛏"
                label="Coucher"
                value={sleep.sleep_start}
                color={Colors.textPrimary}
              />
              <MetricCard
                icon="☀️"
                label="Lever"
                value={sleep.sleep_end}
                color={Colors.textPrimary}
              />
            </View>
            <View style={[styles.metricsGrid, {marginTop: Spacing.sm}]}>
              <MetricCard
                icon="👟"
                label="Pas"
                value={(sleep.steps ?? 0).toLocaleString('fr-FR')}
                color={Colors.success}
              />
              <MetricCard
                icon="😴"
                label="Éveillé"
                value={fmtDuration(sleep.awake_min)}
                color={Colors.textSecondary}
                trendPositive={false}
              />
            </View>
          </>
        )}

        {/* ── Lifestyle CTA ────────────────────────────────────────────── */}
        <View style={styles.lifestyleSection}>
          <TouchableOpacity
            style={[
              styles.lifestyleBtn,
              lifestyle && styles.lifestyleBtnDone,
            ]}
            onPress={() => setFormVisible(true)}>
            <Text style={styles.lifestyleBtnEmoji}>
              {lifestyle ? '✅' : '✏️'}
            </Text>
            <View>
              <Text style={styles.lifestyleBtnTitle}>
                {lifestyle
                  ? 'Log lifestyle enregistré'
                  : 'Remplis le log du soir'}
              </Text>
              <Text style={styles.lifestyleBtnSub}>
                {lifestyle
                  ? 'Appuie pour modifier'
                  : 'Caféine, sport, repas, écrans — < 30s'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={{height: Spacing.xl}} />
      </ScrollView>

      {/* ── Lifestyle form modal ─────────────────────────────────────────── */}
      <LifestyleForm
        visible={formVisible}
        initial={lifestyle}
        todaySteps={sleep?.steps ?? 0}
        onSave={async log => {
          await upsertLifestyleLog(log);
          const updated = await getTodayLifestyleLog();
          setLifestyle(updated);
        }}
        onClose={() => setFormVisible(false)}
      />
    </SafeAreaView>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TrendBadge({
  label,
  delta,
  format,
}: {
  label: string;
  delta: number;
  format: (v: number) => string;
}): React.JSX.Element {
  const positive = delta >= 0;
  const color = positive ? Colors.success : Colors.danger;
  return (
    <View style={[trendStyles.badge, {borderColor: color + '44'}]}>
      <Text style={[trendStyles.delta, {color}]}>
        {format(delta)}
      </Text>
      <Text style={trendStyles.label}>{label} vs semaine passée</Text>
    </View>
  );
}

const trendStyles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
  },
  delta: {
    fontSize: 13,
    fontWeight: '700',
  },
  label: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 1,
  },
});

function formatDate(dateStr?: string): string {
  if (!dateStr) {return '';}
  const d = new Date(dateStr + 'T12:00:00'); // noon avoids tz issues
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.lg,
  },
  greeting: {
    ...Typography.h2,
    color: Colors.textPrimary,
  },
  dateLabel: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  syncBtn: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  syncBtnText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  scoreSection: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  aiCommentBox: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginTop: Spacing.md,
    width: '100%',
  },
  aiComment: {
    color: Colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
  },
  aiLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  aiLoadingText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  trendRow: {
    flexDirection: 'row',
    marginTop: Spacing.sm,
    justifyContent: 'center',
  },
  sectionTitle: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  noData: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
  },
  noDataEmoji: {
    fontSize: 48,
    marginBottom: Spacing.md,
  },
  noDataText: {
    color: Colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  lifestyleSection: {
    marginTop: Spacing.lg,
  },
  lifestyleBtn: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.primary + '55',
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  lifestyleBtnDone: {
    borderColor: Colors.success + '55',
  },
  lifestyleBtnEmoji: {
    fontSize: 28,
  },
  lifestyleBtnTitle: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  lifestyleBtnSub: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
});
