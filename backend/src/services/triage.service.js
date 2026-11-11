const pool = require('../config/db');

const DISCLAIMER = 'Cette orientation est indicative et ne remplace pas un avis médical. En cas de doute, contactez un professionnel de santé ou les services d’urgence.';

const RED_FLAGS = [
  { code: 'chest_pain', label: 'Douleur ou serrement dans la poitrine' },
  { code: 'breathing', label: 'Grande difficulté à respirer' },
  { code: 'unconscious', label: 'Perte de connaissance ou confusion soudaine' },
  { code: 'stroke_signs', label: 'Visage déformé, bras faible ou trouble de la parole' },
  { code: 'heavy_bleeding', label: 'Saignement abondant qui ne s’arrête pas' },
  { code: 'seizure', label: 'Convulsions' },
  { code: 'severe_burn', label: 'Brûlure étendue ou grave' },
  { code: 'pregnancy_bleeding', label: 'Saignement ou douleur forte pendant la grossesse' },
];

const SYMPTOMS = [
  { code: 'fever', label: 'Fièvre', weights: { 'Généraliste': 3, 'Pédiatre': 1 } },
  { code: 'cough', label: 'Toux', weights: { 'Généraliste': 3, 'Pédiatre': 1 } },
  { code: 'headache', label: 'Maux de tête', weights: { 'Généraliste': 3 } },
  { code: 'fatigue', label: 'Fatigue inhabituelle', weights: { 'Généraliste': 3, 'Cardiologue': 1 } },
  { code: 'stomach', label: 'Douleurs au ventre, diarrhée ou vomissements', weights: { 'Généraliste': 3, 'Pédiatre': 1 } },
  { code: 'palpitations', label: 'Palpitations ou cœur qui bat irrégulièrement', weights: { 'Cardiologue': 4, 'Généraliste': 1 } },
  { code: 'high_bp', label: 'Tension artérielle élevée connue', weights: { 'Cardiologue': 3, 'Généraliste': 2 } },
  { code: 'swollen_legs', label: 'Jambes ou chevilles gonflées', weights: { 'Cardiologue': 3, 'Généraliste': 2 } },
  { code: 'breathless_effort', label: 'Essoufflement à l’effort', weights: { 'Cardiologue': 3, 'Généraliste': 2 } },
  { code: 'toothache', label: 'Mal de dents', weights: { 'Dentiste': 5 } },
  { code: 'gums', label: 'Gencives qui saignent ou gonflées', weights: { 'Dentiste': 5 } },
  { code: 'jaw', label: 'Douleur à la mâchoire', weights: { 'Dentiste': 3, 'Généraliste': 1 } },
  { code: 'rash', label: 'Boutons, plaques ou éruption sur la peau', weights: { 'Dermatologue': 4, 'Généraliste': 1, 'Pédiatre': 1 } },
  { code: 'itching', label: 'Démangeaisons', weights: { 'Dermatologue': 4, 'Généraliste': 1 } },
  { code: 'mole', label: 'Grain de beauté qui change', weights: { 'Dermatologue': 5 } },
  { code: 'hair_nails', label: 'Problème de cheveux ou d’ongles', weights: { 'Dermatologue': 4 } },
  { code: 'child_growth', label: 'Suivi de croissance ou vaccins d’un enfant', weights: { 'Pédiatre': 5, 'Généraliste': 1 } },
  { code: 'checkup', label: 'Bilan de santé ou renouvellement d’ordonnance', weights: { 'Généraliste': 4 } },
];

const FALLBACK = 'Généraliste';
const PEDIATRIC_AGE = 15;

const symptomByCode = new Map(SYMPTOMS.map((s) => [s.code, s]));
const flagByCode = new Map(RED_FLAGS.map((f) => [f.code, f]));

exports.DISCLAIMER = DISCLAIMER;

exports.catalog = () => ({
  disclaimer: DISCLAIMER,
  redFlags: RED_FLAGS.map(({ code, label }) => ({ code, label })),
  symptoms: SYMPTOMS.map(({ code, label }) => ({ code, label })),
});

const unknownCodes = (codes) => codes.filter((c) => !symptomByCode.has(c) && !flagByCode.has(c));

exports.orient = async ({ symptoms, age }) => {
  const unknown = unknownCodes(symptoms);
  if (unknown.length) {
    const err = new Error(`Symptômes inconnus : ${unknown.join(', ')}`);
    err.status = 400;
    throw err;
  }

  const flags = symptoms.filter((c) => flagByCode.has(c)).map((c) => flagByCode.get(c));
  if (flags.length) {
    return {
      urgent: true,
      disclaimer: DISCLAIMER,
      message: 'Ces signes peuvent indiquer une urgence. N’attendez pas un rendez-vous : appelez les secours ou rendez-vous au service d’urgence le plus proche.',
      redFlags: flags.map(({ code, label }) => ({ code, label })),
      suggestions: [],
    };
  }

  const scores = new Map();
  const reasons = new Map();
  const add = (name, points, reason) => {
    scores.set(name, (scores.get(name) || 0) + points);
    if (!reasons.has(name)) reasons.set(name, []);
    reasons.get(name).push(reason);
  };

  for (const code of symptoms) {
    const s = symptomByCode.get(code);
    for (const [name, w] of Object.entries(s.weights)) add(name, w, s.label);
  }

  const isChild = age !== undefined && age < PEDIATRIC_AGE;
  if (isChild && scores.size) add('Pédiatre', Math.max(...scores.values()), `Patient de moins de ${PEDIATRIC_AGE} ans`);
  if (age !== undefined && !isChild) scores.delete('Pédiatre');
  if (!scores.size) add(FALLBACK, 1, 'Premier recours pour toute question de santé');

  const { rows } = await pool.query(
    'SELECT id, name FROM specialties WHERE name = ANY($1::text[])',
    [[...scores.keys(), FALLBACK]]
  );
  const idByName = new Map(rows.map((r) => [r.name, r.id]));

  let ranked = [...scores.entries()]
    .filter(([name]) => idByName.has(name))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'));

  if (!ranked.length && idByName.has(FALLBACK)) {
    ranked = [[FALLBACK, 1]];
    reasons.set(FALLBACK, ['Premier recours pour toute question de santé']);
  }

  const top = ranked.length ? ranked[0][1] : 0;
  return {
    urgent: false,
    disclaimer: DISCLAIMER,
    suggestions: ranked.slice(0, 3).map(([name, score]) => ({
      specialtyId: idByName.get(name),
      name,
      confidence: score === top ? 'forte' : score >= top / 2 ? 'moyenne' : 'faible',
      reasons: [...new Set(reasons.get(name))],
    })),
  };
};
