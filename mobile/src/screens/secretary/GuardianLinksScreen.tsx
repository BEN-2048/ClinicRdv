import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { errorMessage } from '../../api/client';
import { GuardianLink, GuardianLinkStatus, StaffApi } from '../../api/services';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  InfoRow,
  Input,
  Loader,
  Notice,
  Screen,
  SegmentedTabs,
} from '../../components/ui';
import { formatBirthDate } from '../patient/FamilyScreen';
import { color, space, type } from '../../theme';

const TABS: { key: GuardianLinkStatus; label: string }[] = [
  { key: 'pending', label: 'À vérifier' },
  { key: 'verified', label: 'Vérifiés' },
  { key: 'rejected', label: 'Refusés' },
];

const RELATIONSHIP_LABEL = { parent: 'Parent', legal_guardian: 'Tuteur légal' } as const;

export default function GuardianLinksScreen() {
  const [tab, setTab] = useState<GuardianLinkStatus>('pending');
  const [links, setLinks] = useState<GuardianLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async (status: GuardianLinkStatus) => {
    setError(null);
    setLoading(true);
    try {
      const { data } = await StaffApi.guardianLinks(status);
      setLinks(data);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(tab);
    }, [load, tab])
  );

  const review = async (link: GuardianLink, status: 'verified' | 'rejected' | 'revoked', motive?: string) => {
    setBusyId(link.id);
    try {
      await StaffApi.reviewGuardianLink(link.id, status, motive);
      setRejectingId(null);
      setReason('');
      await load(tab);
    } catch (e) {
      Alert.alert('Action impossible', errorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const confirmVerify = (link: GuardianLink) =>
    Alert.alert(
      'Confirmer la vérification',
      `Avez-vous contrôlé un justificatif prouvant que ${link.guardian_name} est ${
        link.relationship === 'parent' ? 'parent' : 'tuteur légal'
      } de ${link.patient_first_name} ${link.patient_last_name} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Oui, vérifier', onPress: () => review(link, 'verified') },
      ]
    );

  const confirmRevoke = (link: GuardianLink) =>
    Alert.alert(
      'Révoquer ce lien',
      'Le responsable perdra immédiatement l’accès aux rendez-vous et au dossier de ce patient.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Révoquer', style: 'destructive', onPress: () => review(link, 'revoked', 'Révoqué par le personnel') },
      ]
    );

  return (
    <Screen refreshing={false} onRefresh={() => load(tab)}>
      <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === 'pending' ? (
        <Notice
          icon="file-lines"
          title="Vérification sur justificatif"
          message="Ne validez un lien qu’après avoir vu l’acte de naissance, le livret de famille ou le jugement de tutelle."
        />
      ) : null}

      {error ? <ErrorState message={error} onRetry={() => load(tab)} /> : null}

      {loading ? (
        <Loader label="Chargement..." />
      ) : links.length === 0 ? (
        <EmptyState icon="users" title="Aucune demande" />
      ) : (
        links.map((link) => (
          <Card key={link.id} style={s.card}>
            <Text style={type.h3}>
              {link.patient_first_name} {link.patient_last_name}
            </Text>
            <InfoRow icon="id-card" label="N° patient" value={link.patient_number} strong />
            <InfoRow icon="calendar" label="Naissance" value={formatBirthDate(link.birth_date)} />
            <InfoRow
              icon="user"
              label={RELATIONSHIP_LABEL[link.relationship]}
              value={link.guardian_name}
              strong
            />
            <InfoRow icon="phone" label="Contact" value={link.guardian_phone || link.guardian_email} />
            {link.status_reason ? <InfoRow icon="message" label="Motif" value={link.status_reason} /> : null}

            {link.possible_duplicates > 0 ? (
              <Notice
                tone="warning"
                title="Doublon possible"
                message={`${link.possible_duplicates} autre(s) fiche(s) portent le même nom et la même date de naissance. Vérifiez avant de valider.`}
              />
            ) : null}

            {link.status === 'pending' && rejectingId === link.id ? (
              <View style={s.reject}>
                <Input label="Motif du refus *" value={reason} onChangeText={setReason} maxLength={255} />
                <View style={s.actions}>
                  <Button title="Annuler" variant="secondary" onPress={() => setRejectingId(null)} style={s.flex} />
                  <Button
                    title="Refuser"
                    variant="danger"
                    disabled={!reason.trim()}
                    loading={busyId === link.id}
                    onPress={() => review(link, 'rejected', reason.trim())}
                    style={s.flex}
                  />
                </View>
              </View>
            ) : null}

            {link.status === 'pending' && rejectingId !== link.id ? (
              <View style={s.actions}>
                <Button
                  title="Refuser"
                  variant="secondary"
                  disabled={busyId === link.id}
                  onPress={() => {
                    setReason('');
                    setRejectingId(link.id);
                  }}
                  style={s.flex}
                />
                <Button
                  title="Vérifier"
                  icon="circle-check"
                  loading={busyId === link.id}
                  onPress={() => confirmVerify(link)}
                  style={s.flex}
                />
              </View>
            ) : null}

            {link.status === 'verified' ? (
              <Button
                title="Révoquer le lien"
                variant="danger"
                icon="circle-xmark"
                loading={busyId === link.id}
                onPress={() => confirmRevoke(link)}
              />
            ) : null}
          </Card>
        ))
      )}
      <Text style={s.footnote}>Chaque décision est enregistrée avec votre identifiant et la date.</Text>
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  card: { gap: space.xs },
  reject: { gap: space.sm },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },
  footnote: { ...type.caption, color: color.textMuted, textAlign: 'center' },
});
