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
let rawMod=null, rawQueue=Promise.resolve();
async function rawLib(){ if (!rawMod) rawMod=import(new URL("raw/index.js",document.baseURI).href).then(m=>m.default); return new (await rawMod)(); }
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
      await lr.open(new Uint8Array(await f.arrayBuffer()), RAW_OPTS);
      const meta=await lr.metadata()||{}; let th=null; try{ th=await lr.thumbnailData(); }catch(e){}
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
      await lr.open(new Uint8Array(await it.file.arrayBuffer()), {...RAW_OPTS, halfSize:half});
      const img=await lr.imageData(); const W=img.width, H=img.height, d=img.data;
      if (!d || img.colors!==3 || img.bits!==16) throw new Error("unexpected RAW output");
      if (it.baseEV==null){
        const n=Math.min(40000,W*H), step=Math.max(1,Math.floor(W*H/n));
        const med=medianLum(i=>{ const k=i*step*3; return (0.2126*d[k]+0.7152*d[k+1]+0.0722*d[k+2])/65535; }, n);
        it.baseEV = (it.refLum && med>0) ? Math.min(4,Math.max(-2,Math.log2(it.refLum/med))) : 1;
        it.baseAuto = !!(it.refLum && med>0);
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
      const g=Math.pow(2,it.baseEV)/65535, lut=new Uint16Array(65536); for (let v=0;v<65536;v++) lut[v]=f2h(v*g);
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
