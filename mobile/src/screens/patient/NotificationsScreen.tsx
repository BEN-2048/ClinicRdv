
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import {
  NotificationsApi,
  PatientNotification,
  NotificationPreferences,
  NotificationType,
} from '../../api/services';

import { colors } from '../../theme/colors';

type FilterType = 'all' | 'appointment_reminder' | 'waiting_list';

const FILTERS: { label: string; value: FilterType }[] = [
  { label: 'Toutes', value: 'all' },
  { label: 'Rappels RDV', value: 'appointment_reminder' },
  { label: "Liste d'attente", value: 'waiting_list' },
];

const getDateKey = (date: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lubumbashi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(date));

const getSection = (date: string) => {
  const today = getDateKey(new Date().toISOString());
  const notificationDate = getDateKey(date);

  if (notificationDate === today) return "Aujourd'hui";

  const now = new Date();
  const day = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Lubumbashi',
      day: '2-digit',
    }).format(now)
  );

  const month = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Lubumbashi',
      month: '2-digit',
    }).format(now)
  );

  const year = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Lubumbashi',
      year: 'numeric',
    }).format(now)
  );

  const current = new Date(Date.UTC(year, month - 1, day));
  const notification = new Date(`${notificationDate}T00:00:00Z`);

  const difference = Math.floor(
    (current.getTime() - notification.getTime()) / 86400000
  );

  if (difference >= 0 && difference < 7) return 'Cette semaine';

  return 'Plus anciennes';
};

const formatDate = (date: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Africa/Lubumbashi',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));

const getNotificationIcon = (type: NotificationType) => {
  switch (type) {
    case 'appointment_reminder':
      return {
        name: 'calendar-clock' as const,
        color: '#2563EB',
        background: '#EAF1FF',
      };

    case 'waiting_list':
      return {
        name: 'clock-check-outline' as const,
        color: '#D97706',
        background: '#FFF5E5',
      };

    case 'prescription':
      return {
        name: 'file-document-outline' as const,
        color: '#0D9488',
        background: '#E6F7F5',
      };

    case 'appointment_confirmed':
      return {
        name: 'calendar-check' as const,
        color: '#16A34A',
        background: '#EAF8EF',
      };

    case 'appointment_cancelled':
      return {
        name: 'calendar-remove' as const,
        color: '#DC2626',
        background: '#FEECEC',
      };

    default:
      return {
        name: 'bell-outline' as const,
        color: '#64748B',
        background: '#EDF2F8',
      };
  }
};

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<PatientNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const [filter, setFilter] = useState<FilterType>('all');

  const [preferences, setPreferences] =
    useState<NotificationPreferences>({
      sms_enabled: true,
      email_enabled: true,
    });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);

  const loadNotifications = useCallback(async () => {
    try {
      const [notificationResponse, preferencesResponse] =
        await Promise.all([
          NotificationsApi.list(filter),
          NotificationsApi.getPreferences(),
        ]);

      setNotifications(notificationResponse.data.items);
      setUnreadCount(notificationResponse.data.unreadCount);
      setPreferences(preferencesResponse.data);
    } catch (error) {
      Alert.alert(
        'Erreur',
        'Impossible de récupérer les notifications. Vérifiez votre connexion.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadNotifications();
    }, [loadNotifications])
  );

  const refresh = () => {
    setRefreshing(true);
    loadNotifications();
  };

  const markAsRead = async (notification: PatientNotification) => {
    if (notification.read) return;

    try {
      await NotificationsApi.markAsRead(notification.id);

      setNotifications((previous) =>
        previous.map((item) =>
          item.id === notification.id
            ? { ...item, read: true, read_at: new Date().toISOString() }
            : item
        )
      );

      setUnreadCount((previous) => Math.max(0, previous - 1));
    } catch {
      Alert.alert('Erreur', 'Impossible de marquer cette notification comme lue.');
    }
  };

  const markAllAsRead = async () => {
    if (unreadCount === 0) return;

    try {
      await NotificationsApi.markAllAsRead();

      setNotifications((previous) =>
        previous.map((item) => ({
          ...item,
          read: true,
          read_at: item.read_at || new Date().toISOString(),
        }))
      );

      setUnreadCount(0);
    } catch {
      Alert.alert('Erreur', 'Impossible de mettre à jour les notifications.');
    }
  };

  const updatePreference = async (
    key: 'sms_enabled' | 'email_enabled',
    value: boolean
  ) => {
    const next = { ...preferences, [key]: value };

    setPreferences(next);
    setSavingPreferences(true);

    try {
      const response = await NotificationsApi.updatePreferences(
        next.sms_enabled,
        next.email_enabled
      );

      setPreferences(response.data);
    } catch {
      setPreferences(preferences);
      Alert.alert('Erreur', 'Impossible de sauvegarder cette préférence.');
    } finally {
      setSavingPreferences(false);
    }
  };

  const groupedNotifications = [
    {
      title: "Aujourd'hui",
      items: notifications.filter(
        (item) => getSection(item.created_at) === "Aujourd'hui"
      ),
    },
    {
      title: 'Cette semaine',
      items: notifications.filter(
        (item) => getSection(item.created_at) === 'Cette semaine'
      ),
    },
    {
      title: 'Plus anciennes',
      items: notifications.filter(
        (item) => getSection(item.created_at) === 'Plus anciennes'
      ),
    },
  ];

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Chargement des notifications...</Text>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <View style={styles.brand}>
          <View style={styles.logo}>
            <MaterialCommunityIcons
              name="medical-bag"
              size={23}
              color="#FFFFFF"
            />
          </View>

          <View>
            <Text style={styles.brandName}>ClinicRDV</Text>
            <Text style={styles.brandSubtitle}>Espace patient</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.bellButton}>
          <Ionicons
            name="notifications-outline"
            size={24}
            color={colors.text}
          />
          {unreadCount > 0 && <View style={styles.bellDot} />}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
      >
        <View style={styles.titleRow}>
          <View>
            <Text style={styles.title}>Notifications</Text>
            <Text style={styles.subtitle}>
              Retrouvez toutes vos actualités médicales
            </Text>
          </View>

          {unreadCount > 0 && (
            <View style={styles.counter}>
              <Text style={styles.counterText}>{unreadCount}</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={styles.markAllButton}
          onPress={markAllAsRead}
          disabled={unreadCount === 0}
        >
          <Ionicons
            name="checkmark-done-outline"
            size={17}
            color={unreadCount > 0 ? colors.primary : colors.muted}
          />
          <Text
            style={[
              styles.markAllText,
              unreadCount === 0 && styles.disabledText,
            ]}
          >
            Tout marquer lu
          </Text>
        </TouchableOpacity>

        {/* Filtres */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {FILTERS.map((item) => {
            const active = filter === item.value;

            return (
              <TouchableOpacity
                key={item.value}
                onPress={() => setFilter(item.value)}
                style={[
                  styles.filterButton,
                  active && styles.filterActive,
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    active && styles.filterTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Notifications réelles */}
        {notifications.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Ionicons
                name="notifications-off-outline"
                size={32}
                color={colors.primary}
              />
            </View>

            <Text style={styles.emptyTitle}>Aucune notification</Text>
            <Text style={styles.emptyDescription}>
              Vous n'avez pas encore de notification dans cette catégorie.
              Vos prochaines actualités apparaîtront ici.
            </Text>
          </View>
        ) : (
          groupedNotifications.map((group) => {
            if (group.items.length === 0) return null;

            return (
              <View key={group.title} style={styles.section}>
                <Text style={styles.sectionTitle}>{group.title}</Text>

                {group.items.map((item) => {
                  const icon = getNotificationIcon(item.type);

                  return (
                    <TouchableOpacity
                      key={item.id}
                      activeOpacity={0.8}
                      onPress={() => markAsRead(item)}
                      style={[
                        styles.notificationCard,
                        !item.read && styles.unreadCard,
                      ]}
                    >
                      <View
                        style={[
                          styles.notificationIcon,
                          { backgroundColor: icon.background },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={icon.name}
                          size={23}
                          color={icon.color}
                        />
                      </View>

                      <View style={styles.notificationContent}>
                        <View style={styles.notificationTitleRow}>
                          <Text style={styles.notificationTitle}>
                            {item.title}
                          </Text>

                          {!item.read && <View style={styles.unreadDot} />}
                        </View>

                        {item.body ? (
                          <Text style={styles.notificationBody}>
                            {item.body}
                          </Text>
                        ) : null}

                        <Text style={styles.notificationDate}>
                          {formatDate(item.created_at)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })
        )}

        {/* Préférences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Préférences de notification
          </Text>

          <View style={styles.preferencesCard}>
            <View style={styles.preferenceRow}>
              <View style={styles.preferenceIcon}>
                <Ionicons
                  name="chatbubble-outline"
                  size={21}
                  color={colors.primary}
                />
              </View>

              <View style={styles.preferenceText}>
                <Text style={styles.preferenceTitle}>Notifications SMS</Text>
                <Text style={styles.preferenceDescription}>
                  Recevoir les informations par SMS
                </Text>
              </View>

              <Switch
                value={preferences.sms_enabled}
                onValueChange={(value) =>
                  updatePreference('sms_enabled', value)
                }
                disabled={savingPreferences}
                trackColor={{ false: '#CBD5E1', true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.preferenceDivider} />

            <View style={styles.preferenceRow}>
              <View style={styles.preferenceIcon}>
                <Ionicons
                  name="mail-outline"
                  size={21}
                  color={colors.primary}
                />
              </View>

              <View style={styles.preferenceText}>
                <Text style={styles.preferenceTitle}>Notifications e-mail</Text>
                <Text style={styles.preferenceDescription}>
                  Recevoir les informations par e-mail
                </Text>
              </View>

              <Switch
                value={preferences.email_enabled}
                onValueChange={(value) =>
                  updatePreference('email_enabled', value)
                }
                disabled={savingPreferences}
                trackColor={{ false: '#CBD5E1', true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>

          {savingPreferences && (
            <Text style={styles.savingText}>Enregistrement...</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  loading: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
  },

  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: colors.muted,
  },

  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#E9EDF6',
  },

  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  logo: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },

  brandName: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 17,
  },

  brandSubtitle: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },

  bellButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },

  bellDot: {
    position: 'absolute',
    top: 7,
    right: 8,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.error,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },

  content: {
    padding: 18,
    paddingBottom: 35,
  },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 5,
  },

  title: {
    fontSize: 25,
    fontWeight: '800',
    color: colors.text,
  },

  subtitle: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 5,
  },

  counter: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EAF1FF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
  },

  counterText: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: 12,
  },

  markAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 5,
    marginTop: 15,
    marginBottom: 17,
  },

  markAllText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },

  disabledText: {
    color: colors.muted,
  },

  filters: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 10,
  },

  filterButton: {
    backgroundColor: '#EDF2F8',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },

  filterActive: {
    backgroundColor: colors.primary,
  },

  filterText: {
    color: '#53627B',
    fontSize: 12,
    fontWeight: '700',
  },

  filterTextActive: {
    color: '#FFFFFF',
  },

  section: {
    marginTop: 19,
  },

  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 11,
  },

  notificationCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#EDF1F8',
    gap: 12,
  },

  unreadCard: {
    borderColor: '#C8D9FF',
    backgroundColor: '#FBFCFF',
  },

  notificationIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },

  notificationContent: {
    flex: 1,
  },

  notificationTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 5,
  },

  notificationTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
    flex: 1,
  },

  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },

  notificationBody: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },

  notificationDate: {
    color: '#94A3B8',
    fontSize: 10,
    marginTop: 8,
  },

  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 17,
    padding: 25,
    alignItems: 'center',
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#EDF1F8',
  },

  emptyIcon: {
    width: 65,
    height: 65,
    borderRadius: 33,
    backgroundColor: '#EAF1FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 13,
  },

  emptyTitle: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 16,
  },

  emptyDescription: {
    textAlign: 'center',
    color: colors.muted,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 8,
  },

  preferencesCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#EDF1F8',
  },

  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 10,
  },

  preferenceIcon: {
    width: 39,
    height: 39,
    borderRadius: 12,
    backgroundColor: '#EAF1FF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  preferenceText: {
    flex: 1,
  },

  preferenceTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },

  preferenceDescription: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 4,
  },

  preferenceDivider: {
    height: 1,
    backgroundColor: '#EDF1F8',
  },

  savingText: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 8,
  },
});
