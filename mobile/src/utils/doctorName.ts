const TITLE = /^(dr|docteur)\.?$/i;
const LEADING_TITLE = /^((dr|docteur)\.?\s+)+/i;

const cleanParts = (parts: (string | null | undefined)[]) =>
  parts
    .map((p) => (p ?? '').trim().replace(LEADING_TITLE, ''))
    .filter((p) => p && !TITLE.test(p));

export const doctorName = (...parts: (string | null | undefined)[]) => {
  const name = cleanParts(parts).join(' ');
  return name ? `Dr. ${name}` : 'Médecin';
};

export const doctorShortName = (firstName?: string | null, lastName?: string | null) => {
  const [first, last] = [cleanParts([firstName])[0], cleanParts([lastName])[0]];
  if (first && last) return `Dr. ${first.charAt(0).toUpperCase()}. ${last}`;
  return doctorName(first, last);
};
