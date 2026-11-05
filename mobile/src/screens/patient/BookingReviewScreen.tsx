
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';

import { AppointmentsApi } from '../../api/services';
import { Avatar, ui } from '../../components/ClinicUI';
import { colors } from '../../theme/colors';

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
};

const formatTime = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Africa/Lubumbashi',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Africa/Lubumbashi',
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

  const [reason, setReason] = useState(initialReason);
  const [additionalInfo, setAdditionalInfo] = useState('');
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [booking, setBooking] = useState(false);

  if (!doctor || !slot?.startsAt || !slot?.endsAt) {
    return (
      <View style={[ui.page, styles.center]}>
        <Text style={styles.error}>
          Les informations de réservation sont indisponibles.
        </Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.link}>Retour à la sélection</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const initials =
    `${doctor.first_name.charAt(0)}${doctor.last_name.charAt(0)}`.toUpperCase();

  const startTime = formatTime(slot.startsAt);
  const endTime = formatTime(slot.endsAt);
  const dateLabel = formatDate(slot.startsAt);

  const handleConfirm = async () => {
    if (booking) return;

    if (!reason.trim()) {
      Alert.alert(
        'Motif obligatoire',
        'Veuillez renseigner le motif de votre consultation.',
      );
      return;
    }

    setBooking(true);

    try {
      const response = await AppointmentsApi.book(
        doctor.id,
        slot.startsAt,
        reason.trim(),
      );

      navigation.replace('BookingConfirm', {
        appointment: response.data,
        doctor: {
          id: doctor.id,
          name: `${doctor.first_name} ${doctor.last_name}`,
          specialty: doctor.specialty,
          fee: doctor.fee,
          consultation_minutes: doctor.consultation_minutes,
        },
      });
    } catch (err: any) {
      const status = err?.response?.status;
      const message =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        "Une erreur est survenue lors de la réservation.";

      if (status === 409) {
        navigation.navigate('BookingConflict', {
          doctor,
          slot,
          reason: reason.trim(),
        });
        return;
      }

      Alert.alert('Réservation impossible', message);
    } finally {
      setBooking(false);
    }
  };

  return (
    <View style={styles.page}>
      {/* En-tête */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Fiche Médecin</Text>

        <Avatar initials={initials} tint="#E5EFFF" size={34} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Progression */}
        <View style={styles.progressSection}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>ÉTAPE 3 SUR 3</Text>
            <Text style={styles.secure}>♢ Réservation sécurisée</Text>
          </View>

          <View style={styles.progressTrack}>
            <View style={styles.progressFill} />
          </View>
        </View>

        {/* Médecin */}
        <View style={styles.doctorCard}>
          <View style={styles.doctorTop}>
            <Avatar initials={initials} tint="#DCEBFA" size={56} />

            <View style={styles.doctorInfo}>
              <Text style={styles.doctorName}>
                Dr. {doctor.first_name} {doctor.last_name}
              </Text>

              <Text style={styles.verified}>✓</Text>

              <Text style={styles.specialty}>{doctor.specialty}</Text>
              <Text style={styles.cabinet}>Cabinet médical</Text>
            </View>

            <View style={styles.confirmBadge}>
              <Text style={styles.confirmBadgeText}>● À confirmer</Text>
            </View>
          </View>

          <View style={styles.appointmentBox}>
            <View style={styles.calendarIcon}>
              <Text style={styles.calendarSymbol}>▦</Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.appointmentDate}>
                {dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}
              </Text>

              <View style={styles.timeRow}>
                <Text style={styles.time}>{startTime}</Text>
                <Text style={styles.duration}>
                  {doctor.consultation_minutes} min
                </Text>
              </View>
            </View>

            <View style={styles.locationBadge}>
              <Text style={styles.locationText}>Cabinet</Text>
              <Text style={styles.locationText}>Présentiel</Text>
            </View>
          </View>

          <View style={styles.endTimeRow}>
            <Text style={styles.endTimeText}>
              Fin prévue : {endTime}
            </Text>
          </View>
        </View>

        {/* Adresse */}
        <View style={styles.addressRow}>
          <Text style={styles.pin}>⌖</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.address}>
              Adresse du cabinet à confirmer
            </Text>
            <Text style={styles.addressDetails}>
              Les informations précises du cabinet seront communiquées par la
              clinique.
            </Text>
          </View>
        </View>

        {/* Tarif */}
        <View style={styles.priceCard}>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>▣  Tarif de consultation</Text>
            <Text style={styles.price}>
              {doctor.fee} USD
            </Text>
          </View>

          <Text style={styles.paymentInfo}>
            Informations de paiement à confirmer auprès de la clinique
          </Text>
        </View>

        {/* Préparation */}
        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>
            ▤  Préparation du rendez-vous
          </Text>

          <Text style={styles.fieldLabel}>
            Motif de consultation <Text style={styles.required}>*</Text>
          </Text>

          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="Consultation de suivi habituel"
            placeholderTextColor="#77849B"
            style={styles.selectField}
            maxLength={500}
          />

          <Text style={styles.fieldLabel}>
            Informations complémentaires
            <Text style={styles.optional}>  Facultatif</Text>
          </Text>

          <TextInput
            value={additionalInfo}
            onChangeText={setAdditionalInfo}
            placeholder="Ex : allergies connues, antécédents, symptômes apparus il y a 3 jours..."
            placeholderTextColor="#8A96AB"
            multiline
            textAlignVertical="top"
            maxLength={1000}
            style={styles.textArea}
          />

          {/* Rappels */}
          <View style={styles.reminderRow}>
            <View style={styles.checkbox}>
              <Text style={styles.checkmark}>✓</Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.reminderTitle}>
                Rappels automatiques activés
              </Text>
              <Text style={styles.reminderDescription}>
                SMS et e-mail de rappel envoyés 24h puis 2h avant le RDV.
              </Text>
            </View>

            <Switch
              value={remindersEnabled}
              onValueChange={setRemindersEnabled}
              trackColor={{ false: '#CFD6E2', true: '#2761E9' }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Confirmation */}
        <TouchableOpacity
          accessibilityRole="button"
          disabled={booking || !doctor.active}
          onPress={handleConfirm}
          style={[
            styles.confirmButton,
            (booking || !doctor.active) && { opacity: 0.55 },
          ]}
        >
          {booking ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.confirmButtonText}>
              ▣  Confirmer le rendez-vous
            </Text>
          )}
        </TouchableOpacity>

        <Text style={styles.cancelInfo}>
          ⏱  Annulation gratuite jusqu'à 4 heures avant le rendez-vous.
        </Text>

        {/* Carte informative */}
        <View style={styles.vitalCard}>
          <Text style={styles.vitalIcon}>♧</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.vitalTitle}>
              Pensez à apporter vos documents médicaux
            </Text>
            <Text style={styles.vitalDescription}>
              Munissez-vous de vos ordonnances et de vos résultats d'analyses
              récentes.
            </Text>
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#F5F7FD',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 25,
  },
  header: {
    height: 58,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E8EDF5',
  },
  backButton: {
    width: 35,
  },
  backArrow: {
    color: '#172D4D',
    fontSize: 34,
    lineHeight: 38,
  },
  headerTitle: {
    color: '#152A47',
    fontSize: 15,
    fontWeight: '800',
  },
  scrollContent: {
    padding: 10,
    paddingBottom: 30,
  },
  progressSection: {
    paddingHorizontal: 7,
    paddingVertical: 12,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 9,
  },
  progressLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#1454D9',
  },
  secure: {
    fontSize: 9,
    color: '#53637A',
  },
  progressTrack: {
    height: 5,
    backgroundColor: '#DCE6FA',
    borderRadius: 8,
    overflow: 'hidden',
  },
  progressFill: {
    width: '100%',
    height: '100%',
    backgroundColor: '#1559E9',
    borderRadius: 8,
  },
  doctorCard: {
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#EDF1F8',
  },
  doctorTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 13,
  },
  doctorInfo: {
    flex: 1,
  },
  doctorName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1C304D',
  },
  verified: {
    color: '#1764E8',
    fontWeight: '900',
    fontSize: 12,
  },
  specialty: {
    color: '#16846C',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  cabinet: {
    color: '#59677D',
    fontSize: 9,
    marginTop: 3,
  },
  confirmBadge: {
    backgroundColor: '#EDF3FF',
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  confirmBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#1755D7',
  },
  appointmentBox: {
    backgroundColor: '#F0F4FF',
    borderRadius: 10,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  calendarIcon: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarSymbol: {
    fontSize: 22,
    color: '#1763EA',
  },
  appointmentDate: {
    color: '#263B5B',
    fontSize: 10,
    fontWeight: '600',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 3,
  },
  time: {
    color: '#0756DB',
    fontSize: 16,
    fontWeight: '900',
  },
  duration: {
    fontSize: 9,
    color: '#50617D',
    backgroundColor: '#E0E9FC',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
  },
  locationBadge: {
    alignItems: 'flex-end',
  },
  locationText: {
    color: '#344B69',
    fontSize: 9,
    fontWeight: '700',
  },
  endTimeRow: {
    alignItems: 'flex-end',
    marginTop: 7,
  },
  endTimeText: {
    color: '#64728A',
    fontSize: 10,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    marginVertical: 10,
  },
  pin: {
    fontSize: 21,
    color: '#1260E8',
  },
  address: {
    fontSize: 11,
    color: '#253A58',
    fontWeight: '800',
  },
  addressDetails: {
    fontSize: 9,
    color: '#69768A',
    marginTop: 3,
  },
  priceCard: {
    backgroundColor: '#E7EFFF',
    borderRadius: 10,
    padding: 12,
    marginBottom: 11,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#263D5D',
  },
  price: {
    fontSize: 15,
    fontWeight: '900',
    color: '#253650',
  },
  paymentInfo: {
    fontSize: 9,
    color: '#52637E',
    marginTop: 8,
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 13,
    padding: 12,
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#203550',
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 13,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#233854',
    marginBottom: 7,
  },
  required: {
    color: '#E33B45',
  },
  optional: {
    fontSize: 9,
    color: '#758197',
    fontWeight: '400',
  },
  selectField: {
    backgroundColor: '#F0F4FD',
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 12,
    color: '#263B58',
    fontSize: 11,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E8EDF7',
  },
  textArea: {
    backgroundColor: '#F0F4FD',
    borderRadius: 8,
    padding: 11,
    minHeight: 75,
    color: '#263B58',
    fontSize: 11,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E8EDF7',
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#EDF0F6',
  },
  checkbox: {
    width: 17,
    height: 17,
    backgroundColor: '#1559E9',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  reminderTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#263B58',
  },
  reminderDescription: {
    fontSize: 9,
    color: '#68768B',
    marginTop: 3,
  },
  confirmButton: {
    minHeight: 48,
    backgroundColor: '#2861E8',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    elevation: 2,
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  cancelInfo: {
    color: '#53627A',
    fontSize: 9,
    textAlign: 'center',
    marginVertical: 12,
  },
  vitalCard: {
    backgroundColor: '#EDF2FF',
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  vitalIcon: {
    color: '#1762E7',
    fontSize: 23,
  },
  vitalTitle: {
    color: '#243957',
    fontSize: 10,
    fontWeight: '800',
  },
  vitalDescription: {
    color: '#65738A',
    fontSize: 9,
    marginTop: 4,
    lineHeight: 14,
  },
  error: {
    color: colors.error,
    textAlign: 'center',
    marginBottom: 15,
  },
  link: {
    color: colors.primary,
    fontWeight: '700',
  },
});
