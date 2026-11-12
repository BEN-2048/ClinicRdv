import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { AuthApi } from '../../api/services';
import { errorMessage } from '../../api/client';
import { Button, Notice } from '../../components/ui';
import { color, type } from '../../theme';
import { AuthLayout, CodeInput, PasswordInput, auth, useCountdown } from './shared';

export default function ResetPasswordScreen({ route, navigation }: any) {
  const identifier: string = route.params?.identifier ?? '';
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState<string>(route.params?.message ?? '');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useCountdown(60);

  const submit = async () => {
    setError('');
    if (!/^\d{6}$/.test(code)) {
      setError('Saisissez le code de 6 chiffres que vous avez reçu.');
      return;
    }
    if (password.length < 8) {
      setError('Le nouveau mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setBusy(true);
    try {
      const { data } = await AuthApi.resetPassword(identifier, code, password);
      Alert.alert('Mot de passe modifié', data.message);
      navigation.navigate('Login');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError('');
    setBusy(true);
    try {
      const { data } = await AuthApi.forgotPassword(identifier);
      setCode('');
      setMessage(data.message);
      setWait(60);
    } catch (e: any) {
      if (e?.response?.data?.waitSeconds) setWait(e.response.data.waitSeconds);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Nouveau mot de passe" subtitle={`Code envoyé pour ${identifier}.`}>
      <View style={auth.form}>
        <Text style={auth.cardTitle}>Choisir un nouveau mot de passe</Text>
        {error ? <Notice tone="danger" message={error} /> : null}
        {message ? <Notice tone="info" message={message} /> : null}

        <CodeInput label="Code reçu" value={code} onChangeText={setCode} editable={!busy} />
        <PasswordInput
          label="Nouveau mot de passe"
          placeholder="8 caractères minimum"
          value={password}
          onChangeText={setPassword}
          editable={!busy}
        />
        <PasswordInput
          label="Confirmer le mot de passe"
          placeholder="Saisissez-le à nouveau"
          value={confirm}
          onChangeText={setConfirm}
          editable={!busy}
          returnKeyType="go"
          onSubmitEditing={submit}
        />

        <Button title="Enregistrer le mot de passe" icon="circle-check" loading={busy} onPress={submit} />
        <Button
          title={wait > 0 ? `Renvoyer le code (${wait} s)` : 'Renvoyer le code'}
          icon="arrows-rotate"
          variant="ghost"
          disabled={busy || wait > 0}
          onPress={resend}
        />

        <Text style={s.help}>
          Par sécurité, tous vos appareils seront déconnectés et un SMS vous préviendra du changement.
        </Text>

        <View style={auth.linkRow}>
          <Button
            title="Retour à la connexion"
            variant="ghost"
            size="sm"
            fullWidth={false}
            onPress={() => navigation.navigate('Login')}
          />
        </View>
      </View>
    </AuthLayout>
  );
}

const s = StyleSheet.create({
  help: { ...type.caption, color: color.textMuted, textAlign: 'center' },
});
