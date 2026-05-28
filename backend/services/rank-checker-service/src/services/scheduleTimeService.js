const MIN_INTERVAL_MINUTES = 15;
const MAX_INTERVAL_MINUTES = 60;
const DEFAULT_INTERVAL_MINUTES = 60;
const ALLOWED_INTERVAL_MINUTES = [15, 30, 60];
const WIB_OFFSET_MINUTES = 7 * 60;
const MINUTE_MS = 60 * 1000;

const clampIntervalMinutes = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_INTERVAL_MINUTES;
  return Math.max(MIN_INTERVAL_MINUTES, Math.min(MAX_INTERVAL_MINUTES, Math.round(parsed)));
};

const hoursToMinutes = (hours) => {
  const parsed = Number(hours);
  if (!Number.isFinite(parsed)) return DEFAULT_INTERVAL_MINUTES;
  return clampIntervalMinutes(parsed * 60);
};

const minutesToHours = (minutes) => clampIntervalMinutes(minutes) / 60;

const isAllowedIntervalMinutes = (value) => ALLOWED_INTERVAL_MINUTES.includes(clampIntervalMinutes(value));

const normalizeAllowedIntervalMinutes = (value) => {
  const minutes = clampIntervalMinutes(value);
  if (ALLOWED_INTERVAL_MINUTES.includes(minutes)) return minutes;
  return DEFAULT_INTERVAL_MINUTES;
};

const getNextScheduledAt = (nowInput, intervalMinutesInput) => {
  const now = nowInput ? new Date(nowInput) : new Date();
  const intervalMinutes = clampIntervalMinutes(intervalMinutesInput);
  const wibAdjustedMs = now.getTime() + WIB_OFFSET_MINUTES * MINUTE_MS;
  const nowMinute = Math.floor(wibAdjustedMs / MINUTE_MS);
  const nextMinute = Math.ceil((nowMinute + 1) / intervalMinutes) * intervalMinutes;
  const nextWibAdjustedMs = nextMinute * MINUTE_MS;
  return new Date(nextWibAdjustedMs - WIB_OFFSET_MINUTES * MINUTE_MS);
};

const getScheduledSlotStartAt = (dateInput, intervalMinutesInput) => {
  const date = dateInput ? new Date(dateInput) : new Date();
  const intervalMinutes = clampIntervalMinutes(intervalMinutesInput);
  const wibAdjustedMs = date.getTime() + WIB_OFFSET_MINUTES * MINUTE_MS;
  const currentMinute = Math.floor(wibAdjustedMs / MINUTE_MS);
  const slotMinute = Math.floor(currentMinute / intervalMinutes) * intervalMinutes;
  const slotWibAdjustedMs = slotMinute * MINUTE_MS;
  return new Date(slotWibAdjustedMs - WIB_OFFSET_MINUTES * MINUTE_MS);
};

const getScheduleWindowSlots = ({
  nowInput,
  intervalMinutesInput,
  previousSlots = 2,
  nextSlots = 12,
} = {}) => {
  const intervalMinutes = clampIntervalMinutes(intervalMinutesInput);
  const currentSlotAt = getScheduledSlotStartAt(nowInput, intervalMinutes);
  const intervalMs = intervalMinutes * MINUTE_MS;
  const slots = [];

  for (let offset = -Math.max(0, previousSlots); offset <= Math.max(0, nextSlots); offset += 1) {
    slots.push(new Date(currentSlotAt.getTime() + offset * intervalMs));
  }

  return slots;
};

module.exports = {
  MIN_INTERVAL_MINUTES,
  MAX_INTERVAL_MINUTES,
  DEFAULT_INTERVAL_MINUTES,
  ALLOWED_INTERVAL_MINUTES,
  WIB_OFFSET_MINUTES,
  clampIntervalMinutes,
  hoursToMinutes,
  minutesToHours,
  isAllowedIntervalMinutes,
  normalizeAllowedIntervalMinutes,
  getNextScheduledAt,
  getScheduledSlotStartAt,
  getScheduleWindowSlots,
};
