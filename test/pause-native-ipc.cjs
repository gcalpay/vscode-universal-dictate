/* Actual Node -> C++ pause protocol and WAV checks. Synthetic capture, no microphone/UI. */
const assert=require('node:assert/strict');const fs=require('node:fs/promises');
const os=require('node:os');const path=require('node:path');
const {CoreRecorderSession}=require('../dist/core/recorder');
function pcm(raw){
  assert.equal(raw.toString('ascii',0,4),'RIFF');assert.equal(raw.toString('ascii',8,12),'WAVE');
  for(let i=12;i+8<=raw.length;){const n=raw.readUInt32LE(i+4);assert.ok(i+8+n<=raw.length);
    if(raw.toString('ascii',i,i+4)==='data')return raw.subarray(i+8,i+8+n);i+=8+n+n%2;}
  assert.fail('missing WAV data');
}
async function main(){
  const binary=process.argv[2];assert.ok(binary,'synthetic native test executable required');
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ud-pause-ipc-'));
  const sessions=[];
  try{
    for(const ending of ['resume-stop','paused-stop','cancel','abort']){
      const file=path.join(dir,`${ending}.wav`),abort=new AbortController();
      const session=await CoreRecorderSession.start({recorderPath:path.resolve(binary),outputPath:file,showOverlay:false,signal:abort.signal},()=>{});sessions.push(session);
      await session.setPaused(true);await session.setPaused(true); // Idempotent: no second request.
      if(ending==='cancel'||ending==='abort'){
        if(ending==='abort')abort.abort();await session.cancel();
        assert.equal(await fs.stat(file).catch(()=>null),null);continue;
      }
      if(ending==='resume-stop')await session.setPaused(false);
      const result=await session.stop();const data=pcm(await fs.readFile(result));
      assert.equal(data.length,ending==='resume-stop'?6400:3200);
      for(let i=0;i<data.length;i+=2)assert.equal(data.readInt16LE(i),i<3200?1111:-2222);
    }
    console.log('4 actual Node/C++ pause-resume-stop/cancel/abort cases passed; exact synthetic PCM retained');
  }finally{await Promise.allSettled(sessions.map(s=>s.cancel()));await fs.rm(dir,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
