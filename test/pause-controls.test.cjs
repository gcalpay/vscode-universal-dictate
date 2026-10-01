const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { RecorderPauseChannel } = require('../dist/core/recorder-pause');
const { DictationEngine } = require('../dist/core/dictation');
const { buildRecorderArguments } = require('../dist/core/recorder');
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; }

test('pause acknowledgements must match request and target; requests are idempotent', async () => {
  const writes=[]; const channel=new RecorderPauseChannel(line => writes.push(line));
  await channel.setPaused(false); assert.deepEqual(writes,[]);
  const first=channel.setPaused(true); assert.equal(channel.setPaused(true),first);
  await assert.rejects(channel.setPaused(false),/pending/);
  let settled=false; void first.then(()=>{settled=true;});
  for (const line of ['PAUSED 2','RESUMED 1','PAUSED 0','PAUSED 1 trailing','PAUSED -1']) channel.line(line);
  await tick(); assert.equal(settled,false);
  channel.line('PAUSED 1'); await first; await channel.setPaused(true);
  const resume=channel.setPaused(false); channel.line('PAUSED 1'); channel.line('RESUMED 2'); await resume;
  assert.deepEqual(writes,['PAUSE 1\n','RESUME 2\n']); channel.stop();
});

test('Stop rejects a pending pause and stale acknowledgements cannot revive controls', async () => {
  const writes=[]; const channel=new RecorderPauseChannel(line=>writes.push(line));
  const pending=channel.setPaused(true); channel.stop(); channel.line('PAUSED 1');
  await assert.rejects(pending,/stopped/); await assert.rejects(channel.setPaused(false),/closed/);
  assert.deepEqual(writes,['PAUSE 1\n']);
});

test('pause write failures reject instead of claiming success', async () => {
  for (const send of [(_line,fail)=>fail(Error('write failed')),()=>{throw Error('write failed');}]) {
    const channel=new RecorderPauseChannel(send); await assert.rejects(channel.setPaused(true),/write/); channel.stop();
  }
});

test('pause acknowledgement timeout is bounded and clears its timer', async () => {
  const timers=new Map(); let serial=0; const exports={};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/core/recorder-pause.js'),'utf8'),{
    exports, setTimeout:(run,delay)=>{const id=++serial;timers.set(id,{run,delay});return id;},clearTimeout:id=>timers.delete(id)
  });
  const channel=new exports.RecorderPauseChannel(()=>{}); const pending=channel.setPaused(true);
  assert.equal(timers.size,1); const timeout=[...timers.values()][0]; assert.equal(timeout.delay,5000);
  timeout.run(); await assert.rejects(pending,/not confirmed/); assert.equal(timers.size,0); channel.stop();
});

test('button style validates to text and waveform defaults to ten seconds without overriding explicit values', () => {
  for (const style of [undefined,'text','symbols','invalid',true]) {
    const args=buildRecorderArguments({recorderPath:'r.exe',outputPath:'a.wav',overlayStyle:'enhanced',overlayButtonStyle:style});
    assert.equal(args[args.indexOf('--button-style')+1],style==='symbols'?'symbols':'text');
    assert.equal(args[args.indexOf('--waveform-timespan-ms')+1],'10000');
  }
  for(const seconds of [1,3,5,10,20]) {
    const args=buildRecorderArguments({recorderPath:'r.exe',outputPath:'a.wav',overlayStyle:'enhanced',waveformTimeSpanSeconds:seconds});
    assert.equal(args[args.indexOf('--waveform-timespan-ms')+1],String(seconds*1000));
  }
  assert.deepEqual(buildRecorderArguments({recorderPath:'r.exe',outputPath:'a.wav',showOverlay:false,overlayButtonStyle:'symbols'}),['--output','a.wav','--no-overlay']);
});

async function fixture(t, overrides={}) {
  const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'ud-pause-'));
  const events={states:[],levels:[],notices:[],errors:[],inserts:[],sessions:[],preview:[]};
  let serial=0;
  const options={
    prepare:async()=>{},warm:async()=>{},
    startRecorder:async(onLevel,signal)=>{
      const file=path.join(dir,`${++serial}.wav`); await fsp.writeFile(file,'synthetic');
      const session={outputPath:file,signal,onLevel,changes:[],stops:0,cancels:0,
        onAction(callback){this.action=callback;},onFailure(callback){this.fail=callback;},
        async setPaused(value){this.changes.push(value);},
        async stop(){this.stops++;return file;},
        async cancel(){this.cancels++;await fsp.rm(file,{force:true});}};
      events.sessions.push(session); return session;
    },
    startPreview:()=>({pause:async()=>{events.preview.push('pause');},resume:()=>events.preview.push('resume'),stop:async()=>{events.preview.push('stop');}}),
    transcribe:async()=> 'complete final',insert:async text=>events.inserts.push(text),
    onStateChanged:state=>events.states.push(state),onLevel:level=>events.levels.push(level),
    onRecordingChanged:value=>events.notices.push(value),onError:error=>events.errors.push(error),...overrides
  };
  const engine=new DictationEngine(options);
  t.after(async()=>{engine.dispose();await tick();await fsp.rm(dir,{recursive:true,force:true});});
  return {engine,options,events,current:()=>events.sessions.at(-1)};
}

test('Pause/Resume preserves one recording and preview; insertion happens only after Stop', async t => {
  const h=await fixture(t); await h.engine.toggle(); const s=h.current();
  s.onLevel(.5); await h.engine.togglePause(); s.onLevel(.9); await tick();
  assert.equal(h.events.states.at(-1),'paused'); assert.deepEqual(h.events.levels,[.5]);
  assert.deepEqual(h.events.notices,[true]); assert.equal(h.events.inserts.length,0);
  await h.engine.togglePause(); s.onLevel(.7);
  assert.equal(h.events.states.at(-1),'recording'); assert.deepEqual(s.changes,[true,false]);
  assert.deepEqual(h.events.preview,['pause','resume']); assert.equal(h.events.sessions.length,1);
  await h.engine.toggle(); assert.equal(s.stops,1); assert.deepEqual(h.events.inserts,['complete final']);
  assert.deepEqual(h.events.preview,['pause','resume','stop']);
});

for (const phase of ['paused','pausing','resuming']) for (const ending of ['stop','cancel','dispose']) {
  test(`${ending} wins while ${phase}; late acknowledgement cannot restart preview or insert twice`, async t => {
    const h=await fixture(t); await h.engine.toggle(); const s=h.current(); const ack=deferred();
    if(phase!=='pausing')await h.engine.togglePause();
    let changing;
    if(phase!=='paused') {s.setPaused=()=>ack.promise;changing=h.engine.togglePause();await tick();}
    const before=h.events.preview.filter(x=>x==='resume').length;
    if(ending==='stop')await h.engine.toggle(); else if(ending==='cancel')await h.engine.cancel(); else {h.engine.dispose();await tick();}
    ack.resolve(); await changing; await tick();
    assert.equal(s.stops,ending==='stop'?1:0);assert.equal(s.cancels,ending==='stop'?0:1);
    assert.equal(h.events.inserts.length,ending==='stop'?1:0);
    assert.equal(h.events.preview.filter(x=>x==='resume').length,before);
    assert.equal(h.events.notices.at(-1),false);
  });
}

test('unconfirmed Pause cancels instead of leaving uncertain audio active', async t => {
  const h=await fixture(t);await h.engine.toggle();const s=h.current();
  s.setPaused=async()=>{throw Error('Pause was not confirmed');};await h.engine.togglePause();
  assert.equal(s.cancels,1);assert.equal(h.events.inserts.length,0);assert.equal(h.events.states.at(-1),'idle');
  assert.match(h.events.errors[0].message,/not confirmed/);
});

test('duplicate pause requests coalesce, while native Resume after acknowledgement remains usable', async t => {
  const h=await fixture(t);await h.engine.toggle();const s=h.current(),ack=deferred();let calls=0;
  s.setPaused=async paused=>{calls++;if(paused)await ack.promise;};
  const changing=h.engine.togglePause();await tick();
  await h.engine.togglePause();s.action('pause');assert.equal(calls,1);
  ack.resolve();await changing;s.action('resume');await tick();
  assert.equal(calls,2);assert.equal(h.events.states.at(-1),'recording');
  s.action('resume');await tick();assert.equal(calls,2);
  s.action('pause');await tick();assert.equal(calls,3);assert.equal(h.events.states.at(-1),'paused');
  s.action('stop');await tick();assert.equal(s.stops,1);
});

test('cancelled old pause acknowledgements do not affect a newer session', async t => {
  const h=await fixture(t);await h.engine.toggle();const old=h.current(),ack=deferred();
  old.setPaused=()=>ack.promise;const pending=h.engine.togglePause();await tick();await h.engine.cancel();
  await h.engine.toggle();const next=h.current();ack.resolve();await pending;await tick();
  assert.equal(h.events.states.at(-1),'recording');assert.deepEqual(next.changes,[]);
  old.action('pause');old.action('resume');assert.deepEqual(next.changes,[]);await h.engine.cancel();
});

test('pause does not erase the previous retained final transcript', async t => {
  const h=await fixture(t);await h.engine.toggle();await h.engine.toggle();
  await h.engine.toggle();await h.engine.togglePause();assert.equal(h.engine.getLastTranscript(),'complete final');
  assert.equal(await h.engine.copyLastTranscript(()=>assert.fail('copy while busy')),'busy');
  await h.engine.cancel();assert.equal(h.engine.getLastTranscript(),'complete final');
});

test('Pause outside an active recording does not start one', async t => {
  const h=await fixture(t);await h.engine.togglePause();assert.equal(h.events.sessions.length,0);
  h.engine.dispose();await h.engine.togglePause();assert.equal(h.events.sessions.length,0);
});
