const DEFAULT_TIMEZONE = 'Africa/Lubumbashi';
const SUPPORTED_TIMEZONES = ['Africa/Kinshasa', 'Africa/Lubumbashi'];
const MINUTE_MS = 60000;

const formatters = new Map();

const partsFormatter = (timeZone) => {
  if (!formatters.has(timeZone)) {
    formatters.set(timeZone, new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }));
  }
  return formatters.get(timeZone);
};

const zonedParts = (date, timeZone) =>
  Object.fromEntries(
    partsFormatter(timeZone).formatToParts(date).map((p) => [p.type, p.value])
  );

const offsetMinutes = (date, timeZone) => {
  const v = zonedParts(date, timeZone);
  const asUtc = Date.UTC(+v.year, +v.month - 1, +v.day, +v.hour, +v.minute, +v.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / MINUTE_MS);
};

const localToUtc = (year, month, day, minutesOfDay, timeZone) => {
  const guess = Date.UTC(year, month - 1, day, 0, minutesOfDay);
  const first = guess - offsetMinutes(new Date(guess), timeZone) * MINUTE_MS;
  return new Date(guess - offsetMinutes(new Date(first), timeZone) * MINUTE_MS);
};

const localDateString = (date, timeZone) => {
  const v = zonedParts(date, timeZone);
  return `${v.year}-${v.month}-${v.day}`;
};

module.exports = {
  DEFAULT_TIMEZONE,
  SUPPORTED_TIMEZONES,
  offsetMinutes,
  localToUtc,
  localDateString,
};
