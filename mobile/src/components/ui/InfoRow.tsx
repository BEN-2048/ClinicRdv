import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { color, radius, space, type } from '../../theme';
import Icon, { IconName } from './Icon';

export default function InfoRow({
  icon,
  label,
  value,
  strong = false,
}: {
  icon: IconName;
  label: string;
  value?: string | number | null;
  strong?: boolean;
}) {
  return (
    <View style={s.row}>
      <View style={s.icon}>
        <Icon name={icon} size="sm" color={color.primary} />
      </View>
      <View style={s.texts}>
        <Text style={s.label}>{label}</Text>
        <Text style={strong ? s.valueStrong : s.value}>{value ?? '—'}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  icon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: color.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { flex: 1, minWidth: 0 },
  label: { ...type.caption, color: color.textMuted },
  value: { ...type.body, marginTop: 2 },
  valueStrong: { ...type.bodyMedium, marginTop: 2 },
});
