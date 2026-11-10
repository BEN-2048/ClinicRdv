import React, { useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { UsersApi } from '../../api/services';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Button, Card, Input, Notice, Screen } from '../../components/ui';
import { color, space, type } from '../../theme';
import { formatDrcPhone, normalizeDrcPhone } from '../../utils/phone';
import { CodeInput, PasswordInput, useCountdown } from '../auth/shared';

export default function ChangePhoneScreen({ navigation }: any) {
  const { user, refreshUser } = useAuth();
  const [phone, setPhone] = useState('');
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
    if (!normalizeDrcPhone(phone)) {
      setError('Saisissez un numéro congolais valide (ex. 081 234 5678).');
      return;
    }
    if (!password) {
      setError('Saisissez votre mot de passe pour confirmer qu’il s’agit bien de vous.');
      return;
    }
    return run(async () => {
      const { data } = await UsersApi.requestPhoneChange(phone.trim(), password);
      setPending(data.phone);
      setPassword('');
      setMessage(data.message);
      setWait(60);
    });
  };

  const resend = () =>
    run(async () => {
      const { data } = await UsersApi.resendPhoneChange();
      setCode('');
      setMessage(data.message);
      setWait(60);
    });

  const confirm = () => {
    if (!/^\d{6}$/.test(code)) {
      setError('Saisissez le code de 6 chiffres reçu par SMS.');
      return;
    }
    return run(async () => {
      const { data } = await UsersApi.confirmPhoneChange(code);
      await refreshUser().catch(() => false);
      Alert.alert('Numéro modifié', data.message);
      navigation.goBack();
    });
  };

  return (
    <Screen>
      <Card style={s.card}>
        <Text style={s.current}>
          Numéro actuel : {user?.phone_e164 ? formatDrcPhone(user.phone_e164) : user?.phone || 'aucun'}
        </Text>
        {error ? <Notice tone="danger" message={error} /> : null}
        {message ? <Notice tone="success" message={message} /> : null}

        {pending ? (
          <>
            <Text style={s.help}>Code envoyé au {formatDrcPhone(pending)}.</Text>
            <CodeInput label="Code reçu par SMS" value={code} onChangeText={setCode} editable={!busy} />
            <Button title="Confirmer le nouveau numéro" icon="checkmark-circle-outline" loading={busy} onPress={confirm} />
            <Button
              title={wait > 0 ? `Renvoyer le code (${wait} s)` : 'Renvoyer le code'}
              icon="refresh"
              variant="ghost"
              disabled={busy || wait > 0}
              onPress={resend}
            />
            <Button
              title="Utiliser un autre numéro"
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
              label="Nouveau numéro"
              icon="call-outline"
              placeholder="081 234 5678"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              editable={!busy}
            />
            <PasswordInput label="Mot de passe" value={password} onChangeText={setPassword} editable={!busy} />
            <Notice
              tone="info"
              message="Un code sera envoyé au nouveau numéro. Votre ancien numéro recevra un SMS d’avertissement et vos autres appareils seront déconnectés."
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
