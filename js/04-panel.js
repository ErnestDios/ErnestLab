/* Ernest Lab · js/04-panel.js · DOM helpers, the control panel: sections, sliders, switches, virtual sliders.
   Classic script (not a module): files load in order from index.html and share one global scope. */
"use strict";
/* ---------------- DOM helpers ---------------- */
const $ = id => document.getElementById(id);
function toast(msg, ms=2600){ const t=$("toast"); t.textContent=msg; t.style.display="block"; clearTimeout(toast._t); toast._t=setTimeout(()=>t.style.display="none", ms); }
function fmtVal(p, v){ const st=p[4]; const d = st>=1?0:st>=0.01?2:3; return (+v).toFixed(d)+(p[6]||""); }

const ctlEls = {};
function buildRack(){
  const host=$("groups");
  GROUPS.forEach((g,gi)=>{
    const det=document.createElement("details"); det.dataset.tab={tone:"color",curve:"color",color:"color",bw:"color",hal:"fx",lens:"fx",grain:"grain"}[g.id]; if (gi<7) det.open = gi!==0 ? true : true;
    const sum=document.createElement("summary"); sum.innerHTML=`<span class="tick" id="tick-${g.id}"></span>${g.title}`; det.appendChild(sum); makeSwitch(g.id, sum, det);
    const box=document.createElement("div"); box.className="ctrls";
    if (g.id==="grain"){
      const r=document.createElement("div"); r.className="grainstock";
      r.innerHTML='<label for="grainStock">Grain stock</label><select id="grainStock"><option value="">Custom (from look)</option></select>';
      const sel=r.querySelector("select");
      for (const n in GRAIN_STOCKS){ const o=document.createElement("option"); o.value=n; o.textContent=n; sel.appendChild(o); }
      sel.addEventListener("change",()=>{ const gs=GRAIN_STOCKS[sel.value]; if(!gs) return; Object.assign(base,gs); syncUI(); sel.value=gsName=sel.value; schedule(); });
      box.appendChild(r);
      /* gauge: move a measured emulsion to another film format (grain scales with the frame, as on film) */
      const r2=document.createElement("div"); r2.className="grainstock"; r2.id="gaugeRow";
      r2.innerHTML='<label for="grainGauge">Gauge</label><select id="grainGauge"></select>';
      const gg=r2.querySelector("select");
      for (const [mm,nm] of GAUGES){ const o=document.createElement("option"); o.value=mm; o.textContent=`${nm} (${mm} mm wide)`; gg.appendChild(o); }
      gg.addEventListener("change",()=>{ base.gGauge=+gg.value; syncUI(); schedule(); });
      const info=document.createElement("div"); info.className="note bwinfo"; info.id="grainInfo";
      box.appendChild(r2); box.appendChild(info);
    }
    if (g.id==="hal"){
      const r=document.createElement("div"); r.className="grainstock";
      r.innerHTML='<label for="halModel">Model</label><select id="halModel"><option value="1">Physical (base reflection)</option><option value="0">By eye (threshold)</option></select>';
      const sel=r.querySelector("select"); sel.addEventListener("change",()=>{ base.halPhys=+sel.value; syncUI(); schedule(); });
      const info=document.createElement("div"); info.className="note bwinfo"; info.id="halInfo";
      box.appendChild(r); box.appendChild(info);
    }
    if (g.id==="bw"){
      const r1=document.createElement("div"); r1.className="grainstock"; r1.innerHTML='<label for="bwFilm">Film</label><select id="bwFilm"></select>';
      const r2=document.createElement("div"); r2.className="grainstock"; r2.innerHTML='<label for="bwFilter">Lens filter</label><select id="bwFilter"></select>';
      const info=document.createElement("div"); info.className="note bwinfo"; info.id="bwInfo";
      const fs=r1.querySelector("select"), ft=r2.querySelector("select");
      for (const k in BW_FILMS){ const o=document.createElement("option"); o.value=k; o.textContent=BW_FILMS[k].name; fs.appendChild(o); }
      { const o=document.createElement("option"); o.value=""; o.textContent="Custom mix"; fs.appendChild(o); }
      for (const k in BW_FILTERS){ const o=document.createElement("option"); o.value=k; o.textContent=BW_FILTERS[k].name; ft.appendChild(o); }
      const pick=()=>{ const film=fs.value||"pan"; let f=ft.value||"none"; if (!bwEntry(film,f)) f="none";
        Object.assign(base,bwW(film,f)); if (!(base.bw>0)) base.bw=1; bypass.bw=false; syncUI(); schedule(); };
      fs.addEventListener("change",pick); ft.addEventListener("change",pick);
      box.appendChild(r1); box.appendChild(r2); box.appendChild(info);
    }
    let sub=null;
    for (const p of g.params){
      const [k,label,mn,mx,st] = p;
      if (p[7]==="layer" && !sub){
        sub=document.createElement("details"); sub.className="sub";
        sub.innerHTML='<summary>Emulsion layers <span class="meta">R · G · B</span></summary>';
        const sb=document.createElement("div"); sb.className="ctrls"; sub.appendChild(sb); box.appendChild(sub);
      }
      const row=document.createElement("div"); row.className="ctl";
      const id="p_"+k;
      row.innerHTML=`<label for="${id}">${label}</label><input type="range" id="${id}" min="${mn}" max="${mx}" step="${st}" ${k.endsWith("Hue")?'class="hue"':""}><output for="${id}" title="Double-click to reset"></output>`;
      const inp=row.querySelector("input"), out=row.querySelector("output");
      inp.addEventListener("input",()=>{ base[k]=+inp.value; out.textContent=fmtVal(p,inp.value); if (/^(grain|gAmt|gSize|gClump)/.test(k)){ const gss=document.getElementById("grainStock"); if (gss) gss.value=""; } if (/^bw[RGB]$/.test(k)) bwSync(); if (k==="bw"){ if (base.bw>0) bypass.bw=false; bwSwitchSync(); } markChanged(); schedule(); });
      const reset=()=>{ base[k]=presetVals[k]; syncUI(); schedule(); };
      out.addEventListener("dblclick",reset); inp.addEventListener("dblclick",reset);
      scrubOut(out,p,()=>base[k],v=>{ base[k]=v; if (k==="bw" && v>0) bypass.bw=false; syncUI(); schedule(); });
      ctlEls[k]={inp,out,row,p};
      (p[7]==="layer" ? sub.lastChild : box).appendChild(row);
    }
    det.appendChild(box); host.appendChild(det);
  });
}
function markChanged(){
  for (const k in ctlEls){ ctlEls[k].row.classList.toggle("changed", Math.abs(base[k]-presetVals[k])>1e-9); }
  for (const g of GROUPS){
    const live = g.params.some(p=>{ const k=p[0]; if (NONMIX.includes(k)) return false; return Math.abs(base[k]-DEF[k])>1e-9; }) || (g.id==="color" && lut);
    const t=$("tick-"+g.id); if (t) t.classList.toggle("live", !!live);
  }
}
/* show which film × filter the current weights are, what it does, and what it would cost on a real camera */
function bwSync(){
  const fs=$("bwFilm"), ft=$("bwFilter"), info=$("bwInfo"); if (!fs) return;
  const cur=[base.bwR,base.bwG,base.bwB], cs=cur[0]+cur[1]+cur[2]||1, cn=cur.map(v=>v/cs); let hit=null;
  for (const f in BW_FILMS){ for (const t in BW_FILTERS){ if (!bwEntry(f,t)) continue; const w=bwW(f,t); if (Math.abs(w.bwR-cn[0])<0.006&&Math.abs(w.bwG-cn[1])<0.006&&Math.abs(w.bwB-cn[2])<0.006){ hit=[f,t]; break; } } if (hit) break; }
  fs.value=hit?hit[0]:""; ft.value=hit?hit[1]:"none"; ft.disabled=!hit||!BW_SPECTRAL(hit[0]);
  /* filters that block everything a film can see are greyed out for that film */
  for (const o of ft.options) o.disabled = !!hit && BW_SPECTRAL(hit[0]) && !bwEntry(hit[0],o.value);
  const pct=cn.map(v=>Math.round(v*100)), mix=`Grey made of red ${pct[0]}% · green ${pct[1]}% · blue ${pct[2]}%.`;
  if (!hit){ info.textContent=`Custom mix. ${mix} Mid grey stays mid grey; weights are normalised.`; return; }
  const F=BW_FILMS[hit[0]], T=BW_FILTERS[hit[1]], st=bwEntry(hit[0],hit[1])[3];
  info.textContent = `${F.note} ${hit[1]!=="none"?`${T.name}: ${T.note} On this film it costs ${st.toFixed(1)} stops (factor ×${(Math.pow(2,st)).toFixed(st<1.6?1:0)}), computed from the film's sensitivity and the filter's measured transmission; here it's compensated, so mid grey stays put. `:""}${mix}`;
}
/* measured grain: show the source and gauge; the datasheet sets the tone response, so those two sliders rest */
function grainSync(){
  const info=$("grainInfo"), row=$("gaugeRow"), gg=$("grainGauge"); if (!info) return;
  const D=GRAIN_DATA[base.gStock]; row.hidden=!D;
  for (const k of ["grainResp","grainShadow"]) if (ctlEls[k]){ ctlEls[k].inp.disabled=!!D; ctlEls[k].row.classList.toggle("off",!!D); }
  if (!D){ info.textContent="Set by eye: amount, size and how grain follows tone are chosen to look right, not measured."; return; }
  if (![...gg.options].some(o=>+o.value===base.gGauge)){ const o=document.createElement("option"); o.value=base.gGauge; o.textContent=`${base.gGauge} mm wide`; gg.appendChild(o); }
  gg.value=base.gGauge;
  const own=Math.abs(base.gGauge-D.g)<0.01, ratio=D.g/base.gGauge;
  info.textContent=`Measured: ${D.src} datasheet granularity (green layer ≈ ${(D.mid[1]).toFixed(3)} stop at a 48 µm spot, mid grey). Amount 1 = as measured; shadows and highlights follow the datasheet. `+
    (own?`Shot on its own gauge.`:`Moved to a ${ratio>1?"smaller":"larger"} gauge: the frame is ${base.gGauge} mm wide instead of ${D.g}, so each grain is ${ratio>1?ratio.toFixed(1)+"× bigger":(1/ratio).toFixed(1)+"× smaller"} relative to the picture.`);
}
/* halation model: physical numbers in plain words */
function halSync(){
  const sel=$("halModel"), info=$("halInfo"); if (!sel) return;
  const ph=base.halPhys>0; sel.value=ph?"1":"0";
  if (ctlEls.halThr){ ctlEls.halThr.inp.disabled=ph; ctlEls.halThr.row.classList.toggle("off",ph); }
  if (ctlEls.halClip){ ctlEls.halClip.inp.disabled=!ph; ctlEls.halClip.row.classList.toggle("off",!ph); }
  if (!ph){ info.textContent="By eye: only light above the threshold glows, in a tint you pick. Not how film works, but easy to dial in."; return; }
  const t=0.06+0.2*base.halR, gauge=base.gGauge>0?base.gGauge:36;
  info.textContent=`Physical: ${(base.hal*10).toFixed(base.hal<0.1?1:0)} % of the light that crosses the film is reflected back by the base (≈10 % with no anti-halation backing, under 1 % with one). `+
    `Base ${t.toFixed(2)} mm thick, so halos reach about ${(1.8*t).toFixed(2)} mm on film, ${(1.8*t/gauge*100).toFixed(1)} % of a ${gauge} mm frame. `+
    `${base.halWarm>0.5?"Mostly the red-sensitive layer, nearest the base, catches it: red-orange halos.":base.halWarm>0.05?"Partly red: the bottom layer catches most of it.":"All layers alike: neutral, like black-and-white film."} No threshold: bright lights glow because they carry far more light. `+
    (base.halClip>0?`An 8-bit file clips every light at white; Clipped light restores ${base.halClip.toFixed(1)} stops there (×${Math.round(Math.pow(2,base.halClip))}) for halation and bloom only.`:`Clipped light is 0: lights clipped at white in an 8-bit file glow no more than white paper would.`);
}
function syncUI(){
  for (const k in ctlEls){ const {inp,out,p}=ctlEls[k]; inp.value=base[k]; out.textContent=fmtVal(p,base[k]); out.classList.toggle("over",isOver(p,base[k])); }
  grainSync(); halSync(); bwSync(); if (typeof bwSwitchSync==="function") try{ bwSwitchSync(); }catch(e){}
  $("mix").value=lookMix; $("mixOut").textContent=Math.round(lookMix*100)+"%";
  markChanged();
}
function buildPresetSelect(){
  const sel=$("preset"); sel.innerHTML="";
  const g1=document.createElement("optgroup"); g1.label="Film stocks";
  for (const n in PRESETS){ const o=document.createElement("option"); o.value="p:"+n; o.textContent=n; g1.appendChild(o); }
  sel.appendChild(g1);
  const names=Object.keys(userLooks);
  if (names.length){ const g2=document.createElement("optgroup"); g2.label="My looks"; for (const n of names){ const o=document.createElement("option"); o.value="u:"+n; o.textContent=n; g2.appendChild(o);} sel.appendChild(g2); }
  sel.value = (userLooks[presetName] && !PRESETS[presetName] ? "u:" : "p:")+presetName;
  $("btnDelLook").disabled = !sel.value.startsWith("u:");
}
function applyPreset(name, isUser){
  presetName=name;
  const src = isUser ? userLooks[name] : PRESETS[name];
  presetVals = Object.assign({}, DEF, src||{});
  gsName=""; const gss=document.getElementById("grainStock"); if (gss) gss.value="";
  base = Object.assign({}, presetVals);
  if (base.bw>0) bypass.bw=false;   /* a B&W look switches B&W on */
  syncUI(); schedule();
  $("btnDelLook").disabled = !isUser;
}
/* Section switches (bypass, like disabling a node): a section that is off renders at its neutral values,
   in the viewer and in exports (what you see is what you export). Not saved in looks. Development's switch
   bypasses its tone sliders only; the format crop stays so the frame doesn't jump. */
const bypass={};
function effective(){
  const e=Object.assign({}, base);
  for (const k of MIXABLE) e[k] = DEF[k] + (base[k]-DEF[k])*lookMix;
  for (const g of GROUPS) if (bypass[g.id]) for (const p of g.params) if (!NONMIX.includes(p[0])) e[p[0]]=DEF[p[0]];
  if (bypass.color) e.lutMix=0;
  return e;
}
function makeSwitch(id, sum, det){
  const b=document.createElement("button"); b.className="byp"; b.setAttribute("role","switch"); b.setAttribute("aria-checked","true");
  b.title="Turn this section off to compare (also off in exports)"; b.setAttribute("aria-label","Turn section on or off");
  b.addEventListener("click",ev=>{ ev.preventDefault(); ev.stopPropagation(); if (id==="bw") bwToggle(); else setBypass(id,!bypass[id]); });
  sum.classList.add("hasbyp"); sum.appendChild(b); bypassEls[id]={b,det};
}
const bypassEls={};
function setBypass(id,off){ bypass[id]=!!off; const x=bypassEls[id]; if (x){ x.b.setAttribute("aria-checked", off?"false":"true"); x.det.classList.toggle("bypassed",!!off); } bwSwitchSync(); schedule(); }
/* Black & white's switch means "B&W on": off when the amount is 0 or the section is bypassed. Turning it on from 0
   sets the amount to 1 (with whatever film and filter are set); turning it off keeps the settings for next time. */
function bwSwitchSync(){ const x=bypassEls.bw; if (!x) return; const on=!bypass.bw && base.bw>0; x.b.setAttribute("aria-checked",on?"true":"false"); x.det.classList.toggle("bypassed",!on);
  x.b.title=on?"Black & white is on (also in exports). Click for colour.":"Click to turn black & white on"; }
function bwToggle(){ const on=!bypass.bw && base.bw>0; if (on){ setBypass("bw",true); return; } if (!(base.bw>0)) base.bw=1; bypass.bw=false; syncUI(); setBypass("bw",false); }


/* Virtual slider on the value: drag left / right on the number (Shift = fine). Some values go past the slider's
   range (EXT); the number turns orange when it does, and the slider waits at its end. Hues wrap around. */
const EXT={exp:[-6,6],dShadows:[-6,6],dMid:[-6,6],dHigh:[-6,6],temp:[-2,2],tint:[-2,2],con:[-2,2],sat:[0,3],hal:[0,3],bloom:[0,3],grain:[0,4],grainSize:[0.3,8],ca:[0,4]};
function scrubOut(out,p,get,set){
  const [k,,mn,mx,st]=p, lim=EXT[k]||[mn,mx], hue=/Hue$/.test(k); let s=null;
  out.classList.add("scrub"); out.title=(EXT[k]?`Drag to change, beyond the slider (${lim[0]} to ${lim[1]})`:"Drag to change")+" · Shift for fine · double-click to reset";
  out.addEventListener("pointerdown",ev=>{ if (ev.pointerType==="mouse" && ev.button!==0) return; s={x:ev.clientX,v:get(),moved:false}; try{ out.setPointerCapture(ev.pointerId); }catch(e){} ev.preventDefault(); });
  out.addEventListener("pointermove",ev=>{ if (!s) return; const dx=ev.clientX-s.x; if (!s.moved && Math.abs(dx)<3) return; s.moved=true;
    let v=s.v+dx*(mx-mn)/250*(ev.shiftKey?0.1:1); v=Math.round(v/st)*st; v=hue?((v%360)+360)%360:Math.min(lim[1],Math.max(lim[0],v)); set(+v.toFixed(4)); });
  const end=()=>{ if (s&&s.moved) out.dataset.dragged=String(Date.now()); s=null; };
  out.addEventListener("pointerup",end); out.addEventListener("pointercancel",end);
}
const isOver=(p,v)=>v<p[2]-1e-9||v>p[3]+1e-9;
