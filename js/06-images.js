/* Ernest Lab · js/06-images.js · the source image: upload, loading files, select / remove, the strip, the test still.
   Classic script (not a module): files load in order from index.html and share one global scope. */
"use strict";
/* ---------------- Images ---------------- */
const items=[]; let cur=-1, srcItem=null; let srcTex=null, srcW=0, srcH=0, srcXfer=0, srcMip=false;   /* srcXfer: 0 = sRGB-encoded 8-bit, 1 = scene-linear (RAW, later) */
function uploadSource(bmp,isRaw){
  srcItem=null; if (srcTex) gl.deleteTexture(srcTex);
  srcTex=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,srcTex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
  if (isRaw){ gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,bmp.W,bmp.H,0,gl.RGBA,gl.HALF_FLOAT,bmp.data); srcXfer=1; bmp={width:bmp.W,height:bmp.H}; }
  else { gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,bmp); srcXfer=0;
    if (bmp.videoWidth) bmp={width:bmp.videoWidth,height:bmp.videoHeight}; else if (bmp.displayWidth) bmp={width:bmp.displayWidth,height:bmp.displayHeight}; }
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  srcW=bmp.width; srcH=bmp.height; srcMip=false;
}


/* make item i the GPU source (decodes a RAW first). Returns false if it failed or was superseded. */
async function ensureSource(i){
  const it=items[i]; if (srcItem===it && srcTex) return true;
  if (it.video){ uploadSource(it.el); srcItem=it; vidAttach(it); return true; }
  if (!it.raw){ uploadSource(it.bmp); srcItem=it; vidAttach(null); return true; }
  vidAttach(null);
  const badge=$("badge"), old=badge.textContent; badge.textContent="Developing RAW…"; badge.classList.add("busy");
  try{ const r=await rawDecode(it); uploadSource(r,true); srcItem=it; return true; }
  catch(err){ console.error(err); toast(`Could not decode ${it.name}: ${String(err.message||err).slice(0,80)}`); return false; }
  finally{ badge.classList.remove("busy"); updateBadge(); }
}


async function addFiles(files){
  const list=[...files].filter(f=>RAW_EXT.test(f.name)||VID_EXT.test(f.name)||f.type.startsWith("video/")||f.type.startsWith("image/")||/\.(png|jpe?g|webp|tiff?|bmp|avif)$/i.test(f.name));
  if (!list.length){ toast("Ernest Lab reads JPEG, PNG, WebP, camera RAW, and MP4 / MOV / WebM video."); return; }
  let first=-1;
  for (const f of list){
    if (VID_EXT.test(f.name)||f.type.startsWith("video/")){
      try{ toast(`Opening ${f.name}…`,1500); items.push(await vidProbe(f)); if (first<0) first=items.length-1; }
      catch(err){ console.error(err); toast(String(err.message||err),4200); }
      continue;
    }
    if (RAW_EXT.test(f.name)){
      try{ toast(`Reading ${f.name}…`,1500); const it=await rawProbe(f); items.push(it); if (first<0) first=items.length-1; }
      catch(err){ console.error(err); toast(`Could not open ${f.name} as RAW.`); }
      continue;
    }
    try{
      let bmp=await createImageBitmap(f,{imageOrientation:"from-image",premultiplyAlpha:"none",colorSpaceConversion:"none"});
      if (bmp.width>MAXTEX||bmp.height>MAXTEX){ const s=MAXTEX/Math.max(bmp.width,bmp.height); bmp=await createImageBitmap(bmp,{resizeWidth:Math.floor(bmp.width*s),resizeHeight:Math.floor(bmp.height*s),resizeQuality:"high"}); toast(`${f.name} was scaled to ${bmp.width}×${bmp.height}, the largest this GPU handles.`); }
      items.push({name:f.name.replace(/\.[^.]+$/,""), bmp, url:URL.createObjectURL(f)});
      if (first<0) first=items.length-1;
    }catch(err){ toast(`Could not open ${f.name}.`); }
  }
  if (items.length && items[0].sample && items.length>1){ removeItem(0); first=Math.max(0,first-1); }
  buildStrip(); if (first>=0) select(first);
}
async function select(i){
  cur=i; editStamp++; syncDev(); buildStrip();
  if (!(await ensureSource(i)) || cur!==i) return;
  editStamp++; syncDev(); render();
}
function removeItem(i){
  const it=items[i]; if (it.url && !it.sample) URL.revokeObjectURL(it.url); vidRelease(it);
  items.splice(i,1);
  if (!items.length){ makeSample(); return; }
  if (cur>=items.length) cur=items.length-1;
}
function buildStrip(){
  const s=$("strip"); s.innerHTML="";
  items.forEach((it,i)=>{
    const d=document.createElement("div"); d.className="thumb"+(i===cur?" sel":"")+(it.video?" vid":""); d.tabIndex=0; d.setAttribute("role","button"); d.setAttribute("aria-label","Show "+it.name);
    d.innerHTML=`${it.url?`<img alt="" src="${it.url}">`:`<span class="rawph">RAW</span>`}<span class="nm"></span><button class="x" aria-label="Remove ${it.name}">✕</button>`;
    d.querySelector(".nm").textContent=it.name;
    d.addEventListener("click",ev=>{ if (ev.target.classList.contains("x")) return; select(i); });
    d.addEventListener("keydown",ev=>{ if (ev.key==="Enter") select(i); });
    d.querySelector(".x").addEventListener("click",ev=>{ ev.stopPropagation(); const wasCur=i===cur; removeItem(i); if (items.length){ if (wasCur||cur>=items.length) select(Math.min(i,items.length-1)); else { if (i<cur) cur--; buildStrip(); } } });
    s.appendChild(d);
  });
  const a=document.createElement("button"); a.className="addtile"; a.textContent="+ Add stills / clips"; a.addEventListener("click",()=>$("fileIn").click()); s.appendChild(a);
}

/* Built-in test still so the page opens working */
async function makeSample(){
  const w=1600,h=900; const c=document.createElement("canvas"); c.width=w; c.height=h; const x=c.getContext("2d");
  let g=x.createLinearGradient(0,0,0,h*0.62); g.addColorStop(0,"#5d86b8"); g.addColorStop(0.7,"#e9b98a"); g.addColorStop(1,"#f4d2a6");
  x.fillStyle=g; x.fillRect(0,0,w,h);
  const sun=x.createRadialGradient(1150,330,0,1150,330,70); sun.addColorStop(0,"#fffef8"); sun.addColorStop(0.6,"#fff6dc"); sun.addColorStop(1,"rgba(255,240,200,0)");
  x.fillStyle=sun; x.beginPath(); x.arc(1150,330,70,0,7); x.fill();
  x.fillStyle="#3b3029"; for(let i=0;i<14;i++){ const bw=60+((i*37)%70), bh=150+((i*53)%220); x.fillRect(i*120-20, h*0.62-bh, bw, bh+5); }
  x.fillStyle="#2a221c"; x.fillRect(0,h*0.62,w,h);
  for(let i=0;i<40;i++){ x.fillStyle=`hsl(${30+i*3},70%,${55+(i%5)*6}%)`; x.beginPath(); x.arc(60+i*39, 545+(i%3)*8, 4,0,7); x.fill(); }
  const sw=["#c13a2c","#e0742c","#e7c23c","#6aa244","#2f8f8a","#2f5ea8","#7a4aa0","#d7a487","#8a5a3c","#f2f0ea","#8c8c8c","#1a1a1a"];
  sw.forEach((col,i)=>{ x.fillStyle=col; x.fillRect(80+i*120,640,104,104); });
  for(let i=0;i<256;i++){ x.fillStyle=`rgb(${i},${i},${i})`; x.fillRect(80+i*(1424/256),770,6,50); }
  try{ await document.fonts.load("600 22px 'IBM Plex Sans Condensed'"); }catch(e){}   /* the font is a separate stylesheet: wait for it */
  x.fillStyle="#f2f0ea"; x.font="600 22px 'IBM Plex Sans Condensed', sans-serif"; x.fillText("ERNEST LAB TEST STILL · drop your frames to replace it",80,860);
  const bmp=await createImageBitmap(c,{premultiplyAlpha:"none",colorSpaceConversion:"none"});
  const url=c.toDataURL("image/jpeg",0.8);
  items.push({name:"test-still",bmp,url,sample:true}); cur=items.length-1;
  buildStrip(); select(cur);
}


