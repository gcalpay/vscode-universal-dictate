/* Production TypeScript/Node adapter measurement; synthetic fixture, no microphone. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { WhisperRuntime } = require('../../dist/core/whisper');
const { PreviewCoordinator } = require('../../dist/core/preview-coordinator');
const { createPreviewAudio } = require('../../dist/core/preview-audio');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function readPcm(file) {
  const raw = fs.readFileSync(file);
  if(raw.toString('ascii',0,4)!=='RIFF'||raw.toString('ascii',8,12)!=='WAVE')throw Error('WAV required');
  let pcm, format = false;
  for(let i=12;i+8<=raw.length;) {
    const n=raw.readUInt32LE(i+4), end=i+8+n;if(end>raw.length)throw Error('truncated WAV');
    const tag=raw.toString('ascii',i,i+4);
    if(tag==='fmt ') format=n>=16&&raw.readUInt16LE(i+8)===1&&raw.readUInt16LE(i+10)===1&&raw.readUInt32LE(i+12)===16000&&raw.readUInt16LE(i+22)===16;
    if(tag==='data')pcm=raw.subarray(i+8,end);
    i=end+(n%2);
  }
  if(!format||!pcm||pcm.length<20*32000)throw Error('20+ second mono 16kHz PCM16 fixture required');
  return pcm;
}
function wav(pcm) {
  const header=Buffer.from(createPreviewAudio('bench',1,Buffer.alloc(2)).wav.subarray(0,44));
  header.writeUInt32LE(36+pcm.length,4);header.writeUInt32LE(pcm.length,40);return Buffer.concat([header,pcm]);
}
async function main() {
  const [server,model,fixture,output]=process.argv.slice(2);
  if(!server||!model||!fixture||!output)throw Error('server model fixture output paths required');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ud-preview-adapter-'));
  const pcm=readPcm(fixture), results={kind:'production Node adapters / synthetic English / not UI latency',node:process.version,cpu:os.cpus()[0]?.model,threads:Math.max(1,Math.min(8,os.cpus().length-2)),stop:[],replay:[]};
  const runtime=new WhisperRuntime({serverPath:path.resolve(server),cliPath:path.join(path.dirname(path.resolve(server)),'whisper-cli.exe'),publicPath:root,ensureModel:async()=>path.resolve(model)});
  const full12=path.join(root,'final12.wav');fs.writeFileSync(full12,wav(pcm.subarray(0,12*32000)));
  try {
    await runtime.warm();
    for(const language of ['en','auto']) {
      let begin=performance.now();let final=await runtime.transcribe(full12,language);
      if(!final.trim())throw Error('empty synthetic final');
      results.stop.push({language,condition:'uncontended-12s-final',elapsedMs:performance.now()-begin,characters:final.length});
      for(let repeat=0;repeat<2;repeat++) {
        const abort=new AbortController();let previewOutcome;
        const preview=runtime.preview(createPreviewAudio('probe',8*16000,pcm.subarray(0,8*32000)),language,abort.signal)
          .then(()=>previewOutcome='completed',()=>previewOutcome='rejected');
        await sleep(250);begin=performance.now();
        final=await runtime.transcribe(full12,language);await preview;
        if(!final.trim())throw Error('empty synthetic final after preview');
        results.stop.push({language,condition:'abort-eight-second-preview-before-final',elapsedMs:performance.now()-begin,previewOutcome,characters:final.length});
      }
      const beginReplay=performance.now(), updates=[], failures=[];
      let pausedDuration=0, acquisitions=0;
      const coordinator=new PreviewCoordinator({sessionId:'replay',language,
        acquire:async signal=>{signal.throwIfAborted();acquisitions++;const end=Math.min(20*16000,Math.floor((performance.now()-beginReplay-pausedDuration)/1000*16000));
          if(end<16000)return undefined;
          const start=Math.max(0,end-8*16000);return {audio:createPreviewAudio('replay',end,pcm.subarray(start*2,end*2)),release:async()=>{}};},
        decode:(audio,lang,signal)=>runtime.preview(audio,lang,signal),
        onPreview:update=>updates.push({atMs:performance.now()-beginReplay,endFrame:update.endFrame,characters:update.text.length}),
        onFailure:failure=>failures.push(failure)});
      coordinator.start();await sleep(8000);
      const pauseBegin=performance.now();await coordinator.pause();
      const acquiredAtPause=acquisitions,updatesAtPause=updates.length;
      await sleep(2200);
      if(acquisitions!==acquiredAtPause||updates.length!==updatesAtPause)throw Error('paused preview acquired/displayed new work');
      pausedDuration=performance.now()-pauseBegin;coordinator.resume();
      await sleep(12000);const stopped=performance.now();await coordinator.stop();
      if(acquisitions<=acquiredAtPause||updates.length<=updatesAtPause)throw Error('preview did not recover after Resume');
      const full=path.join(root,`final-${language}.wav`);fs.writeFileSync(full,wav(pcm.subarray(0,20*32000)));
      final=await runtime.transcribe(full,language);
      results.replay.push({language,durationSeconds:20,pausedDurationMs:pausedDuration,acquiredAtPause,updatesAtPause,acquisitions,updates,failures,stopToFinalMs:performance.now()-stopped,finalCharacters:final.length});
      if(failures.length||!updates.length||!final.trim())throw Error('synthetic adapter replay failed');
    }
    results.status='completed';
  } catch(error) {results.status='failed';results.error=error.message;throw error;}
  finally {runtime.dispose();fs.writeFileSync(output,JSON.stringify(results,null,2));/* Do not unlink active model handles. */}
  console.log(JSON.stringify(results));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
