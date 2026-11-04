import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Button, ui } from '../../components/ClinicUI';
import { colors, statusColors } from '../../theme/colors';

const TZ = 'Africa/Lubumbashi';

export const errorText = (err: any, fallback: string): string =>
  err?.response?.data?.error || err?.message || fallback;

export const clinicToday = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date());

export const shiftDate = (date: string, days: number): string => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const formatLongDate = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('fr-FR', {
    timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

export const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(iso));

export const formatTime = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(new Date(iso));

export const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente', confirmed: 'Confirmé', cancelled: 'Annulé', done: 'Terminé',
};

export const WEEKDAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

export function StatusBadge({ status }: { status: string }) {
  const color = statusColors[status as keyof typeof statusColors] ?? colors.muted;
  return (
    <Text style={[s.badge, { color, backgroundColor: `${color}1A` }]}>
      {STATUS_LABELS[status] ?? status}
    </Text>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <View style={s.center}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={ui.muted}>{label}</Text>
    </View>
  );
}

export function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={ui.card}>
      <Text style={s.error}>{message}</Text>
      {onRetry ? <Button title="Réessayer" onPress={onRetry} /> : null}
    </View>
  );
}

export function StatTile({ label, value, color = colors.primary }: { label: string; value: string | number; color?: string }) {
  return (
    <View style={[ui.card, s.tile]}>
      <Text style={[s.tileValue, { color }]}>{value}</Text>
      <Text style={ui.muted}>{label}</Text>
    </View>
  );
}

export const shared = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  action: { flex: 1 },
  title: { color: colors.text, fontSize: 15, fontWeight: '800', flexShrink: 1 },
  detail: { color: colors.text, fontSize: 13, marginTop: 6 },
  error: { color: colors.error, textAlign: 'center', marginVertical: 10 },
  empty: { color: colors.muted, textAlign: 'center', padding: 12 },
});

const s = StyleSheet.create({
  badge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9, fontSize: 11, fontWeight: '700', overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 35, gap: 12 },
  error: { color: colors.error, textAlign: 'center', marginBottom: 15 },
  tile: { width: '48%', alignItems: 'flex-start' },
  tileValue: { fontSize: 26, fontWeight: '800', marginBottom: 4 },
});
