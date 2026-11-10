import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DoctorsApi } from '../../api/services';
import { Button, Chip, IconButton, Input, Notice, SlotGrid } from '../../components/ui';
import { color, fonts, radius, space, type } from '../../theme';

type Busy = { startsAt: string; endsAt: string };

const DURATIONS = [
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 h' },
  { minutes: 120, label: '2 h' },
  { minutes: 240, label: 'Demi-journée' },
];

const STARTS = Array.from({ length: 20 }, (_, i) => {
  const minutes = 8 * 60 + i * 30;
  const label = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  return { key: String(minutes), label };
});

const atMinutes = (date: Date, minutes: number) => {
  const d = new Date(date);
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d;
};

export default function BlockSlotSheet({
  visible,
  date,
  initialStart,
  initialDuration,
  busy,
  onClose,
  onCreated,
}: {
  visible: boolean;
  date: Date;
  initialStart?: number | null;
  initialDuration?: number | null;
  busy: Busy[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [start, setStart] = useState<number | null>(null);
  const [duration, setDuration] = useState(30);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setStart(initialStart ?? null);
    setDuration(initialDuration ?? 30);
    setReason('');
    setError('');
  }, [visible, initialStart, initialDuration]);

  const range = useMemo(() => {
    if (start === null) return null;
    return { from: atMinutes(date, start), to: atMinutes(date, start + duration) };
  }, [date, start, duration]);

  const overlaps = useMemo(() => {
    if (!range) return 0;
    return busy.filter((b) => new Date(b.startsAt) < range.to && new Date(b.endsAt) > range.from).length;
  }, [busy, range]);

  const inPast = range ? range.from.getTime() < Date.now() : false;

  const submit = async () => {
    if (!range) return;
    try {
      setSaving(true);
      setError('');
      await DoctorsApi.addBlockedSlot({
        startsAt: range.from.toISOString(),
        endsAt: range.to.toISOString(),
        reason: reason.trim() || undefined,
      });
      onCreated();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Impossible de bloquer ce créneau.');
    } finally {
      setSaving(false);
    }
  };

  const endLabel = range
    ? range.to.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Fermer" />
        <View style={[s.sheet, { paddingBottom: insets.bottom + space.md }]}>
          <View style={s.handle} />
          <View style={s.header}>
            <View style={s.headerText}>
              <Text style={s.title}>Nouveau créneau bloqué</Text>
              <Text style={s.subtitle}>
                {date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </Text>
            </View>
            <IconButton icon="close" accessibilityLabel="Fermer" onPress={onClose} />
          </View>

          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
            <Text style={s.label}>Heure de début</Text>
            <SlotGrid
              items={STARTS}
              selectedKey={start === null ? null : String(start)}
              onSelect={(key) => setStart(Number(key))}
            />

            <Text style={s.label}>Durée</Text>
            <View style={s.chips}>
              {DURATIONS.map((d) => (
                <Chip
                  key={d.minutes}
                  label={d.label}
                  selected={duration === d.minutes}
                  onPress={() => setDuration(d.minutes)}
                />
              ))}
            </View>

            <Input
              label="Motif (facultatif)"
              icon="create-outline"
              placeholder="Réunion, formation, pause..."
              value={reason}
              onChangeText={setReason}
              maxLength={255}
            />

            {range ? (
              <Text style={s.summary}>
                Créneau bloqué de {STARTS.find((x) => x.key === String(start))?.label} à {endLabel}
              </Text>
            ) : null}

            {overlaps > 0 ? (
              <Notice
                tone="warning"
                title="Rendez-vous sur ce créneau"
                message={`${overlaps} rendez-vous existe(nt) déjà sur cette plage. Il(s) ne sera(ont) pas annulé(s).`}
              />
            ) : null}
            {inPast ? <Notice tone="warning" message="Ce créneau est déjà passé." /> : null}
            {error ? <Notice tone="danger" message={error} /> : null}

            <Button
              title="Bloquer le créneau"
              icon="lock-closed-outline"
              loading={saving}
              disabled={!range || saving}
              onPress={submit}
            />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  sheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '88%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.border,
    marginTop: space.xs,
  },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingTop: space.sm },
  headerText: { flex: 1 },
  title: { ...type.h3, fontFamily: fonts.semibold },
  subtitle: { ...type.caption, color: color.textMuted, textTransform: 'capitalize' },
  body: { padding: space.md, gap: space.sm },
  label: { ...type.label, color: color.textSecondary, marginTop: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  summary: { ...type.bodyMedium, color: color.primary },
});
