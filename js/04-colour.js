/* Ernest Lab · js/04-colour.js · v1.7 colour tools in the Colour section: colour wheels, hue curves, channel mixer.
   Classic script (not a module): files load in order from index.html and share one global scope.
   The wheels add no look keys: they are another way to set Shadow / Highlight tint, the R/G/B gammas and the printer
   lights. Hue curves and the mixer are look keys (js/03-params.js), identity at their defaults. */
"use strict";
const WHEEL_KEYS=["shHue","shAmt","hiHue","hiAmt","gR","gG","gB","plR","plG","plB"];
/* Hexagon colour plane: u = R − (G+B)/2, v = √3/2 (G − B); its angle is the hue of the Hue sliders (red 0°, yellow 60°…).
   On screen the wheels put red at 103°, as on a vectorscope (red upper left, blue right, green lower left). */
const WHEEL_ROT=103*Math.PI/180, R3=Math.sqrt(3);
const toHex=c=>[c[0]-(c[1]+c[2])/2, R3/2*(c[1]-c[2])];
const fromHex=(u,v)=>[2*u/3, -u/3+v/R3, -u/3-v/R3];   /* the zero-sum RGB offset with that (u, v) */
const clampN=(x,a,b)=>Math.min(b,Math.max(a,x));
/* each wheel: get() → (u, v) with |(u, v)| = 1 at the rim; set(u, v) writes the keys. Dragging is relative and slow
   (two radii of travel to reach the rim), so grading-sized moves are easy on a small wheel and the dot never jumps. */
const TINT_MAX=0.3, GAM_S=0.1, PL_S=24;
function tintWheel(hk,ak){ return {
  get:()=>{ const r=base[ak]/TINT_MAX, h=base[hk]*Math.PI/180; return [r*Math.cos(h), r*Math.sin(h)]; },
  set:(u,v)=>{ const r=Math.hypot(u,v); base[ak]=+clampN(r*TINT_MAX,0,TINT_MAX).toFixed(4); if (r>1e-4) base[hk]=+(((Math.atan2(v,u)*180/Math.PI)%360+360)%360).toFixed(2); },
  keys:[hk,ak] }; }
/* + gamma / + points = less of that colour; on reversal paper (a slide printed on Ilfochrome) + points = more of it */
const wheelSign=ks=>ks[0]==="plR" && typeof STOCK_LIB!=="undefined" && STOCK_LIB[base.stock] && STOCK_LIB[base.stock].reversal ? -1 : 1;
function rgbWheel(ks,S,lim,round){ return {
  get:()=>{ const g=ks.map(k=>base[k]), m=(g[0]+g[1]+g[2])/3, sg=wheelSign(ks), [u,v]=toHex(g.map(x=>sg*(m-x))); return [u/S,v/S]; },
  set:(u,v)=>{ const g=ks.map(k=>base[k]), m=(g[0]+g[1]+g[2])/3, sg=wheelSign(ks), d=fromHex(u*S,v*S);
    ks.forEach((k,i)=>{ const x=clampN(m-sg*d[i],-lim,lim); base[k]=round?Math.round(x):+x.toFixed(4); }); },
  keys:ks }; }
const WHEELS=[
  {id:"sh", name:"Shadows", tip:"Shadow tint: drag towards a colour to tint the darks (Shadow hue and Shadow tint).", ...tintWheel("shHue","shAmt")},
  {id:"mid", name:"Midtones", tip:"Midtones: drag towards a colour to bend the R, G and B gammas (their average, the overall gamma, stays).", ...rgbWheel(["gR","gG","gB"],GAM_S,0.15,false)},
  {id:"hi", name:"Highlights", tip:"Highlight tint: drag towards a colour to tint the brights (Highlight hue and Highlight tint).", ...tintWheel("hiHue","hiAmt")},
  {id:"pl", name:"Print", tip:"Printer lights as a wheel (Red, Green, Blue light; Print density stays): drag towards a colour for more of it in the whole print. Offset, as a lab grades.", ...rgbWheel(["plR","plG","plB"],PL_S,24,true)},
];
const wheelEls={};
function buildWheels(){
  const box=document.createElement("div"); box.className="wheels"; box.id="wheels";
  for (const w of WHEELS){
    const cell=document.createElement("div"); cell.className="wheel"; cell.title=w.tip+" Shift for fine, double-click or double-tap to reset.";
    const cv=document.createElement("canvas"); cv.setAttribute("role","img"); cv.setAttribute("aria-label",w.name+" colour wheel");
    const lab=document.createElement("div"); lab.className="wl"; lab.textContent=w.name;
    const val=document.createElement("div"); val.className="wv meta";
    cell.append(cv,lab,val); box.appendChild(cell); wheelEls[w.id]={cv,val,cell,w};
    wheelDrag(cv,w);
  }
  if (typeof ResizeObserver!=="undefined") new ResizeObserver(()=>drawWheels()).observe(box);
  return box;
}
function wheelOff(w){ return w.id==="pl" && !!(ctlEls.plR && ctlEls.plR.inp.disabled); }
function wheelReset(w){ for (const k of w.keys) base[k]=presetVals[k]; syncUI(); schedule(); }
function wheelDrag(cv,w){
  let st=null, lastTap=0, lastXY=[0,0];
  cv.addEventListener("pointerdown",ev=>{
    if (wheelOff(w)) return;
    const now=performance.now();
    if (now-lastTap<320 && Math.hypot(ev.clientX-lastXY[0],ev.clientY-lastXY[1])<24){ lastTap=0; wheelReset(w); return; }   /* double tap (also double-click) */
    lastTap=now; lastXY=[ev.clientX,ev.clientY];
    const [u,v]=w.get(); st={x:ev.clientX,y:ev.clientY,u,v,R:cv.clientWidth/2-6}; cv.setPointerCapture(ev.pointerId); ev.preventDefault(); });
  cv.addEventListener("pointermove",ev=>{ if (!st) return;
    const g=(ev.shiftKey?0.1:0.5)/Math.max(20,st.R), dx=(ev.clientX-st.x)*g, dy=-(ev.clientY-st.y)*g;
    const c=Math.cos(-WHEEL_ROT), s=Math.sin(-WHEEL_ROT);   /* screen → hexagon plane */
    let u=st.u+dx*c-dy*s, v=st.v+dx*s+dy*c; const r=Math.hypot(u,v); if (r>1.5){ u*=1.5/r; v*=1.5/r; }
    w.set(u,v); syncUI(); schedule(); });
  const end=()=>{ st=null; }; cv.addEventListener("pointerup",end); cv.addEventListener("pointercancel",end);
}
const wheelBg={};
function drawWheels(){
  for (const id in wheelEls){ const {cv,val,cell,w}=wheelEls[id];
    const css=cv.clientWidth; if (!css) continue; const dpr=Math.min(2,window.devicePixelRatio||1), n=Math.round(css*dpr);
    if (cv.width!==n){ cv.width=cv.height=n; }
    const ctx=cv.getContext("2d"), R=n/2-6*dpr, c0=n/2;
    if (!wheelBg[n]){   /* the disc: hue around, strength outwards, quiet so the picture stays the judge */
      const im=ctx.createImageData(n,n), d=im.data;
      for (let y=0;y<n;y++) for (let x=0;x<n;x++){ const dx=x+0.5-c0, dy=c0-(y+0.5), r=Math.hypot(dx,dy)/R, o=4*(y*n+x);
        const out=r*R-R;   /* px past the rim */
        if (out>1){ d[o+3]=0; continue; }
        const h=(Math.atan2(dy,dx)-WHEEL_ROT)*180/Math.PI, col=hueRGB(h), rim=r>0.93;
        for (let j=0;j<3;j++) d[o+j]=Math.round(255*(rim ? 0.12+0.62*col[j] : 0.16+(col[j]-0.5)*0.42*Math.min(1,r)));
        d[o+3]=Math.round(255*clampN(1-out,0,1)); }
      wheelBg[n]=im; }
    ctx.putImageData(wheelBg[n],0,0);
    ctx.strokeStyle="rgba(233,227,218,.18)"; ctx.lineWidth=dpr; ctx.beginPath(); ctx.moveTo(c0-R,c0); ctx.lineTo(c0+R,c0); ctx.moveTo(c0,c0-R); ctx.lineTo(c0,c0+R); ctx.stroke();
    const off=wheelOff(w); cell.classList.toggle("off",off);
    const [u,v]=w.get(), cs=Math.cos(WHEEL_ROT), sn=Math.sin(WHEEL_ROT), r=Math.hypot(u,v), q=r>1?1/r:1;
    const px=c0+(u*cs-v*sn)*q*R, py=c0-(u*sn+v*cs)*q*R, changed=w.keys.some(k=>Math.abs(base[k]-presetVals[k])>1e-9);
    if (r>1e-4){ ctx.strokeStyle="rgba(227,154,69,.55)"; ctx.beginPath(); ctx.moveTo(c0,c0); ctx.lineTo(px,py); ctx.stroke(); }
    ctx.lineWidth=2*dpr; ctx.strokeStyle=off?"#5a534b":r>1?"#ff9a6b":"#e39a45"; ctx.fillStyle="#0f0e0d";
    ctx.beginPath(); ctx.arc(px,py,5*dpr,0,2*Math.PI); ctx.fill(); ctx.stroke();
    cell.classList.toggle("changed",changed);
    val.textContent = off ? "not printed" : w.id==="sh"||w.id==="hi" ? (base[w.keys[1]]>1e-9 ? `${Math.round(base[w.keys[0]])}° ${(+base[w.keys[1]]).toFixed(3).replace(/^0/,"")}` : "—")
      : r<1e-4 ? "—"
      : w.id==="pl" ? w.keys.map((k,i)=>Math.round(base[k]) ? "RGB"[i]+(base[k]>0?"+":"−")+Math.abs(Math.round(base[k])) : "").filter(Boolean).join(" ")
      : `${Math.round(((Math.atan2(v,u)*180/Math.PI)%360+360)%360)}° ${r.toFixed(2).replace(/^0/,"")}`;
  }
}

/* ---------------- Hue curves ---------------- */
let hcMode="hh", hcSel=1;
const HC_RANGE={hh:60, hs:1};
function buildHueCurves(){
  const det=document.createElement("details"); det.className="sub hcbox"; det.id="hcBox";
  det.innerHTML='<summary>Hue curves <span class="meta">hue · saturation</span></summary>'+
    '<div class="ctrls"><div class="seg" role="tablist"><button type="button" class="btn on" data-m="hh" role="tab" aria-selected="true">Hue → hue</button><button type="button" class="btn" data-m="hs" role="tab" aria-selected="false">Hue → saturation</button></div>'+
    '<canvas id="hcCv" aria-label="Hue curve editor"></canvas>'+
    '<div class="note bwinfo" id="hcInfo"></div></div>';
  det.querySelectorAll(".seg .btn").forEach(b=>b.addEventListener("click",()=>{ hcMode=b.dataset.m; det.querySelectorAll(".seg .btn").forEach(x=>{ x.classList.toggle("on",x===b); x.setAttribute("aria-selected",x===b?"true":"false"); }); drawHC(); }));
  const cv=det.querySelector("canvas");
  let st=null, lastTap=0, lastI=-1;
  const knotAt=ev=>{ const r=cv.getBoundingClientRect(), h=clampN((ev.clientX-r.left-HC_PAD)/(r.width-2*HC_PAD),0,1)*360; let best=0, bd=1e9;
    HC_HUES.forEach((x,i)=>{ const d=Math.min(Math.abs(h-x),360-Math.abs(h-x)); if (d<bd){ bd=d; best=i; } }); return best; };
  cv.addEventListener("pointerdown",ev=>{ const i=knotAt(ev), now=performance.now(); hcSel=i;
    if (now-lastTap<320 && i===lastI){ lastTap=0; const k=hcMode+i; base[k]=presetVals[k]; syncUI(); schedule(); return; }
    lastTap=now; lastI=i; const k=hcMode+i; st={y:ev.clientY,v:base[k],k,H:cv.clientHeight-2*HC_PADY}; cv.setPointerCapture(ev.pointerId); ev.preventDefault(); drawHC(); });
  cv.addEventListener("pointermove",ev=>{ if (!st) return; const R=HC_RANGE[hcMode], g=(ev.shiftKey?0.2:1)*2*R/Math.max(40,st.H);
    base[st.k]=+clampN(st.v-(ev.clientY-st.y)*g,-R,R).toFixed(hcMode==="hh"?1:3); syncUI(); schedule(); });
  const end=()=>{ st=null; }; cv.addEventListener("pointerup",end); cv.addEventListener("pointercancel",end);
  if (typeof ResizeObserver!=="undefined") new ResizeObserver(()=>drawHC()).observe(cv);
  det.addEventListener("toggle",drawHC);
  return det;
}
const HC_PAD=10, HC_PADY=14;
function drawHC(){
  const cv=$("hcCv"); if (!cv || !cv.clientWidth) { hcInfo(); return; }
  const dpr=Math.min(2,window.devicePixelRatio||1), W=Math.round(cv.clientWidth*dpr), H=Math.round(cv.clientHeight*dpr);
  if (cv.width!==W||cv.height!==H){ cv.width=W; cv.height=H; }
  const ctx=cv.getContext("2d"), px=HC_PAD*dpr, py=HC_PADY*dpr, pw=W-2*px, ph=H-2*py, R=HC_RANGE[hcMode];
  const vals=hcVals(base,hcMode), X=h=>px+h/360*pw, Y=v=>py+ph/2-v/R*ph/2;
  ctx.clearRect(0,0,W,H); ctx.fillStyle="#12100e"; ctx.fillRect(0,0,W,H);
  /* strips: input hue below, what it becomes above */
  const sat=hcVals(base,"hs"), hue=hcVals(base,"hh");
  for (let x=0;x<pw;x++){ const h=x/pw*360, a=hueRGB(h), b=hueRGB(h+hcCurve(hue,h)), m=Math.max(0,1+hcCurve(sat,h)), f=c=>`rgb(${c.map(v=>Math.round(255*clampN(v,0,1))).join(",")})`;
    ctx.fillStyle=f(a.map(v=>0.2+0.6*v)); ctx.fillRect(px+x,H-py+4*dpr,1,5*dpr);
    ctx.fillStyle=f(b.map(v=>{ const g=(b[0]+b[1]+b[2])/3; return 0.2+0.6*(g+(v-g)*Math.min(m,2)); })); ctx.fillRect(px+x,py-9*dpr,1,5*dpr); }
  ctx.strokeStyle="#2a2622"; ctx.lineWidth=dpr; ctx.beginPath();
  for (const g of [-0.5,0.5]){ ctx.moveTo(px,Y(g*R)); ctx.lineTo(px+pw,Y(g*R)); }
  HC_HUES.forEach(h=>{ ctx.moveTo(X(h),py); ctx.lineTo(X(h),py+ph); }); ctx.stroke();
  ctx.strokeStyle="#4a433c"; ctx.beginPath(); ctx.moveTo(px,Y(0)); ctx.lineTo(px+pw,Y(0)); ctx.stroke();
  ctx.strokeStyle="#e39a45"; ctx.lineWidth=2*dpr; ctx.beginPath();
  for (let x=0;x<=pw;x+=2){ const y=Y(clampN(hcCurve(vals,x/pw*360),-R,R)); x?ctx.lineTo(px+x,y):ctx.moveTo(px+x,y); } ctx.stroke();
  HC_HUES.forEach((h,i)=>{ for (const hx of (i===0?[0,360]:[h])){ const c=hueRGB(h);
    ctx.fillStyle=`rgb(${c.map(v=>Math.round(255*v)).join(",")})`; ctx.strokeStyle=i===hcSel?"#e9e3da":"#0f0e0d"; ctx.lineWidth=(i===hcSel?2:1.5)*dpr;
    ctx.beginPath(); ctx.arc(X(hx),Y(clampN(vals[i],-R,R)),(i===hcSel?6:4.5)*dpr,0,2*Math.PI); ctx.fill(); ctx.stroke(); } });
  hcInfo();
}
function hcInfo(){ const el=$("hcInfo"); if (!el) return; const i=hcSel, a=base["hh"+i], s=base["hs"+i];
  const any=HC_HUES.some((_,j)=>Math.abs(base["hh"+j])>1e-9||Math.abs(base["hs"+j])>1e-9);
  el.innerHTML="";
  const b=document.createElement("b"); b.textContent=`${HC_NAMES[i]}: hue ${a>0?"+":""}${(+a).toFixed(1)}° · saturation ${Math.round((1+s)*100)} %. `; el.appendChild(b);
  if (any){ const bt=document.createElement("button"); bt.type="button"; bt.className="linkbtn"; bt.textContent="Reset hue curves";
    bt.addEventListener("click",()=>{ HC_HUES.forEach((_,j)=>{ base["hh"+j]=DEF["hh"+j]; base["hs"+j]=DEF["hs"+j]; }); syncUI(); schedule(); }); el.appendChild(bt); el.appendChild(document.createTextNode(" ")); }
  el.appendChild(document.createTextNode(hcMode==="hh"
    ? "Drag up or down anywhere above a colour to turn that hue (up = towards the next colour on the right). The strip on top shows what each hue becomes. Brightness stays."
    : "Drag up or down above a colour for more or less of it (bottom = grey, top = double). Brightness stays."));
  el.appendChild(document.createTextNode(" Shift for fine; double-tap a point to reset it."));
}

/* ---------------- Channel mixer ---------------- */
const mixSlots={};
function buildMixerBox(){
  const det=document.createElement("details"); det.className="sub mixbox"; det.id="mixBox";
  det.innerHTML='<summary>Channel mixer <span class="meta">R · G · B</span></summary><div class="ctrls"></div>';
  const box=det.querySelector(".ctrls");
  const n=document.createElement("div"); n.className="note bwinfo"; n.id="mixInfo"; box.appendChild(n);
  for (const [c,name] of [["R","Red"],["G","Green"],["B","Blue"]]){
    const h=document.createElement("div"); h.className="plhead"; h.innerHTML=`<b>${name} output</b> <span class="meta">made from</span>`; box.appendChild(h);
    const s=document.createElement("div"); s.className="mixslot"; box.appendChild(s); mixSlots[c]=s; }
  const r=document.createElement("label"); r.className="chk"; r.innerHTML='<input type="checkbox" id="mxLum"> Keep brightness';
  r.querySelector("input").addEventListener("change",ev=>{ base.mxLum=ev.target.checked?1:0; markChanged(); schedule(); colourSync(); });
  box.appendChild(r);
  return det;
}
function mixerSlot(k){ return mixSlots[k[1]]; }
function mixSync(){
  const cb=$("mxLum"), info=$("mixInfo"); if (!cb) return; cb.checked=base.mxLum>0.5;
  const rows=["R","G","B"].map(c=>["R","G","B"].reduce((a,d)=>a+base["m"+c+d],0)), id=MIX_KEYS.every((k,i)=>Math.abs(base[k]-(i%4===0?1:0))<1e-9);
  info.innerHTML="";
  if (!id){ const b=document.createElement("b"); b.textContent=`Totals R ${Math.round(rows[0]*100)} % · G ${Math.round(rows[1]*100)} % · B ${Math.round(rows[2]*100)} %. `; b.className=rows.some(t=>Math.abs(t-1)>0.005)&&!(base.mxLum>0.5)?"stk-wait":"stk-ok"; info.appendChild(b);
    const bt=document.createElement("button"); bt.type="button"; bt.className="linkbtn"; bt.textContent="Reset mixer";
    bt.addEventListener("click",()=>{ for (const k of MIX_KEYS) base[k]=DEF[k]; syncUI(); schedule(); }); info.appendChild(bt); info.appendChild(document.createTextNode(" ")); }
  info.appendChild(document.createTextNode("Each output channel is made from the red, green and blue light, in scene light before the film, like a filter in front of the lens (a measured stock sees the mixed light). "+
    (base.mxLum>0.5 ? "Keep brightness holds each pixel's luminance, so only colour moves." : "Totals over 100 % brighten that channel, under 100 % darken it.")));
}
function colourSync(){ drawWheels(); drawHC(); mixSync(); }
