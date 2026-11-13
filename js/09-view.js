/* Ernest Lab · js/09-view.js · viewer interactions, channels, before / after, resizable panel.
   Classic script (not a module): files load in order from index.html and share one global scope. */
"use strict";
/* ---------------- View interactions ---------------- */
const view=$("view");
$("btnAdd").addEventListener("click",()=>$("fileIn").click());
$("fileIn").addEventListener("change",ev=>{ addFiles(ev.target.files); ev.target.value=""; });
view.addEventListener("dragover",ev=>{ ev.preventDefault(); view.classList.add("dragging"); });
view.addEventListener("dragleave",ev=>{ if (ev.target===view) view.classList.remove("dragging"); });
view.addEventListener("drop",ev=>{ ev.preventDefault(); view.classList.remove("dragging"); handleDropped(ev.dataTransfer.files); });
document.addEventListener("dragover",ev=>ev.preventDefault()); document.addEventListener("drop",ev=>{ ev.preventDefault(); if(!view.contains(ev.target)) handleDropped(ev.dataTransfer.files); });
$("btnZoom").addEventListener("click",()=>zoomToggle());
$("btnCompare").addEventListener("click",()=>{ compare=!compare; if (compare && split<0) split=0.5; if (compare){ clickOrig=false; showOrig=false; } $("btnCompare").classList.toggle("on",compare); view.classList.toggle("cmp",compare); updateBadge(); schedule(); });
function setSplit(ev){ const r=canvas.getBoundingClientRect(); split=Math.min(1,Math.max(0,(ev.clientX-r.left)/r.width)); schedule(); }
let dragging=false;
let clickOrig=false;
function updateBadge(){ const b=$("badge"); const orig=showOrig||clickOrig; b.textContent=(compare?"Original | Film":orig?"Original":"Film")+(viewChan?" · "+["","Red","Green","Blue","Luma"][viewChan]:""); b.classList.toggle("orig",orig&&!compare); }
/* Channel view (Nuke-style): R/G/B/L show that channel in greyscale; the same key again goes back to RGB. */
function setChan(c){ viewChan = (c===viewChan) ? 0 : c; document.querySelectorAll(".chan").forEach(x=>x.classList.toggle("on", +x.dataset.ch===viewChan)); updateBadge(); schedule(); }
document.querySelectorAll(".chan").forEach(x=>x.addEventListener("click",()=>setChan(+x.dataset.ch)));
document.addEventListener("keydown",ev=>{
  if (ev.ctrlKey||ev.metaKey||ev.altKey||ev.repeat) return;
  if (ev.key==="?" && !document.querySelector(".modal.open")){ ev.preventDefault(); openGuide(); return; }
  if (document.querySelector(".modal.open") && ev.code!=="Escape") return;
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && document.activeElement.type!=="range") return;
  const c={KeyR:1,KeyG:2,KeyB:3,KeyL:4}[ev.code]; if (c){ ev.preventDefault(); setChan(c); }
  else if (ev.code==="Escape"){ const m=document.querySelector(".modal.open"); if (m) m.classList.remove("open"); else if (viewChan) setChan(viewChan); }
});
canvas.addEventListener("pointerdown",ev=>{ if(!compare || ev.button===1 || ev.altKey) return; dragging=true; canvas.setPointerCapture(ev.pointerId); setSplit(ev); });
canvas.addEventListener("pointermove",ev=>{ if(dragging) setSplit(ev); });
canvas.addEventListener("pointerup",()=>dragging=false);
canvas.addEventListener("click",()=>{ if (held||gestured){ held=false; gestured=false; return; } if (compare) return; clickOrig=!clickOrig; showOrig=clickOrig; updateBadge(); schedule(); });
document.addEventListener("keydown",ev=>{ if (ev.code==="Space" && !/INPUT|TEXTAREA|SELECT|BUTTON/.test(document.activeElement.tagName)){ ev.preventDefault(); if(!showOrig){ showOrig=true; updateBadge(); schedule(); } } });
document.addEventListener("keyup",ev=>{ if (ev.code==="Space" && showOrig){ showOrig=clickOrig; updateBadge(); schedule(); } });

/* ---------------- Resizable panel ---------------- */
(function(){
  const rz=$("resizer"); const minW=280;
  const maxW=()=>Math.max(minW, Math.floor(window.innerWidth*0.75));
  function setW(w,save=true){ w=Math.round(Math.min(maxW(),Math.max(minW,w))); document.body.style.setProperty("--rack-w",w+"px"); rz.setAttribute("aria-valuenow",w); if(save){ try{ localStorage.setItem("filmlab.rackW",w); }catch(e){} } }
  let saved=340; try{ saved=+localStorage.getItem("filmlab.rackW")||340; }catch(e){}
  setW(saved,false);
  let drag=false;
  rz.addEventListener("pointerdown",ev=>{ drag=true; rz.classList.add("active"); rz.setPointerCapture(ev.pointerId); ev.preventDefault(); });
  rz.addEventListener("pointermove",ev=>{ if(drag) setW(window.innerWidth-ev.clientX); });
  rz.addEventListener("pointerup",()=>{ drag=false; rz.classList.remove("active"); });
  rz.addEventListener("dblclick",()=>setW(340));
  rz.addEventListener("keydown",ev=>{ const cur=$("rack").getBoundingClientRect().width; if(ev.key==="ArrowLeft"){ setW(cur+20); ev.preventDefault(); } if(ev.key==="ArrowRight"){ setW(cur-20); ev.preventDefault(); } });
  window.addEventListener("resize",()=>{ const cur=$("rack").getBoundingClientRect().width; if(cur>maxW()) setW(maxW(),false); });
})();

