const svc = require('../services/recommendation.service');

exports.doctors = async (req, res, next) => {
  try {
    res.json(await svc.recommend(req.user, req.query));
  } catch (error) {
    next(error);
  }
};
