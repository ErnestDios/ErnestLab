/* Ernest Lab · js/05-gl.js · WebGL: shaders, render targets, the render pipeline, viewer and zoom, scheduling.
   Classic script (not a module): files load in order from index.html and share one global scope. */
"use strict";
/* ---------------- WebGL ---------------- */
const canvas=$("gl");
const gl=canvas.getContext("webgl2",{preserveDrawingBuffer:true,antialias:false,premultipliedAlpha:false,alpha:false});
if (!gl){ document.body.innerHTML='<p style="padding:24px">This browser has no WebGL2, which Ernest Lab needs. Try a recent Chrome, Edge, Firefox or Safari.</p>'; throw new Error("no webgl2"); }
const hasFloat = !!gl.getExtension("EXT_color_buffer_float");
const MAXTEX = gl.getParameter(gl.MAX_TEXTURE_SIZE);
const IFMT = hasFloat ? gl.RGBA16F : gl.RGBA8;
const ITYPE = hasFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

const VS=`#version 300 es
out vec2 vUv;
void main(){ vec2 p=vec2(float((gl_VertexID<<1)&2), float(gl_VertexID&2)); vUv=p; gl_Position=vec4(p*2.0-1.0,0.0,1.0); }`;

const HEAD=`#version 300 es
precision highp float; precision highp int; precision highp sampler3D;   /* highp int: the grain hash needs 32-bit uints; fragment ints default to mediump (16-bit on Mali) */
in vec2 vUv; out vec4 o;
const vec3 W=vec3(0.2126,0.7152,0.0722);
/* Scene-linear values are unbounded. Float targets hold them as-is; on GPUs without float render
   targets they are stored as sqrt(x/4) in 8 bits (range 0..4, i.e. two stops over white). */
#define FLOAT_TARGETS ${hasFloat?1:0}
vec3 stEnc(vec3 l){ l=max(l,0.0); return FLOAT_TARGETS==1 ? l : sqrt(min(l,4.0)*0.25); }
vec3 stDec(vec3 c){ return FLOAT_TARGETS==1 ? c : c*c*4.0; }
const float GRAIN_K=1.0;
`;
/* Colour pipeline (v0.2), in comp order:
   1. Input transform   source -> scene-linear working space (linear Rec.709/sRGB primaries, unbounded).
                        8-bit images are sRGB-encoded; RAW (later) arrives already linear (uInXfer=1).
   1b. Development      per-image source prep: shadows / midtones / highlights (tone equaliser on luminance).
   2. Scene-linear      exposure, white balance. Nothing is clipped.
   3. Optics            chromatic aberration, edge softness, halation, bloom, vignette, all in scene-linear,
                        before the film curve (what the lens and the negative see).
   4. Look encoding     extended sRGB OETF: identical to sRGB up to 1.0 and continues above it.
   5. Film look         per-channel gamma, S-curve, highlight roll-off (compresses >1.0), black lift /
                        white crush, saturation, split toning, external LUT -> display 0..1.
   Grain                part of the emulsion: per-layer grain at the end of the optics pass, before the
                        film curve (see emulsionGrain). */
const SCENE_FN=`
uniform float uExp,uTemp,uTint; uniform int uInXfer; uniform vec3 uDev;
uniform float uBW; uniform vec3 uBWw;   /* black & white: amount, colour weights (film sensitivity × filter) */
/* Profile (v0.6): a tone curve in stops around mid grey, stored as a 512-sample LUT over -16..+10 stops,
   extended linearly outside with the curve's end slopes. Applied on luminance first, then the tone sliders. */
uniform sampler2D uCurve; uniform int uCurveOn; uniform vec2 uCurveSlope; uniform float uProfSat;   /* uProfSat: camera saturation (Camera-like RAW), 1 = none */
float profileCurve(float s){ float c=clamp(s,-16.0,10.0); float y=texture(uCurve,vec2(((c+16.0)/26.0*511.0+0.5)/512.0,0.5)).r;
  return y+(s-c)*(s<c?uCurveSlope.x:uCurveSlope.y); }
/* Development (source prep, per image): shadows / midtones / highlights in stops around mid grey, on
   luminance so hue is kept. Three operators applied in sequence, each monotonic, so tones never invert. */
float ssd(float a,float b,float x){ float t=clamp((x-a)/(b-a),0.0,1.0); return t*t*(3.0-2.0*t); }
vec3 develop(vec3 l){
  if (uDev==vec3(0.0) && uCurveOn==0 && uProfSat==1.0) return l;
  float y=max(dot(l,W),1e-7), st=log2(y/0.18), x=st;
  if (uCurveOn==1) x=profileCurve(x);
  x += uDev.y*(1.0-ssd(0.0,3.0,abs(x)));     /* midtones */
  x += uDev.x*(1.0-ssd(-5.0,-0.5,x));        /* shadows */
  x += uDev.z*ssd(0.5,3.5,x);                /* highlights */
  vec3 o=l*exp2(x-st);
  if (uProfSat!=1.0){ float Y=dot(o,W); o=max(Y+(o-Y)*uProfSat, vec3(0.0)); }
  return o;
}
vec3 srgbToLin(vec3 c){ return mix(c/12.92, pow((c+0.055)/1.055, vec3(2.4)), step(vec3(0.04045),c)); }
vec3 inputTransform(vec3 c){ return develop(uInXfer==1 ? c : srgbToLin(c)); }
vec3 sceneLinear(vec3 l){
  l *= exp2(uExp);
  vec3 wb = vec3(1.0+0.25*uTemp, 1.0-0.18*uTint, 1.0-0.25*uTemp);
  wb /= dot(wb,W);
  l = max(l*wb, 0.0);
  if (uBW>0.0){ float s=uBWw.r+uBWw.g+uBWw.b; float m=max(dot(l,uBWw)/max(s,0.05),0.0); l=mix(l, vec3(m), uBW); }   /* grey preserved: weights normalised */
  return l;
}`;
const LOOK_FN=`
uniform sampler3D uLut; uniform float uLutMix, uLutSize; uniform float uBWLook;   /* silver is colourless: lens/halation/grain colour collapses to grey */
uniform float uCon,uRoll,uFade,uCrush,uSat,uShAmt,uHiAmt; uniform vec3 uGam,uShCol,uHiCol;
vec3 linToEnc(vec3 c){ c=max(c,0.0); return mix(c*12.92, 1.055*pow(c,vec3(1.0/2.4))-0.055, step(vec3(0.0031308),c)); }
float sg(float z){ return 1.0/(1.0+exp(-z)); }
float sc(float x){ const float k=6.0, p=0.45; float a=sg(-k*p), b=sg(k*(1.0-p)); return (sg(k*(x-p))-a)/(b-a); }
float curve(float x){ float s=sc(x); return uCon>=0.0 ? mix(x,s,uCon) : max(mix(x,2.0*x-s,-uCon),0.0); }
float roll(float y){ float kn=1.0-0.6*uRoll; if (y<=kn||uRoll<=0.0) return y; float r=1.0-kn; return kn + r*(1.0-exp(-(y-kn)/r)); }
vec3 filmLook(vec3 c){
  if (uBWLook>0.0) c=mix(c, vec3(dot(c,vec3(0.2126,0.7152,0.0722))), uBWLook);
  c = pow(c, vec3(1.0)+uGam);
  c = vec3(curve(c.r),curve(c.g),curve(c.b));
  c = vec3(roll(c.r),roll(c.g),roll(c.b));
  c = mix(vec3(uFade), vec3(1.0-uCrush), c);
  float lum = dot(c,W);
  c = mix(vec3(lum), c, uSat);
  float ws = 1.0-smoothstep(0.0,0.55,lum), wh = smoothstep(0.45,1.0,lum);
  c += (uShCol-dot(uShCol,W))*uShAmt*ws + (uHiCol-dot(uHiCol,W))*uHiAmt*wh;
  c = clamp(c,0.0,1.0);
  if (uLutMix>0.0){ vec3 lc = texture(uLut, c*(uLutSize-1.0)/uLutSize + 0.5/uLutSize).rgb; c = mix(c, lc, uLutMix); }
  return clamp(c,0.0,1.0);
}`;
/* Procedural grain noise: hashed value noise, a finer octave and a coarse clumping octave. */
const GRAIN_FN=`
uvec3 pcg(uvec3 v){ v=v*1664525u+1013904223u; v.x+=v.y*v.z; v.y+=v.z*v.x; v.z+=v.x*v.y; v^=v>>16u; v.x+=v.y*v.z; v.y+=v.z*v.x; v.z+=v.x*v.y; return v; }
float rnd(vec2 i,float s){ uvec3 h=pcg(uvec3(uvec2(ivec2(i)+ivec2(65536)), uint(s))); return float(h.x>>8u)*(1.0/16777215.0)-0.5; }   /* 24 bits: exact in float32 on every GPU */
float vn(vec2 p,float s){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(rnd(i,s),rnd(i+vec2(1,0),s),f.x), mix(rnd(i+vec2(0,1),s),rnd(i+vec2(1,1),s),f.x), f.y); }
float gn(vec2 p,float s,float rough){
  float fine=vn(p,s), finer=vn(p*2.07+vec2(13.7,4.1),s+101.0), clump=vn(p*0.47+vec2(3.1,9.2),s+211.0);
  float n=(0.8-0.35*rough)*fine + (0.45-0.15*rough)*finer;
  n += rough*0.9*clump*(0.6+1.6*abs(fine));   /* clumps: coarse blotches that modulate the fine grain */
  return n; }`;
/* 1-2: source -> scene-linear (stored) */
const FS_SCENE=HEAD+SCENE_FN+`
uniform sampler2D uSrc; uniform vec4 uCrop;   /* format crop: x, y, w, h in source UV (top-left origin) */
void main(){ o=vec4(stEnc(sceneLinear(inputTransform(texture(uSrc,uCrop.xy+vec2(vUv.x,1.0-vUv.y)*uCrop.zw).rgb))),1.0); }`;
/* colour only, no optics: used for the .cube export (identity input, not flipped) */
const FS_GRADE=HEAD+SCENE_FN+LOOK_FN+`
uniform sampler2D uSrc;
void main(){ o=vec4(filmLook(linToEnc(sceneLinear(inputTransform(texture(uSrc,vUv).rgb)))),1.0); }`;
/* halation / bloom source: scene-linear highlights above the threshold */
const FS_BRIGHT=HEAD+`
uniform sampler2D uTex; uniform float uThr;
void main(){ vec3 l=stDec(texture(uTex,vUv).rgb); float m=smoothstep(uThr,uThr+0.25,dot(l,W)); o=vec4(stEnc(l*m),1.0); }`;
const FS_COPY=HEAD+`
uniform sampler2D uTex; void main(){ o=vec4(texture(uTex,vUv).rgb,1.0); }`;
const FS_BLUR=HEAD+`
uniform sampler2D uTex; uniform vec2 uDir;
void main(){ float w[5]=float[](0.227027,0.1945946,0.1216216,0.054054,0.016216);
  vec3 s=stDec(texture(uTex,vUv).rgb)*w[0];
  for(int i=1;i<5;i++){ vec2 d=uDir*float(i); s+=(stDec(texture(uTex,vUv+d).rgb)+stDec(texture(uTex,vUv-d).rgb))*w[i]; }
  o=vec4(stEnc(s),1.0); }`;
/* 3: optics in scene-linear, then the emulsion: per-layer grain as a density fluctuation, before the film curve */
const FS_OPTICS=HEAD+GRAIN_FN+`
uniform sampler2D uImg,uSoft,uH2,uH4,uH8;
uniform vec2 uRes; uniform float uCA,uSoftAmt,uSoftStart,uHal,uHalR,uBloom,uVig,uVigSize,uVigFeather;
uniform vec3 uHalCol;
uniform float uGrain,uGrainSize,uGrainCol,uGrainResp,uGrainRough,uGrainShadow,uSeed;
uniform vec3 uGAmt,uGSize,uGClump;
/* Emulsion grain. Each colour record (R/G/B layer) has its own grain size, amount and clumping, and its
   grain follows that layer's own exposure. It is added before the film curve, as a fluctuation in a
   log-like encoding (extended sRGB, close to density), so the film curve and roll-off then shape it:
   more visible in the mids, compressed in the highlights. "Colour grain" sets how independent the layers
   are (0 = one shared field, as in B&W). */
vec3 encToLin(vec3 e){ return mix(e/12.92, pow((max(e,0.04045)+0.055)/1.055, vec3(2.4)), step(vec3(0.04045),e)); }
vec3 linToEncG(vec3 c){ c=max(c,0.0); return mix(c*12.92, 1.055*pow(c,vec3(1.0/2.4))-0.055, step(vec3(0.0031308),c)); }
vec3 emulsionGrain(vec3 lin, vec2 uv){
  vec2 px=uv*uRes/uGrainSize;
  vec3 rough=clamp(uGrainRough*uGClump,0.0,1.0);
  float shared=gn(px/dot(uGSize,vec3(1.0/3.0)), uSeed+37.0, uGrainRough);
  vec3 ind=vec3(gn(px/uGSize.r, uSeed, rough.r),
                gn(px/uGSize.g+vec2(17.3,5.1), uSeed+11.0, rough.g),
                gn(px/uGSize.b+vec2(3.7,29.9), uSeed+23.0, rough.b));
  float k=uGrainCol;
  vec3 n=((1.0-k)*vec3(shared) + k*ind) / sqrt((1.0-k)*(1.0-k)+k*k);
  vec3 e=linToEncG(lin);                                   /* per-layer exposure, log-like */
  vec3 x=clamp(e,0.0,1.0);
  vec3 resp=mix(vec3(1.0), 1.0-pow(abs(x*2.0-1.0),vec3(2.0))*0.85, uGrainResp)   /* midtone bias */
           *mix(vec3(1.0), 1.5-1.1*smoothstep(0.05,0.6,x), uGrainShadow);          /* shadow grain */
  e += n*uGrain*0.22*GRAIN_K*uGAmt*resp;
  return encToLin(e);
}
vec3 img(vec2 uv,float m){ return mix(stDec(texture(uImg,uv).rgb), stDec(texture(uSoft,uv).rgb), m); }
void main(){
  vec2 uv=vUv; float asp=uRes.x/uRes.y;
  vec2 d=uv-0.5; vec2 da=d*vec2(asp,1.0);
  float r=length(da)/length(vec2(asp,1.0)*0.5);
  float sm=uSoftAmt*smoothstep(uSoftStart,1.0,r);
  float ca=uCA*0.006*r*r;
  vec3 lin=vec3(img(0.5+d*(1.0+ca),sm).r, img(uv,sm).g, img(0.5+d*(1.0-ca),sm).b);
  vec3 h=mix(stDec(texture(uH2,uv).rgb), stDec(texture(uH4,uv).rgb), uHalR);
  lin += uHalCol*dot(h,W)*uHal*2.0;
  lin += (stDec(texture(uH8,uv).rgb)*0.6+stDec(texture(uH4,uv).rgb)*0.4)*uBloom*1.5;
  lin *= 1.0-uVig*smoothstep(uVigSize, uVigSize+uVigFeather, r);
  if (uGrain>0.0) lin=emulsionGrain(lin,uv);
  o=vec4(stEnc(lin),1.0);
}`;
/* 4-5: look encoding + film look -> display */
const FS_LOOK=HEAD+LOOK_FN+`
uniform sampler2D uTex;
void main(){ o=vec4(filmLook(linToEnc(stDec(texture(uTex,vUv).rgb))),1.0); }`;
/* 6: display image; original / split view */
const FS_FINAL=HEAD+`
uniform sampler2D uImg,uSrc; uniform vec4 uCrop;
uniform vec2 uRes; uniform float uSplit; uniform vec3 uView;   /* uView: centre (uv) and 1/zoom of the phone viewer; (0.5,0.5,1) = whole image */
uniform int uOrig, uChan, uSrcLin;   /* uSrcLin: source is scene-linear (RAW) → shown with a plain sRGB encode; uChan: 0 RGB, 1 R, 2 G, 3 B, 4 luminance (Rec.709) — viewer only, never exported */
vec3 chan(vec3 c){ return uChan==1?vec3(c.r): uChan==2?vec3(c.g): uChan==3?vec3(c.b): uChan==4?vec3(dot(c,W)): c; }
void main(){
  vec2 uv=(uView==vec3(0.5,0.5,1.0)) ? vUv : uView.xy+(vUv-0.5)*uView.z;   /* exact path for exports and desktop */
  if (uOrig==1 || (uSplit>=0.0 && vUv.x<uSplit)){
    vec3 s=texture(uSrc,uCrop.xy+vec2(uv.x,1.0-uv.y)*uCrop.zw).rgb;
    if (uSrcLin==1){ s=clamp(s,0.0,1.0); s=mix(s*12.92, 1.055*pow(s,vec3(1.0/2.4))-0.055, step(vec3(0.0031308),s)); }
    s=chan(s);
    if (uOrig==0 && abs(vUv.x-uSplit)*uRes.x<1.5) s=vec3(0.9);
    o=vec4(s,1.0); return;
  }
  vec3 col=chan(texture(uImg,uv).rgb);
  if (uSplit>=0.0 && abs(vUv.x-uSplit)*uRes.x<1.5) col=vec3(0.9);
  o=vec4(col,1.0);
}`;

function compile(fs){
  const p=gl.createProgram();
  for (const [t,src] of [[gl.VERTEX_SHADER,VS],[gl.FRAGMENT_SHADER,fs]]){
    const s=gl.createShader(t); gl.shaderSource(s,src); gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p,s);
  }
  gl.linkProgram(p); if(!gl.getProgramParameter(p,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u={}; const n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);
  for(let i=0;i<n;i++){ const inf=gl.getActiveUniform(p,i); u[inf.name.replace(/\[0\]$/,"")]=gl.getUniformLocation(p,inf.name); }
  return {p,u};
}
const P={scene:compile(FS_SCENE),grade:compile(FS_GRADE),bright:compile(FS_BRIGHT),copy:compile(FS_COPY),blur:compile(FS_BLUR),optics:compile(FS_OPTICS),look:compile(FS_LOOK),final:compile(FS_FINAL)};
gl.bindVertexArray(gl.createVertexArray());

function mkTex(w,h,ifmt=IFMT,fmt=gl.RGBA,type=ITYPE,data=null,filter=gl.LINEAR){
  const t=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,t);
  gl.texImage2D(gl.TEXTURE_2D,0,ifmt,w,h,0,fmt,type,data);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,filter); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,filter);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  return t;
}
function mkTarget(w,h){ w=Math.max(1,Math.round(w)); h=Math.max(1,Math.round(h)); const tex=mkTex(w,h); const fb=gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER,fb); gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0); return {tex,fb,w,h}; }
function freeTarget(t){ if(!t) return; gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }

let T=null, TW=0, TH=0;
function ensureTargets(w,h){
  if (T && TW===w && TH===h) return;
  if (T) for (const k in T) freeTarget(T[k]);
  T={ A:mkTarget(w,h), B:mkTarget(w,h),   /* A: scene-linear, then the graded display image; B: after optics */
      b2a:mkTarget(w/2,h/2), b2b:mkTarget(w/2,h/2),
      b4a:mkTarget(w/4,h/4), b4b:mkTarget(w/4,h/4),
      b8a:mkTarget(w/8,h/8), b8b:mkTarget(w/8,h/8),
      s2:mkTarget(w/2,h/2), s4a:mkTarget(w/4,h/4), s4b:mkTarget(w/4,h/4) };
  TW=w; TH=h;
}
function bindTex(unit,tex,target=gl.TEXTURE_2D){ gl.activeTexture(gl.TEXTURE0+unit); gl.bindTexture(target,tex); }
function drawTo(target,prog,setup){
  gl.bindFramebuffer(gl.FRAMEBUFFER,target?target.fb:null);
  gl.viewport(0,0,target?target.w:canvas.width,target?target.h:canvas.height);
  gl.useProgram(prog.p); setup(prog.u); gl.drawArrays(gl.TRIANGLES,0,3);
}
function pass(prog,src,dst,extra){ drawTo(dst,prog,u=>{ bindTex(0,src.tex); gl.uniform1i(u.uTex,0); if(extra) extra(u); }); }
function blur2(a,b,step){ pass(P.blur,a,b,u=>gl.uniform2f(u.uDir,step/a.w,0)); pass(P.blur,b,a,u=>gl.uniform2f(u.uDir,0,step/b.h)); }

/* LUT texture */
let lut=null, lutTex=null, lutSize=2;
function makeLutTex(size,data){
  const t=gl.createTexture(); gl.bindTexture(gl.TEXTURE_3D,t);
  const rgba=new Float32Array(size*size*size*4);
  for(let i=0;i<size*size*size;i++){ rgba[i*4]=data[i*3]; rgba[i*4+1]=data[i*3+1]; rgba[i*4+2]=data[i*3+2]; rgba[i*4+3]=1; }
  gl.texImage3D(gl.TEXTURE_3D,0,gl.RGBA16F,size,size,size,0,gl.RGBA,gl.FLOAT,rgba);
  for (const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T,gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D,p,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  return t;
}
const dummyLut=makeLutTex(2,new Float32Array([0,0,0, 1,0,0, 0,1,0, 1,1,0, 0,0,1, 1,0,1, 0,1,1, 1,1,1]));

function hueRGB(h){ h=((h%360)+360)%360/60; const x=1-Math.abs(h%2-1); const c=[[1,x,0],[x,1,0],[0,1,x],[0,x,1],[x,0,1],[1,0,x]][Math.floor(h)%6]; return c; }

function setSceneUniforms(u,e,dv,crv){ gl.uniform1f(u.uExp,e.exp); gl.uniform1f(u.uTemp,e.temp); gl.uniform1f(u.uTint,e.tint); dv=dv||DEV0; gl.uniform3f(u.uDev,dv.dShadows,dv.dMid,dv.dHigh);
  gl.uniform1f(u.uBW,e.bw); gl.uniform3f(u.uBWw,e.bwR,e.bwG,e.bwB);
  gl.uniform1f(u.uProfSat, crv&&crv.sat ? crv.sat : 1.0);
  if (crv && crv.pts) crv=crv.pts;
  if (crv){ const c=curveTexFor(crv); bindTex(6,c.tex); gl.uniform1i(u.uCurve,6); gl.uniform2f(u.uCurveSlope,c.lo,c.hi); gl.uniform1i(u.uCurveOn,1); } else gl.uniform1i(u.uCurveOn,0); }
function setGradeUniforms(u,e){ setSceneUniforms(u,e); setLookUniforms(u,e); }
function setLookUniforms(u,e){
  gl.uniform1f(u.uCon,e.con); gl.uniform1f(u.uRoll,e.roll); gl.uniform1f(u.uFade,e.fade); gl.uniform1f(u.uCrush,e.crush);
  gl.uniform1f(u.uSat,e.sat); gl.uniform3f(u.uGam,e.gR,e.gG,e.gB); gl.uniform1f(u.uBWLook,e.bw);
  gl.uniform3fv(u.uShCol,hueRGB(e.shHue)); gl.uniform1f(u.uShAmt,e.shAmt);
  gl.uniform3fv(u.uHiCol,hueRGB(e.hiHue)); gl.uniform1f(u.uHiAmt,e.hiAmt);
  bindTex(1, lutTex||dummyLut, gl.TEXTURE_3D); gl.uniform1i(u.uLut,1);
  gl.uniform1f(u.uLutMix, lutTex ? e.lutMix*lookMix : 0); gl.uniform1f(u.uLutSize, lutTex?lutSize:2);
}


/* ---- the render pipeline, the viewer (screen-sized canvas, zoom), scheduling ---- */
let showOrig=false, split=-1, compare=false, viewChan=0;
function render(){
  if (!srcTex) return;
  const e=effective();
  const cr=cropRect(curDev(),srcW,srcH), outW=cr.W, outH=cr.H;
  const scr=screenView(), fd=scr?fitDims(outW,outH):null, cw=scr?fd.dw:outW, ch=scr?fd.dh:outH;
  if (scr){ canvas.style.width=fd.cw+"px"; canvas.style.height=fd.ch+"px"; } else if (canvas.style.width){ canvas.style.width=canvas.style.height=""; }
  if (canvas.width!==cw||canvas.height!==ch){ canvas.width=cw; canvas.height=ch; }
  const vk=outW+"x"+outH+":"+cur; if (vk!==viewKey){ viewKey=vk; vz=1; vcx=vcy=0.5; updZoomUI(); }
  ensureTargets(outW,outH);
  /* 1-2 scene-linear */
  drawTo(T.A,P.scene,u=>{ bindTex(0,srcTex); gl.uniform1i(u.uSrc,0); gl.uniform1i(u.uInXfer,srcXfer); gl.uniform4f(u.uCrop,cr.x,cr.y,cr.w,cr.h); setSceneUniforms(u,e,bypass.dev?DEV0:curDev(), bypass.dev?null:profileFor(items[cur],curDev())); });
  /* halation / bloom pyramid and edge-softness blur, from scene-linear */
  drawTo(T.b2a,P.bright,u=>{ bindTex(0,T.A.tex); gl.uniform1i(u.uTex,0); gl.uniform1f(u.uThr,Math.pow(e.halThr,2.2)); });
  const st=1+e.halR;
  blur2(T.b2a,T.b2b,1.2*st);
  pass(P.copy,T.b2a,T.b4a); blur2(T.b4a,T.b4b,1.4*st);
  pass(P.copy,T.b4a,T.b8a); blur2(T.b8a,T.b8b,1.8);
  pass(P.copy,T.A,T.s2); pass(P.copy,T.s2,T.s4a); blur2(T.s4a,T.s4b,1.5);
  /* 3 optics */
  const hc=[1.0, 0.55-0.33*e.halWarm, 0.35-0.27*e.halWarm];
  drawTo(T.B,P.optics,u=>{
    bindTex(0,T.A.tex); gl.uniform1i(u.uImg,0);
    bindTex(1,T.s4a.tex); gl.uniform1i(u.uSoft,1);
    bindTex(2,T.b2a.tex); gl.uniform1i(u.uH2,2);
    bindTex(3,T.b4a.tex); gl.uniform1i(u.uH4,3);
    bindTex(4,T.b8a.tex); gl.uniform1i(u.uH8,4);
    gl.uniform2f(u.uRes,outW,outH);
    gl.uniform1f(u.uCA,e.ca); gl.uniform1f(u.uSoftAmt,e.soft); gl.uniform1f(u.uSoftStart,e.softStart);
    gl.uniform1f(u.uHal,e.hal); gl.uniform1f(u.uHalR,e.halR); gl.uniform3fv(u.uHalCol,hc); gl.uniform1f(u.uBloom,e.bloom);
    gl.uniform1f(u.uVig,e.vig); gl.uniform1f(u.uVigSize,e.vigSize); gl.uniform1f(u.uVigFeather,e.vigFeather);
    gl.uniform1f(u.uGrain,e.grain); gl.uniform1f(u.uGrainSize,e.grainSize*Math.min(outW,outH)/GRAIN_REF); gl.uniform1f(u.uGrainCol,e.grainCol); gl.uniform1f(u.uGrainResp,e.grainResp); gl.uniform1f(u.uGrainRough,e.grainRough); gl.uniform1f(u.uGrainShadow,e.grainShadow); gl.uniform1f(u.uSeed,e.seed+grainFrame*101);   /* video: new grain every frame */
    gl.uniform3f(u.uGAmt,e.gAmtR,e.gAmtG,e.gAmtB); gl.uniform3f(u.uGSize,e.gSizeR,e.gSizeG,e.gSizeB); gl.uniform3f(u.uGClump,e.gClumpR,e.gClumpG,e.gClumpB);
  });
  /* 4-5 film look -> display (back into A) */
  drawTo(T.A,P.look,u=>{ bindTex(0,T.B.tex); gl.uniform1i(u.uTex,0); setLookUniforms(u,e); });
  /* 6 display / compare */
  /* On phones the canvas is screen-sized and samples mipmapped copies: a properly filtered shrink (grain averages
     as it would in a downscaled export, instead of aliasing into dark speckle) and sharp pinch zoom. Exports use the full-size path. */
  const mipOn=t=>{ gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,t?gl.LINEAR_MIPMAP_LINEAR:gl.LINEAR); };
  if (scr){ bindTex(0,T.A.tex); gl.generateMipmap(gl.TEXTURE_2D); mipOn(true); bindTex(5,srcTex); if (!srcMip && (srcXfer===0||hasFloat)){ gl.generateMipmap(gl.TEXTURE_2D); srcMip=true; } if (srcMip) mipOn(true); }
  drawTo(null,P.final,u=>{
    bindTex(0,T.A.tex); gl.uniform1i(u.uImg,0);
    bindTex(5,srcTex); gl.uniform1i(u.uSrc,5); gl.uniform4f(u.uCrop,cr.x,cr.y,cr.w,cr.h);
    gl.uniform2f(u.uRes,cw,ch); gl.uniform1i(u.uSrcLin,srcXfer); if (scr) gl.uniform3f(u.uView,vcx,vcy,1/vz); else gl.uniform3f(u.uView,0.5,0.5,1);
    gl.uniform1f(u.uSplit, renderClean ? -1 : (compare?split:-1)); gl.uniform1i(u.uOrig, (!renderClean && showOrig)?1:0); gl.uniform1i(u.uChan, renderClean?0:viewChan);
  });
  if (scr){ bindTex(0,T.A.tex); mipOn(false); bindTex(5,srcTex); mipOn(false); }
}
/* Phone viewer zoom: vz 1 = fit; (vcx,vcy) = view centre in image uv (y up, as in the shader). */
let vz=1, vcx=0.5, vcy=0.5, viewKey="";
function screenView(){ return !renderClean && $("view").classList.contains("fit"); }   /* v0.7: desktop too */
function fitDims(outW,outH){
  const v=$("view"), pad=document.body.classList.contains("m")?16:32, dpr=window.devicePixelRatio||1;
  const sc=Math.min(1,(v.clientWidth-pad)/outW,(v.clientHeight-pad)/outH);
  const cw=Math.max(1,Math.floor(outW*sc)), chh=Math.max(1,Math.floor(outH*sc));
  return {cw, ch:chh, dw:Math.min(outW,Math.round(cw*dpr)), dh:Math.min(outH,Math.round(chh*dpr))};
}
function clampView(){ vz=Math.min(Math.max(vz,1),zoomMax()); const h=0.5/vz; vcx=Math.min(1-h,Math.max(h,vcx)); vcy=Math.min(1-h,Math.max(h,vcy)); }
function zoomMax(){ return Math.max(1, 4*TW/Math.max(1,canvas.width)); }   /* up to 4 screen pixels per image pixel */
function zoomPct(){ return Math.round(vz*canvas.width/Math.max(1,TW)*100); }   /* image pixels shown per screen pixel, % */
function updZoomUI(){ const z=$("zoomChip"); if (!z) return; const on=vz>1.001; z.hidden=!on; if (on) z.textContent=zoomPct()+"%  ·  Fit"; $("mZoomV").textContent = on ? zoomPct()+"%" : "Fit";
  $("btnZoom").textContent = on ? zoomPct()+"%" : "Fit"; $("btnZoom").title = on ? "Back to Fit (0)" : "Zoom to 100% (1)"; canvas.classList.toggle("zoomed",on); }
/* zoom about a screen point (default: centre); z in "fit" units */
function zoomAt(z,cx,cy){ const r=canvas.getBoundingClientRect(); if (cx==null){ cx=r.left+r.width/2; cy=r.top+r.height/2; }
  const uv=imgUv(cx,cy); vz=z; clampView(); vcx=uv[0]-((cx-r.left)/r.width-0.5)/vz; vcy=uv[1]+((cy-r.top)/r.height-0.5)/vz; clampView(); updZoomUI(); schedule(); }
const zoom100=()=>TW/Math.max(1,canvas.width);
function zoomToggle(cx,cy){ if (vz>1.001){ vz=1; vcx=vcy=0.5; updZoomUI(); schedule(); } else zoomAt(zoom100(),cx,cy); }
let renderClean=false, rafId=0;
function schedule(){ editStamp++; if (rafId) return; rafId=requestAnimationFrame(()=>{ rafId=0; render(); }); }

