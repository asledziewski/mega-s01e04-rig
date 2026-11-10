export type RunStatus = 'ok' | 'retry' | 'fail';

// Order events by instant, breaking ties by their order in the log.
export type DigestRow = {
  job: string;
  owner: string | null; // Owner on the last event, including an explicit null.
  runs: number; // All valid events for the job.
  retries: number; // Events whose status is retry.
  hasFailure: boolean; // At least one fail, even if the job later recovered.
  lastStatus: RunStatus;
  lastError: string | null; // Most recent error supplied by an event, including before recovery.
  firstAt: string; // Earliest and latest timestamps retain their original offsets.
  lastAt: string;
};

export type NightDigest = {
  rows: DigestRow[]; // One row per job, sorted ascending by job in JS string order.
  badLines: number; // Each nonblank line with invalid JSON or invalid event fields.
  counts: Record<RunStatus, number>; // Valid event totals across all jobs, including zeroes.
};

/**
 * readNight from ./read-night.js reads runsDir/<night>.jsonl synchronously.
 * A missing file or an invalid night (outside the YYYY-MM-DD calendar dates)
 * returns null. Other filesystem errors propagate. An empty file gives empty
 * rows, zero bad lines, and zero counts.
 */
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
