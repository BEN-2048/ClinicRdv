const pool = require('../config/db');

const httpError = (status, message) =>
  Object.assign(new Error(message), { status });

const distanceSql = (lat, lng) => `(6371 * acos(LEAST(1, GREATEST(-1,
  cos(radians(${lat})) * cos(radians(f.latitude)) * cos(radians(f.longitude) - radians(${lng}))
  + sin(radians(${lat})) * sin(radians(f.latitude))))))`;

exports.search = async ({ q, city, specialtyId, service, lat, lng, limit = 30 } = {}) => {
  const hasPosition = lat !== undefined && lng !== undefined;
  const distance = hasPosition ? distanceSql('$6', '$7') : 'NULL::numeric';

  const r = await pool.query(
    `SELECT f.id, f.code, f.name, f.type, f.address, f.city, f.province,
            f.phone, f.emergency_phone, f.latitude, f.longitude, f.timezone,
            CASE WHEN f.latitude IS NULL THEN NULL ELSE round((${distance})::numeric, 1) END AS distance_km,
            COALESCE((SELECT array_agg(fs.service_code ORDER BY fs.service_code)
                        FROM facility_services fs WHERE fs.facility_id = f.id
                         AND (fs.unavailable_until IS NULL OR fs.unavailable_until <= now())), '{}') AS services,
            COALESCE((SELECT array_agg(fs.service_code ORDER BY fs.service_code)
                        FROM facility_services fs WHERE fs.facility_id = f.id
                         AND fs.unavailable_until > now()), '{}') AS unavailable_services,
            COALESCE((SELECT array_agg(sp.name ORDER BY sp.name)
                        FROM facility_specialties x JOIN specialties sp ON sp.id = x.specialty_id
                       WHERE x.facility_id = f.id), '{}') AS specialties,
            (SELECT count(*)::int FROM doctor_affiliations da
               JOIN doctors d ON d.id = da.doctor_id
              WHERE da.facility_id = f.id AND da.status = 'active' AND d.active) AS doctors_count
       FROM facilities f
      WHERE f.status = 'active'
        AND ($1::text IS NULL OR f.name ILIKE '%' || $1 || '%' OR f.city ILIKE '%' || $1 || '%'
             OR f.address ILIKE '%' || $1 || '%')
        AND ($2::text IS NULL OR lower(f.city) = lower($2))
        AND ($3::int IS NULL OR EXISTS (
              SELECT 1 FROM facility_specialties x WHERE x.facility_id = f.id AND x.specialty_id = $3))
        AND ($4::text IS NULL OR EXISTS (
              SELECT 1 FROM facility_services fs WHERE fs.facility_id = f.id AND fs.service_code = $4
                 AND (fs.unavailable_until IS NULL OR fs.unavailable_until <= now())))
      ORDER BY ${hasPosition ? 'distance_km NULLS LAST,' : ''} f.name
      LIMIT $5`,
    [q?.trim() || null, city?.trim() || null, specialtyId ?? null, service ?? null, limit,
      ...(hasPosition ? [lat, lng] : [])]
  );
  return r.rows;
};

exports.get = async (id) => {
  const f = await pool.query(
    `SELECT id, code, name, type, description, address, city, province, country,
            latitude, longitude, phone, emergency_phone, email, timezone
       FROM facilities WHERE id = $1 AND status = 'active'`,
    [id]
  );
  if (!f.rowCount) throw httpError(404, 'Établissement introuvable');

  const [hours, services, specialties, doctors] = await Promise.all([
    pool.query(
      `SELECT weekday, to_char(opens_at,'HH24:MI') AS "opensAt", to_char(closes_at,'HH24:MI') AS "closesAt"
         FROM facility_opening_hours WHERE facility_id = $1 ORDER BY weekday, opens_at`,
      [id]
    ),
    pool.query(
      `SELECT hs.code, hs.name, fs.available_24h,
              CASE WHEN fs.unavailable_until > now() THEN fs.unavailable_until END AS unavailable_until,
              CASE WHEN fs.unavailable_until > now() THEN fs.unavailable_reason END AS unavailable_reason
         FROM facility_services fs JOIN health_services hs ON hs.code = fs.service_code
        WHERE fs.facility_id = $1 ORDER BY hs.name`,
      [id]
    ),
    pool.query(
      `SELECT sp.id, sp.name
         FROM facility_specialties x JOIN specialties sp ON sp.id = x.specialty_id
        WHERE x.facility_id = $1 ORDER BY sp.name`,
      [id]
    ),
    pool.query(
      `SELECT d.id, u.first_name, u.last_name, s.name AS specialty,
              COALESCE(da.fee, d.fee) AS fee, d.consultation_minutes, d.languages
         FROM doctor_affiliations da
         JOIN doctors d ON d.id = da.doctor_id
         JOIN users u ON u.id = d.user_id
         JOIN specialties s ON s.id = d.specialty_id
        WHERE da.facility_id = $1 AND da.status = 'active' AND d.active
        ORDER BY s.name, u.last_name`,
      [id]
    ),
  ]);

  return {
    ...f.rows[0],
    opening_hours: hours.rows,
    services: services.rows,
    specialties: specialties.rows,
    doctors: doctors.rows,
  };
};

exports.meta = async () => {
  const [services, cities] = await Promise.all([
    pool.query('SELECT code, name FROM health_services ORDER BY name'),
    pool.query(
      `SELECT DISTINCT city FROM facilities
        WHERE status = 'active' AND city IS NOT NULL ORDER BY city`
    ),
  ]);
  return { services: services.rows, cities: cities.rows.map((r) => r.city) };
};
