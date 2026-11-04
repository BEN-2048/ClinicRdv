import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { Avatar, Button, ui } from '../../components/ClinicUI';
import { colors } from '../../theme/colors';

const roleLabels = {
  patient: 'Patient',
  doctor: 'Praticien',
  admin: 'Administration',
  secretary: 'Secrétariat',
};

export default function ProfileScreen() {
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

  const fullName =
    [user?.first_name, user?.last_name].filter(Boolean).join(' ') ||
    'Utilisateur';

  const initials =
    [user?.first_name?.[0], user?.last_name?.[0]]
      .filter(Boolean)
      .join('')
      .toUpperCase() || 'U';

  const role = user?.role ? roleLabels[user.role] : 'Utilisateur';

  const saveProfile = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Validation', 'Le prénom et le nom sont obligatoires.');
      return;
    }

    try {
      setSaving(true);
      await updateUser({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() || null,
      });
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
            } catch {
              Alert.alert('Erreur', 'La déconnexion a échoué.');
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Profil et paramètres</Text>
      <Text style={styles.subtitle}>
        Gérez vos informations personnelles et votre compte.
      </Text>

      <View style={styles.roleContainer}>
        <Text style={styles.roleLabel}>Espace actif</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleBadgeText}>{role}</Text>
        </View>
      </View>

      <View style={[ui.card, styles.hero]}>
        <Avatar initials={initials} tint="#DBEAFE" size={82} />
        <Text style={styles.name}>{fullName}</Text>
        <Text style={styles.heroRole}>{role}</Text>
        <Text style={styles.email}>{user?.email || 'Aucun email'}</Text>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Informations du compte</Text>
        {!editing && (
          <Pressable
            accessibilityRole="button"
            onPress={() => setEditing(true)}
          >
            <Text style={styles.editAction}>Modifier</Text>
          </Pressable>
        )}
      </View>

      <View style={ui.card}>
        {editing ? (
          <>
            <Text style={styles.fieldLabel}>Prénom</Text>
            <TextInput
              style={styles.input}
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
            />

            <Text style={styles.fieldLabel}>Nom</Text>
            <TextInput
              style={styles.input}
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
            />

            <Text style={styles.fieldLabel}>Téléphone</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="Numéro de téléphone"
            />

            {saving ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Button title="Enregistrer" onPress={saveProfile} />
            )}

            <Pressable
              style={styles.cancel}
              onPress={() => setEditing(false)}
              disabled={saving}
            >
              <Text style={styles.cancelText}>Annuler</Text>
            </Pressable>
          </>
        ) : (
          <>
            <InfoRow label="Prénom" value={user?.first_name} />
            <InfoRow label="Nom" value={user?.last_name} />
            <InfoRow label="Email" value={user?.email} />
            <InfoRow label="Téléphone" value={user?.phone} />
            <InfoRow label="Type de compte" value={role} last />
          </>
        )}
      </View>

      <Text style={styles.sectionTitle}>Notifications et alertes</Text>
      <View style={ui.card}>
        <Text style={styles.pendingTitle}>Préférences de notification</Text>
        <Text style={styles.pendingDescription}>
          La configuration des notifications sera disponible dans une
          prochaine version.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Sécurité et données médicales</Text>
      <View style={ui.card}>
        <Text style={styles.pendingTitle}>Paramètres de sécurité</Text>
        <Text style={styles.pendingDescription}>
          La gestion du mot de passe et des options de sécurité
          sera disponible prochainement.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Assistance et informations</Text>
      <View style={ui.card}>
        <Text style={styles.pendingDescription}>
          Pour toute question concernant votre compte,
          contactez l'administration de votre clinique.
        </Text>
      </View>

      <Pressable
        style={styles.logoutButton}
        onPress={handleLogout}
        accessibilityRole="button"
      >
        <Text style={styles.logoutText}>Se déconnecter</Text>
      </Pressable>
    </ScrollView>
  );
}

function InfoRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value?: string | null;
  last?: boolean;
}) {
  return (
    <View style={[styles.infoRow, !last && styles.infoBorder]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || 'Non renseigné'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#F8F9FF',
  },
  content: {
    padding: 18,
    paddingBottom: 48,
  },
  heading: {
    fontSize: 25,
    fontWeight: '800',
    color: '#0B1C30',
  },
  subtitle: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 6,
    marginBottom: 20,
  },
  roleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  roleLabel: {
    color: colors.muted,
    fontSize: 13,
  },
  roleBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 22,
  },
  roleBadgeText: {
    color: colors.primary,
    fontWeight: '700',
  },
  hero: {
    alignItems: 'center',
    paddingVertical: 28,
    marginBottom: 22,
  },
  name: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0B1C30',
    marginTop: 13,
  },
  heroRole: {
    color: '#006A61',
    fontWeight: '700',
    marginTop: 5,
  },
  email: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 7,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0B1C30',
    marginTop: 10,
    marginBottom: 10,
  },
  editAction: {
    color: colors.primary,
    fontWeight: '700',
  },
  infoRow: {
    paddingVertical: 13,
  },
  infoBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#EDF1F8',
  },
  infoLabel: {
    color: colors.muted,
    fontSize: 12,
    marginBottom: 5,
  },
  infoValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  fieldLabel: {
    color: colors.text,
    fontWeight: '700',
    marginBottom: 7,
  },
  input: {
    backgroundColor: '#F1F5FD',
    borderRadius: 10,
    padding: 13,
    color: colors.text,
    marginBottom: 15,
  },
  cancel: {
    padding: 14,
    alignItems: 'center',
  },
  cancelText: {
    color: colors.muted,
    fontWeight: '700',
  },
  pendingTitle: {
    color: colors.text,
    fontWeight: '700',
    marginBottom: 6,
  },
  pendingDescription: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  logoutButton: {
    marginTop: 20,
    padding: 17,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DC3545',
    backgroundColor: '#FFF5F5',
    alignItems: 'center',
  },
  logoutText: {
    color: '#DC3545',
    fontSize: 15,
    fontWeight: '800',
  },
});
