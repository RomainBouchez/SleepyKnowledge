import React, {useState} from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Switch,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Slider from '@react-native-community/slider';

import {Colors, Spacing, SharedStyles, Typography} from '../theme';
import {LifestyleLog, MealHeaviness} from '../types';
import {todayStr} from '../services/database';

interface Props {
  visible: boolean;
  initial: LifestyleLog | null;
  todaySteps: number;
  onSave: (log: Omit<LifestyleLog, 'id'>) => Promise<void>;
  onClose: () => void;
}

// ── Default state ─────────────────────────────────────────────────────────────

function defaultForm(steps: number): Omit<LifestyleLog, 'id'> {
  return {
    date: todayStr(),
    caffeine_mg: 200,
    caffeine_last_hour: '14:00',
    sport_type: 'none',
    sport_intensity: 5,
    sport_hour: '18:00',
    screen_last_hour: '22:00',
    meal_hour: '20:00',
    meal_heaviness: 'normal',
    weed: false,
    weed_hour: '',
    notes: '',
    // steps come from sleep record, stored separately
  };
}

// ── Small row component ───────────────────────────────────────────────────────

function RowLabel({label}: {label: string}): React.JSX.Element {
  return <Text style={styles.rowLabel}>{label}</Text>;
}

function TimeInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}): React.JSX.Element {
  return (
    <TextInput
      style={styles.timeInput}
      value={value}
      onChangeText={onChange}
      placeholder="HH:MM"
      placeholderTextColor={Colors.textMuted}
      keyboardType="numbers-and-punctuation"
      maxLength={5}
    />
  );
}

// ── Pill selector ─────────────────────────────────────────────────────────────

function PillSelector<T extends string>({
  options,
  value,
  onChange,
  labelMap,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
  labelMap?: Record<string, string>;
}): React.JSX.Element {
  return (
    <View style={styles.pillRow}>
      {options.map(opt => (
        <TouchableOpacity
          key={opt}
          style={[styles.pill, value === opt && styles.pillActive]}
          onPress={() => onChange(opt)}>
          <Text
            style={[
              styles.pillText,
              value === opt && styles.pillTextActive,
            ]}>
            {labelMap?.[opt] ?? opt}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Sport type selector ───────────────────────────────────────────────────────

const SPORT_TYPES = ['none', 'running', 'weights', 'cycling', 'yoga', 'autre'];
const SPORT_LABELS: Record<string, string> = {
  none: 'Aucun',
  running: '🏃 Running',
  weights: '🏋️ Muscu',
  cycling: '🚴 Vélo',
  yoga: '🧘 Yoga',
  autre: '⚡ Autre',
};

// ── Main form modal ───────────────────────────────────────────────────────────

export default function LifestyleForm({
  visible,
  initial,
  todaySteps,
  onSave,
  onClose,
}: Props): React.JSX.Element {
  const [form, setForm] = useState<Omit<LifestyleLog, 'id'>>(
    () => initial ?? defaultForm(todaySteps),
  );
  const [saving, setSaving] = useState(false);

  // Reset form when re-opened
  React.useEffect(() => {
    if (visible) {
      setForm(initial ?? defaultForm(todaySteps));
    }
  }, [visible, initial, todaySteps]);

  function set<K extends keyof typeof form>(key: K, val: (typeof form)[K]) {
    setForm(prev => ({...prev, [key]: val}));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modal}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>Annuler</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Soirée du {form.date}</Text>
          <TouchableOpacity
            onPress={handleSave}
            style={styles.saveBtn}
            disabled={saving}>
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Enregistrer</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">

          {/* ── Caféine ─────────────────────────────────────────────────── */}
          <View style={SharedStyles.card}>
            <Text style={SharedStyles.cardTitle}>☕  Caféine</Text>
            <RowLabel label={`Quantité : ${form.caffeine_mg} mg`} />
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={600}
              step={25}
              value={form.caffeine_mg}
              onValueChange={v => set('caffeine_mg', v)}
              minimumTrackTintColor={Colors.primary}
              maximumTrackTintColor={Colors.surfaceAlt}
              thumbTintColor={Colors.primary}
            />
            <View style={styles.fieldRow}>
              <RowLabel label="Dernière prise" />
              <TimeInput
                value={form.caffeine_last_hour}
                onChange={v => set('caffeine_last_hour', v)}
              />
            </View>
          </View>

          {/* ── Sport ───────────────────────────────────────────────────── */}
          <View style={[SharedStyles.card, {marginTop: Spacing.sm}]}>
            <Text style={SharedStyles.cardTitle}>🏋️  Sport</Text>
            <PillSelector
              options={SPORT_TYPES}
              value={form.sport_type}
              onChange={v => set('sport_type', v)}
              labelMap={SPORT_LABELS}
            />
            {form.sport_type !== 'none' && (
              <>
                <RowLabel
                  label={`Intensité : ${form.sport_intensity}/10`}
                />
                <Slider
                  style={styles.slider}
                  minimumValue={1}
                  maximumValue={10}
                  step={1}
                  value={form.sport_intensity}
                  onValueChange={v => set('sport_intensity', v)}
                  minimumTrackTintColor={Colors.secondary}
                  maximumTrackTintColor={Colors.surfaceAlt}
                  thumbTintColor={Colors.secondary}
                />
                <View style={styles.fieldRow}>
                  <RowLabel label="Heure" />
                  <TimeInput
                    value={form.sport_hour}
                    onChange={v => set('sport_hour', v)}
                  />
                </View>
              </>
            )}
          </View>

          {/* ── Écrans ──────────────────────────────────────────────────── */}
          <View style={[SharedStyles.card, {marginTop: Spacing.sm}]}>
            <Text style={SharedStyles.cardTitle}>📱  Écrans</Text>
            <View style={styles.fieldRow}>
              <RowLabel label="Dernier écran" />
              <TimeInput
                value={form.screen_last_hour}
                onChange={v => set('screen_last_hour', v)}
              />
            </View>
          </View>

          {/* ── Repas ───────────────────────────────────────────────────── */}
          <View style={[SharedStyles.card, {marginTop: Spacing.sm}]}>
            <Text style={SharedStyles.cardTitle}>🍽️  Repas du soir</Text>
            <PillSelector<MealHeaviness>
              options={['léger', 'normal', 'lourd']}
              value={form.meal_heaviness}
              onChange={v => set('meal_heaviness', v)}
            />
            <View style={[styles.fieldRow, {marginTop: Spacing.sm}]}>
              <RowLabel label="Heure du repas" />
              <TimeInput
                value={form.meal_hour}
                onChange={v => set('meal_hour', v)}
              />
            </View>
          </View>

          {/* ── Weed ────────────────────────────────────────────────────── */}
          <View style={[SharedStyles.card, {marginTop: Spacing.sm}]}>
            <Text style={SharedStyles.cardTitle}>🌿  Cannabis</Text>
            <View style={styles.fieldRow}>
              <RowLabel label="Ce soir" />
              <Switch
                value={form.weed}
                onValueChange={v => set('weed', v)}
                trackColor={{false: Colors.surfaceAlt, true: Colors.secondary}}
                thumbColor="#fff"
              />
            </View>
            {form.weed && (
              <View style={[styles.fieldRow, {marginTop: Spacing.sm}]}>
                <RowLabel label="Heure" />
                <TimeInput
                  value={form.weed_hour}
                  onChange={v => set('weed_hour', v)}
                />
              </View>
            )}
          </View>

          {/* ── Pas du jour ─────────────────────────────────────────────── */}
          <View style={[SharedStyles.card, {marginTop: Spacing.sm}]}>
            <Text style={SharedStyles.cardTitle}>👟  Pas du jour</Text>
            <Text style={styles.stepsValue}>
              {todaySteps.toLocaleString('fr-FR')} pas
            </Text>
            <Text style={styles.stepsNote}>
              Importé automatiquement depuis la montre
            </Text>
          </View>

          {/* ── Notes libres ────────────────────────────────────────────── */}
          <View style={[SharedStyles.card, {marginTop: Spacing.sm}]}>
            <Text style={SharedStyles.cardTitle}>📝  Notes</Text>
            <TextInput
              style={styles.notesInput}
              value={form.notes}
              onChangeText={v => set('notes', v)}
              placeholder="Stressé, voyage, soirée tardive…"
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={3}
            />
          </View>

          <View style={{height: 40}} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  closeBtn: {
    paddingVertical: 6,
  },
  closeBtnText: {
    color: Colors.textSecondary,
    fontSize: 15,
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  scroll: {flex: 1},
  scrollContent: {
    padding: Spacing.md,
  },
  slider: {
    width: '100%',
    height: 36,
    marginVertical: 4,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  rowLabel: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  timeInput: {
    backgroundColor: Colors.surfaceAlt,
    color: Colors.textPrimary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 15,
    fontWeight: '500',
    minWidth: 80,
    textAlign: 'center',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pillActive: {
    backgroundColor: Colors.primary + '33',
    borderColor: Colors.primary,
  },
  pillText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  pillTextActive: {
    color: Colors.primary,
  },
  notesInput: {
    color: Colors.textPrimary,
    fontSize: 14,
    marginTop: 4,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  stepsValue: {
    color: Colors.textPrimary,
    fontSize: 22,
    fontWeight: '700',
    marginTop: 4,
  },
  stepsNote: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
});
