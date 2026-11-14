/* Ernest Lab · js/10-boot.js · panel start-up, install button, guide.
   Classic script (not a module): files load in order from index.html and share one global scope. */
"use strict";
/* ---------------- Boot ---------------- */
buildDevelop(); buildExrRows(); buildRack(); buildPresetSelect(); applyPreset(presetName,false); $("preset").value="p:"+presetName;
/* Install: a real Install button where the browser offers one (Chromium: beforeinstallprompt);
   otherwise the per-platform steps in the guide. Shows when already running as the installed app. */
let installEvt=null;
const isStandalone=()=> (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone===true;
function syncInstallUI(){
  const st=$("installState"), row=$("installRow");
  if (isStandalone()){ st.textContent="✓ You're using the installed app."; st.hidden=false; row.hidden=true; return; }
  st.hidden=true; row.hidden=!installEvt;
}
window.addEventListener("beforeinstallprompt",ev=>{ ev.preventDefault(); installEvt=ev; syncInstallUI(); });
window.addEventListener("appinstalled",()=>{ installEvt=null; syncInstallUI(); toast("Installed. Open Ernest Lab from its new icon."); });
$("btnInstall").addEventListener("click",async()=>{ if(!installEvt) return; installEvt.prompt(); try{ await installEvt.userChoice; }catch(e){} installEvt=null; syncInstallUI(); });
syncInstallUI();
/* Guide: "?" button, the ? key, and a one-time hint on the first visit. */
function openGuide(){ $("guideModal").classList.add("open"); try{ localStorage.setItem("filmlab.guideSeen","1"); }catch(e){} }
$("btnGuide").addEventListener("click",openGuide);
$("btnCloseGuide").addEventListener("click",()=>$("guideModal").classList.remove("open"));
$("guideModal").addEventListener("click",ev=>{ if (ev.target.id==="guideModal") ev.currentTarget.classList.remove("open"); });
(function firstVisit(){ let seen=false; try{ seen=!!localStorage.getItem("filmlab.guideSeen"); }catch(e){}
  if (!seen) setTimeout(()=>toast(isPhone()?"New here? Tap ⋯ → Guide & install for a quick tour.":"New here? Press ? or the ? next to the title for a quick guide.",6000),1200); })();


