export const MAX_TRANSCRIPT_BYTES = 4 * 1024 * 1024;
export const CLIPBOARD_HELPER_ARGUMENT = '--clipboard-transaction-v2';

const CODES = [
  'ok', 'busy', 'clipboard_busy', 'snapshot_unsupported', 'snapshot_failed',
  'ownership_unknown', 'clipboard_changed', 'write_failed', 'paste_failed',
  'restore_failed', 'invalid_request', 'internal_error', 'cancelled'
] as const;
type ClipboardCode = (typeof CODES)[number];
type PasteState = 'not_attempted' | 'submitted' | 'uncertain';
type ClipboardState = 'unchanged' | 'restored' | 'newer' | 'unknown' | 'partial';

export interface ClipboardReport {
  readonly protocol: 2;
  readonly code: ClipboardCode;
  readonly paste: PasteState;
  readonly clipboard: ClipboardState;
}

export function parseClipboardReport(output: string, exitCode: number | null): ClipboardReport {
  let value: unknown;
  try {
    value = JSON.parse(output);
  } catch {
    throw invalidReport();
  }
  if (typeof value !== 'object' || value === null) throw invalidReport();
  const v = value as Record<string, unknown>;
  if (v.protocol !== 2 || typeof v.code !== 'string' ||
      !CODES.includes(v.code as ClipboardCode) ||
      !['not_attempted', 'submitted', 'uncertain'].includes(v.paste as string) ||
      !['unchanged', 'restored', 'newer', 'unknown', 'partial'].includes(v.clipboard as string) ||
      (exitCode !== 0 && exitCode !== 1) || (v.code === 'ok') !== (exitCode === 0)) {
    throw invalidReport();
  }
  if (v.code === 'ok' && (v.paste !== 'submitted' || !['restored', 'newer'].includes(v.clipboard as string))) {
    throw invalidReport();
  }
  return value as ClipboardReport;
}

function invalidReport(): Error {
  return new Error('Clipboard helper did not return a valid result. Check the target before reinserting; Last transcript remains available.');
}

export function clipboardFailure(report: ClipboardReport): Error {
  if (report.clipboard === 'unknown' || report.clipboard === 'partial') {
    return new Error('Clipboard restoration could not be confirmed. Do not assume the old clipboard was fully restored. Check the target before reinserting; Last transcript remains available.');
  }
  const safety = report.clipboard === 'newer'
    ? 'The newer clipboard content was left in place.'
    : report.clipboard === 'restored'
      ? 'The previous clipboard content was restored.'
      : 'The existing clipboard was not replaced.';
  const reason = report.code === 'cancelled'
    ? 'Insertion cancelled; check the target if input was already submitted.'
    : report.code === 'snapshot_unsupported'
    ? 'Insertion skipped: an existing clipboard format cannot be safely preserved.'
    : report.paste !== 'not_attempted'
      ? 'Paste could not be confirmed; check the target before reinserting to avoid duplicates.'
      : 'Insertion skipped because the clipboard transaction could not be completed safely.';
  return new Error(`${reason} ${safety} Last transcript remains available.`);
}
