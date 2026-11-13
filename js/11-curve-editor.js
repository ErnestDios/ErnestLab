/* Ernest Lab · js/11-curve-editor.js · profile UI and the curve editor.
   Classic script (not a module): files load in order from index.html and share one global scope. */
"use strict";
/* ---------------- Profile UI & curve editor ---------------- */
let userProfiles={}; try{ userProfiles=JSON.parse(localStorage.getItem("filmlab.profiles")||"{}"); }catch(e){ userProfiles={}; }
const saveUserProfiles=()=>{ try{ localStorage.setItem("filmlab.profiles",JSON.stringify(userProfiles)); }catch(e){} };
const CX0=-8, CX1=5, IDENT=[[-6,-6],[0,0],[4,4]];
const cleanPts=a=>{ if (!Array.isArray(a)) return null; let p=a.filter(q=>Array.isArray(q)&&q.length>=2&&isFinite(q[0])&&isFinite(q[1])).map(q=>[+(+q[0]).toFixed(3),+(+q[1]).toFixed(3)]).sort((x,y)=>x[0]-y[0]);
  p=p.filter((q,i)=>i===0||q[0]-p[i-1][0]>=0.05); for (let i=1;i<p.length;i++) p[i][1]=Math.max(p[i][1],p[i-1][1]); return p.length>=2?p:null; };
function editPts(){ const it=items[cur], d=curDev(); const c=effCurve(it,d); return (c||IDENT).map(q=>q.slice()); }
function setCurve(pts,name){ const it=items[cur]; if (!it) return; it.dev=Object.assign({},curDev(),{profile:"custom",curve:pts,curveName:name||null}); syncDev(); schedule(); }
function buildProfSelect(){
  const sel=$("devProf"), it=items[cur], raw=!!(it&&it.raw); sel.innerHTML="";
  const add=(v,t,parent)=>{ const o=document.createElement("option"); o.value=v; o.textContent=t; (parent||sel).appendChild(o); };
  add("auto", raw ? (it.camCurve?"Camera-like (matched)":"Camera-like (generic)") : "As shot");
  if (raw) add("flat","Flat (linear)");
  add("custom","Custom curve");
  const names=Object.keys(userProfiles).sort(); if (names.length){ const g=document.createElement("optgroup"); g.label="My profiles"; names.forEach(n=>add("p:"+n,n,g)); sel.appendChild(g); }
}
function syncProfile(){
  buildProfSelect(); const d=curDev(), sel=$("devProf"); let v=d.profile||"auto";
  if (v==="custom" && d.curveName && userProfiles[d.curveName] && JSON.stringify(userProfiles[d.curveName])===JSON.stringify(d.curve)) v="p:"+d.curveName;
  if (v==="flat" && !(items[cur]&&items[cur].raw)) v="auto";
  sel.value=v; $("btnDelProf").disabled=!v.startsWith("p:"); if (d.curveName && document.activeElement!==$("profName")) $("profName").value=d.curveName;
  drawCurve();
}
$("devProf").addEventListener("change",()=>{ const v=$("devProf").value, it=items[cur]; if (!it) return;
  if (v.startsWith("p:")){ const n=v.slice(2); setCurve(userProfiles[n].map(q=>q.slice()),n); return; }
  if (v==="custom"){ setCurve(editPts()); return; }
  it.dev=Object.assign({},curDev(),{profile:v,curve:null,curveName:null}); syncDev(); schedule(); });
$("btnCurveReset").addEventListener("click",()=>{ const it=items[cur]; if (!it) return; it.dev=Object.assign({},curDev(),{profile:"auto",curve:null,curveName:null}); syncDev(); schedule(); });
$("btnSaveProf").addEventListener("click",()=>{ const it=items[cur]; if (!it) return; const c=effCurve(it,curDev());
  if (!c){ toast("This profile has no curve to save. Shape the curve first (drag on it)."); return; }
  const n=($("profName").value||"").trim()||curDev().curveName||"My profile"; userProfiles[n]=c.map(q=>q.slice()); saveUserProfiles(); setCurve(c.map(q=>q.slice()),n); toast(`Saved profile "${n}".`); });
$("btnDelProf").addEventListener("click",()=>{ const v=$("devProf").value; if (!v.startsWith("p:")) return; const n=v.slice(2); delete userProfiles[n]; saveUserProfiles();
  const it=items[cur]; if (it && it.dev && it.dev.curveName===n) it.dev=Object.assign({},it.dev,{curveName:null}); syncDev(); toast(`Deleted profile "${n}" (stills that use it keep their curve).`); });
$("btnExportProf").addEventListener("click",()=>{ const it=items[cur]; if (!it) return; const c=effCurve(it,curDev());
  if (!c){ toast("Nothing to export: this profile is a straight line."); return; }
  const n=curDev().curveName||(curDev().profile==="auto"?(it.cam?it.cam+" camera-like":"Camera-like"):"Custom curve");
  const j={app:"Ernest Lab", appVersion:APP_VERSION, type:"profile", format:1, name:n, space:"tone curve in stops around mid grey (0.18), scene-linear luminance; x = in, y = out", points:c};
  offer(`ErnestLab_profile_${n.replace(/[^\w\-]+/g,"_")}.json`, new Blob([JSON.stringify(j,null,2)],{type:"application/json"})); });
function importProfile(j,fname){ const pts=cleanPts(j&&j.points); if (!pts) return false;
  const n=String(j.name||fname.replace(/\.json$/i,"")).slice(0,60)||"Profile"; userProfiles[n]=pts; saveUserProfiles(); if (items[cur]) setCurve(pts.map(q=>q.slice()),n); else syncProfile(); return n; }
async function loadProfileFiles(files){ let last=null, bad=[];
  for (const f of files){ try{ const n=importProfile(JSON.parse(await f.text()),f.name); if (n) last=n; else bad.push(f.name); }catch(e){ bad.push(f.name); } }
  if (last) toast(`Loaded profile "${last}" into My profiles and applied it to this still.`);
  if (bad.length) toast(`${bad.join(", ")} ${bad.length===1?"is":"are"} not an Ernest Lab profile.`,4000); }
$("btnLoadProf").addEventListener("click",()=>$("profIn").click());
$("profIn").addEventListener("change",ev=>{ loadProfileFiles([...ev.target.files]); ev.target.value=""; });

const cv=$("curveCv"), cvx=cv.getContext("2d");
function cvSize(){ const r=cv.getBoundingClientRect(), dpr=window.devicePixelRatio||1; const w=Math.max(1,Math.round(r.width*dpr)), h=Math.max(1,Math.round(r.height*dpr)); if (cv.width!==w||cv.height!==h){ cv.width=w; cv.height=h; } return {w,h,dpr,r}; }
const toPx=(x,y,w,h)=>[(x-CX0)/(CX1-CX0)*w, h-(y-CX0)/(CX1-CX0)*h];
function drawCurve(){
  if (!cv.offsetParent) return; const {w,h,dpr}=cvSize(), g=cvx, it=items[cur], d=curDev(); g.clearRect(0,0,w,h);
  if (it && !it.hist && it.bmp) it.hist=histFromBitmap(it.bmp);
  if (it && it.hist){ const hh=it.hist; let mx=0; for (const v of hh) mx=Math.max(mx,v); g.fillStyle="rgba(240,230,215,.10)"; g.beginPath(); g.moveTo(0,h);
    for (let i=0;i<HB;i++){ const x0=(HX0+(HX1-HX0)*i/HB-CX0)/(CX1-CX0)*w, x1=(HX0+(HX1-HX0)*(i+1)/HB-CX0)/(CX1-CX0)*w, y=h-Math.sqrt(hh[i]/(mx||1))*h*0.85; g.lineTo(x0,y); g.lineTo(x1,y); } g.lineTo(w,h); g.fill(); }
  g.lineWidth=1*dpr; for (let k=Math.ceil(CX0);k<=CX1;k++){ const [px,py]=toPx(k,k,w,h); g.strokeStyle=k===0?"rgba(232,154,60,.35)":"rgba(255,255,255,.06)"; g.beginPath(); g.moveTo(px,0); g.lineTo(px,h); g.moveTo(0,py); g.lineTo(w,py); g.stroke(); }
  g.fillStyle="rgba(240,230,215,.35)"; g.font=`${10*dpr}px ${getComputedStyle(document.body).getPropertyValue("--font-mono")||"monospace"}`; g.textBaseline="bottom";
  for (const k of [-6,-4,-2,0,2,4]){ const [px]=toPx(k,0,w,h); g.fillText((k>0?"+":"")+k,px+3*dpr,h-3*dpr); }
  g.setLineDash([4*dpr,4*dpr]); g.strokeStyle="rgba(255,255,255,.22)"; g.beginPath(); g.moveTo(...toPx(CX0,CX0,w,h)); g.lineTo(...toPx(CX1,CX1,w,h)); g.stroke();
  const ref = it && it.raw && d.profile==="custom" ? (it.camCurve||CAM_GENERIC) : null;
  const plot=(pts,style,lw)=>{ const f=mcurve(pts); g.strokeStyle=style; g.lineWidth=lw*dpr; g.beginPath(); for (let i=0;i<=200;i++){ const x=CX0+(CX1-CX0)*i/200, [px,py]=toPx(x,f(x),w,h); i?g.lineTo(px,py):g.moveTo(px,py); } g.stroke(); };
  if (ref) plot(ref,"rgba(232,154,60,.35)",1.2);
  g.setLineDash([]); const c=effCurve(it,d);
  if (c){ plot(c,bypass.dev?"rgba(232,154,60,.35)":"#e89a3c",2); const custom=d.profile==="custom";
    for (const q of c){ if (q[0]<CX0||q[0]>CX1) continue; const [px,py]=toPx(q[0],q[1],w,h); g.beginPath(); g.arc(px,py,(custom?5:4)*dpr,0,Math.PI*2);
      if (custom){ g.fillStyle="#e89a3c"; g.fill(); } else { g.strokeStyle="#e89a3c"; g.lineWidth=1.5*dpr; g.stroke(); } } }
  else { g.strokeStyle="rgba(232,154,60,.8)"; g.lineWidth=1.5*dpr; g.beginPath(); g.moveTo(...toPx(CX0,CX0,w,h)); g.lineTo(...toPx(CX1,CX1,w,h)); g.stroke(); }
}
let cdrag=null, lastTap={i:-1,t:0};
function evStops(ev){ const r=cv.getBoundingClientRect(); return [CX0+(ev.clientX-r.left)/r.width*(CX1-CX0), CX0+(1-(ev.clientY-r.top)/r.height)*(CX1-CX0)]; }
function nearest(pts,ev){ const r=cv.getBoundingClientRect(); let bi=-1, bd=1e9; pts.forEach((q,i)=>{ const px=r.left+(q[0]-CX0)/(CX1-CX0)*r.width, py=r.top+(1-(q[1]-CX0)/(CX1-CX0))*r.height, dd=Math.hypot(px-ev.clientX,py-ev.clientY); if (dd<bd){ bd=dd; bi=i; } });
  return bd<=(ev.pointerType==="touch"?22:12)?bi:-1; }
function removePoint(i){ const pts=editPts(); if (pts.length<=2) return; pts.splice(i,1); setCurve(pts); }
cv.addEventListener("pointerdown",ev=>{ if (!items[cur]) return; ev.preventDefault(); const pts=editPts(); let i=effCurve(items[cur],curDev())?nearest(pts,ev):-1;   /* straight line: no visible points, so a tap adds one */
  if (i>=0 && ev.pointerType!=="mouse"){ const t=performance.now(); if (lastTap.i===i && t-lastTap.t<350){ lastTap={i:-1,t:0}; removePoint(i); return; } lastTap={i,t}; }
  if (i<0){ const [x]=evStops(ev); const y=mcurve(pts)(x); pts.push([+x.toFixed(3),+y.toFixed(3)]); pts.sort((a,b)=>a[0]-b[0]); i=pts.findIndex(q=>q[0]===+x.toFixed(3)); setCurve(cleanPts(pts)||pts); }
  cdrag={i}; cv.setPointerCapture(ev.pointerId); });
cv.addEventListener("pointermove",ev=>{ if (!cdrag) return; const pts=editPts(), i=cdrag.i; if (!pts[i]) return; let [x,y]=evStops(ev);
  const lx=i>0?pts[i-1][0]+0.2:-16, hx=i<pts.length-1?pts[i+1][0]-0.2:10, ly=i>0?pts[i-1][1]:-16, hy=i<pts.length-1?pts[i+1][1]:10;
  pts[i]=[+Math.min(hx,Math.max(lx,x)).toFixed(3), +Math.min(hy,Math.max(ly,y)).toFixed(3)]; setCurve(pts); });
const endCdrag=()=>{ cdrag=null; }; cv.addEventListener("pointerup",endCdrag); cv.addEventListener("pointercancel",endCdrag);
cv.addEventListener("dblclick",ev=>{ const i=nearest(editPts(),ev); if (i>=0) removePoint(i); });
new ResizeObserver(()=>drawCurve()).observe(cv);
try{ syncProfile(); }catch(e){}

