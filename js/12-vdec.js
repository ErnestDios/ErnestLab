/* Ernest Lab · js/12-vdec.js · ProRes, 10-bit and HDR video (decoded here, through Mediabunny in ./video/).
   Classic script (not a module): files load in order from index.html and share one global scope. */
"use strict";
/* ---------------- Decoded video (v1.2) ----------------
   Two ways a clip reaches the pipeline:
   · native: the browser's own <video> player (hardware decode, 8-bit RGB). Everything the browser plays in plain
     8-bit SDR keeps using it, unchanged since v0.8.
   · decoded: Mediabunny reads the file and decodes each frame (WebCodecs, or the TurboRes WASM decoder for ProRes);
     the Y'CbCr planes are uploaded as integer textures (8, 10 or 12 bits kept as they are) and converted here to
     R'G'B' half floats: range (video/full), matrix (BT.601 / 709 / 2020), chroma siting, rotation, alpha. Used for
     ProRes (no browser decodes it), for 10-bit and HDR clips (the native player would hand over 8-bit, tone-mapped
     frames), and for clips the native player refuses but WebCodecs can decode.
   The transfer function (HLG, PQ, Apple Log, S-Log3, LogC) and the primaries are applied later, in the scene pass's
   input transform (uInXfer 2..7 + uInMat), so a native 8-bit log clip gets the same curves. */
const VCS={   /* video input colour: transfer (uInXfer) + chromaticities (→ uInMat). Scene-referred ones get the soft-shoulder profile. */
  v709:    {name:"Rec.709 / sRGB video", hint:"Normal video: phones with HDR off, screen recordings, most H.264, CG renders to ProRes", xfer:0, c:null},
  hlg:     {name:"HLG (Rec.2020)", hint:"iPhone / Android HDR video, HLG broadcasts. Reference white (75 %) = 1.0", xfer:2, c:"rec2020"},
  pq:      {name:"PQ / HDR10 (Rec.2020)", hint:"HDR10 and Dolby Vision base layers. 203 nits (reference white) = 1.0", xfer:3, c:"rec2020"},
  applelog:{name:"Apple Log (Rec.2020)", hint:"iPhone 15 Pro and later, ProRes Log", xfer:4, c:"rec2020"},
  slog3:   {name:"Sony S-Log3 / S-Gamut3.Cine", hint:"Sony cameras (FX, Venice, Alpha), S-Log3 with S-Gamut3.Cine", xfer:5, c:[0.766,0.275,0.225,0.800,0.089,-0.087,0.3127,0.3290]},
  logc3:   {name:"ARRI LogC3 / AWG3 (EI 800)", hint:"ALEXA classic, Mini, Mini LF, Amira (LogC3, Wide Gamut 3)", xfer:6, c:[0.684,0.313,0.221,0.848,0.0861,-0.102,0.3127,0.3290]},
  logc4:   {name:"ARRI LogC4 / AWG4", hint:"ALEXA 35 and later (LogC4, Wide Gamut 4)", xfer:7, c:[0.7347,0.2653,0.1424,0.8576,0.0991,-0.0308,0.3127,0.3290]},
};
/* which input colour a clip is read as: the user's choice, else the file's own tags (HLG / PQ), else Rec.709 video */
function vidSpace(it,d){
  const pick=d&&d.inCS&&VCS[d.inCS]?d.inCS:null, tr=it&&it.vmeta&&it.vmeta.cs&&it.vmeta.cs.transfer;
  /* HDR tags only count when the planes reach us: the browser's own frames (native player, or opaque GPU frames)
     are already converted to SDR by the browser */
  const raw=!!(it&&it.dec&&it.path!=="rgb"), hdr=tr==="hlg"||tr==="pq";
  const key=pick||(raw&&tr==="hlg"?"hlg":raw&&tr==="pq"?"pq":"v709"), v=VCS[key];
  const c=v.c==="rec2020"?EXR_CS.rec2020.c:v.c;
  const from=pick?"chosen":key!=="v709"?"file (colour tags)":hdr?"the browser already converted this HDR clip to SDR":"assumed (no HDR or log tags)";
  return {key, name:v.name, xfer:v.xfer, from, mat:c?csToRec709(c):IDENT3};
}
const vidSceneRef=(it,d)=>!!(it&&it.video&&vidSpace(it,d).xfer>=2);

/* container metadata, without decoding: codec, bit depth, colour tags. Loads Mediabunny (~0.5 MB, cached offline). */
let proresMod=null;
const vidLib=()=>(vidMod=vidMod||import(new URL("video/mediabunny.js",document.baseURI).href));
async function vidLibFor(codec){ const mb=await vidLib();
  if (codec==="prores"){ if (!proresMod) proresMod=import(new URL("video/prores.js",document.baseURI).href); (await proresMod).registerProresDecoder(); }
  return mb; }
const VID_FORMATS=mb=>[mb.MP4,mb.QTFF,mb.WEBM,mb.MATROSKA];
const PRORES_NAMES={apco:"ProRes 422 Proxy",apcs:"ProRes 422 LT",apcn:"ProRes 422",apch:"ProRes 422 HQ",ap4h:"ProRes 4444",ap4x:"ProRes 4444 XQ"};
function vidBits(cps){   /* bit depth from the codec string (RFC 6381) */
  if (/^(hev1|hvc1)\.2\./i.test(cps)) return 10;                                   /* HEVC Main 10 */
  let m=cps.match(/^vp09\.\d\d\.\d\d\.(\d\d)/i); if (m) return +m[1];
  m=cps.match(/^av01\.\d\.\d\d[MH]\.(\d\d)/i); if (m) return +m[1];
  if (/^avc1\.(6e|7a|f4)/i.test(cps)) return 10;                                   /* H.264 High 10 / 4:2:2 / 4:4:4 */
  if (/^ap4/i.test(cps)) return 12;                                                /* ProRes 4444: 12-bit */
  if (/^apc/i.test(cps)) return 10;
  return 8; }
async function vidMeta(f){
  const mb=await vidLib();
  const input=new mb.Input({source:new mb.BlobSource(f), formats:VID_FORMATS(mb)});
  const t=await input.getPrimaryVideoTrack(); if (!t){ input.dispose&&input.dispose(); return null; }
  const cps=(await t.getCodecParameterString().catch(()=>null))||"", cs=await t.getColorSpace().catch(()=>({}));
  const m={codec:t.codec, cps, cs:cs||{}, bits:vidBits(cps), w:t.displayWidth, h:t.displayHeight};
  m.hdr = m.cs.transfer==="hlg" || m.cs.transfer==="pq";
  m.name = t.codec==="prores" ? (PRORES_NAMES[cps.slice(0,4).toLowerCase()]||"ProRes") : ({avc:"H.264",hevc:"HEVC",vp9:"VP9",av1:"AV1",vp8:"VP8"}[t.codec]||String(t.codec||"video").toUpperCase());
  input.dispose&&input.dispose();
  return m;
}
/* does this clip need the decoded path? ProRes always; 10-bit or HDR to keep them intact */
const vidNeedsDec=m=>!!m && (m.codec==="prores" || m.bits>8 || m.hdr);

/* ---- the decoded player: looks enough like a <video> element for js/12-video.js ---- */
class DecPlayer {
  constructor(it,input,track,sink,dur){ Object.assign(this,{it,input,track,sink,duration:dur}); this.paused=true; this.muted=true; this.seeking=false;
    this.readyState=0; this.cur=null; this.t=0; this.gen=0; this.loop=true; this.listeners={}; }
  get currentTime(){ return this.t; }
  set currentTime(v){ this.seekTo(v); }
  addEventListener(n,f){ (this.listeners[n]=this.listeners[n]||[]).push(f); }
  emit(n){ for (const f of this.listeners[n]||[]) f(); }
  setFrame(s){ if (this.cur) this.cur.close(); this.cur=s; this.readyState=4; this.t=s.timestamp; }
  async seekTo(v){
    const g=++this.gen; this.paused=true; this.seeking=true; v=Math.max(0,Math.min(v,this.duration||0));
    try{ const s=await this.sink.getSample(v); if (g!==this.gen){ s&&s.close(); return; } if (s) this.setFrame(s); else this.t=v; }
    catch(e){ console.error(e); }
    finally{ if (g===this.gen){ this.seeking=false; this.emit("seeked"); } }
  }
  /* play from the current time on the wall clock. Each frame is uploaded before the next is taken, so a slow
     machine plays slower rather than queueing; frames already late are skipped (they're decoded, not shown). */
  play(){ if (!this.paused) return Promise.resolve(); this.paused=false; this.run(++this.gen); return Promise.resolve(); }
  async run(g){
    let from=this.t>=(this.duration||0)-0.05?0:this.t, t0=performance.now()-from*1000; let shown=0;
    try{
      for (;;){
        let any=false;
        for await (const s of this.sink.samples(from)){
          if (g!==this.gen){ s.close(); return; }
          any=true; const now=performance.now(), late=now-(t0+s.timestamp*1000);
          if (late>400) t0=now-s.timestamp*1000;   /* far behind: re-anchor the clock (plays slower, never freezes) */
          else if (late>Math.max(s.duration,1/60)*1500 && now-shown<120){ s.close(); this.t=s.timestamp; continue; }   /* a bit late: skip, but show one at least every 120 ms */
          const due=t0+s.timestamp*1000;
          if (due>now) await new Promise(r=>setTimeout(r,due-now));
          if (g!==this.gen){ s.close(); return; }
          this.setFrame(s); this.it.frameNo=Math.round(s.timestamp*24); await vidDecFrame(this.it); shown=performance.now();
        }
        if (!this.loop || !any || g!==this.gen) break;
        from=0; t0=performance.now();   /* loop, like the native preview */
      }
    }catch(e){ if (g===this.gen){ console.error(e); toast(String(e.message||e).slice(0,120)); } }
    finally{ if (g===this.gen){ this.paused=true; vidUI(); } }
  }
  pause(){ if (this.paused) return; this.paused=true; this.gen++; }
  close(){ this.gen++; this.paused=true; if (this.cur){ this.cur.close(); this.cur=null; } try{ this.input.dispose&&this.input.dispose(); }catch(e){} }
  removeAttribute(){} load(){}
}
async function decProbe(f,meta){
  const mb=await vidLibFor(meta.codec);
  const input=new mb.Input({source:new mb.BlobSource(f), formats:VID_FORMATS(mb)});
  const track=await input.getPrimaryVideoTrack();
  if (!(await track.canDecode())){ input.dispose&&input.dispose();
    throw new Error(meta.codec==="hevc" ? `This browser can't decode ${f.name} (HEVC). Try Chrome or Edge with hardware decoding, or Safari.` : `This browser can't decode ${f.name} (${meta.name}).`); }
  const dur=await input.computeDuration(), sink=new mb.VideoSampleSink(track);
  const first=await sink.getSample(Math.min(1,dur*0.1));
  if (!first){ input.dispose&&input.dispose(); throw new Error(`${f.name} has no frames I can read.`); }
  /* thumbnail: the browser draws the frame (its own colour handling; log clips look flat, as in any player) */
  const W=first.displayWidth, H=first.displayHeight, sc=Math.min(1,480/Math.max(W,H)), c=document.createElement("canvas");
  c.width=Math.round(W*sc); c.height=Math.round(H*sc); try{ first.draw(c.getContext("2d"),0,0,c.width,c.height); }catch(e){}
  const url=URL.createObjectURL(await new Promise(r=>c.toBlob(r,"image/jpeg",0.85)));
  meta.fmt=first.format; meta.alpha=!!first.hasAlpha;
  const it={name:f.name.replace(/\.[^.]+$/,""), video:true, dec:true, file:f, url, w:W, h:H, duration:dur, vmeta:meta, path:VF_FMT[first.format||""]?"yuv":"rgb"};
  it.el=new DecPlayer(it,input,track,sink,dur); it.el.setFrame(first);
  it.el.addEventListener("seeked",()=>vidSeeked(it));
  return it;
}

/* ---- Y'CbCr planes → R'G'B' half floats ---- */
const FS_YUV=`#version 300 es
precision highp float; precision highp int; precision highp usampler2D;
out vec4 o;
uniform usampler2D uY,uU,uV,uA; uniform int uHasA, uNV, uRot, uFlip, uFull, uPremul; uniform ivec2 uSub, uSize, uVis;   /* uSize: coded, uVis: visible origin */
uniform float uScale, uShift; uniform vec3 uK;   /* uScale = 2^(bits-8); uShift: P010-style data in the high bits; uK: Kr, Kb, Kg */
float fY(ivec2 p){ return float(texelFetch(uY,p,0).r>>uint(uShift)); }
vec2 fC(ivec2 p){ p=clamp(p,ivec2(0),(uSize+uSub-1)/uSub-1);
  if (uNV==1){ uvec2 c=texelFetch(uU,p,0).rg>>uint(uShift); return vec2(c); }
  return vec2(float(texelFetch(uU,p,0).r>>uint(uShift)), float(texelFetch(uV,p,0).r>>uint(uShift))); }
void main(){
  ivec2 q=ivec2(gl_FragCoord.xy), V=uVis;   /* q: display pixel, row 0 = top (the source texture is stored top-first) */
  ivec2 dim = (uRot==90||uRot==270) ? ivec2(uSize.y,uSize.x) : uSize;
  if (uFlip==1) q.x=dim.x-1-q.x;
  ivec2 p = uRot==90 ? ivec2(q.y, uSize.y-1-q.x) : uRot==180 ? ivec2(uSize.x-1-q.x, uSize.y-1-q.y) : uRot==270 ? ivec2(uSize.x-1-q.y, q.x) : q;
  p+=V;
  float y=fY(p);
  /* chroma: bilinear between the nearest samples; horizontally co-sited (left), vertically centred for 4:2:0 */
  vec2 cp=vec2(float(p.x)/float(uSub.x), uSub.y==2 ? (float(p.y)+0.5)/2.0-0.5 : float(p.y));
  ivec2 c0=ivec2(floor(cp)); vec2 f=cp-vec2(c0);
  vec2 c = uSub==ivec2(1) ? fC(p) : uSub.y==1 ? mix(fC(c0),fC(c0+ivec2(1,0)),f.x)
         : mix(mix(fC(c0),fC(c0+ivec2(1,0)),f.x), mix(fC(c0+ivec2(0,1)),fC(c0+ivec2(1,1)),f.x), f.y);
  float Y, Cb, Cr;
  if (uFull==1){ float m=uScale*256.0-1.0; Y=y/m; Cb=(c.x-uScale*128.0)/m; Cr=(c.y-uScale*128.0)/m; }
  else { Y=(y/uScale-16.0)/219.0; Cb=(c.x/uScale-128.0)/224.0; Cr=(c.y/uScale-128.0)/224.0; }
  float R=Y+2.0*(1.0-uK.x)*Cr, B=Y+2.0*(1.0-uK.y)*Cb, G=(Y-uK.x*R-uK.y*B)/uK.z;
  vec3 rgb=vec3(R,G,B); float a=1.0;
  if (uHasA==1){ a=clamp(float(texelFetch(uA,p,0).r)/(uScale*256.0-1.0),0.0,1.0); if (uPremul==1) rgb*=a; }   /* straight alpha → over black */
  o=vec4(rgb,a);
}`;
let yuvProg=null; const yuvTex={}; let yuvFB=null, rgbTmp=null;
const VF_FMT={   /* VideoFrame pixel formats → planes, chroma subsampling, bits */
  I420:{s:[2,2],b:8}, I420A:{s:[2,2],b:8,a:1}, I422:{s:[2,1],b:8}, I422A:{s:[2,1],b:8,a:1}, I444:{s:[1,1],b:8}, I444A:{s:[1,1],b:8,a:1},
  I420P10:{s:[2,2],b:10}, I420AP10:{s:[2,2],b:10,a:1}, I422P10:{s:[2,1],b:10}, I422AP10:{s:[2,1],b:10,a:1}, I444P10:{s:[1,1],b:10}, I444AP10:{s:[1,1],b:10,a:1},
  I420P12:{s:[2,2],b:12}, I420AP12:{s:[2,2],b:12,a:1}, I422P12:{s:[2,1],b:12}, I422AP12:{s:[2,1],b:12,a:1}, I444P12:{s:[1,1],b:12}, I444AP12:{s:[1,1],b:12,a:1},
  NV12:{s:[2,2],b:8,nv:1}, P010:{s:[2,2],b:10,nv:1,shift:6} };
const KRB={bt709:[0.2126,0.0722], bt470bg:[0.299,0.114], smpte170m:[0.299,0.114], "bt2020-ncl":[0.2627,0.0593], fcc:[0.30,0.11], smpte240m:[0.212,0.087]};
function planeTex(name,w,h,b16,two){ const k=name; let t=yuvTex[k];
  if (!t || t.w!==w || t.h!==h || t.b16!==b16 || t.two!==two){ if (t) gl.deleteTexture(t.tex);
    const tex=gl.createTexture(); bindTex(15,tex);
    gl.texStorage2D(gl.TEXTURE_2D,1, two?(b16?gl.RG16UI:gl.RG8UI):(b16?gl.R16UI:gl.R8UI), w,h);
    for (const [p,v] of [[gl.TEXTURE_MIN_FILTER,gl.NEAREST],[gl.TEXTURE_MAG_FILTER,gl.NEAREST],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D,p,v);
    t=yuvTex[k]={tex,w,h,b16,two}; }
  return t; }
let yuvBuf=null;
/* upload one decoded sample into srcTex (RGBA16F, display orientation). Returns "yuv" (bits kept) or "rgb" (browser-converted, 8-bit). */
async function decUpload(s0,it){
  const s=s0.clone();   /* a seek or the next frame may close the original while this upload runs */
  try{ return await decUploadOne(s,it); } finally{ s.close(); } }
async function decUploadOne(s,it){
  const f=VF_FMT[s.format||""], rot=s.rotation||0, flip=!!s.flip, vr=s.visibleRect||{left:0,top:0,width:s.codedWidth,height:s.codedHeight};
  const vw=vr.width, vh=vr.height, DW=(rot===90||rot===270)?vh:vw, DH=(rot===90||rot===270)?vw:vh;
  decEnsureSrc(DW,DH);
  if (f){
    try{
      const rect={x:vr.left,y:vr.top,width:vw,height:vh};
      const n=s.allocationSize({rect}); if (!yuvBuf||yuvBuf.byteLength<n) yuvBuf=new ArrayBuffer(Math.ceil(n*1.25));
      const lay=await s.copyTo(new Uint8Array(yuvBuf,0,n),{rect});
      const b16=f.b>8, bpp=b16?2:1, cw=Math.ceil(vw/f.s[0]), ch=Math.ceil(vh/f.s[1]);
      const up=(name,i,w,h,two)=>{ const t=planeTex(name,w,h,b16,two), L=lay[i], comps=two?2:1;
        bindTex(15,t.tex); gl.pixelStorei(gl.UNPACK_ALIGNMENT,1); gl.pixelStorei(gl.UNPACK_ROW_LENGTH,L.stride/(bpp*comps));
        const arr=b16?new Uint16Array(yuvBuf,L.offset,(L.stride/2)*(h-1)+w*comps):new Uint8Array(yuvBuf,L.offset,L.stride*(h-1)+w*comps);
        gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,w,h,two?gl.RG_INTEGER:gl.RED_INTEGER,b16?gl.UNSIGNED_SHORT:gl.UNSIGNED_BYTE,arr);
        gl.pixelStorei(gl.UNPACK_ROW_LENGTH,0); return t; };
      const tY=up("y",0,vw,vh,false);
      const tU=f.nv?up("uv",1,cw,ch,true):up("u",1,cw,ch,false), tV=f.nv?tU:up("v",2,cw,ch,false), tA=f.a?up("a",3,vw,vh,false):tY;
      if (!yuvProg) yuvProg=compileFS(FS_YUV);
      const cs=s.colorSpace||{}, k=KRB[cs.matrix]||(cs.matrix==null&&vh>=720?KRB.bt709:cs.matrix==null?KRB.smpte170m:KRB.bt709);
      gl.bindFramebuffer(gl.FRAMEBUFFER,yuvFB); gl.viewport(0,0,DW,DH); gl.useProgram(yuvProg.p); const u=yuvProg.u;
      bindTex(11,tY.tex); bindTex(12,tU.tex); bindTex(13,tV.tex); bindTex(14,tA.tex);
      gl.uniform1i(u.uY,11); gl.uniform1i(u.uU,12); gl.uniform1i(u.uV,13); gl.uniform1i(u.uA,14);
      gl.uniform1i(u.uHasA,f.a?1:0); gl.uniform1i(u.uNV,f.nv?1:0); gl.uniform1i(u.uRot,rot); gl.uniform1i(u.uFlip,flip?1:0); gl.uniform1i(u.uFull,cs.fullRange?1:0);
      gl.uniform1i(u.uPremul, vidSpace(it,it.dev||DEV0).xfer===0?1:0);
      gl.uniform2i(u.uSub,f.s[0],f.s[1]); gl.uniform2i(u.uSize,vw,vh); gl.uniform2i(u.uVis,0,0);
      gl.uniform1f(u.uScale,Math.pow(2,f.b-8)); gl.uniform1f(u.uShift,f.shift||0); gl.uniform3f(u.uK,k[0],k[1],1-k[0]-k[1]);
      gl.drawArrays(gl.TRIANGLES,0,3); srcMip=false;
      return "yuv";
    }catch(e){ console.warn("YUV upload failed, using the browser's RGB:",e); }
  }
  /* opaque (GPU) frames or unknown formats: the browser converts to 8-bit RGB */
  const vf=s.toVideoFrame(); const ow=vf.displayWidth, oh=vf.displayHeight;
  if (!rgbTmp || rgbTmp.w!==ow || rgbTmp.h!==oh){ if (rgbTmp) gl.deleteTexture(rgbTmp.tex); rgbTmp={tex:mkTex(ow,oh,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE),w:ow,h:oh}; }
  bindTex(15,rgbTmp.tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false); gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,vf); vf.close();
  decEnsureSrc(ow,oh); pass(P.copy,{tex:rgbTmp.tex},{fb:yuvFB,w:ow,h:oh}); srcMip=false;
  return "rgb";
}
function compileFS(src){ const p=gl.createProgram();
  for (const [t,c] of [[gl.VERTEX_SHADER,VS],[gl.FRAGMENT_SHADER,src]]){ const sh=gl.createShader(t); gl.shaderSource(sh,c); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); gl.attachShader(p,sh); }
  gl.linkProgram(p); if (!gl.getProgramParameter(p,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u={}, n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS); for (let i=0;i<n;i++){ const inf=gl.getActiveUniform(p,i); u[inf.name]=gl.getUniformLocation(p,inf.name); }
  return {p,u}; }
/* the decoded clip's source texture: half float, display size; drawn into through yuvFB */
function decEnsureSrc(w,h){
  if (srcTex && srcTex._dec && srcW===w && srcH===h) return;
  if (srcTex) gl.deleteTexture(srcTex);
  srcTex=mkTex(w,h,hasFloat?gl.RGBA16F:gl.RGBA8,gl.RGBA,hasFloat?gl.HALF_FLOAT:gl.UNSIGNED_BYTE); srcTex._dec=true;
  if (!yuvFB) yuvFB=gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER,yuvFB); gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,srcTex,0);
  srcW=w; srcH=h; srcMip=false;
}
/* make a decoded clip the source (from ensureSource) */
async function decSource(it){
  srcItem=null; if (srcTex && !srcTex._dec){ gl.deleteTexture(srcTex); srcTex=null; }
  const s=it.el.cur; if (!s) return false;
  it.path=await decUpload(s,it); srcItem=it; return true;
}
/* a frame arrived while playing, or a seek landed */
async function vidDecFrame(it){
  if (it!==vidCur || srcItem!==it || !it.el.cur) return;
  it.path=await decUpload(it.el.cur,it); grainFrame=it.frameNo||0; render(); vidUI();
}
