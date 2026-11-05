
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

export function Header({
  title,
  subtitle,
  right,
  onRightPress,
  unreadCount = 0,
}: {
  title: string;
  subtitle?: string;
  right?: string;
  onRightPress?: () => void;
  unreadCount?: number;
}) {
  return (
    <View style={s.header}>
      <View>
        <Text style={s.headerTitle}>{title}</Text>

        {subtitle ? (
          <Text style={s.subtitle}>{subtitle}</Text>
        ) : null}
      </View>

      {onRightPress ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Ouvrir les notifications"
          onPress={onRightPress}
          style={s.bellButton}
        >
          <Ionicons
            name="notifications-outline"
            size={23}
            color={colors.text}
          />

          {unreadCount > 0 ? (
            <View style={s.notificationDot} />
          ) : null}
        </TouchableOpacity>
      ) : (
        <View style={s.avatar}>
          <Text style={{ fontSize: 18 }}>
            {right || '◉'}
          </Text>
        </View>
      )}
    </View>
  );
}

export function Button({
  title,
  onPress,
  secondary,
  disabled,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        s.button,
        secondary && s.secondary,
        disabled && { opacity: 0.45 },
      ]}
    >
      <Text
        style={[
          s.buttonText,
          secondary && { color: colors.primary },
        ]}
      >
        {title}
      </Text>
    </TouchableOpacity>
  );
}

export function Chip({
  title,
  active,
  onPress,
}: {
  title: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[s.chip, active && s.chipActive]}
    >
      <Text
        style={[
          s.chipText,
          active && { color: '#fff' },
        ]}
      >
        {title}
      </Text>
    </TouchableOpacity>
  );
}

export function Avatar({
  initials,
  tint,
  size = 46,
}: {
  initials: string;
  tint: string;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: tint,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Text
        style={{
          fontWeight: '800',
          color: '#314A68',
          fontSize: size * 0.29,
        }}
      >
        {initials}
      </Text>
    </View>
  );
}

export const ui = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#F7F9FE',
  },
  content: {
    padding: 18,
    paddingBottom: 36,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EDF1F8',
  },
  h2: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 10,
  },
  muted: {
    color: colors.muted,
    fontSize: 12,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  label: {
    fontWeight: '700',
    color: colors.text,
  },
  field: {
    backgroundColor: '#F1F5FD',
    borderRadius: 10,
    padding: 13,
    color: colors.text,
    marginBottom: 13,
  },
  section: {
    marginTop: 18,
    marginBottom: 10,
  },
  badge: {
    color: '#12834C',
    backgroundColor: '#E5F8ED',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 9,
    fontSize: 11,
    overflow: 'hidden',
  },
});

const s = StyleSheet.create({
  header: {
    backgroundColor: '#fff',
    padding: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#E9EDF6',
  },
  headerTitle: {
    fontWeight: '800',
    color: colors.text,
    fontSize: 19,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  avatar: {
    width: 35,
    height: 35,
    borderRadius: 18,
    backgroundColor: '#EDF3FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellButton: {
    width: 38,
    height: 38,
    borderRadius: 20,
    backgroundColor: '#EDF3FF',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  notificationDot: {
    position: 'absolute',
    top: 7,
    right: 8,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#EF4444',
    borderWidth: 1,
    borderColor: '#fff',
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 11,
    padding: 13,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  secondary: {
    backgroundColor: '#E8F0FF',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#EDF2FB',
    borderRadius: 20,
    marginRight: 7,
    marginBottom: 7,
  },
  chipActive: {
    backgroundColor: colors.primary,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#53627B',
  },
});
