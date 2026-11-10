import React from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { color, radius, shadow, space } from '../../theme';

export default function Card({
  children,
  onPress,
  padded = true,
  elevated = true,
  style,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  padded?: boolean;
  elevated?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const base = [s.card, padded && s.padded, elevated && shadow.soft, style];

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [...base, pressed && s.pressed]}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={base}>{children}</View>;
}

const s = StyleSheet.create({
  card: { backgroundColor: color.surface, borderRadius: radius.lg },
  padded: { padding: space.md },
  pressed: { opacity: 0.92 },
});
