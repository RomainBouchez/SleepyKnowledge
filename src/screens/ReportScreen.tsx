import React, {useCallback, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect} from '@react-navigation/native';

import {generateWeeklyReport} from '../services/claude';
import {
  getSleepRecords,
  getLifestyleLogs,
  getLatestWeeklyReports,
  getAiInsight,
  saveAiInsight,
} from '../services/database';
import {currentWeekStart, isMonday} from '../services/sync';
import {Colors, SharedStyles, Spacing} from '../theme';
import {AiInsight} from '../types';

// ── Markdown-lite renderer ────────────────────────────────────────────────────
// Handles **bold**, bullet lists and headings from Claude's response.

function ReportText({content}: {content: string}): React.JSX.Element {
  const lines = content.split('\n');
  return (
    <View>
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) {return <View key={i} style={{height: 6}} />;}

        // Heading: starts with ## or **Title**
        if (trimmed.startsWith('## ') || trimmed.startsWith('**') && trimmed.endsWith('**')) {
          const text = trimmed.replace(/^##\s*/, '').replace(/^\*\*|\*\*$/g, '');
          return (
            <Text key={i} style={styles.reportHeading}>
              {text}
            </Text>
          );
        }

        // Bullet
        if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
          const text = trimmed.slice(2);
          return (
            <View key={i} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.bulletText}>{renderBold(text)}</Text>
            </View>
          );
        }

        // Numbered list
        const numMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
        if (numMatch) {
          return (
            <View key={i} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>{numMatch[1]}.</Text>
              <Text style={styles.bulletText}>{renderBold(numMatch[2])}</Text>
            </View>
          );
        }

        // Normal paragraph
        return (
          <Text key={i} style={styles.reportBody}>
            {renderBold(trimmed)}
          </Text>
        );
      })}
    </View>
  );
}

// Inline **bold** renderer
function renderBold(text: string): (string | React.ReactElement)[] {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <Text key={i} style={styles.bold}>
        {p}
      </Text>
    ) : (
      p
    ),
  );
}

// ── Report card ───────────────────────────────────────────────────────────────

function ReportCard({
  insight,
  isLatest,
}: {
  insight: AiInsight;
  isLatest: boolean;
}): React.JSX.Element {
  const weekLabel = formatWeekLabel(insight.date);
  return (
    <View style={[SharedStyles.card, isLatest && styles.latestCard]}>
      <View style={styles.reportHeader}>
        <Text style={styles.reportWeek}>{weekLabel}</Text>
        {isLatest && (
          <View style={styles.newBadge}>
            <Text style={styles.newBadgeText}>Dernière</Text>
          </View>
        )}
      </View>
      <Text style={styles.reportMeta}>
        Généré le{' '}
        {new Date(insight.generated_at).toLocaleDateString('fr-FR', {
          day: 'numeric',
          month: 'long',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </Text>
      <View style={styles.divider} />
      <ReportText content={insight.content} />
    </View>
  );
}

function formatWeekLabel(weekStart: string): string {
  const start = new Date(weekStart + 'T12:00:00');
  const end   = new Date(weekStart + 'T12:00:00');
  end.setDate(start.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = {day: 'numeric', month: 'long'};
  return `Semaine du ${start.toLocaleDateString('fr-FR', opts)} au ${end.toLocaleDateString('fr-FR', opts)}`;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ReportScreen(): React.JSX.Element {
  const [reports, setReports] = useState<AiInsight[]>([]);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadReports();
    }, []),
  );

  async function loadReports() {
    setLoading(true);
    try {
      const saved = await getLatestWeeklyReports(4);
      setReports(saved);

      // Auto-generate on Mondays if no report for this week yet
      if (isMonday()) {
        const weekStart = currentWeekStart();
        const existing = await getAiInsight(weekStart, 'weekly_report');
        if (!existing) {
          await handleGenerate(weekStart, false);
          return;
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate(weekStart?: string, showAlert = true) {
    setGenerating(true);
    const start = weekStart ?? currentWeekStart();
    try {
      const [sleepRecords, lifestyleLogs] = await Promise.all([
        getSleepRecords(7),
        getLifestyleLogs(7),
      ]);

      if (sleepRecords.length < 3) {
        Alert.alert(
          'Pas assez de données',
          'Il faut au moins 3 nuits de données pour générer un rapport.',
        );
        return;
      }

      const content = await generateWeeklyReport(sleepRecords, lifestyleLogs);
      const insight: Omit<AiInsight, 'id'> = {
        date: start,
        type: 'weekly_report',
        content,
        generated_at: new Date().toISOString(),
      };
      await saveAiInsight(insight);

      const saved = await getLatestWeeklyReports(4);
      setReports(saved);

      if (showAlert) {
        Alert.alert('Rapport généré', 'Ton rapport hebdomadaire est prêt.');
      }
    } catch (err) {
      Alert.alert(
        'Erreur',
        err instanceof Error ? err.message : 'Impossible de générer le rapport.',
      );
    } finally {
      setGenerating(false);
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={SharedStyles.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.screenTitle}>Rapport hebdo 📋</Text>
            <Text style={styles.headerSub}>
              {isMonday()
                ? 'Généré automatiquement chaque lundi'
                : 'Disponible le lundi matin'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.genBtn, generating && styles.genBtnDisabled]}
            onPress={() => handleGenerate()}
            disabled={generating}>
            {generating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.genBtnText}>Générer</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Body ───────────────────────────────────────────────────── */}
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : reports.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>📋</Text>
            <Text style={styles.emptyTitle}>Aucun rapport pour l'instant</Text>
            <Text style={styles.emptyBody}>
              Les rapports sont générés automatiquement chaque lundi.{'\n'}
              Tu peux aussi en créer un manuellement via le bouton "Générer".
            </Text>
          </View>
        ) : (
          <View style={styles.reportList}>
            {reports.map((r, i) => (
              <ReportCard key={r.id ?? i} insight={r} isLatest={i === 0} />
            ))}
          </View>
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
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.lg,
  },
  screenTitle: {
    color: Colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
  },
  headerSub: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  genBtn: {
    backgroundColor: Colors.secondary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 90,
    alignItems: 'center',
  },
  genBtnDisabled: {
    opacity: 0.5,
  },
  genBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.lg,
  },
  emptyEmoji: {fontSize: 48, marginBottom: Spacing.md},
  emptyTitle: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  emptyBody: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
  },
  reportList: {
    gap: Spacing.md,
  },
  latestCard: {
    borderColor: Colors.secondary + '55',
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reportWeek: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  newBadge: {
    backgroundColor: Colors.secondary + '33',
    borderWidth: 1,
    borderColor: Colors.secondary,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  newBadgeText: {
    color: Colors.secondary,
    fontSize: 11,
    fontWeight: '600',
  },
  reportMeta: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 4,
    marginBottom: 2,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.md,
  },
  reportHeading: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 4,
  },
  reportBody: {
    color: Colors.textPrimary,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 4,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
    paddingLeft: 4,
  },
  bulletDot: {
    color: Colors.secondary,
    fontSize: 14,
    lineHeight: 21,
    minWidth: 16,
  },
  bulletText: {
    color: Colors.textPrimary,
    fontSize: 14,
    lineHeight: 21,
    flex: 1,
  },
  bold: {
    fontWeight: '700',
    color: Colors.textPrimary,
  },
});
