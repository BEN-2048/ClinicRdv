import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { AuthApi } from '../../api/services';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../api/client';
import { colors } from '../../theme/colors';

export default function VerifyEmailScreen({ route, navigation }: any) {
  const email: string = route.params?.email ?? '';
  const { verifyEmail } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const verify = async () => {
    setError('');
    setMessage('');

    if (!/^\d{6}$/.test(code)) {
      setError('Saisissez un code de 6 chiffres.');
      return;
    }

    setBusy(true);
    try {
      await verifyEmail(email, code);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await AuthApi.resendOtp(email);
      setCode('');
      setMessage('Un nouveau code a été envoyé.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Vérification de votre e-mail</Text>
        <Text style={styles.subtitle}>
          Saisissez le code à 6 chiffres envoyé à {email}.
        </Text>

        {!!error && <Text style={styles.error}>{error}</Text>}
        {!!message && <Text style={styles.message}>{message}</Text>}

        <TextInput
          style={styles.input}
          value={code}
          onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="000000"
          editable={!busy}
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
        />

        <TouchableOpacity
          style={[styles.button, busy && styles.disabled]}
          onPress={verify}
          disabled={busy}
        >
          {busy
            ? <ActivityIndicator color="#FFFFFF" />
            : <Text style={styles.buttonText}>Vérifier mon adresse</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={resend} disabled={busy}>
          <Text style={styles.link}>Renvoyer le code</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
          <Text style={styles.link}>Retour à la connexion</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    padding: 22,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  title: {
    fontSize: 23,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: 24,
  },
  input: {
    height: 58,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    textAlign: 'center',
    fontSize: 26,
    letterSpacing: 8,
    color: colors.text,
    marginBottom: 18,
  },
  button: {
    backgroundColor: colors.primary,
    height: 52,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  disabled: { opacity: 0.6 },
  link: {
    color: colors.primary,
    textAlign: 'center',
    fontWeight: '700',
    marginTop: 22,
  },
  error: {
    color: '#B91C1C',
    textAlign: 'center',
    marginBottom: 12,
  },
  message: {
    color: '#166534',
    textAlign: 'center',
    marginBottom: 12,
  },
});
