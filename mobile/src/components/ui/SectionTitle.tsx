import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, space, type } from '../../theme';

export default function SectionTitle({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={s.row}>
      <Text style={s.title}>{title}</Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8}>
          <Text style={s.action}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.xs,
  },
  title: { ...type.h2, flexShrink: 1 },
  action: { ...type.label, color: color.primary },
});
