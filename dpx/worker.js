/* Ernest Lab · dpx/worker.js · decodes one DPX (SMPTE 268M) or Cineon file off the main thread.
   Written for Ernest Lab (MIT), no third-party code. Module or classic worker; it can be reused for many files.
   In:  {buf: ArrayBuffer, maxTex: number}
   Out: {w, h, data: Uint16Array RGBA half floats (row 0 = top), info} or {error}
   Integer files come out as their code values normalised to 0..1 (code / (2^bits - 1)), floats as stored: the app applies the
   transfer (Cineon printing density, linear, video, log…) on the GPU, so the choice can change without decoding again.
   Supported: DPX 8 / 10 / 12 / 16-bit integer and 32-bit float, RGB / RGBA / ABGR / luma, filled (method A and B) or packed,
   both byte orders, uncompressed; Cineon 10-bit (3 per 32-bit word) and 8 / 16-bit. Not supported: RLE, Y'CbCr descriptors. */
"use strict";
const f32=new Float32Array(1), u32=new Uint32Array(f32.buffer);
function f2h(v){   /* float → half bits (round to nearest, clamp to ±65504, NaN/Inf → 0) */
  if (!(v===v) || v===Infinity || v===-Infinity) return 0;
  f32[0]=v; const x=u32[0], s=(x>>>16)&0x8000; let e=((x>>>23)&0xff)-112, m=x&0x7fffff;
  if (e<=0){ if (e<-10) return s; m=(m|0x800000)>>(1-e); return s|((m+0x1000)>>13); }
  if (e>=31) return s|0x7bff;
  const h=s|(e<<10)|(m>>13); return (m&0x1000) ? h+1 : h; }
const lutCache={};
function lut(bits){ if (lutCache[bits]) return lutCache[bits]; const n=1<<bits, t=new Uint16Array(n), mx=n-1; for (let i=0;i<n;i++) t[i]=f2h(i/mx); return (lutCache[bits]=t); }
const DESC={50:"RGB",51:"RGBA",52:"ABGR",6:"Y",1:"R",2:"G",3:"B",4:"A"};
const XFER={0:"user",1:"printing density",2:"linear",3:"logarithmic",4:"video",5:"SMPTE 274M",6:"Rec.709",7:"Rec.601 625",8:"Rec.601 525",9:"NTSC",10:"PAL",11:"Z linear",12:"Z homogeneous",13:"ADX",14:"Rec.2020",15:"Rec.2020 CL",16:"xvYCC",17:"PQ",18:"HLG"};
const str=(dv,o,n)=>{ let s=""; for (let i=0;i<n;i++){ const c=dv.getUint8(o+i); if (!c) break; s+=String.fromCharCode(c); } return s.trim(); };
const okRate=v=>Number.isFinite(v)&&v>0.5&&v<1000;

function parseDPX(buf){
  const dv=new DataView(buf), m=dv.getUint32(0,false), le= m===0x58504453;   /* "XPDS" read big-endian = little-endian file */
  const U32=o=>dv.getUint32(o,le), U16=o=>dv.getUint16(o,le), U8=o=>dv.getUint8(o), F32=o=>dv.getFloat32(o,le);
  const orient=U16(768), nEl=U16(770), w=U32(772), h=U32(776);
  const desc=U8(800), xfer=U8(801), colo=U8(802), bits=U8(803), pack=U16(804), enc=U16(806);
  let off=U32(808); if (!off||off===0xffffffff) off=U32(4);
  let eol=U32(812); if (eol===0xffffffff) eol=0;
  if (enc!==0) throw new Error("RLE-compressed DPX isn't supported");
  const nc={50:3,51:4,52:4,6:1,1:1,2:1,3:1,4:1}[desc]; if (!nc) throw new Error(`DPX descriptor ${desc} (Y'CbCr / other) isn't supported`);
  if (!w||!h||w>65535||h>65535) throw new Error("bad DPX size");
  if (orient>3) throw new Error(`DPX orientation ${orient} (transposed) isn't supported`);
  const fpsF=F32(1724), fpsT=F32(1940);
  const info={format:"DPX", bits, pack, desc:DESC[desc]||String(desc), xfer, xferName:XFER[xfer]||String(xfer), colorimetric:colo, endian:le?"little":"big",
    fps: okRate(fpsF)?fpsF:okRate(fpsT)?fpsT:null, lowData:U32(784), highData:U32(792), creator:str(dv,160,100), orient};
  return {dv, le, w, h, nc, bits, pack, off, eol, info, order: desc===52?[3,2,1,0]:null, alphaIdx: desc===51?3:desc===52?0:-1};
}
function parseCIN(buf){
  const dv=new DataView(buf), le= dv.getUint32(0,false)===0xd75f2a80;
  const U32=o=>dv.getUint32(o,le), U8=o=>dv.getUint8(o), F32=o=>dv.getFloat32(o,le);
  const off=U32(4), orient=U8(192), nch=U8(193), bits=U8(198), w=U32(200), h=U32(204), pack=U8(681);
  if (nch!==1 && nch!==3) throw new Error(`Cineon with ${nch} channels isn't supported`);
  if (orient>3) throw new Error(`Cineon orientation ${orient} isn't supported`);
  const fps=F32(1072);
  const info={format:"Cineon", bits, pack, desc:nch===3?"RGB":"Y", xfer:1, xferName:"printing density", colorimetric:0, endian:le?"little":"big",
    fps: okRate(fps)?fps:null, lowData:95, highData:685, creator:"", orient};
  /* Cineon packing 5 = 3 × 10-bit per 32-bit word, left justified (same as DPX method A); 0 = packed bits */
  return {dv, le, w, h, nc:nch, bits, pack: bits===10 ? (pack===0?0:1) : pack===0?0:1, off, eol:0, info, order:null, alphaIdx:-1};
}

/* read components into out (Uint16 half, RGBA), row by row */
function decode(p){
  const {dv,le,w,h,nc,bits,pack,off,eol}=p, out=new Uint16Array(w*h*4), N=w*nc;
  const one=f2h(1);
  let rowBytes;
  if (bits===10 && pack!==0) rowBytes=Math.ceil(N/3)*4;
  else if (bits===12 && pack!==0) rowBytes=N*2;
  else if (bits===8) rowBytes=Math.ceil(N/4)*4;
  else if (bits===16) rowBytes=Math.ceil(N/2)*4;
  else if (bits===32) rowBytes=N*4;
  else if (bits===64) rowBytes=N*8;
  else rowBytes=Math.ceil(N*bits/32)*4;   /* packed 10 / 12 */
  let stride=rowBytes+eol;
  if (off+stride*(h-1)+rowBytes>dv.byteLength){   /* some writers don't pad lines */
    const tight=Math.ceil(N*bits/8); if (off+tight*h<=dv.byteLength) { rowBytes=tight; stride=tight; } else throw new Error("the file is shorter than its header says");
  }
  const L=bits<=16?lut(bits):null, row=new Uint16Array(N);
  for (let y=0;y<h;y++){
    const b=off+y*stride;
    if (bits===10 && pack!==0){ const sh= pack===2 ? [20,10,0] : [22,12,2];
      for (let i=0,k=0;i<N;k++){ const v=dv.getUint32(b+k*4,le); for (let j=0;j<3&&i<N;j++,i++) row[i]=L[(v>>>sh[j])&1023]; } }
    else if (bits===12 && pack!==0){ const s= pack===1?4:0; for (let i=0;i<N;i++) row[i]=L[(dv.getUint16(b+i*2,le)>>>s)&4095]; }
    else if (bits===8){ for (let i=0;i<N;i++) row[i]=L[dv.getUint8(b+i)]; }
    else if (bits===16){ for (let i=0;i<N;i++) row[i]=L[dv.getUint16(b+i*2,le)]; }
    else if (bits===32){ for (let i=0;i<N;i++) row[i]=f2h(dv.getFloat32(b+i*4,le)); }
    else if (bits===64){ for (let i=0;i<N;i++) row[i]=f2h(dv.getFloat64(b+i*8,le)); }
    else if (bits===10 || bits===12){   /* packed: a continuous bit stream in 32-bit words, MSB first */
      let bit=0; for (let i=0;i<N;i++){ let v=0; for (let k=0;k<bits;k++,bit++){ const word=dv.getUint32(b+((bit>>>5)<<2),le); v=(v<<1)|((word>>>(31-(bit&31)))&1); } row[i]=L[v]; } }
    else throw new Error(`${bits}-bit samples aren't supported`);
    /* to RGBA, honouring orientation (0 normal, 1 mirrored, 2 upside down, 3 both) */
    const yy= (p.info.orient&2) ? h-1-y : y, flip=p.info.orient&1;
    for (let x=0;x<w;x++){
      const o=(yy*w+(flip?w-1-x:x))*4, s=x*nc;
      if (nc===1){ out[o]=out[o+1]=out[o+2]=row[s]; out[o+3]=one; }
      else if (p.order){ out[o]=row[s+3]; out[o+1]=row[s+2]; out[o+2]=row[s+1]; out[o+3]=row[s]; }   /* ABGR */
      else { out[o]=row[s]; out[o+1]=row[s+1]; out[o+2]=row[s+2]; out[o+3]= nc===4?row[s+3]:one; }
    }
  }
  return out;
}
function downsize(d,w,h,maxTex){   /* 2×2 box until the GPU can hold it */
  let scale=1; const H2F=(()=>{ const t=new Float32Array(65536); for (let i=0;i<65536;i++){ const s=i&0x8000?-1:1, e=(i>>10)&31, m=i&1023; t[i]= e===0?s*m*Math.pow(2,-24): e===31?0 : s*Math.pow(2,e-15)*(1+m/1024); } return t; });
  let T=null;
  while (Math.max(w,h)>maxTex){ T=T||H2F(); const W=w>>1, H=h>>1, o=new Uint16Array(W*H*4);
    for (let y=0;y<H;y++) for (let x=0;x<W;x++) for (let c=0;c<4;c++){ const a=((2*y)*w+2*x)*4+c, b=a+w*4; o[(y*W+x)*4+c]=f2h((T[d[a]]+T[d[a+4]]+T[d[b]]+T[d[b+4]])/4); }
    d=o; w=W; h=H; scale*=2; }
  return {d,w,h,scale};
}
self.onmessage=ev=>{
  const {buf,maxTex}=ev.data;
  try{
    const m=new DataView(buf).getUint32(0,false);
    const p= (m===0x53445058||m===0x58504453) ? parseDPX(buf) : (m===0x802a5fd7||m===0xd75f2a80) ? parseCIN(buf) : null;
    if (!p) throw new Error("not a DPX or Cineon file");
    const r=downsize(decode(p),p.w,p.h,maxTex||16384);
    p.info.scale=r.scale; p.info.srcW=p.w; p.info.srcH=p.h; p.info.alpha=p.alphaIdx>=0;
    self.postMessage({w:r.w,h:r.h,data:r.d,info:p.info},[r.d.buffer]);
  }catch(e){ self.postMessage({error:String(e&&e.message||e)}); }
};
