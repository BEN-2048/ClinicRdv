const DRC_PREFIX = '+243';
const DRC_NATIONAL = /^[89][0-9]{8}$/;

exports.normalizeDrcPhone = (input) => {
  if (typeof input !== 'string') return null;
  let digits = input.trim().replace(/[\s.()-]/g, '');
  if (!/^\+?[0-9]+$/.test(digits)) return null;

  if (digits.startsWith('+243')) digits = digits.slice(4);
  else if (digits.startsWith('00243')) digits = digits.slice(5);
  else if (digits.startsWith('243') && digits.length === 12) digits = digits.slice(3);
  else if (digits.startsWith('+')) return null;
  else if (digits.startsWith('0') && digits.length === 10) digits = digits.slice(1);

  return DRC_NATIONAL.test(digits) ? `${DRC_PREFIX}${digits}` : null;
};

exports.formatDrcPhone = (e164) =>
  /^\+243[0-9]{9}$/.test(e164 ?? '')
    ? `+243 ${e164.slice(4, 6)} ${e164.slice(6, 9)} ${e164.slice(9)}`
    : e164;

exports.maskPhone = (e164) =>
  typeof e164 === 'string' && e164.length > 6 ? `${e164.slice(0, 6)}•••${e164.slice(-2)}` : '•••';
