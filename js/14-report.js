/* Ernest Lab · js/14-report.js · Report a problem (pre-filled GitHub issue).
   Classic script (not a module): files load in order from index.html and share one global scope. */
"use strict";
/* ---------------- Report a problem (v0.8.1) ----------------
   Opens a new GitHub issue with what helps debugging: version, browser, graphics, layout and the features in use.
   No file names, no image data: a photo's name can be private. */
function reportInfo(){
  const it=items[cur], n=items.filter(x=>!x.sample).length, kinds=[...new Set(items.filter(x=>!x.sample).map(x=>x.video?"video":x.raw?"RAW":"image"))];
  const e=(typeof effective==="function")?effective():{};
  const on=[]; if (e.bw>0) on.push("black & white"); if (curDev && devActive(curDev())) on.push("development"); if (lut) on.push("external LUT"); if (compare) on.push("before/after"); if (viewChan) on.push("channel view");
  for (const g of ["hal","lens","grain"]) if (bypass[g]) on.push(g+" off");
  return [
    `- **Ernest Lab:** v${APP_VERSION} (${location.protocol==="file:"?"local file":location.host||"?"}${window.claude?", inside claude.ai":""}${(window.matchMedia&&matchMedia("(display-mode: standalone)").matches)||navigator.standalone?", installed app":""})`,
    `- **Browser:** ${navigator.userAgent}`,
    `- **Graphics:** ${($("aboutGpu").textContent||"unknown").replace(/^Graphics:\s*/,"")}`,
    `- **Screen:** ${innerWidth}×${innerHeight} @${(window.devicePixelRatio||1).toFixed(2)}x, ${document.body.classList.contains("m")?"phone layout":"desktop layout"}`,
    `- **Session:** ${n} file${n===1?"":"s"}${kinds.length?" ("+kinds.join(", ")+")":" (test still)"}; showing ${it?(it.video?"a video":it.raw?"a RAW":it.sample?"the test still":"an image")+(it.video||it.raw?"":"")+` ${srcW}×${srcH}`:"nothing"}`,
    `- **Look:** ${presetName}${lookMix<1?` at ${Math.round(lookMix*100)}%`:""}${on.length?"; "+on.join(", "):""}`,
  ].join("\n");
}
function reportURL(){
  const body=`### What happened\n\n\n### What you expected\n\n\n### Steps to reproduce\n1. \n\n<!-- A screenshot helps a lot: drag it into this box. -->\n\n---\n<details><summary>Technical details (filled in by Ernest Lab)</summary>\n\n${reportInfo()}\n\n</details>\n`;
  return `${REPO_URL}/issues/new?labels=bug&title=${encodeURIComponent("Problem: ")}&body=${encodeURIComponent(body)}`;
}
for (const id of ["aboutReport","guideReport","mReport"]){ const a=$(id); a.href=REPO_URL+"/issues/new"; a.addEventListener("click",()=>{ a.href=reportURL(); if (id==="mReport") closeMore(); }); }

