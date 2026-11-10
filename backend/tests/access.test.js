const { canAccessPatient, RULES } = require('../src/services/access.service');

const dbReturning = (rows) => ({ query: jest.fn().mockResolvedValue({ rows, rowCount: rows.length }) });

describe('canAccessPatient', () => {
  test.each([
    ['titulaire', { user_id: 7, link_status: null }, { view_record: true, view_appointments: true, book: true }],
    ['parent verifie', { user_id: null, link_status: 'verified' }, { view_record: true, view_appointments: true, book: true }],
    ['parent en attente', { user_id: null, link_status: 'pending' }, { view_record: false, view_appointments: true, book: true }],
    ['lien refuse', { user_id: null, link_status: 'rejected' }, { view_record: false, view_appointments: false, book: false }],
    ['lien revoque', { user_id: null, link_status: 'revoked' }, { view_record: false, view_appointments: false, book: false }],
    ['aucun lien', { user_id: 99, link_status: null }, { view_record: false, view_appointments: false, book: false }],
  ])('patient - %s', async (_label, row, expected) => {
    for (const [action, allowed] of Object.entries(expected)) {
      const result = await canAccessPatient({ id: 7, role: 'patient' }, 20, action, dbReturning([row]));
      expect([action, result.allowed]).toEqual([action, allowed]);
    }
  });

  test('patient - profil inexistant', async () => {
    const result = await canAccessPatient({ id: 7, role: 'patient' }, 999, 'book', dbReturning([]));
    expect(result).toEqual({ exists: false, basis: null, facilityIds: null, sharing: null, allowed: false });
  });

  test('medecin traitant - lit et complete le dossier, limite a ses etablissements de soins', async () => {
    const db = dbReturning([{ facility_id: 1 }, { facility_id: 3 }]);
    const result = await canAccessPatient({ id: 4, role: 'doctor' }, 20, 'view_record', db);
    expect(result).toMatchObject({ allowed: true, basis: 'treating_doctor', facilityIds: [1, 3] });
    expect((await canAccessPatient({ id: 4, role: 'doctor' }, 20, 'write_clinical', db)).allowed).toBe(true);
    expect((await canAccessPatient({ id: 4, role: 'doctor' }, 20, 'write_declared', db)).allowed).toBe(false);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain("a.status <> 'cancelled'");
    expect(sql).toContain("da.status = 'active'");
  });

  test('medecin sans rendez-vous avec le patient - aucun acces', async () => {
    const db = dbReturning([]);
    expect((await canAccessPatient({ id: 4, role: 'doctor' }, 20, 'view_appointments', db)).allowed).toBe(false);
  });

  test.each(['secretary', 'admin'])('%s - gestion des rendez-vous sans acces au dossier medical', async (role) => {
    const db = dbReturning([]);
    expect((await canAccessPatient({ id: 1, role }, 20, 'book', db)).allowed).toBe(true);
    expect((await canAccessPatient({ id: 1, role }, 20, 'view_record', db)).allowed).toBe(false);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('rejette une action inconnue', async () => {
    await expect(canAccessPatient({ id: 7, role: 'patient' }, 20, 'delete', dbReturning([]))).rejects.toThrow('Action inconnue');
  });

  test('lecture du dossier : titulaire, responsable verifie et medecin traitant uniquement', () => {
    const readers = Object.entries(RULES).filter(([, actions]) => actions.includes('view_record')).map(([b]) => b);
    expect(readers.sort()).toEqual(['guardian_verified', 'self', 'treating_doctor']);
  });

  test('seul le medecin traitant ecrit des informations cliniques', () => {
    const writers = Object.entries(RULES).filter(([, actions]) => actions.includes('write_clinical')).map(([b]) => b);
    expect(writers).toEqual(['treating_doctor']);
  });
});
