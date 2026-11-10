import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon, StatusBadge } from '../../components/ui';
import { color, radius, shadow, space, type } from '../../theme';

export type DoctorAppointment = {
  id: number;
  starts_at: string;
  ends_at: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'done';
  reason: string | null;
  patient_id: number;
  patient_first_name: string;
  patient_last_name: string;
};

export type AppointmentKind = 'urgent' | 'standard';

export const isUrgent = (reason: string | null) => /urgence|urgent/i.test(reason || '');


export const appointmentKind = (reason: string | null): AppointmentKind =>
  isUrgent(reason) ? 'urgent' : 'standard';

export const kindTokens: Record<AppointmentKind, { label: string; fg: string; bg: string }> = {
  urgent: { label: 'URGENCE', fg: color.dangerInk, bg: color.dangerSoft },
  standard: { label: 'CABINET', fg: color.primary, bg: color.primarySoft },
};

export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

export const patientName = (a: Pick<DoctorAppointment, 'patient_first_name' | 'patient_last_name'>) =>
  `${a.patient_first_name ?? ''} ${a.patient_last_name ?? ''}`.trim();

export function KindTag({ kind }: { kind: AppointmentKind }) {
  if (kind === 'standard') return null;
  const t = kindTokens[kind];
  return (
    <View style={[s.tag, { backgroundColor: t.bg }]}>
      <Text style={[s.tagText, { color: t.fg }]}>{t.label}</Text>
    </View>
  );
}

export function AppointmentRow({
  appointment,
  topLabel,
  bottomLabel,
  onPress,
}: {
  appointment: DoctorAppointment;
  topLabel: string;
  bottomLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ouvrir la fiche de ${patientName(appointment)}`}
      onPress={onPress}
      style={({ pressed }) => [s.row, pressed && s.pressed]}
    >
      <View style={s.time}>
        <Text style={s.timeTop}>{topLabel}</Text>
        <Text style={s.timeBottom}>{bottomLabel}</Text>
      </View>
      <View style={s.info}>
        <Text style={type.bodyMedium} numberOfLines={1}>
          {patientName(appointment)}
        </Text>
        <Text style={s.reason} numberOfLines={1}>
          {appointment.reason || 'Consultation médicale'}
        </Text>
        <View style={s.tags}>
          <StatusBadge status={appointment.status} />
          <KindTag kind={appointmentKind(appointment.reason)} />
        </View>
      </View>
      <Icon name="chevron-forward" size="md" color={color.textMuted} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    ...shadow.soft,
  },
  pressed: { opacity: 0.85 },
  time: {
    width: 64,
    paddingRight: space.sm,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: color.border,
  },
  timeTop: { ...type.h3, fontFamily: type.h2.fontFamily, color: color.text },
  timeBottom: { ...type.caption, color: color.textMuted, marginTop: 2 },
  info: { flex: 1, minWidth: 0, gap: 2 },
  reason: { ...type.caption, color: color.textMuted },
  tags: { flexDirection: 'row', alignItems: 'center', gap: space.xxs, marginTop: space.xxs },
  tag: { borderRadius: radius.full, paddingHorizontal: space.xs, paddingVertical: 2 },
  tagText: { ...type.caption, letterSpacing: 0.6 },
});
