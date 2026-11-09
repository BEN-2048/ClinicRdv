import React from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { color, radius, shadow } from '../../theme';
import Icon, { IconName } from './Icon';

export type IconButtonVariant = 'soft' | 'plain' | 'primary' | 'surface';

const variants: Record<IconButtonVariant, { bg: string; fg: string }> = {
  soft: { bg: color.primarySoft, fg: color.textSecondary },
  plain: { bg: 'transparent', fg: color.textSecondary },
  primary: { bg: color.primary, fg: color.onPrimary },
  surface: { bg: color.surface, fg: color.textSecondary },
};

export default function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  variant = 'soft',
  size = 40,
  iconColor,
  active = false,
  badge = false,
  disabled = false,
  style,
}: {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  variant?: IconButtonVariant;
  size?: number;
  iconColor?: string;
  active?: boolean;
  badge?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const v = variants[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        s.base,
        { width: size, height: size, backgroundColor: active ? color.primaryStrong : v.bg },
        variant === 'surface' && shadow.soft,
        pressed && s.pressed,
        disabled && s.disabled,
        style,
      ]}
    >
      <Icon name={icon} size={Math.round(size * 0.5)} color={iconColor ?? (active ? color.primary : v.fg)} />
      {badge ? <View style={s.badge} /> : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  base: { borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.45 },
  badge: {
    position: 'absolute',
    top: 8,
    right: 9,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: color.danger,
    borderWidth: 1.5,
    borderColor: color.surface,
  },
});
