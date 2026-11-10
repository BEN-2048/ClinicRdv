import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, radius, space, type } from '../../theme';

export type SlotItem = { key: string; label: string; sublabel?: string };

export default function SlotGrid({
  items,
  selectedKey,
  onSelect,
}: {
  items: SlotItem[];
  selectedKey?: string | null;
  onSelect: (key: string) => void;
}) {
  return (
    <View style={s.grid}>
      {items.map((item) => {
        const selected = item.key === selectedKey;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onSelect(item.key)}
            style={({ pressed }) => [s.slot, selected && s.selected, pressed && s.pressed]}
          >
            <Text style={[s.label, selected && s.onPrimary]}>{item.label}</Text>
            {item.sublabel ? <Text style={[s.sublabel, selected && s.onPrimary]}>{item.sublabel}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  slot: {
    width: '31.5%',
    minHeight: 48,
    paddingVertical: space.xs,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: { backgroundColor: color.primary, borderColor: color.primary },
  pressed: { opacity: 0.85 },
  label: { ...type.bodyMedium },
  sublabel: { ...type.caption, color: color.textMuted },
  onPrimary: { color: color.onPrimary },
});
