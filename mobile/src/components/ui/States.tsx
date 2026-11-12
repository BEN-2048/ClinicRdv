import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { color, radius, space, type } from '../../theme';
import Button from './Button';
import Icon, { IconName } from './Icon';

export function Loader({ label, fullscreen = false }: { label?: string; fullscreen?: boolean }) {
  return (
    <View style={[s.center, fullscreen && s.fullscreen]}>
      <ActivityIndicator size="large" color={color.primary} />
      {label ? <Text style={s.muted}>{label}</Text> : null}
    </View>
  );
}

export function EmptyState({
  icon = 'inbox',
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon?: IconName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={s.center}>
      <View style={s.bubble}>
        <Icon name={icon} size={28} color={color.primary} />
      </View>
      <Text style={s.title}>{title}</Text>
      {message ? <Text style={s.message}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Button title={actionLabel} onPress={onAction} fullWidth={false} style={s.action} />
      ) : null}
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={s.center}>
      <View style={[s.bubble, { backgroundColor: color.dangerSoft }]}>
        <Icon name="circle-exclamation" size={28} color={color.dangerInk} />
      </View>
      <Text style={s.message}>{message}</Text>
      {onRetry ? (
        <Button
          title="Réessayer"
          icon="arrows-rotate"
          variant="secondary"
          onPress={onRetry}
          fullWidth={false}
          style={s.action}
        />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.xl,
    paddingHorizontal: space.lg,
    gap: space.sm,
  },
  fullscreen: { flex: 1, backgroundColor: color.page },
  bubble: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: color.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...type.h3, textAlign: 'center' },
  message: { ...type.body, color: color.textSecondary, textAlign: 'center' },
  muted: { ...type.body, color: color.textMuted },
  action: { alignSelf: 'center', marginTop: space.xs },
});
