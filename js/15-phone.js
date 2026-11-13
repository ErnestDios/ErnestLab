/* Ernest Lab · js/15-phone.js · phone layout, gestures, the ... menu; its last lines start the app.
   Classic script (not a module): files load in order from index.html and share one global scope. */
"use strict";
/* ---------------- Phone layout (v0.5) ----------------
   body.m switches the CSS to the phone layout; data-tab picks which controls show. Every phone control
   drives the same desktop buttons, so there is one code path for state. */
const phoneMQ = matchMedia("(max-width: 820px), (pointer: coarse) and (max-height: 520px)");
function isPhone(){ return document.body.classList.contains("m"); }
const HINT_DESK="Click to flip original / film · hold Space to peek · scroll to zoom, drag to pan, double-click for 100% · R G B L channels", HINT_PHONE="Tap to flip · hold to peek at the original · pinch to zoom";
function applyPhone(){
  const m=phoneMQ.matches; document.body.classList.toggle("m",m);
  document.body.classList.toggle("land", m && innerWidth>innerHeight);
  $("hint").textContent = m ? HINT_PHONE : HINT_DESK;
  if (!m) closeMore();
}
function setTab(t){
  document.body.dataset.tab=t;
  document.querySelectorAll("#tabs button").forEach(b=>{ const on=b.dataset.t===t; b.classList.toggle("on",on); b.setAttribute("aria-selected",on); });
  $("rack").scrollTop=0; try{ localStorage.setItem("filmlab.tab",t); }catch(e){}
}
document.querySelectorAll("#tabs button").forEach(b=>b.addEventListener("click",()=>setTab(b.dataset.t)));
{ let t="look"; try{ t=localStorage.getItem("filmlab.tab")||t; }catch(e){} if (!document.querySelector(`#tabs [data-t="${t}"]`)) t="look"; setTab(t); }
/* a dot on a tab when something in it differs from neutral (same rule as the section ticks) */
function updTabDots(){ document.querySelectorAll("#tabs button").forEach(b=>b.classList.toggle("live", !!document.querySelector(`#rack [data-tab="${b.dataset.t}"] .tick.live`))); }
new MutationObserver(updTabDots).observe($("rack"),{subtree:true,attributes:true,attributeFilter:["class"]}); updTabDots();
/* mirror desktop buttons into their phone twins */
function mirror(src,fn){ new MutationObserver(fn).observe(src,{attributes:true,childList:true,characterData:true,subtree:true}); fn(); }
mirror($("btnCompare"),()=>$("mCompare").classList.toggle("on",$("btnCompare").classList.contains("on")));
mirror($("btnClear"),()=>{ const armed=$("btnClear").classList.contains("danger"); $("mClear").classList.toggle("danger",armed); $("mClear").firstElementChild.textContent=armed?"Tap again to clear":"Clear session"; });
$("mAdd").addEventListener("click",()=>$("fileIn").click());
$("mCompare").addEventListener("click",()=>$("btnCompare").click());
/* ⋯ menu */
function openMore(){ $("mMeta").textContent=$("meta").textContent; $("mVer").textContent="v"+APP_VERSION; $("moreMenu").classList.add("open"); $("mMore").setAttribute("aria-expanded","true"); }
function closeMore(){ $("moreMenu").classList.remove("open"); $("mMore").setAttribute("aria-expanded","false"); }
$("mMore").addEventListener("click",()=> $("moreMenu").classList.contains("open") ? closeMore() : openMore());
$("moreMenu").addEventListener("click",ev=>{ if (ev.target.id==="moreMenu" || ev.target.closest(".chan")) closeMore(); });
$("mZoom").addEventListener("click",()=>{ closeMore(); zoomToggle(); });
$("zoomChip").addEventListener("click",()=>{ vz=1; vcx=vcy=0.5; updZoomUI(); schedule(); });
/* pinch to zoom, drag to pan when zoomed (two fingers also pan); runs before the tap / split handlers */
let gestured=false; const ptrs=new Map(); let pinch=null, panS=null;
function imgUv(x,y){ const r=canvas.getBoundingClientRect(); const sx=(x-r.left)/r.width, sy=(y-r.top)/r.height; return [vcx+(sx-0.5)/vz, vcy-(sy-0.5)/vz]; }
function pinchState(){ const [a,b]=[...ptrs.values()]; return {d:Math.hypot(a.x-b.x,a.y-b.y)||1, mx:(a.x+b.x)/2, my:(a.y+b.y)/2}; }
canvas.addEventListener("pointerdown",ev=>{ if (ev.pointerType==="mouse" && ev.button!==0 && ev.button!==1) return; ptrs.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
  if (ptrs.size===2){ clearTimeout(holdT); dragging=false; gestured=true; const p=pinchState(); pinch={d0:p.d, z0:vz, uv:imgUv(p.mx,p.my)}; panS=null; }
  else if (ptrs.size===1){ gestured=false; pinch=null; panS={x:ev.clientX,y:ev.clientY,cx:vcx,cy:vcy,moved:false}; } },{capture:true});
canvas.addEventListener("pointermove",ev=>{ if (!ptrs.has(ev.pointerId)) return; ptrs.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
  const r=canvas.getBoundingClientRect();
  if (pinch && ptrs.size>=2){ const p=pinchState(); vz=pinch.z0*p.d/pinch.d0; clampView();
    vcx=pinch.uv[0]-((p.mx-r.left)/r.width-0.5)/vz; vcy=pinch.uv[1]+((p.my-r.top)/r.height-0.5)/vz; clampView(); updZoomUI(); schedule(); return; }
  if (panS && (!compare || ev.buttons===4 || ev.altKey) && vz>1.001){ const dx=ev.clientX-panS.x, dy=ev.clientY-panS.y;   /* in before/after: pan with the middle button or Alt */
    if (!panS.moved && Math.hypot(dx,dy)>6){ panS.moved=true; gestured=true; clearTimeout(holdT); }
    if (panS.moved){ vcx=panS.cx-dx/(r.width*vz); vcy=panS.cy+dy/(r.height*vz); clampView(); schedule(); } } },{capture:true});
function ptrEnd(ev){ ptrs.delete(ev.pointerId); if (ptrs.size<2) pinch=null; if (!ptrs.size) panS=null; }
canvas.addEventListener("pointerup",ptrEnd,{capture:true}); canvas.addEventListener("pointercancel",ptrEnd,{capture:true});
canvas.addEventListener("gesturestart",ev=>ev.preventDefault());
/* desktop: wheel / trackpad pinch zooms around the cursor, double-click toggles Fit / 100% there */
$("view").addEventListener("wheel",ev=>{ if (!screenView()) return; ev.preventDefault();
  const d=ev.deltaY*(ev.deltaMode===1?16:ev.deltaMode===2?400:1), k=Math.exp(-d*(ev.ctrlKey?0.01:0.002)), r=canvas.getBoundingClientRect();
  zoomAt(vz*k, Math.min(r.right,Math.max(r.left,ev.clientX)), Math.min(r.bottom,Math.max(r.top,ev.clientY))); },{passive:false});
canvas.addEventListener("dblclick",ev=>{ if (compare) return; zoomToggle(ev.clientX,ev.clientY); });   /* its two clicks flip twice: back where it was */
document.addEventListener("keydown",ev=>{ if (ev.ctrlKey||ev.metaKey||ev.altKey||document.querySelector(".modal.open")) return; if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && document.activeElement.type!=="range") return;
  if (ev.key==="0"){ ev.preventDefault(); vz=1; vcx=vcy=0.5; updZoomUI(); schedule(); }
  else if (ev.key==="1"){ ev.preventDefault(); zoomAt(zoom100()); }
  else if (ev.key==="+"||ev.key==="="){ ev.preventDefault(); zoomAt(vz*1.25); }
  else if (ev.key==="-"||ev.key==="_"){ ev.preventDefault(); zoomAt(vz/1.25); } });
new ResizeObserver(()=>schedule()).observe($("view"));
$("mGuide").addEventListener("click",()=>{ closeMore(); openGuide(); });
$("mAbout").addEventListener("click",()=>{ closeMore(); $("ver").click(); });
$("mClear").addEventListener("click",()=>{ const armed=$("btnClear").classList.contains("danger"); $("btnClear").click(); if (armed) closeMore(); });
if (SUPPORT_URL){ $("mSupport").href=SUPPORT_URL; $("mSupport").hidden=false; $("mSupport").addEventListener("click",closeMore); }
document.addEventListener("keydown",ev=>{ if (ev.code==="Escape") closeMore(); });
/* touch and hold the photo to peek at the original (the phone's Space bar) */
let held=false, holdT=0;
canvas.addEventListener("pointerdown",ev=>{ if (ptrs.size>1) return; held=false; clearTimeout(holdT); $("hint").classList.add("gone"); if (compare || ev.pointerType==="mouse") return;
  holdT=setTimeout(()=>{ held=true; showOrig=true; updateBadge(); schedule(); },300); });
function endHold(){ clearTimeout(holdT); if (held){ showOrig=clickOrig; updateBadge(); schedule(); } }
canvas.addEventListener("pointerup",endHold);
canvas.addEventListener("pointercancel",()=>{ endHold(); held=false; });
canvas.addEventListener("contextmenu",ev=>{ if (isPhone()) ev.preventDefault(); });
/* tap a value to reset it (double-click is awkward on glass); tap a folded note to read it */
$("rack").addEventListener("click",ev=>{
  if (!isPhone()) return;
  const o=ev.target.closest(".ctl output"); if (o){ if (Date.now()-(+o.dataset.dragged||0)<500) return; o.dispatchEvent(new MouseEvent("dblclick",{bubbles:true})); return; }
  const n=ev.target.closest(".note"); if (n) n.classList.toggle("open");
});
phoneMQ.addEventListener ? phoneMQ.addEventListener("change",applyPhone) : phoneMQ.addListener(applyPhone);
$("toast").addEventListener("click",()=>{ $("toast").style.display="none"; });
addEventListener("resize",()=>document.body.classList.toggle("land", isPhone() && innerWidth>innerHeight));
applyPhone(); setupHelp();
{ let r=""; try{ const x=gl.getExtension("WEBGL_debug_renderer_info"); r=x?gl.getParameter(x.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER); }catch(e){}
  $("aboutGpu").textContent=`Graphics: ${r||"unknown"} · ${hasFloat?"16-bit float":"8-bit fallback"} pipeline · ${gl.getParameter(gl.MAX_TEXTURE_SIZE)} px max.`; }
setTimeout(()=>{ if (isPhone()) $("hint").classList.add("gone"); },7000);
makeSample();
