/* Ernest Lab · js/01-development.js · per-image development: formats, crop, tone sliders, the Development section.
   Classic script (not a module): files load in order from index.html and share one global scope. */
"use strict";
/* ---------------- Development (per image, not part of the look) ---------------- */
/* Formats: the frame is cropped here, before the lens, so vignette, edge softness and aberration are
   computed for the new frame (as if shot natively on that format). Ratios are width / height. */
const FORMATS=[["orig","Original",0],["1:1","1:1 · 6×6",1],["5:4","5:4 · 4×5",1.25],["4:3","4:3",4/3],["3:2","3:2 · 35mm still",1.5],
  ["1.66","1.66 · Super 16",1.66],["16:9","16:9",16/9],["1.85","1.85 · flat",1.85],["2:1","2:1",2],["2.20","2.20 · 65mm",2.2],["2.39","2.39 · scope",2.39],
  /* Social: fixed orientation (ratio already as width / height) */
  /* (1:1 and 16:9 repeat the film & photo entries so they're easy to find when posting) */
  ["s1:1","1:1 · Instagram, LinkedIn square",1,"social"],["s4:5","4:5 · Instagram, Threads, LinkedIn feed",4/5,"social"],
  ["s3:4","3:4 · Instagram feed + grid",3/4,"social"],["s9:16","9:16 · Reels, Stories, TikTok, Shorts",9/16,"social"],
  ["s16:9","16:9 · YouTube, X, landscape",16/9,"social"],["s1.91","1.91 · link previews",1.91,"social"],["s2:3","2:3 · Pinterest",2/3,"social"]];
/* Which platforms show an image of this ratio (width / height) without cropping it further. Specs as of
   Nov 2026 (Instagram feed 1.91:1 to 3:4, profile grid 3:4; LinkedIn crops taller than 4:5; Pinterest taller
   than 2:3); platforms change these often. */
const PLATFORM_FITS=[
  ["Instagram feed", r=>r>=0.75-0.008 && r<=1.91+0.02],
  ["Instagram grid (whole image)", r=>Math.abs(r-0.75)<0.008],
  ["Reels · Stories · TikTok · Shorts", r=>Math.abs(r-9/16)<0.006],
  ["YouTube · X", r=>Math.abs(r-16/9)<0.015],
  ["LinkedIn feed", r=>r>=0.8-0.008 && r<=1.91+0.02],
  ["Link previews", r=>Math.abs(r-1.91)<0.02],
  ["Pinterest", r=>Math.abs(r-2/3)<0.008],
];
function platformHint(W,H){ const r=W/H, fits=PLATFORM_FITS.filter(p=>p[1](r)).map(p=>p[0]);
  const small = fits.length && W<1080 ? ` — only ${W} px wide; these platforms show 1080 px, so they'll upscale it` : "";
  return fits.length ? {ok:true,text:fits.join(" · ")+small} : {ok:false,text:"Social feeds will crop or letterbox this ratio"}; }
const DEV_PARAMS=[["panX","Reframe ↔",-1,1,0.01,0,"","frame"],["panY","Reframe ↕",-1,1,0.01,0,"","frame"],
  ["dShadows","Shadows",-1.5,1.5,0.01,0,"EV"],["dMid","Midtones",-1.5,1.5,0.01,0,"EV"],["dHigh","Highlights",-1.5,1.5,0.01,0,"EV"]];
const DEV0=Object.freeze({fmt:"orig",orient:"auto",panX:0,panY:0,dShadows:0,dMid:0,dHigh:0,profile:"auto",curve:null,curveName:null});
function devActive(d){ return d.fmt!=="orig"||d.dShadows||d.dMid||d.dHigh||(d.profile&&d.profile!=="auto"); }
/* Crop rectangle for a still: largest rect of the format's ratio inside the source, moved by panX/panY.
   Returns UV rect (top-left origin) and the output size in pixels. */
function cropRect(d,w,h){
  const f=FORMATS.find(x=>x[0]===d.fmt); let r=f?f[2]:0;
  if (!r||!w||!h) return {x:0,y:0,w:1,h:1,W:w,H:h};
  const port = f[3]!=="social" && (d.orient==="port" || (d.orient==="auto" && h>w));
  if (port) r=1/r;
  let cw=1, ch=1; if (w/h>r) cw=r*h/w; else ch=w/(r*h);
  const x=(1-cw)*(d.panX+1)/2, y=(1-ch)*(1-d.panY)/2;
  return {x,y,w:cw,h:ch,W:Math.max(1,Math.round(cw*w)),H:Math.max(1,Math.round(ch*h))};
}



/* ---- per-image development state and the Development section ---- */
const devEls={};
function curDev(){ const it=items[cur]; return (it&&it.dev)||DEV0; }
function setDev(k,v){ const it=items[cur]; if(!it) return; it.dev=Object.assign({},curDev(),{[k]:v}); syncDev(); schedule(); }
function syncDev(){ const d=curDev(), cropped=d.fmt!=="orig";
  for (const p of DEV_PARAMS){ const {inp,out,row}=devEls[p[0]]; inp.value=d[p[0]]; out.textContent=(d[p[0]]>0?"+":"")+fmtVal(p,d[p[0]]); out.classList.toggle("over",isOver(p,d[p[0]])); row.classList.toggle("changed",d[p[0]]!==0);
    if (p[7]==="frame"){ inp.disabled=!cropped; row.classList.toggle("off",!cropped); } }
  $("devFmt").value=d.fmt;
  const port = d.orient==="port" || (d.orient==="auto" && srcH>srcW);
  const social=(FORMATS.find(x=>x[0]===d.fmt)||[])[3]==="social";
  document.querySelectorAll("#devOrient button").forEach(b=>{ b.classList.toggle("on", cropped && !social && (b.dataset.o==="port")===port); b.disabled=!cropped || social || d.fmt==="1:1"; });
  const c=cropRect(d,srcW,srcH), hnt=platformHint(c.W,c.H), he=$("devHint");
  he.textContent=(hnt.ok?"No extra crop on: ":"")+hnt.text; he.classList.toggle("ok",hnt.ok);
  $("tick-dev").classList.toggle("live",!!devActive(d)); updMeta(); if (typeof syncProfile==="function" && $("curveCv").getContext) try{ syncProfile(); }catch(e){} }
function updMeta(){ const it=items[cur]; if(!it) return; const c=cropRect(curDev(),srcW,srcH);
  $("meta").textContent = `${it.name} · ${srcW}×${srcH}` + ((c.W!==srcW||c.H!==srcH) ? ` → ${c.W}×${c.H}` : "")
    + (it.raw && it.baseEV!=null ? ` · RAW${it.iso?" · ISO "+it.iso:""} · base ${it.baseEV>=0?"+":""}${it.baseEV.toFixed(1)} EV` : "");
  $("meta").title = $("meta").textContent + (it.raw && it.baseEV!=null ? `\n${it.cam||"RAW"}: decoded with LibRaw, camera white balance, linear. Base exposure ${it.baseAuto?"matched to the camera's own preview":"+1 EV (no camera preview in the file)"}; use Exposure and Development to adjust.` : ""); }
function buildDevelop(){
  const box=$("devCtrls"), fs=$("devFmt");
  makeSwitch("dev", $("develop").querySelector("summary"), $("develop"));
  const gF=document.createElement("optgroup"); gF.label="Film & photo"; const gS=document.createElement("optgroup"); gS.label="Social";
  for (const f of FORMATS){ const o=document.createElement("option"); o.value=f[0]; o.textContent=f[1]; (f[3]==="social"?gS:f[0]==="orig"?fs:gF).appendChild(o); }
  fs.appendChild(gF); fs.appendChild(gS);
  fs.addEventListener("change",()=>{ const it=items[cur]; if(!it) return; it.dev=Object.assign({},curDev(),{fmt:fs.value,panX:0,panY:0}); syncDev(); schedule(); });
  document.querySelectorAll("#devOrient button").forEach(b=>b.addEventListener("click",()=>setDev("orient",b.dataset.o)));
  for (const p of DEV_PARAMS){
    const [k,label,mn,mx,st]=p; const row=document.createElement("div"); row.className="ctl"; const id="p_"+k;
    row.innerHTML=`<label for="${id}">${label}</label><input type="range" id="${id}" min="${mn}" max="${mx}" step="${st}"><output for="${id}" title="Double-click to reset"></output>`;
    const inp=row.querySelector("input"), out=row.querySelector("output");
    inp.addEventListener("input",()=>setDev(k,+inp.value));
    const reset=()=>setDev(k,0); out.addEventListener("dblclick",reset); inp.addEventListener("dblclick",reset);
    scrubOut(out,p,()=>curDev()[k],v=>setDev(k,v));
    devEls[k]={inp,out,row}; (p[7]==="frame"?$("devFrame"):box).appendChild(row);
  }
  $("devCtrls").insertBefore($("profBox"), devEls.dShadows.row);   /* pipeline order: profile curve, then the tone sliders */
  $("btnDevReset").addEventListener("click",()=>{ const it=items[cur]; if(it){ it.dev=Object.assign({},DEV0); syncDev(); schedule(); } });
  $("btnDevAll").addEventListener("click",()=>{ const d=Object.assign({},curDev()); items.forEach(it=>it.dev=Object.assign({},d)); toast(`Development applied to ${items.length} still${items.length===1?"":"s"}.`); });
}
