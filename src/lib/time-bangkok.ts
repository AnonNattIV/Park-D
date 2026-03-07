export type BangkokDurationUnit = 'HOUR' | 'DAY' | 'MONTH';

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

export interface ParsedBangkokDateTime {
  mysqlDateTime: string;
  comparableTime: number;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function parseBangkokDateTimeInput(value: unknown): ParsedBangkokDateTime | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const match = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
  );

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] || '0');

  const utcAsIfLocal = Date.UTC(year, month - 1, day, hour, minute, second);
  const verification = new Date(utcAsIfLocal);

  if (
    Number.isNaN(utcAsIfLocal) ||
    verification.getUTCFullYear() !== year ||
    verification.getUTCMonth() !== month - 1 ||
    verification.getUTCDate() !== day ||
    verification.getUTCHours() !== hour ||
    verification.getUTCMinutes() !== minute ||
    verification.getUTCSeconds() !== second
  ) {
    return null;
  }

  return {
    mysqlDateTime: `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:${pad(second)}`,
    comparableTime: utcAsIfLocal - BANGKOK_OFFSET_MS,
  };
}

export function formatBangkokDateTimeLocalInput(
  value: Date | number
): string {
  const epoch = typeof value === 'number' ? value : value.getTime();
  const bangkokPseudoDate = new Date(epoch + BANGKOK_OFFSET_MS);

  return `${bangkokPseudoDate.getUTCFullYear()}-${pad(
    bangkokPseudoDate.getUTCMonth() + 1
  )}-${pad(bangkokPseudoDate.getUTCDate())}T${pad(
    bangkokPseudoDate.getUTCHours()
  )}:${pad(bangkokPseudoDate.getUTCMinutes())}`;
}

export function addBangkokDuration(
  comparableTime: number,
  unit: BangkokDurationUnit,
  amount: number
): number {
  const normalizedAmount = Number.isFinite(amount) && amount > 0 ? Math.floor(amount) : 1;
  const bangkokPseudoDate = new Date(comparableTime + BANGKOK_OFFSET_MS);

  if (unit === 'DAY') {
    bangkokPseudoDate.setUTCDate(bangkokPseudoDate.getUTCDate() + normalizedAmount);
  } else if (unit === 'MONTH') {
    bangkokPseudoDate.setUTCMonth(bangkokPseudoDate.getUTCMonth() + normalizedAmount);
  } else {
    bangkokPseudoDate.setUTCHours(bangkokPseudoDate.getUTCHours() + normalizedAmount);
  }

  return bangkokPseudoDate.getTime() - BANGKOK_OFFSET_MS;
}
