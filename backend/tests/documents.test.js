const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clinicrdv-docs-'));
process.env.JWT_SECRET = 'test-secret';
process.env.STORAGE_LOCAL_DIR = storageDir;
process.env.FILE_URL_SECRET = 'test-file-secret';

jest.mock('../src/config/db', () => ({ query: jest.fn(), connect: jest.fn() }));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const pool = require('../src/config/db');
const app = require('../src/app');
const storage = require('../src/storage');
const { detectMime } = require('../src/services/documents.service');

const token = (role, id) => `Bearer ${jwt.sign({ id, role }, 'test-secret')}`;

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), crypto.randomBytes(200)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), crypto.randomBytes(64)]);
const EXE = Buffer.concat([Buffer.from('MZ'), crypto.randomBytes(64)]);

const filesOnDisk = () => {
  const dir = path.join(storageDir, 'documents');
  return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
};

let documents = {};

const setup = ({ patientAccess = null, doctorFacilities = [], doc = null } = {}) => {
  pool.query.mockReset();
  pool.query.mockImplementation(async (sql, params) => {
    if (sql.includes('LEFT JOIN patient_guardians g')) {
      return { rows: patientAccess ? [patientAccess] : [], rowCount: patientAccess ? 1 : 0 };
    }
    if (sql.includes('SELECT DISTINCT a.facility_id')) {
      return { rows: doctorFacilities.map((facility_id) => ({ facility_id })), rowCount: doctorFacilities.length };
    }
    if (sql.startsWith('INSERT INTO medical_documents')) {
      const id = 40 + Object.keys(documents).length;
      documents[id] = { id, storage_key: params[8], mime_type: params[9], sha256: params[11] };
      return { rows: [{ id }], rowCount: 1 };
    }
    if (sql.includes('FROM medical_documents d') && sql.includes('WHERE d.id = $1')) {
      return { rows: [{ id: params[0] }], rowCount: 1 };
    }
    if (sql === 'SELECT * FROM medical_documents WHERE id = $1') {
      return { rows: doc ? [doc] : [], rowCount: doc ? 1 : 0 };
    }
    if (sql.includes('FROM medical_documents WHERE id = $1 AND storage_key = $2')) {
      const found = Object.values(documents).find((d) => d.id === params[0] && d.storage_key === params[1]);
      return { rows: found ? [found] : [], rowCount: found ? 1 : 0 };
    }
    return { rows: [], rowCount: 0 };
  });
};

const insertParams = () => pool.query.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO medical_documents'))?.[1];

const upload = (role, id, buffer, fields = {}, filename = 'resultat.pdf', contentType = 'application/pdf') => {
  const req = request(app).post('/api/patients/20/documents').set('Authorization', token(role, id));
  for (const [k, v] of Object.entries({ category: 'lab_result', title: 'NFS', ...fields })) req.field(k, String(v));
  return req.attach('file', buffer, { filename, contentType });
};

beforeEach(() => {
  documents = {};
});

afterAll(() => {
  fs.rmSync(storageDir, { recursive: true, force: true });
});

describe('Détection du type réel des fichiers', () => {
  test.each([
    [PDF, 'application/pdf'],
    [PNG, 'image/png'],
    [Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]), 'image/jpeg'],
    [EXE, null],
    [Buffer.from('<html><script>alert(1)</script>'), null],
  ])('%#', (buffer, expected) => {
    expect(detectMime(buffer)).toBe(expected);
  });
});

describe('Dépôt de documents', () => {
  test('le patient depose un PDF : stocke sous une cle aleatoire, publie, jamais confidentiel', async () => {
    setup({ patientAccess: { user_id: 7, link_status: null } });
    const before = filesOnDisk().length;
    const res = await upload('patient', 7, PDF, { confidential: 'true' });

    expect(res.status).toBe(201);
    const params = insertParams();
    expect(params[8]).toMatch(/^documents\/[0-9a-f-]{36}$/);
    expect(params[9]).toBe('application/pdf');
    expect(params[10]).toBe(PDF.length);
    expect(params[11]).toBe(crypto.createHash('sha256').update(PDF).digest('hex'));
    expect(params.slice(12, 15)).toEqual(['patient', false, true]);
    expect(params[1]).toBeNull();
    expect(filesOnDisk().length).toBe(before + 1);
    expect(fs.readFileSync(path.join(storageDir, ...params[8].split('/')))).toEqual(PDF);
  });

  test('le nom du fichier envoye n est jamais utilise pour le stockage', async () => {
    setup({ patientAccess: { user_id: 7, link_status: null } });
    await upload('patient', 7, PDF, {}, '../../../etc/passwd.pdf');
    expect(insertParams()[8]).toMatch(/^documents\/[0-9a-f-]{36}$/);
  });

  test.each([
    ['executable', EXE, 'application/pdf'],
    ['page HTML', Buffer.from('<html></html>'), 'text/html'],
    ['PNG declare comme PDF', PNG, 'application/pdf'],
  ])('refuse un %s sans rien ecrire', async (_label, buffer, contentType) => {
    setup({ patientAccess: { user_id: 7, link_status: null } });
    const before = filesOnDisk().length;
    const res = await upload('patient', 7, buffer, {}, 'fichier.pdf', contentType);
    expect(res.status).toBe(415);
    expect(insertParams()).toBeUndefined();
    expect(filesOnDisk().length).toBe(before);
  });

  test('refuse un fichier de plus de 10 Mo', async () => {
    setup({ patientAccess: { user_id: 7, link_status: null } });
    const big = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(10 * 1024 * 1024)]);
    const res = await upload('patient', 7, big);
    expect(res.status).toBe(413);
    expect(insertParams()).toBeUndefined();
  });

  test('le medecin peut retenir un resultat avant de le publier au patient', async () => {
    setup({ doctorFacilities: [3] });
    const res = await upload('doctor', 4, PDF, { releaseNow: 'false', confidential: 'true' });
    expect(res.status).toBe(201);
    const params = insertParams();
    expect(params[1]).toBe(3);
    expect(params.slice(12, 15)).toEqual(['clinician', true, false]);
  });

  test('un medecin sans relation de soins ne depose rien', async () => {
    setup({ doctorFacilities: [] });
    const before = filesOnDisk().length;
    const res = await upload('doctor', 4, PDF);
    expect(res.status).toBe(403);
    expect(filesOnDisk().length).toBe(before);
  });

  test('un lien parental en attente ne permet pas de deposer', async () => {
    setup({ patientAccess: { user_id: null, link_status: 'pending' } });
    const res = await upload('patient', 7, PDF);
    expect(res.status).toBe(403);
  });

  test.each(['secretary', 'admin'])('le role %s ne depose pas de document medical', async (role) => {
    setup();
    const res = await upload(role, 1, PDF);
    expect(res.status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test.each([
    [{ category: 'radio' }],
    [{ title: '' }],
    [{ documentDate: '12/01/2026' }],
    [{ uploadedBy: '1' }],
  ])('rejette des informations invalides %j', async (fields) => {
    setup({ patientAccess: { user_id: 7, link_status: null } });
    const res = await upload('patient', 7, PDF, fields);
    expect(res.status).toBe(400);
  });
});

describe('Consultation des documents', () => {
  test('le patient ne voit que les documents publies et valides', async () => {
    setup({ patientAccess: { user_id: 7, link_status: null } });
    const res = await request(app).get('/api/patients/20/documents').set('Authorization', token('patient', 7));
    expect(res.status).toBe(200);
    const [sql] = pool.query.mock.calls.find(([q]) => q.includes('FROM medical_documents d') && q.includes('d.patient_id = $1'));
    expect(sql).toContain('NOT d.entered_in_error AND d.released_at IS NOT NULL');
    expect(sql).not.toContain('storage_key');
  });

  test('un tuteur ne voit pas les documents confidentiels', async () => {
    setup({ patientAccess: { user_id: null, link_status: 'verified' } });
    await request(app).get('/api/patients/20/documents').set('Authorization', token('patient', 7));
    const [sql] = pool.query.mock.calls.find(([q]) => q.includes('d.patient_id = $1'));
    expect(sql).toContain('AND NOT d.confidential');
  });

  test('un lien de telechargement temporaire ouvre le fichier, sans cache', async () => {
    setup({ patientAccess: { user_id: 7, link_status: null } });
    await upload('patient', 7, PDF);
    const stored = Object.values(documents)[0];
    const doc = { id: stored.id, patient_id: 20, facility_id: null, storage_key: stored.storage_key, mime_type: 'application/pdf', released_at: new Date(), entered_in_error: false, confidential: false, source: 'patient' };
    setup({ patientAccess: { user_id: 7, link_status: null }, doc });
    documents[stored.id] = stored;

    const link = await request(app).post(`/api/documents/${stored.id}/download-link`).set('Authorization', token('patient', 7));
    expect(link.status).toBe(200);
    expect(new Date(link.body.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(300 * 1000);
    const filePath = link.body.url.replace(/^https?:\/\/[^/]+/, '');

    const file = await request(app).get(filePath).buffer(true).parse((res, cb) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('application/pdf');
    expect(file.headers['cache-control']).toContain('no-store');
    expect(file.body).toEqual(PDF);

    const logs = pool.query.mock.calls.filter(([q]) => q.includes('INSERT INTO patient_access_logs')).map(([, p]) => p[3]);
    expect(logs).toContain('download_link');
  });

  test('un document non publie ne donne pas de lien au patient', async () => {
    const doc = { id: 41, patient_id: 20, facility_id: 3, storage_key: 'documents/x', released_at: null, entered_in_error: false, confidential: false, source: 'clinician' };
    setup({ patientAccess: { user_id: 7, link_status: null }, doc });
    const res = await request(app).post('/api/documents/41/download-link').set('Authorization', token('patient', 7));
    expect(res.status).toBe(404);
  });

  test('le medecin d un autre etablissement n obtient pas de lien', async () => {
    const doc = { id: 41, patient_id: 20, facility_id: 3, storage_key: 'documents/x', released_at: new Date(), entered_in_error: false, confidential: false, source: 'clinician' };
    setup({ doctorFacilities: [1], doc });
    const res = await request(app).post('/api/documents/41/download-link').set('Authorization', token('doctor', 4));
    expect(res.status).toBe(404);
  });
});

describe('Liens temporaires', () => {
  const key = `documents/${crypto.randomUUID()}`;

  test('un lien falsifie est refuse', async () => {
    setup();
    const { token: t } = storage.createDownloadToken(41, key);
    const [payload, sig] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ d: 99, k: key, e: 9999999999 })).toString('base64url');
    expect(storage.verifyDownloadToken(`${forged}.${sig}`)).toBeNull();
    const res = await request(app).get(`/api/files/${forged}.${sig}`);
    expect(res.status).toBe(404);
    expect(storage.verifyDownloadToken(`${payload}.${sig}`)).toEqual({ documentId: 41, key });
  });

  test('un lien expire apres 5 minutes', () => {
    const now = Date.now();
    const { token: t } = storage.createDownloadToken(41, key, now);
    expect(storage.verifyDownloadToken(t, now + 299 * 1000)).not.toBeNull();
    expect(storage.verifyDownloadToken(t, now + 301 * 1000)).toBeNull();
  });

  test('un lien mal forme est rejete avant tout acces', async () => {
    setup();
    const res = await request(app).get('/api/files/..%2F..%2Fetc%2Fpasswd');
    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('Publication et correction', () => {
  const clinicianDoc = { id: 41, patient_id: 20, facility_id: 3, source: 'clinician', released_at: null, entered_in_error: false };

  test('seul un medecin publie un document', async () => {
    setup({ patientAccess: { user_id: 7, link_status: null }, doc: clinicianDoc });
    const res = await request(app).post('/api/documents/41/release').set('Authorization', token('patient', 7));
    expect(res.status).toBe(403);
  });

  test('le medecin publie un resultat retenu', async () => {
    setup({ doctorFacilities: [3], doc: clinicianDoc });
    const res = await request(app).post('/api/documents/41/release').set('Authorization', token('doctor', 4));
    expect(res.status).toBe(200);
    expect(pool.query.mock.calls.some(([q]) => q.startsWith('UPDATE medical_documents SET released_at = now()'))).toBe(true);
  });

  test('le patient ne marque pas erronee une piece deposee par le medecin', async () => {
    setup({ patientAccess: { user_id: 7, link_status: null }, doc: clinicianDoc });
    const res = await request(app).post('/api/documents/41/entered-in-error').set('Authorization', token('patient', 7)).send({ reason: 'Pas moi' });
    expect(res.status).toBe(403);
  });
});

describe('Migration 012_medical_documents', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', '012_medical_documents.sql'), 'utf8');

  test('limite les formats, la taille et protege le fichier d origine', () => {
    expect(sql).toContain("CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png'))");
    expect(sql).toContain('size_bytes <= 10485760');
    expect(sql).toContain("Le fichier et le patient d''un document ne peuvent pas etre modifies");
    expect(sql).toContain('BEFORE DELETE ON medical_documents');
  });

  test('un document depose par le patient est toujours publie', () => {
    expect(sql).toContain("CHECK (source = 'clinician' OR released_at IS NOT NULL)");
  });

  test('ne supprime aucune donnee existante', () => {
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b|\bDELETE\s+FROM\b|\bTRUNCATE\b/i);
  });
});
