import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import {
  AppHeader,
  Avatar,
  Button,
  Card,
  InfoRow,
  Input,
  ListItem,
  Screen,
  SectionTitle,
} from '../../components/ui';
import { color, radius, space, type } from '../../theme';

const roleLabels = {
  patient: 'Patient',
  doctor: 'Praticien',
  admin: 'Administration',
  secretary: 'Secrétariat',
};

export default function ProfileScreen() {
  const navigation = useNavigation<any>();
  const { user, refreshUser, updateUser, logout } = useAuth();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    refreshUser().catch(() => {
      Alert.alert('Connexion', 'Impossible d’actualiser le profil.');
    });
  }, []);

  useEffect(() => {
    if (!editing) {
      setFirstName(user?.first_name || '');
      setLastName(user?.last_name || '');
      setPhone(user?.phone || '');
    }
  }, [user, editing]);

  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'Utilisateur';
  const role = user?.role ? roleLabels[user.role] : 'Utilisateur';
  const isPatient = user?.role === 'patient';
  const isDoctor = user?.role === 'doctor';

  const saveProfile = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Validation', 'Le prénom et le nom sont obligatoires.');
      return;
    }
    try {
      setSaving(true);
      await updateUser({ firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim() || null });
      setEditing(false);
      Alert.alert('Succès', 'Votre profil a été mis à jour.');
    } catch {
      Alert.alert('Erreur', 'Impossible de sauvegarder les modifications.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Déconnexion',
      'Voulez-vous vraiment vous déconnecter ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Se déconnecter',
          style: 'destructive',
          onPress: async () => {
            try {
              await logout();
            } catch (error) {
              const message =
                error instanceof Error &&
                error.message.includes("impossible de supprimer les donnees locales")
                  ? "La déconnexion a été interrompue car les données locales n'ont pas pu être supprimées. Veuillez réessayer."
                  : "La déconnexion a échoué. Veuillez réessayer.";

              Alert.alert("Erreur", message);
            }
          },
        },

    ]);
  };

  return (
    <Screen header={<AppHeader title="Profil et paramètres" subtitle="Gérez vos informations et votre compte" />}>
      <Card style={s.hero}>
        <Avatar name={fullName} size={80} />
        <Text style={s.name}>{fullName}</Text>
        <View style={s.role}>
          <Text style={s.roleText}>{role}</Text>
        </View>
        <Text style={s.email}>{user?.email || 'Aucun e-mail'}</Text>
      </Card>

      <SectionTitle
        title="Informations du compte"
        actionLabel={editing ? undefined : 'Modifier'}
        onAction={editing ? undefined : () => setEditing(true)}
      />

      <Card style={s.section}>
        {editing ? (
          <>
            <Input label="Prénom" value={firstName} onChangeText={setFirstName} autoCapitalize="words" />
            <Input label="Nom" value={lastName} onChangeText={setLastName} autoCapitalize="words" />
            <Input
              label="Téléphone"
              icon="call-outline"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="Numéro de téléphone"
            />
            <View style={s.actions}>
              <Button
                title="Annuler"
                variant="secondary"
                disabled={saving}
                onPress={() => setEditing(false)}
                style={s.flex}
              />
              <Button title="Enregistrer" icon="save-outline" loading={saving} onPress={saveProfile} style={s.flex} />
            </View>
          </>
        ) : (
          <>
            {user?.role === 'patient' ? (
              <InfoRow
                icon="id-card-outline"
                label="N° patient"
                value={user.patient_number || 'En cours d’attribution'}
                strong
              />
            ) : null}
            <InfoRow icon="person-outline" label="Prénom" value={user?.first_name || 'Non renseigné'} strong />
            <InfoRow icon="person-outline" label="Nom" value={user?.last_name || 'Non renseigné'} strong />
            <InfoRow icon="mail-outline" label="E-mail" value={user?.email || 'Non renseigné'} />
            <InfoRow icon="call-outline" label="Téléphone" value={user?.phone || 'Non renseigné'} />
            <InfoRow icon="shield-outline" label="Type de compte" value={role} />
          </>
        )}
      </Card>

      <SectionTitle title="Paramètres" />
      <Card style={s.list}>
        {isPatient ? (
          <ListItem
            icon="folder-open-outline"
            title="Mon dossier médical"
            subtitle="Historique de vos consultations et prescriptions"
            onPress={() => navigation.navigate('MedicalRecord')}
          />
        ) : null}
        {isPatient ? (
          <ListItem
            icon="people-outline"
            title="Ma famille"
            subtitle="Enfants et personnes à charge"
            onPress={() => navigation.navigate('Family')}
            style={s.divider}
          />
        ) : null}
        {isPatient ? (
          <ListItem
            icon="share-social-outline"
            title="Partage et historique des accès"
            subtitle="Autoriser un établissement, voir qui a consulté votre dossier"
            onPress={() => navigation.navigate('Sharing')}
            style={s.divider}
          />
        ) : null}
        {user?.role === 'secretary' || user?.role === 'admin' ? (
          <ListItem
            icon="people-circle-outline"
            title="Liens familiaux à vérifier"
            subtitle="Valider les parents et tuteurs sur justificatif"
            onPress={() => navigation.navigate('GuardianLinks')}
          />
        ) : null}
        {user?.role === 'secretary' || user?.role === 'admin' ? (
          <ListItem
            icon="business-outline"
            title="Établissements"
            subtitle={user?.role === 'admin' ? 'Créer, valider et suspendre les établissements' : 'Fiche, services et personnel de vos établissements'}
            onPress={() => navigation.navigate('FacilitiesManage')}
            style={s.divider}
          />
        ) : null}
        {isDoctor ? (
          <ListItem
            icon="time-outline"
            title="Horaires et congés"
            subtitle="Plages de consultation, durée et absences"
            onPress={() => navigation.navigate('AgendaSettings')}
          />
        ) : null}
        {isDoctor ? (
          <ListItem
            icon="medkit-outline"
            iconColor={color.dangerInk}
            title="Accès d’urgence à un dossier"
            subtitle="Patient hors d’état de consentir · justification obligatoire"
            onPress={() => navigation.navigate('EmergencyAccess')}
            style={s.divider}
          />
        ) : null}
        <ListItem
          icon="notifications-outline"
          title="Notifications et alertes"
          subtitle={isPatient ? 'Préférences SMS et e-mail' : 'Bientôt disponible'}
          onPress={isPatient ? () => navigation.navigate('Notifications') : undefined}
          style={s.divider}
        />
        <ListItem
          icon="lock-closed-outline"
          title="Sécurité"
          subtitle="Mot de passe et options de sécurité · bientôt disponible"
          style={s.divider}
        />
        <ListItem
          icon="help-circle-outline"
          title="Assistance"
          subtitle="Pour toute question, contactez l'administration de votre clinique."
          style={s.divider}
        />
      </Card>

      <Button title="Se déconnecter" icon="log-out-outline" variant="danger" onPress={handleLogout} />
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  hero: { alignItems: 'center', paddingVertical: space.lg, gap: space.xxs },
  name: { ...type.h1, fontSize: 20, lineHeight: 28, marginTop: space.sm, textAlign: 'center' },
  role: {
    backgroundColor: color.primarySoft,
    borderRadius: radius.full,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
  },
  roleText: { ...type.label, color: color.primary },
  email: { ...type.body, color: color.textMuted },
  section: { gap: space.md },
  actions: { flexDirection: 'row', gap: space.xs },
  list: { paddingVertical: space.xxs },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
});
