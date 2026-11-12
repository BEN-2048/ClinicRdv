import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, radius, space, type } from '../../theme';
import Icon from './Icon';

export default function Checkbox({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={s.row}
      hitSlop={6}
    >
      <View style={[s.box, checked && s.boxChecked]}>
        {checked ? <Icon name="check" size={14} color={color.onPrimary} /> : null}
      </View>
      <Text style={s.label}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  box: {
    width: 20,
    height: 20,
    borderRadius: radius.sm / 2 + 1,
    borderWidth: 1.5,
    borderColor: color.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: { backgroundColor: color.primary, borderColor: color.primary },
  label: { ...type.body, flex: 1 },
});
