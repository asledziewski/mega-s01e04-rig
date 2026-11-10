import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightDigest, ReadNight, RunStatus } from './types.js';

type RunEvent = {
  at: string;
  millis: number;
  submillis: string;
  job: string;
  owner: string | null;
  status: RunStatus;
  error?: string;
};

function isCalendarDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const midnight = new Date(date + 'T00:00:00Z');
  return Number.isFinite(midnight.getTime()) && midnight.toISOString().slice(0, 10) === date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseEvent(line: string): RunEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const { at, job, owner, status, error } = value;
  if (typeof at !== 'string' || typeof job !== 'string' || !job.trim()) return null;
  if (owner !== null && typeof owner !== 'string') return null;
  if (status !== 'ok' && status !== 'retry' && status !== 'fail') return null;
  if (error !== undefined && typeof error !== 'string') return null;

  const timestamp = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.(\d+))?)?(?:Z|[+-]\d{2}:?\d{2})$/i.exec(at);
  if (!timestamp || !isCalendarDate(timestamp[1])) return null;
  const millis = Date.parse(at);
  if (!Number.isFinite(millis)) return null;
  // Date.parse truncates fractions past milliseconds. Keep the remaining digits for ties.
  const submillis = (timestamp[2] ?? '').slice(3).replace(/0+$/, '');
  return { at, millis, submillis, job, owner, status, error };
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function digestLog(log: string): NightDigest {
  const counts = { ok: 0, retry: 0, fail: 0 };
  const events: RunEvent[] = [];
  let badLines = 0;
  for (const line of log.split('\n')) {
    if (!line.trim()) continue;
    const event = parseEvent(line);
    if (event) events.push(event);
    else badLines++;
  }

  // Stable sort retains log order for events at the same instant.
  events.sort((a, b) => a.millis - b.millis || compareStrings(a.submillis, b.submillis));
  const jobs = new Map<string, DigestRow>();
  for (const event of events) {
    counts[event.status]++;
    let row = jobs.get(event.job);
    if (!row) {
      row = {
        job: event.job, owner: event.owner, runs: 0, retries: 0, hasFailure: false,
        lastStatus: event.status, lastError: null, firstAt: event.at, lastAt: event.at,
      };
      jobs.set(event.job, row);
    }
    row.runs++;
    if (event.status === 'retry') row.retries++;
    if (event.status === 'fail') row.hasFailure = true;
    if (event.error !== undefined) row.lastError = event.error;
    row.owner = event.owner;
    row.lastStatus = event.status;
    row.lastAt = event.at;
  }
  const rows = [...jobs.values()].sort((a, b) => compareStrings(a.job, b.job));
  return { rows, badLines, counts };
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!isCalendarDate(night)) return null;
  let log: string;
  try {
    log = readFileSync(join(runsDir, night + '.jsonl'), 'utf8');
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') return null;
    throw error;
  }
  return digestLog(log);
};
