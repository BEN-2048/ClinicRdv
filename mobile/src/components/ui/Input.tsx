import React, { useState } from 'react';
import { StyleProp, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { color, fonts, radius, space, type } from '../../theme';
import Icon, { IconName } from './Icon';

export default function Input({
  label,
  error,
  hint,
  icon,
  right,
  containerStyle,
  multiline,
  editable = true,
  onFocus,
  onBlur,
  ...props
}: TextInputProps & {
  label?: string;
  error?: string | null;
  hint?: string;
  icon?: IconName;
  right?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
}) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? color.danger : focused ? color.primary : color.border;

  return (
    <View style={[s.wrap, containerStyle]}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <View style={[s.field, multiline && s.multiline, !editable && s.readOnly, { borderColor }]}>
        {icon ? <Icon name={icon} size="md" color={focused ? color.primary : color.textMuted} /> : null}
        <TextInput
          placeholderTextColor={color.textMuted}
          multiline={multiline}
          editable={editable}
          textAlignVertical={multiline ? 'top' : 'center'}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[s.input, multiline && s.inputMultiline]}
          {...props}
        />
        {right}
      </View>
      {error ? (
        <Text style={s.error}>{error}</Text>
      ) : hint ? (
        <Text style={s.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 6 },
  label: { ...type.label },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: 48,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    backgroundColor: color.surface,
  },
  multiline: { alignItems: 'flex-start', paddingVertical: space.sm, minHeight: 96 },
  readOnly: { backgroundColor: color.primarySubtle },
  input: { flex: 1, ...type.body, fontFamily: fonts.regular, paddingVertical: 0 },
  inputMultiline: { minHeight: 72 },
  error: { ...type.caption, color: color.danger },
  hint: { ...type.caption, color: color.textMuted },
});
