const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/error');
const env = require('./config/env');

const parseTrustProxy = (value) => {
  if (value === undefined || value === '') return false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return /^\d+$/.test(value) ? Number(value) : value;
};

const app = express();
app.set('trust proxy', parseTrustProxy(env.trustProxy));
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);
module.exports = app;
