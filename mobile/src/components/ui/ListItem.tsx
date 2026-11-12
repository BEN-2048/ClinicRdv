import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { color, radius, space, type } from '../../theme';
import Icon, { IconName } from './Icon';

export default function ListItem({
  title,
  subtitle,
  icon,
  iconColor = color.primary,
  left,
  right,
  onPress,
  chevron = !!onPress,
  destructive = false,
  style,
}: {
  title: string;
  subtitle?: string | null;
  icon?: IconName;
  iconColor?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const titleColor = destructive ? color.dangerInk : color.text;

  const body = (
    <>
      {left ??
        (icon ? (
          <View style={[s.iconWrap, destructive && { backgroundColor: color.dangerSoft }]}>
            <Icon name={icon} size="md" color={destructive ? color.dangerInk : iconColor} />
          </View>
        ) : null)}
      <View style={s.texts}>
        <Text style={[s.title, { color: titleColor }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={s.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {chevron ? <Icon name="chevron-right" size="md" color={color.textMuted} /> : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [s.row, pressed && s.pressed, style]}
      >
        {body}
      </Pressable>
    );
  }

  return <View style={[s.row, style]}>{body}</View>;
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    minHeight: 56,
  },
  pressed: { opacity: 0.7 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: color.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { flex: 1, minWidth: 0 },
  title: { ...type.bodyMedium },
  subtitle: { ...type.caption, color: color.textMuted, marginTop: 2 },
});
