const pool = require('../config/db');
const { assertAccess, logAccess } = require('./access.service');

const httpError = (status, message) =>
  Object.assign(new Error(message), { status });

const KINDS = {
  allergies: {
    table: 'patient_allergies',
    fields: {
      substance: 'substance',
      reaction: 'reaction',
      severity: 'severity',
      status: 'status',
      notedOn: 'noted_on',
      notes: 'notes',
    },
    declarable: true,
    order: "e.status, CASE e.severity WHEN 'severe' THEN 0 WHEN 'moderate' THEN 1 WHEN 'mild' THEN 2 ELSE 3 END, e.substance",
  },
  conditions: {
    table: 'patient_conditions',
    fields: {
      label: 'label',
      icd10Code: 'icd10_code',
      onsetDate: 'onset_date',
      status: 'status',
      notes: 'notes',
    },
    declarable: false,
    order: 'e.status, e.onset_date DESC NULLS LAST, e.label',
  },
  medications: {
    table: 'patient_medications',
    fields: {
      name: 'name',
      dosage: 'dosage',
      frequency: 'frequency',
      startDate: 'start_date',
      endDate: 'end_date',
      status: 'status',
      notes: 'notes',
    },
    declarable: false,
    order: 'e.status, e.start_date DESC NULLS LAST, e.name',
  },
  immunizations: {
    table: 'immunizations',
    fields: {
      vaccine: 'vaccine',
      doseLabel: 'dose_label',
      administeredOn: 'administered_on',
      lotNumber: 'lot_number',
      notes: 'notes',
    },
    declarable: false,
    order: 'e.administered_on DESC',
  },
};

exports.KINDS = Object.keys(KINDS);

const isClinicalReader = (access) => ['treating_doctor', 'emergency_access'].includes(access.basis);

const visibilitySql = (access, includeErrors) => {
  const parts = [];
  if (!(includeErrors && access.basis === 'treating_doctor')) parts.push('NOT e.entered_in_error');
  if (access.basis === 'guardian_verified') parts.push('NOT e.confidential');
  if (isClinicalReader(access)) {
    const shared = access.sharing?.summaryAll
      ? ` OR ${access.sharing.fullAll ? 'true' : 'NOT e.confidential'}`
      : '';
    parts.push(`(e.facility_id = ANY($2::int[]) OR e.facility_id IS NULL${shared})`);
  }
  return parts.length ? parts.join(' AND ') : 'true';
};

const listKind = (kind, patientId, access, includeErrors) => {
  const { table, order } = KINDS[kind];
  const params = [patientId];
  if (isClinicalReader(access)) params.push(access.facilityIds);
  return pool.query(
    `SELECT e.*, f.name AS facility_name,
            u.first_name || ' ' || u.last_name AS recorded_by_name, u.role AS recorded_by_role
       FROM ${table} e
       LEFT JOIN facilities f ON f.id = e.facility_id
       LEFT JOIN users u ON u.id = e.recorded_by
      WHERE e.patient_id = $1 AND ${visibilitySql(access, includeErrors)}
      ORDER BY ${order}`,
    params
  );
};

exports.getRecord = async (user, patientId, { ip, includeErrors = false } = {}) => {
  const access = await assertAccess(user, patientId, 'view_summary', {
    ip, audit: true, resource: 'record_summary',
  });

  const [patient, ...lists] = await Promise.all([
    pool.query(
      `SELECT id, patient_number, first_name, last_name, birth_date, sex
         FROM patients WHERE id = $1`,
      [patientId]
    ),
    ...exports.KINDS.map((k) => listKind(k, patientId, access, includeErrors)),
  ]);

  const facilities = isClinicalReader(access) && access.facilityIds.length
    ? (await pool.query('SELECT id, name FROM facilities WHERE id = ANY($1::int[]) ORDER BY name', [access.facilityIds])).rows
    : [];

  return {
    patient: patient.rows[0],
    ...Object.fromEntries(exports.KINDS.map((k, i) => [k, lists[i].rows])),
    access: {
      basis: access.basis,
      canWriteClinical: access.basis === 'treating_doctor',
      canDeclare: ['self', 'guardian_verified'].includes(access.basis),
      facilities,
      sharing: access.sharing ?? null,
    },
  };
};

const writeAccess = async (user, patientId, ip) => {
  const action = user.role === 'doctor' ? 'write_clinical' : 'write_declared';
  return assertAccess(user, patientId, action, { ip, audit: true, resource: 'record_write' });
};

const pickFacility = (access, requested) => {
  if (requested) {
    if (!access.facilityIds.includes(requested)) throw httpError(403, 'Établissement hors de votre relation de soins');
    return requested;
  }
  if (access.facilityIds.length === 1) return access.facilityIds[0];
  throw httpError(400, 'Précisez l’établissement dans lequel vous enregistrez cette information');
};

exports.addEntry = async (user, patientId, kind, data, { ip } = {}) => {
  const def = KINDS[kind];
  if (user.role !== 'doctor' && !def.declarable) {
    throw httpError(403, 'Seul un médecin peut ajouter cette information');
  }
  const access = await writeAccess(user, patientId, ip);
  const clinician = access.basis === 'treating_doctor';

  const cols = ['patient_id', 'source', 'recorded_by', 'updated_by', 'facility_id', 'confidential'];
  const values = [
    patientId,
    clinician ? 'clinician' : 'patient',
    user.id,
    user.id,
    clinician ? pickFacility(access, data.facilityId) : null,
    clinician ? !!data.confidential : false,
  ];
  for (const [key, col] of Object.entries(def.fields)) {
    if (data[key] === undefined) continue;
    cols.push(col);
    values.push(data[key]);
  }

  const r = await pool.query(
    `INSERT INTO ${def.table} (${cols.join(', ')})
     VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})
     RETURNING *`,
    values
  );
  await logAccess({
    user, patientId, action: 'create', granted: true, basis: access.basis, ip, resource: def.table, resourceId: r.rows[0].id,
  });
  return r.rows[0];
};

const loadEditable = async (user, patientId, kind, entryId, ip) => {
  const def = KINDS[kind];
  const access = await writeAccess(user, patientId, ip);
  const r = await pool.query(
    `SELECT * FROM ${def.table} WHERE id = $1 AND patient_id = $2`,
    [entryId, patientId]
  );
  const entry = r.rows[0];
  if (!entry) throw httpError(404, 'Information introuvable');
  if (entry.entered_in_error) throw httpError(409, 'Cette information a été marquée comme erronée');

  const clinician = access.basis === 'treating_doctor';
  const allowed = clinician
    ? entry.facility_id === null || access.facilityIds.includes(entry.facility_id)
    : entry.source === 'patient';
  if (!allowed) throw httpError(403, 'Vous ne pouvez pas modifier cette information');

  return { def, access, entry, clinician };
};

exports.updateEntry = async (user, patientId, kind, entryId, data, { ip } = {}) => {
  const { def, access, clinician } = await loadEditable(user, patientId, kind, entryId, ip);

  if (data.confidential !== undefined && !clinician) {
    throw httpError(403, 'Seul un médecin peut rendre une information confidentielle');
  }

  const sets = ['updated_by = $3'];
  const values = [entryId, patientId, user.id];
  const fields = { ...def.fields, confidential: 'confidential' };
  for (const [key, col] of Object.entries(fields)) {
    if (data[key] === undefined) continue;
    values.push(data[key]);
    sets.push(`${col} = $${values.length}`);
  }

  const r = await pool.query(
    `UPDATE ${def.table} SET ${sets.join(', ')}
      WHERE id = $1 AND patient_id = $2 AND NOT entered_in_error
      RETURNING *`,
    values
  );
  if (!r.rowCount) throw httpError(409, 'Cette information a été modifiée entre-temps');
  await logAccess({
    user, patientId, action: 'update', granted: true, basis: access.basis, ip, resource: def.table, resourceId: entryId,
  });
  return r.rows[0];
};

exports.markEnteredInError = async (user, patientId, kind, entryId, { reason }, { ip } = {}) => {
  const { def, access } = await loadEditable(user, patientId, kind, entryId, ip);
  const r = await pool.query(
    `UPDATE ${def.table}
        SET entered_in_error = true, error_reason = $3, updated_by = $4
      WHERE id = $1 AND patient_id = $2 AND NOT entered_in_error
      RETURNING *`,
    [entryId, patientId, reason, user.id]
  );
  if (!r.rowCount) throw httpError(409, 'Cette information a déjà été marquée comme erronée');
  await logAccess({
    user, patientId, action: 'entered_in_error', granted: true, basis: access.basis, ip, resource: def.table, resourceId: entryId,
  });
  return r.rows[0];
};
