import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { color, radius, shadow, space, type } from '../../theme';
import Icon, { IconName } from './Icon';

export type StatTone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

const tones: Record<StatTone, { fg: string; bg: string }> = {
  primary: { fg: color.primary, bg: color.primarySoft },
  success: { fg: color.success, bg: color.successSoft + '80' },
  warning: { fg: color.warning, bg: color.warningSoft },
  danger: { fg: color.dangerInk, bg: color.dangerSoft },
  neutral: { fg: color.textSecondary, bg: color.primarySubtle },
};

export default function StatCard({
  label,
  value,
  icon,
  tone = 'primary',
  style,
}: {
  label: string;
  value: string | number;
  icon?: IconName;
  tone?: StatTone;
  style?: StyleProp<ViewStyle>;
}) {
  const t = tones[tone];

  return (
    <View style={[s.card, style]}>
      {icon ? (
        <View style={[s.icon, { backgroundColor: t.bg }]}>
          <Icon name={icon} size="md" color={t.fg} />
        </View>
      ) : null}
      <Text style={[s.value, { color: t.fg }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={s.label} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.xxs,
    ...shadow.soft,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xxs,
  },
  value: { ...type.h1 },
  label: { ...type.caption, color: color.textMuted },
});
