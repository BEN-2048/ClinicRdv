import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';

import {
  DoctorsApi,
  WaitingListApi,
  WaitingMinNotice,
  WaitingPreferences,
  WaitingTimeSlot,
} from '../../api/services';
import { useAuth } from '../../context/AuthContext';
import Icon, { IconName } from '../../components/ui/Icon';
import {
  CLINIC_TIME_ZONE,
  InitialsAvatar,
  doctorDisplayName,
  ordinalSuffix,
} from '../../components/PatientFigmaUI';
import { fonts, palette, shadow, type } from '../../theme/figma';
type Doctor = {
  id: number;
  first_name: string;
  last_name: string;
  specialty: string;
  active: boolean;
};

type Slot = { startsAt: string; available: boolean };

const TIME_SLOTS: { key: WaitingTimeSlot; label: string }[] = [
  { key: 'all_day', label: 'Toute la journée' },
  { key: 'morning', label: 'Matinée (08h-12h)' },
  { key: 'afternoon', label: 'Après-midi (14h-18h)' },
  { key: 'evening', label: 'Fin de journée (>17h)' },
];

const WEEKDAYS = [
  { value: 1, label: 'LUN' },
  { value: 2, label: 'MAR' },
  { value: 3, label: 'MER' },
  { value: 4, label: 'JEU' },
  { value: 5, label: 'VEN' },
];

const NOTICES: { key: WaitingMinNotice; label: string }[] = [
  { key: '2h', label: 'Au moins 2h avant' },
  { key: '24h', label: 'Au moins 24h avant' },
  { key: 'any', label: 'Même à la dernière minute (< 2h)' },
];

const DEFAULT_PREFS: WaitingPreferences = {
  timeSlots: ['all_day'],
  weekdays: [1, 2, 3, 4, 5],
  minNotice: '24h',
  notifyPush: true,
  notifySms: true,
};

const LOOKAHEAD_DAYS = 14;

const clinicDate = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);

const nextDayOfMonth = (weekday: number) => {
  const d = new Date();
  const diff = (weekday - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  return d.getDate();
};

const maskPhone = (phone?: string | null) => {
  const digits = (phone || '').replace(/\s+/g, '');
  if (digits.length < 6) return null;
  const prefix = digits.startsWith('+') ? digits.slice(0, 4) : digits.slice(0, 2);
  return `${prefix} •• •• •• ${digits.slice(-2)}`;
};

const apiError = (e: any, fallback: string) =>
  e?.response?.data?.details?.[0]?.message || e?.response?.data?.error || fallback;

export default function WaitingListScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const doctorId = Number(route.params?.doctorId);

  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [prefs, setPrefs] = useState<WaitingPreferences>(DEFAULT_PREFS);
  const [isActive, setIsActive] = useState(false);
  const [queue, setQueue] = useState({ position: 1, total: 1 });
  const [noSlotSoon, setNoSlotSoon] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maskedPhone = maskPhone(user?.phone);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!Number.isInteger(doctorId) || doctorId <= 0) {
        throw new Error('Identifiant du médecin invalide.');
      }
      const [doctorRes, stateRes] = await Promise.all([
        DoctorsApi.get(doctorId),
        WaitingListApi.forDoctor(doctorId),
      ]);
      setDoctor(doctorRes.data as Doctor);
      const saved = stateRes.data.preferences ?? stateRes.data.alert;
      if (saved) {
        setPrefs({
          timeSlots: saved.timeSlots,
          weekdays: saved.weekdays,
          minNotice: saved.minNotice,
          notifyPush: saved.notifyPush,
          notifySms: saved.notifySms,
        });
      }
      setIsActive(Boolean(stateRes.data.alert));
      setQueue({ position: stateRes.data.position, total: stateRes.data.total });
    } catch (e: any) {
      setError(apiError(e, e?.message || 'Impossible de charger la liste d’attente.'));
    } finally {
      setLoading(false);
    }
  }, [doctorId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!doctor) return;
    let alive = true;
    const days = Array.from({ length: LOOKAHEAD_DAYS }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      return clinicDate(d);
    });
    Promise.all(days.map((day) => DoctorsApi.slots(doctor.id, day).then((r) => r.data as Slot[])))
      .then((all) => {
        if (alive) setNoSlotSoon(!all.some((slots) => slots.some((s) => s.available)));
      })
      .catch(() => {
        if (alive) setNoSlotSoon(null);
      });
    return () => {
      alive = false;
    };
  }, [doctor]);

  useEffect(() => {
    if (!maskedPhone && prefs.notifySms) {
      setPrefs((p) => ({ ...p, notifySms: false }));
    }
  }, [maskedPhone, prefs.notifySms]);

  const toggleTimeSlot = (key: WaitingTimeSlot) => {
    setPrefs((p) => {
      if (key === 'all_day') return { ...p, timeSlots: ['all_day'] };
      const rest = p.timeSlots.filter((k) => k !== 'all_day');
      const next = rest.includes(key) ? rest.filter((k) => k !== key) : [...rest, key];
      return { ...p, timeSlots: next.length ? next : ['all_day'] };
    });
  };

  const toggleWeekday = (value: number) => {
    setPrefs((p) => {
      const next = p.weekdays.includes(value)
        ? p.weekdays.filter((d) => d !== value)
        : [...p.weekdays, value].sort();
      return { ...p, weekdays: next };
    });
  };

  const submit = async () => {
    if (!doctor) return;
    if (prefs.weekdays.length === 0) {
      Alert.alert('Jours possibles', 'Choisissez au moins un jour de consultation.');
      return;
    }
    if (!prefs.notifyPush && !prefs.notifySms) {
      Alert.alert('Canaux de notification', 'Activez au moins un canal de notification.');
      return;
    }
    setSaving(true);
    try {
      const { data } = await WaitingListApi.save(doctor.id, prefs);
      setIsActive(true);
      setQueue({ position: data.position, total: data.total });
      Alert.alert(
        isActive ? 'Alerte mise à jour' : 'Alerte activée',
        `Vous êtes ${data.position}${ordinalSuffix(data.position)} dans la file d’attente de ${doctorDisplayName(`${doctor.first_name} ${doctor.last_name}`)}.`,
      );
    } catch (e) {
      Alert.alert('Enregistrement impossible', apiError(e, 'Erreur réseau, réessayez.'));
    } finally {
      setSaving(false);
    }
  };

  const deactivate = () => {
    if (!doctor) return;
    Alert.alert('Désactiver l’alerte', 'Vous ne serez plus prévenu des désistements pour ce praticien.', [
      { text: 'Retour', style: 'cancel' },
      {
        text: 'Désactiver',
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            await WaitingListApi.remove(doctor.id);
            await load();
          } catch (e) {
            Alert.alert('Action impossible', apiError(e, 'Erreur réseau, réessayez.'));
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const progress = useMemo(
    () => (queue.total > 0 ? Math.max(0, Math.min(1, (queue.total - queue.position + 1) / queue.total)) : 0),
    [queue],
  );

  if (loading) {
    return (
      <View style={[styles.page, styles.center]}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  if (error || !doctor) {
    return (
      <View style={[styles.page, styles.center, { padding: 24 }]}>
        <Text style={[type.body, { textAlign: 'center', marginBottom: 16 }]}>{error || 'Médecin introuvable.'}</Text>
        <Pressable style={styles.secondaryButton} onPress={() => navigation.goBack()}>
          <Text style={styles.secondaryButtonText}>Retour</Text>
        </Pressable>
      </View>
    );
  }

  const name = doctorDisplayName(`${doctor.first_name} ${doctor.last_name}`);

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
      <View style={styles.section}>
        <View style={[styles.card, shadow.soft]}>
          <View style={styles.row}>
            <InitialsAvatar name={name} dotColor={palette.amberAccent} />
            <View style={styles.doctorInfo}>
              <Text style={type.h2} numberOfLines={1}>{name}</Text>
              <Text style={[type.body, { color: palette.inkSoft }]}>{doctor.specialty}</Text>
            </View>
          </View>
          {noSlotSoon ? (
            <View style={styles.badgeWrap}>
              <View style={styles.amberBadge}>
                <Icon name="calendar-days" size={14} color={palette.amberDot} />
                <Text style={styles.amberBadgeText}>Aucun créneau libre sous {LOOKAHEAD_DAYS} jours</Text>
              </View>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.infoCard}>
          <View style={[styles.infoIcon, shadow.soft]}>
            <Icon name="bell" solid size={18} color={palette.white} />
          </View>
          <View style={styles.flexText}>
            <Text style={type.h3}>Soyez le premier prévenu</Text>
            <Text style={styles.infoText}>
              Les créneaux libérés par désistement sont réservés en exclusivité temporaire aux patients inscrits sur liste d’attente intelligente.
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <View style={[styles.card, shadow.soft]}>
          <Text style={type.h2}>Plages horaires souhaitées</Text>
          <Text style={[type.label, styles.hint]}>Sélectionnez vos disponibilités types</Text>
          <View style={styles.chips}>
            {TIME_SLOTS.map((slot) => {
              const selected = prefs.timeSlots.includes(slot.key);
              return (
                <Pressable
                  key={slot.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => toggleTimeSlot(slot.key)}
                  style={[styles.chip, selected && [styles.chipSelected, shadow.soft]]}
                >
                  <Text style={selected ? styles.chipTextSelected : styles.chipText}>{slot.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[type.h2, styles.groupTitle]}>Jours possibles</Text>
          <Text style={[type.label, styles.hint]}>Jours de consultation acceptés</Text>
          <View style={styles.days}>
            {WEEKDAYS.map((day) => {
              const selected = prefs.weekdays.includes(day.value);
              return (
                <Pressable
                  key={day.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => toggleWeekday(day.value)}
                  style={[styles.day, selected && [styles.daySelected, shadow.soft]]}
                >
                  <Text style={[styles.dayLabel, selected && styles.white]}>{day.label}</Text>
                  <Text style={selected ? styles.dayNumberSelected : styles.dayNumber}>
                    {nextDayOfMonth(day.value)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[type.h2, styles.groupTitle]}>Délai minimum de prévenance</Text>
          <View style={styles.notices}>
            {NOTICES.map((notice) => {
              const selected = prefs.minNotice === notice.key;
              return (
                <Pressable
                  key={notice.key}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => setPrefs((p) => ({ ...p, minNotice: notice.key }))}
                  style={styles.notice}
                >
                  <View style={[styles.radio, selected && styles.radioSelected]}>
                    {selected ? <View style={styles.radioDot} /> : null}
                  </View>
                  <Text style={[selected ? type.bodyMedium : type.body, styles.noticeText]}>{notice.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[type.h2, styles.groupTitle]}>Canaux de notification prioritaire</Text>
          <ChannelRow
            icon="mobile-screen"
            iconColor={palette.primary}
            title="Notifications push prioritaires"
            subtitle="Alerte sonore immédiate sur votre mobile"
            value={prefs.notifyPush}
            onChange={(v) => setPrefs((p) => ({ ...p, notifyPush: v }))}
          />
          <ChannelRow
            icon="comment-dots"
            iconColor={palette.teal}
            title="SMS instantané"
            subtitle={maskedPhone || 'Ajoutez un numéro dans votre profil'}
            value={prefs.notifySms}
            disabled={!maskedPhone}
            onChange={(v) => setPrefs((p) => ({ ...p, notifySms: v }))}
          />
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.positionCard}>
          <View style={[styles.positionBadge, shadow.soft]}>
            <Text style={styles.positionNumber}>{queue.position}</Text>
            <Text style={styles.positionSuffix}>{ordinalSuffix(queue.position)}</Text>
          </View>
          <View style={styles.flexText}>
            <Text style={type.bodyMedium}>Position estimée dans la file</Text>
            <View style={styles.positionLine}>
              <Text style={styles.positionLineText}>{queue.position}</Text>
              <Text style={styles.positionLineSuffix}>{ordinalSuffix(queue.position, true)}</Text>
              <Text style={[styles.positionLineText, styles.flexText]}> patient en attente pour ce praticien</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>
          </View>
        </View>
      </View>

      <View style={styles.ctaSection}>
        <Pressable
          accessibilityRole="button"
          disabled={saving}
          onPress={submit}
          style={({ pressed }) => [styles.cta, shadow.raised, (pressed || saving) && { opacity: 0.85 }]}
        >
          {saving ? (
            <ActivityIndicator color={palette.white} />
          ) : (
            <>
              <Icon name="bell" solid size={18} color={palette.white} />
              <Text style={styles.ctaText}>
                {isActive ? 'Mettre à jour mon alerte' : "Activer l'alerte désistement"}
              </Text>
            </>
          )}
        </Pressable>

        {isActive ? (
          <Pressable accessibilityRole="button" disabled={saving} onPress={deactivate} style={styles.deactivate}>
            <Text style={styles.deactivateText}>Désactiver cette alerte</Text>
          </Pressable>
        ) : null}

        <View style={styles.rgpd}>
          <Icon name="shield-halved" size={14} color={palette.inkMuted} />
          <Text style={styles.rgpdText}>
            Données médicales hébergées HDS & protégées par la réglementation RGPD santé.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

function ChannelRow({
  icon,
  iconColor,
  title,
  subtitle,
  value,
  disabled,
  onChange,
}: {
  icon: IconName;
  iconColor: string;
  title: string;
  subtitle: string;
  value: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.channelWrap}>
      <View style={styles.channel}>
        <View style={styles.channelInfo}>
          <View style={styles.channelIcon}>
            <Icon name={icon} size={16} color={iconColor} />
          </View>
          <View style={styles.flexText}>
            <Text style={type.bodyMedium}>{title}</Text>
            <Text style={type.caption}>{subtitle}</Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: value, disabled }}
          disabled={disabled}
          onPress={() => onChange(!value)}
          style={[styles.switch, value ? styles.switchOn : styles.switchOff, disabled && { opacity: 0.5 }]}
        >
          <View style={[styles.knob, shadow.raised]} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.page },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: 12, paddingBottom: 24 },
  section: { paddingTop: 12 },
  card: { backgroundColor: palette.surface, borderRadius: 12, padding: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  doctorInfo: { flex: 1, paddingLeft: 12 },
  flexText: { flex: 1, flexShrink: 1 },
  badgeWrap: { paddingTop: 8, alignItems: 'flex-start' },
  amberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,221,184,0.4)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  amberBadgeText: { ...type.label, color: palette.amberInk, paddingLeft: 4 },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: palette.tint50,
    borderRadius: 12,
    padding: 12,
    overflow: 'hidden',
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.primaryBright,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  infoText: { ...type.body, color: palette.inkSoft, lineHeight: 22.75, marginTop: 1 },
  hint: { paddingTop: 4 },
  groupTitle: { paddingTop: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 8 },
  chip: {
    backgroundColor: palette.tint100,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipSelected: { backgroundColor: palette.primary },
  chipText: { ...type.body, color: palette.inkSoft, textAlign: 'center' },
  chipTextSelected: { ...type.bodyMedium, color: palette.white, textAlign: 'center' },
  days: { flexDirection: 'row', gap: 6, paddingTop: 8 },
  day: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: palette.tint100,
    borderRadius: 8,
    paddingVertical: 10,
  },
  daySelected: { backgroundColor: palette.primary },
  dayLabel: {
    fontFamily: fonts.medium,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.22,
    color: palette.inkSoft,
    textTransform: 'uppercase',
  },
  dayNumber: { ...type.body, color: palette.inkSoft },
  dayNumberSelected: { ...type.bodyMedium, color: palette.white },
  white: { color: palette.white },
  notices: { gap: 8, paddingTop: 8 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.tint50,
    borderRadius: 8,
    padding: 8,
  },
  noticeText: { paddingLeft: 12, flexShrink: 1 },
  radio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.radioBorder,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: palette.primary },
  radioDot: { width: 9.6, height: 9.6, borderRadius: 4.8, backgroundColor: palette.primary },
  channelWrap: { paddingTop: 8 },
  channel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: palette.page,
    borderRadius: 8,
    padding: 8,
  },
  channelInfo: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 8 },
  channelIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.tint100,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  switch: { width: 44, height: 24, borderRadius: 12, padding: 2 },
  switchOn: { backgroundColor: palette.primary, alignItems: 'flex-end' },
  switchOff: { backgroundColor: palette.tint200, alignItems: 'flex-start' },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: palette.white },
  positionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(220,233,255,0.6)',
    borderRadius: 12,
    padding: 12,
  },
  positionBadge: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: palette.white,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: 10,
    marginRight: 12,
  },
  positionNumber: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 28, letterSpacing: -0.3, color: palette.primary },
  positionSuffix: { fontFamily: fonts.bold, fontSize: 10, lineHeight: 16, color: palette.primary },
  positionLine: { flexDirection: 'row', alignItems: 'flex-start', minHeight: 28, paddingTop: 0 },
  positionLineText: { ...type.body, color: palette.inkSoft },
  positionLineSuffix: { fontFamily: fonts.regular, fontSize: 10.5, lineHeight: 13, color: palette.inkSoft },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: palette.tint100, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: palette.primary },
  ctaSection: { paddingTop: 16, paddingBottom: 8 },
  cta: {
    height: 48,
    borderRadius: 12,
    backgroundColor: palette.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  ctaText: { ...type.h2, color: palette.white, textAlign: 'center' },
  deactivate: { alignSelf: 'center', paddingTop: 12, paddingBottom: 4 },
  deactivateText: { ...type.label, color: palette.dangerInk },
  rgpd: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingTop: 12, paddingHorizontal: 24 },
  rgpdText: { ...type.caption, color: palette.inkMuted, textAlign: 'center', paddingLeft: 4, flexShrink: 1 },
  secondaryButton: { backgroundColor: palette.tint200, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  secondaryButtonText: { ...type.bodyMedium, color: palette.primary },
});
