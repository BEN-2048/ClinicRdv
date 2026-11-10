import React from 'react';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { color, radius, space, type } from '../../theme';
import Icon, { IconName } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'md' | 'sm';

const variants: Record<ButtonVariant, { bg: string; fg: string }> = {
  primary: { bg: color.primary, fg: color.onPrimary },
  secondary: { bg: color.primaryStrong, fg: color.primary },
  danger: { bg: color.dangerSoft, fg: color.dangerInk },
  ghost: { bg: 'transparent', fg: color.primary },
};

export default function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading = false,
  disabled = false,
  fullWidth = true,
  style,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const v = variants[variant];
  const inactive = disabled || loading;
  const iconPx = size === 'md' ? 'md' : 'sm';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        s.base,
        size === 'md' ? s.md : s.sm,
        { backgroundColor: v.bg },
        fullWidth ? s.full : s.auto,
        pressed && s.pressed,
        disabled && s.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <View style={s.content}>
          {icon ? <Icon name={icon} size={iconPx} color={v.fg} /> : null}
          <Text
            numberOfLines={1}
            style={[size === 'md' ? s.textMd : s.textSm, { color: v.fg }]}
          >
            {title}
          </Text>
          {iconRight ? <Icon name={iconRight} size={iconPx} color={v.fg} /> : null}
        </View>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  md: { height: 48 },
  sm: { height: 36, borderRadius: radius.sm, paddingHorizontal: space.sm },
  full: { alignSelf: 'stretch' },
  auto: { alignSelf: 'flex-start' },
  content: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 1 },
  textMd: { ...type.h3, fontFamily: type.h2.fontFamily, flexShrink: 1 },
  textSm: { ...type.bodyMedium, flexShrink: 1 },
  pressed: { opacity: 0.88 },
  disabled: { opacity: 0.45 },
});
