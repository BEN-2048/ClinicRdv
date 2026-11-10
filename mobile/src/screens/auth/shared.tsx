import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInputProps, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconButton, Input } from '../../components/ui';
import { color, radius, shadow, space, type } from '../../theme';

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView style={s.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[s.content, { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.lg }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.logo}>
          <Icon name="medical" size={32} color={color.onPrimary} />
        </View>
        <Text style={s.brand}>ClinicRDV</Text>
        <Text style={s.title}>{title}</Text>
        <Text style={s.subtitle}>{subtitle}</Text>
        <View style={s.card}>{children}</View>
        <Text style={s.footer}>© ClinicRDV — Votre santé, notre priorité</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function PasswordInput(props: TextInputProps & { label?: string; error?: string | null }) {
  const [visible, setVisible] = useState(false);

  return (
    <Input
      icon="lock-closed-outline"
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoCorrect={false}
      right={
        <IconButton
          icon={visible ? 'eye-off-outline' : 'eye-outline'}
          variant="plain"
          size={36}
          accessibilityLabel={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          onPress={() => setVisible((v) => !v)}
        />
      }
      {...props}
    />
  );
}

export const auth = StyleSheet.create({
  form: { gap: space.md },
  cardTitle: { ...type.h2, textAlign: 'center' },
  cardSubtitle: { ...type.body, color: color.textMuted, textAlign: 'center', marginTop: -space.sm },
  linkRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' },
  muted: { ...type.body, color: color.textMuted },
});

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.page },
  content: { flexGrow: 1, alignItems: 'center', paddingHorizontal: space.lg },
  logo: {
    width: 64,
    height: 64,
    borderRadius: radius.lg + 4,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
    ...shadow.raised,
  },
  brand: { ...type.h2, color: color.primary, marginBottom: space.md },
  title: { ...type.h1, textAlign: 'center' },
  subtitle: { ...type.body, color: color.textSecondary, textAlign: 'center', marginTop: space.xs, marginBottom: space.lg },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: color.surface,
    borderRadius: radius.lg + 4,
    padding: space.lg,
    ...shadow.soft,
  },
  footer: { ...type.caption, color: color.textMuted, textAlign: 'center', marginTop: space.lg },
});
