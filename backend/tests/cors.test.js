const express = require('express');
const cors = require('cors');
const request = require('supertest');
const { corsOptions, parseOrigins } = require('../src/config/cors');

const appWith = (config) => {
  const app = express();
  app.use(cors(corsOptions(config)));
  app.get('/ping', (req, res) => res.json({ ok: true }));
  return app;
};

const ALLOW = 'access-control-allow-origin';

describe('CORS', () => {
  test('analyse la liste, sans espaces ni barre finale', () => {
    expect(parseOrigins(' https://a.cd/ , http://localhost:8081,,')).toEqual(['https://a.cd', 'http://localhost:8081']);
    expect(parseOrigins(undefined)).toEqual([]);
  });

  test('en developpement sans liste, toutes les origines sont acceptees', async () => {
    const res = await request(appWith({ nodeEnv: 'development' })).get('/ping').set('Origin', 'http://evil.test');
    expect(res.headers[ALLOW]).toBe('http://evil.test');
  });

  test('en production sans liste, aucune origine navigateur n est acceptee', async () => {
    const res = await request(appWith({ nodeEnv: 'production' })).get('/ping').set('Origin', 'http://evil.test');
    expect(res.status).toBe(200);
    expect(res.headers[ALLOW]).toBeUndefined();
  });

  test('avec une liste, seules les origines listees recoivent l en-tete', async () => {
    const app = appWith({ nodeEnv: 'production', corsOrigins: 'https://clinicrdv.cd, http://localhost:8081' });
    expect((await request(app).get('/ping').set('Origin', 'https://clinicrdv.cd')).headers[ALLOW]).toBe('https://clinicrdv.cd');
    expect((await request(app).get('/ping').set('Origin', 'https://clinicrdv.cd.evil.test')).headers[ALLOW]).toBeUndefined();
  });

  test('le pre-vol d une origine refusee n autorise rien', async () => {
    const app = appWith({ nodeEnv: 'production', corsOrigins: 'https://clinicrdv.cd' });
    const res = await request(app).options('/ping').set('Origin', 'http://evil.test').set('Access-Control-Request-Method', 'POST');
    expect(res.headers[ALLOW]).toBeUndefined();
  });

  test('l app mobile, sans en-tete Origin, n est pas bloquee', async () => {
    const app = appWith({ nodeEnv: 'production', corsOrigins: 'https://clinicrdv.cd' });
    const res = await request(app).get('/ping');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  test('l etoile est refusee en production et acceptee en developpement', () => {
    expect(() => corsOptions({ nodeEnv: 'production', corsOrigins: '*' })).toThrow('interdit en production');
    expect(corsOptions({ nodeEnv: 'development', corsOrigins: '*' })).toEqual({ origin: true });
  });
});
