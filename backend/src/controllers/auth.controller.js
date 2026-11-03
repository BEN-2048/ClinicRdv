const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const env = require('../config/env');

const sign = (u) => jwt.sign({ id: u.id, role: u.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

exports.register = async (req, res, next) => {
  try {
    const { email, password, firstName, lastName, phone } = req.body;
    const hash = await bcrypt.hash(password, 10);
    // Les inscriptions publiques créent toujours des patients
    const r = await pool.query(
      `INSERT INTO users(email,password_hash,role,first_name,last_name,phone)
       VALUES($1,$2,'patient',$3,$4,$5) RETURNING id,email,role,first_name,last_name`,
      [email.toLowerCase(), hash, firstName, lastName, phone || null]);
    res.status(201).json({ user: r.rows[0], token: sign(r.rows[0]) });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'E-mail déjà utilisé' });
    next(e);
  }
};

exports.login = async (req, res, next) => {
  try {
    const r = await pool.query('SELECT * FROM users WHERE email=$1', [req.body.email.toLowerCase()]);
    const u = r.rows[0];
    if (!u || !(await bcrypt.compare(req.body.password, u.password_hash)))
      return res.status(401).json({ error: 'Identifiants incorrects' });
    res.json({
      user: { id: u.id, email: u.email, role: u.role, first_name: u.first_name, last_name: u.last_name },
      token: sign(u),
    });
  } catch (e) { next(e); }
};
