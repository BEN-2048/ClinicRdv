import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { radius, space, statusTokens, StatusKey, type } from '../../theme';

export default function StatusBadge({ status, label }: { status: string; label?: string }) {
  const token = statusTokens[status as StatusKey] ?? statusTokens.done;

  return (
    <View style={[s.pill, { backgroundColor: token.bg }]}>
      <View style={[s.dot, { backgroundColor: token.dot }]} />
      <Text style={[s.text, { color: token.ink }]} numberOfLines={1}>
        {label ?? token.label}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderRadius: radius.full,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { ...type.label },
});
