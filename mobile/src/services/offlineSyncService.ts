import {
  saveOfflineSnapshot,
} from "../database/offlineRepository";
import * as SecureStore from "expo-secure-store";
import {
  getOfflineSyncGeneration,
  isOfflineSyncGenerationValid,
  runOfflineSyncExclusive,
} from "./offlineSyncLock";
import { AppointmentsApi, DoctorsApi } from "../api/services";
import type {
  CachedAppointment,
  CachedDoctor,
} from "../database/offlineRepository";

function isValidAppointment(value: unknown): value is CachedAppointment {
  if (!value || typeof value !== "object") return false;

  const item = value as Record<string, unknown>;

  return (
    Number.isSafeInteger(item.id) &&
    Number(item.id) > 0 &&
    Number.isSafeInteger(item.doctor_id) &&
    Number(item.doctor_id) > 0 &&
    typeof item.starts_at === "string" &&
    !Number.isNaN(Date.parse(item.starts_at)) &&
    typeof item.ends_at === "string" &&
    !Number.isNaN(Date.parse(item.ends_at)) &&
    Date.parse(item.ends_at) > Date.parse(item.starts_at) &&
    ["confirmed", "pending", "done", "cancelled"].includes(
      String(item.status)
    ) &&
    (item.doctor_name == null || typeof item.doctor_name === "string") &&
    (item.specialty == null || typeof item.specialty === "string")
  );
}
function isValidDoctor(value: unknown): value is CachedDoctor {
  if (!value || typeof value !== "object") return false;

  const item = value as Record<string, unknown>;

  return (
    Number.isSafeInteger(item.id) &&
    Number(item.id) > 0 &&
    typeof item.first_name === "string" &&
    item.first_name.trim().length > 0 &&
    typeof item.last_name === "string" &&
    item.last_name.trim().length > 0 &&
    typeof item.specialty === "string" &&
    item.specialty.trim().length > 0 &&
    (typeof item.fee === "string" || typeof item.fee === "number") &&
    String(item.fee).trim().length > 0 &&
    Number.isFinite(Number(item.fee)) &&
    Number(item.fee) >= 0 &&
    Number.isSafeInteger(item.consultation_minutes) &&
    Number(item.consultation_minutes) > 0 &&
    (
      item.languages == null ||
      (
        Array.isArray(item.languages) &&
        item.languages.every((language) => typeof language === "string")
      )
    )
  );
}
export async function fetchOfflineSyncData(): Promise<{
  appointments: CachedAppointment[];
  doctors: CachedDoctor[];
} | null> {
  const generation = getOfflineSyncGeneration();
  const initialToken = await SecureStore.getItemAsync("token");

  if (
    !initialToken ||
    !isOfflineSyncGenerationValid(generation)
  ) {
    return null;
  }

  const [appointmentsResponse, doctorsResponse] = await Promise.all([
    AppointmentsApi.mine(),
    DoctorsApi.list(),
  ]);

  const appointments = appointmentsResponse.data;
  const doctors = Array.isArray(doctorsResponse.data)
    ? doctorsResponse.data.map((doctor: unknown) => {
        if (!doctor || typeof doctor !== "object" || Array.isArray(doctor)) {
          return doctor;
        }

        const item = doctor as Record<string, unknown>;

        if (typeof item.languages !== "string") {
          return item;
        }

        return {
          ...item,
          languages: item.languages
            .split(",")
            .map((language) => language.trim())
            .filter((language) => language.length > 0),
        };
      })
    : doctorsResponse.data;

  if (!Array.isArray(appointments) || !Array.isArray(doctors)) {
    throw new Error("Format de synchronisation invalide.");
  }

  if (!appointments.every(isValidAppointment)) {
    throw new Error("Rendez-vous invalides : synchronisation annulee.");
  }

  const invalidDoctorIndex = doctors.findIndex((doctor: unknown) => !isValidDoctor(doctor)); if (invalidDoctorIndex !== -1) { const d = doctors[invalidDoctorIndex] as Record<string, unknown>; console.warn("Diagnostic medecin invalide :", { index: invalidDoctorIndex, champs: { id: typeof d?.id, first_name: typeof d?.first_name, last_name: typeof d?.last_name, specialty: typeof d?.specialty, fee: typeof d?.fee, consultation_minutes: typeof d?.consultation_minutes, languages: Array.isArray(d?.languages) ? "array" : typeof d?.languages } });
    throw new Error("Medecins invalides : synchronisation annulee.");
  }

  const currentToken = await SecureStore.getItemAsync("token");

  if (
    !currentToken ||
    currentToken !== initialToken ||
    !isOfflineSyncGenerationValid(generation)
  ) {
    return null;
  }

  return {
    appointments: appointments as CachedAppointment[],
    doctors: doctors as CachedDoctor[],
  };
}

export async function syncOfflineData(): Promise<boolean> {
  const generation = getOfflineSyncGeneration();
  const initialToken = await SecureStore.getItemAsync("token");
  const savedUser = await SecureStore.getItemAsync("user");

  if (!initialToken || !savedUser) return false;

  let userId: string;

  try {
    const user = JSON.parse(savedUser);
    if (!user?.id) return false;
    userId = String(user.id);
  } catch {
    return false;
  }

  const data = await fetchOfflineSyncData();

  if (
    !data ||
    !isOfflineSyncGenerationValid(generation)
  ) {
    return false;
  }

  return runOfflineSyncExclusive(async () => {
    const currentToken = await SecureStore.getItemAsync("token");
    const currentUser = await SecureStore.getItemAsync("user");

    if (
      !currentToken ||
      currentToken !== initialToken ||
      !currentUser ||
      !isOfflineSyncGenerationValid(generation)
    ) {
      return false;
    }

    let currentUserId: string;

    try {
      currentUserId = String(JSON.parse(currentUser).id);
    } catch {
      return false;
    }

    if (currentUserId !== userId) return false;

    await saveOfflineSnapshot(
      userId,
      data.appointments,
      data.doctors,
    );

    return true;
  });
}