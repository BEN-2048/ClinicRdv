import React, { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { AppointmentsApi, ConsultationInput, ConsultationResponse } from '../../api/services';
import {
  Avatar,
  Button,
  Card,
  ErrorState,
  Icon,
  IconName,
  InfoRow,
  Input,
  Loader,
  Notice,
  Screen,
  StatusBadge,
} from '../../components/ui';
import { color, radius, space, type } from '../../theme';

type ConsultationForm = {
  chiefComplaint: string;
  bloodPressure: string;
  heartRate: string;
  temperature: string;
  oxygenSaturation: string;
  weight: string;
  height: string;
  medicalHistory: string;
  currentTreatments: string;
  clinicalExamination: string;
  diagnosis: string;
  notes: string;
  prescription: string;
};

const emptyForm: ConsultationForm = {
  chiefComplaint: '',
  bloodPressure: '',
  heartRate: '',
  temperature: '',
  oxygenSaturation: '',
  weight: '',
  height: '',
  medicalHistory: '',
  currentTreatments: '',
  clinicalExamination: '',
  diagnosis: '',
  notes: '',
  prescription: '',
};

const VITALS: { label: string; field: keyof ConsultationForm; placeholder?: string; numeric?: boolean }[] = [
  { label: 'Tension artérielle', field: 'bloodPressure', placeholder: 'Ex. 120/80' },
  { label: 'Fréquence cardiaque (bpm)', field: 'heartRate', numeric: true },
  { label: 'Température (°C)', field: 'temperature', numeric: true },
  { label: 'Saturation O₂ (%)', field: 'oxygenSaturation', numeric: true },
  { label: 'Poids (kg)', field: 'weight', numeric: true },
  { label: 'Taille (cm)', field: 'height', numeric: true },
];

const toText = (value: unknown): string => (value === null || value === undefined ? '' : String(value));

const toNumberOrNull = (value: string): number | null => {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

const formatTime = (date: string) =>
  new Date(date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

function FormSection({
  step,
  title,
  icon,
  children,
}: {
  step: number;
  title: string;
  icon: IconName;
  children: React.ReactNode;
}) {
  return (
    <Card style={s.section}>
      <View style={s.sectionHead}>
        <View style={s.stepIcon}>
          <Icon name={icon} size="md" color={color.primary} />
        </View>
        <Text style={[type.h2, s.flex]}>
          {step}. {title}
        </Text>
      </View>
      {children}
    </Card>
  );
}

export default function AppointmentDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const appointmentId = Number(route.params?.appointmentId);

  const [consultation, setConsultation] = useState<ConsultationResponse | null>(null);
  const [form, setForm] = useState<ConsultationForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState('');

  const isCompleted = consultation?.consultation_status === 'completed';
  const busy = saving || completing;
  const editable = !isCompleted && !busy;

  const loadConsultation = useCallback(async () => {
    if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
      setError('Identifiant du rendez-vous invalide.');
      setLoading(false);
      return;
    }

    try {
      setError('');
      const { data } = await AppointmentsApi.consultation(appointmentId);
      setConsultation(data);
      setForm({
        chiefComplaint: toText(data.chief_complaint),
        bloodPressure: toText(data.blood_pressure),
        heartRate: toText(data.heart_rate),
        temperature: toText(data.temperature),
        oxygenSaturation: toText(data.oxygen_saturation),
        weight: toText(data.weight),
        height: toText(data.height),
        medicalHistory: toText(data.medical_history),
        currentTreatments: toText(data.current_treatments),
        clinicalExamination: toText(data.clinical_examination),
        diagnosis: toText(data.diagnosis),
        notes: toText(data.notes),
        prescription: toText(data.prescription),
      });
    } catch (e: any) {
      console.error('Erreur chargement consultation :', e?.response?.data || e);
      setError(e?.response?.data?.error || 'Impossible de charger les informations du rendez-vous.');
    } finally {
      setLoading(false);
    }
  }, [appointmentId]);

  useEffect(() => {
    loadConsultation();
  }, [loadConsultation]);

  const updateField = (field: keyof ConsultationForm, value: string) =>
    setForm((previous) => ({ ...previous, [field]: value }));

  const buildPayload = (): ConsultationInput => ({
    chiefComplaint: form.chiefComplaint.trim() || null,
    bloodPressure: form.bloodPressure.trim() || null,
    heartRate: toNumberOrNull(form.heartRate),
    temperature: toNumberOrNull(form.temperature),
    oxygenSaturation: toNumberOrNull(form.oxygenSaturation),
    weight: toNumberOrNull(form.weight),
    height: toNumberOrNull(form.height),
    medicalHistory: form.medicalHistory.trim() || null,
    currentTreatments: form.currentTreatments.trim() || null,
    clinicalExamination: form.clinicalExamination.trim() || null,
    diagnosis: form.diagnosis.trim() || null,
    notes: form.notes.trim() || null,
    prescription: form.prescription.trim() || null,
  });

  const invalidVital = (field: keyof ConsultationForm) => {
    const raw = form[field].trim();
    if (!raw) return false;
    const n = Number(raw.replace(',', '.'));
    return !Number.isFinite(n) || n < 0;
  };

  const validateNumbers = () => {
    const bad = VITALS.find((v) => v.numeric && invalidVital(v.field));
    if (bad) {
      Alert.alert('Valeur incorrecte', `Vérifiez le champ : ${bad.label}.`);
      return false;
    }
    return true;
  };

  const saveDraft = async () => {
    if (!consultation || isCompleted || busy) return;
    if (!validateNumbers()) return;
    try {
      setSaving(true);
      await AppointmentsApi.saveConsultation(appointmentId, buildPayload());
      Alert.alert('Consultation enregistrée', 'Les informations ont été sauvegardées.');
      await loadConsultation();
    } catch (e: any) {
      console.error('Erreur sauvegarde consultation :', e?.response?.data || e);
      Alert.alert('Erreur', e?.response?.data?.error || 'Impossible d’enregistrer la consultation.');
    } finally {
      setSaving(false);
    }
  };

  const completeConsultation = () => {
    if (!consultation || isCompleted || busy) return;
    if (!validateNumbers()) return;
    Alert.alert(
      'Terminer la consultation',
      'Confirmer la fin de cette consultation ? Cette action marquera également le rendez-vous comme terminé.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Terminer',
          onPress: async () => {
            try {
              setCompleting(true);
              await AppointmentsApi.completeConsultation(appointmentId, buildPayload());
              await loadConsultation();
              Alert.alert('Consultation terminée', 'La consultation a été enregistrée avec succès.', [
                { text: 'OK', onPress: () => navigation.goBack() },
              ]);
            } catch (e: any) {
              console.error('Erreur fin consultation :', e?.response?.data || e);
              Alert.alert('Erreur', e?.response?.data?.error || 'Impossible de terminer la consultation.');
            } finally {
              setCompleting(false);
            }
          },
        },
      ]
    );
  };

  const field = (
    label: string,
    key: keyof ConsultationForm,
    options?: { multiline?: boolean; placeholder?: string; numeric?: boolean }
  ) => (
    <Input
      label={label}
      value={form[key]}
      onChangeText={(value) => updateField(key, value)}
      placeholder={options?.placeholder || 'Non renseigné'}
      multiline={options?.multiline}
      keyboardType={options?.numeric ? 'decimal-pad' : 'default'}
      editable={editable}
      error={options?.numeric && invalidVital(key) ? 'Valeur invalide' : null}
    />
  );

  if (loading) {
    return <Loader fullscreen label="Chargement de la fiche de consultation..." />;
  }

  if (error || !consultation) {
    return (
      <Screen>
        <ErrorState
          message={error || 'Aucune information disponible.'}
          onRetry={() => {
            setLoading(true);
            loadConsultation();
          }}
        />
      </Screen>
    );
  }

  const patient = `${consultation.patient_first_name ?? ''} ${consultation.patient_last_name ?? ''}`.trim();

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen
        footer={
          isCompleted ? (
            <Button title="Retour" icon="arrow-back" variant="secondary" onPress={() => navigation.goBack()} />
          ) : (
            <View style={s.actions}>
              <Button
                title="Brouillon"
                icon="save-outline"
                variant="secondary"
                loading={saving}
                disabled={busy}
                onPress={saveDraft}
                style={s.flex}
              />
              <Button
                title="Terminer"
                icon="checkmark-circle-outline"
                loading={completing}
                disabled={busy}
                onPress={completeConsultation}
                style={s.flex}
              />
            </View>
          )
        }
      >
        <Card style={s.patient}>
          <Avatar name={patient} size={56} />
          <View style={s.flex}>
            <Text style={type.h2} numberOfLines={1}>
              {patient}
            </Text>
            <View style={s.contact}>
              <Icon name="mail-outline" size={14} color={color.textMuted} />
              <Text style={s.muted} numberOfLines={1}>
                {consultation.patient_email}
              </Text>
            </View>
            {consultation.patient_phone ? (
              <View style={s.contact}>
                <Icon name="call-outline" size={14} color={color.textMuted} />
                <Text style={s.muted}>{consultation.patient_phone}</Text>
              </View>
            ) : null}
          </View>
        </Card>

        {consultation.patient_profile_id ? (
          <Button
            title="Dossier du patient"
            icon="folder-open-outline"
            variant="secondary"
            onPress={() => navigation.navigate('PatientRecord', { patientId: consultation.patient_profile_id })}
          />
        ) : null}

        <Card style={s.section}>
          <View style={s.rowBetween}>
            <Text style={type.h2}>Rendez-vous</Text>
            <StatusBadge status={consultation.appointment_status} />
          </View>
          <InfoRow icon="calendar-outline" label="Date" value={formatDate(consultation.starts_at)} strong />
          <InfoRow
            icon="time-outline"
            label="Horaire"
            value={`${formatTime(consultation.starts_at)} – ${formatTime(consultation.ends_at)}`}
            strong
          />
          <InfoRow
            icon="document-text-outline"
            label="Motif initial"
            value={consultation.appointment_reason || 'Non renseigné'}
          />
        </Card>

        {isCompleted ? (
          <Notice
            tone="success"
            title="Consultation terminée"
            message="Cette fiche est maintenant en lecture seule."
          />
        ) : null}

        <FormSection step={1} title="Motif de consultation" icon="chatbubble-ellipses-outline">
          {field('Motif principal', 'chiefComplaint', {
            multiline: true,
            placeholder: 'Décrire le motif de consultation...',
          })}
        </FormSection>

        <FormSection step={2} title="Constantes vitales" icon="pulse-outline">
          <View style={s.grid}>
            {VITALS.map((v) => (
              <View key={v.field} style={s.gridItem}>
                {field(v.label, v.field, { placeholder: v.placeholder, numeric: v.numeric })}
              </View>
            ))}
          </View>
        </FormSection>

        <FormSection step={3} title="Antécédents médicaux" icon="time-outline">
          {field('Historique médical', 'medicalHistory', {
            multiline: true,
            placeholder: 'Antécédents médicaux du patient...',
          })}
          {field('Traitements en cours', 'currentTreatments', {
            multiline: true,
            placeholder: 'Traitements actuellement suivis...',
          })}
        </FormSection>

        <FormSection step={4} title="Examen clinique" icon="body-outline">
          {field('Observations et résultats', 'clinicalExamination', {
            multiline: true,
            placeholder: 'Saisir les observations de l’examen clinique...',
          })}
        </FormSection>

        <FormSection step={5} title="Diagnostic" icon="search-outline">
          {field('Diagnostic retenu', 'diagnosis', { multiline: true, placeholder: 'Saisir le diagnostic...' })}
        </FormSection>

        <FormSection step={6} title="Notes complémentaires" icon="create-outline">
          {field('Notes du médecin', 'notes', {
            multiline: true,
            placeholder: 'Ajouter des remarques complémentaires...',
          })}
        </FormSection>

        <FormSection step={7} title="Prescription médicale" icon="medical-outline">
          {field('Ordonnance et prescriptions', 'prescription', {
            multiline: true,
            placeholder: 'Saisir la prescription médicale...',
          })}
        </FormSection>

        {consultation.consultation_updated_at ? (
          <Text style={s.lastUpdate}>
            Dernière modification : {new Date(consultation.consultation_updated_at).toLocaleString('fr-FR')}
          </Text>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  patient: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  contact: { flexDirection: 'row', alignItems: 'center', gap: space.xxs, marginTop: 2 },
  muted: { ...type.caption, color: color.textMuted, flexShrink: 1 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  section: { gap: space.md },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: color.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  gridItem: { flexBasis: '47%', flexGrow: 1 },
  lastUpdate: { ...type.caption, color: color.textMuted, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: space.xs },
});
