
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useNavigation, useRoute } from '@react-navigation/native';

import {
  AppointmentsApi,
  ConsultationInput,
  ConsultationResponse,
} from '../../api/services';

// ============================================
// TYPES
// ============================================

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

// ============================================
// HELPERS
// ============================================

const toText = (value: unknown): string => {
  return value === null || value === undefined ? '' : String(value);
};

const toNumberOrNull = (value: string): number | null => {
  if (!value.trim()) return null;

  const parsed = Number(value.replace(',', '.'));

  return Number.isFinite(parsed) ? parsed : null;
};

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

const formatTime = (date: string) => {
  return new Date(date).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

// ============================================
// SCREEN
// ============================================

export default function AppointmentDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const appointmentId = Number(route.params?.appointmentId);

  const [consultation, setConsultation] =
    useState<ConsultationResponse | null>(null);

  const [form, setForm] = useState<ConsultationForm>(emptyForm);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState('');

  const isCompleted = consultation?.consultation_status === 'completed';

  // ============================================
  // CHARGEMENT DE LA CONSULTATION
  // ============================================

  const loadConsultation = useCallback(async () => {
    if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
      setError('Identifiant du rendez-vous invalide.');
      setLoading(false);
      return;
    }

    try {
      setError('');

      const response = await AppointmentsApi.consultation(appointmentId);

      const data = response.data;

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
      console.error(
        'Erreur chargement consultation :',
        e?.response?.data || e
      );

      setError(
        e?.response?.data?.error ||
        'Impossible de charger les informations du rendez-vous.'
      );
    } finally {
      setLoading(false);
    }
  }, [appointmentId]);

  useEffect(() => {
    loadConsultation();
  }, [loadConsultation]);

  // ============================================
  // MODIFICATION DES CHAMPS
  // ============================================

  const updateField = (
    field: keyof ConsultationForm,
    value: string
  ) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  // ============================================
  // CONVERSION DU FORMULAIRE POUR L'API
  // ============================================

  const buildPayload = (): ConsultationInput => {
    return {
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
    };
  };

  // ============================================
  // VALIDATION DES CONSTANTES NUMÉRIQUES
  // ============================================

  const validateNumbers = () => {
    const numericFields: {
      label: string;
      value: string;
    }[] = [
      { label: 'Fréquence cardiaque', value: form.heartRate },
      { label: 'Température', value: form.temperature },
      { label: 'Saturation en oxygène', value: form.oxygenSaturation },
      { label: 'Poids', value: form.weight },
      { label: 'Taille', value: form.height },
    ];

    for (const field of numericFields) {
      if (
        field.value.trim() &&
        (
          !Number.isFinite(Number(field.value.replace(',', '.'))) ||
          Number(field.value.replace(',', '.')) < 0
        )
      ) {
        Alert.alert(
          'Valeur incorrecte',
          `Vérifie le champ : ${field.label}.`
        );
        return false;
      }
    }

    return true;
  };

  // ============================================
  // ENREGISTRER EN BROUILLON
  // ============================================

  const saveDraft = async () => {
    if (!consultation || isCompleted || saving || completing) return;

    if (!validateNumbers()) return;

    try {
      setSaving(true);

      await AppointmentsApi.saveConsultation(
        appointmentId,
        buildPayload()
      );

      Alert.alert(
        'Consultation enregistrée',
        'Les informations ont été sauvegardées.'
      );

      await loadConsultation();
    } catch (e: any) {
      console.error(
        'Erreur sauvegarde consultation :',
        e?.response?.data || e
      );

      Alert.alert(
        'Erreur',
        e?.response?.data?.error ||
        'Impossible d’enregistrer la consultation.'
      );
    } finally {
      setSaving(false);
    }
  };

  // ============================================
  // TERMINER LA CONSULTATION
  // ============================================

  const completeConsultation = () => {
    if (!consultation || isCompleted || saving || completing) return;

    if (!validateNumbers()) return;

    Alert.alert(
      'Terminer la consultation',
      'Confirmer la fin de cette consultation ? Cette action marquera également le rendez-vous comme terminé.',
      [
        {
          text: 'Annuler',
          style: 'cancel',
        },
        {
          text: 'Terminer',
          onPress: async () => {
            try {
              setCompleting(true);

              await AppointmentsApi.completeConsultation(
                appointmentId,
                buildPayload()
              );

              await loadConsultation();

              Alert.alert(
                'Consultation terminée',
                'La consultation a été enregistrée avec succès.',
                [
                  {
                    text: 'OK',
                    onPress: () => navigation.goBack(),
                  },
                ]
              );
            } catch (e: any) {
              console.error(
                'Erreur fin consultation :',
                e?.response?.data || e
              );

              Alert.alert(
                'Erreur',
                e?.response?.data?.error ||
                'Impossible de terminer la consultation.'
              );
            } finally {
              setCompleting(false);
            }
          },
        },
      ]
    );
  };

  // ============================================
  // CHAMP DE FORMULAIRE
  // ============================================

  const renderField = (
    label: string,
    field: keyof ConsultationForm,
    options?: {
      multiline?: boolean;
      placeholder?: string;
      keyboardType?: 'default' | 'numeric' | 'decimal-pad';
    }
  ) => {
    return (
      <View style={styles.fieldContainer}>
        <Text style={styles.fieldLabel}>{label}</Text>

        <TextInput
          style={[
            styles.input,
            options?.multiline && styles.multilineInput,
            isCompleted && styles.disabledInput,
          ]}
          value={form[field]}
          onChangeText={(value) => updateField(field, value)}
          placeholder={options?.placeholder || 'Non renseigné'}
          placeholderTextColor="#94A3B8"
          multiline={options?.multiline || false}
          textAlignVertical={options?.multiline ? 'top' : 'center'}
          keyboardType={options?.keyboardType || 'default'}
          editable={!isCompleted && !saving && !completing}
        />
      </View>
    );
  };

  // ============================================
  // CHARGEMENT
  // ============================================

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>
          Chargement de la fiche de consultation...
        </Text>
      </View>
    );
  }

  // ============================================
  // ERREUR
  // ============================================

  if (error || !consultation) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>
          Impossible d'ouvrir la consultation
        </Text>

        <Text style={styles.errorText}>
          {error || 'Aucune information disponible.'}
        </Text>

        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => {
            setLoading(true);
            loadConsultation();
          }}
        >
          <Text style={styles.retryButtonText}>Réessayer</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ============================================
  // INTERFACE PRINCIPALE
  // ============================================

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* EN-TÊTE PATIENT */}

        <View style={styles.patientCard}>
          <View style={styles.patientAvatar}>
            <Text style={styles.patientAvatarText}>
              {consultation.patient_first_name?.charAt(0)}
              {consultation.patient_last_name?.charAt(0)}
            </Text>
          </View>

          <View style={styles.patientInfo}>
            <Text style={styles.patientName}>
              {consultation.patient_first_name}{' '}
              {consultation.patient_last_name}
            </Text>

            <Text style={styles.patientDetail}>
              {consultation.patient_email}
            </Text>

            {consultation.patient_phone ? (
              <Text style={styles.patientDetail}>
                {consultation.patient_phone}
              </Text>
            ) : null}
          </View>
        </View>

        {/* INFORMATIONS RENDEZ-VOUS */}

        <View style={styles.appointmentCard}>
          <Text style={styles.cardTitle}>
            Informations du rendez-vous
          </Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Date</Text>
            <Text style={styles.infoValue}>
              {formatDate(consultation.starts_at)}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Horaire</Text>
            <Text style={styles.infoValue}>
              {formatTime(consultation.starts_at)} -{' '}
              {formatTime(consultation.ends_at)}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Motif initial</Text>
            <Text style={styles.infoValue}>
              {consultation.appointment_reason || 'Non renseigné'}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Statut</Text>
            <Text
              style={[
                styles.infoValue,
                consultation.appointment_status === 'done'
                  ? styles.completedText
                  : styles.pendingText,
              ]}
            >
              {consultation.appointment_status === 'done'
                ? 'Terminé'
                : consultation.appointment_status === 'cancelled'
                  ? 'Annulé'
                  : consultation.appointment_status === 'confirmed'
                    ? 'Confirmé'
                    : 'En attente'}
            </Text>
          </View>
        </View>

        {/* STATUT CONSULTATION */}

        {isCompleted && (
          <View style={styles.completedBanner}>
            <Text style={styles.completedBannerText}>
              Consultation terminée
            </Text>

            <Text style={styles.completedBannerDescription}>
              Cette fiche est maintenant en lecture seule.
            </Text>
          </View>
        )}

        {/* MOTIF DE CONSULTATION */}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            1. Motif de consultation
          </Text>

          {renderField(
            'Motif principal',
            'chiefComplaint',
            {
              multiline: true,
              placeholder: 'Décrire le motif de consultation...',
            }
          )}
        </View>

        {/* CONSTANTES VITALES */}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            2. Constantes vitales
          </Text>

          <View style={styles.grid}>
            <View style={styles.gridItem}>
              {renderField(
                'Tension artérielle',
                'bloodPressure',
                { placeholder: 'Ex. 120/80' }
              )}
            </View>

            <View style={styles.gridItem}>
              {renderField(
                'Fréquence cardiaque (bpm)',
                'heartRate',
                { keyboardType: 'decimal-pad' }
              )}
            </View>

            <View style={styles.gridItem}>
              {renderField(
                'Température (°C)',
                'temperature',
                { keyboardType: 'decimal-pad' }
              )}
            </View>

            <View style={styles.gridItem}>
              {renderField(
                'Saturation O₂ (%)',
                'oxygenSaturation',
                { keyboardType: 'decimal-pad' }
              )}
            </View>

            <View style={styles.gridItem}>
              {renderField(
                'Poids (kg)',
                'weight',
                { keyboardType: 'decimal-pad' }
              )}
            </View>

            <View style={styles.gridItem}>
              {renderField(
                'Taille (cm)',
                'height',
                { keyboardType: 'decimal-pad' }
              )}
            </View>
          </View>
        </View>

        {/* ANTECEDENTS */}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            3. Antécédents médicaux
          </Text>

          {renderField(
            'Historique médical',
            'medicalHistory',
            {
              multiline: true,
              placeholder: 'Antécédents médicaux du patient...',
            }
          )}

          {renderField(
            'Traitements en cours',
            'currentTreatments',
            {
              multiline: true,
              placeholder: 'Traitements actuellement suivis...',
            }
          )}
        </View>

        {/* EXAMEN CLINIQUE */}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            4. Examen clinique
          </Text>

          {renderField(
            'Observations et résultats',
            'clinicalExamination',
            {
              multiline: true,
              placeholder: 'Saisir les observations de l’examen clinique...',
            }
          )}
        </View>

        {/* DIAGNOSTIC */}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            5. Diagnostic
          </Text>

          {renderField(
            'Diagnostic retenu',
            'diagnosis',
            {
              multiline: true,
              placeholder: 'Saisir le diagnostic...',
            }
          )}
        </View>

        {/* NOTES */}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            6. Notes complémentaires
          </Text>

          {renderField(
            'Notes du médecin',
            'notes',
            {
              multiline: true,
              placeholder: 'Ajouter des remarques complémentaires...',
            }
          )}
        </View>

        {/* ORDONNANCE */}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            7. Prescription médicale
          </Text>

          {renderField(
            'Ordonnance et prescriptions',
            'prescription',
            {
              multiline: true,
              placeholder: 'Saisir la prescription médicale...',
            }
          )}
        </View>

        {/* INFORMATIONS DE SAUVEGARDE */}

        {consultation.consultation_updated_at && (
          <Text style={styles.lastUpdate}>
            Dernière modification :{' '}
            {new Date(
              consultation.consultation_updated_at
            ).toLocaleString('fr-FR')}
          </Text>
        )}

        {/* ACTIONS */}

        {!isCompleted && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[
                styles.saveButton,
                (saving || completing) && styles.buttonDisabled,
              ]}
              onPress={saveDraft}
              disabled={saving || completing}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.saveButtonText}>
                  Enregistrer le brouillon
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.completeButton,
                (saving || completing) && styles.buttonDisabled,
              ]}
              onPress={completeConsultation}
              disabled={saving || completing}
              activeOpacity={0.8}
            >
              {completing ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.completeButtonText}>
                  Terminer la consultation
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {isCompleted && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>
              Retour
            </Text>
          </TouchableOpacity>
        )}

        <Text style={styles.footer}>
          ClinicRDV · Dossier de consultation
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FB',
  },

  content: {
    padding: 16,
    paddingBottom: 40,
  },

  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 25,
    backgroundColor: '#F5F7FB',
  },

  loadingText: {
    marginTop: 12,
    color: '#64748B',
    fontSize: 13,
  },

  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#172554',
    textAlign: 'center',
  },

  errorText: {
    marginTop: 10,
    color: '#64748B',
    textAlign: 'center',
  },

  retryButton: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 20,
  },

  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  patientCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },

  patientAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#DBEAFE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },

  patientAvatarText: {
    color: '#1D4ED8',
    fontSize: 20,
    fontWeight: '700',
  },

  patientInfo: {
    flex: 1,
  },

  patientName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#172554',
  },

  patientDetail: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },

  appointmentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
  },

  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#172554',
    marginBottom: 14,
  },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },

  infoLabel: {
    color: '#64748B',
    fontSize: 12,
    flex: 1,
  },

  infoValue: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '600',
    flex: 1.3,
    textAlign: 'right',
  },

  completedText: {
    color: '#15803D',
  },

  pendingText: {
    color: '#B45309',
  },

  completedBanner: {
    backgroundColor: '#DCFCE7',
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
  },

  completedBannerText: {
    color: '#15803D',
    fontWeight: '700',
    fontSize: 14,
  },

  completedBannerDescription: {
    color: '#166534',
    fontSize: 12,
    marginTop: 5,
  },

  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#172554',
    marginBottom: 18,
  },

  fieldContainer: {
    marginBottom: 15,
  },

  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 7,
  },

  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#1E293B',
    fontSize: 13,
    backgroundColor: '#FFFFFF',
  },

  multilineInput: {
    minHeight: 105,
    paddingTop: 12,
  },

  disabledInput: {
    backgroundColor: '#F8FAFC',
    color: '#64748B',
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },

  gridItem: {
    width: '48%',
  },

  lastUpdate: {
    color: '#94A3B8',
    fontSize: 11,
    textAlign: 'right',
    marginBottom: 15,
  },

  actions: {
    marginTop: 5,
    gap: 12,
  },

  saveButton: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },

  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },

  completeButton: {
    backgroundColor: '#15803D',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },

  completeButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },

  buttonDisabled: {
    opacity: 0.6,
  },

  backButton: {
    backgroundColor: '#E2E8F0',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },

  backButtonText: {
    color: '#334155',
    fontWeight: '700',
  },

  footer: {
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 25,
  },
});
