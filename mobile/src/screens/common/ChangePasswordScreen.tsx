import React, { useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { UsersApi } from '../../api/services';
import { errorMessage } from '../../api/client';
import { Button, Card, Notice, Screen } from '../../components/ui';
import { space } from '../../theme';
import { PasswordInput } from '../auth/shared';

export default function ChangePasswordScreen({ navigation }: any) {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError('');
    if (!current) {
      setError('Saisissez votre mot de passe actuel.');
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
      const { data } = await UsersApi.changePassword(current, password);
      Alert.alert('Mot de passe modifié', data.message);
      navigation.goBack();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card style={s.card}>
        {error ? <Notice tone="danger" message={error} /> : null}
        <PasswordInput label="Mot de passe actuel" value={current} onChangeText={setCurrent} editable={!busy} />
        <PasswordInput
          label="Nouveau mot de passe"
          placeholder="8 caractères minimum"
          value={password}
          onChangeText={setPassword}
          editable={!busy}
        />
        <PasswordInput
          label="Confirmer le nouveau mot de passe"
          value={confirm}
          onChangeText={setConfirm}
          editable={!busy}
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        <Notice tone="info" message="Vos autres appareils seront déconnectés. Celui-ci reste connecté." />
        <Button title="Changer le mot de passe" icon="lock" loading={busy} onPress={submit} />
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  card: { gap: space.md },
});
