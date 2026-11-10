
const svc = require('../services/appointments.service');
const prescriptions = require('../services/prescriptions.service');

const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};

// =========================================
// RENDEZ-VOUS
// =========================================

// Réserver un rendez-vous
exports.book = wrap(async (req, res) => {
  res.status(201).json(
    await svc.book(req.user.id, req.body)
  );
});

// Liste des rendez-vous de l'utilisateur
exports.mine = wrap(async (req, res) => {
  res.json(
    await svc.listForUser(req.user, {
      scope: req.query.scope,
    })
  );
});

// Annuler un rendez-vous
exports.cancel = wrap(async (req, res) => {
  res.json(
    await svc.cancel(+req.params.id, req.user, req.body)
  );
});

// Déplacer un rendez-vous
exports.reschedule = wrap(async (req, res) => {
  res.json(
    await svc.reschedule(
      +req.params.id,
      req.user,
      req.body.startsAt
    )
  );
});


// =========================================
// FICHE DE CONSULTATION MÉDICALE
// =========================================

// Récupérer la fiche de consultation
exports.getConsultation = wrap(async (req, res) => {
  const result = await svc.getConsultation(
    +req.params.id,
    req.user.id
  );

  res.json({ ...result, addenda: await prescriptions.listAddenda(+req.params.id) });
});

// Enregistrer un brouillon
exports.saveConsultation = wrap(async (req, res) => {
  const result = await svc.saveConsultation(
    +req.params.id,
    req.user.id,
    req.body
  );

  res.json({
    message: 'Fiche de consultation enregistrée',
    consultation: result,
  });
});

// Terminer une consultation
exports.completeConsultation = wrap(async (req, res) => {
  const result = await svc.completeConsultation(
    +req.params.id,
    req.user.id,
    req.body
  );

  res.json({
    message: 'Consultation terminée avec succès',
    consultation: result,
  });
});
