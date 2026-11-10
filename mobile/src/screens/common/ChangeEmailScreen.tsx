import React, { useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { UsersApi } from '../../api/services';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Button, Card, Input, Notice, Screen } from '../../components/ui';
import { color, space, type } from '../../theme';
import { CodeInput, PasswordInput, useCountdown } from '../auth/shared';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ChangeEmailScreen({ navigation }: any) {
  const { user, refreshUser } = useAuth();
  const [email, setEmail] = useState(user?.pending_email ?? '');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useCountdown(0);

  const run = async (action: () => Promise<void>) => {
    setError('');
    setBusy(true);
    try {
      await action();
    } catch (e: any) {
      if (e?.response?.data?.waitSeconds) setWait(e.response.data.waitSeconds);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const request = () => {
    if (!EMAIL.test(email.trim())) {
      setError('Saisissez une adresse e-mail valide.');
      return;
    }
    if (!password) {
      setError('Saisissez votre mot de passe pour confirmer qu’il s’agit bien de vous.');
      return;
    }
    return run(async () => {
      const { data } = await UsersApi.requestEmailChange(email.trim(), password);
      setPending(data.email);
      setPassword('');
      setMessage(data.message);
      setWait(60);
    });
  };

  const resend = () =>
    run(async () => {
      const { data } = await UsersApi.resendEmailChange();
      setCode('');
      setMessage(data.message);
      setWait(60);
    });

  const confirm = () => {
    if (!/^\d{6}$/.test(code)) {
      setError('Saisissez le code de 6 chiffres reçu par e-mail.');
      return;
    }
    return run(async () => {
      const { data } = await UsersApi.confirmEmailChange(code);
      await refreshUser().catch(() => false);
      Alert.alert('Adresse confirmée', data.message);
      navigation.goBack();
    });
  };

  return (
    <Screen>
      <Card style={s.card}>
        <Text style={s.current}>Adresse actuelle : {user?.email || 'aucune'}</Text>
        {user?.pending_email && !pending ? (
          <Notice tone="warning" message={`L’adresse ${user.pending_email} n’est pas encore confirmée.`} />
        ) : null}
        {error ? <Notice tone="danger" message={error} /> : null}
        {message ? <Notice tone="success" message={message} /> : null}

        {pending ? (
          <>
            <Text style={s.help}>Code envoyé à {pending}. Pensez à regarder dans les courriers indésirables.</Text>
            <CodeInput label="Code reçu par e-mail" value={code} onChangeText={setCode} editable={!busy} />
            <Button title="Confirmer l’adresse" icon="checkmark-circle-outline" loading={busy} onPress={confirm} />
            <Button
              title={wait > 0 ? `Renvoyer le code (${wait} s)` : 'Renvoyer le code'}
              icon="refresh"
              variant="ghost"
              disabled={busy || wait > 0}
              onPress={resend}
            />
            <Button
              title="Utiliser une autre adresse"
              variant="secondary"
              disabled={busy}
              onPress={() => {
                setPending(null);
                setCode('');
                setMessage('');
              }}
            />
          </>
        ) : (
          <>
            <Input
              label="Adresse e-mail"
              icon="mail-outline"
              placeholder="exemple@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
              editable={!busy}
            />
            <PasswordInput label="Mot de passe" value={password} onChangeText={setPassword} editable={!busy} />
            <Notice
              tone="info"
              message="Une adresse confirmée permet de vous connecter et de récupérer votre compte si les SMS n’arrivent pas."
            />
            <Button
              title={wait > 0 ? `Recevoir un code (${wait} s)` : 'Recevoir un code'}
              icon="paper-plane-outline"
              loading={busy}
              disabled={busy || wait > 0}
              onPress={request}
            />
          </>
        )}
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  card: { gap: space.md },
  current: { ...type.bodyMedium, color: color.text },
  help: { ...type.caption, color: color.textMuted },
});
