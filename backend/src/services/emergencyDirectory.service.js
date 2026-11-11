const pool = require('../config/db');

const httpError = (status, message) => Object.assign(new Error(message), { status, expose: true });

const DISCLAIMER =
  'En cas de danger immédiat, appelez les secours ou rendez-vous au service d’urgence le plus proche. ClinicRDV ne remplace pas les services d’urgence.';

const NUMBER_COLUMNS = `id, label, number, province, source, to_char(verified_at, 'YYYY-MM-DD') AS verified_at, sort_order`;

const distanceSql = `(6371 * acos(LEAST(1, GREATEST(-1,
  cos(radians($1)) * cos(radians(f.latitude)) * cos(radians(f.longitude) - radians($2))
  + sin(radians($1)) * sin(radians(f.latitude))))))`;

exports.directory = async ({ lat, lng, city } = {}) => {
  const hasPosition = lat !== undefined && lng !== undefined;
  const distance = hasPosition
    ? `CASE WHEN f.latitude IS NULL THEN NULL ELSE round((${distanceSql})::numeric, 1) END`
    : 'NULL::numeric';
  const cityParam = hasPosition ? '$3' : '$1';

  const [numbers, facilities] = await Promise.all([
    pool.query(`SELECT ${NUMBER_COLUMNS} FROM emergency_numbers WHERE active ORDER BY sort_order, id`),
    pool.query(
      `SELECT f.id, f.name, f.type, f.address, f.city, f.province, f.phone, f.emergency_phone,
              f.latitude, f.longitude, fs.available_24h, ${distance} AS distance_km
         FROM facilities f
         JOIN facility_services fs ON fs.facility_id = f.id AND fs.service_code = 'emergency'
        WHERE f.status = 'active'
          AND (fs.unavailable_until IS NULL OR fs.unavailable_until <= now())
          AND (f.phone IS NOT NULL OR f.emergency_phone IS NOT NULL OR f.latitude IS NOT NULL)
        ORDER BY ${hasPosition ? 'distance_km NULLS LAST,' : ''}
                 (lower(coalesce(f.city, '')) = lower(coalesce(${cityParam}::text, ''))) DESC,
                 fs.available_24h DESC, f.name
        LIMIT 20`,
      hasPosition ? [lat, lng, city ?? null] : [city ?? null]
    ),
  ]);

  return {
    disclaimer: DISCLAIMER,
    generatedAt: new Date().toISOString(),
    numbers: numbers.rows,
    facilities: facilities.rows.map((f) => ({
      ...f,
      latitude: f.latitude === null ? null : Number(f.latitude),
      longitude: f.longitude === null ? null : Number(f.longitude),
      distance_km: f.distance_km === null ? null : Number(f.distance_km),
    })),
  };
};

exports.listNumbers = async () =>
  (await pool.query(`SELECT ${NUMBER_COLUMNS}, active FROM emergency_numbers ORDER BY sort_order, id`)).rows;

exports.createNumber = async (user, data) =>
  (await pool.query(
    `INSERT INTO emergency_numbers (label, number, province, source, verified_at, verified_by, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${NUMBER_COLUMNS}, active`,
    [data.label, data.number, data.province ?? null, data.source, data.verifiedAt, user.id, data.sortOrder ?? 0]
  )).rows[0];

exports.updateNumber = async (user, id, data) => {
  const r = await pool.query(
    `UPDATE emergency_numbers
        SET label = COALESCE($2, label),
            number = COALESCE($3, number),
            province = CASE WHEN $4::boolean THEN $5 ELSE province END,
            source = COALESCE($6, source),
            verified_at = COALESCE($7, verified_at),
            verified_by = CASE WHEN $7 IS NULL AND $6 IS NULL AND $3 IS NULL THEN verified_by ELSE $8 END,
            active = COALESCE($9, active),
            sort_order = COALESCE($10, sort_order),
            updated_at = now()
      WHERE id = $1
      RETURNING ${NUMBER_COLUMNS}, active`,
    [
      id,
      data.label ?? null,
      data.number ?? null,
      Object.prototype.hasOwnProperty.call(data, 'province'),
      data.province ?? null,
      data.source ?? null,
      data.verifiedAt ?? null,
      user.id,
      data.active ?? null,
      data.sortOrder ?? null,
    ]
  );
  if (!r.rowCount) throw httpError(404, 'Numéro introuvable');
  return r.rows[0];
};

exports.deleteNumber = async (id) => {
  const r = await pool.query('DELETE FROM emergency_numbers WHERE id = $1', [id]);
  if (!r.rowCount) throw httpError(404, 'Numéro introuvable');
};

exports.DISCLAIMER = DISCLAIMER;
