/* Recovery regression with real, individually owned Node child processes.
 * Synthetic loopback inference; no microphone, native UI, or Whisper model.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {performance}=require('node:perf_hooks');
const {PreviewCoordinator}=require('../dist/core/preview-coordinator');
const {WhisperRuntime}=require('../dist/core/whisper');
const {terminateOwnedProcess}=require('../dist/core/whisper-worker');
const {createPreviewAudio}=require('../dist/core/preview-audio');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const childCode=[
  "const http=require('node:http');",
  "const mode=process.env.UD_PROBE_MODE;",
  "const server=http.createServer((req,res)=>{",
  "  if(req.url.endsWith('/health')) {res.end('ok');return;}",
  "  req.resume();req.on('end',()=>{",
  "    process.send?.({kind:'request'});",
  "    if(mode!=='stall')res.end(mode==='final'?'authoritative final':'recovered preview');",
  "  });",
  "});",
  "server.listen(0,'127.0.0.1',()=>process.send?.({kind:'ready',port:server.address().port}));"
].join('\n');

class ChildWorker {
  constructor(role,mode,events) {
    this.role=role; this.mode=mode; this.events=events;
    this.retired=false; this.child=undefined; this.state=undefined;
    this.starting=undefined; this.stopping=undefined;
  }
  get pid(){return this.child?.pid;}
  isWarm(){return !this.retired && !!this.state && this.child.exitCode===null && this.child.signalCode==null;}
  ready() {
    if(this.retired)return Promise.reject(Error('retired worker'));
    if(!this.starting){
      const child=spawn(process.execPath,['-e',childCode],{
        windowsHide:true,env:{...process.env,UD_PROBE_MODE:this.mode},
        stdio:['ignore','ignore','pipe','ipc']
      });
      this.child=child;
      child.stderr?.resume();
      this.events.push({kind:'spawn',role:this.role,mode:this.mode,pid:child.pid,atMs:performance.now()});
      child.on('exit',()=>this.events.push({kind:'exit',role:this.role,pid:child.pid,atMs:performance.now()}));
      this.starting=new Promise((resolve,reject)=>{
        const deadline=setTimeout(()=>reject(Error('child did not become ready')),5000);
        const fail=e=>{clearTimeout(deadline);reject(e);};
        child.once('error',fail);
        child.on('message',message=>{
          if(message?.kind==='request')this.events.push({kind:'request',role:this.role,pid:child.pid});
          if(message?.kind==='ready'){
            clearTimeout(deadline);child.removeListener('error',fail);
            if(this.retired){reject(Error('retired during startup'));return;}
            this.state={process:child,port:message.port,requestPath:'/test'};
            resolve(this.state);
          }
        });
        child.once('exit',()=>{if(!this.state)fail(Error('child exited before ready'));});
      });
    }
    return this.starting;
  }
  stop(){
    if(!this.stopping){
      this.retired=true;this.state=undefined;
      this.stopping=this.child?terminateOwnedProcess(this.child):Promise.resolve(true);
    }
    return this.stopping;
  }
}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(testFn,ms=25000){
  const deadline=performance.now()+ms;
  while(!testFn()){
    if(performance.now()>deadline)throw Error('timeout-recovery observation not reached');
    await delay(15);
  }
}

test('Windows-compatible real-process preview timeout retires before retry, preserving final inference',{timeout:30000},async t=>{
  const events=[],updates=[],failures=[],transient=[],workers=[];
  let acquired=0,released=0,previewCreated=0;
  const runtime=new WhisperRuntime({
    serverPath:'unused',cliPath:'unused',publicPath:'unused',
    ensureModel:async()=> 'unused'
  });
  const worker=role=>{
    const mode=role==='final'?'final':(++previewCreated===1?'stall':'preview');
    const w=new ChildWorker(role,mode,events);workers.push(w);return w;
  };
  runtime.finalWorker=worker('final');
  runtime.createWorker=worker;
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ud-recovery-win-'));
  const wav=createPreviewAudio('probe',32000,Buffer.alloc(64000));
  const finalPath=path.join(root,'final.wav');
  fs.writeFileSync(finalPath,wav.wav);
  const coordinator=new PreviewCoordinator({
    sessionId:'probe',language:'en',maxTimeoutRetries:1,
    intervalMs:2000,timeoutMs:10000,
    acquire:async()=>({
      audio:createPreviewAudio('probe',++acquired*32000,Buffer.alloc(64000)),
      release:async()=>{released++;}
    }),
    decode:(a,l,s)=>runtime.preview(a,l,s),
    onPreview:x=>updates.push(x),
    onFailure:x=>failures.push(x),
    onTransientTimeout:()=>transient.push('timeout')
  });
  t.after(async()=>{
    await coordinator.stop();await runtime.shutdown();
    for(const w of workers){
      await w.stop();
      if(w.child?.exitCode===null&&w.child?.signalCode==null){
        try{w.child.kill('SIGKILL');}catch{}
      }
    }
    fs.rmSync(root,{recursive:true,force:true});
  });
  await runtime.warm();
  const finalPid=runtime.getWorkerStatus().finalPid;
  coordinator.start();
  await until(()=>updates.length>0);
  assert.deepEqual(updates.map(u=>u.text),['recovered preview']);
  assert.deepEqual(transient,['timeout']);
  assert.deepEqual(failures,[]);
  const spawns=events.filter(e=>e.role==='preview'&&e.kind==='spawn');
  assert.equal(spawns.length,2);
  const firstExit=events.find(e=>e.kind==='exit'&&e.pid===spawns[0].pid);
  assert.ok(firstExit&&firstExit.atMs<=spawns[1].atMs,'old preview PID must exit before replacement');
  assert.equal(acquired,released,'audio lease release must precede reuse');
  await coordinator.stop();await runtime.stopPreview();
  assert.equal(runtime.getWorkerStatus().finalPid,finalPid,'preview cleanup cannot retire the final worker');
  assert.equal(await runtime.transcribe(finalPath,'en'),'authoritative final');
  assert.equal(events.filter(e=>e.role==='final'&&e.kind==='request').length,1);
  assert.equal(runtime.getWorkerStatus().finalPid,finalPid);
});