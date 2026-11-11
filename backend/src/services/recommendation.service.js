const pool = require('../config/db');
const { nextSlots, distanceSql } = require('./alternatives.service');
const { accessibleProfilesSql } = require('./patients.service');

const httpError = (status, message, code) =>
  Object.assign(new Error(message), { status, expose: true, ...(code ? { code } : {}) });

const HORIZON_HOURS = 14 * 24;
const MAX_DISTANCE_KM = 30;
const CANDIDATE_LIMIT = 12;
const RESULT_LIMIT = 8;
const WEIGHTS = { delay: 40, distance: 30, language: 15, history: 15 };

const LANGUAGE_NAMES = {
  fr: 'français', sw: 'swahili', ln: 'lingala', lu: 'tshiluba', kg: 'kikongo', en: 'anglais',
};

const doctorName = (row) =>
  `Dr ${[row.first_name, row.last_name].filter(Boolean).join(' ').replace(/^dr\.?\s+/i, '')}`;

const parseLanguages = (value) =>
  String(value || '').toLowerCase().split(/[\s,;/]+/).map((l) => l.trim()).filter(Boolean);

const toKm = (value) => (value === null || value === undefined ? null : Number(value));

const formatDelay = (hours) => {
  if (hours < 24) return 'dans moins de 24 h';
  const days = Math.round(hours / 24);
  return days <= 1 ? 'demain' : `dans ${days} jours`;
};

const loadCandidates = async ({ specialtyId, userId, profileId, lat, lng, city }) => {
  const hasPosition = lat !== undefined && lng !== undefined;
  const params = [specialtyId, userId, profileId ?? null, city ?? null];
  const distance = hasPosition
    ? `CASE WHEN f.latitude IS NULL THEN NULL ELSE round((${distanceSql('$5', '$6')})::numeric, 1) END`
    : 'NULL::numeric';
  if (hasPosition) params.push(lat, lng);

  return (await pool.query(
    `SELECT d.id AS doctor_id, u.first_name, u.last_name, s.name AS specialty, d.languages,
            COALESCE(da.fee, d.fee) AS fee,
            f.id AS facility_id, f.name AS facility_name, f.city, f.address, f.timezone,
            ${distance} AS distance_km,
            ($4::text IS NOT NULL AND lower(coalesce(f.city, '')) = lower($4::text)) AS same_city,
            (SELECT count(*)::int FROM appointments a
              WHERE a.doctor_id = d.id AND a.status = 'done'
                AND a.patient_profile_id IN ${accessibleProfilesSql('$2')}
                AND ($3::int IS NULL OR a.patient_profile_id = $3::int)) AS past_visits
       FROM doctor_affiliations da
       JOIN doctors d ON d.id = da.doctor_id
       JOIN users u ON u.id = d.user_id
       JOIN specialties s ON s.id = d.specialty_id
       JOIN facilities f ON f.id = da.facility_id
      WHERE da.status = 'active' AND d.active AND f.status = 'active' AND d.specialty_id = $1
      ORDER BY past_visits DESC, distance_km NULLS LAST, same_city DESC, f.name, u.last_name
      LIMIT ${CANDIDATE_LIMIT}`,
    params
  )).rows;
};

exports.WEIGHTS = WEIGHTS;

exports.score = (row, slot, { language, now = Date.now() } = {}) => {
  const reasons = [];
  const parts = {};

  const hours = Math.max(0, (new Date(slot.startsAt).getTime() - now) / 3600000);
  parts.delay = Math.round(WEIGHTS.delay * Math.max(0, 1 - hours / HORIZON_HOURS));
  reasons.push(`Premier créneau libre ${formatDelay(hours)}`);

  const km = toKm(row.distance_km);
  if (km !== null) {
    parts.distance = Math.round(WEIGHTS.distance * Math.max(0, 1 - km / MAX_DISTANCE_KM));
    reasons.push(`À ${km} km de vous`);
  } else if (row.same_city) {
    parts.distance = Math.round(WEIGHTS.distance / 2);
    reasons.push(`Dans votre ville (${row.city})`);
  } else {
    parts.distance = 0;
  }

  if (language && parseLanguages(row.languages).includes(language)) {
    parts.language = WEIGHTS.language;
    reasons.push(`Parle ${LANGUAGE_NAMES[language] ?? language}`);
  } else {
    parts.language = 0;
  }

  if (row.past_visits > 0) {
    parts.history = WEIGHTS.history;
    reasons.push(row.past_visits === 1 ? 'Vous a déjà reçu en consultation' : `Vous a déjà reçu ${row.past_visits} fois`);
  } else {
    parts.history = 0;
  }

  return { score: parts.delay + parts.distance + parts.language + parts.history, parts, reasons };
};

exports.recommend = async (user, { specialtyId, profileId, lat, lng, city, language }) => {
  const specialty = (await pool.query('SELECT id, name FROM specialties WHERE id = $1', [specialtyId])).rows[0];
  if (!specialty) throw httpError(404, 'Spécialité introuvable');

  if (profileId !== undefined) {
    const own = await pool.query(`SELECT 1 FROM ${accessibleProfilesSql('$1')} ap WHERE ap.id = $2`, [user.id, profileId]);
    if (!own.rowCount) throw httpError(404, 'Profil introuvable');
  }

  const rows = await loadCandidates({ specialtyId, userId: user.id, profileId, lat, lng, city });
  const withSlots = await Promise.all(rows.map(async (row) => ({
    row,
    slot: (await nextSlots(row.doctor_id, { id: row.facility_id, timezone: row.timezone }, { count: 1 }))[0],
  })));
  const available = withSlots.filter(({ slot }) => slot);

  const now = Date.now();
  const ranked = available
    .map(({ row, slot }) => ({ row, slot, ...exports.score(row, slot, { language, now }) }))
    .sort((a, b) => b.score - a.score || new Date(a.slot.startsAt) - new Date(b.slot.startsAt))
    .slice(0, RESULT_LIMIT);

  return {
    specialty,
    weights: WEIGHTS,
    criteria: {
      position: lat !== undefined && lng !== undefined,
      city: city ?? null,
      language: language ?? null,
    },
    withoutSlot: withSlots.length - available.length,
    doctors: ranked.map(({ row, slot, score, parts, reasons }, index) => ({
      rank: index + 1,
      doctorId: row.doctor_id,
      doctorName: doctorName(row),
      specialty: row.specialty,
      fee: row.fee ?? null,
      languages: parseLanguages(row.languages),
      facilityId: row.facility_id,
      facilityName: row.facility_name,
      city: row.city ?? null,
      address: row.address ?? null,
      distanceKm: toKm(row.distance_km),
      timezone: row.timezone,
      nextSlot: slot,
      score,
      parts,
      reasons,
    })),
  };
};
