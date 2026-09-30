/* Synthetic native bridge to actual Node framing. No microphone, clipboard or input. */
const assert=require('node:assert/strict');
const cp=require('node:child_process');
const {once}=require('node:events');
const {RecorderPreviewChannel,RecorderLines,MAX_PREVIEW_LINE}=require('../dist/core/preview-recorder');
async function main() {
  if(!process.argv[2])throw Error('native bridge executable required');
  const child=cp.spawn(process.argv[2],['--ipc'],{stdio:['pipe','pipe','pipe'],windowsHide:true});
  const exited=once(child,'close');
  const channel=new RecorderPreviewChannel('synthetic-session',(line,fail)=>child.stdin.write(line,e=>{if(e)fail(e);}));
  let ready,failed;const startup=new Promise((a,b)=>{ready=a;failed=b;});
  const timer=setTimeout(()=>failed(Error('native startup timed out')),5000);
  const lines=new RecorderLines(MAX_PREVIEW_LINE,line=>{if(line==='READY')ready();else channel.line(line);},()=>channel.fail());
  child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>lines.push(chunk));
  child.on('error',failed);child.stdin.on('error',failed);child.stderr.resume();
  try {
    await startup;clearTimeout(timer);
    const lease=await channel.acquire(new AbortController().signal);
    assert.deepEqual([lease.audio.startFrame,lease.audio.endFrame],[0,3]);
    assert.deepEqual([...lease.audio.wav.subarray(44)],[0,128,0,0,255,127]);await lease.release();
    channel.display({sessionId:'synthetic-session',revision:1,text:'Grüße 🧪'});
    channel.stop();child.stdin.end('STOP\n');
    const [code]=await exited;assert.equal(code,0);
    console.log('PASS native/Node preview IPC with exact PCM and bounded UTF-8 framing');
  } finally {clearTimeout(timer);channel.stop();lines.close();if(child.exitCode===null)child.kill();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
