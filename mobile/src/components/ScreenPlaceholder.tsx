import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

export default function ScreenPlaceholder({ title }: { title: string }) {
  return (
    <View style={s.c}>
      <Text style={s.t}>{title}</Text>
      <Text style={s.m}>TODO : implémenter cet écran (voir maquette Figma)</Text>
    </View>
  );
}
const s = StyleSheet.create({
  c: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 24 },
  t: { fontSize: 22, fontWeight: '700', color: colors.text },
  m: { marginTop: 8, color: colors.muted, textAlign: 'center' },
});
