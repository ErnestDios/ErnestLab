/* Ernest Lab · js/02-profiles.js · profile / tone-curve engine, camera-like fit, camera saturation, histograms.
   Classic script (not a module): files load in order from index.html and share one global scope. */
"use strict";
/* ---------------- Profiles & tone curve (v0.6) ----------------
   A profile is a tone curve in stops around mid grey (x = scene stops in, y = stops out), applied on luminance
   before the tone sliders. "auto": RAW → camera-like curve fitted to the file's own JPEG preview; JPEG → none
   (the camera's curve is already in it). "flat": none. "custom": the points in dev.curve. */
function mcurve(pts){   /* monotone cubic (Fritsch–Carlson) through sorted points, linear outside */
  const n=pts.length, xs=pts.map(p=>p[0]), ys=pts.map(p=>p[1]), d=[], m=new Array(n);
  if (n===1) return Object.assign(x=>ys[0]+(x-xs[0]),{lo:1,hi:1});
  for (let i=0;i<n-1;i++) d[i]=(ys[i+1]-ys[i])/(xs[i+1]-xs[i]);
  m[0]=d[0]; m[n-1]=d[n-2]; for (let i=1;i<n-1;i++) m[i]=d[i-1]*d[i]<=0?0:(d[i-1]+d[i])/2;
  for (let i=0;i<n-1;i++){ if (d[i]===0){ m[i]=m[i+1]=0; continue; } const a=m[i]/d[i], b=m[i+1]/d[i], h=a*a+b*b; if (h>9){ const t=3/Math.sqrt(h); m[i]=t*a*d[i]; m[i+1]=t*b*d[i]; } }
  const f=x=>{ if (x<=xs[0]) return ys[0]+(x-xs[0])*m[0]; if (x>=xs[n-1]) return ys[n-1]+(x-xs[n-1])*m[n-1];
    let i=0; while (x>xs[i+1]) i++; const h=xs[i+1]-xs[i], t=(x-xs[i])/h, t2=t*t, t3=t2*t;
    return (2*t3-3*t2+1)*ys[i]+(t3-2*t2+t)*h*m[i]+(-2*t3+3*t2)*ys[i+1]+(t3-t2)*h*m[i+1]; };
  f.lo=Math.max(0,m[0]); f.hi=Math.max(0,m[n-1]); return f;
}
/* generic camera-like curve, used when a RAW has no preview to calibrate against (rounded from typical camera JPEG curves) */
const CAM_GENERIC=[[-8,-8.6],[-5,-5.5],[-3,-3.25],[-1.5,-1.6],[0,0],[1,1.15],[2,2.05],[3,2.6],[4.5,3.15],[7,3.8]];
/* scene curve for EXR renders (v0.10): slope ~1 through the mids, then a long shoulder that reaches white around
   +6.5 to +8 stops over mid grey, the range Blender's Filmic / AgX cover; CAM_GENERIC clips near +2.5 like a camera JPEG */
const EXR_SCENE=[[-10,-10.3],[-6,-6.15],[-3,-3.05],[-1,-1],[0,0],[1,0.93],[2,1.62],[3,2.02],[4.5,2.28],[6.5,2.43],[10,2.52]];
function effCurve(it,d){ if (!it) return null; const p=(d&&d.profile)||"auto";
  if (p==="custom" && d.curve && d.curve.length>=2) return d.curve;
  if (p==="auto" && it.exr) return EXR_SCENE;
  if (p==="auto" && it.raw) return it.camCurve||CAM_GENERIC;
  return null; }
/* what the scene pass gets: curve points (or null) + saturation. Camera saturation stays with a RAW unless the profile is Flat. */
function profileFor(it,d){ const pts=effCurve(it,d), sat=(it&&it.raw&&((d&&d.profile)||"auto")!=="flat"&&it.camSat)||1; return (pts||sat!==1)?{pts,sat}:null; }
const curveCache={key:"",tex:null,lo:1,hi:1};
function curveTexFor(pts){ const key=JSON.stringify(pts); if (curveCache.key===key && curveCache.tex) return curveCache;
  const f=mcurve(pts), N=512, data=new Float32Array(N); for (let i=0;i<N;i++) data[i]=f(-16+26*i/(N-1));
  if (!curveCache.tex){ curveCache.tex=gl.createTexture(); }
  bindTex(6,curveCache.tex); gl.pixelStorei(gl.UNPACK_ALIGNMENT,4);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.R16F,N,1,0,gl.RED,gl.FLOAT,data);
  for (const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D,k,v);
  curveCache.key=key; curveCache.lo=f.lo; curveCache.hi=f.hi; return curveCache; }
/* camera-like fit: match the tone distribution (quantiles) of the RAW to the camera's preview, where the preview
   is neither crushed nor clipped; below that slope 1, above it a soft shoulder so RAW highlight detail survives. */
const QP=(()=>{ const a=[]; for (let i=0;i<199;i++) a.push((i+0.5)/199); a.push(0.998,0.999,0.9995,0.9998); return a; })(), QN=QP.length;   /* extra quantiles: the brightest highlights */
const qs=n=>{ const a=n.slice().sort((x,y)=>x-y), o=new Float32Array(QN); for (let i=0;i<QN;i++) o[i]=a[Math.min(a.length-1,Math.floor(QP[i]*a.length))]; return o; };
function fitCamCurve(rawQ,refQ){
  /* both quantile lists are sorted, so the (raw, preview) pairs already form a rising curve: follow it over the whole
     range the preview resolves (phone previews tone-map highlights hard and rarely clip, so this reaches the top) */
  const pairs=[]; for (let i=0;i<QN;i++){ const r=rawQ[i], j=refQ[i]; if (r>1e-6 && j>0.003 && j<0.9) pairs.push([Math.log2(r/0.18),Math.log2(j/0.18)]); }
  if (pairs.length<20) return null;
  const x0=pairs[0][0], x1=pairs[pairs.length-1][0]; if (x1-x0<2) return null;
  const at=x=>{ let k=0; while (k<pairs.length-2 && pairs[k+1][0]<x) k++; const a=pairs[k], b=pairs[k+1]; return b[0]-a[0]<1e-6 ? (a[1]+b[1])/2 : a[1]+(b[1]-a[1])*Math.min(1,Math.max(0,(x-a[0])/(b[0]-a[0]))); };
  const n=Math.max(3,Math.ceil((x1-x0)/0.75)), pts=[]; for (let i=0;i<=n;i++){ const x=x0+(x1-x0)*i/n; pts.push([x,at(x)]); }
  for (let i=1;i<pts.length;i++) pts[i][1]=Math.max(pts[i][1],pts[i-1][1]+0.02);   /* strictly rising */
  const lo=pts[0], hi=pts[pts.length-1];
  pts.unshift([lo[0]-3,lo[1]-3]);                                              /* shadows: slope 1 */
  let x=hi[0], y=hi[1], sl=Math.min(1,Math.max(0.15,(hi[1]-pts[pts.length-2][1])/(hi[0]-pts[pts.length-2][0])));   /* continue the preview's own highlight slope */
  for (let k=0;k<3;k++){ sl*=0.65; x+=1.5; y+=1.5*sl; pts.push([x,+y.toFixed(3)]); }   /* shoulder */
  return pts.map(p=>[+p[0].toFixed(3),+p[1].toFixed(3)]);
}
/* camera saturation: median colourfulness ((max-min)/max, linear) of the preview over that of the raw, mid tones only.
   Distributions, not pixels, so lens corrections in the preview don't matter. */
function camSaturation(raw,nr,ref,nj){
  const sat=(a,n)=>{ const o=[]; for (let i=0;i<n*3;i+=3){ const lu=0.2126*a[i]+0.7152*a[i+1]+0.0722*a[i+2]; if (lu>0.03 && lu<0.8){ const mx=Math.max(a[i],a[i+1],a[i+2]); o.push((mx-Math.min(a[i],a[i+1],a[i+2]))/mx); } } o.sort((p,q)=>p-q); return o.length>200?o[o.length>>1]:null; };
  const sr=sat(raw,nr), sj=sat(ref,nj); return sr&&sj ? +Math.min(1.8,Math.max(0.85,sj/Math.max(1e-3,sr))).toFixed(3) : 1;
}
/* luminance histogram in stops, for the curve editor */
const HX0=-8, HX1=5, HB=104;
function histFromLum(get,n){ const h=new Float32Array(HB); for (let i=0;i<n;i++){ const y=get(i); if (!(y>0)) { h[0]++; continue; } const b=Math.floor((Math.log2(y/0.18)-HX0)/(HX1-HX0)*HB); h[Math.min(HB-1,Math.max(0,b))]++; } return h; }
function histFromBitmap(bmp){ try{ const sc=Math.min(1,256/Math.max(bmp.width,bmp.height)), w=Math.max(1,Math.round(bmp.width*sc)), h=Math.max(1,Math.round(bmp.height*sc));
  const c=document.createElement("canvas"); c.width=w; c.height=h; const x=c.getContext("2d"); x.drawImage(bmp,0,0,w,h); const d=x.getImageData(0,0,w,h).data;
  return histFromLum(i=>0.2126*srgbDec(d[i*4])+0.7152*srgbDec(d[i*4+1])+0.0722*srgbDec(d[i*4+2]), w*h); }catch(e){ return null; } }