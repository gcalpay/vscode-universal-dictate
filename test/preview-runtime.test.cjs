const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once, EventEmitter } = require('node:events');
const { WhisperWorker } = require('../dist/core/whisper-worker');
const { WhisperRuntime } = require('../dist/core/whisper');
const { createPreviewAudio } = require('../dist/core/preview-audio');
const audio = createPreviewAudio('session', 32000, Buffer.alloc(64000));
async function fixture(t, handler) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ud-preview-test-'));
  const wav = path.join(root, 'fixture.wav'); fs.writeFileSync(wav, audio.wav);
  const servers = [], children = {}, received = [];
  const options = {serverPath:'unused-server',cliPath:'unused-cli',publicPath:root,ensureModel:async ()=>'model'};
  const runtime = new WhisperRuntime(options);
  // Separate loopback endpoints stand in for native processes. All production
  // HTTP, framing, cancellation and worker-termination logic still runs.
  for (const role of ['final', 'preview']) {
    const server = http.createServer((req,res) => { received.push(role); return handler(req,res,role); });
    server.listen(0, '127.0.0.1'); await once(server, 'listening'); servers.push(server);
    const child = new EventEmitter(); child.exitCode = null; child.signalCode = null; child.kills = 0;
    child.kill = () => {
      child.kills++; child.exitCode = 0;
      server.closeAllConnections(); child.emit('exit', 0, null); return true;
    };
    children[role] = child;
    const worker = new WhisperWorker({...options,role,threads:2});
    worker.process = child;
    worker.state = { port:server.address().port,requestPath:'/test',process:child };
    runtime[role + 'Worker'] = worker;
  }
  t.after(async () => {
    await runtime.shutdown();
    for (const server of servers) { server.closeAllConnections(); await new Promise(r=>server.close(r)); }
    fs.rmSync(root,{recursive:true,force:true});
  });
  return {runtime,wav,children,received};
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
test('preview cancellation during model acquisition cannot revive a retired preview worker',async()=>{
  let ready;const model=new Promise(r=>ready=r);
  const runtime=new WhisperRuntime({serverPath:'missing',cliPath:'missing',publicPath:'.',ensureModel:()=>model});
  const abort=new AbortController();const p=runtime.preview(audio,'en',abort.signal);const rejected=assert.rejects(p);
  await Promise.resolve();abort.abort();await rejected;runtime.dispose();ready('model');
  await new Promise(r=>setImmediate(r));assert.equal(runtime.isWarm(),false);assert.equal(runtime.getWorkerStatus().previewPid,undefined);
});

test('final request uses a distinct worker and leaves the final model resident', async t => {
  let arrived; const pending = new Promise(r=>arrived=r);
  const h = await fixture(t, async (req,res,role) => {
    await body(req);
    if (role === 'preview') arrived(); else res.end('complete recording');
  });
  const preview = h.runtime.preview(audio,'en',new AbortController().signal);
  const rejected = assert.rejects(preview); await pending;
  assert.equal(await h.runtime.transcribe(h.wav,'en'),'complete recording'); await rejected;
  assert.deepEqual(h.received,['preview','final']);
  assert.equal(h.children.preview.kills,1); assert.equal(h.children.final.kills,0);
  assert.equal(h.runtime.isWarm(),true); assert.equal(h.runtime.previewWorker,undefined);
});

test('preview Off creates no preview worker and does not change final parameters', async t => {
  const h = await fixture(t, async(req,res) => { const raw = await body(req); assert.ok(raw.includes(audio.wav)); res.end('final'); });
  const removed = h.runtime.previewWorker; h.runtime.previewWorker = undefined; await removed.stop();
  await h.runtime.warm(); assert.equal(await h.runtime.transcribe(h.wav,'de'),'final');
  assert.equal(h.runtime.previewWorker,undefined); assert.equal(h.children.final.kills,0);
  assert.deepEqual(h.received,['final']);
});

test('stopping an idle preview releases it without evicting the final model', async t => {
  const h = await fixture(t, async(req,res) => { await body(req); res.end('preview'); });
  await h.runtime.preview(audio,'en',new AbortController().signal);
  assert.equal(h.runtime.previewOperation,undefined);
  await h.runtime.stopPreview(); await h.runtime.stopPreview();
  assert.equal(h.children.preview.kills,1); assert.equal(h.children.final.kills,0);
  assert.equal(h.runtime.isWarm(),true);
});

test('final dispatch waits for preview process exit, not just HTTP abort or kill return', async t => {
  let arrived; const pending=new Promise(r=>arrived=r); let hasExited=false;
  const h=await fixture(t,async(req,res,role)=>{
    await body(req);
    if(role==='preview')arrived(); else { assert.equal(hasExited,true); res.end('final'); }
  });
  const child=h.children.preview;
  child.kill=()=>{ child.kills++; setTimeout(()=>{hasExited=true;child.exitCode=0;child.emit('exit',0,null);},35);return true; };
  const work=h.runtime.preview(audio,'en',new AbortController().signal),rejected=assert.rejects(work); await pending;
  assert.equal(await h.runtime.transcribe(h.wav,'en'),'final'); await rejected;
  assert.equal(child.kills,1); assert.equal(hasExited,true);
});

test('preview failures do not trigger final CLI fallback', async t => {
  const h=await fixture(t,async(req,res,role)=>{await body(req);res.statusCode=role==='preview'?500:200;res.end('final');});
  let fallbacks=0;h.runtime.transcribeWithCli=async()=>{fallbacks++;return 'incorrect';};
  await assert.rejects(h.runtime.preview(audio,'en',new AbortController().signal));
  assert.equal(await h.runtime.transcribe(h.wav,'en'),'final');assert.equal(fallbacks,0);
});

test('failed preview termination disables more preview workers but preserves final dictation', async t => {
  const h=await fixture(t,async(req,res)=>{await body(req);res.end('final');});
  h.runtime.previewWorker.stop=async()=>false;
  assert.equal(await h.runtime.transcribe(h.wav,'en'),'final');
  assert.equal(h.runtime.getWorkerStatus().previewDisabled,true);
  assert.throws(()=>h.runtime.preview(audio,'en',new AbortController().signal),/disabled/);
  assert.equal(h.children.final.kills,0);
});

test('new preview is rejected throughout finalization, including recorder-independent waits', async t => {
  let release; const wait=new Promise(r=>release=r);
  const h=await fixture(t,async(req,res)=>{await body(req);await wait;res.end('final');});
  const final=h.runtime.transcribe(h.wav,'en');
  assert.throws(()=>h.runtime.preview(audio,'en',new AbortController().signal),/priority/);
  release();await final;
});

test('runtime shutdown releases both workers and cannot be revived', async t => {
  const h=await fixture(t,async(req,res)=>{await body(req);res.end('unused');});
  await h.runtime.shutdown();await h.runtime.shutdown();
  assert.equal(h.children.final.kills,1);assert.equal(h.children.preview.kills,1);
  await assert.rejects(h.runtime.warm(),/disposed/);
  assert.throws(()=>h.runtime.preview(audio,'en',new AbortController().signal),/disposed/);
});

test('final server failure still performs one CLI fallback with exact audio and language', async t => {
  const h=await fixture(t,async(req,res)=>{await body(req);res.statusCode=503;res.end('unavailable');});
  const calls=[],paths=[];h.runtime.transcribeWithCli=async(...args)=>{calls.push(args);return 'retained final';};
  assert.equal(await h.runtime.transcribe(h.wav,'de',p=>paths.push(p)),'retained final');
  assert.deepEqual(calls,[[h.wav,'de']]);assert.deepEqual(paths,['server','cli']);assert.equal(h.children.final.kills,1);
});
