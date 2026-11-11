import React from 'react';
import { RefreshControl, ScrollView, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, space } from '../../theme';

export default function Screen({
  children,
  header,
  footer,
  scroll = true,
  safeTop = false,
  refreshing,
  onRefresh,
  contentStyle,
  style,
}: {
  children: React.ReactNode;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  scroll?: boolean;
  safeTop?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[s.page, safeTop && !header && { paddingTop: insets.top }, style]}>
      {header}
      {scroll ? (
        <ScrollView
          style={s.flex}
          contentContainerStyle={[s.content, contentStyle]}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={!!refreshing}
                onRefresh={onRefresh}
                tintColor={color.primary}
                colors={[color.primary]}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[s.flex, s.content, contentStyle]}>{children}</View>
      )}
      {footer ? <View style={s.footer}>{footer}</View> : null}
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.page },
  flex: { flex: 1 },
  content: { padding: space.md, paddingBottom: space.xl, gap: space.md },
  footer: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.md,
    backgroundColor: color.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
});
