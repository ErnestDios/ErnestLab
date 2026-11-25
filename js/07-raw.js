/* Ernest Lab · js/07-raw.js · RAW decoding (LibRaw in ./raw/).
   Classic script (not a module): files load in order from index.html and share one global scope. */
"use strict";
/* ---------------- RAW (v0.6) ----------------
   LibRaw (WebAssembly, ./raw/) decodes in a worker that is created per file and closed afterwards, so its memory
   is returned. Output: camera white balance, demosaiced (AHD), converted to linear Rec.709/sRGB primaries, 16-bit,
   no auto-brightening; sensor clipping = 1.0, so highlights clip to white. The data is scaled by a base exposure
   that matches the camera's own JPEG preview (median scene luminance), then uploaded as RGBA16F scene-linear:
   it enters the pipeline at the input transform with uInXfer=1, the slot reserved for it since v0.2. */
const RAW_EXT=/\.(3fr|ari|arw|cr2|cr3|crw|dcr|dng|erf|fff|iiq|k25|kdc|mef|mos|mrw|nef|nrw|orf|pef|raf|raw|rw2|rwl|sr2|srf|srw|x3f)$/i;
const RAW_OPTS={useCameraWb:true, useCameraMatrix:1, outputColor:1, outputBps:16, gamm:[1,1], noAutoBright:true, highlight:0, userQual:3};
/* v1.7.1 Clipped highlights (Development, RAW only): LibRaw's highlight modes. 0 Clip (as before): after white balance every
   channel is cut where the least-boosted one reaches the sensor's white, so the channels white balance boosts (often red,
   blue) lose up to about a stop at the top: saturated lights (a blue stage light, red neon, a sunset) flatten and blown
   areas go neutral white. 2 Blend and 5 Rebuild keep each channel's full range (LibRaw then scales the image down; the
   decode lines it back up on the mid-tones): Blend mixes clipped and unclipped channels into a soft neutral white, Rebuild
   reconstructs clipped channels from the ones still recording (dcraw -H 5, the usual compromise). Checked on rawpy's test
   NEF / CR2 (25 Nov): shadows and mid-tones match Clip, the top stop opens up. */
const RAW_HL={0:"Clip",2:"Blend",5:"Rebuild"};
function rawHLSync(){ const it=items[cur], row=$("rawHLRow"), note=$("rawHLNote"); if (!row) return; const on=!!(it&&it.raw); row.hidden=note.hidden=!on; if (!on) return;
  const v=(curDev().rawHL|0); $("devRawHL").value=RAW_HL[v]?String(v):"0";
  note.textContent = v===5 ? "Rebuild: keeps every channel's full range and rebuilds clipped channels from the ones still recording, so saturated lights, skies and skin keep tone and colour in the top stop. Where all three clipped it stays white. Shadows and mid-tones don't change."
    : v===2 ? "Blend: keeps every channel's full range and blends clipped and unclipped channels, so blown areas fade softly into neutral white. Shadows and mid-tones don't change."
    : "Clip (as before): after white balance, channels are cut where the first reaches white, so the boosted ones (often red, blue) lose up to a stop at the top: saturated lights flatten, blown areas go flat white. Try Rebuild for coloured lights, a clipped sky or a hot face.";
  /* the shown RAW was developed with another mode (changed here, Reset, Apply to all): develop it again */
  if (srcItem===it && it.decHL!==undefined && it.decHL!==v && !it.hlBusy){ it.hlBusy=true; srcItem=null;
    ensureSource(cur).then(ok=>{ it.hlBusy=false; if (ok){ syncDev(); schedule(); } }); } }
function buildRawHL(){ const sel=$("devRawHL"); if (!sel) return;
  sel.addEventListener("change",()=>setDev("rawHL",+sel.value)); }   /* setDev → syncDev → rawHLSync develops it again */
let rawMod=null, rawQueue=Promise.resolve();
/* v1.7.2 watchdog. LibRaw's wrapper (raw/index.js) only settles a call when its worker answers, so a worker that crashed,
   failed to start or stalled left "Reading …" / "Developing RAW…" up for good, and every later RAW queued behind it
   until a reload. Now a worker error, an unreadable message or a step that takes too long fails the call (and the ones
   waiting on it), closes that worker and frees the queue; the caller shows "Could not …". Limits are generous: the
   full decode of a 21 MP CR2 takes ~4.5 s on two slow cores, so a phone with a 100 MP file stays well inside. */
const RAW_WAIT={step:60000, decode:90000, perMP:2000};   /* ms; perMP is added to `decode` per megapixel */
async function rawLib(){ if (!rawMod) rawMod=import(new URL("raw/index.js",document.baseURI).href).then(m=>m.default);
  const lr=new (await rawMod)();
  const fail=msg=>{ if (lr.disposed) return; lr.why=msg; const e=new Error(msg); for (const p of lr.pending.values()) p.reject(e); lr.pending.clear(); lr.dispose(); };
  lr.worker.addEventListener("error",e=>{ e.preventDefault(); console.error("RAW worker error",e.message||e); fail(e.message?`the RAW decoder crashed (${e.message})`:"the RAW decoder failed to start"); });
  lr.worker.addEventListener("messageerror",()=>fail("the RAW decoder sent unreadable data"));
  /* lr.step(promise, ms): the call, or an error once ms pass without an answer */
  lr.step=(p,ms)=>{ let t; return Promise.race([p, new Promise((_,rej)=>{ t=setTimeout(()=>{ const m=`the RAW decoder stopped responding after ${Math.round(ms/1000)} s`; console.error(m); fail(m); rej(new Error(m)); },ms); })]).catch(e=>{ throw lr.why?new Error(lr.why):e; }).finally(()=>clearTimeout(t)); };   /* a worker that died before the call reports why, not "LibRaw disposed" */
  return lr; }
function rawJob(fn){ const r=rawQueue.then(fn,fn); rawQueue=r.then(()=>{},()=>{}); return r; }   /* one decode at a time (memory) */
const f2h=(()=>{ const f=new Float32Array(1), u=new Uint32Array(f.buffer);
  return v=>{ f[0]=v; const x=u[0], sgn=(x>>>16)&0x8000; let e=((x>>>23)&0xff)-112, m=x&0x7fffff;
    if (e<=0){ if (e<-10) return sgn; m|=0x800000; const sh=14-e; let h=m>>>sh; if ((m>>>(sh-1))&1) h++; return sgn|h; }
    if (e>=31) return sgn|0x7c00; let h=sgn|(e<<10)|(m>>>13); if (m&0x1000) h++; return h; }; })();
function medianLum(get,n){ const a=new Float32Array(n); for (let i=0;i<n;i++) a[i]=get(i); a.sort(); return a[n>>1]; }
const srgbDec=v=>{ v/=255; return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4); };
/* add-time: metadata + embedded preview (thumbnail, brightness reference); the full decode waits until the still is shown */
async function rawProbe(f){
  return rawJob(async()=>{
    const lr=await rawLib();
    try{
      const S=RAW_WAIT.step; await lr.step(lr.open(new Uint8Array(await f.arrayBuffer()), RAW_OPTS),S);
      const meta=await lr.step(lr.metadata(),S)||{}; let th=null; try{ th=await lr.step(lr.thumbnailData(),S); }catch(e){ if (lr.disposed) throw e; }
      const it={name:f.name.replace(/\.[^.]+$/,""), raw:true, file:f, w:meta.width, h:meta.height, flip:meta.flip|0,
        cam:[meta.camera_make,meta.camera_model].filter(Boolean).join(" ").trim(), iso:meta.iso_speed, url:null, refLum:null};
      if (it.flip===5||it.flip===6){ const t=it.w; it.w=it.h; it.h=t; }
      if (th && th.format==="jpeg" && th.data){
        const bmp=await createImageBitmap(new Blob([th.data],{type:"image/jpeg"}));
        const sc=Math.min(1,480/Math.max(bmp.width,bmp.height)), tw=Math.max(1,Math.round(bmp.width*sc)), thh=Math.max(1,Math.round(bmp.height*sc));
        const rot=(it.flip===5||it.flip===6), c=document.createElement("canvas"); c.width=rot?thh:tw; c.height=rot?tw:thh; const x=c.getContext("2d");
        x.translate(c.width/2,c.height/2); x.rotate(it.flip===3?Math.PI: it.flip===6?Math.PI/2: it.flip===5?-Math.PI/2: 0); x.drawImage(bmp,-tw/2,-thh/2,tw,thh); bmp.close&&bmp.close();
        const d=c.getContext("2d").getImageData(0,0,c.width,c.height).data, n=Math.min(20000,d.length>>2), step=Math.max(1,Math.floor((d.length>>2)/n));
        const lum=new Float32Array(n); for (let i=0;i<n;i++){ const k=i*step*4; lum[i]=0.2126*srgbDec(d[k])+0.7152*srgbDec(d[k+1])+0.0722*srgbDec(d[k+2]); }
        it.refQ=qs(lum); it.refLum=it.refQ[QN>>1];
        { const gw=Math.max(1,Math.round(c.width*Math.min(1,192/Math.max(c.width,c.height)))), gh=Math.max(1,Math.round(c.height*gw/c.width));
          const g=document.createElement("canvas"); g.width=gw; g.height=gh; const gx=g.getContext("2d"); gx.imageSmoothingQuality="high"; gx.drawImage(c,0,0,gw,gh);
          const gd=gx.getImageData(0,0,gw,gh).data, rgb=new Float32Array(gw*gh*3); for (let i=0,j=0;i<gd.length;i+=4,j+=3){ rgb[j]=srgbDec(gd[i]); rgb[j+1]=srgbDec(gd[i+1]); rgb[j+2]=srgbDec(gd[i+2]); }
          it.refGrid={w:gw,h:gh,rgb}; }
        it.url=URL.createObjectURL(await new Promise(r=>c.toBlob(r,"image/jpeg",0.85)));
      }
      return it;
    } finally { lr.dispose(); }
  });
}
/* full decode → RGBA16F data, scaled by the base exposure */
async function rawDecode(it){
  return rawJob(async()=>{
    const lr=await rawLib();
    try{
      const half = Math.max(it.w,it.h)>MAXTEX;
      const hv=(it.dev&&it.dev.rawHL)|0, hl=RAW_HL[hv]?hv:0;   /* v1.7.1: highlight recovery, per image */
      await lr.step(lr.open(new Uint8Array(await it.file.arrayBuffer()), {...RAW_OPTS, halfSize:half, highlight:hl}),RAW_WAIT.step); it.decHL=hl;
      const img=await lr.step(lr.imageData(), RAW_WAIT.decode+RAW_WAIT.perMP*((it.w||0)*(it.h||0)/1e6)/(half?4:1)); const W=img.width, H=img.height, d=img.data;
      if (!d || img.colors!==3 || img.bits!==16) throw new Error("unexpected RAW output");
      const nM=Math.min(40000,W*H), stM=Math.max(1,Math.floor(W*H/nM)), lumAt=i=>{ const k=i*stM*3; return (0.2126*d[k]+0.7152*d[k+1]+0.0722*d[k+2])/65535; };
      let ev;
      if (it.baseEV==null){
        const med=medianLum(lumAt, nM);
        it.baseEV = (it.refLum && med>0) ? Math.min(4,Math.max(-2,Math.log2(it.refLum/med))) : 1;
        it.baseAuto = !!(it.refLum && med>0);
        it.refSamp={W, n:nM, lum:Float32Array.from({length:nM},(_,i)=>lumAt(i)), hl};   /* this decode's tones, to line others up with it */
        ev=it.baseEV;
      } else {
        /* LibRaw scales by the smallest white-balance multiplier when highlights are recovered (room above white for the
           rebuilt channels), so the image comes out darker than in Clip. Line it up with the first decode: the median
           ratio over well-exposed samples (not near black, not clipped) */
        const R=it.refSamp; let k=0;
        if (R && R.W===W && R.n===nM){ const r=new Float32Array(nM);
          for (let i=0;i<nM;i++){ const a=R.lum[i], b=lumAt(i); if (a>0.01 && a<0.6 && b>1e-5) r[k++]=a/b; }
          if (k>200){ const q=r.subarray(0,k).sort(); ev=it.baseEV+Math.log2(q[k>>1]); } }
        if (ev===undefined) ev=it.baseEV;
      }
      if (!it.hist || it.camCurve===undefined){
        const n=Math.min(60000,W*H), step=Math.max(1,Math.floor(W*H/n)), k2=Math.pow(2,it.baseEV)/65535, lum=new Float32Array(n);
        for (let i=0;i<n;i++){ const k=i*step*3; lum[i]=(0.2126*d[k]+0.7152*d[k+1]+0.0722*d[k+2])*k2; }
        it.hist=histFromLum(i=>lum[i],n); it.camCurve=null; it.camSat=1;
        if (it.refGrid){   /* raw averaged over the same grid cells as the preview */
          const {w:gw,h:gh}=it.refGrid, rg=new Float32Array(gw*gh*3), S=4;
          for (let gy=0;gy<gh;gy++) for (let gx=0;gx<gw;gx++){ let r=0,g2=0,b=0;
            for (let sy=0;sy<S;sy++) for (let sx=0;sx<S;sx++){ const X=Math.min(W-1,Math.floor((gx+(sx+0.5)/S)*W/gw)), Y=Math.min(H-1,Math.floor((gy+(sy+0.5)/S)*H/gh)), k=(Y*W+X)*3; r+=d[k]; g2+=d[k+1]; b+=d[k+2]; }
            const o=(gy*gw+gx)*3, f=k2/(S*S); rg[o]=r*f; rg[o+1]=g2*f; rg[o+2]=b*f; }
          it.camSat=camSaturation(rg,gw*gh,it.refGrid.rgb,gw*gh);
        }
        if (it.refQ) it.camCurve=fitCamCurve(qs(lum),it.refQ);
      }
      const g=Math.pow(2,ev)/65535, lut=new Uint16Array(65536); for (let v=0;v<65536;v++) lut[v]=f2h(v*g);
      const out=new Uint16Array(W*H*4), ONE=0x3c00;
      for (let i=0,j=0;i<d.length;i+=3,j+=4){ out[j]=lut[d[i]]; out[j+1]=lut[d[i+1]]; out[j+2]=lut[d[i+2]]; out[j+3]=ONE; }
      if (!it.url){   /* no embedded preview: thumbnail from the decoded data */
        const sc=Math.min(1,480/Math.max(W,H)), tw=Math.max(1,Math.round(W*sc)), thh=Math.max(1,Math.round(H*sc));
        const c=document.createElement("canvas"); c.width=tw; c.height=thh; const x=c.getContext("2d"), im=x.createImageData(tw,thh);
        const enc=v=>{ v=Math.min(1,Math.max(0,v)); return 255*(v<=0.0031308?v*12.92:1.055*Math.pow(v,1/2.4)-0.055); }, k=Math.pow(2,it.baseEV)/65535;
        for (let y=0;y<thh;y++) for (let xx=0;xx<tw;xx++){ const s=(Math.floor(y/sc)*W+Math.floor(xx/sc))*3, o=(y*tw+xx)*4;
          im.data[o]=enc(d[s]*k); im.data[o+1]=enc(d[s+1]*k); im.data[o+2]=enc(d[s+2]*k); im.data[o+3]=255; }
        x.putImageData(im,0,0); it.url=URL.createObjectURL(await new Promise(r=>c.toBlob(r,"image/jpeg",0.85))); buildStrip();
      }
      if (half) toast(`${it.name} was decoded at half size (${W}×${H}), the largest this GPU handles.`);
      return {W,H,data:out};
    } finally { lr.dispose(); }
  });
}
