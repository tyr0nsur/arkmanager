const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const WEEKDAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MAX_PREVIEW_MINUTES = 366 * 24 * 60;

function normalizeCronValue(value, names, min, max) {
  const raw = String(value || '').trim().toUpperCase();
  if (names?.length) {
    const namedIndex = names.indexOf(raw);
    if (namedIndex !== -1) return min + namedIndex;
  }
  if (!/^\d+$/.test(raw)) return null;
  const parsed = Number.parseInt(raw, 10);
  if (parsed < min || parsed > max) return null;
  return parsed;
}

function expandCronField(field, { min, max, names, allowSevenAsSunday = false }) {
  const normalizedField = String(field || '').trim().toUpperCase();
  if (!normalizedField) return null;

  const values = new Set();
  const addValue = value => {
    const normalizedValue = allowSevenAsSunday && value === 7 ? 0 : value;
    if (normalizedValue < min || normalizedValue > max) return false;
    values.add(normalizedValue);
    return true;
  };

  for (const segment of normalizedField.split(',')) {
    if (!segment) return null;

    const [base, stepRaw] = segment.split('/');
    const step = stepRaw === undefined ? 1 : Number.parseInt(stepRaw, 10);
    if (!Number.isInteger(step) || step < 1) return null;

    let start;
    let end;
    if (base === '*') {
      start = min;
      end = allowSevenAsSunday ? 7 : max;
    } else if (base.includes('-')) {
      const [startRaw, endRaw] = base.split('-');
      start = normalizeCronValue(startRaw, names, min, allowSevenAsSunday ? 7 : max);
      end = normalizeCronValue(endRaw, names, min, allowSevenAsSunday ? 7 : max);
      if (start === null || end === null || start > end) return null;
    } else {
      const parsed = normalizeCronValue(base, names, min, allowSevenAsSunday ? 7 : max);
      if (parsed === null) return null;
      start = parsed;
      end = stepRaw === undefined ? parsed : (allowSevenAsSunday ? 7 : max);
    }

    for (let value = start; value <= end; value += step) {
      if (!addValue(value)) return null;
    }
  }

  return values.size ? values : null;
}

export function parseCronExpression(cronExpr) {
  const fields = String(cronExpr || '').trim().split(/\s+/).filter(Boolean);
  if (fields.length !== 5) return null;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  const parsed = {
    minutes: expandCronField(minute, { min: 0, max: 59 }),
    hours: expandCronField(hour, { min: 0, max: 23 }),
    daysOfMonth: expandCronField(dayOfMonth, { min: 1, max: 31 }),
    months: expandCronField(month, { min: 1, max: 12, names: MONTH_NAMES }),
    daysOfWeek: expandCronField(dayOfWeek, { min: 0, max: 6, names: WEEKDAY_NAMES, allowSevenAsSunday: true }),
  };

  return Object.values(parsed).every(Boolean) ? parsed : null;
}

function zonedDateParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    minute: 'numeric',
    hour: 'numeric',
    day: 'numeric',
    month: 'numeric',
    weekday: 'short',
    hourCycle: 'h23',
  });

  const parts = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
  return {
    minute: Number.parseInt(parts.minute, 10),
    hour: Number.parseInt(parts.hour, 10),
    dayOfMonth: Number.parseInt(parts.day, 10),
    month: Number.parseInt(parts.month, 10),
    dayOfWeek: WEEKDAY_NAMES.indexOf(String(parts.weekday || '').toUpperCase()),
  };
}

export function getNextCronExecutions(cronExpr, { count = 3, from = new Date(), timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone } = {}) {
  const parsed = parseCronExpression(cronExpr);
  if (!parsed) return [];

  const safeTimeZone = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const results = [];
  const cursor = new Date(from);
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);

  for (let checked = 0; checked < MAX_PREVIEW_MINUTES && results.length < count; checked += 1) {
    const parts = zonedDateParts(cursor, safeTimeZone);
    if (
      parsed.minutes.has(parts.minute) &&
      parsed.hours.has(parts.hour) &&
      parsed.daysOfMonth.has(parts.dayOfMonth) &&
      parsed.months.has(parts.month) &&
      parsed.daysOfWeek.has(parts.dayOfWeek)
    ) {
      results.push(new Date(cursor));
    }
    cursor.setMinutes(cursor.getMinutes() + 1);
  }

  return results;
}
