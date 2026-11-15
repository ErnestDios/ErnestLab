/* Ernest Lab · js/07-dpx.js · DPX and Cineon stills (decoder in ./dpx/).
   Classic script (not a module): files load in order from index.html and share one global scope. */
"use strict";
/* ---------------- DPX / Cineon (v1.3) ----------------
   Film scans and VFX plates. dpx/worker.js reads the file into RGBA half floats holding the code values (0..1), and
   the transfer is applied on the GPU like a video's (uInXfer): Cineon printing density for log scans (Kodak's
   conversion: black 95, white 685, 0.002 density per code, film gamma 0.6, the same as Nuke's Cineon), linear, or
   video (read as sRGB, like a JPEG). The header says which (transfer characteristic); Development → Input colour
   overrides it, with the log curves of digital cameras too (DPX from ARRI / Sony / Apple footage). */
const DPX_EXT=/\.(dpx|cin)$/i;
const SCS={   /* scan input colour: transfer (uInXfer) + chromaticities. Scans and DPX plates are taken as Rec.709 primaries, like Nuke. */
  cineon: {name:"Cineon log (printing density)", hint:"Film scans and log DPX: code 95 = black, 685 = white, 470 ≈ 18 % grey", xfer:8, c:null},
  lin:    {name:"Linear Rec.709", hint:"Linear DPX (CG renders, linear plates)", xfer:1, c:null},
  v709:   {name:"Rec.709 / sRGB video", hint:"Display-referred DPX (video, graded plates)", xfer:0, c:null},
  ...Object.fromEntries(Object.entries(VCS_LOGS()).map(([k,v])=>[k,v])),
};
function VCS_LOGS(){ return { /* the camera curves of video input colour, for DPX made from camera footage (defined again in js/12-vdec.js for video) */
  hlg:{name:"HLG (Rec.2020)", hint:"HDR DPX, HLG", xfer:2, c:"rec2020"}, pq:{name:"PQ / HDR10 (Rec.2020)", hint:"HDR DPX, PQ", xfer:3, c:"rec2020"},
  applelog:{name:"Apple Log (Rec.2020)", hint:"Apple Log footage", xfer:4, c:"rec2020"},
  slog3:{name:"Sony S-Log3 / S-Gamut3.Cine", hint:"Sony footage", xfer:5, c:[0.766,0.275,0.225,0.800,0.089,-0.087,0.3127,0.3290]},
  logc3:{name:"ARRI LogC3 / AWG3 (EI 800)", hint:"ALEXA classic, Mini, Mini LF, Amira", xfer:6, c:[0.684,0.313,0.221,0.848,0.0861,-0.102,0.3127,0.3290]},
  logc4:{name:"ARRI LogC4 / AWG4", hint:"ALEXA 35", xfer:7, c:[0.7347,0.2653,0.1424,0.8576,0.0991,-0.0308,0.3127,0.3290]} }; }
/* how the header's transfer characteristic is read */
function scanAuto(info){ const x=info&&info.xfer;
  if (x===1||x===3) return "cineon"; if (x===2) return "lin"; if (x===17) return "pq"; if (x===18) return "hlg"; return "v709"; }
function scanSpace(it,d){
  const inf=it.info||{}, pick=d&&d.inCS&&SCS[d.inCS]?d.inCS:null, key=pick||scanAuto(inf), v=SCS[key];
  const c=v.c==="rec2020"?EXR_CS.rec2020.c:v.c;
  const from=pick?"chosen":`file (${inf.format||"DPX"} header: ${inf.xferName||"no transfer"})`;
  return {key, name:v.name, xfer:v.xfer, from, mat:c?csToRec709(c):IDENT3};
}
/* one place that says how any source is read: transfer + matrix (stills, scans, video, sequences) */
function srcSpaceOf(it,d){
  if (!it) return {xfer:0,mat:IDENT3};
  d=d||it.dev||DEV0;
  const kind=it.seq?it.kind:it.exr?"exr":it.dpx?"dpx":it.video?"video":it.raw?"raw":"img";
  if (kind==="exr"){ const s=exrSpace(it,d); return Object.assign({xfer:1},s); }
  if (kind==="dpx") return scanSpace(it,d);
  if (kind==="video" || (it.seq && kind==="img")) return vidSpace(it,d);
  return {xfer:kind==="raw"?1:0, mat:IDENT3};
}
/* the same transfers on the CPU (thumbnails and histograms; the GPU version is xferToLin in js/05-gl.js) */
function codeToLin(c,x){
  switch(x){
    case 1: return c;
    case 2: return (c<=0.5?c*c/3:(Math.exp((c-0.55991073)/0.17883277)+0.28466892)/12)/0.26496;
    case 3: { const p=Math.pow(Math.max(c,0),1/78.84375); return 10000/203*Math.pow(Math.max(p-0.8359375,0)/(18.8515625-18.6875*p),1/0.1593017578125); }
    case 4: { const R0=-0.05641088,Rt=0.01,sg=47.28711236,be=0.00964052,ga=0.08550479,de=0.69336945,Pt=sg*(Rt-R0)*(Rt-R0); return c>=Pt?Math.pow(2,(c-de)/ga)-be:c>=0?Math.sqrt(c/sg)+R0:R0; }
    case 5: { const y=(64+876*c)/1023; return y>=171.2102946929/1023?Math.pow(10,(y*1023-420)/261.5)*0.19-0.01:(y*1023-95)*0.01125/(171.2102946929-95); }
    case 6: return c>5.367655*0.010591+0.092809?(Math.pow(10,(c-0.385537)/0.247190)-0.052272)/5.555556:(c-0.092809)/5.367655;
    case 7: { const a=(262144-16)/117.45,b=(1023-95)/1023,cc=95/1023; return c>=0?(Math.pow(2,14*(c-cc)/b+6)-64)/a:c*(7*Math.LN2*Math.pow(2,7-14*cc/b))/(a*b)+(Math.pow(2,14*(-cc/b)+6)-64)/a; }
    case 8: { const bo=Math.pow(10,(95-685)*0.002/0.6); return (Math.pow(10,(c*1023-685)*0.002/0.6)-bo)/(1-bo); }
    default: return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4);
  }
}
/* thumbnail + histogram from decoded half data, through the source's input colour and (scene-referred) the soft-shoulder profile */
async function codePrepare(it,r){
  const {w:W,h:H,data:d}=r, sp=srcSpaceOf(it), M=sp.mat, x=sp.xfer, prof= x===0?null:mcurve(EXR_SCENE);
  const lin=k=>mv3(M,[codeToLin(h2f[d[k]],x),codeToLin(h2f[d[k+1]],x),codeToLin(h2f[d[k+2]],x)]);
  const n=Math.min(60000,W*H), step=Math.max(1,Math.floor(W*H/n)), lum=new Float32Array(n);
  for (let i=0;i<n;i++){ const c=lin(i*step*4); lum[i]=Math.max(0,0.2126*c[0]+0.7152*c[1]+0.0722*c[2]); }
  it.hist=histFromLum(i=>lum[i],n);
  const sc=Math.min(1,480/Math.max(W,H)), tw=Math.max(1,Math.round(W*sc)), th=Math.max(1,Math.round(H*sc));
  const cv=document.createElement("canvas"); cv.width=tw; cv.height=th; const cx=cv.getContext("2d"), im=cx.createImageData(tw,th);
  const enc=v=>{ v=Math.min(1,Math.max(0,v)); return 255*(v<=0.0031308?v*12.92:1.055*Math.pow(v,1/2.4)-0.055); };
  for (let y=0;y<th;y++) for (let xx=0;xx<tw;xx++){ const s=(Math.floor(y/sc)*W+Math.floor(xx/sc))*4, o=(y*tw+xx)*4;
    const c=lin(s), L=Math.max(1e-6,0.2126*c[0]+0.7152*c[1]+0.0722*c[2]), g=prof?0.18*Math.pow(2,prof(Math.log2(L/0.18)))/L:1;
    im.data[o]=enc(c[0]*g); im.data[o+1]=enc(c[1]*g); im.data[o+2]=enc(c[2]*g); im.data[o+3]=255; }
  cx.putImageData(im,0,0); if (it.url) URL.revokeObjectURL(it.url);
  it.url=URL.createObjectURL(await new Promise(res=>cv.toBlob(res,"image/jpeg",0.85)));
}

/* workers: a small pool per decoder, reused across files (sequences decode hundreds) */
const POOLS={};
function poolRun(kind,msg,transfer){
  const P=POOLS[kind]||(POOLS[kind]={idle:[],all:0,max:Math.min(3,Math.max(1,(navigator.hardwareConcurrency||4)-2)),wait:[]});
  return new Promise((res,rej)=>{
    const go=w=>{ w.onmessage=e=>{ done(w); e.data.error?rej(new Error(e.data.error)):res(e.data); }; w.onerror=e=>{ w.terminate(); P.all--; next(); rej(new Error(e.message||`${kind} worker failed`)); }; w.postMessage(msg,transfer); };
    const done=w=>{ P.idle.push(w); next(); };
    const next=()=>{ if (P.wait.length && P.idle.length){ const j=P.wait.shift(); j(P.idle.pop()); } };
    if (P.idle.length) go(P.idle.pop());
    else if (P.all<P.max){ P.all++; go(new Worker(new URL(kind==="exr"?"exr/worker.js":"dpx/worker.js",document.baseURI).href,{type:"module"})); }
    else P.wait.push(go);
  });
}
const dpxRun=buf=>poolRun("dpx",{buf,maxTex:MAXTEX},[buf]);
let dpxCache=null;   /* the last decoded still */
async function dpxDecodeRaw(it){ if (dpxCache && dpxCache.it===it) return dpxCache.r; const r=await dpxRun(await it.file.arrayBuffer()); dpxCache={it,r}; return r; }
async function dpxProbe(f){
  const it={name:f.name.replace(/\.[^.]+$/,""), dpx:true, file:f, url:null};
  const r=await dpxDecodeRaw(it); it.w=r.w; it.h=r.h; it.info=r.info; await codePrepare(it,r); return it;
}
async function dpxDecode(it){ const r=await dpxDecodeRaw(it); it.info=r.info;
  if (r.info.scale>1) toast(`${it.name} was decoded at 1/${r.info.scale} size (${r.w}×${r.h}), the largest this GPU handles.`);
  return {W:r.w,H:r.h,data:r.data}; }
const dpxMeta=it=>{ const i=it.info||{}; return `${i.format||"DPX"} · ${i.bits}-bit${i.bits===32?" float":""}${i.alpha?" + alpha":""} · ${scanSpace(it,curDev()).name}`; };
