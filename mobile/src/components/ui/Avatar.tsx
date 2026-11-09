import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { color, fonts, shadow } from '../../theme';
import { initialsOf } from '../PatientFigmaUI';

export default function Avatar({
  name,
  initials,
  size = 48,
  tint = color.primarySoft,
  ink = color.primary,
  dotColor,
}: {
  name?: string | null;
  initials?: string;
  size?: number;
  tint?: string;
  ink?: string;
  dotColor?: string;
}) {
  const dot = Math.max(10, Math.round(size * 0.25));

  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          s.circle,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: tint },
        ]}
      >
        <Text style={[s.text, { color: ink, fontSize: Math.round(size * 0.32) }]}>
          {initials ?? initialsOf(name)}
        </Text>
      </View>
      {dotColor ? (
        <View
          style={[
            s.dot,
            { width: dot, height: dot, borderRadius: dot / 2, backgroundColor: dotColor },
          ]}
        />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', ...shadow.soft },
  text: { fontFamily: fonts.semibold },
  dot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    borderWidth: 2,
    borderColor: color.surface,
  },
});
