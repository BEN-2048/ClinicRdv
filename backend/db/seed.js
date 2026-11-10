// Données fictives + comptes de test (mot de passe : Test1234!)
const bcrypt = require('bcrypt');
const pool = require('../src/config/db');

async function user(email, role, first, last, hash) {
  const r = await pool.query(
    `INSERT INTO users(email,password_hash,role,first_name,last_name)
     VALUES($1,$2,$3,$4,$5) RETURNING id`, [email, hash, role, first, last]);
  return r.rows[0].id;
}

(async () => {
  const existing = await pool.query("SELECT 1 FROM users WHERE email = 'admin@clinic.test'");
  if (existing.rowCount > 0) {
    console.log('Données de test déjà présentes, seed ignoré');
    await pool.end();
    return;
  }
  const hash = await bcrypt.hash('Test1234!', 10);
  await user('admin@clinic.test', 'admin', 'Admin', 'Clinique', hash);
  const secretaryId = await user('secretaire@clinic.test', 'secretary', 'Grace', 'Kalenga', hash);
  await pool.query(
    `INSERT INTO facility_members(facility_id, user_id, role)
     SELECT id, $1, 'secretary' FROM facilities WHERE is_default`, [secretaryId]);
  await user('patient@clinic.test', 'patient', 'Marie', 'Mbuyi', hash);

  const specs = ['Généraliste', 'Pédiatre', 'Dentiste', 'Cardiologue', 'Dermatologue'];
  const ids = [];
  for (const s of specs) {
    const r = await pool.query('INSERT INTO specialties(name) VALUES($1) RETURNING id', [s]);
    ids.push(r.rows[0].id);
  }
  const docs = [['kabila', 'Kabila', 0], ['mutombo', 'Mutombo', 1], ['ilunga', 'Ilunga', 3]];
  for (const [login, name, i] of docs) {
    const uid = await user(`${login}@clinic.test`, 'doctor', 'Dr.', name, hash);
    const d = await pool.query(
      `INSERT INTO doctors(user_id,specialty_id,bio,fee,consultation_minutes)
       VALUES($1,$2,'Médecin de la clinique fictive.',20,30) RETURNING id`, [uid, ids[i]]);
    await pool.query(
      `INSERT INTO doctor_affiliations(doctor_id, facility_id)
       SELECT $1, id FROM facilities WHERE is_default`, [d.rows[0].id]);
    await pool.query(
      `INSERT INTO facility_specialties(facility_id, specialty_id)
       SELECT id, $1 FROM facilities WHERE is_default ON CONFLICT DO NOTHING`, [ids[i]]);
    for (let wd = 1; wd <= 5; wd++) {
      await pool.query(
        `INSERT INTO working_hours(doctor_id,weekday,start_time,end_time)
         VALUES($1,$2,'08:00','12:00'),($1,$2,'14:00','17:00')`, [d.rows[0].id, wd]);
    }
  }
  console.log('Seed OK');
  await pool.end();
})();
