import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StaffApi, StaffAppointment, StaffDoctor } from '../../api/services';
import {
  AppHeader,
  Avatar,
  Card,
  Chip,
  EmptyState,
  Icon,
  IconButton,
  Input,
  Screen,
  SectionTitle,
  StatCard,
} from '../../components/ui';
import { color, fonts, radius, shadow, space, type } from '../../theme';
import {
  ErrorCard,
  Loading,
  STATUS_LABELS,
  StatusBadge,
  clinicToday,
  errorText,
  formatLongDate,
  formatTime,
  shiftDate,
} from '../secretary/shared';
import { doctorName, doctorShortName } from '../../utils/doctorName';

type Leave = { id: number; startDate: string; endDate: string; reason: string | null };
type StatusFilter = 'all' | 'confirmed' | 'pending' | 'cancelled' | 'done';

const STATUS_FILTERS: StatusFilter[] = ['all', 'confirmed', 'pending', 'cancelled', 'done'];
const STATUS_DOT: Record<string, string> = {
  confirmed: color.success,
  pending: color.warning,
  cancelled: color.danger,
  done: color.textMuted,
};

const minutesBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);

export default function ClinicManagementScreen() {
  const navigation = useNavigation<any>();
  const today = clinicToday();
  const [doctors, setDoctors] = useState<StaffDoctor[]>([]);
  const [leaves, setLeaves] = useState<Record<number, Leave | undefined>>({});
  const [appointments, setAppointments] = useState<StaffAppointment[]>([]);
  const [query, setQuery] = useState('');
  const [doctorFilter, setDoctorFilter] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (refresh = false) => {
      if (refresh) setRefreshing(true);
      setError(null);
      try {
        const [docs, appts] = await Promise.all([StaffApi.doctors(), StaffApi.appointments({ date: today })]);
        setDoctors(docs.data);
        setAppointments(appts.data);
        const entries = await Promise.all(
          docs.data
            .filter((d) => d.active)
            .map(async (d) => {
              const res = await StaffApi.leaves(d.id).catch(() => ({ data: [] as Leave[] }));
              const current = (res.data as Leave[]).find((l) => l.startDate <= today && l.endDate >= today);
              return [d.id, current] as const;
            })
        );
        setLeaves(Object.fromEntries(entries));
      } catch (err) {
        setError(errorText(err, 'Impossible de charger la gestion du cabinet.'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [today]
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const countFor = useCallback(
    (doctorId: number) => appointments.filter((a) => a.doctor_id === doctorId && a.status !== 'cancelled').length,
    [appointments]
  );

  const activeDoctors = doctors.filter((d) => d.active);
  const presentDoctors = activeDoctors.filter((d) => !leaves[d.id]);
  const scheduled = appointments.filter((a) => a.status !== 'cancelled').length;
  const pendingCount = appointments.filter((a) => a.status === 'pending').length;

  const byDoctor = useMemo(
    () => (doctorFilter ? appointments.filter((a) => a.doctor_id === doctorFilter) : appointments),
    [appointments, doctorFilter]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return byDoctor
      .filter((a) => statusFilter === 'all' || a.status === statusFilter)
      .filter(
        (a) =>
          !q ||
          a.patient_name.toLowerCase().includes(q) ||
          (a.patient_phone ?? '').replace(/\s/g, '').includes(q.replace(/\s/g, '')) ||
          String(a.patient_id) === q
      )
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  }, [byDoctor, statusFilter, query]);

  const toggleActive = (d: StaffDoctor) => {
    const next = !d.active;
    Alert.alert(
      next ? 'Réactiver le médecin' : 'Suspendre le médecin',
      next
        ? `${doctorName(d.first_name, d.last_name)} sera de nouveau réservable par les patients.`
        : `${doctorName(d.first_name, d.last_name)} ne sera plus proposé aux patients. Ses rendez-vous existants sont conservés.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: next ? 'Réactiver' : 'Suspendre',
          style: next ? 'default' : 'destructive',
          onPress: async () => {
            try {
              await StaffApi.updateDoctor(d.id, { active: next });
              load();
            } catch (err) {
              Alert.alert('Erreur', errorText(err, 'La mise à jour a échoué.'));
            }
          },
        },
      ]
    );
  };

  const cancel = (a: StaffAppointment) =>
    Alert.alert(
      'Annuler le rendez-vous',
      `Annuler le RDV de ${a.patient_name} avec ${doctorName(a.doctor_name)} ? Le patient sera prévenu avec le motif choisi.`,
      [
        { text: 'Non', style: 'cancel' },
        ...(['doctor_unavailable', 'other'] as const).map((reason) => ({
          text: reason === 'doctor_unavailable' ? 'Médecin indisponible' : 'Autre motif',
          style: 'destructive' as const,
          onPress: async () => {
            try {
              await StaffApi.cancel(a.id, { reason });
              load();
            } catch (err) {
              Alert.alert('Erreur', errorText(err, "L'annulation a échoué."));
            }
          },
        })),
      ]
    );

  const openActions = (a: StaffAppointment) =>
    Alert.alert(a.patient_name, `${formatTime(a.starts_at)} · ${doctorName(a.doctor_name)}`, [
      { text: 'Reporter', onPress: () => navigation.navigate('SecretaryBook', { appointment: a }) },
      { text: 'Annuler le RDV', style: 'destructive', onPress: () => cancel(a) },
      { text: 'Fermer', style: 'cancel' },
    ]);

  const slotTaken = (a: StaffAppointment) =>
    appointments.some(
      (x) =>
        x.id !== a.id &&
        x.doctor_id === a.doctor_id &&
        x.status !== 'cancelled' &&
        new Date(x.starts_at) < new Date(a.ends_at) &&
        new Date(x.ends_at) > new Date(a.starts_at)
    );

  const canReassign = (a: StaffAppointment) =>
    a.status === 'cancelled' &&
    new Date(a.starts_at).getTime() > Date.now() &&
    !slotTaken(a) &&
    doctors.some((d) => d.id === a.doctor_id && d.active);

  const exportDay = async () => {
    const header = 'Heure;Fin;Patient;Téléphone;Médecin;Spécialité;Statut;Motif';
    const rows = [...appointments]
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
      .map((a) =>
        [
          formatTime(a.starts_at),
          formatTime(a.ends_at),
          a.patient_name,
          a.patient_phone ?? '',
          doctorName(a.doctor_name),
          a.specialty,
          STATUS_LABELS[a.status] ?? a.status,
          (a.reason ?? '').replace(/[;\n]/g, ' '),
        ].join(';')
      );
    try {
      await Share.share({
        title: `Rendez-vous du ${today}`,
        message: [`Rendez-vous du ${formatLongDate(today)}`, '', header, ...rows].join('\n'),
      });
    } catch (err) {
      Alert.alert('Export impossible', errorText(err, "Le partage a échoué."));
    }
  };

  const doctorStatus = (d: StaffDoctor) => {
    if (!d.active) return { label: 'Suspendu', bg: color.primarySubtle, fg: color.textSecondary, dot: color.textMuted };
    if (leaves[d.id]) return { label: 'Congés', bg: color.primarySoft, fg: color.primary, dot: color.textMuted };
    return { label: 'Actif', bg: color.successSoft, fg: color.successInk, dot: color.success };
  };

  const statusLabel = (st: StatusFilter) => {
    const n = st === 'all' ? byDoctor.length : byDoctor.filter((a) => a.status === st).length;
    return `${st === 'all' ? 'Tous statuts' : STATUS_LABELS[st]} (${n})`;
  };

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={() => load(true)}
      header={
        <AppHeader
          title="Gestion du Cabinet"
          subtitle="Administration"
          right={
            <IconButton
              icon="share-outline"
              accessibilityLabel="Exporter les rendez-vous du jour"
              disabled={appointments.length === 0}
              onPress={exportDay}
            />
          }
        />
      }
      footer={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Nouvelle réservation manuelle"
          onPress={() => navigation.navigate('SecretaryBook')}
          style={({ pressed }) => [s.hub, pressed && s.pressed]}
        >
          <View style={s.hubIcon}>
            <Icon name="add-circle-outline" size="md" color={color.onPrimary} />
          </View>
          <View style={s.flex}>
            <Text style={s.hubTitle}>Réservation manuelle</Text>
            <Text style={s.hubSub}>Guichet & prise d’appel direct</Text>
          </View>
          <View style={s.hubCta}>
            <Text style={s.hubCtaText}>Nouveau RDV</Text>
            <Icon name="chevron-forward" size="sm" color={color.onPrimary} />
          </View>
        </Pressable>
      }
    >
      {loading ? <Loading label="Chargement du cabinet..." /> : null}
      {error ? <ErrorCard message={error} onRetry={() => load()} /> : null}

      {!loading && !error ? (
        <>
          <View style={s.kpis}>
            <StatCard
              style={s.kpi}
              icon="medkit-outline"
              label="Praticiens présents"
              value={`${presentDoctors.length} / ${activeDoctors.length}`}
            />
            <StatCard style={s.kpi} icon="calendar-outline" tone="success" label="RDV programmés" value={scheduled} />
            <StatCard style={s.kpi} icon="hourglass-outline" tone="warning" label="En attente" value={pendingCount} />
          </View>

          <View style={s.sectionRow}>
            <View style={s.sectionLeft}>
              <Text style={s.sectionTitle}>Équipe médicale</Text>
              <View style={s.countPill}>
                <Text style={s.countText}>{doctors.length} profils</Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => navigation.navigate('SecretaryDoctorForm')}
              style={s.link}
            >
              <Icon name="person-add-outline" size="sm" color={color.primary} />
              <Text style={s.linkText}>Ajouter un médecin</Text>
            </Pressable>
          </View>

          {doctors.length === 0 ? (
            <Card>
              <EmptyState icon="medkit-outline" title="Aucun médecin" message="Ajoutez un premier praticien." />
            </Card>
          ) : (
            doctors.map((d) => {
              const st = doctorStatus(d);
              const leave = leaves[d.id];
              const name = `${d.first_name} ${d.last_name}`;
              return (
                <Card key={d.id} style={[s.doctor, (!d.active || leave) && s.doctorMuted]}>
                  <Avatar name={name} size={48} dotColor={st.dot} />
                  <View style={s.flex}>
                    <View style={s.nameRow}>
                      <Text style={s.doctorName} numberOfLines={1}>
                        {doctorName(name)}
                      </Text>
                      <View style={[s.badge, { backgroundColor: st.bg }]}>
                        <Text style={[s.badgeText, { color: st.fg }]}>{st.label}</Text>
                      </View>
                    </View>
                    <Text style={s.doctorSub} numberOfLines={1}>
                      {d.specialty}
                      {leave ? ` · Reprise ${formatLongDate(shiftDate(leave.endDate, 1)).replace(/ \d{4}$/, '')}` : ''}
                    </Text>
                    {d.active && !leave ? (
                      <Text style={s.doctorCount}>{countFor(d.id)} RDV aujourd’hui</Text>
                    ) : leave?.reason ? (
                      <Text style={s.doctorNote} numberOfLines={1}>
                        {leave.reason}
                      </Text>
                    ) : null}
                  </View>
                  <View style={s.doctorActions}>
                    <IconButton
                      icon="create-outline"
                      size={36}
                      accessibilityLabel={`Modifier ${doctorName(name)}`}
                      onPress={() => navigation.navigate('SecretaryDoctorForm', { doctorId: d.id })}
                    />
                    <IconButton
                      icon="calendar-outline"
                      size={36}
                      accessibilityLabel={`Horaires et congés de ${doctorName(name)}`}
                      onPress={() => navigation.navigate('SecretaryDoctorSchedule', { doctorId: d.id, name })}
                    />
                    <IconButton
                      icon={d.active ? 'pause-circle-outline' : 'play-circle-outline'}
                      size={36}
                      accessibilityLabel={d.active ? `Suspendre ${doctorName(name)}` : `Réactiver ${doctorName(name)}`}
                      onPress={() => toggleActive(d)}
                    />
                  </View>
                </Card>
              );
            })
          )}

          <SectionTitle title="Tous les rendez-vous du jour" />
          <Text style={s.dateLabel}>{formatLongDate(today)}</Text>

          <Input
            icon="search-outline"
            placeholder="Rechercher un patient (nom, téléphone, n° dossier)..."
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
          />

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.bleed} contentContainerStyle={s.chips}>
            <Chip
              label={`Tous (${appointments.length})`}
              selected={doctorFilter === null}
              onPress={() => setDoctorFilter(null)}
            />
            {doctors
              .filter((d) => appointments.some((a) => a.doctor_id === d.id))
              .map((d) => (
                <Chip
                  key={d.id}
                  label={`${doctorShortName(d.first_name, d.last_name)} (${appointments.filter((a) => a.doctor_id === d.id).length})`}
                  selected={doctorFilter === d.id}
                  onPress={() => setDoctorFilter(d.id)}
                />
              ))}
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.bleed} contentContainerStyle={s.chips}>
            {STATUS_FILTERS.map((st) => (
              <Pressable
                key={st}
                accessibilityRole="button"
                accessibilityState={{ selected: statusFilter === st }}
                onPress={() => setStatusFilter(st)}
                style={[s.statusChip, statusFilter === st && s.statusChipOn]}
              >
                {st !== 'all' ? <View style={[s.statusDot, { backgroundColor: STATUS_DOT[st] }]} /> : null}
                <Text style={[s.statusChipText, statusFilter === st && s.statusChipTextOn]}>{statusLabel(st)}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {visible.length === 0 ? (
            <Card>
              <EmptyState icon="calendar-clear-outline" title="Aucun rendez-vous" message="Aucun rendez-vous pour ces critères." />
            </Card>
          ) : (
            visible.map((a) => {
              const cancelled = a.status === 'cancelled';
              const actionable = a.status === 'pending' || a.status === 'confirmed';
              return (
                <Card
                  key={a.id}
                  style={[s.appt, cancelled && s.apptCancelled]}
                  onPress={actionable ? () => openActions(a) : undefined}
                  accessibilityLabel={actionable ? `Actions pour ${a.patient_name}` : undefined}
                >
                  <View style={s.apptTop}>
                    <View style={s.apptTime}>
                      <Text style={[s.time, cancelled && s.timeCancelled]}>{formatTime(a.starts_at)}</Text>
                      <Text style={s.duration}>· {minutesBetween(a.starts_at, a.ends_at)} min</Text>
                    </View>
                    <StatusBadge status={a.status} />
                  </View>
                  <Text style={[s.patient, cancelled && s.faded]} numberOfLines={1}>
                    {a.patient_name}
                  </Text>
                  {a.reason ? (
                    <Text style={[s.reason, cancelled && s.faded]} numberOfLines={1}>
                      {a.reason}
                    </Text>
                  ) : null}
                  <View style={s.apptBottom}>
                    <View style={s.assigned}>
                      <Icon name="person-outline" size="sm" color={cancelled ? color.textMuted : color.primary} />
                      <Text style={s.assignedText} numberOfLines={1}>
                        {doctorName(a.doctor_name)} ({a.specialty})
                        {cancelled && !slotTaken(a) ? ' · Créneau rouvert' : ''}
                      </Text>
                    </View>
                    {canReassign(a) ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() =>
                          navigation.navigate('SecretaryBook', {
                            prefill: { doctorId: a.doctor_id, startsAt: a.starts_at },
                          })
                        }
                        style={s.reassign}
                      >
                        <Text style={s.reassignText}>Réattribuer</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </Card>
              );
            })
          )}
        </>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.9 },
  kpis: { flexDirection: 'row', gap: space.xs },
  kpi: { flex: 1 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.xs },
  sectionLeft: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 1 },
  sectionTitle: { ...type.h3, fontFamily: fonts.semibold },
  countPill: { backgroundColor: color.primarySoft, borderRadius: radius.full, paddingHorizontal: space.xs, paddingVertical: 2 },
  countText: { ...type.caption, color: color.primary },
  link: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  linkText: { ...type.label, color: color.primary },
  doctor: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  doctorMuted: { backgroundColor: color.primarySubtle },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  doctorName: { ...type.bodyMedium, fontFamily: fonts.semibold, flexShrink: 1 },
  badge: { borderRadius: radius.full, paddingHorizontal: space.xs, paddingVertical: 2 },
  badgeText: { ...type.caption, fontFamily: fonts.semibold },
  doctorSub: { ...type.caption, color: color.textSecondary },
  doctorCount: { ...type.caption, color: color.successInk, fontFamily: fonts.semibold },
  doctorNote: { ...type.caption, color: color.textMuted },
  doctorActions: { flexDirection: 'row', gap: space.xxs },
  dateLabel: { ...type.caption, color: color.textMuted, marginTop: -space.xs, textTransform: 'capitalize' },
  bleed: { marginHorizontal: -space.md },
  chips: { gap: space.xs, paddingHorizontal: space.md },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xxs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs + 2,
    borderRadius: radius.full,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  statusChipOn: { backgroundColor: color.primarySoft, borderColor: color.primarySoft },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusChipText: { ...type.caption, color: color.textSecondary },
  statusChipTextOn: { color: color.primary, fontFamily: fonts.semibold },
  appt: { gap: 2 },
  apptCancelled: { backgroundColor: color.primarySubtle },
  apptTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xxs },
  apptTime: { flexDirection: 'row', alignItems: 'baseline', gap: space.xxs },
  time: { ...type.h3, fontFamily: fonts.semibold, color: color.primary },
  timeCancelled: { color: color.textMuted, textDecorationLine: 'line-through' },
  duration: { ...type.caption, color: color.textMuted },
  patient: { ...type.bodyMedium, fontFamily: fonts.semibold },
  reason: { ...type.caption, color: color.textSecondary },
  faded: { color: color.textMuted },
  apptBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.xxs, gap: space.xs },
  assigned: { flexDirection: 'row', alignItems: 'center', gap: space.xxs, flexShrink: 1 },
  assignedText: { ...type.caption, color: color.textSecondary, flexShrink: 1 },
  reassign: { backgroundColor: color.primarySoft, borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: space.xxs },
  reassignText: { ...type.label, color: color.primary },
  hub: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: color.primary,
    borderRadius: radius.lg,
    padding: space.sm,
    ...shadow.raised,
  },
  hubIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hubTitle: { ...type.bodyMedium, fontFamily: fonts.semibold, color: color.onPrimary },
  hubSub: { ...type.caption, color: color.onPrimary, opacity: 0.8 },
  hubCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xxs,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: radius.full,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  hubCtaText: { ...type.label, color: color.onPrimary },
});
