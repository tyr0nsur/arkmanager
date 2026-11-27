export const TASK_MIN_INTERVAL_MINUTES = { Broadcast: 5, SaveWorld: 15, DoExit: 60 };

export function cronMinuteInterval(cronExpr) {
  const fields = String(cronExpr || '').trim().split(/\s+/);
  if (fields.length !== 5) return null;

  const [minuteField, hourField, dayOfMonth, month, dayOfWeek] = fields;
  const isEveryDay = isEveryDaySchedule(dayOfMonth, month, dayOfWeek);
  const isEveryHour = isEveryHourField(hourField);

  if (minuteField === '*') return 1;
  const stepMatch = minuteField.match(/^\*\/(\d+)$/);
  if (stepMatch) return Number.parseInt(stepMatch[1], 10);

  if (isEveryHour && isEveryDay) {
    const listedMinuteInterval = regularIntervalFromList(minuteField, 0, 59);
    if (listedMinuteInterval) return listedMinuteInterval;

    const rangedMinuteInterval = regularIntervalFromRange(minuteField, 0, 59);
    if (rangedMinuteInterval) return rangedMinuteInterval;

    const listedOffsetMinuteInterval = regularCyclicIntervalFromList(minuteField, 0, 59);
    if (listedOffsetMinuteInterval) return listedOffsetMinuteInterval;

    const rangedOffsetMinuteInterval = regularCyclicIntervalFromRange(minuteField, 0, 59);
    if (rangedOffsetMinuteInterval) return rangedOffsetMinuteInterval;

    const steppedStartMinuteInterval = regularCyclicIntervalFromSteppedStart(minuteField, 0, 59);
    if (steppedStartMinuteInterval) return steppedStartMinuteInterval;
  }

  if (minuteField === '0' && isEveryDay) {
    const listedHourlyInterval = regularIntervalFromList(hourField, 0, 23);
    if (listedHourlyInterval) return listedHourlyInterval * 60;

    const rangedHourlyInterval = regularIntervalFromRange(hourField, 0, 23);
    if (rangedHourlyInterval) return rangedHourlyInterval * 60;

    const listedOffsetHourlyInterval = regularCyclicIntervalFromList(hourField, 0, 23);
    if (listedOffsetHourlyInterval) return listedOffsetHourlyInterval * 60;

    const rangedOffsetHourlyInterval = regularCyclicIntervalFromRange(hourField, 0, 23);
    if (rangedOffsetHourlyInterval) return rangedOffsetHourlyInterval * 60;

    const steppedStartHourlyInterval = regularCyclicIntervalFromSteppedStart(hourField, 0, 23);
    if (steppedStartHourlyInterval) return steppedStartHourlyInterval * 60;

    const hourlyStepMatch = hourField.match(/^(?:\*|0)\/([1-9]\d*)$/);
    if (hourlyStepMatch) return Number.parseInt(hourlyStepMatch[1], 10) * 60;

    if (isEveryHour) return 60;
  }

  if (/^\d+$/.test(minuteField)) return 60;
  return null;
}

function parseCronNumberList(field, min, max) {
  if (!/^\d+(?:,\d+)*$/.test(field)) return null;
  const values = field.split(',').map(value => Number.parseInt(value, 10));
  const uniqueValues = [...new Set(values)].sort((left, right) => left - right);
  if (uniqueValues.length !== values.length) return null;
  if (uniqueValues.some(value => value < min || value > max)) return null;
  return uniqueValues;
}

function regularIntervalFromList(field, min, max) {
  const values = parseCronNumberList(field, min, max);
  if (!values || values.length < 2 || values[0] !== min) return null;

  const interval = values[1] - values[0];
  if (interval < 1 || interval > max) return null;

  const expectedValues = [];
  for (let value = min; value <= max; value += interval) {
    expectedValues.push(value);
  }

  if (expectedValues.length !== values.length) return null;
  return expectedValues.every((value, index) => value === values[index]) ? interval : null;
}

function regularIntervalFromRange(field, min, max) {
  const match = field.match(/^(\d+)-(\d+)\/([1-9]\d*)$/);
  if (!match) return null;

  const rangeStart = Number.parseInt(match[1], 10);
  const rangeEnd = Number.parseInt(match[2], 10);
  const interval = Number.parseInt(match[3], 10);
  if (rangeStart !== min || rangeEnd !== max || interval < 1 || interval > max) return null;

  return interval;
}

function regularCyclicIntervalFromValues(values, min, max) {
  if (!values || values.length < 2) return null;

  const cycleLength = max - min + 1;
  const interval = values[1] - values[0];
  if (interval < 1 || interval > max || cycleLength % interval !== 0) return null;

  const expectedValues = [];
  for (let value = values[0]; value <= max; value += interval) {
    expectedValues.push(value);
  }

  if (expectedValues.length !== values.length) return null;
  const wrapsToStart = values[values.length - 1] + interval === values[0] + cycleLength;
  return wrapsToStart && expectedValues.every((value, index) => value === values[index]) ? interval : null;
}

function regularCyclicIntervalFromList(field, min, max) {
  return regularCyclicIntervalFromValues(parseCronNumberList(field, min, max), min, max);
}

function regularCyclicIntervalFromRange(field, min, max) {
  const match = field.match(/^(\d+)-(\d+)\/([1-9]\d*)$/);
  if (!match) return null;

  const rangeStart = Number.parseInt(match[1], 10);
  const rangeEnd = Number.parseInt(match[2], 10);
  const interval = Number.parseInt(match[3], 10);
  if (rangeStart < min || rangeEnd > max || rangeStart >= rangeEnd || interval < 1 || interval > max) return null;

  const values = [];
  for (let value = rangeStart; value <= rangeEnd; value += interval) {
    values.push(value);
  }

  return regularCyclicIntervalFromValues(values, min, max);
}

function regularCyclicIntervalFromSteppedStart(field, min, max) {
  const match = field.match(/^(\d+)\/([1-9]\d*)$/);
  if (!match) return null;

  const rangeStart = Number.parseInt(match[1], 10);
  const interval = Number.parseInt(match[2], 10);
  if (rangeStart < min || rangeStart > max || interval < 1 || interval > max) return null;

  const values = [];
  for (let value = rangeStart; value <= max; value += interval) {
    values.push(value);
  }

  return regularCyclicIntervalFromValues(values, min, max);
}

function isFullRange(field, min, max) {
  const match = field.match(/^(\d+)-(\d+)$/);
  if (!match) return false;

  return Number.parseInt(match[1], 10) === min && Number.parseInt(match[2], 10) === max;
}

function isFullList(field, min, max) {
  const values = parseCronNumberList(field, min, max);
  if (!values) return false;

  const expectedLength = max - min + 1;
  if (values.length !== expectedLength) return false;
  return values.every((value, index) => value === min + index);
}

function isEveryCalendarField(field, min, max) {
  return field === '*' || field === '*/1' || isFullRange(field, min, max) || isFullList(field, min, max);
}

function isFullNamedRange(field, names) {
  const normalizedField = String(field || '').trim().toUpperCase();
  if (normalizedField === `${names[0]}-${names[names.length - 1]}`) return true;
  return false;
}

function isFullNamedList(field, names) {
  const normalizedField = String(field || '').trim().toUpperCase();
  if (!/^[A-Z]+(?:,[A-Z]+)*$/.test(normalizedField)) return false;

  const values = normalizedField.split(',');
  const uniqueValues = new Set(values);
  if (uniqueValues.size !== values.length || uniqueValues.size !== names.length) return false;

  return names.every(name => uniqueValues.has(name));
}

function isEveryMonthField(field) {
  const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return isEveryCalendarField(field, 1, 12)
    || isFullNamedRange(field, monthNames)
    || isFullNamedList(field, monthNames);
}

function isEveryDayOfWeek(field) {
  if (isEveryCalendarField(field, 0, 6) || isFullRange(field, 1, 7) || field === '0-7') return true;

  const values = parseCronNumberList(field, 0, 7);
  if (values) {
    const normalizedValues = new Set(values.map(value => (value === 7 ? 0 : value)));
    return normalizedValues.size === 7 && [0, 1, 2, 3, 4, 5, 6].every(value => normalizedValues.has(value));
  }

  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  return isFullNamedRange(field, dayNames) || isFullNamedList(field, dayNames);
}

function isEveryDaySchedule(dayOfMonth, month, dayOfWeek) {
  return isEveryCalendarField(dayOfMonth, 1, 31)
    && isEveryMonthField(month)
    && isEveryDayOfWeek(dayOfWeek);
}

function isEveryHourField(field) {
  return isEveryCalendarField(field, 0, 23);
}

function draft({ mode, value = '', time = '04:00', cron = '', notice = '', preserveOriginal = true }) {
  return { mode, value, time, cron, notice, preserveOriginal };
}

export function deriveTaskCronDraft(cronExpression, action = 'Broadcast') {
  const cron = String(cronExpression || '').trim();
  const fields = cron.split(/\s+/);
  const customDraft = notice => draft({ mode: 'custom', cron, notice });

  if (fields.length !== 5) {
    return customDraft('No se pudo convertir esta expresión a controles guiados. Se mantiene como Cron avanzado.');
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  const hourlyMatch = hour.match(/^(?:\*|0)\/([1-9]\d*)$/);
  const minuteMatch = minute.match(/^(?:\*|0)\/([1-9]\d*)$/);
  const isEveryDay = isEveryDaySchedule(dayOfMonth, month, dayOfWeek);
  const minActionInterval = TASK_MIN_INTERVAL_MINUTES[action] || TASK_MIN_INTERVAL_MINUTES.Broadcast;
  const isEveryHour = isEveryHourField(hour);
  const listedMinuteInterval = isEveryHour && isEveryDay ? regularIntervalFromList(minute, 0, 59) : null;
  const rangedMinuteInterval = isEveryHour && isEveryDay ? regularIntervalFromRange(minute, 0, 59) : null;
  const detectedMinuteInterval = listedMinuteInterval || rangedMinuteInterval;
  const listedHourlyInterval = minute === '0' && isEveryDay ? regularIntervalFromList(hour, 0, 23) : null;
  const rangedHourlyInterval = minute === '0' && isEveryDay ? regularIntervalFromRange(hour, 0, 23) : null;
  const detectedHourlyInterval = listedHourlyInterval || rangedHourlyInterval;
  const offsetDetectedMinuteInterval = isEveryHour && isEveryDay
    ? (regularCyclicIntervalFromList(minute, 0, 59)
      || regularCyclicIntervalFromRange(minute, 0, 59)
      || regularCyclicIntervalFromSteppedStart(minute, 0, 59))
    : null;
  const offsetDetectedZeroMinuteHourlyInterval = minute === '0' && isEveryDay
    ? (regularCyclicIntervalFromList(hour, 0, 23)
      || regularCyclicIntervalFromRange(hour, 0, 23)
      || regularCyclicIntervalFromSteppedStart(hour, 0, 23))
    : null;
  const fixedMinuteMatch = minute.match(/^\d{1,2}$/);
  const fixedMinute = fixedMinuteMatch ? Number.parseInt(minute, 10) : null;
  const hasHourlyOffsetMinute = Number.isInteger(fixedMinute) && fixedMinute >= 0 && fixedMinute <= 59 && fixedMinute !== 0 && isEveryDay;
  const offsetListedHourlyInterval = hasHourlyOffsetMinute ? regularIntervalFromList(hour, 0, 23) : null;
  const offsetRangedHourlyInterval = hasHourlyOffsetMinute ? regularIntervalFromRange(hour, 0, 23) : null;
  const offsetSteppedStartHourlyInterval = hasHourlyOffsetMinute ? regularCyclicIntervalFromSteppedStart(hour, 0, 23) : null;
  const offsetDetectedHourlyInterval = offsetListedHourlyInterval || offsetRangedHourlyInterval || offsetSteppedStartHourlyInterval;

  if (minute === '0' && isEveryHour && isEveryDay) {
    return draft({ mode: 'hours', value: '1', cron });
  }

  if (minute === '0' && hourlyMatch && isEveryDay) {
    const parsedHours = Number.parseInt(hourlyMatch[1], 10);
    if (parsedHours === 24) {
      return draft({
        mode: 'daily',
        time: '00:00',
        cron,
        notice: 'La expresión equivalía a una vez al día. Se ha convertido a hora diaria 00:00.',
      });
    }
    if (parsedHours < 1 || parsedHours > 23) {
      return customDraft('No se pudo convertir esta expresión a controles guiados sin cambiar su frecuencia. Se mantiene como Cron avanzado.');
    }
    return draft({ mode: 'hours', value: String(parsedHours), cron });
  }

  if (detectedHourlyInterval) {
    if (detectedHourlyInterval < 1 || detectedHourlyInterval > 23) {
      return customDraft('No se pudo convertir esta expresión a controles guiados sin cambiar su frecuencia. Se mantiene como Cron avanzado.');
    }
    return draft({
      mode: 'hours',
      value: String(detectedHourlyInterval),
      cron,
      notice: listedHourlyInterval
        ? 'La lista de horas se ha reconocido como intervalo regular y se ha convertido a controles guiados.'
        : 'El rango de horas con paso se ha reconocido como intervalo regular y se ha convertido a controles guiados.',
    });
  }

  if (offsetDetectedZeroMinuteHourlyInterval && offsetDetectedZeroMinuteHourlyInterval !== detectedHourlyInterval) {
    if (offsetDetectedZeroMinuteHourlyInterval < 1 || offsetDetectedZeroMinuteHourlyInterval > 23) {
      return customDraft('No se pudo convertir esta expresión a controles guiados sin cambiar su frecuencia. Se mantiene como Cron avanzado.');
    }
    return draft({
      mode: 'hours',
      value: String(offsetDetectedZeroMinuteHourlyInterval),
      cron,
      notice: `Esta tarea se ejecuta cada ${offsetDetectedZeroMinuteHourlyInterval} ${offsetDetectedZeroMinuteHourlyInterval === 1 ? 'hora' : 'horas'} con desplazamiento horario. Se abre como input horario y se conservará el Cron exacto hasta que cambies la frecuencia.`,
    });
  }

  if (hasHourlyOffsetMinute && isEveryHour) {
    return draft({
      mode: 'hours',
      value: '1',
      cron,
      notice: `Esta tarea se ejecuta cada hora en el minuto ${fixedMinute}. Se abre como input horario y se conservará el Cron exacto hasta que cambies la frecuencia.`,
    });
  }

  if (hasHourlyOffsetMinute && hourlyMatch) {
    const parsedHours = Number.parseInt(hourlyMatch[1], 10);
    if (parsedHours >= 1 && parsedHours <= 23) {
      return draft({
        mode: 'hours',
        value: String(parsedHours),
        cron,
        notice: `Esta tarea se ejecuta cada ${parsedHours} ${parsedHours === 1 ? 'hora' : 'horas'} en el minuto ${fixedMinute}. Se abre como input horario y se conservará el Cron exacto hasta que cambies la frecuencia.`,
      });
    }
  }

  if (offsetDetectedHourlyInterval) {
    if (offsetDetectedHourlyInterval < 1 || offsetDetectedHourlyInterval > 23) {
      return customDraft('No se pudo convertir esta expresión a controles guiados sin cambiar su frecuencia. Se mantiene como Cron avanzado.');
    }
    return draft({
      mode: 'hours',
      value: String(offsetDetectedHourlyInterval),
      cron,
      notice: `Esta tarea se ejecuta cada ${offsetDetectedHourlyInterval} ${offsetDetectedHourlyInterval === 1 ? 'hora' : 'horas'} en el minuto ${fixedMinute}. Se abre como input horario y se conservará el Cron exacto hasta que cambies la frecuencia.`,
    });
  }

  if (detectedMinuteInterval) {
    if (action === 'DoExit') {
      return draft({
        mode: 'hours',
        value: '1',
        cron: '0 */1 * * *',
        notice: 'La tarea DoExit usaba minutos. Se ha preparado como cada 1 hora para respetar las reglas de producción.',
        preserveOriginal: false,
      });
    }
    if (detectedMinuteInterval < minActionInterval) {
      return draft({
        mode: 'minutes',
        value: String(minActionInterval),
        cron: `*/${minActionInterval} * * * *`,
        notice: `La tarea usaba ${detectedMinuteInterval} minutos. Se ha preparado como cada ${minActionInterval} minutos para respetar las reglas de producción.`,
        preserveOriginal: false,
      });
    }
    if (detectedMinuteInterval > 59) {
      return customDraft('No se pudo convertir esta expresión a controles guiados sin cambiar su frecuencia. Se mantiene como Cron avanzado.');
    }
    return draft({
      mode: 'minutes',
      value: String(detectedMinuteInterval),
      cron,
      notice: listedMinuteInterval
        ? 'La lista de minutos se ha reconocido como intervalo regular y se ha convertido a controles guiados.'
        : 'El rango de minutos con paso se ha reconocido como intervalo regular y se ha convertido a controles guiados.',
    });
  }

  if (offsetDetectedMinuteInterval && offsetDetectedMinuteInterval !== detectedMinuteInterval) {
    if (action === 'DoExit') {
      return draft({
        mode: 'hours',
        value: '1',
        cron: '0 */1 * * *',
        notice: 'La tarea DoExit usaba minutos. Se ha preparado como cada 1 hora para respetar las reglas de producción.',
        preserveOriginal: false,
      });
    }
    if (offsetDetectedMinuteInterval < minActionInterval) {
      return draft({
        mode: 'minutes',
        value: String(minActionInterval),
        cron: `*/${minActionInterval} * * * *`,
        notice: `La tarea usaba ${offsetDetectedMinuteInterval} minutos. Se ha preparado como cada ${minActionInterval} minutos para respetar las reglas de producción.`,
        preserveOriginal: false,
      });
    }
    if (offsetDetectedMinuteInterval > 59) {
      return customDraft('No se pudo convertir esta expresión a controles guiados sin cambiar su frecuencia. Se mantiene como Cron avanzado.');
    }
    return draft({
      mode: 'minutes',
      value: String(offsetDetectedMinuteInterval),
      cron,
      notice: `Esta tarea se ejecuta cada ${offsetDetectedMinuteInterval} minutos con desplazamiento. Se abre como input de minutos y se conservará el Cron exacto hasta que cambies la frecuencia.`,
    });
  }

  if (minuteMatch && isEveryHour && isEveryDay) {
    if (action === 'DoExit') {
      return draft({
        mode: 'hours',
        value: '1',
        cron: '0 */1 * * *',
        notice: 'La tarea DoExit usaba minutos. Se ha preparado como cada 1 hora para respetar las reglas de producción.',
        preserveOriginal: false,
      });
    }
    const parsedMinutes = Number.parseInt(minuteMatch[1], 10);
    if (parsedMinutes < minActionInterval) {
      return draft({
        mode: 'minutes',
        value: String(minActionInterval),
        cron: `*/${minActionInterval} * * * *`,
        notice: `La tarea usaba ${parsedMinutes} minutos. Se ha preparado como cada ${minActionInterval} minutos para respetar las reglas de producción.`,
        preserveOriginal: false,
      });
    }
    if (parsedMinutes > 59) {
      return customDraft('No se pudo convertir esta expresión a controles guiados sin cambiar su frecuencia. Se mantiene como Cron avanzado.');
    }
    return draft({ mode: 'minutes', value: String(parsedMinutes), cron });
  }

  if (/^\d{1,2}$/.test(minute) && /^\d{1,2}$/.test(hour) && isEveryDay) {
    const parsedHour = Number.parseInt(hour, 10);
    const parsedMinute = Number.parseInt(minute, 10);
    if (parsedHour >= 0 && parsedHour <= 23 && parsedMinute >= 0 && parsedMinute <= 59) {
      const normalizedHour = String(parsedHour).padStart(2, '0');
      const normalizedMinute = String(parsedMinute).padStart(2, '0');
      return draft({
        mode: 'daily',
        time: `${normalizedHour}:${normalizedMinute}`,
        cron,
      });
    }
  }

  return customDraft('No se pudo convertir esta expresión a controles guiados. Se mantiene como Cron avanzado.');
}

export function taskCronDraftSummary({ mode, value, time } = {}) {
  if (mode === 'hours') {
    const hours = Number.parseInt(value, 10);
    return Number.isFinite(hours) && hours > 0
      ? `Control guiado: cada ${hours} ${hours === 1 ? 'hora' : 'horas'}`
      : 'Control guiado: intervalo en horas';
  }

  if (mode === 'minutes') {
    const minutes = Number.parseInt(value, 10);
    return Number.isFinite(minutes) && minutes > 0
      ? `Control guiado: cada ${minutes} minutos`
      : 'Control guiado: intervalo en minutos';
  }

  if (mode === 'daily') {
    return `Control guiado: todos los dias a las ${time || '04:00'}`;
  }

  return 'Cron avanzado: edicion manual';
}
