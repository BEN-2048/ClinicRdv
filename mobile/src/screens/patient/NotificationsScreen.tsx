import React, { useCallback, useLayoutEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  NotificationPreferences,
  NotificationsApi,
  NotificationType,
  PatientNotification,
} from '../../api/services';
import {
  Card,
  Chip,
  EmptyState,
  Icon,
  IconButton,
  IconName,
  Loader,
  Screen,
  SectionTitle,
} from '../../components/ui';
import { CLINIC_TIME_ZONE } from '../../components/PatientFigmaUI';
import { color, radius, shadow, space, type } from '../../theme';

type FilterType = 'all' | 'appointment_reminder' | 'waiting_list';

const FILTERS: { label: string; value: FilterType }[] = [
  { label: 'Toutes', value: 'all' },
  { label: 'Rappels RDV', value: 'appointment_reminder' },
  { label: "Liste d'attente", value: 'waiting_list' },
];

const SECTIONS = ["Aujourd'hui", 'Cette semaine', 'Plus anciennes'] as const;

const getDateKey = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

const getSection = (date: string): (typeof SECTIONS)[number] => {
  const today = getDateKey(new Date());
  const day = getDateKey(new Date(date));
  if (day === today) return "Aujourd'hui";
  const difference = Math.floor(
    (new Date(`${today}T00:00:00Z`).getTime() - new Date(`${day}T00:00:00Z`).getTime()) / 86400000
  );
  return difference >= 0 && difference < 7 ? 'Cette semaine' : 'Plus anciennes';
};

const formatDate = (date: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone: CLINIC_TIME_ZONE,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));

const NOTIFICATION_ICONS: Record<NotificationType, { name: IconName; fg: string; bg: string }> = {
  appointment_reminder: { name: 'alarm-outline', fg: color.primary, bg: color.primarySoft },
  waiting_list: { name: 'hourglass-outline', fg: color.warning, bg: color.warningSoft },
  prescription: { name: 'document-text-outline', fg: color.success, bg: color.successSoft },
  appointment_confirmed: { name: 'checkmark-circle-outline', fg: color.success, bg: color.successSoft },
  appointment_cancelled: { name: 'close-circle-outline', fg: color.dangerInk, bg: color.dangerSoft },
  general: { name: 'notifications-outline', fg: color.textSecondary, bg: color.primarySubtle },
  record_emergency_access: { name: 'alert-circle-outline', fg: color.dangerInk, bg: color.dangerSoft },
};

export default function NotificationsScreen() {
  const navigation = useNavigation<any>();
  const [notifications, setNotifications] = useState<PatientNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState<FilterType>('all');
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    sms_enabled: true,
    email_enabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);

  const loadNotifications = useCallback(async () => {
    try {
      const [notificationResponse, preferencesResponse] = await Promise.all([
        NotificationsApi.list(filter),
        NotificationsApi.getPreferences(),
      ]);
      setNotifications(notificationResponse.data.items);
      setUnreadCount(notificationResponse.data.unreadCount);
      setPreferences(preferencesResponse.data);
    } catch {
      Alert.alert('Erreur', 'Impossible de récupérer les notifications. Vérifiez votre connexion.');
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

  const markAsRead = async (notification: PatientNotification) => {
    if (notification.read) return;
    try {
      await NotificationsApi.markAsRead(notification.id);
      setNotifications((previous) =>
        previous.map((item) =>
          item.id === notification.id ? { ...item, read: true, read_at: new Date().toISOString() } : item
        )
      );
      setUnreadCount((previous) => Math.max(0, previous - 1));
    } catch {
      Alert.alert('Erreur', 'Impossible de marquer cette notification comme lue.');
    }
  };

  const markAllAsRead = useCallback(async () => {
    if (unreadCount === 0) return;
    try {
      await NotificationsApi.markAllAsRead();
      setNotifications((previous) =>
        previous.map((item) => ({ ...item, read: true, read_at: item.read_at || new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch {
      Alert.alert('Erreur', 'Impossible de mettre à jour les notifications.');
    }
  }, [unreadCount]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <IconButton
          icon="checkmark-done-outline"
          variant="plain"
          accessibilityLabel="Tout marquer comme lu"
          disabled={unreadCount === 0}
          iconColor={unreadCount > 0 ? color.primary : color.textMuted}
          onPress={markAllAsRead}
        />
      ),
    });
  }, [navigation, unreadCount, markAllAsRead]);

  const updatePreference = async (key: 'sms_enabled' | 'email_enabled', value: boolean) => {
    const previous = preferences;
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    setSavingPreferences(true);
    try {
      const response = await NotificationsApi.updatePreferences(next.sms_enabled, next.email_enabled);
      setPreferences(response.data);
    } catch {
      setPreferences(previous);
      Alert.alert('Erreur', 'Impossible de sauvegarder cette préférence.');
    } finally {
      setSavingPreferences(false);
    }
  };

  if (loading && !refreshing) {
    return <Loader fullscreen label="Chargement des notifications..." />;
  }

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        loadNotifications();
      }}
    >
      <View style={s.intro}>
        <Text style={s.introText}>Retrouvez toutes vos actualités médicales</Text>
        {unreadCount > 0 ? (
          <View style={s.counter}>
            <Text style={s.counterText}>
              {unreadCount} non lue{unreadCount > 1 ? 's' : ''}
            </Text>
          </View>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.filtersWrap}
        contentContainerStyle={s.filters}
      >
        {FILTERS.map((item) => (
          <Chip
            key={item.value}
            label={item.label}
            selected={filter === item.value}
            onPress={() => setFilter(item.value)}
          />
        ))}
      </ScrollView>

      {notifications.length === 0 ? (
        <Card>
          <EmptyState
            icon="notifications-off-outline"
            title="Aucune notification"
            message="Vous n'avez pas encore de notification dans cette catégorie. Vos prochaines actualités apparaîtront ici."
          />
        </Card>
      ) : (
        SECTIONS.map((section) => {
          const items = notifications.filter((item) => getSection(item.created_at) === section);
          if (items.length === 0) return null;
          return (
            <View key={section} style={s.group}>
              <Text style={s.groupTitle}>{section}</Text>
              {items.map((item) => {
                const icon = NOTIFICATION_ICONS[item.type] ?? NOTIFICATION_ICONS.general;
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    onPress={() => markAsRead(item)}
                    style={({ pressed }) => [s.item, !item.read && s.itemUnread, pressed && s.pressed]}
                  >
                    <View style={[s.itemIcon, { backgroundColor: icon.bg }]}>
                      <Icon name={icon.name} size="md" color={icon.fg} />
                    </View>
                    <View style={s.flex}>
                      <View style={s.itemTitleRow}>
                        <Text style={[type.bodyMedium, s.flex]}>{item.title}</Text>
                        {!item.read ? <View style={s.dot} /> : null}
                      </View>
                      {item.body ? <Text style={s.itemBody}>{item.body}</Text> : null}
                      <Text style={s.itemDate}>{formatDate(item.created_at)}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          );
        })
      )}

      <SectionTitle title="Préférences de notification" />
      <Card style={s.prefs}>
        <PreferenceRow
          icon="chatbubble-outline"
          title="Notifications SMS"
          description="Recevoir les informations par SMS"
          value={preferences.sms_enabled}
          disabled={savingPreferences}
          onChange={(v) => updatePreference('sms_enabled', v)}
        />
        <View style={s.divider} />
        <PreferenceRow
          icon="mail-outline"
          title="Notifications e-mail"
          description="Recevoir les informations par e-mail"
          value={preferences.email_enabled}
          disabled={savingPreferences}
          onChange={(v) => updatePreference('email_enabled', v)}
        />
      </Card>
      {savingPreferences ? <Text style={s.saving}>Enregistrement...</Text> : null}
    </Screen>
  );
}

function PreferenceRow({
  icon,
  title,
  description,
  value,
  disabled,
  onChange,
}: {
  icon: IconName;
  title: string;
  description: string;
  value: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={s.prefRow}>
      <View style={s.prefIcon}>
        <Icon name={icon} size="md" color={color.primary} />
      </View>
      <View style={s.flex}>
        <Text style={type.bodyMedium}>{title}</Text>
        <Text style={s.itemDate}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: color.borderStrong, true: color.primary }}
        thumbColor={color.surface}
      />
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  intro: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.xs },
  introText: { ...type.body, color: color.textSecondary, flex: 1 },
  counter: {
    backgroundColor: color.primary,
    borderRadius: radius.full,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
  },
  counterText: { ...type.label, color: color.onPrimary },
  filtersWrap: { marginHorizontal: -space.md },
  filters: { gap: space.xs, paddingHorizontal: space.md },
  group: { gap: space.xs },
  groupTitle: { ...type.label, textTransform: 'uppercase', letterSpacing: 1 },
  item: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    ...shadow.soft,
  },
  itemUnread: { backgroundColor: color.primarySubtle },
  pressed: { opacity: 0.85 },
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTitleRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.primary },
  itemBody: { ...type.body, color: color.textSecondary, marginTop: 2 },
  itemDate: { ...type.caption, color: color.textMuted, marginTop: 4 },
  prefs: { paddingVertical: space.xs },
  prefRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs },
  prefIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: color.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: color.border },
  saving: { ...type.caption, color: color.textMuted, textAlign: 'center' },
});
