const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { WhisperRuntime } = require('../dist/core/whisper');
const { createPreviewAudio } = require('../dist/core/preview-audio');
const audio = createPreviewAudio('session', 32000, Buffer.alloc(64000));
async function fixture(t, handler) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ud-preview-test-'));
  const wav = path.join(root, 'fixture.wav'); fs.writeFileSync(wav, audio.wav);
  const server = http.createServer(handler); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const runtime = new WhisperRuntime({serverPath:'unused-server',cliPath:'unused-cli',publicPath:root,ensureModel:async ()=>'model'});
  // Inject only process startup. Actual production HTTP, framing, cancellation,
  // preview serialization and final-transcription methods execute unchanged.
  runtime.warmServer = { modelPath:'model',port:server.address().port,requestPath:'/test',stderrTail:'',process:{exitCode:null} };
  t.after(async () => { runtime.dispose(); server.closeAllConnections(); await new Promise(r=>server.close(r)); fs.rmSync(root,{recursive:true,force:true}); });
  return {runtime,wav};
}
function body(req) { return new Promise(resolve=>{const chunks=[];req.on('data',c=>chunks.push(c));req.on('end',()=>resolve(Buffer.concat(chunks)));}); }
test('production preview posts bounded WAV and exact language to loopback, never requests translation', async t => {
  let got;
  const {runtime} = await fixture(t, async (req,res)=>{ got=await body(req);res.end(' Grüße\nWelt. '); });
  const text = await runtime.preview(audio,'de',new AbortController().signal);
  assert.equal(text,'Grüße Welt.');
  assert.match(got.toString('utf8'), /name="language"\r\n\r\nde\r\n/);
  assert.ok(got.includes(audio.wav)); assert.ok(!got.includes(Buffer.from('name="translate"')));
});
test('aborting the actual Node request closes the socket, rejects late text, and does not fall back', async t => {
  let received, closed;
  const arrived = new Promise(r=>received=r), disconnected = new Promise(r=>closed=r);
  const {runtime} = await fixture(t, async (req,res)=>{ await body(req); res.on('close',closed); received(); });
  let fallback=0; runtime.transcribeWithCli=async()=>{fallback++;return 'wrong';};
  const controller=new AbortController(); const p=runtime.preview(audio,'auto',controller.signal);
  const rejected=assert.rejects(p); await arrived; controller.abort(); await rejected;
  await Promise.race([disconnected,new Promise((_,r)=>{const timer=setTimeout(()=>r(Error('socket did not close')),2000);timer.unref();})]);
  assert.equal(fallback,0); assert.equal(runtime.previewOperation,undefined);
});
test('final request aborts the active preview and transcribes the full WAV exactly once', async t => {
  let received; const arrived=new Promise(r=>received=r); let count=0;
  const {runtime,wav}=await fixture(t,async(req,res)=>{const raw=await body(req);count++;
    if(count===1)received();else{assert.ok(raw.includes(audio.wav));res.end('authoritative final');} });
  const preview=runtime.preview(audio,'en',new AbortController().signal); const rejected=assert.rejects(preview);
  await arrived; assert.equal(await runtime.transcribe(wav,'de'),'authoritative final'); await rejected; assert.equal(count,2);
});
test('preview HTTP failure never invokes CLI fallback or an automatic retry',async t=>{
  let count=0, fallback=0;const {runtime}=await fixture(t,async(req,res)=>{await body(req);count++;res.statusCode=500;res.end('private failure');});
  runtime.transcribeWithCli=async()=>{fallback++;return 'wrong';};
  await assert.rejects(runtime.preview(audio,'en',new AbortController().signal),/preview inference failed/);
  assert.equal(count,1);assert.equal(fallback,0);
});
test('preview response size bound destroys the connection',async t=>{
  const {runtime}=await fixture(t,async(req,res)=>{await body(req);res.end('x'.repeat(70000));});
  await assert.rejects(runtime.preview(audio,'en',new AbortController().signal),/size limit|interrupted/);
});
test('pre-aborted preview starts no worker and sends no request',async t=>{
  let count=0;const {runtime}=await fixture(t,()=>count++);const abort=new AbortController();abort.abort();
  assert.throws(()=>runtime.preview(audio,'en',abort.signal));assert.equal(count,0);
});
test('concurrent previews are refused rather than queued',async t=>{
  const {runtime}=await fixture(t,()=>{});const abort=new AbortController();
  const p=runtime.preview(audio,'en',abort.signal);const rejected=assert.rejects(p);
  assert.throws(()=>runtime.preview(audio,'de',new AbortController().signal),/already active/);
  abort.abort();await rejected;
});
test('preview cancellation during shared model warm-up does not await or kill warm-up',async()=>{
  let ready;const model=new Promise(r=>ready=r);
  const runtime=new WhisperRuntime({serverPath:'missing',cliPath:'missing',publicPath:'.',ensureModel:()=>model});
  const abort=new AbortController();const p=runtime.preview(audio,'en',abort.signal);const rejected=assert.rejects(p);
  await Promise.resolve();abort.abort();await rejected;runtime.dispose();ready('model');
  await new Promise(r=>setImmediate(r));assert.equal(runtime.warmServer,undefined);
});
