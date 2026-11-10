export type CachedProfile = {
  user_id: string;
  email: string;
  role: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  updated_at: string;
};

export type CachedAppointment = {
  id: number;
  doctor_id: number;
  doctor_name?: string;
  starts_at: string;
  ends_at: string;
  status: "confirmed" | "pending" | "done" | "cancelled";
  specialty?: string;
  facility_id?: number | null;
  facility_name?: string | null;
  facility_timezone?: string | null;
  facility_phone?: string | null;
  facility_emergency_phone?: string | null;
  doctor_phone?: string | null;
};

export type CachedFacility = {
  id: number;
  name: string;
  city: string | null;
  address: string | null;
  phone: string | null;
  emergency_phone: string | null;
  timezone: string | null;
};

export type CachedDoctor = {
  id: number;
  first_name: string;
  last_name: string;
  specialty: string;
  fee: string | number;
  consultation_minutes: number;
  languages: string[] | null;
  phone?: string | null;
};

import { getOfflineDatabase } from "./offlineDatabase";
import { clearEmergencyCards } from "../services/emergencyCard";

export async function saveCachedProfile(
  profile: CachedProfile,
): Promise<void> {
  const db = await getOfflineDatabase();

  await db.runAsync(
    `INSERT OR REPLACE INTO cached_profile
    (user_id, email, role, first_name, last_name, phone, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
    profile.user_id,
    profile.email,
    profile.role,
    profile.first_name,
    profile.last_name,
    profile.phone,
    new Date().toISOString(),
  );
}

export async function getCachedProfile(
  userId: string,
): Promise<CachedProfile | null> {
  const db = await getOfflineDatabase();

  return db.getFirstAsync<CachedProfile>(
    "SELECT * FROM cached_profile WHERE user_id = ?",
    userId,
  );
}

export async function saveCachedAppointments(
  userId: string,
  appointments: CachedAppointment[],
): Promise<void> {
  const db = await getOfflineDatabase();
  const cachedAt = new Date().toISOString();

  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      "DELETE FROM cached_appointments WHERE user_id = ?",
      userId,
    );

    for (const appointment of appointments) {
      await tx.runAsync(
        `INSERT INTO cached_appointments (
          user_id,
          appointment_id,
          doctor_id,
          doctor_name,
          starts_at,
          ends_at,
          status,
          specialty,
          cached_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        userId,
        appointment.id,
        appointment.doctor_id,
        appointment.doctor_name ?? null,
        appointment.starts_at,
        appointment.ends_at,
        appointment.status,
        appointment.specialty ?? null,
        cachedAt,
      );
    }
  });
}

export async function getCachedAppointments(
  userId: string,
): Promise<CachedAppointment[]> {
  const db = await getOfflineDatabase();

  const rows = await db.getAllAsync<any>(
    `SELECT
      appointment_id AS id,
      doctor_id,
      doctor_name,
      starts_at,
      ends_at,
      status,
      specialty,
      facility_id,
      facility_name,
      facility_timezone,
      facility_phone,
      facility_emergency_phone,
      doctor_phone
    FROM cached_appointments
    WHERE user_id = ?
    ORDER BY starts_at ASC`,
    userId,
  );

  return rows as CachedAppointment[];
}

export async function saveCachedDoctors(
  userId: string,
  doctors: CachedDoctor[],
): Promise<void> {
  const db = await getOfflineDatabase();
  const cachedAt = new Date().toISOString();

  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      "DELETE FROM cached_doctors WHERE user_id = ?",
      userId,
    );

    for (const doctor of doctors) {
      await tx.runAsync(
        `INSERT INTO cached_doctors (
          user_id,
          doctor_id,
          first_name,
          last_name,
          specialty,
          fee,
          consultation_minutes,
          languages_json,
          cached_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        userId,
        doctor.id,
        doctor.first_name,
        doctor.last_name,
        doctor.specialty,
        String(doctor.fee),
        doctor.consultation_minutes,
        doctor.languages ? JSON.stringify(doctor.languages) : null,
        cachedAt,
      );
    }
  });
}

export async function getCachedDoctors(
  userId: string,
): Promise<CachedDoctor[]> {
  const db = await getOfflineDatabase();

  const rows = await db.getAllAsync<any>(
    `SELECT
      doctor_id AS id,
      first_name,
      last_name,
      specialty,
      fee,
      consultation_minutes,
      languages_json,
      phone
    FROM cached_doctors
    WHERE user_id = ?
    ORDER BY last_name ASC`,
    userId,
  );

  return rows.map((row) => ({
    ...row,
    fee: Number(row.fee),
    languages: row.languages_json
      ? JSON.parse(row.languages_json)
      : null,
  }));
}

export async function saveSyncMetadata(
  userId: string,
  resource: string,
): Promise<void> {
  const db = await getOfflineDatabase();

  await db.runAsync(
    `INSERT OR REPLACE INTO sync_metadata
    (user_id, resource, last_synced_at)
    VALUES (?, ?, ?)`,
    userId,
    resource,
    new Date().toISOString(),
  );
}

export async function getSyncMetadata(
  userId: string,
  resource: string,
): Promise<string | null> {
  const db = await getOfflineDatabase();

  const result = await db.getFirstAsync<{ last_synced_at: string }>(
    `SELECT last_synced_at
     FROM sync_metadata
     WHERE user_id = ? AND resource = ?`,
    userId,
    resource,
  );

  return result?.last_synced_at ?? null;
}

export async function clearUserCache(userId: string): Promise<void> {
  const db = await getOfflineDatabase();

  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      "DELETE FROM cached_profile WHERE user_id = ?",
      userId,
    );

    await tx.runAsync(
      "DELETE FROM cached_appointments WHERE user_id = ?",
      userId,
    );

    await tx.runAsync(
      "DELETE FROM cached_doctors WHERE user_id = ?",
      userId,
    );

    await tx.runAsync(
      "DELETE FROM sync_metadata WHERE user_id = ?",
      userId,
    );

    await tx.runAsync(
      "DELETE FROM cached_facilities WHERE user_id = ?",
      userId,
    );
  });

  await clearEmergencyCards(userId);
}

export async function saveOfflineSnapshot(
  userId: string,
  appointments: CachedAppointment[],
  doctors: CachedDoctor[],
  facilities: CachedFacility[] = [],
): Promise<void> {
  const db = await getOfflineDatabase();
  const cachedAt = new Date().toISOString();

  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      "DELETE FROM cached_appointments WHERE user_id = ?",
      userId,
    );

    for (const appointment of appointments) {
      await tx.runAsync(
        `INSERT INTO cached_appointments (
          user_id, appointment_id, doctor_id, doctor_name,
          starts_at, ends_at, status, specialty, cached_at,
          facility_id, facility_name, facility_timezone,
          facility_phone, facility_emergency_phone, doctor_phone
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        userId,
        appointment.id,
        appointment.doctor_id,
        appointment.doctor_name ?? null,
        appointment.starts_at,
        appointment.ends_at,
        appointment.status,
        appointment.specialty ?? null,
        cachedAt,
        appointment.facility_id ?? null,
        appointment.facility_name ?? null,
        appointment.facility_timezone ?? null,
        appointment.facility_phone ?? null,
        appointment.facility_emergency_phone ?? null,
        appointment.doctor_phone ?? null,
      );
    }

    await tx.runAsync(
      "DELETE FROM cached_facilities WHERE user_id = ?",
      userId,
    );

    for (const facility of facilities) {
      await tx.runAsync(
        `INSERT INTO cached_facilities (
          user_id, facility_id, name, city, address,
          phone, emergency_phone, timezone, cached_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        userId,
        facility.id,
        facility.name,
        facility.city ?? null,
        facility.address ?? null,
        facility.phone ?? null,
        facility.emergency_phone ?? null,
        facility.timezone ?? null,
        cachedAt,
      );
    }

    await tx.runAsync(
      "DELETE FROM cached_doctors WHERE user_id = ?",
      userId,
    );

    for (const doctor of doctors) {
      await tx.runAsync(
        `INSERT INTO cached_doctors (
          user_id, doctor_id, first_name, last_name,
          specialty, fee, consultation_minutes,
          languages_json, cached_at, phone
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        userId,
        doctor.id,
        doctor.first_name,
        doctor.last_name,
        doctor.specialty,
        String(doctor.fee),
        doctor.consultation_minutes,
        doctor.languages ? JSON.stringify(doctor.languages) : null,
        cachedAt,
        doctor.phone ?? null,
      );
    }

    for (const resource of ["appointments", "doctors", "facilities"]) {
      await tx.runAsync(
        `INSERT OR REPLACE INTO sync_metadata
        (user_id, resource, last_synced_at)
        VALUES (?, ?, ?)`,
        userId,
        resource,
        cachedAt,
      );
    }
  });
}
export async function getCachedFacilities(
  userId: string,
): Promise<CachedFacility[]> {
  const db = await getOfflineDatabase();

  return db.getAllAsync<CachedFacility>(
    `SELECT
      facility_id AS id,
      name,
      city,
      address,
      phone,
      emergency_phone,
      timezone
    FROM cached_facilities
    WHERE user_id = ?
    ORDER BY name ASC`,
    userId,
  );
}
