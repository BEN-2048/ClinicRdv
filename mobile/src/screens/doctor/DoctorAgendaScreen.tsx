
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { DoctorsApi } from '../../api/services';

type Appointment = {
  id: number;
  starts_at: string;
  ends_at: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'done';
  reason: string | null;
  patient_id: number;
  patient_first_name: string;
  patient_last_name: string;
};

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

type ViewMode = 'Jour' | '3 jours' | 'Semaine';

type Filter =
  | 'Tous'
  | 'Présentiel'
  | 'Téléconsultation'
  | 'Urgences'
  | 'Bloqué';

const BLUE = '#2563EB';
const NAVY = '#0B1C30';
const BACKGROUND = '#F8F9FF';
const LIGHT_BLUE = '#EFF4FF';

const HOURS = Array.from({ length: 11 }, (_, i) => i + 8);

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const dateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });

const isUrgent = (reason: string | null) =>
  /urgence|urgent/i.test(reason || '');

const isTeleconsultation = (reason: string | null) =>
  /téléconsultation|teleconsultation|visio|vidéo|video/i.test(reason || '');

const getAppointmentColor = (appointment: Appointment) => {
  if (isUrgent(appointment.reason)) {
    return {
      background: '#FFF0EC',
      border: '#F97316',
      text: '#9A3412',
    };
  }

  if (isTeleconsultation(appointment.reason)) {
    return {
      background: '#E0F7F4',
      border: '#0D9488',
      text: '#006A61',
    };
  }

  if (appointment.status === 'done') {
    return {
      background: '#EAF2FF',
      border: '#60A5FA',
      text: '#1D4ED8',
    };
  }

  if (appointment.status === 'pending') {
    return {
      background: '#FFF7E8',
      border: '#F59E0B',
      text: '#92400E',
    };
  }

  return {
    background: '#EFF4FF',
    border: BLUE,
    text: '#1D4ED8',
  };
};

const statusLabel = (status: Appointment['status']) => {
  switch (status) {
    case 'done':
      return 'Terminé';
    case 'pending':
      return 'En attente';
    case 'confirmed':
      return 'Confirmé';
    case 'cancelled':
      return 'Annulé';
  }
};

export default function DoctorAgendaScreen() {
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('Jour');
  const [filter, setFilter] = useState<Filter>('Tous');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadAgenda = useCallback(async () => {
    try {
      setError('');

      const [dashboardResponse, blocksResponse, leavesResponse] =
        await Promise.all([
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

      setError(
        e?.response?.data?.error ||
          'Impossible de charger votre agenda.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAgenda();
  }, [loadAgenda]);

  const onRefresh = () => {
    setRefreshing(true);
    loadAgenda();
  };

  const dates = useMemo(() => {
    const start = new Date(selectedDate);
    start.setDate(start.getDate() - 3);

    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [selectedDate]);

  const visibleAppointments = useMemo(() => {
    return appointments
      .filter((appointment) => {
        const date = new Date(appointment.starts_at);

        if (!sameDay(date, selectedDate)) return false;
        if (appointment.status === 'cancelled') return false;

        if (filter === 'Urgences') {
          return isUrgent(appointment.reason);
        }

        if (filter === 'Téléconsultation') {
          return isTeleconsultation(appointment.reason);
        }

        if (filter === 'Présentiel') {
          return (
            !isTeleconsultation(appointment.reason) &&
            !isUrgent(appointment.reason)
          );
        }

        return filter === 'Tous';
      })
      .sort(
        (a, b) =>
          new Date(a.starts_at).getTime() -
          new Date(b.starts_at).getTime()
      );
  }, [appointments, selectedDate, filter]);

  const visibleBlocks = useMemo(() => {
    if (filter !== 'Tous' && filter !== 'Bloqué') return [];

    return blockedSlots.filter((block) =>
      sameDay(new Date(block.startsAt), selectedDate)
    );
  }, [blockedSlots, selectedDate, filter]);

  const selectedLeave = leaves.find((leave) => {
    const key = dateKey(selectedDate);
    return key >= leave.startDate && key <= leave.endDate;
  });

  const counts = {
    Tous: appointments.filter(
      (a) =>
        sameDay(new Date(a.starts_at), selectedDate) &&
        a.status !== 'cancelled'
    ).length,
    Présentiel: appointments.filter(
      (a) =>
        sameDay(new Date(a.starts_at), selectedDate) &&
        a.status !== 'cancelled' &&
        !isTeleconsultation(a.reason) &&
        !isUrgent(a.reason)
    ).length,
    Téléconsultation: appointments.filter(
      (a) =>
        sameDay(new Date(a.starts_at), selectedDate) &&
        a.status !== 'cancelled' &&
        isTeleconsultation(a.reason)
    ).length,
    Urgences: appointments.filter(
      (a) =>
        sameDay(new Date(a.starts_at), selectedDate) &&
        a.status !== 'cancelled' &&
        isUrgent(a.reason)
    ).length,
    Bloqué: visibleBlocks.length,
  };

  const changeDate = (amount: number) => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + amount);
    setSelectedDate(next);
  };

  const dateTitle = selectedDate.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const now = new Date();
  const showCurrentTime = sameDay(now, selectedDate);

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const currentLineTop = ((currentMinutes - 480) / 60) * 76;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={BLUE} />
        <Text style={styles.loadingText}>Chargement de votre agenda...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Agenda indisponible</Text>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.retryButton} onPress={loadAgenda}>
          <Text style={styles.retryText}>Réessayer</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={BLUE}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* En-tête médecin */}
        <View style={styles.topHeader}>
          <View>
            <Text style={styles.smallHeading}>Espace Médecin</Text>
            <Text style={styles.title}>Agenda</Text>
          </View>

          <View style={styles.headerRight}>
            <View style={styles.notification}>
              <Text style={styles.notificationIcon}>♧</Text>
              <View style={styles.notificationDot} />
            </View>

            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {doctor?.first_name?.charAt(0)}
                {doctor?.last_name?.charAt(0)}
              </Text>
            </View>
          </View>
        </View>

        {/* Identité et date */}
        <View style={styles.dateHeader}>
          <View style={styles.doctorPill}>
            <Text style={styles.doctorPillText}>
              Dr. {doctor?.first_name} {doctor?.last_name}
            </Text>
          </View>

          <View style={styles.dateNavigation}>
            <Pressable
              style={styles.arrowButton}
              onPress={() => changeDate(-1)}
            >
              <Text style={styles.arrowText}>‹</Text>
            </Pressable>

            <View style={styles.datePill}>
              <Text style={styles.calendarIcon}>▦</Text>
              <Text style={styles.datePillText}>
                {selectedDate.toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                })}
              </Text>
            </View>

            <Pressable
              style={styles.arrowButton}
              onPress={() => changeDate(1)}
            >
              <Text style={styles.arrowText}>›</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.fullDate}>{dateTitle}</Text>

        {/* Modes d'affichage */}
        <View style={styles.viewSelector}>
          {(['Jour', '3 jours', 'Semaine'] as ViewMode[]).map((mode) => (
            <Pressable
              key={mode}
              onPress={() => setViewMode(mode)}
              style={[
                styles.viewOption,
                viewMode === mode && styles.viewOptionActive,
              ]}
            >
              <Text
                style={[
                  styles.viewOptionText,
                  viewMode === mode && styles.viewOptionTextActive,
                ]}
              >
                {mode}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Calendrier horizontal */}
        <View style={styles.weekStrip}>
          {dates.map((date) => {
            const active = sameDay(date, selectedDate);

            const hasAppointments = appointments.some(
              (appointment) =>
                sameDay(new Date(appointment.starts_at), date) &&
                appointment.status !== 'cancelled'
            );

            return (
              <Pressable
                key={dateKey(date)}
                onPress={() => setSelectedDate(date)}
                style={[
                  styles.dayItem,
                  active && styles.dayItemActive,
                ]}
              >
                <Text
                  style={[
                    styles.dayName,
                    active && styles.dayNameActive,
                  ]}
                >
                  {date.toLocaleDateString('fr-FR', {
                    weekday: 'short',
                  }).replace('.', '')}
                </Text>

                <Text
                  style={[
                    styles.dayNumber,
                    active && styles.dayNumberActive,
                  ]}
                >
                  {date.getDate()}
                </Text>

                <View
                  style={[
                    styles.dayDot,
                    hasAppointments && styles.dayDotVisible,
                    active && styles.dayDotActive,
                  ]}
                />
              </Pressable>
            );
          })}
        </View>

        {/* Filtres */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {(
            [
              'Tous',
              'Présentiel',
              'Téléconsultation',
              'Urgences',
              'Bloqué',
            ] as Filter[]
          ).map((item) => (
            <Pressable
              key={item}
              onPress={() => setFilter(item)}
              style={[
                styles.filterChip,
                filter === item && styles.filterChipActive,
              ]}
            >
              <Text
                style={[
                  styles.filterText,
                  filter === item && styles.filterTextActive,
                ]}
              >
                {item}
              </Text>

              {item === 'Tous' || counts[item] > 0 ? (
                <Text
                  style={[
                    styles.filterCount,
                    filter === item && styles.filterCountActive,
                  ]}
                >
                  {counts[item]}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </ScrollView>

        {/* Planning */}
        <View style={styles.timelineHeader}>
          <Text style={styles.timelineTitle}>Planning de la journée</Text>
          <Text style={styles.appointmentTotal}>
            {visibleAppointments.length} rendez-vous
          </Text>
        </View>

        {selectedLeave ? (
          <View style={styles.leaveBanner}>
            <Text style={styles.leaveTitle}>Jour d'absence</Text>
            <Text style={styles.leaveDescription}>
              {selectedLeave.reason || 'Vous êtes absent ce jour.'}
            </Text>
          </View>
        ) : (
          <View style={styles.timeline}>
            {HOURS.map((hour) => {
              const hourAppointments = visibleAppointments.filter((a) => {
                const start = new Date(a.starts_at);
                return start.getHours() === hour;
              });

              const hourBlocks = visibleBlocks.filter((block) => {
                return new Date(block.startsAt).getHours() === hour;
              });

              return (
                <View key={hour} style={styles.hourRow}>
                  <View style={styles.hourLabel}>
                    <Text style={styles.hourText}>
                      {String(hour).padStart(2, '0')}:00
                    </Text>
                  </View>

                  <View style={styles.hourContent}>
                    <View style={styles.hourLine} />

                    {hourAppointments.map((appointment) => {
                      const colors = getAppointmentColor(appointment);

                      return (
                        <View
                          key={appointment.id}
                          style={[
                            styles.appointmentBlock,
                            {
                              backgroundColor: colors.background,
                              borderLeftColor: colors.border,
                            },
                          ]}
                        >
                          <View style={styles.appointmentTop}>
                            <Text
                              style={[
                                styles.appointmentPatient,
                                { color: colors.text },
                              ]}
                              numberOfLines={1}
                            >
                              {appointment.patient_first_name}{' '}
                              {appointment.patient_last_name}
                            </Text>

                            <Text style={styles.appointmentTime}>
                              {formatTime(appointment.starts_at)}
                              {' - '}
                              {formatTime(appointment.ends_at)}
                            </Text>
                          </View>

                          <Text
                            style={styles.appointmentReason}
                            numberOfLines={1}
                          >
                            {appointment.reason ||
                              'Consultation médicale'}
                          </Text>

                          <View style={styles.appointmentBottom}>
                            <Text
                              style={[
                                styles.statusText,
                                { color: colors.text },
                              ]}
                            >
                              {statusLabel(appointment.status)}
                            </Text>

                            {isUrgent(appointment.reason) ? (
                              <Text style={styles.urgentLabel}>
                                URGENCE
                              </Text>
                            ) : null}

                            {isTeleconsultation(appointment.reason) ? (
                              <Text style={styles.teleLabel}>
                                VISIO
                              </Text>
                            ) : null}
                          </View>
                        </View>
                      );
                    })}

                    {hourBlocks.map((block) => (
                      <View key={`block-${block.id}`} style={styles.blockCard}>
                        <Text style={styles.blockTitle}>
                          Créneau bloqué
                        </Text>
                        <Text style={styles.blockDescription}>
                          {block.reason || 'Indisponible'}
                        </Text>
                        <Text style={styles.blockTime}>
                          {formatTime(block.startsAt)} -{' '}
                          {formatTime(block.endsAt)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}

            {showCurrentTime &&
              currentLineTop >= 0 &&
              currentLineTop <= 760 && (
                <View
                  pointerEvents="none"
                  style={[
                    styles.currentTimeLine,
                    { top: currentLineTop + 18 },
                  ]}
                >
                  <View style={styles.currentTimeDot} />
                  <View style={styles.currentTimeBar} />
                </View>
              )}
          </View>
        )}

        {/* Créneau libéré */}
        {filter === 'Tous' && (
          <View style={styles.releasedCard}>
            <View style={styles.releasedIcon}>
              <Text style={styles.releasedIconText}>!</Text>
            </View>

            <View style={styles.releasedInfo}>
              <Text style={styles.releasedTitle}>
                Créneau libéré
              </Text>
              <Text style={styles.releasedDescription}>
                Consultez les disponibilités pour attribuer un nouveau
                rendez-vous.
              </Text>
            </View>
          </View>
        )}

        <View style={styles.bottomSpace} />
      </ScrollView>

      {/* Nouveau créneau */}
      <Pressable
        style={styles.newSlotButton}
        onPress={() =>
          Alert.alert(
            'Nouveau créneau',
            'La création de rendez-vous et de créneaux sera connectée à la prochaine étape.'
          )
        }
      >
        <Text style={styles.newSlotText}>＋ Nouveau créneau</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BACKGROUND,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 100,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BACKGROUND,
    padding: 25,
  },
  loadingText: {
    marginTop: 12,
    color: '#64748B',
  },
  errorTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: NAVY,
  },
  errorText: {
    marginTop: 10,
    textAlign: 'center',
    color: '#64748B',
  },
  retryButton: {
    marginTop: 18,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: BLUE,
  },
  retryText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  smallHeading: {
    fontSize: 12,
    color: '#64748B',
  },
  title: {
    fontSize: 25,
    fontWeight: '700',
    color: NAVY,
    marginTop: 3,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  notification: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationIcon: {
    fontSize: 21,
    color: NAVY,
  },
  notificationDot: {
    position: 'absolute',
    right: 7,
    top: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: BLUE,
    fontWeight: '700',
  },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  doctorPill: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 20,
  },
  doctorPillText: {
    color: NAVY,
    fontWeight: '600',
    fontSize: 12,
  },
  dateNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  arrowButton: {
    width: 29,
    height: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrowText: {
    color: BLUE,
    fontSize: 25,
  },
  datePill: {
    backgroundColor: LIGHT_BLUE,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 20,
    gap: 6,
  },
  calendarIcon: {
    color: BLUE,
    fontSize: 14,
  },
  datePillText: {
    color: BLUE,
    fontSize: 12,
    fontWeight: '600',
  },
  fullDate: {
    color: '#64748B',
    fontSize: 12,
    textTransform: 'capitalize',
    marginTop: 9,
    marginBottom: 15,
  },
  viewSelector: {
    flexDirection: 'row',
    backgroundColor: '#E5EEFF',
    borderRadius: 13,
    padding: 4,
    marginBottom: 15,
  },
  viewOption: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  viewOptionActive: {
    backgroundColor: '#FFFFFF',
    elevation: 2,
  },
  viewOptionText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  viewOptionTextActive: {
    color: BLUE,
  },
  weekStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 5,
    marginBottom: 17,
  },
  dayItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 12,
  },
  dayItemActive: {
    backgroundColor: BLUE,
  },
  dayName: {
    color: '#94A3B8',
    fontSize: 10,
    textTransform: 'capitalize',
  },
  dayNameActive: {
    color: '#DBEAFE',
  },
  dayNumber: {
    color: NAVY,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 7,
  },
  dayNumberActive: {
    color: '#FFFFFF',
  },
  dayDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 6,
  },
  dayDotVisible: {
    backgroundColor: '#0D9488',
  },
  dayDotActive: {
    backgroundColor: '#FFFFFF',
  },
  filters: {
    gap: 8,
    paddingBottom: 17,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  filterChipActive: {
    backgroundColor: BLUE,
  },
  filterText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  filterTextActive: {
    color: '#FFFFFF',
  },
  filterCount: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
  },
  filterCountActive: {
    color: '#FFFFFF',
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  timelineTitle: {
    color: NAVY,
    fontSize: 16,
    fontWeight: '700',
  },
  appointmentTotal: {
    color: '#64748B',
    fontSize: 11,
  },
  timeline: {
    position: 'relative',
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    paddingHorizontal: 10,
    paddingTop: 5,
    paddingBottom: 5,
  },
  hourRow: {
    flexDirection: 'row',
    minHeight: 76,
  },
  hourLabel: {
    width: 48,
    paddingTop: 8,
  },
  hourText: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '500',
  },
  hourContent: {
    flex: 1,
    paddingTop: 5,
    paddingBottom: 5,
  },
  hourLine: {
    position: 'absolute',
    top: 13,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#E8EDF5',
  },
  appointmentBlock: {
    borderLeftWidth: 4,
    borderRadius: 9,
    padding: 9,
    marginTop: 10,
    marginBottom: 3,
  },
  appointmentTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 5,
  },
  appointmentPatient: {
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  appointmentTime: {
    fontSize: 9,
    color: '#64748B',
  },
  appointmentReason: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 5,
  },
  appointmentBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 5,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  urgentLabel: {
    color: '#C2410C',
    fontSize: 9,
    fontWeight: '700',
  },
  teleLabel: {
    color: '#0D9488',
    fontSize: 9,
    fontWeight: '700',
  },
  blockCard: {
    backgroundColor: '#E9EDF5',
    borderLeftWidth: 4,
    borderLeftColor: '#64748B',
    borderRadius: 9,
    padding: 9,
    marginTop: 10,
  },
  blockTitle: {
    color: NAVY,
    fontWeight: '700',
    fontSize: 12,
  },
  blockDescription: {
    color: '#64748B',
    fontSize: 10,
    marginTop: 4,
  },
  blockTime: {
    color: '#64748B',
    fontSize: 10,
    marginTop: 4,
  },
  currentTimeLine: {
    position: 'absolute',
    left: 58,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 5,
  },
  currentTimeDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#EF4444',
  },
  currentTimeBar: {
    flex: 1,
    height: 2,
    backgroundColor: '#EF4444',
  },
  leaveBanner: {
    backgroundColor: '#FFF1F2',
    borderRadius: 13,
    padding: 17,
  },
  leaveTitle: {
    color: '#BE123C',
    fontWeight: '700',
  },
  leaveDescription: {
    color: '#9F1239',
    marginTop: 6,
    fontSize: 12,
  },
  releasedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    borderRadius: 13,
    padding: 13,
    marginTop: 18,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  releasedIcon: {
    width: 29,
    height: 29,
    borderRadius: 15,
    backgroundColor: '#FFEDD5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  releasedIconText: {
    color: '#C2410C',
    fontWeight: '700',
  },
  releasedInfo: {
    flex: 1,
    marginLeft: 10,
  },
  releasedTitle: {
    color: '#9A3412',
    fontWeight: '700',
    fontSize: 12,
  },
  releasedDescription: {
    color: '#9A3412',
    fontSize: 10,
    marginTop: 3,
  },
  newSlotButton: {
    position: 'absolute',
    right: 17,
    bottom: 15,
    backgroundColor: BLUE,
    borderRadius: 25,
    paddingHorizontal: 19,
    paddingVertical: 14,
    elevation: 5,
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
  },
  newSlotText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  bottomSpace: {
    height: 30,
  },
});
