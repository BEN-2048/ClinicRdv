// Données fictives + comptes de test (mot de passe : Test1234!)
require('dotenv').config();
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function user(email, role, first, last, hash) {
  const r = await pool.query(
    `INSERT INTO users(email,password_hash,role,first_name,last_name)
     VALUES($1,$2,$3,$4,$5) RETURNING id`, [email, hash, role, first, last]);
  return r.rows[0].id;
}

(async () => {
  const hash = await bcrypt.hash('Test1234!', 10);
  await user('admin@clinic.test', 'admin', 'Admin', 'Clinique', hash);
  await user('secretaire@clinic.test', 'secretary', 'Grace', 'Kalenga', hash);
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
    for (let wd = 1; wd <= 5; wd++) {
      await pool.query(
        `INSERT INTO working_hours(doctor_id,weekday,start_time,end_time)
         VALUES($1,$2,'08:00','12:00'),($1,$2,'14:00','17:00')`, [d.rows[0].id, wd]);
    }
  }
  console.log('Seed OK');
  await pool.end();
})();
