const test = require('node:test');
const assert = require('node:assert/strict');
const { RecorderLines, RecorderPreviewChannel, MAX_PREVIEW_LINE } = require('../dist/core/preview-recorder');
const { buildRecorderArguments } = require('../dist/core/recorder');
const { validatePreviewAudio } = require('../dist/core/preview-audio');

function channel() {
  const sent = [];
  return { sent, channel: new RecorderPreviewChannel('session-1', line => sent.push(line)) };
}
test('raw-PCM preview arguments are absent by default and without an enhanced overlay', () => {
  const base = { recorderPath: 'r.exe', outputPath: 'recording.wav', overlayStyle: 'enhanced' };
  assert.ok(!buildRecorderArguments(base).includes('--preview-session'));
  assert.ok(buildRecorderArguments({ ...base, previewSessionId: 'session-1' }).includes('--preview-session'));
  assert.ok(!buildRecorderArguments({ ...base, previewSessionId: 'session-1', showOverlay: false }).includes('--preview-session'));
  assert.ok(!buildRecorderArguments({ ...base, previewSessionId: 'session-1', overlayStyle: 'compact' }).includes('--preview-session'));
  assert.ok(!buildRecorderArguments({ ...base, previewSessionId: '\nSTOP' }).includes('--preview-session'));
});
test('fragmented stdout lines preserve control framing and never include line endings', () => {
  const lines = []; const splitter = new RecorderLines(20, l => lines.push(l), () => assert.fail('overflow'));
  splitter.push('REA'); splitter.push('DY\r\nLEVEL 0.1\nACT'); splitter.push('ION STOP\n');
  assert.deepEqual(lines, ['READY', 'LEVEL 0.1', 'ACTION STOP']);
});
test('oversized lines are dropped with bounded accumulation and later controls recovered', () => {
  const lines = [], failures = [];
  const splitter = new RecorderLines(20, l => lines.push(l), () => failures.push('overflow'));
  for (let i = 0; i < 100; i++) splitter.push('x'.repeat(1000));
  splitter.push('\nREADY\n'); assert.deepEqual(lines, ['READY']); assert.equal(failures.length, 1);
  splitter.push('junk'); splitter.close(); splitter.push('READY\n'); assert.equal(lines[1], 'READY');
});
test('native PCM response becomes an independently owned canonical WAV', async () => {
  const h = channel(); const signal = new AbortController(); const pending = h.channel.acquire(signal.signal);
  assert.deepEqual(h.sent, ['SNAPSHOT session-1 1\n']);
  h.channel.line('PREVIEW session-1 1 9 12 00800000ff7f');
  const lease = await pending; validatePreviewAudio(lease.audio, 'session-1');
  assert.deepEqual([lease.audio.startFrame, lease.audio.endFrame], [9,12]);
  assert.deepEqual([...lease.audio.wav.subarray(44)], [0,128,0,0,255,127]); await lease.release(); h.channel.stop();
});
test('empty snapshot and obsolete request reply do not decode old PCM', async () => {
  const h = channel(); const a = h.channel.acquire(new AbortController().signal);
  h.channel.line('PREVIEW_EMPTY session-1 1'); assert.equal(await a, undefined);
  const b = h.channel.acquire(new AbortController().signal); let settled = false; b.then(() => { settled = true; });
  h.channel.line('PREVIEW session-1 1 0 1 0000'); await Promise.resolve(); assert.equal(settled, false);
  h.channel.line('PREVIEW session-1 2 0 1 0200'); assert.equal((await b).audio.wav.readInt16LE(44), 2); h.channel.stop();
});
for (const line of ['PREVIEW wrong 1 0 1 0000', 'PREVIEW session-1 1 -1 1 00000000',
  'PREVIEW session-1 1 0 2 0000', 'PREVIEW session-1 1 0 1 zz00',
  'PREVIEW session-1 1 0.5 1 0000', 'PREVIEW session-1 1 0 128001 ' + '0'.repeat(512004),
  'PREVIEW_ERROR session-1 1']) {
  test(`malformed native snapshot is rejected (${line.slice(0,50)})`, async () => {
    const h = channel(); const pending = h.channel.acquire(new AbortController().signal);
    const rejected = assert.rejects(pending, /preview response/); h.channel.line(line); await rejected; h.channel.stop();
  });
}
test('pre-abort, busy, and Stop do not queue requests or accept later output', async () => {
  const h = channel(); const a = new AbortController(); a.abort();
  await assert.rejects(h.channel.acquire(a.signal)); assert.equal(h.sent.length, 0);
  const pending = h.channel.acquire(new AbortController().signal);
  await assert.rejects(h.channel.acquire(new AbortController().signal), /pending/);
  const rejected = assert.rejects(pending, /stopped/); h.channel.stop(); await rejected;
  h.channel.line('PREVIEW session-1 1 0 1 0000'); assert.equal(h.sent.length, 1);
});
test('cancelling pending acquisition settles promptly and late native data is ignored', async () => {
  const h = channel(); const abort = new AbortController(); const pending = h.channel.acquire(abort.signal);
  const rejected = assert.rejects(pending, /cancelled/); abort.abort(); await rejected;
  h.channel.line('PREVIEW session-1 1 0 1 0000'); h.channel.stop();
});
test('write failure is preview-local', async () => {
  const c = new RecorderPreviewChannel('session-1', (_line, fail) => fail(new Error('closed')));
  await assert.rejects(c.acquire(new AbortController().signal), /closed/); c.stop();
});
test('UI text has safe bounded UTF-8 framing and never becomes a terminal command', () => {
  const h = channel(); h.channel.display({sessionId:'session-1',revision:1,text:'Grüße 🧪\nSTOP\t\x00'});
  const fields = h.sent[0].trim().split(' ');
  assert.deepEqual(fields.slice(0,3), ['TEXT','session-1','1']);
  assert.equal(Buffer.from(fields[3],'hex').toString('utf8'), 'Grüße 🧪 STOP');
  h.channel.display({sessionId:'session-1',revision:2,text:'🧪'.repeat(2000)});
  assert.equal(Buffer.from(h.sent[1].trim().split(' ')[3],'hex').length, 4096);
  assert.throws(() => h.channel.display({sessionId:'wrong',revision:3,text:'wrong'}));
  h.channel.stop(); h.channel.display({sessionId:'session-1',revision:4,text:'late'}); assert.equal(h.sent.length, 2);
});
test('framing bound permits maximum eight-second PCM plus ownership metadata', () => {
  const line = 'PREVIEW ' + 'a'.repeat(128) + ' 9007199254740991 9007199254612991 9007199254740991 ' + '0'.repeat(512000);
  assert.ok(line.length <= MAX_PREVIEW_LINE);
});
