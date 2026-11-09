import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { color, radius, space, type } from '../../theme';
import Icon, { IconName } from './Icon';

export type NoticeTone = 'info' | 'success' | 'warning' | 'danger';

const tones: Record<NoticeTone, { bg: string; fg: string; icon: IconName }> = {
  info: { bg: color.primarySubtle, fg: color.primary, icon: 'information-circle' },
  success: { bg: color.successSoft + '55', fg: color.successInk, icon: 'checkmark-circle' },
  warning: { bg: color.warningSoft + '80', fg: color.warningInk, icon: 'warning' },
  danger: { bg: color.dangerSoft, fg: color.dangerInk, icon: 'alert-circle' },
};

export default function Notice({
  tone = 'info',
  title,
  message,
  icon,
  children,
  style,
}: {
  tone?: NoticeTone;
  title?: string;
  message?: string;
  icon?: IconName;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = tones[tone];

  return (
    <View style={[s.box, { backgroundColor: t.bg }, style]}>
      <Icon name={icon ?? t.icon} size="md" color={t.fg} />
      <View style={s.texts}>
        {title ? <Text style={[s.title, { color: t.fg }]}>{title}</Text> : null}
        {message ? <Text style={s.message}>{message}</Text> : null}
        {children}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.md,
  },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  title: { ...type.bodyMedium },
  message: { ...type.body, color: color.textSecondary },
});
