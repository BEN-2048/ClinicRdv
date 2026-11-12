import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { DoctorsApi } from '../../api/services';
import {
  AppHeader,
  Button,
  Card,
  Chip,
  ErrorState,
  IconButton,
  Loader,
  Notice,
  Screen,
  SectionTitle,
  SegmentedTabs,
} from '../../components/ui';
import { color, fonts, radius, shadow, space, statusTokens, type } from '../../theme';
import {
  DoctorAppointment,
  KindTag,
  appointmentKind,
  formatTime,
  isUrgent,
  patientName,
  sameDay,
} from './shared';
import BlockSlotSheet from './BlockSlotSheet';
import { doctorName } from '../../utils/doctorName';

type Doctor = {
  id: number;
  first_name: string;
  last_name: string;
  specialty: string;
};

type BlockedSlot = {
  id: number;
  startsAt: string;
  endsAt: string;
  reason: string | null;
};

type Leave = {
  id: number;
  startDate: string;
  endDate: string;
  reason: string | null;
};

type ViewMode = 'day' | 'three' | 'week';

const VIEW_DAYS: Record<ViewMode, number> = { day: 1, three: 3, week: 7 };

type SheetState = { visible: boolean; start: number | null; duration: number | null };

const minutesOf = (iso: string) => {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
};

type Filter = 'Tous' | 'Urgences' | 'Bloqué';

const FILTERS: Filter[] = ['Tous', 'Urgences', 'Bloqué'];

const HOURS = Array.from({ length: 11 }, (_, i) => i + 8);
const HOUR_HEIGHT = 76;

const dateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const blockTone = (a: DoctorAppointment) => {
  const kind = appointmentKind(a.reason);
  if (kind === 'urgent') return { bg: color.dangerSoft, bar: color.danger, ink: color.dangerInk };
  const t = statusTokens[a.status] ?? statusTokens.confirmed;
  if (a.status === 'pending') return { bg: t.bg + '99', bar: t.dot, ink: t.ink };
  if (a.status === 'done') return { bg: color.primarySubtle, bar: color.textMuted, ink: color.textSecondary };
  return { bg: color.primarySoft, bar: color.primary, ink: color.primary };
};

export default function DoctorAgendaScreen() {
  const navigation = useNavigation<any>();
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [appointments, setAppointments] = useState<DoctorAppointment[]>([]);
  const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [filter, setFilter] = useState<Filter>('Tous');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState<SheetState>({ visible: false, start: null, duration: null });

  const loadAgenda = useCallback(async () => {
    try {
      setError('');
      const [dashboardResponse, blocksResponse, leavesResponse] = await Promise.all([
        DoctorsApi.dashboard(),
        DoctorsApi.blockedSlots(),
        DoctorsApi.leaves(),
      ]);
      setDoctor(dashboardResponse.data.doctor);
      setAppointments(dashboardResponse.data.appointments || []);
      setBlockedSlots(blocksResponse.data || []);
      setLeaves(leavesResponse.data || []);
    } catch (e: any) {
      console.error('Erreur agenda médecin :', e?.response?.data || e);
      setError(e?.response?.data?.error || 'Impossible de charger votre agenda.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAgenda();
    }, [loadAgenda])
  );

  const dates = useMemo(() => {
    const start = new Date(selectedDate);
    start.setDate(start.getDate() - 3);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [selectedDate]);

  const rangeDays = useMemo(
    () =>
      Array.from({ length: VIEW_DAYS[viewMode] }, (_, index) => {
        const date = new Date(selectedDate);
        date.setDate(selectedDate.getDate() + index);
        return date;
      }),
    [selectedDate, viewMode]
  );

  const inRange = useCallback((iso: string) => rangeDays.some((d) => sameDay(new Date(iso), d)), [rangeDays]);

  const matchesFilter = useCallback(
    (a: DoctorAppointment) => {
      if (filter === 'Urgences') return isUrgent(a.reason);
      return filter === 'Tous';
    },
    [filter]
  );

  const dayAppointments = useMemo(
    () => appointments.filter((a) => inRange(a.starts_at) && a.status !== 'cancelled'),
    [appointments, inRange]
  );

  const visibleAppointments = useMemo(
    () =>
      dayAppointments
        .filter(matchesFilter)
        .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()),
    [dayAppointments, matchesFilter]
  );

  const dayBlocks = useMemo(() => blockedSlots.filter((block) => inRange(block.startsAt)), [blockedSlots, inRange]);
  const visibleBlocks = filter === 'Tous' || filter === 'Bloqué' ? dayBlocks : [];

  const leaveFor = (date: Date) => {
    const key = dateKey(date);
    return leaves.find((leave) => key >= leave.startDate && key <= leave.endDate);
  };
  const selectedLeave = leaveFor(selectedDate);

  const freedSlots = useMemo(() => {
    const now = Date.now();
    const active = appointments.filter((a) => a.status !== 'cancelled');
    const seen = new Set<string>();
    return appointments
      .filter((a) => a.status === 'cancelled' && inRange(a.starts_at) && new Date(a.starts_at).getTime() > now)
      .filter((a) => {
        const from = new Date(a.starts_at).getTime();
        const to = new Date(a.ends_at).getTime();
        const taken =
          active.some((x) => new Date(x.starts_at).getTime() < to && new Date(x.ends_at).getTime() > from) ||
          blockedSlots.some((b) => new Date(b.startsAt).getTime() < to && new Date(b.endsAt).getTime() > from);
        if (taken || seen.has(a.starts_at)) return false;
        seen.add(a.starts_at);
        return true;
      })
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  }, [appointments, blockedSlots, inRange]);

  const busyForSheet = useMemo(
    () =>
      appointments
        .filter((a) => a.status !== 'cancelled' && sameDay(new Date(a.starts_at), selectedDate))
        .map((a) => ({ startsAt: a.starts_at, endsAt: a.ends_at })),
    [appointments, selectedDate]
  );

  const openSheet = (start: number | null = null, duration: number | null = null) =>
    setSheet({ visible: true, start, duration });

  const confirmUnblock = (block: BlockedSlot) =>
    Alert.alert(
      'Débloquer ce créneau ?',
      `${formatTime(block.startsAt)} – ${formatTime(block.endsAt)}${block.reason ? ` · ${block.reason}` : ''}`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Débloquer',
          style: 'destructive',
          onPress: async () => {
            try {
              await DoctorsApi.deleteBlockedSlot(block.id);
              setBlockedSlots((list) => list.filter((b) => b.id !== block.id));
            } catch (e: any) {
              Alert.alert('Erreur', e?.response?.data?.error || 'Impossible de débloquer ce créneau.');
            }
          },
        },
      ]
    );

  const counts: Record<Filter, number> = {
    Tous: dayAppointments.length,
    Urgences: dayAppointments.filter((a) => isUrgent(a.reason)).length,
    Bloqué: dayBlocks.length,
  };

  const changeDate = (direction: number) => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + direction * VIEW_DAYS[viewMode]);
    setSelectedDate(next);
  };

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const currentLineTop = ((currentMinutes - 480) / 60) * HOUR_HEIGHT;
  const showCurrentTime = sameDay(now, selectedDate) && currentLineTop >= 0 && currentLineTop <= HOUR_HEIGHT * 10;

  if (loading) {
    return <Loader fullscreen label="Chargement de votre agenda..." />;
  }

  if (error) {
    return (
      <Screen safeTop>
        <ErrorState message={error} onRetry={loadAgenda} />
      </Screen>
    );
  }

  const fullName = `${doctor?.first_name ?? ''} ${doctor?.last_name ?? ''}`.trim();
  const multiDay = viewMode !== 'day';
  const lastDay = rangeDays[rangeDays.length - 1];
  const rangeTitle = multiDay
    ? `${selectedDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} – ${lastDay.toLocaleDateString(
        'fr-FR',
        { day: 'numeric', month: 'short' }
      )}`
    : selectedDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const stepLabel = viewMode === 'day' ? 'Jour' : viewMode === 'three' ? 'Période' : 'Semaine';

  return (
    <View style={s.page}>
      <Screen
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          loadAgenda();
        }}
        contentStyle={s.content}
        header={
          <AppHeader
            title="Agenda"
            subtitle={fullName ? doctorName(fullName) : 'Espace médecin'}
            right={
              <IconButton
                icon="gear"
                accessibilityLabel="Horaires et congés"
                onPress={() => navigation.navigate('AgendaSettings')}
              />
            }
          />
        }
      >
        <View style={s.dateNav}>
          <IconButton
            icon="chevron-left"
            accessibilityLabel={viewMode === 'day' ? 'Jour précédent' : `${stepLabel} précédente`}
            onPress={() => changeDate(-1)}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Revenir à aujourd'hui"
            onPress={() => setSelectedDate(new Date())}
            style={s.dateCenter}
          >
            <Text style={s.dateTitle}>{rangeTitle}</Text>
            <Text style={s.dateYear}>{lastDay.getFullYear()}</Text>
          </Pressable>
          <IconButton
            icon="chevron-right"
            accessibilityLabel={viewMode === 'day' ? 'Jour suivant' : `${stepLabel} suivante`}
            onPress={() => changeDate(1)}
          />
        </View>

        <SegmentedTabs<ViewMode>
          value={viewMode}
          onChange={setViewMode}
          tabs={[
            { key: 'day', label: 'Jour' },
            { key: 'three', label: '3 jours' },
            { key: 'week', label: 'Semaine' },
          ]}
        />

        <Card style={s.strip} padded={false}>
          {dates.map((date) => {
            const active = sameDay(date, selectedDate);
            const covered = !active && rangeDays.some((d) => sameDay(d, date));
            const hasAppointments = appointments.some(
              (a) => sameDay(new Date(a.starts_at), date) && a.status !== 'cancelled'
            );
            return (
              <Pressable
                key={dateKey(date)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setSelectedDate(date)}
                style={[s.day, covered && s.dayCovered, active && s.dayActive]}
              >
                <Text style={[s.dayName, active && s.onPrimary]}>
                  {date.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '')}
                </Text>
                <Text style={[s.dayNumber, active && s.onPrimary]}>{date.getDate()}</Text>
                <View
                  style={[s.dayDot, hasAppointments && s.dayDotOn, active && hasAppointments && s.dayDotActive]}
                />
              </Pressable>
            );
          })}
        </Card>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.filtersWrap}
          contentContainerStyle={s.filters}
        >
          {FILTERS.map((item) => (
            <Chip
              key={item}
              label={item === 'Tous' || counts[item] > 0 ? `${item} · ${counts[item]}` : item}
              selected={filter === item}
              onPress={() => setFilter(item)}
            />
          ))}
        </ScrollView>

        <SectionTitle title={multiDay ? 'Planning de la période' : 'Planning de la journée'} />
        <Text style={s.total}>
          {visibleAppointments.length} rendez-vous
          {visibleBlocks.length > 0 ? ` · ${visibleBlocks.length} créneau(x) bloqué(s)` : ''}
        </Text>

        {multiDay ? (
          rangeDays.map((date) => {
            const leave = leaveFor(date);
            const items = [
              ...visibleAppointments
                .filter((a) => sameDay(new Date(a.starts_at), date))
                .map((a) => ({ kind: 'appt' as const, at: a.starts_at, appt: a })),
              ...visibleBlocks
                .filter((b) => sameDay(new Date(b.startsAt), date))
                .map((b) => ({ kind: 'block' as const, at: b.startsAt, block: b })),
            ].sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime());
            const today = sameDay(date, new Date());

            return (
              <Card key={dateKey(date)} style={s.dayCard}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Voir la journée"
                  onPress={() => {
                    setSelectedDate(date);
                    setViewMode('day');
                  }}
                  style={s.dayCardHeader}
                >
                  <Text style={[s.dayCardTitle, today && { color: color.primary }]}>
                    {date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' })}
                  </Text>
                  <Text style={s.dayCardCount}>
                    {leave ? 'Absent' : `${items.filter((i) => i.kind === 'appt').length} rdv`}
                  </Text>
                </Pressable>
                {leave ? (
                  <Text style={s.dayCardEmpty}>{leave.reason || 'Jour d’absence'}</Text>
                ) : items.length === 0 ? (
                  <Text style={s.dayCardEmpty}>Aucun rendez-vous</Text>
                ) : (
                  items.map((item) =>
                    item.kind === 'appt' ? (
                      <Pressable
                        key={`a-${item.appt.id}`}
                        accessibilityRole="button"
                        accessibilityLabel={`Ouvrir la fiche de ${patientName(item.appt)}`}
                        onPress={() => navigation.navigate('AppointmentDetail', { appointmentId: item.appt.id })}
                        style={({ pressed }) => [s.compactRow, pressed && s.pressed]}
                      >
                        <View style={[s.compactBar, { backgroundColor: blockTone(item.appt).bar }]} />
                        <Text style={s.compactTime}>{formatTime(item.appt.starts_at)}</Text>
                        <Text style={s.compactName} numberOfLines={1}>
                          {patientName(item.appt)}
                        </Text>
                        <KindTag kind={appointmentKind(item.appt.reason)} />
                      </Pressable>
                    ) : (
                      <Pressable
                        key={`b-${item.block.id}`}
                        accessibilityRole="button"
                        accessibilityLabel="Débloquer ce créneau"
                        onPress={() => confirmUnblock(item.block)}
                        style={({ pressed }) => [s.compactRow, pressed && s.pressed]}
                      >
                        <View style={[s.compactBar, { backgroundColor: color.textMuted }]} />
                        <Text style={s.compactTime}>{formatTime(item.block.startsAt)}</Text>
                        <Text style={[s.compactName, { color: color.textSecondary }]} numberOfLines={1}>
                          Bloqué{item.block.reason ? ` · ${item.block.reason}` : ''}
                        </Text>
                      </Pressable>
                    )
                  )
                )}
              </Card>
            );
          })
        ) : selectedLeave ? (
          <Notice
            tone="danger"
            icon="plane"
            title="Jour d'absence"
            message={selectedLeave.reason || 'Vous êtes absent ce jour.'}
          />
        ) : (
          <Card style={s.timeline} padded={false}>
            {HOURS.map((hour) => {
              const hourAppointments = visibleAppointments.filter((a) => new Date(a.starts_at).getHours() === hour);
              const hourBlocks = visibleBlocks.filter((b) => new Date(b.startsAt).getHours() === hour);

              return (
                <View key={hour} style={s.hourRow}>
                  <Text style={s.hourText}>{String(hour).padStart(2, '0')}:00</Text>
                  <View style={s.hourContent}>
                    <View style={s.hourLine} />
                    {hourAppointments.map((a) => {
                      const tone = blockTone(a);
                      return (
                        <Pressable
                          key={a.id}
                          accessibilityRole="button"
                          accessibilityLabel={`Ouvrir la fiche de ${patientName(a)}`}
                          onPress={() => navigation.navigate('AppointmentDetail', { appointmentId: a.id })}
                          style={({ pressed }) => [
                            s.event,
                            { backgroundColor: tone.bg, borderLeftColor: tone.bar },
                            pressed && s.pressed,
                          ]}
                        >
                          <View style={s.eventTop}>
                            <Text style={[s.eventTitle, { color: tone.ink }]} numberOfLines={1}>
                              {patientName(a)}
                            </Text>
                            <Text style={s.eventTime}>
                              {formatTime(a.starts_at)} – {formatTime(a.ends_at)}
                            </Text>
                          </View>
                          <Text style={s.eventReason} numberOfLines={1}>
                            {a.reason || 'Consultation médicale'}
                          </Text>
                          <View style={s.eventBottom}>
                            <Text style={[s.eventStatus, { color: tone.ink }]}>
                              {(statusTokens[a.status] ?? statusTokens.confirmed).label}
                            </Text>
                            <KindTag kind={appointmentKind(a.reason)} />
                          </View>
                        </Pressable>
                      );
                    })}
                    {hourBlocks.map((block) => (
                      <Pressable
                        key={`block-${block.id}`}
                        accessibilityRole="button"
                        accessibilityLabel="Débloquer ce créneau"
                        onPress={() => confirmUnblock(block)}
                        style={({ pressed }) => [s.event, s.blocked, pressed && s.pressed]}
                      >
                        <View style={s.eventTop}>
                          <Text style={[s.eventTitle, { color: color.textSecondary }]}>Créneau bloqué</Text>
                          <Text style={s.eventTime}>
                            {formatTime(block.startsAt)} – {formatTime(block.endsAt)}
                          </Text>
                        </View>
                        <Text style={s.eventReason}>{block.reason || 'Indisponible'}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              );
            })}

            {showCurrentTime ? (
              <View pointerEvents="none" style={[s.nowLine, { top: currentLineTop + 18 }]}>
                <View style={s.nowDot} />
                <View style={s.nowBar} />
              </View>
            ) : null}
          </Card>
        )}

        {filter === 'Tous'
          ? freedSlots.map((a) => (
              <Notice
                key={`freed-${a.id}`}
                tone="warning"
                icon="circle-exclamation"
                title={`Créneau libéré · ${multiDay ? `${new Date(a.starts_at).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })} ` : ''}${formatTime(a.starts_at)} – ${formatTime(a.ends_at)}`}
                message={`${patientName(a)} a annulé. Le créneau est de nouveau réservable par les patients.`}
              >
                <View style={s.freedActions}>
                  <Button
                    title="Bloquer"
                    icon="lock"
                    size="sm"
                    variant="secondary"
                    fullWidth={false}
                    onPress={() => {
                      setSelectedDate(new Date(a.starts_at));
                      openSheet(
                        minutesOf(a.starts_at),
                        Math.round((new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()) / 60000)
                      );
                    }}
                  />
                </View>
              </Notice>
            ))
          : null}
      </Screen>

      <View style={s.fab} pointerEvents="box-none">
        <Button
          title="Nouveau créneau"
          icon="plus"
          fullWidth={false}
          style={s.fabButton}
          onPress={() => openSheet()}
        />
      </View>

      <BlockSlotSheet
        visible={sheet.visible}
        date={selectedDate}
        initialStart={sheet.start}
        initialDuration={sheet.duration}
        busy={busyForSheet}
        onClose={() => setSheet((x) => ({ ...x, visible: false }))}
        onCreated={() => {
          setSheet((x) => ({ ...x, visible: false }));
          loadAgenda();
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.page },
  content: { paddingBottom: 96 },
  dateNav: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  dateCenter: { flex: 1, alignItems: 'center' },
  dateTitle: { ...type.h3, fontFamily: fonts.semibold, textTransform: 'capitalize' },
  dateYear: { ...type.caption, color: color.textMuted },
  strip: { flexDirection: 'row', padding: space.xxs },
  day: { flex: 1, alignItems: 'center', paddingVertical: space.xs, borderRadius: radius.md, gap: 2 },
  dayActive: { backgroundColor: color.primary },
  dayCovered: { backgroundColor: color.primarySoft },
  dayCard: { gap: space.xs },
  dayCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayCardTitle: { ...type.bodyMedium, fontFamily: fonts.semibold, textTransform: 'capitalize' },
  dayCardCount: { ...type.caption, color: color.textMuted },
  dayCardEmpty: { ...type.caption, color: color.textMuted },
  compactRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingVertical: space.xxs },
  compactBar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  compactTime: { ...type.caption, color: color.textSecondary, width: 40 },
  compactName: { ...type.bodyMedium, flex: 1 },
  freedActions: { flexDirection: 'row', marginTop: space.xs },
  dayName: { ...type.caption, color: color.textMuted, textTransform: 'capitalize' },
  dayNumber: { ...type.h3, fontFamily: fonts.semibold },
  dayDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'transparent' },
  dayDotOn: { backgroundColor: color.primary },
  dayDotActive: { backgroundColor: color.onPrimary },
  onPrimary: { color: color.onPrimary },
  filtersWrap: { marginHorizontal: -space.md },
  filters: { gap: space.xs, paddingHorizontal: space.md },
  total: { ...type.caption, color: color.textMuted, marginTop: -space.xs },
  timeline: { position: 'relative', paddingHorizontal: space.sm, paddingVertical: space.xxs },
  hourRow: { flexDirection: 'row', minHeight: HOUR_HEIGHT },
  hourText: { ...type.caption, color: color.textMuted, width: 48, paddingTop: space.xs },
  hourContent: { flex: 1, paddingVertical: space.xxs },
  hourLine: {
    position: 'absolute',
    top: 13,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.border,
  },
  event: {
    borderLeftWidth: 4,
    borderRadius: radius.sm,
    padding: space.xs,
    marginTop: space.sm,
    gap: 2,
  },
  blocked: { backgroundColor: color.primarySubtle, borderLeftColor: color.textMuted },
  pressed: { opacity: 0.85 },
  eventTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.xxs },
  eventTitle: { ...type.bodyMedium, flex: 1 },
  eventTime: { ...type.caption, color: color.textSecondary },
  eventReason: { ...type.caption, color: color.textSecondary },
  eventBottom: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: 2 },
  eventStatus: { ...type.label },
  nowLine: { position: 'absolute', left: 58, right: space.sm, flexDirection: 'row', alignItems: 'center', zIndex: 5 },
  nowDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: color.danger },
  nowBar: { flex: 1, height: 2, backgroundColor: color.danger },
  fab: { position: 'absolute', right: space.md, bottom: space.md },
  fabButton: { borderRadius: radius.full, paddingHorizontal: space.lg, ...shadow.raised },
});
