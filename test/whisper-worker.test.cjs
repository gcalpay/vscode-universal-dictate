const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const cp = require('node:child_process');
const { EventEmitter, once } = require('node:events');
const { PassThrough } = require('node:stream');
const { terminateOwnedProcess } = require('../dist/core/whisper-worker');
const tick = () => new Promise(r=>setImmediate(r));

function child() {
  const c = new EventEmitter(); c.exitCode = null; c.signalCode = null; c.stderr = new PassThrough();
  c.exit = () => { c.exitCode = 0; c.emit('exit',0,null); };
  return c;
}

function harness(t, { model = async()=>'model', ignoreKill = false, priorityFails = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'ud-m1-worker-'));
  const spawnCalls=[], priorities=[], events=[], servers=[], workers=[];
  let spawned;const spawning=new Promise(r=>spawned=r);
  const fakeSpawn=(binary,args,options)=>{
    const c=child(); c.pid=321; c.kills=[];
    const server=http.createServer((req,res)=>res.end('healthy'));servers.push(server);
    server.listen(Number(args[args.indexOf('--port')+1]),'127.0.0.1');
    c.kill=signal=>{c.kills.push(signal);if(!ignoreKill){server.closeAllConnections();c.exit();}return true;};
    spawnCalls.push({binary,args,options,child:c});spawned();return c;
  };
  const exports={};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/core/whisper-worker.js'),'utf8'),{
    exports,AbortController,setTimeout,clearTimeout,Buffer,
    require:id=>{
      if(id==='node:child_process')return {spawn:fakeSpawn};
      if(id==='node:os')return {...os,setPriority:(...args)=>{priorities.push(args);if(priorityFails)throw Error('permission');}};
      if(id==='node:fs')return {...fs,existsSync:()=>true};
      if(id==='./whisper-transport')return require('../dist/core/whisper-transport');
      return require(id);
    }
  });
  const make=(role='preview')=>{
    const worker=new exports.WhisperWorker({serverPath:'server.exe',publicPath:root,ensureModel:model,role,threads:role==='preview'?2:6,onEvent:e=>events.push(e)});
    workers.push(worker);return worker;
  };
  t.after(async()=>{await Promise.all(workers.map(w=>w.stop()));for(const s of servers){s.closeAllConnections();await new Promise(r=>s.close(r));}fs.rmSync(root,{recursive:true,force:true});});
  return {make,spawnCalls,priorities,events,spawning};
}

test('independent workers bind only loopback, preserve arguments, and lower only preview priority',async t=>{
  const h=harness(t),final=h.make('final'),preview=h.make('preview');
  const [f,p]=await Promise.all([final.ready(),preview.ready()]);
  assert.notEqual(f.port,p.port);assert.notEqual(f.requestPath,p.requestPath);
  assert.equal(h.spawnCalls.length,2);assert.equal(h.priorities.length,1);
  for(const c of h.spawnCalls){assert.equal(c.options.windowsHide,true);assert.ok(c.args.includes('-ng'));assert.equal(c.args[c.args.indexOf('--host')+1],'127.0.0.1');}
  assert.equal(final.isWarm(),true);await preview.stop();assert.equal(final.isWarm(),true);
  // Concurrent startup completion order is platform dependent; assert by owner.
  assert.equal(f.process.kills.length,0);
  assert.equal(p.process.kills.length,1);
});

test('concurrent warm calls share one startup and a cancelled model acquisition cannot spawn later',async t=>{
  let release;const model=new Promise(r=>release=r);const h=harness(t,{model:()=>model}),w=h.make();
  const a=w.ready(),b=w.ready();assert.equal(a,b);const failures=Promise.all([assert.rejects(a),assert.rejects(b)]);
  await w.stop();await failures;release('model');await tick();assert.equal(h.spawnCalls.length,0);
  await assert.rejects(w.ready(),/retired/);
});

test('priority failure cannot prevent preview startup',async t=>{
  const h=harness(t,{priorityFails:true}),w=h.make();await w.ready();assert.equal(w.isWarm(),true);
});

test('retiring a starting worker prevents late health success from reviving it',async t=>{
  const h=harness(t),w=h.make();const p=w.ready(),rejected=assert.rejects(p);
  await h.spawning;
  assert.equal(h.spawnCalls.length,1);await w.stop();await rejected;assert.equal(w.isWarm(),false);await assert.rejects(w.ready());
});

test('termination waits for actual exit, even when kill reports success',async()=>{
  const c=child();c.kill=()=>true;let done=false;
  const result=terminateOwnedProcess(c).then(x=>{done=true;return x;});await tick();assert.equal(done,false);
  c.exit();assert.equal(await result,true);assert.equal(c.listenerCount('close'),0);
});

test('termination escalates to SIGKILL and reports unconfirmed exit within its bound',async()=>{
  const c=child(),signals=[];c.pid=123;c.kill=s=>{signals.push(s);return false;};
  assert.equal(await terminateOwnedProcess(c),false);assert.deepEqual(signals,['SIGTERM','SIGKILL']);assert.equal(c.listenerCount('exit'),0);
});

test('spawn error with no process is not mistaken for an indefinitely running child',async()=>{
  const c=child();c.kill=()=>{c.emit('error',Error('spawn failed'));return false;};
  assert.equal(await terminateOwnedProcess(c),true);
});

test('bounded termination closes an actual owned Node process',async t=>{
  const c=cp.spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
  t.after(()=>{if(c.exitCode===null&&c.signalCode===null)c.kill('SIGKILL');});
  await once(c,'spawn');assert.equal(await terminateOwnedProcess(c),true);assert.ok(c.exitCode!==null||c.signalCode!==null);
});
