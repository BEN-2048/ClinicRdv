import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fonts, palette, shadow } from '../theme/figma';
import { doctorName } from '../utils/doctorName';

export const CLINIC_TIME_ZONE = 'Africa/Lubumbashi';

export const doctorDisplayName = (name?: string | null) => doctorName(name);

export const initialsOf = (name?: string | null) => {
  const parts = (name || '')
    .replace(/^dr\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean);
  return parts.slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join('') || '?';
};

export const ordinalSuffix = (n: number, long = false) => {
  if (n === 1) return 'er';
  return long ? 'ème' : 'e';
};

export function InitialsAvatar({
  name,
  size = 56,
  dotColor,
  dotRing = false,
}: {
  name?: string | null;
  size?: number;
  dotColor?: string;
  dotRing?: boolean;
}) {
  return (
    <View style={{ width: size, height: size }}>
      <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
        <Text style={[styles.initials, { fontSize: size * 0.32 }]}>{initialsOf(name)}</Text>
      </View>
      {dotColor ? (
        <View
          style={[
            styles.dot,
            { backgroundColor: dotColor },
            dotRing && styles.dotRing,
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    backgroundColor: palette.tint100,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.soft,
  },
  initials: {
    fontFamily: fonts.semibold,
    color: palette.primary,
  },
  dot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    ...shadow.soft,
  },
  dotRing: {
    borderWidth: 2,
    borderColor: palette.surface,
  },
});
