import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card, ErrorState, Loader, StatusBadge as UIStatusBadge } from '../../components/ui';
import { CLINIC_TIME_ZONE } from '../../components/PatientFigmaUI';
import { color, space, type } from '../../theme';

const TZ = CLINIC_TIME_ZONE;

export const errorText = (err: any, fallback: string): string =>
  err?.response?.data?.error || err?.message || fallback;

export const clinicToday = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date()
  );

export const clinicDate = (iso: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(iso)
  );

export const shiftDate = (date: string, days: number): string => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const formatLongDate = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('fr-FR', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

export const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone: TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));

export const formatTime = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    new Date(iso)
  );

export const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  confirmed: 'Confirmé',
  cancelled: 'Annulé',
  done: 'Terminé',
};

export const WEEKDAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

export function StatusBadge({ status }: { status: string }) {
  return <UIStatusBadge status={status} label={STATUS_LABELS[status] ?? status} />;
}

export function Loading({ label }: { label: string }) {
  return <Loader label={label} />;
}

export function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card>
      <ErrorState message={message} onRetry={onRetry} />
    </Card>
  );
}

export function FieldGroupLabel({ children }: { children: string }) {
  return <Text style={shared.groupLabel}>{children}</Text>;
}

export function Wrap({ children }: { children: React.ReactNode }) {
  return <View style={shared.wrap}>{children}</View>;
}

export const shared = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { flexBasis: '47%', flexGrow: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.xs },
  actions: { flexDirection: 'row', gap: space.xs },
  action: { flex: 1 },
  card: { gap: space.sm },
  flex: { flex: 1, minWidth: 0 },
  title: { ...type.h3, fontFamily: type.h2.fontFamily, flexShrink: 1 },
  muted: { ...type.caption, color: color.textMuted },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  groupLabel: { ...type.label, marginBottom: -space.xs },
});
