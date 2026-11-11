import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { errorMessage } from '../../api/client';
import { AppointmentsApi, DoctorFacility, PatientProfile, PatientsApi } from '../../api/services';
import {
  Avatar,
  Button,
  Card,
  Chip,
  ErrorState,
  Icon,
  Input,
  Notice,
  Screen,
  StatusBadge,
} from '../../components/ui';
import { CLINIC_TIME_ZONE } from '../../components/PatientFigmaUI';
import { color, radius, space, type } from '../../theme';
import { doctorName } from '../../utils/doctorName';

type Doctor = {
  id: number;
  first_name: string;
  last_name: string;
  specialty: string;
  fee: string | number;
  consultation_minutes: number;
  active: boolean;
};

type Slot = {
  startsAt: string;
  endsAt: string;
  available: boolean;
  facilityId?: number;
  timezone?: string;
};

const formatTime = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));

const formatDate = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));

export default function BookingReviewScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const doctor = route.params?.doctor as Doctor | undefined;
  const slot = route.params?.slot as Slot | undefined;
  const initialReason = route.params?.reason || '';
  const facility = route.params?.facility as DoctorFacility | undefined;
  const timeZone = slot?.timezone ?? facility?.timezone ?? CLINIC_TIME_ZONE;
  const facilityId = slot?.facilityId ?? facility?.id;
  const fee = facility?.fee ?? doctor?.fee;

  const [reason, setReason] = useState(initialReason);
  const [additionalInfo, setAdditionalInfo] = useState('');
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [booking, setBooking] = useState(false);
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<PatientProfile[]>([]);
  const [profileId, setProfileId] = useState<number | null>(null);

  useEffect(() => {
    PatientsApi.mine()
      .then(({ data }) => {
        const bookable = data.filter((p) => ['self', 'pending', 'verified'].includes(p.link_status));
        setProfiles(bookable);
        const requested = bookable.find((p) => p.id === route.params?.profileId);
        setProfileId(requested?.id ?? bookable.find((p) => p.link_status === 'self')?.id ?? bookable[0]?.id ?? null);
      })
      .catch(() => setProfiles([]));
  }, []);

  const selectedProfile = profiles.find((p) => p.id === profileId);

  if (!doctor || !slot?.startsAt || !slot?.endsAt) {
    return (
      <Screen>
        <ErrorState message="Les informations de réservation sont indisponibles." />
        <Button
          title="Retour à la sélection"
          variant="secondary"
          icon="arrow-back"
          onPress={() => navigation.goBack()}
        />
      </Screen>
    );
  }

  const fullName = `${doctor.first_name} ${doctor.last_name}`.trim();
  const dateLabel = formatDate(slot.startsAt, timeZone);

  const handleConfirm = async () => {
    if (booking) return;

    if (!reason.trim()) {
      setReasonError('Veuillez renseigner le motif de votre consultation.');
      return;
    }

    setBooking(true);
    try {
      const response = await AppointmentsApi.book(
        doctor.id,
        slot.startsAt,
        reason.trim(),
        selectedProfile && selectedProfile.link_status !== 'self' ? selectedProfile.id : undefined,
        facilityId
      );
      navigation.replace('BookingConfirm', {
        appointment: response.data,
        facility: facility ? { name: facility.name, city: facility.city } : undefined,
        timeZone,
        patientName: selectedProfile && selectedProfile.link_status !== 'self'
          ? `${selectedProfile.first_name} ${selectedProfile.last_name}`
          : undefined,
        doctor: {
          id: doctor.id,
          name: fullName,
          specialty: doctor.specialty,
          fee,
          consultation_minutes: doctor.consultation_minutes,
        },
      });
    } catch (err: any) {
      if (err?.response?.status === 409) {
        navigation.navigate('BookingConflict', { doctor, slot, reason: reason.trim(), profileId, facility });
        return;
      }
      Alert.alert(
        'Réservation non enregistrée',
        errorMessage(err)
      );
    } finally {
      setBooking(false);
    }
  };

  return (
    <Screen
      footer={
        <View style={s.footer}>
          <Button
            title="Confirmer le rendez-vous"
            icon="checkmark-circle-outline"
            loading={booking}
            disabled={!doctor.active}
            onPress={handleConfirm}
          />
          <View style={s.cancelInfo}>
            <Icon name="time-outline" size="sm" color={color.textMuted} />
            <Text style={s.cancelText}>Annulation gratuite jusqu’à 4 heures avant le rendez-vous.</Text>
          </View>
        </View>
      }
    >
      <View style={s.progress}>
        <View style={s.progressHead}>
          <Text style={s.progressLabel}>ÉTAPE 3 SUR 3</Text>
          <View style={s.secure}>
            <Icon name="shield-checkmark-outline" size={14} color={color.textSecondary} />
            <Text style={s.secureText}>Réservation sécurisée</Text>
          </View>
        </View>
        <View style={s.track}>
          <View style={s.fill} />
        </View>
      </View>

      <Card style={s.doctorCard}>
        <View style={s.doctorTop}>
          <Avatar name={fullName} size={56} />
          <View style={s.flex}>
            <View style={s.nameRow}>
              <Text style={[type.h3, s.flexShrink]} numberOfLines={1}>
                {doctorName(fullName)}
              </Text>
              <Icon name="checkmark-circle" size="sm" color={color.primaryBright} />
            </View>
            <Text style={s.specialty}>{doctor.specialty}</Text>
            <Text style={s.muted}>{facility ? [facility.name, facility.city].filter(Boolean).join(' · ') : 'Cabinet médical'} · Présentiel</Text>
          </View>
          <StatusBadge status="pending" label="À confirmer" />
        </View>

        <View style={s.slotBox}>
          <View style={s.slotIcon}>
            <Icon name="calendar" size="md" color={color.primary} />
          </View>
          <View style={s.flex}>
            <Text style={s.slotDate}>{dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}</Text>
            <View style={s.timeRow}>
              <Text style={s.time}>{formatTime(slot.startsAt, timeZone)}</Text>
              <View style={s.duration}>
                <Text style={s.durationText}>{doctor.consultation_minutes} min</Text>
              </View>
              <Text style={s.muted}>Fin prévue : {formatTime(slot.endsAt, timeZone)}</Text>
            </View>
          </View>
        </View>
      </Card>

      {profiles.length > 1 ? (
        <Card style={s.form}>
          <View style={s.formTitle}>
            <Icon name="people-outline" size="md" color={color.primary} />
            <Text style={type.h2}>Pour qui est ce rendez-vous ?</Text>
          </View>
          <View style={s.chips}>
            {profiles.map((p) => (
              <Chip
                key={p.id}
                label={p.link_status === 'self' ? 'Moi-même' : `${p.first_name} ${p.last_name}`}
                selected={p.id === profileId}
                onPress={() => setProfileId(p.id)}
              />
            ))}
          </View>
          {selectedProfile ? <Text style={s.muted}>N° patient : {selectedProfile.patient_number}</Text> : null}
        </Card>
      ) : null}

      <Notice
        icon="location-outline"
        title={facility ? `Lieu : ${facility.name}` : 'Adresse du cabinet à confirmer'}
        message={facility ? 'Retrouvez l’adresse et le téléphone dans la fiche de l’établissement.' : 'Les informations précises du cabinet seront communiquées par la clinique.'}
      />

      <Card style={s.price}>
        <View style={s.priceRow}>
          <View style={s.priceLabel}>
            <Icon name="cash-outline" size="md" color={color.primary} />
            <Text style={type.bodyMedium}>Tarif de consultation</Text>
          </View>
          <Text style={type.h2}>{fee} USD</Text>
        </View>
        <Text style={s.muted}>Informations de paiement à confirmer auprès de la clinique</Text>
      </Card>

      <Card style={s.form}>
        <View style={s.formTitle}>
          <Icon name="clipboard-outline" size="md" color={color.primary} />
          <Text style={type.h2}>Préparation du rendez-vous</Text>
        </View>

        <Input
          label="Motif de consultation *"
          value={reason}
          onChangeText={(v) => {
            setReason(v);
            if (reasonError && v.trim()) setReasonError(null);
          }}
          placeholder="Consultation de suivi habituel"
          maxLength={500}
          error={reasonError}
        />

        <Input
          label="Informations complémentaires (facultatif)"
          value={additionalInfo}
          onChangeText={setAdditionalInfo}
          placeholder="Ex : allergies connues, antécédents, symptômes apparus il y a 3 jours..."
          multiline
          maxLength={1000}
        />

        <View style={s.reminder}>
          <View style={s.reminderIcon}>
            <Icon name="notifications-outline" size="md" color={color.primary} />
          </View>
          <View style={s.flex}>
            <Text style={type.bodyMedium}>Rappels automatiques</Text>
            <Text style={s.muted}>SMS et e-mail de rappel envoyés 24h puis 2h avant le RDV.</Text>
          </View>
          <Switch
            value={remindersEnabled}
            onValueChange={setRemindersEnabled}
            trackColor={{ false: color.borderStrong, true: color.primary }}
            thumbColor={color.surface}
          />
        </View>
      </Card>

      <Notice
        tone="success"
        icon="document-text-outline"
        title="Pensez à apporter vos documents médicaux"
        message="Munissez-vous de vos ordonnances et de vos résultats d'analyses récentes."
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  flexShrink: { flexShrink: 1 },
  muted: { ...type.caption, color: color.textMuted },
  progress: { gap: space.xs },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressLabel: { ...type.label, color: color.primary, letterSpacing: 1 },
  secure: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  secureText: { ...type.caption },
  track: { height: 6, borderRadius: radius.full, backgroundColor: color.primaryStrong, overflow: 'hidden' },
  fill: { width: '100%', height: '100%', backgroundColor: color.primary },
  doctorCard: { gap: space.sm },
  doctorTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  specialty: { ...type.bodyMedium, color: color.success, marginTop: 2 },
  slotBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: color.primarySubtle,
    borderRadius: radius.md,
    padding: space.sm,
  },
  slotIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotDate: { ...type.bodyMedium },
  timeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.xs, marginTop: 2 },
  time: { ...type.h2, color: color.primary },
  duration: {
    backgroundColor: color.primaryStrong,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  durationText: { ...type.caption },
  price: { gap: space.xs },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.xs },
  priceLabel: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 1 },
  form: { gap: space.md },
  formTitle: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  reminder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  reminderIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: color.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: { gap: space.xs },
  cancelInfo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xxs },
  cancelText: { ...type.caption, color: color.textMuted },
});
