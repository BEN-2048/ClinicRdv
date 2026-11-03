import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';

export default function ProfileScreen() {
  const { user, logout } = useAuth();

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
    <View style={styles.container}>
      <Text style={styles.title}>Mon profil</Text>

      <View style={styles.card}>
        <Text style={styles.name}>
          {[user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'Utilisateur'}
        </Text>
        <Text style={styles.email}>{user?.email}</Text>
        <Text style={styles.role}>Rôle : {user?.role}</Text>
      </View>

      <Pressable
        style={styles.logoutButton}
        onPress={handleLogout}
        accessibilityRole="button"
      >
        <Text style={styles.logoutText}>Se déconnecter</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: '#F7F9FC',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 24,
    color: '#18243A',
  },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 14,
    marginBottom: 28,
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    color: '#18243A',
  },
  email: {
    fontSize: 15,
    color: '#586579',
    marginTop: 8,
  },
  role: {
    fontSize: 14,
    color: '#586579',
    marginTop: 8,
  },
  logoutButton: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C83B45',
    alignItems: 'center',
  },
  logoutText: {
    color: '#C83B45',
    fontSize: 16,
    fontWeight: '700',
  },
});
