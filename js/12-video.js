/* Ernest Lab · js/12-video.js · video preview and MP4 export (Mediabunny in ./video/).
   Classic script (not a module): files load in order from index.html and share one global scope. */
"use strict";
/* ---------------- Video (v0.8) ----------------
   Preview: the browser's own <video> feeds frames into the same pipeline (texture re-uploaded each frame), with a new
   grain pattern every frame. Export: Mediabunny (./video/, loaded on first export) decodes each frame with WebCodecs,
   Ernest Lab renders it at full resolution, and it's encoded to H.264 MP4; the original audio is copied when possible. */
const VID_EXT=/\.(mp4|m4v|mov|webm|mkv)$/i;
let grainFrame=0, vidCur=null, vidRVFC=0;
const fmtT=t=>{ t=Math.max(0,t||0); const m=Math.floor(t/60), s=Math.floor(t%60); return m+":"+String(s).padStart(2,"0"); };
async function vidProbe(f){
  const el=document.createElement("video"); el.muted=true; el.playsInline=true; el.preload="auto"; el.loop=true;
  const src=URL.createObjectURL(f); el.src=src;
  try{ await new Promise((res,rej)=>{ el.onloadeddata=res; el.onerror=()=>rej(new Error(`This browser can't play ${f.name}. Try an H.264 MP4.`)); }); }
  catch(e){ URL.revokeObjectURL(src); throw e; }
  const W=el.videoWidth, H=el.videoHeight; if (!W||!H){ URL.revokeObjectURL(src); throw new Error(`${f.name} has no video track.`); }
  await new Promise(r=>{ const t=Math.min(1,(el.duration||0)*0.1); if (!t){ r(); return; } el.onseeked=()=>r(); el.currentTime=t; });
  const sc=Math.min(1,480/Math.max(W,H)), c=document.createElement("canvas"); c.width=Math.round(W*sc); c.height=Math.round(H*sc); c.getContext("2d").drawImage(el,0,0,c.width,c.height);
  const url=URL.createObjectURL(await new Promise(r=>c.toBlob(r,"image/jpeg",0.85)));
  el.currentTime=0;
  const it={name:f.name.replace(/\.[^.]+$/,""), video:true, file:f, el, src, url, w:W, h:H, duration:el.duration};
  el.addEventListener("seeked",()=>vidSeeked(it));   /* on the element: media events don't bubble, and it isn't in the page */
  return it;
}
function vidRelease(it){ if (!it||!it.video) return; try{ it.el.pause(); it.el.removeAttribute("src"); it.el.load(); }catch(e){} if (it.src) URL.revokeObjectURL(it.src); if (vidCur===it) vidAttach(null); }
function vidRefresh(){   /* new frame into the source texture (on its own unit: never upload on the active one) */
  if (!vidCur || !srcTex || srcItem!==vidCur) return; const el=vidCur.el; if (el.readyState<2) return;
  bindTex(5,srcTex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false); gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,el); srcMip=false;
}
function vidFrame(now,meta){
  if (!vidCur) return; vidRefresh(); grainFrame = meta&&meta.presentedFrames!=null ? meta.presentedFrames : (grainFrame+1); render(); vidUI();
  if (!vidCur.el.paused) vidLoop();
}
function vidLoop(){ const el=vidCur&&vidCur.el; if (!el) return; if (el.requestVideoFrameCallback) vidRVFC=el.requestVideoFrameCallback(vidFrame); else vidRVFC=requestAnimationFrame(t=>vidFrame(t,null)); }
function vidUI(){ const it=vidCur; if (!it) return; const el=it.el, d=el.duration||0;
  if (document.activeElement!==$("vTime")) $("vTime").value=d?Math.round(el.currentTime/d*1000):0;
  $("vTimeT").textContent=fmtT(el.currentTime)+" / "+fmtT(d);
  $("vPlay").innerHTML = el.paused ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>' : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
  $("vPlay").setAttribute("aria-label", el.paused?"Play":"Pause"); $("vMute").classList.toggle("off",el.muted); }
function vidAttach(it){
  if (vidCur && vidCur!==it){ try{ vidCur.el.pause(); }catch(e){} }
  vidCur=it; grainFrame=0; document.body.classList.toggle("vidmode",!!it); $("vbar").hidden=!it;
  $("btnExport").textContent = it ? "Export video (MP4)" : "Export this still";
  $("fmt").hidden=!!it; $("shareRow").hidden=!!it;
  $("dlNote").textContent = it ? "Video exports as H.264 MP4 at full resolution, with a new grain pattern every frame and the original sound. It renders frame by frame, so it takes a while; the clip never leaves your device." : DL_NOTE0;
  if (it){ vidUI(); }
}
$("vPlay").addEventListener("click",()=>{ const el=vidCur&&vidCur.el; if (!el) return; if (el.paused){ el.play().then(()=>{ vidLoop(); vidUI(); }).catch(()=>{ el.muted=true; el.play().then(()=>{ vidLoop(); vidUI(); }); }); } else { el.pause(); vidUI(); } });
$("vMute").addEventListener("click",()=>{ const el=vidCur&&vidCur.el; if (!el) return; el.muted=!el.muted; vidUI(); });
/* scrubbing: one seek at a time; while one is running, the latest slider position waits and is applied when it lands */
let vidPending=null;
function vidSeek(t){ const el=vidCur&&vidCur.el; if (!el||!el.duration) return; if (el.seeking) vidPending=t; else { vidPending=null; el.currentTime=t; } $("vTimeT").textContent=fmtT(t)+" / "+fmtT(el.duration); }
function vidSeeked(it){ if (it!==vidCur) return; vidRefresh(); grainFrame=Math.round(it.el.currentTime*24); render(); vidUI(); if (vidPending!=null){ const t=vidPending; vidPending=null; it.el.currentTime=t; } }
$("vTime").addEventListener("input",()=>{ const el=vidCur&&vidCur.el; if (el&&el.duration) vidSeek($("vTime").value/1000*el.duration); });
document.addEventListener("keydown",ev=>{ if (!vidCur || ev.code!=="KeyK" || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return; ev.preventDefault(); $("vPlay").click(); });
const DL_NOTE0=$("dlNote").textContent;

let vidMod=null, vidConv=null;
async function exportVideo(it){
  if (vidConv) return; const el=it.el; el.pause(); vidUI();
  const box=$("vExp"), T=$("vExpT"), bar=$("vExpBar"); box.hidden=false; T.textContent="Loading the video encoder…"; bar.style.width="0%";
  const keepFrame=grainFrame; let n=0, even=null;
  try{
    if (!vidMod) vidMod=import(new URL("video/mediabunny.js",document.baseURI).href); const mb=await vidMod;
    const c=cropRect(curDev(),srcW,srcH), OW=c.W&~1, OH=c.H&~1;   /* H.264 needs even sizes */
    const input=new mb.Input({source:new mb.BlobSource(it.file), formats:[mb.MP4,mb.QTFF,mb.WEBM,mb.MATROSKA]});
    const output=new mb.Output({format:new mb.Mp4OutputFormat({fastStart:"in-memory"}), target:new mb.BufferTarget()});
    const avc = await mb.canEncodeVideo("avc",{width:OW,height:OH}).catch(()=>false);
    vidConv=await mb.Conversion.init({input, output, video:{ ...(avc?{codec:"avc"}:{}), quality:mb.QUALITY_VERY_HIGH, forceTranscode:true, processedWidth:OW, processedHeight:OH,
      process:(sample)=>{
        let vf=null; try{ vf=sample.toVideoFrame(); }catch(e){}
        bindTex(5,srcTex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
        if (vf){ gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,vf); vf.close(); }
        else { const oc=new OffscreenCanvas(srcW,srcH), ox=oc.getContext("2d"); sample.draw(ox,0,0,srcW,srcH); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,oc); }
        srcMip=false; grainFrame=n++; renderClean=true; render(); renderClean=false;
        let out=canvas; if (canvas.width!==OW||canvas.height!==OH){ if (!even){ even=new OffscreenCanvas(OW,OH); } even.getContext("2d").drawImage(canvas,0,0); out=even; }
        return new mb.VideoSample(out,{timestamp:sample.timestamp, duration:sample.duration});
      } } });
    if (!vidConv.isValid){ const why=(vidConv.discardedTracks||[]).map(d=>`${d.track&&d.track.type||"track"}: ${d.reason}`).join(", "); throw new Error("This clip can't be converted here"+(why?` (${why})`:"")+". Try an H.264 MP4."); }
    const lostAudio=(vidConv.discardedTracks||[]).some(d=>d.track&&d.track.type==="audio");
    vidConv.onProgress=p=>{ bar.style.width=Math.round(p*100)+"%"; T.textContent=`Rendering video… ${Math.round(p*100)}%  ·  frame ${n}`; };
    T.textContent="Rendering video…";
    await vidConv.execute();
    const blob=new Blob([output.target.buffer],{type:"video/mp4"});
    await offer(`${it.name}_${slug(presetName)}.mp4`, blob);
    if (lostAudio) toast("Exported without sound: this browser can't put the clip's audio in an MP4.",4200);
  }catch(err){
    if (err && /cancel/i.test(err.name+err.message)) toast("Video export cancelled.");
    else { console.error(err); toast(String(err&&err.message||err).slice(0,160),5000); }
  }finally{
    vidConv=null; box.hidden=true; grainFrame=keepFrame; renderClean=false; vidRefresh(); render();
  }
}
$("vExpCancel").addEventListener("click",()=>{ if (vidConv) vidConv.cancel(); });


