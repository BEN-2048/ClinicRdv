import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../api/client';
import { colors } from '../../theme/colors';

export default function RegisterScreen({ navigation }: any) {
  const { register } = useAuth();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');

    if (!firstName.trim() || !lastName.trim()) {
      setError('Veuillez renseigner votre prénom et votre nom.');
      return;
    }
    if (!/^\+[1-9]\d{7,14}$/.test(phone.trim())) {
      setError('Veuillez saisir un numéro valide au format international (+243...).');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Veuillez saisir une adresse e-mail valide.');
      return;
    }
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    if (!accepted) {
      setError("Veuillez accepter les conditions d'utilisation.");
      return;
    }

    setBusy(true);
    try {
      await register({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        email: email.trim().toLowerCase(),
        password,
      });
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
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.logo}>
          <Text style={styles.logoText}>+</Text>
        </View>

        <Text style={styles.brand}>ClinicRDV</Text>
        <Text style={styles.title}>Créer un compte</Text>
        <Text style={styles.subtitle}>
          Rejoignez ClinicRDV et prenez soin de votre santé.
        </Text>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Inscription</Text>
          <Text style={styles.sectionSubtitle}>Espace patient</Text>

          <View style={styles.roleBox}>
            <Text style={styles.roleText}>Patient</Text>
          </View>

          {!!error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Text style={styles.label}>Prénom *</Text>
          <TextInput style={styles.input} value={firstName}
            onChangeText={setFirstName} placeholder="Votre prénom"
            editable={!busy} />

          <Text style={styles.label}>Nom *</Text>
          <TextInput style={styles.input} value={lastName}
            onChangeText={setLastName} placeholder="Votre nom"
            editable={!busy} />

          <Text style={styles.label}>Téléphone *</Text>
          <TextInput style={styles.input} value={phone}
            onChangeText={setPhone} placeholder="+243..."
            keyboardType="phone-pad" editable={!busy} />

          <Text style={styles.label}>Adresse e-mail *</Text>
          <TextInput style={styles.input} value={email}
            onChangeText={setEmail} placeholder="exemple@email.com"
            keyboardType="email-address" autoCapitalize="none"
            autoCorrect={false} editable={!busy} />

          <Text style={styles.label}>Mot de passe *</Text>
          <View style={styles.passwordBox}>
            <TextInput style={styles.passwordInput} value={password}
              onChangeText={setPassword} placeholder="8 caractères minimum"
              secureTextEntry={!showPassword} editable={!busy} />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Text style={styles.showText}>
                {showPassword ? 'Masquer' : 'Afficher'}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Confirmer le mot de passe *</Text>
          <TextInput style={styles.input} value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Confirmez votre mot de passe"
            secureTextEntry={!showPassword} editable={!busy} />

          <TouchableOpacity
            style={styles.termsRow}
            onPress={() => setAccepted(!accepted)}
            disabled={busy}
          >
            <View style={[styles.checkbox, accepted && styles.checked]}>
              {accepted && <Text style={styles.checkText}>✓</Text>}
            </View>
            <Text style={styles.termsText}>
              J'accepte les conditions d'utilisation et la politique de confidentialité.
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, busy && styles.disabled]}
            onPress={submit} disabled={busy}
          >
            {busy
              ? <ActivityIndicator color="#FFFFFF" />
              : <Text style={styles.buttonText}>Créer mon compte</Text>}
          </TouchableOpacity>

          <View style={styles.loginRow}>
            <Text style={styles.muted}>Déjà  un compte ? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.link}>Se connecter</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.footer}>ClinicRDV — Votre santé, notre priorité</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: {
    flexGrow: 1, paddingHorizontal: 22, paddingTop: 45,
    paddingBottom: 35, alignItems: 'center',
  },
  logo: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: colors.primary, justifyContent: 'center',
    alignItems: 'center', marginBottom: 12,
  },
  logoText: { color: '#FFFFFF', fontSize: 44, fontWeight: '700' },
  brand: {
    fontSize: 27, fontWeight: '800', color: colors.primary,
    marginBottom: 14,
  },
  title: {
    fontSize: 24, fontWeight: '800', color: colors.text,
    textAlign: 'center', marginBottom: 8,
  },
  subtitle: {
    fontSize: 14, color: colors.muted, textAlign: 'center',
    lineHeight: 21, marginBottom: 25,
  },
  card: {
    width: '100%', maxWidth: 440, backgroundColor: colors.card,
    borderRadius: 20, padding: 22, borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionTitle: {
    fontSize: 22, fontWeight: '800', color: colors.text,
    textAlign: 'center', marginBottom: 6,
  },
  sectionSubtitle: {
    fontSize: 13, color: colors.muted, textAlign: 'center',
    marginBottom: 20,
  },
  roleBox: {
    backgroundColor: colors.primary, padding: 13,
    borderRadius: 10, alignItems: 'center', marginBottom: 22,
  },
  roleText: { color: '#FFFFFF', fontWeight: '700' },
  label: {
    fontSize: 14, fontWeight: '700', color: colors.text,
    marginBottom: 8,
  },
  input: {
    height: 52, borderWidth: 1, borderColor: '#CBD5E1',
    borderRadius: 10, paddingHorizontal: 14, fontSize: 15,
    color: colors.text, backgroundColor: '#FFFFFF', marginBottom: 18,
  },
  passwordBox: {
    height: 52, flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10,
    paddingHorizontal: 14, marginBottom: 18,
  },
  passwordInput: { flex: 1, fontSize: 15, color: colors.text },
  showText: {
    color: colors.primary, fontSize: 12, fontWeight: '700',
    marginLeft: 8,
  },
  termsRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 22,
  },
  checkbox: {
    width: 20, height: 20, borderWidth: 1.5,
    borderColor: '#94A3B8', borderRadius: 5,
    marginRight: 10, alignItems: 'center', justifyContent: 'center',
  },
  checked: {
    backgroundColor: colors.primary, borderColor: colors.primary,
  },
  checkText: { color: '#FFFFFF', fontWeight: '800' },
  termsText: {
    flex: 1, color: colors.text, fontSize: 12, lineHeight: 19,
  },
  button: {
    backgroundColor: colors.primary, height: 52,
    borderRadius: 11, alignItems: 'center', justifyContent: 'center',
  },
  buttonText: {
    color: '#FFFFFF', fontSize: 16, fontWeight: '800',
  },
  disabled: { opacity: 0.65 },
  loginRow: {
    flexDirection: 'row', justifyContent: 'center',
    marginTop: 22, flexWrap: 'wrap',
  },
  muted: { color: colors.muted, fontSize: 13 },
  link: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  errorBox: {
    backgroundColor: '#FEF2F2', borderColor: '#FECACA',
    borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 18,
  },
  errorText: { color: '#B91C1C', fontSize: 13 },
  footer: {
    fontSize: 11, color: colors.muted,
    textAlign: 'center', marginTop: 28,
  },
});


