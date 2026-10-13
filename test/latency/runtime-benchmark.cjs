/* M0 baseline: production DictationEngine + WhisperRuntime, synthetic speech. */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {performance}=require('node:perf_hooks');
const {DictationEngine}=require('../../dist/core/dictation');
const {WhisperRuntime}=require('../../dist/core/whisper');
const {createPreviewAudio}=require('../../dist/core/preview-audio');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function readPcm(file){const raw=fs.readFileSync(file);let pcm,ok=false;
 if(raw.toString('ascii',0,4)!=='RIFF'||raw.toString('ascii',8,12)!=='WAVE')throw Error('WAV required');
 for(let i=12;i+8<=raw.length;){const n=raw.readUInt32LE(i+4),end=i+8+n;if(end>raw.length)throw Error('truncated WAV');
  const tag=raw.toString('ascii',i,i+4);if(tag==='fmt ')ok=n>=16&&raw.readUInt16LE(i+8)===1&&raw.readUInt16LE(i+10)===1&&raw.readUInt32LE(i+12)===16000&&raw.readUInt16LE(i+22)===16;
  if(tag==='data')pcm=raw.subarray(i+8,end);i=end+n%2;} if(!ok||!pcm||pcm.length<12*32000)throw Error('12+ second mono 16kHz PCM16 fixture required');return pcm;}
function wav(pcm){const h=Buffer.from(createPreviewAudio('header',1,Buffer.alloc(2)).wav.subarray(0,44));h.writeUInt32LE(36+pcm.length,4);h.writeUInt32LE(pcm.length,40);return Buffer.concat([h,pcm]);}
class Session{constructor(outputPath){this.outputPath=outputPath;}onAction(){}onFailure(){}async stop(){return this.outputPath;}async cancel(){}}
function deltas(events){const required=['T0','T1','T2','T3','T4','T5','T6'];if(events.map(e=>e.stage).join(',')!==required.join(','))throw Error('unexpected latency stages');
 const m=Object.fromEntries(events.map(e=>[e.stage,e.atMs])),d=(a,b)=>m[b]-m[a];return{recorderCloseMs:d('T0','T1'),previewSettleMs:d('T1','T2'),preInferenceMs:d('T2','T3'),inferenceMs:d('T3','T4'),preInsertMs:d('T4','T5'),insertMs:d('T5','T6'),totalMs:d('T0','T6')};}
function median(v){v=[...v].sort((a,b)=>a-b);const i=Math.floor(v.length/2);return v.length%2?v[i]:(v[i-1]+v[i])/2;}
async function run(runtime,pcm,root,language,preview,repeat){const id=`m0-${language}-${preview?'preview':'plain'}-${repeat}`,file=path.join(root,id+'.wav');fs.writeFileSync(file,wav(pcm.subarray(0,12*32000)));
 const session=new Session(file),events=[];let inferencePath='unknown';
 const engine=new DictationEngine({prepare:async()=>{},warm:()=>runtime.warm(),startRecorder:async()=>session,
  transcribe:p=>runtime.transcribe(p,language,x=>{inferencePath=x;}),insert:async()=>{},onLatencyEvent:e=>events.push(e),
  startPreview:preview?(_s,signal)=>{const c=new AbortController(),abort=()=>c.abort();signal.addEventListener('abort',abort,{once:true});
   const work=runtime.preview(createPreviewAudio(id,8*16000,pcm.subarray(0,8*32000)),language,c.signal).catch(()=> '');
   return{stop:async()=>{signal.removeEventListener('abort',abort);c.abort();await work;}};}:undefined});
 await engine.toggle();if(preview)await sleep(250);const t=performance.now();await engine.toggle();const wallMs=performance.now()-t;engine.dispose();
 return{language,preview,repeat,inferencePath,wallMs,...deltas(events)};}
async function main(){const [server,model,fixture,output]=process.argv.slice(2);if(!server||!model||!fixture||!output)throw Error('server model fixture output paths required');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ud-m0-')),pcm=readPcm(fixture),results={kind:'M0 stop-to-insert baseline',sourceSha:process.env.GITHUB_SHA||null,node:process.version,cpu:os.cpus()[0]?.model,runs:[],summary:[]};
 const runtime=new WhisperRuntime({serverPath:path.resolve(server),cliPath:path.join(path.dirname(path.resolve(server)),'whisper-cli.exe'),publicPath:root,ensureModel:async()=>path.resolve(model)});
 try{await runtime.warm();for(const language of ['en','auto'])for(let repeat=0;repeat<2;repeat++){results.runs.push(await run(runtime,pcm,root,language,false,repeat));results.runs.push(await run(runtime,pcm,root,language,true,repeat));}
  for(const language of ['en','auto'])for(const preview of [false,true]){const a=results.runs.filter(r=>r.language===language&&r.preview===preview);results.summary.push({language,preview,samples:a.length,medianTotalMs:median(a.map(r=>r.totalMs)),medianPreviewSettleMs:median(a.map(r=>r.previewSettleMs)),medianInferenceMs:median(a.map(r=>r.inferenceMs)),paths:[...new Set(a.map(r=>r.inferencePath))]});}
  results.status='completed';}catch(e){results.status='failed';results.error=e.message;throw e;}finally{runtime.dispose();fs.writeFileSync(output,JSON.stringify(results,null,2));fs.rmSync(root,{recursive:true,force:true});}console.log(JSON.stringify(results));}
main().catch(e=>{console.error(e);process.exitCode=1;});
