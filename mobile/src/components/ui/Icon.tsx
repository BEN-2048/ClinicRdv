import React from 'react';
import { StyleProp, TextStyle } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import type glyphMap from '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/FontAwesome6Free.json';
import { color as themeColor, iconSize } from '../../theme';

export type IconName = keyof typeof glyphMap;
export type IconSize = keyof typeof iconSize | number;

export default function Icon({
  name,
  size = 'md',
  color = themeColor.textSecondary,
  solid = false,
  style,
}: {
  name: IconName;
  size?: IconSize;
  color?: string;
  solid?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const px = typeof size === 'number' ? size : iconSize[size];
  return <FontAwesome6 name={name} size={px} color={color} solid={solid} style={style} />;
}
