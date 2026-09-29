export const MAX_TRANSCRIPT_BYTES = 4 * 1024 * 1024;
export const TEXT_INPUT_ARGUMENT = '--unicode-input-v1';

const CODES = [
  'ok', 'no_target', 'busy', 'cancelled', 'invalid_request',
  'modifiers_held', 'focus_changed', 'input_failed', 'internal_error'
] as const;
export interface TextInputReport {
  readonly protocol: 1;
  readonly code: (typeof CODES)[number];
  readonly input: 'not_attempted' | 'submitted' | 'partial';
}

export function parseTextInputReport(output: string, exitCode: number | null): TextInputReport {
  const invalid = () => new Error('Text input helper returned an invalid result. Check the target before retrying.');
  let value: unknown;
  try { value = JSON.parse(output); } catch { throw invalid(); }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw invalid();
  const v = value as Record<string, unknown>;
  if (v.protocol !== 1 || !CODES.includes(v.code as TextInputReport['code']) ||
      !['not_attempted', 'submitted', 'partial'].includes(v.input as string) ||
      (exitCode !== 0 && exitCode !== 1)) throw invalid();
  const successful = v.code === 'ok' || v.code === 'no_target';
  if (successful !== (exitCode === 0) ||
      (v.code === 'ok' && v.input !== 'submitted') ||
      (v.code === 'no_target' && v.input !== 'not_attempted') ||
      (!successful && v.input === 'submitted')) throw invalid();
  return value as TextInputReport;
}

export function textInputFailure(report: TextInputReport): Error {
  if (report.input === 'partial') {
    return new Error('Text input stopped after partial submission. Check the target before retrying to avoid duplicate text.');
  }
  const reasons: Partial<Record<TextInputReport['code'], string>> = {
    busy: 'Another text insertion is already active.',
    cancelled: 'Text insertion was cancelled.',
    modifiers_held: 'Release Ctrl, Alt, Shift and Windows keys before inserting.',
    focus_changed: 'The focused window changed before text could be inserted.'
  };
  return new Error(reasons[report.code] ?? 'Text could not be inserted. Check the focused input.');
}
