import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, radius, space, type } from '../../theme';

export type SegmentedTab<K extends string> = { key: K; label: string; count?: number };

export default function SegmentedTabs<K extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: SegmentedTab<K>[];
  value: K;
  onChange: (key: K) => void;
}) {
  return (
    <View style={s.wrap} accessibilityRole="tablist">
      {tabs.map((t) => {
        const selected = t.key === value;
        return (
          <Pressable
            key={t.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(t.key)}
            style={[s.tab, selected && s.tabSelected]}
          >
            <Text style={[s.label, selected && s.labelSelected]} numberOfLines={1}>
              {t.label}
            </Text>
            {t.count !== undefined ? (
              <View style={[s.count, selected && s.countSelected]}>
                <Text style={[s.countText, selected && s.labelSelected]}>{t.count}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: color.primarySubtle,
    borderRadius: radius.md,
    padding: space.xxs,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xxs,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
  },
  tabSelected: {
    backgroundColor: color.surface,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  label: { ...type.label, color: color.textSecondary },
  labelSelected: { color: color.primary },
  count: {
    backgroundColor: color.primarySoft,
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  countSelected: { backgroundColor: color.primaryStrong },
  countText: { ...type.caption, color: color.textSecondary },
});
