/* Ernest Lab · js/12-seq.js · image sequences (EXR, DPX, Cineon, PNG) as clips.
   Classic script (not a module): files load in order from index.html and share one global scope. */
"use strict";
/* ---------------- Image sequences (v1.3) ----------------
   Numbered frames added together (or a dropped folder) become one clip: name.1001.exr … name.1100.exr. It plays,
   scrubs and exports to MP4 like a video, with the per-frame grain. Frames are decoded on demand by a small pool of
   workers (EXR: ./exr/, DPX / Cineon: ./dpx/, PNG: the browser), the next ones are prefetched while one is shown, and
   decoded frames stay in a cache of about 400 MB. Playback keeps the clock: when decoding can't keep up, it shows the
   frame that is due and skips the ones in between (the export renders every frame). */
const SEQ_RE=/^(.*?)(\d+)\.(exr|dpx|cin|png)$/i;
const SEQ_FPS=[23.976,24,25,29.97,30,48,50,59.94,60];
/* split a file list into sequences and the rest. EXR / DPX / Cineon: 2+ numbered frames with the same name and extension.
   PNG: 6+ frames with 3+ digits (so a handful of screenshots stays stills). JPEG never (camera photos are numbered too). */
function groupSequences(files){
  const groups=new Map(), rest=[];
  for (const f of files){ const m=f.name.match(SEQ_RE); if (!m){ rest.push(f); continue; }
    const key=m[1]+"\u0000"+m[3].toLowerCase(); if (!groups.has(key)) groups.set(key,{prefix:m[1],ext:m[3].toLowerCase(),frames:[]});
    groups.get(key).frames.push({n:parseInt(m[2],10),digits:m[2].length,f}); }
  const seqs=[];
  for (const g of groups.values()){
    const png=g.ext==="png", ok=g.frames.length>=(png?6:2) && (!png || g.frames.every(x=>x.digits>=3));
    if (!ok){ for (const x of g.frames) rest.push(x.f); continue; }
    g.frames.sort((a,b)=>a.n-b.n); seqs.push(g); }
  return {seqs,rest};
}
async function seqProbe(g){
  const kind=g.ext==="exr"?"exr":g.ext==="png"?"img":"dpx", nums=g.frames.map(x=>x.n);
  const base=g.prefix.replace(/[._\-\s]+$/,"")||"frames";
  const it={name:`${base} [${nums[0]}-${nums[nums.length-1]}]`, video:true, seq:true, kind, frames:g.frames.map(x=>x.f), nums, fps:24, url:null, layer:null,
    prefix:g.prefix, pad:g.frames[0].digits};   /* frame exports keep the source names: prefix + padded number */
  it.el=new SeqPlayer(it);
  const r=await it.el.frame(0);
  if (kind==="img"){ it.w=r.width; it.h=r.height;
    const sc=Math.min(1,480/Math.max(r.width,r.height)), c=document.createElement("canvas"); c.width=Math.round(r.width*sc); c.height=Math.round(r.height*sc);
    c.getContext("2d").drawImage(r,0,0,c.width,c.height); it.url=URL.createObjectURL(await new Promise(res=>c.toBlob(res,"image/jpeg",0.85))); }
  else { it.w=r.w; it.h=r.h; it.info=r.info; if (kind==="exr") it.layer=r.info.layer; if (kind==="dpx" && r.info.fps) it.fps=r.info.fps;
    if (kind==="exr") await exrPrepare(it,r); else await codePrepare(it,r); }
  it.duration=it.frames.length/it.fps;
  it.el.addEventListener("seeked",()=>vidSeeked(it));
  toast(`${it.frames.length} frames of ${base} added as one clip (${+it.fps.toFixed(3)} fps).`,3200);
  return it;
}

/* the sequence player: <video>-like for js/12-video.js */
const SEQ_BUDGET=400*1024*1024;
class SeqPlayer {
  constructor(it){ Object.assign(this,{it,paused:true,muted:true,seeking:false,readyState:4,idx:0,gen:0,loop:true,listeners:{}}); this.cache=new Map(); this.inflight=new Map(); this.bytes=0; }
  get duration(){ return this.it.frames.length/this.it.fps; }
  get currentTime(){ return this.idx/this.it.fps; }
  set currentTime(v){ this.seekTo(v); }
  addEventListener(n,f){ (this.listeners[n]=this.listeners[n]||[]).push(f); }
  emit(n){ for (const f of this.listeners[n]||[]) f(); }
  /* decoded frame i (cached; concurrent requests share one decode) */
  frame(i){
    const n=this.it.frames.length; if (i<0||i>=n) return Promise.resolve(null);
    if (this.cache.has(i)){ const r=this.cache.get(i); this.cache.delete(i); this.cache.set(i,r); return Promise.resolve(r); }   /* LRU: most recent last */
    if (this.inflight.has(i)) return this.inflight.get(i);
    const f=this.it.frames[i], k=this.it.kind;
    const p=(async()=>{
      let r;
      if (k==="img") r=await createImageBitmap(f,{premultiplyAlpha:"none",colorSpaceConversion:"none"});
      else { const buf=await f.arrayBuffer(); r= k==="exr" ? await poolRun("exr",{buf,layer:this.it.layer??null,maxTex:MAXTEX},[buf]) : await dpxRun(buf); }
      const b=k==="img"?r.width*r.height*4:r.data.byteLength;
      this.cache.set(i,r); this.bytes+=b;
      for (const [j,o] of this.cache){ if (this.bytes<=SEQ_BUDGET || this.cache.size<=3) break; if (j===this.idx||j===i) continue;
        this.bytes-= k==="img"?o.width*o.height*4:o.data.byteLength; if (o.close) o.close(); this.cache.delete(j); }
      return r; })();
    this.inflight.set(i,p); p.finally(()=>this.inflight.delete(i)).catch(()=>{});
    return p;
  }
  prefetch(i,ahead){ for (let k=1;k<=ahead;k++){ const j=i+k<this.it.frames.length?i+k:(this.loop?(i+k)%this.it.frames.length:-1); if (j>=0 && !this.cache.has(j) && !this.inflight.has(j) && this.inflight.size<3) this.frame(j); } }
  async show(i,g){ const r=await this.frame(i); if (g!==this.gen || !r) return false; this.idx=i; if (vidCur===this.it && srcItem===this.it) seqUpload(this.it,r); return true; }
  async seekTo(v){
    const g=++this.gen; this.paused=true; this.seeking=true; const i=Math.max(0,Math.min(this.it.frames.length-1,Math.round(v*this.it.fps)));
    try{ await this.show(i,g); }catch(e){ console.error(e); toast(`Frame ${this.it.nums[i]}: ${String(e.message||e).slice(0,90)}`); }
    finally{ if (g===this.gen){ this.seeking=false; this.emit("seeked"); } }
  }
  play(){ if (!this.paused) return Promise.resolve(); this.paused=false; this.run(++this.gen); return Promise.resolve(); }
  async run(g){
    const n=this.it.frames.length; if (this.idx>=n-1) this.idx=0;
    let t0=performance.now()-this.idx/this.it.fps*1000, last=-1;
    try{
      while (g===this.gen){
        const fps=this.it.fps; let i=Math.floor((performance.now()-t0)/1000*fps);
        if (i>=n){ if (!this.loop) break; t0=performance.now(); i=0; }
        if (i===last){ await new Promise(r=>setTimeout(r,Math.max(1,t0+(i+1)/fps*1000-performance.now()))); continue; }
        this.prefetch(i,3);
        if (!(await this.show(i,g))) return;
        last=i; grainFrame=i; render(); vidUI();
        await new Promise(r=>requestAnimationFrame(r));
      }
    }catch(e){ if (g===this.gen){ console.error(e); toast(String(e.message||e).slice(0,120)); } }
    finally{ if (g===this.gen){ this.paused=true; vidUI(); } }
  }
  pause(){ if (this.paused) return; this.paused=true; this.gen++; }
  close(){ this.gen++; this.paused=true; for (const o of this.cache.values()) if (o&&o.close) o.close(); this.cache.clear(); this.bytes=0; }
  removeAttribute(){} load(){}
}
/* a decoded frame into the source texture (reused while the size and kind stay the same) */
function seqUpload(it,r){
  const img=it.kind==="img", w=img?r.width:r.w, h=img?r.height:r.h;
  if (srcTex && srcTex._seq===it && srcW===w && srcH===h){
    bindTex(5,srcTex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false); gl.pixelStorei(gl.UNPACK_ALIGNMENT,img?4:2);
    if (img) gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,r); else gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,w,h,gl.RGBA,gl.HALF_FLOAT,r.data);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT,4); srcMip=false;
  } else { if (img) uploadSource(r); else uploadSource({W:w,H:h,data:r.data},true); srcTex._seq=it; }
  srcItem=it;
}
async function seqSource(it){ const r=await it.el.frame(it.el.idx); if (!r) return false; seqUpload(it,r); return true; }
function seqRefresh(it){ it.el.frame(it.el.idx).then(r=>{ if (r && vidCur===it){ seqUpload(it,r); render(); } }); }

/* MP4 export: every frame, in order, rendered at full resolution */
async function exportSeq(it){
  if (vidConv) return; it.el.pause(); vidUI();
  const box=$("vExp"), T=$("vExpT"), bar=$("vExpBar"); box.hidden=false; T.textContent="Loading the video encoder…"; bar.style.width="0%";
  const keepFrame=grainFrame, keepIdx=it.el.idx; let cancelled=false, output=null, even=null;
  vidConv={cancel(){ cancelled=true; }};
  try{
    const mb=await vidLib();
    const c=cropRect(curDev(),srcW,srcH), OW=c.W&~1, OH=c.H&~1;
    let codec=null; for (const k of ["avc","hevc","vp9","av1"]) if (await mb.canEncodeVideo(k,{width:OW,height:OH}).catch(()=>false)){ codec=k; break; }
    if (!codec) throw new Error("This browser can't encode video.");
    output=new mb.Output({format:new mb.Mp4OutputFormat({fastStart:"in-memory"}), target:new mb.BufferTarget()});
    const src=new mb.VideoSampleSource({codec, bitrate:mb.QUALITY_VERY_HIGH}); output.addVideoTrack(src,{frameRate:it.fps}); await output.start();
    const n=it.frames.length;
    for (let i=0;i<n;i++){
      if (cancelled) throw Object.assign(new Error("cancelled"),{name:"cancel"});
      const r=await it.el.frame(i); it.el.prefetch(i,3); it.el.idx=i;
      seqUpload(it,r); grainFrame=i; renderClean=true; render(); renderClean=false;
      let out=canvas;
      if (canvasShort()){ if (!even) even=new OffscreenCanvas(OW,OH); framePut(even); out=even; }   /* v1.6.1: the canvas got a smaller buffer (phones) */
      else if (canvas.width!==OW||canvas.height!==OH){ if (!even) even=new OffscreenCanvas(OW,OH); even.getContext("2d").drawImage(canvas,0,0); out=even; }
      const s=new mb.VideoSample(out,{timestamp:i/it.fps, duration:1/it.fps}); await src.add(s); s.close();
      bar.style.width=Math.round((i+1)/n*100)+"%"; T.textContent=`Rendering ${it.name}… frame ${i+1} / ${n}`;
    }
    T.textContent="Finishing the MP4…"; await output.finalize();
    await offer(`${it.name.replace(/\s*\[.*\]$/,"")}_${slug(presetName)}.mp4`, new Blob([output.target.buffer],{type:"video/mp4"}));
  }catch(err){
    if (output && output.state!=="finalized") output.cancel().catch(()=>{});
    if (err && /cancel/i.test(err.name+err.message)) toast("Video export cancelled.");
    else { console.error(err); toast(String(err&&err.message||err).slice(0,160),5000); }
  }finally{
    vidConv=null; box.hidden=true; grainFrame=keepFrame; renderClean=false; it.el.idx=keepIdx; seqRefresh(it);
  }
}
/* frame rate (Development, sequences only) */
function seqSync(){
  const it=items[cur], row=$("fpsRow"); if (!row) return; const on=!!(it&&it.seq); row.hidden=!on; if (!on) return;
  const sel=$("seqFps"); if (!sel.options.length) sel.innerHTML=SEQ_FPS.map(v=>`<option value="${v}">${v}</option>`).join("");
  if (!SEQ_FPS.includes(it.fps)){ const o=document.createElement("option"); o.value=it.fps; o.textContent=+it.fps.toFixed(3); sel.appendChild(o); }
  sel.value=String(it.fps);
}
$("seqFps").addEventListener("change",()=>{ const it=items[cur]; if (!it||!it.seq) return; const t=it.el.currentTime; it.fps=+$("seqFps").value; it.duration=it.el.duration; it.el.idx=Math.min(it.frames.length-1,Math.round(t*it.fps)); vidUI(); updMeta(); });

/* folders dropped onto the window: walk them (the browser hands over only the top-level entries) */
async function filesFromDrop(dt){
  const items=[...(dt.items||[])].map(i=>i.webkitGetAsEntry&&i.webkitGetAsEntry()).filter(Boolean);
  if (!items.some(e=>e.isDirectory)) return [...dt.files];
  const out=[];
  const walk=async e=>{ if (e.isFile){ out.push(await new Promise((res,rej)=>e.file(res,rej))); return; }
    if (e.isDirectory){ const rd=e.createReader(); for (;;){ const batch=await new Promise((res,rej)=>rd.readEntries(res,rej)); if (!batch.length) break; for (const x of batch) await walk(x); } } };
  for (const e of items) await walk(e);
  return out.filter(f=>!f.name.startsWith("."));
}
