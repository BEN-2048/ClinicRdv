import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';
import { color, radius, space, type } from '../../theme';
import Icon, { IconName } from './Icon';

export default function Chip({
  label,
  selected = false,
  onPress,
  icon,
  style,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const fg = selected ? color.onPrimary : color.textSecondary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [s.chip, selected && s.selected, pressed && s.pressed, style]}
    >
      {icon ? <Icon name={icon} size="sm" color={fg} /> : null}
      <Text style={[selected ? s.textSelected : s.text, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xxs,
    backgroundColor: color.primarySoft,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  selected: { backgroundColor: color.primary },
  pressed: { opacity: 0.85 },
  text: { ...type.body },
  textSelected: { ...type.bodyMedium },
});
