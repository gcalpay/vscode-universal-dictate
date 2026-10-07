/* Replays identical synthetic PCM against M0 and M1, one runtime at a time.
 * Native Whisper is real. Recorder-close and insertion endpoints are synthetic.
 * Client dispatch != native compute start. Raw observations preserve that distinction.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { performance } = require('node:perf_hooks');
const { DictationEngine } = require('../../dist/core/dictation');
const { createPreviewAudio } = require('../../dist/core/preview-audio');
const { WhisperRuntime: Candidate } = require('../../dist/core/whisper');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function pcmFrom(file) {
  const raw = fs.readFileSync(file);
  assert.equal(raw.toString('ascii',0,4),'RIFF'); assert.equal(raw.toString('ascii',8,12),'WAVE');
  let pcm, valid = false;
  for (let i=12; i+8<=raw.length;) {
    const size=raw.readUInt32LE(i+4), end=i+8+size; assert.ok(end<=raw.length);
    const tag=raw.toString('ascii',i,i+4);
    if(tag==='fmt ')valid=size>=16&&raw.readUInt16LE(i+8)===1&&raw.readUInt16LE(i+10)===1&&raw.readUInt32LE(i+12)===16000&&raw.readUInt16LE(i+22)===16;
    if(tag==='data')pcm=raw.subarray(i+8,end);
    i=end+size%2;
  }
  assert.ok(valid&&pcm&&pcm.length>=12*32000,'12-second PCM16 mono/16kHz fixture required');
  return pcm;
}
function wav(pcm) {
  const header=Buffer.from(createPreviewAudio('header',1,Buffer.alloc(2)).wav.subarray(0,44));
  header.writeUInt32LE(36+pcm.length,4);header.writeUInt32LE(pcm.length,40);
  return Buffer.concat([header,pcm]);
}
function stats(values) {
  const v=[...values].sort((a,b)=>a-b), middle=Math.floor(v.length/2);
  return {n:v.length,min:v[0],median:v.length%2?v[middle]:(v[middle-1]+v[middle])/2,max:v.at(-1)};
}
function deltas(events) {
  assert.deepEqual(events.map(e=>e.stage),['T0','T1','T2','T3','T4','T5','T6']);
  const t=Object.fromEntries(events.map(e=>[e.stage,e.atMs]));
  for(let i=1;i<events.length;i++)assert.ok(events[i].atMs>=events[i-1].atMs);
  return {recorderMs:t.T1-t.T0,previewStopResidualMs:t.T2-t.T1,
    finalAdapterMs:t.T4-t.T3,insertMs:t.T6-t.T5,totalMs:t.T6-t.T0};
}
function pids(runtime) {
  return runtime.getWorkerStatus ? runtime.getWorkerStatus() : {finalPid:runtime.activeServerProcess?.pid};
}
async function resources(runtime) {
  const owned=Object.values(pids(runtime)).filter(x=>Number.isInteger(x)&&x>0);
  if(process.platform!=='win32'||!owned.length)return [];
  const command=`Get-Process -Id ${owned.join(',')} | Select-Object Id,WorkingSet64,PeakWorkingSet64,PriorityClass,@{Name='CpuSeconds';Expression={$_.TotalProcessorTime.TotalSeconds}} | ConvertTo-Json -Compress`;
  const {stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{timeout:10000,windowsHide:true});
  const result=JSON.parse(stdout);return Array.isArray(result)?result:[result];
}
async function closeRuntime(runtime) {
  if(runtime.shutdown)return runtime.shutdown();
  const child=runtime.activeServerProcess;
  runtime.dispose();
  if(child)for(let i=0;i<100&&child.exitCode===null&&child.signalCode===null;i++)await sleep(25);
  assert.ok(!child||child.exitCode!==null||child.signalCode!==null,'baseline worker still alive');
}

// Separate regression guard: both final-only workers are resident, but requests
// execute sequentially in alternating order. Neither runtime creates preview.
// This controls time-varying VM load more tightly than whole-policy blocks.
async function offGuard(Baseline, Candidate, server, model, root, full) {
  const runtimes={}, observations=[];
  const file=path.join(root,'off-guard.wav');fs.writeFileSync(file,full);
  try {
    for(const [policy,Runtime] of [['baseline',Baseline],['candidate',Candidate]]) {
      runtimes[policy]=new Runtime({serverPath:path.resolve(server),
        cliPath:path.join(path.dirname(path.resolve(server)),'whisper-cli.exe'),
        publicPath:path.join(root,'guard-'+policy),ensureModel:async()=>path.resolve(model)});
      await runtimes[policy].warm();
    }
    for(const language of ['en','auto']) {
      for(const runtime of Object.values(runtimes)) {
        assert.ok((await runtime.transcribe(file,language)).trim());
      }
      for(let repeat=0;repeat<8;repeat++) {
        for(const policy of repeat%2?['candidate','baseline']:['baseline','candidate']) {
          const runtime=runtimes[policy],pid=pids(runtime).finalPid;
          assert.equal(pids(runtime).previewPid,undefined);
          let inferencePath;
          const begin=performance.now();
          const text=await runtime.transcribe(file,language,value=>{inferencePath=value;});
          const elapsedMs=performance.now()-begin;
          assert.equal(inferencePath,'server');assert.equal(pids(runtime).finalPid,pid);
          assert.ok(text.trim());
          observations.push({policy,language,repeat,elapsedMs,finalPid:pid,textSha256:hash(text)});
        }
      }
    }
    const summary=[];
    for(const language of ['en','auto']) {
      const rows=observations.filter(row=>row.language===language);
      const baseline=stats(rows.filter(row=>row.policy==='baseline').map(row=>row.elapsedMs));
      const candidate=stats(rows.filter(row=>row.policy==='candidate').map(row=>row.elapsedMs));
      const differenceMs=candidate.median-baseline.median;
      summary.push({language,baseline,candidate,differenceMs,
        withinRegressionBudget:differenceMs<=Math.max(100,baseline.median*0.1)});
    }
    return {kind:'interleaved final-only adapter calls; both models idle-resident; no preview; not T0-T6',observations,summary};
  } finally {await Promise.all(Object.values(runtimes).map(closeRuntime));}
}

async function main() {
  const [baselineModule,server,model,fixture,output]=process.argv.slice(2);
  assert.ok(baselineModule&&server&&model&&fixture&&output,'baseline module/server/model/fixture/output required');
  const {WhisperRuntime:Baseline}=require(path.resolve(baselineModule));
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ud-m1-compare-'));
  const pcm=pcmFrom(fixture), full=wav(pcm.subarray(0,12*32000));
  const result={kind:'M0/M1 controlled comparison; native Whisper, synthetic recorder and insertion',
    baselineSha:'81c92d0bcd286b8150aeb311c785e34a00bed926',sourceSha:process.env.GITHUB_SHA??null,
    platform:process.platform,node:process.version,cpu:os.cpus()[0]?.model,logicalProcessors:os.cpus().length,
    finalThreads:Math.max(1,Math.min(8,os.cpus().length-2)),previewThreads:Math.min(2,Math.max(1,os.cpus().length-2)),
    fixtureSha256:hash(fs.readFileSync(fixture)),finalWavSha256:hash(full),modelSha256:hash(fs.readFileSync(model)),
    finalSeconds:12,previewSeconds:8,runs:[],resources:[],summary:[]};
  // Observe both implementations at the same client socket-write boundary. The
  // observer never changes bytes, timers, headers, request count or scheduling.
  const originalRequest=http.request;let dispatched;
  http.request=function(...args){
    const req=Reflect.apply(originalRequest,this,args),end=req.end;
    req.end=function(chunk,...rest){
      const value=Reflect.apply(end,this,[chunk,...rest]);
      if(Buffer.isBuffer(chunk)&&chunk.includes(Buffer.from('filename="preview.wav"')))dispatched?.(performance.now());
      return value;
    };
    return req;
  };
  try {
    for(let repeat=0;repeat<3;repeat++) {
      // Alternate policies to reduce a simple first/last thermal or runner-order bias.
      for(const policy of repeat%2?['candidate','baseline']:['baseline','candidate']) {
        const Runtime=policy==='candidate'?Candidate:Baseline, workerEvents=[];
        const runtime=new Runtime({serverPath:path.resolve(server),cliPath:path.join(path.dirname(path.resolve(server)),'whisper-cli.exe'),
          publicPath:path.join(root,policy),ensureModel:async()=>path.resolve(model),onWorkerEvent:event=>workerEvents.push(event)});
        try {
          await runtime.warm();
          for(const language of ['en','auto']) {
            const prime=path.join(root,'prime.wav');fs.writeFileSync(prime,full);
            assert.ok((await runtime.transcribe(prime,language)).trim());
            for(const condition of ['off','idle','active-100','active-800']) {
              const audio=createPreviewAudio('comparison',8*16000,pcm.subarray(0,8*32000));
              if(condition!=='off')await runtime.preview(audio,language,new AbortController().signal); // warm preview before overlap probe
              if(repeat===0&&language==='en'&&(condition==='off'||condition==='idle')) {
                result.resources.push({policy,condition,workers:pids(runtime),processes:await resources(runtime)});
              }
              const finalPid=pids(runtime).finalPid;
              const file=path.join(root,'final.wav');fs.writeFileSync(file,full);
              const events=[],failures=[];let finalText='',inferencePath,control,work,settled=true,dispatchAt=null;
              const session={outputPath:file,onAction(){},onFailure(){},stop:async()=>file,cancel:async()=>{}};
              const engine=new DictationEngine({prepare:async()=>{},warm:()=>runtime.warm(),startRecorder:async()=>session,
                transcribe:f=>runtime.transcribe(f,language,p=>{inferencePath=p;}),insert:async text=>{finalText=text;},
                onError:()=>failures.push('engine-failure'),onLatencyEvent:e=>events.push(e),
                startPreview:condition==='off'?undefined:()=>({stop:async()=>{control?.abort();await runtime.stopPreview();await work;}})});
              const eventStart=workerEvents.length;
              await engine.toggle();
              if(condition.startsWith('active')) {
                const sent=new Promise(resolve=>{dispatched=at=>{dispatchAt=at;resolve();};});
                settled=false;control=new AbortController();
                work=runtime.preview(audio,language,control.signal).then(()=>{settled=true;},()=>{settled=true;});
                await Promise.race([sent,work.then(()=>{throw Error('preview settled before dispatch was observed');})]);
                await sleep(Number(condition.split('-')[1]));
              }
              const pendingAtStop=!settled, stopAt=performance.now();
              dispatched=undefined;
              await engine.toggle();engine.dispose();
              assert.equal(failures.length,0);assert.ok(finalText.trim());assert.equal(inferencePath,'server');
              assert.equal(pids(runtime).finalPid,finalPid,'final model was evicted');
              if(policy==='candidate') {
                assert.equal(pids(runtime).previewPid,undefined,'preview worker leaked after Stop');
                assert.equal(pids(runtime).previewDisabled,false,'preview teardown was unconfirmed');
                if(condition!=='off') {
                  const after=workerEvents.slice(eventStart),exit=after.find(e=>e.role==='preview'&&e.kind==='exit'),request=after.find(e=>e.role==='final'&&e.kind==='request');
                  assert.ok(exit&&request&&exit.atMs<=request.atMs,'final request raced preview process termination');
                }
              }
              result.runs.push({policy,repeat,language,condition,hostPendingAtStop:pendingAtStop,
                dispatchToStopMs:dispatchAt===null?null:stopAt-dispatchAt,inferencePath,finalPid,
                finalTextSha256:hash(finalText),characters:finalText.length,...deltas(events)});
            }
          }
        } finally {dispatched=undefined;await closeRuntime(runtime);}
      }
    }
    for(const policy of ['baseline','candidate'])for(const language of ['en','auto'])for(const condition of ['off','idle','active-100','active-800']) {
      const rows=result.runs.filter(r=>r.policy===policy&&r.language===language&&r.condition===condition);
      result.summary.push({policy,language,condition,totalMs:stats(rows.map(r=>r.totalMs)),finalAdapterMs:stats(rows.map(r=>r.finalAdapterMs)),
        previewStopResidualMs:stats(rows.map(r=>r.previewStopResidualMs)),hostPendingCount:rows.filter(r=>r.hostPendingAtStop).length});
    }
    result.textHashesByLanguage=Object.fromEntries(['en','auto'].map(language=>[language,[...new Set(result.runs.filter(r=>r.language===language).map(r=>r.finalTextSha256))]]));
    result.offGuard=await offGuard(Baseline,Candidate,server,model,root,full);
    assert.ok(result.offGuard.summary.every(row=>row.withinRegressionBudget),'interleaved Preview-Off regression budget exceeded');
    result.status='completed';
  } catch(error) {
    result.status='failed';result.error=error.message;throw error;
  } finally {
    http.request=originalRequest;
    fs.writeFileSync(output,JSON.stringify(result,null,2));fs.rmSync(root,{recursive:true,force:true});
  }
  console.log(JSON.stringify({status:result.status,summary:result.summary,offGuard:result.offGuard.summary,textHashesByLanguage:result.textHashesByLanguage}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
