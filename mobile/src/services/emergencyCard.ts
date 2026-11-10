import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import type { PatientRecord } from '../api/services';

export type EmergencyCard = {
  version: 1;
  patientId: number;
  patientNumber: string;
  name: string;
  birthDate: string | null;
  allergies: { substance: string; severity: string; reaction: string | null }[];
  conditions: { label: string; code: string | null }[];
  medications: { name: string; dosage: string | null; frequency: string | null }[];
  immunizations: { vaccine: string; date: string }[];
  updatedAt: string;
};

const LIMITS = { allergies: 15, conditions: 15, medications: 15, immunizations: 10, text: 80 };

const cut = (value: string | null | undefined) =>
  value ? (value.length > LIMITS.text ? `${value.slice(0, LIMITS.text - 1)}…` : value) : null;

const cardKey = (userId: string, patientId: number) => `emergency-card.${userId}.${patientId}`;
const indexKey = (userId: string) => `emergency-card-index.${userId}`;

export const buildEmergencyCard = (record: PatientRecord): EmergencyCard => {
  const usable = <T extends { entered_in_error: boolean; confidential: boolean }>(list: T[]) =>
    list.filter((e) => !e.entered_in_error && !e.confidential);

  return {
    version: 1,
    patientId: record.patient.id,
    patientNumber: record.patient.patient_number,
    name: `${record.patient.first_name} ${record.patient.last_name}`,
    birthDate: record.patient.birth_date ? record.patient.birth_date.slice(0, 10) : null,
    allergies: usable(record.allergies)
      .filter((a) => a.status === 'active')
      .slice(0, LIMITS.allergies)
      .map((a) => ({ substance: cut(a.substance) as string, severity: a.severity, reaction: cut(a.reaction) })),
    conditions: usable(record.conditions)
      .filter((c) => c.status === 'active')
      .slice(0, LIMITS.conditions)
      .map((c) => ({ label: cut(c.label) as string, code: c.icd10_code })),
    medications: usable(record.medications)
      .filter((m) => m.status === 'active')
      .slice(0, LIMITS.medications)
      .map((m) => ({ name: cut(m.name) as string, dosage: cut(m.dosage), frequency: cut(m.frequency) })),
    immunizations: usable(record.immunizations)
      .slice(0, LIMITS.immunizations)
      .map((i) => ({ vaccine: cut(i.vaccine) as string, date: i.administered_on.slice(0, 10) })),
    updatedAt: new Date().toISOString(),
  };
};

const readIndex = async (userId: string): Promise<number[]> => {
  try {
    const raw = await SecureStore.getItemAsync(indexKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((n) => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
};

const writeIndex = (userId: string, ids: number[]) =>
  SecureStore.setItemAsync(indexKey(userId), JSON.stringify([...new Set(ids)]));

export const enabledCardIds = readIndex;

export const saveEmergencyCard = async (userId: string, record: PatientRecord) => {
  const card = buildEmergencyCard(record);
  await SecureStore.setItemAsync(cardKey(userId, card.patientId), JSON.stringify(card));
  await writeIndex(userId, [...(await readIndex(userId)), card.patientId]);
  return card;
};

export const refreshEmergencyCardIfEnabled = async (userId: string, record: PatientRecord) => {
  if ((await readIndex(userId)).includes(record.patient.id)) {
    await saveEmergencyCard(userId, record);
  }
};

export const loadEmergencyCards = async (userId: string): Promise<EmergencyCard[]> => {
  const cards: EmergencyCard[] = [];
  for (const id of await readIndex(userId)) {
    try {
      const raw = await SecureStore.getItemAsync(cardKey(userId, id));
      if (raw) cards.push(JSON.parse(raw) as EmergencyCard);
    } catch {
      continue;
    }
  }
  return cards;
};

export const removeEmergencyCard = async (userId: string, patientId: number) => {
  await SecureStore.deleteItemAsync(cardKey(userId, patientId));
  await writeIndex(userId, (await readIndex(userId)).filter((id) => id !== patientId));
};

export const clearEmergencyCards = async (userId: string) => {
  for (const id of await readIndex(userId)) {
    await SecureStore.deleteItemAsync(cardKey(userId, id));
  }
  await SecureStore.deleteItemAsync(indexKey(userId));
};

export const unlockEmergencyCards = async (): Promise<{ ok: boolean; protectedByDevice: boolean }> => {
  const level = await LocalAuthentication.getEnrolledLevelAsync();

  if (level === LocalAuthentication.SecurityLevel.NONE) {
    return { ok: true, protectedByDevice: false };
  }

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Afficher la fiche d’urgence',
    cancelLabel: 'Annuler',
    disableDeviceFallback: false,
  });
  return { ok: result.success, protectedByDevice: true };
};
