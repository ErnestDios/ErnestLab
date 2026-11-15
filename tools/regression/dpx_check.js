// Decodes the dpx_samples.py files with dpx/worker.js and prints the largest error against the known code values.
const fs=require('fs'); global.self={}; let out=null; self.postMessage=(r)=>{ out=r; };
eval(fs.readFileSync(require('path').join(__dirname,'../../dpx/worker.js'),'utf8'));
const h2f=h=>{ const s=h&0x8000?-1:1,e=(h>>10)&31,m=h&1023; return e===0?s*m*2**-24:s*2**(e-15)*(1+m/1024); };
const W=64,H=48;
function codes(bits){ const mx=(1<<bits)-1; return (x,y)=>[Math.floor(x*mx/(W-1)),Math.floor(y*mx/(H-1)),Math.floor((x+y)*mx/(W+H-2))]; }
for (const f of fs.readdirSync('.').filter(f=>/\.(dpx|cin)$/.test(f)).sort()){
  const b=fs.readFileSync(f); out=null; self.onmessage({data:{buf:b.buffer.slice(b.byteOffset,b.byteOffset+b.length),maxTex:16384}});
  if (out.error){ console.log(f,'ERROR',out.error); continue; }
  const bits=out.info.bits, mx=(1<<bits)-1, C=codes(bits); let maxErr=0, bad=null;
  const luma=out.info.desc==='Y', flipy=/flipy/.test(f);
  for (let y=0;y<H;y++) for (let x=0;x<W;x++){ const sy=flipy?H-1-y:y, e=C(x,sy), o=(y*W+x)*4;
    for (let c=0;c<3;c++){ const want=(luma?e[1]:e[c])/mx, got=h2f(out.data[o+c]); const d=Math.abs(want-got); if (d>maxErr){ maxErr=d; bad=[x,y,c,want,got]; } } }
  const a=h2f(out.data[3]);
  console.log(f.padEnd(18), out.w+'x'+out.h, JSON.stringify({bits:out.info.bits,pack:out.info.pack,desc:out.info.desc,xfer:out.info.xferName,fps:out.info.fps,endian:out.info.endian}), 'max err', maxErr.toExponential(2), 'alpha', a.toFixed(4), bad&&maxErr>1e-3?bad:'');
}
