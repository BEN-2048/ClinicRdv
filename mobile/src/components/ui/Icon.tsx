import React from 'react';
import { StyleProp, TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { color as themeColor, iconSize } from '../../theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];
export type IconSize = keyof typeof iconSize | number;

export default function Icon({
  name,
  size = 'md',
  color = themeColor.textSecondary,
  style,
}: {
  name: IconName;
  size?: IconSize;
  color?: string;
  style?: StyleProp<TextStyle>;
}) {
  const px = typeof size === 'number' ? size : iconSize[size];
  return <Ionicons name={name} size={px} color={color} style={style} />;
}
