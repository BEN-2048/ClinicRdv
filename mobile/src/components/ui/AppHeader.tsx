import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, palette, space, type } from '../../theme';
import IconButton from './IconButton';
import { IconName } from './Icon';

export type HeaderAction = {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  badge?: boolean;
  active?: boolean;
};

export default function AppHeader({
  title,
  subtitle,
  onBack,
  actions = [],
  right,
  safeTop = true,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  actions?: HeaderAction[];
  right?: React.ReactNode;
  safeTop?: boolean;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[s.header, safeTop && { paddingTop: insets.top }]}>
      <View style={s.row}>
        {onBack ? (
          <IconButton
            icon="arrow-back"
            variant="plain"
            accessibilityLabel="Retour"
            iconColor={color.text}
            onPress={onBack}
          />
        ) : null}
        <View style={s.titles}>
          <Text style={s.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={s.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={s.actions}>
          {actions.map((a) => (
            <IconButton
              key={a.accessibilityLabel}
              icon={a.icon}
              onPress={a.onPress}
              accessibilityLabel={a.accessibilityLabel}
              badge={a.badge}
              active={a.active}
            />
          ))}
          {right}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    shadowColor: palette.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
    zIndex: 2,
  },
  row: {
    minHeight: 64,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  titles: { flex: 1, minWidth: 0 },
  title: { ...type.h2 },
  subtitle: { ...type.caption, color: color.textMuted, marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
