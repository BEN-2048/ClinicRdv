import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { AppointmentsApi, AppointmentStatus, WaitingAlertSummary, WaitingListApi } from '../../api/services';
import { useAuth } from '../../context/AuthContext';
import FigmaIcon from '../../components/FigmaIcon';
import {
  CLINIC_TIME_ZONE,
  InitialsAvatar,
  doctorDisplayName,
  initialsOf,
  ordinalSuffix,
} from '../../components/PatientFigmaUI';
import { fonts, palette, shadow, type } from '../../theme/figma';

type Appointment = {
  id: number;
  doctor_id: number;
  doctor_name?: string;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  reason?: string | null;
  specialty?: string;
};

type TabKey = 'upcoming' | 'past' | 'cancelled';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'upcoming', label: 'À venir' },
  { key: 'past', label: 'Passés' },
  { key: 'cancelled', label: 'Annulés' },
];

const STATUS: Record<AppointmentStatus, { label: string; bg: string; dot: string; ink: string }> = {
  confirmed: { label: 'Confirmé', bg: palette.tealSoft, dot: palette.teal, ink: palette.tealDark },
  pending: { label: 'En attente de confirmation', bg: palette.amberSoft, dot: palette.amberDot, ink: palette.amberInk },
  done: { label: 'Terminé', bg: palette.tint100, dot: palette.inkMuted, ink: palette.inkSoft },
  cancelled: { label: 'Annulé', bg: palette.dangerSoft, dot: palette.dangerInk, ink: palette.dangerInk },
};

const capitalizeWords = (s: string) => s.replace(/(^|\s)([a-zà-ÿ])/g, (m, sp, c) => sp + c.toUpperCase());

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat('fr-FR', {
    timeZone: CLINIC_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
  const time = new Intl.DateTimeFormat('fr-FR', {
    timeZone: CLINIC_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d);
  return `${capitalizeWords(date)} à ${time}`;
};

const dayKey = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TIME_ZONE }).format(d);

const countdown = (iso: string) => {
  const start = new Date(iso);
  const days = Math.round(
    (new Date(dayKey(start)).getTime() - new Date(dayKey(new Date())).getTime()) / 86400000,
  );
  if (days <= 0) {
    const hours = Math.max(0, Math.round((start.getTime() - Date.now()) / 3600000));
    return hours <= 1 ? "Dans moins d'une heure" : `Dans ${hours} h`;
  }
  if (days === 1) return 'Demain';
  return `Dans ${days} jours`;
};

const tabOf = (a: Appointment, now: number): TabKey => {
  if (a.status === 'cancelled') return 'cancelled';
  if (a.status === 'done' || new Date(a.starts_at).getTime() < now) return 'past';
  return 'upcoming';
};

const apiError = (e: any, fallback: string) => e?.response?.data?.error || fallback;

export default function MyAppointmentsScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [alerts, setAlerts] = useState<WaitingAlertSummary[]>([]);
  const [tab, setTab] = useState<TabKey>('upcoming');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [reverse, setReverse] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [apptRes, alertRes] = await Promise.all([
        AppointmentsApi.mine(),
        WaitingListApi.mine().catch(() => ({ data: [] as WaitingAlertSummary[] })),
      ]);
      if (!Array.isArray(apptRes.data)) throw new Error('Format de réponse inattendu.');
      setAppointments(apptRes.data as Appointment[]);
      setAlerts(alertRes.data);
    } catch (e: any) {
      setError(apiError(e, e?.message || 'Impossible de charger les rendez-vous.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const grouped = useMemo(() => {
    const now = Date.now();
    const groups: Record<TabKey, Appointment[]> = { upcoming: [], past: [], cancelled: [] };
    appointments.forEach((a) => groups[tabOf(a, now)].push(a));
    groups.upcoming.sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
    groups.past.sort((a, b) => +new Date(b.starts_at) - +new Date(a.starts_at));
    groups.cancelled.sort((a, b) => +new Date(b.starts_at) - +new Date(a.starts_at));
    return groups;
  }, [appointments]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = grouped[tab].filter((a) =>
      !q || [a.doctor_name, a.specialty, a.reason].some((v) => (v || '').toLowerCase().includes(q)),
    );
    return reverse ? [...list].reverse() : list;
  }, [grouped, tab, query, reverse]);

  const cancel = (a: Appointment) => {
    Alert.alert('Annuler le rendez-vous', `Annuler votre rendez-vous avec ${doctorDisplayName(a.doctor_name)} ?`, [
      { text: 'Retour', style: 'cancel' },
      {
        text: 'Annuler le RDV',
        style: 'destructive',
        onPress: async () => {
          setBusyId(a.id);
          try {
            await AppointmentsApi.cancel(a.id);
            await load(true);
          } catch (e) {
            Alert.alert('Annulation impossible', apiError(e, 'Erreur réseau, réessayez.'));
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const reschedule = (a: Appointment) =>
    navigation.navigate('SlotPicker', { doctorId: a.doctor_id, rescheduleId: a.id });

  const firstAlert = alerts[0];

  return (
    <View style={styles.page}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.brand}>ClinicRDV</Text>
            <Text style={type.caption}>Médecins</Text>
          </View>
          <View style={styles.headerActions}>
            <View style={styles.headerBell}>
              <FigmaIcon name="header-bell" />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Profil"
              onPress={() => navigation.navigate('Profil')}
              style={styles.headerAvatarWrap}
            >
              <View style={styles.headerAvatar}>
                <Text style={styles.headerAvatarText}>
                  {initialsOf(`${user?.first_name ?? ''} ${user?.last_name ?? ''}`)}
                </Text>
              </View>
            </Pressable>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[palette.primary]} />
        }
      >
        <View style={styles.titleRow}>
          <View style={styles.titleText}>
            <Text style={type.h1}>Mes rendez-vous</Text>
            <Text style={[type.body, { color: palette.inkSoft }]}>Gérez votre suivi de santé en toute sérénité</Text>
          </View>
          <View style={styles.titleActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Rechercher un rendez-vous"
              onPress={() => {
                setSearchOpen((o) => !o);
                if (searchOpen) setQuery('');
              }}
              style={[styles.roundButton, shadow.soft]}
            >
              <FigmaIcon name="appt-search" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Inverser l'ordre d'affichage"
              onPress={() => setReverse((r) => !r)}
              style={[styles.roundButton, shadow.soft, reverse && styles.roundButtonOn]}
            >
              <FigmaIcon name="appt-filter" />
            </Pressable>
          </View>
        </View>

        {searchOpen ? (
          <View style={styles.searchWrap}>
            <TextInput
              autoFocus
              value={query}
              onChangeText={setQuery}
              placeholder="Médecin, spécialité ou motif"
              placeholderTextColor={palette.inkMuted}
              style={styles.search}
            />
          </View>
        ) : null}

        <View style={styles.tabsWrap}>
          <View style={[styles.tabs, shadow.soft]}>
            {TABS.map((t) => {
              const active = t.key === tab;
              return (
                <Pressable
                  key={t.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  onPress={() => setTab(t.key)}
                  style={[styles.tab, active && [styles.tabActive, shadow.soft]]}
                >
                  {active ? <View style={styles.tabDot} /> : null}
                  <Text style={[styles.tabLabel, active && { color: palette.primary }]}>{t.label}</Text>
                  <View style={[styles.tabCount, active && { backgroundColor: palette.tint200 }]}>
                    <Text style={[styles.tabCountText, active && { color: palette.primary }]}>
                      {grouped[t.key].length}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.list}>
          {loading ? <ActivityIndicator size="large" color={palette.primary} style={{ paddingVertical: 32 }} /> : null}

          {!loading && error ? (
            <View style={[styles.messageCard, shadow.soft]}>
              <Text style={[type.body, { color: palette.dangerInk, textAlign: 'center' }]}>{error}</Text>
              <Pressable onPress={() => load()} style={styles.retry}>
                <Text style={[type.bodyMedium, { color: palette.primary }]}>Réessayer</Text>
              </Pressable>
            </View>
          ) : null}

          {!loading && !error && visible.length === 0 ? (
            <View style={[styles.messageCard, shadow.soft]}>
              <Text style={[type.h2, { textAlign: 'center' }]}>Aucun rendez-vous</Text>
              <Text style={[type.body, { color: palette.inkSoft, textAlign: 'center', marginTop: 4 }]}>
                {query ? 'Aucun résultat pour cette recherche.' : 'Rien à afficher dans cette rubrique.'}
              </Text>
            </View>
          ) : null}

          {!loading && !error
            ? visible.map((a, i) => (
                <AppointmentCard
                  key={a.id}
                  appointment={a}
                  highlight={tab === 'upcoming' && i === 0 && !reverse}
                  showActions={tab === 'upcoming'}
                  busy={busyId === a.id}
                  onReschedule={() => reschedule(a)}
                  onCancel={() => cancel(a)}
                />
              ))
            : null}

          {!loading && !error && tab === 'upcoming' && firstAlert ? (
            <View style={[styles.alertCard, shadow.soft]}>
              <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none">
                <Defs>
                  <LinearGradient id="alertGradient" x1="0" y1="0" x2="1" y2="0">
                    <Stop offset="0" stopColor={palette.tint200} />
                    <Stop offset="1" stopColor={palette.tint100} />
                  </LinearGradient>
                </Defs>
                <Rect width="100%" height="100%" fill="url(#alertGradient)" />
              </Svg>
              <View style={[styles.alertIcon, shadow.soft]}>
                <FigmaIcon name="appt-alert-bell" />
                <View style={styles.alertIconDot} />
              </View>
              <View style={styles.flex}>
                <View style={styles.alertTitleRow}>
                  <Text style={[type.label, { color: palette.ink }]}>
                    {alerts.length} {alerts.length > 1 ? 'alertes actives' : 'alerte active'}
                  </Text>
                  <View style={styles.alertPill}>
                    <Text style={styles.alertPillText}>
                      Position {firstAlert.position}{ordinalSuffix(firstAlert.position)}
                    </Text>
                  </View>
                </View>
                <Text style={[type.body, { color: palette.inkSoft }]} numberOfLines={1}>
                  Créneau plus tôt avec {doctorDisplayName(firstAlert.doctorName)}
                </Text>
                <Pressable
                  accessibilityRole="link"
                  onPress={() => navigation.navigate('WaitingList', { doctorId: firstAlert.doctorId })}
                  style={styles.alertLink}
                >
                  <Text style={[type.label, { color: palette.primary }]}>Gérer mes alertes</Text>
                  <FigmaIcon name="appt-arrow" />
                </Pressable>
              </View>
            </View>
          ) : null}

          {!loading && !error && tab === 'upcoming' ? (
            <View style={[styles.tipCard, shadow.soft]}>
              <View style={styles.tipIcon}>
                <FigmaIcon name="appt-info" />
              </View>
              <View style={styles.flex}>
                <Text style={[type.label, { color: palette.ink }]}>Rappel bienveillant</Text>
                <Text style={[type.body, { color: palette.inkSoft }]}>
                  Pensez à apporter votre carte Vitale et ordonnances récentes lors de votre venue.
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View style={styles.ctaWrap} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate('Médecins')}
          style={({ pressed }) => [styles.cta, shadow.raised, pressed && { opacity: 0.9 }]}
        >
          <FigmaIcon name="appt-plus" />
          <Text style={styles.ctaText} numberOfLines={1} adjustsFontSizeToFit>
            Prendre un nouveau rendez-vous
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function AppointmentCard({
  appointment: a,
  highlight,
  showActions,
  busy,
  onReschedule,
  onCancel,
}: {
  appointment: Appointment;
  highlight: boolean;
  showActions: boolean;
  busy: boolean;
  onReschedule: () => void;
  onCancel: () => void;
}) {
  const status = STATUS[a.status] ?? STATUS.confirmed;
  const pending = a.status === 'pending';
  const name = doctorDisplayName(a.doctor_name);

  return (
    <View style={[styles.card, highlight ? styles.cardShadow : shadow.soft]}>
      {highlight ? (
        <Svg style={styles.banner} preserveAspectRatio="none">
          <Defs>
            <LinearGradient id={`banner-${a.id}`} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={palette.teal} />
              <Stop offset="1" stopColor={palette.primaryBright} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#banner-${a.id})`} />
        </Svg>
      ) : null}

      <View style={[styles.cardHeader, highlight && { paddingTop: 4 }]}>
        <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
          <View style={[styles.statusDot, { backgroundColor: status.dot }]} />
          <Text style={[type.caption, { color: status.ink }]}>{status.label}</Text>
        </View>
        {showActions ? (
          <View style={styles.countdown}>
            <FigmaIcon name="appt-timer" />
            <Text style={styles.countdownText}>{countdown(a.starts_at)}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.doctorRow}>
        <InitialsAvatar name={name} dotColor={status.dot} dotRing />
        <View style={styles.flex}>
          <Text style={type.h2} numberOfLines={1}>{name}</Text>
          {a.specialty ? (
            <Text style={[type.bodyMedium, { color: palette.teal }]} numberOfLines={1}>{a.specialty}</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.details}>
        <DetailRow
          icon={pending ? 'appt-calendar-pending' : 'appt-calendar'}
          label="Date & heure"
          value={formatDateTime(a.starts_at)}
          strong
        />
        {a.reason ? (
          <DetailRow icon={pending ? 'appt-motif-pending' : 'appt-motif'} label="Motif" value={a.reason} />
        ) : null}
      </View>

      {showActions ? (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={onReschedule}
            style={[styles.actionButton, { backgroundColor: palette.tint200 }]}
          >
            <FigmaIcon name="appt-reschedule" />
            <Text style={[type.bodyMedium, { color: palette.primary }]}>Reporter</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={onCancel}
            style={[styles.actionButton, { backgroundColor: palette.dangerSoft }]}
          >
            {busy ? (
              <ActivityIndicator color={palette.dangerInk} />
            ) : (
              <>
                <FigmaIcon name={pending ? 'appt-cancel-pending' : 'appt-cancel'} />
                <Text style={[type.bodyMedium, { color: palette.dangerInk }]}>Annuler</Text>
              </>
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function DetailRow({
  icon,
  label,
  value,
  strong,
}: {
  icon: 'appt-calendar' | 'appt-calendar-pending' | 'appt-motif' | 'appt-motif-pending';
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <View style={styles.detailRow}>
      <View style={[styles.detailIcon, shadow.soft]}>
        <FigmaIcon name={icon} />
      </View>
      <View style={styles.flex}>
        <Text style={type.caption}>{label}</Text>
        <Text style={strong ? type.bodyMedium : type.body} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.page },
  flex: { flex: 1, minWidth: 0 },
  header: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
    zIndex: 2,
  },
  headerRow: {
    height: 64,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 22.5, letterSpacing: -0.18, color: palette.ink },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerBell: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerAvatarWrap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.tint100,
    borderWidth: 2,
    borderColor: palette.tint100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: { fontFamily: fonts.semibold, fontSize: 12, color: palette.primary },
  scroll: { paddingBottom: 96 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  titleText: { flex: 1, paddingRight: 8 },
  titleActions: { flexDirection: 'row', gap: 4 },
  roundButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.tint100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundButtonOn: { backgroundColor: palette.tint200 },
  searchWrap: { paddingHorizontal: 16, paddingBottom: 4 },
  search: {
    ...type.body,
    backgroundColor: palette.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: palette.tint100,
  },
  tabsWrap: { paddingHorizontal: 16, paddingVertical: 4 },
  tabs: { flexDirection: 'row', backgroundColor: palette.tint50, borderRadius: 12, padding: 4 },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 8,
  },
  tabActive: { backgroundColor: palette.surface, gap: 6 },
  tabDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.primary },
  tabLabel: { ...type.label, textAlign: 'center' },
  tabCount: { backgroundColor: palette.tint100, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  tabCountText: { ...type.caption, textAlign: 'center' },
  list: { paddingTop: 8, paddingHorizontal: 16, gap: 16 },
  messageCard: { backgroundColor: palette.surface, borderRadius: 16, padding: 16 },
  retry: { alignSelf: 'center', marginTop: 12, paddingHorizontal: 16, paddingVertical: 8 },
  card: { backgroundColor: palette.surface, borderRadius: 16, padding: 16, gap: 12, overflow: 'hidden' },
  cardShadow: {
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  banner: { position: 'absolute', top: 0, left: 0, right: 0, height: 6 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  countdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: palette.tint50,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  countdownText: { ...type.caption, fontFamily: fonts.semibold, color: palette.primary },
  doctorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  details: { backgroundColor: palette.tint50, borderRadius: 12, padding: 12, gap: 10 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', gap: 8, paddingTop: 4 },
  actionButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: palette.tint200,
  },
  alertIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertIconDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: palette.primaryBright,
  },
  alertTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  alertPill: { backgroundColor: palette.primary, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  alertPillText: { ...type.caption, fontFamily: fonts.bold, color: '#fff' },
  alertLink: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingTop: 2, alignSelf: 'flex-start' },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: palette.surface,
  },
  tipIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.tealSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 },
  cta: {
    height: 48,
    borderRadius: 12,
    backgroundColor: palette.primaryBright,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24,
  },
  ctaText: { ...type.h2, color: '#fff', textAlign: 'center', flexShrink: 1 },
});
