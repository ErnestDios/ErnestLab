/* Ernest Lab · js/08-output.js · export, LUT in / out, looks and JSON, share / copy, clear session.
   Classic script (not a module): files load in order from index.html and share one global scope. */
"use strict";
/* ---------------- Export ---------------- */
let downloads=null;
(async()=>{ try{ if (window.claude && window.claude.use){ downloads=await window.claude.use("downloads"); } }catch(e){ downloads=null; } })();

function renderToBlob(type,q){ return new Promise(res=>{ renderClean=true; render(); canvas.toBlob(b=>{ renderClean=false; render(); res(b); }, type, q); }); }
async function offer(filename, blob){
  if (downloads){
    try{ await downloads.save({filename, data:blob}); toast("Saved "+filename); return; }
    catch(err){ if (err && err.code==="declined"){ toast("Save cancelled."); return; } if (err && err.code==="rate_limited"){ toast("A save prompt is already open. Finish it, then try again."); return; } }
  }
  // Standalone (opened from disk or a normal web host): regular browser download.
  if (!window.claude){
    const url=URL.createObjectURL(blob), a=document.createElement("a");
    a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000); toast("Saved "+filename); return;
  }
  if (blob.type.startsWith("image/")){ $("saveImg").src=URL.createObjectURL(blob); $("saveModal").classList.add("open"); }
  else toast("Downloads are not available in this view. Open this page on claude.ai to save files.",4200);
}
function fmtInfo(){ return $("fmt").value==="png" ? ["image/png",undefined,"png"] : ["image/jpeg",0.95,"jpg"]; }
function slug(s){ return s.replace(/[^\w\-· ]+/g,"").replace(/[\s·]+/g,"_").replace(/_+/g,"_").slice(0,40); }
$("btnExport").addEventListener("click", async()=>{
  if (cur<0) return; if (items[cur].video){ exportVideo(items[cur]); return; } const [t,q,ext]=fmtInfo();
  const b=await renderToBlob(t,q); await offer(`${items[cur].name}_${slug(presetName)}.${ext}`, b);
});
$("btnExportAll").addEventListener("click", async()=>{
  const real=items.filter(it=>!it.sample && !it.video); if (!real.length){ toast(items.some(it=>it.video)?"Export all bundles stills; export each video on its own.":"Add your stills first."); return; }
  const btn=$("btnExportAll"); btn.disabled=true; const keep=cur; const [t,q,ext]=fmtInfo(); const files=[];
  try{
    for (let i=0;i<items.length;i++){ if (items[i].sample || items[i].video) continue; btn.textContent=`Rendering ${files.length+1}/${real.length}…`; cur=i; if (!(await ensureSource(i))) continue; const b=await renderToBlob(t,q); files.push({name:`${items[i].name}_${slug(presetName)}.${ext}`, data:new Uint8Array(await b.arrayBuffer())}); }
    const lj=lookJSON(); const dv={}; for (const it of items) if (!it.sample && it.dev && devActive(it.dev)) dv[it.name]=it.dev;
    if (Object.keys(dv).length) lj.development=dv;   /* per-image source prep, for the record (not loaded as part of the look) */
    files.push({name:"look.json", data:new TextEncoder().encode(JSON.stringify(lj,null,2))});
    btn.textContent="Zipping…"; const zip=makeZip(files);
    await offer(`ernest_lab_${slug(presetName)}.zip`, new Blob([zip],{type:"application/zip"}));
  } finally { btn.disabled=false; btn.textContent="Export all (.zip)"; select(keep); }
});

/* store-only zip */
const CRC=(()=>{ const t=new Uint32Array(256); for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=c&1?0xEDB88320^(c>>>1):c>>>1; t[n]=c>>>0; } return t; })();
function crc32(d){ let c=0xFFFFFFFF; for(let i=0;i<d.length;i++) c=CRC[(c^d[i])&255]^(c>>>8); return (c^0xFFFFFFFF)>>>0; }
function makeZip(files){
  const enc=new TextEncoder(); const parts=[]; const central=[]; let off=0;
  for (const f of files){
    const nm=enc.encode(f.name), crc=crc32(f.data), sz=f.data.length;
    const lh=new DataView(new ArrayBuffer(30));
    lh.setUint32(0,0x04034b50,true); lh.setUint16(4,20,true); lh.setUint16(6,0x0800,true); lh.setUint16(8,0,true);
    lh.setUint16(10,0,true); lh.setUint16(12,0x21,true); lh.setUint32(14,crc,true); lh.setUint32(18,sz,true); lh.setUint32(22,sz,true);
    lh.setUint16(26,nm.length,true); lh.setUint16(28,0,true);
    parts.push(new Uint8Array(lh.buffer),nm,f.data);
    const ch=new DataView(new ArrayBuffer(46));
    ch.setUint32(0,0x02014b50,true); ch.setUint16(4,20,true); ch.setUint16(6,20,true); ch.setUint16(8,0x0800,true); ch.setUint16(10,0,true);
    ch.setUint16(12,0,true); ch.setUint16(14,0x21,true); ch.setUint32(16,crc,true); ch.setUint32(20,sz,true); ch.setUint32(24,sz,true);
    ch.setUint16(28,nm.length,true); ch.setUint32(42,off,true);
    central.push(new Uint8Array(ch.buffer),nm);
    off+=30+nm.length+sz;
  }
  const csz=central.reduce((a,p)=>a+p.length,0);
  const end=new DataView(new ArrayBuffer(22)); end.setUint32(0,0x06054b50,true); end.setUint16(8,files.length,true); end.setUint16(10,files.length,true); end.setUint32(12,csz,true); end.setUint32(16,off,true);
  return new Blob([...parts,...central,new Uint8Array(end.buffer)],{type:"application/zip"});
}

/* ---------------- LUT in / out ---------------- */
function parseCube(text){
  let size=0; const vals=[];
  for (const raw of text.split(/\r?\n/)){
    const line=raw.trim(); if(!line||line[0]==="#") continue;
    if (/^LUT_3D_SIZE/i.test(line)){ size=parseInt(line.split(/\s+/)[1]); continue; }
    if (/^[A-Z_]/i.test(line)) continue;
    const p=line.split(/\s+/).map(Number); if (p.length>=3 && p.every(n=>!isNaN(n))) vals.push(p[0],p[1],p[2]);
  }
  if (!size || vals.length!==size*size*size*3) throw new Error("not a 3D .cube");
  return {size, data:new Float32Array(vals)};
}
$("btnLut").addEventListener("click",()=>$("lutIn").click());
$("lutIn").addEventListener("change", async ev=>{
  const f=ev.target.files[0]; if(!f) return; ev.target.value="";
  try{ const L=parseCube(await f.text()); if (lutTex) gl.deleteTexture(lutTex); lutTex=makeLutTex(L.size,L.data); lutSize=L.size; lut=f.name;
    $("lutNote").textContent=`Loaded ${f.name} (${L.size}-point). It runs after the film curve and colour, blended by "External LUT". The exported .cube includes it.`; markChanged(); schedule(); toast("LUT loaded: "+f.name);
  }catch(e){ toast("That file is not a 3D .cube LUT (1D LUTs are not supported)."); }
});
async function buildCube(N=33){
  const data=new Float32Array(N*N*N*4);
  for(let b=0;b<N;b++) for(let g=0;g<N;g++) for(let r=0;r<N;r++){ const x=r+b*N, y=g; const i=(y*N*N+x)*4; data[i]=r/(N-1); data[i+1]=g/(N-1); data[i+2]=b/(N-1); data[i+3]=1; }
  const W=N*N, H=N;
  const src=mkTex(W,H,gl.RGBA32F,gl.RGBA,gl.FLOAT,data,gl.NEAREST);
  const ifmt=hasFloat?gl.RGBA32F:gl.RGBA8;
  const out=mkTex(W,H,ifmt,gl.RGBA,hasFloat?gl.FLOAT:gl.UNSIGNED_BYTE,null,gl.NEAREST);
  const fb=gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER,fb); gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,out,0);
  gl.viewport(0,0,W,H); gl.useProgram(P.grade.p); const u=P.grade.u;
  bindTex(0,src); gl.uniform1i(u.uSrc,0); gl.uniform1i(u.uInXfer,0); setGradeUniforms(u,effective());
  gl.drawArrays(gl.TRIANGLES,0,3);
  let px; if (hasFloat){ px=new Float32Array(W*H*4); gl.readPixels(0,0,W,H,gl.RGBA,gl.FLOAT,px); } else { const b=new Uint8Array(W*H*4); gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,b); px=Float32Array.from(b,v=>v/255); }
  gl.deleteFramebuffer(fb); gl.deleteTexture(src); gl.deleteTexture(out);
  let s=`TITLE "Ernest Lab - ${presetName.replace(/"/g,"")}"\n# Display-referred Rec.709/sRGB in and out. Colour only: no grain, halation or lens effects.\nLUT_3D_SIZE ${N}\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n`;
  for(let b=0;b<N;b++) for(let g=0;g<N;g++) for(let r=0;r<N;r++){ const i=(g*W+(r+b*N))*4; s+=`${px[i].toFixed(6)} ${px[i+1].toFixed(6)} ${px[i+2].toFixed(6)}\n`; }
  schedule(); return s;
}
$("btnCube").addEventListener("click", async()=>{
  const txt=await buildCube(33); const name=`ErnestLab_${slug(presetName)}`;
  const zip=makeZip([{name:name+".cube",data:new TextEncoder().encode(txt)},{name:"look.json",data:new TextEncoder().encode(JSON.stringify(lookJSON(),null,2))}]);
  await offer(name+"_cube.zip", zip);
});

/* ---------------- Looks / JSON ---------------- */
/* look.json format: 1 = v0.1 (no "format" field), 2 = v0.2 (scene-linear working space),
   3 = v0.3 (emulsion grain layers: gAmt*, gSize*, gClump*; older files get the colour-negative defaults).
   The slider values mean the same in both, so format 1 loads unchanged. Future changes migrate here. */
const LOOK_FORMAT=3;
function migrateLook(j){ const f=+j.format||1; if (f>LOOK_FORMAT) toast("This look was saved by a newer Ernest Lab; some settings may be ignored.",4000); return j; }
function lookJSON(){ return {app:"Ernest Lab", appVersion:APP_VERSION, format:LOOK_FORMAT, name:presetName, base:presetName, strength:lookMix, values:Object.fromEntries(Object.keys(DEF).map(k=>[k,+(+base[k]).toFixed(4)]))}; }
$("preset").addEventListener("change",ev=>{ const v=ev.target.value; applyPreset(v.slice(2), v.startsWith("u:")); });
$("mix").addEventListener("input",ev=>{ lookMix=+ev.target.value; $("mixOut").textContent=Math.round(lookMix*100)+"%"; schedule(); });
$("btnReset").addEventListener("click",()=>{ base=Object.assign({},presetVals); lookMix=1; syncUI(); schedule(); });
$("btnSaveLook").addEventListener("click",()=>{
  const n=$("lookName").value.trim(); if(!n){ toast("Type a name for the look first."); $("lookName").focus(); return; }
  userLooks[n]=Object.assign({},base); saveUserLooks(); presetName=n; presetVals=Object.assign({},base); buildPresetSelect(); $("preset").value="u:"+n; $("btnDelLook").disabled=false; $("lookName").value=""; markChanged(); toast(`Saved look "${n}" in this browser.`);
});
$("btnDelLook").addEventListener("click",()=>{ const v=$("preset").value; if(!v.startsWith("u:")) return; delete userLooks[v.slice(2)]; saveUserLooks(); buildPresetSelect(); applyPreset(DEFAULT_LOOK,false); $("preset").value="p:"+DEFAULT_LOOK; toast("Look deleted."); });
$("btnJson").addEventListener("click",()=>{ $("jsonText").value=JSON.stringify(lookJSON(),null,2); $("jsonModal").classList.add("open"); });
$("btnCloseJson").addEventListener("click",()=>$("jsonModal").classList.remove("open"));
$("btnCloseSave").addEventListener("click",()=>$("saveModal").classList.remove("open"));
$("btnCopyJson").addEventListener("click",async()=>{ try{ await navigator.clipboard.writeText($("jsonText").value); toast("Copied."); }catch(e){ $("jsonText").select(); toast("Select the text and copy it with Ctrl/Cmd+C."); } });
$("btnApplyJson").addEventListener("click",()=>{
  try{ const j=migrateLook(JSON.parse($("jsonText").value)); const v=j.values||j; for(const k in DEF) if (typeof v[k]==="number") base[k]=v[k]; if (typeof j.strength==="number") lookMix=j.strength; syncUI(); schedule(); $("jsonModal").classList.remove("open"); toast("Look applied."); }
  catch(e){ toast("That text is not valid look JSON."); }
});
/* Load look(s) from .json files: applies the look and adds it to "My looks" in this browser. */
function lookNameFor(j, fileName){
  let n=(typeof j.name==="string"&&j.name.trim()) || "";
  const stem=fileName.replace(/\.json$/i,"").trim();
  if (!n) n = (stem && stem.toLowerCase()!=="look") ? stem : ((typeof j.base==="string"&&j.base.trim()) || "Imported look");
  if (PRESETS[n]) n += " (imported)";
  return n;
}
async function loadLookFiles(files){
  let last=null, ok=0, bad=[];
  for (const f of files){
    try{
      const parsed=JSON.parse(await f.text()); if (parsed && parsed.type==="profile"){ const n=importProfile(parsed,f.name); if (n){ toast(`Loaded profile "${n}" and applied it to this still.`); continue; } }
      const j=migrateLook(parsed); const v=(j&&typeof j.values==="object"&&j.values)||j;
      const vals={}; let hits=0;
      for (const k in DEF) if (typeof v[k]==="number" && isFinite(v[k])){ vals[k]=v[k]; hits++; }
      if (!hits) throw new Error("no values");
      const n=lookNameFor(j,f.name);
      userLooks[n]=Object.assign({},DEF,vals); last={n, strength:(typeof j.strength==="number"?Math.min(1,Math.max(0,j.strength)):1)}; ok++;
    }catch(e){ bad.push(f.name); }
  }
  if (ok){
    saveUserLooks(); applyPreset(last.n,true); lookMix=last.strength; syncUI(); schedule(); buildPresetSelect(); $("preset").value="u:"+last.n; $("btnDelLook").disabled=false;
    toast(ok===1 ? `Loaded look "${last.n}" and added it to My looks.` : `Loaded ${ok} looks into My looks; showing "${last.n}".`);
  }
  if (bad.length) toast((ok?`Loaded ${ok}. `:"")+`${bad.join(", ")} ${bad.length===1?"is":"are"} not an Ernest Lab look file.`, 4000);
}
const isJsonFile=f=>/\.json$/i.test(f.name)||f.type==="application/json";
function handleDropped(fileList){
  const all=[...fileList], looks=all.filter(isJsonFile), imgs=all.filter(f=>!isJsonFile(f));
  if (looks.length) loadLookFiles(looks);
  if (imgs.length || !looks.length) addFiles(imgs);
}
$("btnLoadLook").addEventListener("click",()=>$("lookIn").click());
$("lookIn").addEventListener("change",ev=>{ loadLookFiles([...ev.target.files]); ev.target.value=""; });

/* ---------------- Share / copy ----------------
   No direct posting: images never leave the device. Share hands the finished image to the OS share menu
   (Web Share API; on phones this lists Instagram, WhatsApp, TikTok…). Copy puts a PNG on the clipboard for
   pasting into web composers. Each button only shows where the browser supports it; inside the claude.ai
   preview (a sandboxed frame) they usually don't. */
let editStamp=0, shareCache=null;
function shareName(ext){ return `${items[cur].name}_${slug(presetName)}.${ext}`; }
(function initShare(){
  let canFiles=false;
  try{ canFiles = !!(navigator.canShare && navigator.share && navigator.canShare({files:[new File([new Uint8Array(1)],"t.jpg",{type:"image/jpeg"})]})); }catch(e){}
  $("btnShare").hidden=!canFiles;
  $("btnCopy").hidden=!(navigator.clipboard && navigator.clipboard.write && window.ClipboardItem && window.isSecureContext);
})();
$("btnShare").addEventListener("click", async()=>{
  if (cur<0) return; const [t,q,ext]=fmtInfo();
  try{
    /* Some browsers (Safari) only allow sharing right after the tap: reuse a render made for the same edit. */
    if (!shareCache || shareCache.stamp!==editStamp || shareCache.type!==t){ shareCache={stamp:editStamp,type:t,file:new File([await renderToBlob(t,q)], shareName(ext), {type:t})}; }
    await navigator.share({files:[shareCache.file], title:"Ernest Lab"});
  }catch(err){
    if (err && err.name==="AbortError") return;
    if (err && err.name==="NotAllowedError") { toast("Ready — tap Share again to open the share menu."); return; }
    toast("Sharing isn't available here. Use Export or Copy image instead.",3600);
  }
});
$("btnCopy").addEventListener("click", async()=>{
  if (cur<0) return;
  try{
    await navigator.clipboard.write([new ClipboardItem({"image/png": renderToBlob("image/png")})]);   /* promise keeps the tap's permission in Safari */
    toast("Image copied — paste it into your post.");
  }catch(err){ toast("Copying images isn't allowed here. Use Export instead.",3600); }
});

/* ---------------- Clear session ---------------- */
const LUT_NOTE0=$("lutNote").textContent;
async function clearSession(){
  for (const it of items.splice(0)){ if (it.url && !it.sample) URL.revokeObjectURL(it.url); vidRelease(it); try{ it.bmp&&it.bmp.close&&it.bmp.close(); }catch(e){} }
  srcItem=null;
  cur=-1;
  if (lutTex){ gl.deleteTexture(lutTex); lutTex=null; } lut=null; lutSize=2; $("lutNote").textContent=LUT_NOTE0;
  for (const id in bypass) if (bypass[id]) setBypass(id,false);
  compare=false; split=-1; showOrig=false; clickOrig=false; $("btnCompare").classList.remove("on"); view.classList.remove("cmp"); if (viewChan) setChan(viewChan); updateBadge();
  const d=DEFAULT_LOOK; applyPreset(d,false); lookMix=1; buildPresetSelect(); $("preset").value="p:"+d; $("lookName").value="";
  syncUI(); await makeSample(); schedule();
  toast("Session cleared. Saved looks are still in My looks.");
}
{ const b=$("btnClear"); let armed=0;
  b.addEventListener("click",()=>{
    if (!armed){ armed=setTimeout(()=>{ armed=0; b.textContent="Clear session"; b.classList.remove("danger"); },3000); b.textContent="Click again to clear"; b.classList.add("danger"); return; }
    clearTimeout(armed); armed=0; b.textContent="Clear session"; b.classList.remove("danger"); clearSession();
  });
}

