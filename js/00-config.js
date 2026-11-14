/* Ernest Lab · js/00-config.js · version, support link, PWA registration, About.
   Classic script (not a module): files load in order from index.html and share one global scope. */
"use strict";
const APP_VERSION="0.10.0";
/* Grain size is relative to the frame, like film: Size 1 = one pixel on a frame whose short side is GRAIN_REF px
   (a 12 MP 4:3 photo), and scales with the frame so any camera / export size gets the same grain. */
const GRAIN_REF=3000;
document.getElementById("ver").textContent="v"+APP_VERSION;
/* Support link (Buy Me a Coffee). Hidden while empty. */
const SUPPORT_URL="https://buymeacoffee.com/ernestdios";
/* Problem reports go to GitHub issues, pre-filled with technical details (never file names or images). */
const REPO_URL="https://github.com/ErnestDios/ErnestLab";
/* Installable app + offline (PWA): only when hosted (https or localhost), not as a local file or inside claude.ai. */
(function pwa(){
  const hosted = location.protocol==="https:" || location.hostname==="localhost" || location.hostname==="127.0.0.1";
  if (!hosted || window.claude) return;
  const add=(rel,href,extra)=>{ const l=document.createElement("link"); l.rel=rel; l.href=href; if(extra) Object.assign(l,extra); document.head.appendChild(l); };
  add("manifest","manifest.webmanifest"); add("icon","icons/icon-192.png",{type:"image/png"}); add("apple-touch-icon","icons/apple-touch-icon.png");
  const m=document.createElement("meta"); m.name="theme-color"; m.content="#171513"; document.head.appendChild(m);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
})();
if (SUPPORT_URL){ for (const id of ["support","aboutSupport"]){ const a=document.getElementById(id); a.href=SUPPORT_URL; a.hidden=false; } }
document.getElementById("aboutVer").textContent="v"+APP_VERSION;
document.getElementById("ver").addEventListener("click",()=>document.getElementById("aboutModal").classList.add("open"));
document.getElementById("btnCloseAbout").addEventListener("click",()=>document.getElementById("aboutModal").classList.remove("open"));
document.getElementById("aboutModal").addEventListener("click",ev=>{ if (ev.target.id==="aboutModal") ev.currentTarget.classList.remove("open"); });
