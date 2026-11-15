/* Ernest Lab · js/08-formats.js · export formats (PNG 16, TIFF 16, DPX, Cineon, OpenEXR, same as source), file names, folder / zip output.
   Classic script (not a module): files load in order from index.html and share one global scope. */
"use strict";
/* ---------------- Export formats (v1.3) ----------------
   What every format holds: the finished picture, film look and display rendering included, as you see it on an sRGB
   screen. High-bit formats read the graded image from the GPU as floats (half-float target, ~11 bits), so gradients
   and grain keep their precision instead of being quantised to 8 bits first.
   · PNG 16 / TIFF 16 / DPX: display-referred sRGB code values (DPX tagged Rec.709 video, which reads back as display).
   · Cineon: the same light as Cineon printing density (display white = 685, black = 95), so a Cineon read gives it back.
   · OpenEXR: the same light linearised (sRGB decoded), Rec.709 chromaticities, half, ZIP: view it in Nuke / Resolve with
     a plain sRGB view (not an ACES / Filmic / AgX one, which would tone-map the film look a second time).
   · Same as source: each file in its own type when it can be written: JPEG, PNG (16-bit stays 16), WebP, EXR, DPX
     (10 or 16-bit like the source), Cineon; camera RAW → TIFF 16-bit; anything else → JPEG. */
const XF={   /* export formats: ext, label, bytes per pixel (size estimate), high = read floats from the GPU */
  jpg:  {ext:"jpg", name:"JPEG · quality 95", bpp:0.5},
  png:  {ext:"png", name:"PNG · 8-bit", bpp:2},
  png16:{ext:"png", name:"PNG · 16-bit", bpp:4, high:1},
  webp: {ext:"webp",name:"WebP", bpp:0.3},
  tif16:{ext:"tif", name:"TIFF · 16-bit", bpp:6, high:1},
  dpx10:{ext:"dpx", name:"DPX · 10-bit", bpp:4, high:1},
  dpx16:{ext:"dpx", name:"DPX · 16-bit", bpp:6, high:1},
  cin:  {ext:"cin", name:"Cineon · 10-bit log", bpp:4, high:1},
  exr:  {ext:"exr", name:"OpenEXR · half, linear", bpp:3, high:1},
};
const srcExt=it=>{ const f=it.seq?it.frames[0]:it.file; const m=f&&f.name.match(/\.([^.]+)$/); return m?m[1].toLowerCase():"jpg"; };
/* the format a source is written back as ("Same as source") */
function fmtForSource(it){
  const e=srcExt(it), k=it.seq?it.kind:it.exr?"exr":it.dpx?"dpx":it.raw?"raw":"img";
  if (k==="exr") return "exr";
  if (k==="dpx") return e==="cin" ? "cin" : ((it.info&&it.info.bits)>10 ? "dpx16" : "dpx10");
  if (k==="raw") return "tif16";
  if (e==="png") return it.png16 ? "png16" : "png";
  if (e==="webp") return "webp";
  return "jpg";
}
const fmtFor=(it,choice)=>choice==="src"?fmtForSource(it):choice;

/* ---- reading the graded image back from the GPU ---- */
function renderFloat(){
  renderClean=true; render();
  const w=T.A.w, h=T.A.h, n=w*h; let px;
  gl.bindFramebuffer(gl.FRAMEBUFFER,T.A.fb);
  if (hasFloat){ px=new Float32Array(n*4); gl.readPixels(0,0,w,h,gl.RGBA,gl.FLOAT,px); }
  else { const b=new Uint8Array(n*4); gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,b); px=new Float32Array(n*4); for (let i=0;i<n*4;i++) px[i]=b[i]/255; }
  renderClean=false; render();
  return {w,h,px};   /* RGBA, row 0 = bottom of the image (GL); display-encoded sRGB */
}
const clamp01=v=>v<0?0:v>1?1:v;
const sToLin=v=>{ v=clamp01(v); return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4); };
/* iterate pixels top-first: f(i, r, g, b) with i = output pixel index */
function eachTop(F,f){ const {w,h,px}=F; for (let y=0;y<h;y++){ const s=(h-1-y)*w*4, o=y*w; for (let x=0;x<w;x++){ const k=s+x*4; f(o+x,px[k],px[k+1],px[k+2]); } } }

async function zlib(u8){ const cs=new CompressionStream("deflate"); const wr=cs.writable.getWriter(); wr.write(u8); wr.close(); return new Uint8Array(await new Response(cs.readable).arrayBuffer()); }
const _f=new Float32Array(1), _u=new Uint32Array(_f.buffer);
function toHalf(v){ if (!(v===v)) return 0; _f[0]=v; const x=_u[0], s=(x>>>16)&0x8000; let e=((x>>>23)&0xff)-112, m=x&0x7fffff;
  if (e<=0){ if (e<-10) return s; m=(m|0x800000)>>(1-e); return s|((m+0x1000)>>13); } if (e>=31) return s|0x7bff;
  const hh=s|(e<<10)|(m>>13); return (m&0x1000)?hh+1:hh; }
const ascii=(dv,o,s,n)=>{ for (let i=0;i<n;i++) dv.setUint8(o+i, i<s.length?s.charCodeAt(i)&127:0); };
const nowStr=()=>{ const d=new Date(), p=x=>String(x).padStart(2,"0"); return `${d.getFullYear()}:${p(d.getMonth()+1)}:${p(d.getDate())}:${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };

/* PNG, 16-bit RGB (sRGB chunk), Sub filter, zlib */
async function encPNG16(F){
  const {w,h}=F, row=1+w*6, raw=new Uint8Array(row*h);
  eachTop(F,(i,r,g,b)=>{ const y=(i/w)|0, x=i-y*w, o=y*row+1+x*6; const R=Math.round(clamp01(r)*65535), G=Math.round(clamp01(g)*65535), B=Math.round(clamp01(b)*65535);
    raw[o]=R>>8; raw[o+1]=R&255; raw[o+2]=G>>8; raw[o+3]=G&255; raw[o+4]=B>>8; raw[o+5]=B&255; });
  for (let y=0;y<h;y++){ const o=y*row; raw[o]=1; for (let k=row-1;k>=7;k--) raw[o+k]=(raw[o+k]-raw[o+k-6])&255; }
  const chunk=(type,data)=>{ const c=new Uint8Array(12+data.length), dv=new DataView(c.buffer); dv.setUint32(0,data.length); ascii(dv,4,type,4); c.set(data,8);
    dv.setUint32(8+data.length, crc32(c.subarray(4,8+data.length))); return c; };
  const ih=new Uint8Array(13), dv=new DataView(ih.buffer); dv.setUint32(0,w); dv.setUint32(4,h); ih[8]=16; ih[9]=2;
  const parts=[new Uint8Array([137,80,78,71,13,10,26,10]), chunk("IHDR",ih), chunk("sRGB",new Uint8Array([0])), chunk("IDAT",await zlib(raw)), chunk("IEND",new Uint8Array(0))];
  return concat(parts);
}
const concat=parts=>{ const n=parts.reduce((a,p)=>a+p.length,0), o=new Uint8Array(n); let k=0; for (const p of parts){ o.set(p,k); k+=p.length; } return o; };

/* TIFF, 16-bit RGB, little-endian, uncompressed, one strip */
function encTIFF16(F){
  const {w,h}=F, n=12, ifd=8, extra=ifd+2+n*12+4, bpsOff=extra, resOff=extra+8, dataOff=extra+24, size=dataOff+w*h*6;
  const out=new Uint8Array(size), dv=new DataView(out.buffer); dv.setUint16(0,0x4949); dv.setUint16(2,42,true); dv.setUint32(4,ifd,true); dv.setUint16(ifd,n,true);
  const E=[[256,3,1,w],[257,3,1,h],[258,3,3,bpsOff],[259,3,1,1],[262,3,1,2],[273,4,1,dataOff],[277,3,1,3],[278,3,1,h],[279,4,1,w*h*6],[282,5,1,resOff],[283,5,1,resOff],[296,3,1,2]];
  E.forEach(([tag,type,count,val],k)=>{ const o=ifd+2+k*12; dv.setUint16(o,tag,true); dv.setUint16(o+2,type,true); dv.setUint32(o+4,count,true);
    if (type===3&&count===1) dv.setUint16(o+8,val,true); else dv.setUint32(o+8,val,true); });
  for (let k=0;k<3;k++) dv.setUint16(bpsOff+k*2,16,true); dv.setUint32(resOff,72,true); dv.setUint32(resOff+4,1,true);
  const d=new Uint16Array(out.buffer,dataOff,w*h*3);   /* dataOff is even, so the view is aligned */
  eachTop(F,(i,r,g,b)=>{ d[i*3]=Math.round(clamp01(r)*65535); d[i*3+1]=Math.round(clamp01(g)*65535); d[i*3+2]=Math.round(clamp01(b)*65535); });
  return out;
}
/* DPX (SMPTE 268M), big-endian, RGB, 10-bit filled method A or 16-bit, transfer = Rec.709 video (display-referred) */
function encDPX(F,bits,meta){
  const {w,h}=F, off=2048, row= bits===10 ? w*4 : Math.ceil(w*6/4)*4, size=off+row*h;
  const out=new Uint8Array(size), dv=new DataView(out.buffer); out.fill(0xff,0,off);   /* undefined header fields = all ones */
  ascii(dv,0,"SDPX",4); dv.setUint32(4,off); ascii(dv,8,"V2.0",8); dv.setUint32(16,size); dv.setUint32(20,1); dv.setUint32(24,1664); dv.setUint32(28,384); dv.setUint32(32,0);
  ascii(dv,36,meta.file||"",100); ascii(dv,136,nowStr(),24); ascii(dv,160,"Ernest Lab "+APP_VERSION,100); ascii(dv,260,meta.look||"",200); ascii(dv,460,"",200);   /* 660: encryption key stays 0xFFFFFFFF = none */
  dv.setUint16(768,0); dv.setUint16(770,1); dv.setUint32(772,w); dv.setUint32(776,h);
  dv.setUint32(780,0); dv.setUint32(784,0); dv.setFloat32(788,0); dv.setUint32(792,(1<<bits)-1); dv.setFloat32(796,2.047);
  dv.setUint8(800,50); dv.setUint8(801,6); dv.setUint8(802,6); dv.setUint8(803,bits); dv.setUint16(804,bits===10?1:0); dv.setUint16(806,0);
  dv.setUint32(808,off); dv.setUint32(812,0); dv.setUint32(816,0); ascii(dv,820,"Ernest Lab film look, display-referred",32);
  out.fill(0,1356,1408);
  dv.setUint32(1408,0); dv.setUint32(1412,0); dv.setUint32(1424,w); dv.setUint32(1428,h); ascii(dv,1432,meta.file||"",100); ascii(dv,1532,nowStr(),24);
  ascii(dv,1556,"",32); ascii(dv,1588,"",32); out.fill(0,1620,1628); dv.setUint32(1628,1); dv.setUint32(1632,1); out.fill(0,1644,1664);   /* border 0, pixel aspect 1:1 */
  out.fill(0xff,1664,2048); ascii(dv,1664,"",2); ascii(dv,1666,"",2); ascii(dv,1670,"",6); ascii(dv,1680,"",32);
  if (meta.frame!=null) dv.setUint32(1712,meta.frame); if (meta.fps) dv.setFloat32(1724,meta.fps), dv.setFloat32(1940,meta.fps);
  ascii(dv,1732,"",32); ascii(dv,1764,meta.look||"",100);
  if (bits===10){ eachTop(F,(i,r,g,b)=>{ const R=Math.round(clamp01(r)*1023), G=Math.round(clamp01(g)*1023), B=Math.round(clamp01(b)*1023);
      const y=(i/w)|0, x=i-y*w; dv.setUint32(off+y*row+x*4, ((R<<22)|(G<<12)|(B<<2))>>>0); }); }
  else { eachTop(F,(i,r,g,b)=>{ const y=(i/w)|0, x=i-y*w, o=off+y*row+x*6; dv.setUint16(o,Math.round(clamp01(r)*65535)); dv.setUint16(o+2,Math.round(clamp01(g)*65535)); dv.setUint16(o+4,Math.round(clamp01(b)*65535)); }); }
  return out;
}
/* Cineon, big-endian, 10-bit log (printing density): display light → code, display white = 685, black = 95 */
function encCIN(F,meta){
  const {w,h}=F, off=2048, size=off+w*h*4, out=new Uint8Array(size), dv=new DataView(out.buffer);
  out.fill(0xff,0,off);
  dv.setUint32(0,0x802a5fd7); dv.setUint32(4,off); dv.setUint32(8,1024); dv.setUint32(12,1024); dv.setUint32(16,0); dv.setUint32(20,size);
  ascii(dv,24,"V4.5",8); ascii(dv,32,meta.file||"",100); const t=nowStr(); ascii(dv,132,t.slice(0,10),12); ascii(dv,144,t.slice(11),12); out.fill(0,156,192);
  dv.setUint8(192,0); dv.setUint8(193,3); dv.setUint16(194,0);
  for (let c=0;c<8;c++){ const o=196+c*28; if (c<3){ dv.setUint8(o,0); dv.setUint8(o+1,c+1); dv.setUint8(o+2,10); dv.setUint8(o+3,0); dv.setUint32(o+4,w); dv.setUint32(o+8,h);
      dv.setFloat32(o+12,0); dv.setFloat32(o+16,0); dv.setFloat32(o+20,1023); dv.setFloat32(o+24,2.048); } }
  ascii(dv,452,meta.look||"",200);
  dv.setUint8(680,0); dv.setUint8(681,5); dv.setUint8(682,0); dv.setUint8(683,0); dv.setUint32(684,0); dv.setUint32(688,0); out.fill(0,692,712);
  dv.setInt32(712,0); dv.setInt32(716,0); ascii(dv,720,meta.file||"",100); ascii(dv,820,t.slice(0,10),12); ascii(dv,832,t.slice(11),12); ascii(dv,844,"",64); ascii(dv,908,"",32); ascii(dv,940,"",32); out.fill(0,984,1024);
  if (meta.frame!=null) dv.setUint32(1068,meta.frame); if (meta.fps) dv.setFloat32(1072,meta.fps);
  const bo=Math.pow(10,(95-685)*0.002/0.6), lut=new Uint16Array(4096);
  for (let k=0;k<4096;k++){ const L=sToLin(k/4095); lut[k]=Math.max(0,Math.min(1023,Math.round(685+Math.log10(L*(1-bo)+bo)*0.6/0.002))); }
  const q=v=>lut[Math.round(clamp01(v)*4095)];
  eachTop(F,(i,r,g,b)=>dv.setUint32(off+i*4, ((q(r)<<22)|(q(g)<<12)|(q(b)<<2))>>>0));
  return out;
}
/* OpenEXR: half RGB, linear (sRGB decoded), Rec.709 chromaticities, ZIP (16 scanlines per block) */
async function encEXR(F,meta){
  const {w,h}=F, enc=new TextEncoder(), hdr=[];
  const attr=(name,type,bytes)=>{ hdr.push(enc.encode(name+"\0"+type+"\0")); const s=new Uint8Array(4); new DataView(s.buffer).setInt32(0,bytes.length,true); hdr.push(s,bytes); };
  const B=(n,fill)=>{ const b=new Uint8Array(n), d=new DataView(b.buffer); fill(d); return b; };
  const chl=[]; for (const c of ["B","G","R"]){ chl.push(enc.encode(c+"\0"), B(16,d=>{ d.setInt32(0,1,true); d.setUint8(4,0); d.setInt32(8,1,true); d.setInt32(12,1,true); })); } chl.push(new Uint8Array([0]));
  attr("channels","chlist",concat(chl));
  attr("chromaticities","chromaticities",B(32,d=>[0.64,0.33,0.30,0.60,0.15,0.06,0.3127,0.3290].forEach((v,k)=>d.setFloat32(k*4,v,true))));
  attr("compression","compression",new Uint8Array([3]));
  const box=B(16,d=>{ d.setInt32(0,0,true); d.setInt32(4,0,true); d.setInt32(8,w-1,true); d.setInt32(12,h-1,true); });
  attr("dataWindow","box2i",box); attr("displayWindow","box2i",box);
  if (meta.fps){ const ntsc=meta.fps%1!==0 && Math.abs(meta.fps*1.001-Math.round(meta.fps*1.001))<0.01;   /* 23.976 = 24000/1001 */
    const num=ntsc?Math.round(meta.fps*1.001)*1000:Math.round(meta.fps*1000), den=ntsc?1001:1000;
    attr("framesPerSecond","rational",B(8,d=>{ d.setInt32(0,num,true); d.setUint32(4,den,true); })); }
  attr("lineOrder","lineOrder",new Uint8Array([0]));
  attr("owner","string",enc.encode("Ernest Lab "+APP_VERSION+(meta.look?" · "+meta.look:"")));
  attr("pixelAspectRatio","float",B(4,d=>d.setFloat32(0,1,true)));
  attr("screenWindowCenter","v2f",B(8,()=>{}));
  attr("screenWindowWidth","float",B(4,d=>d.setFloat32(0,1,true)));
  hdr.push(new Uint8Array([0]));
  const head=concat([new Uint8Array([0x76,0x2f,0x31,0x01, 2,0,0,0]), ...hdr]);
  /* pixels: half, linear */
  const half=new Uint16Array(w*h*3), lut=new Uint16Array(65536);
  for (let k=0;k<65536;k++) lut[k]=toHalf(sToLin(k/65535));
  eachTop(F,(i,r,g,b)=>{ half[i*3]=lut[Math.round(clamp01(r)*65535)]; half[i*3+1]=lut[Math.round(clamp01(g)*65535)]; half[i*3+2]=lut[Math.round(clamp01(b)*65535)]; });
  const nb=Math.ceil(h/16), chunks=[], lineBytes=w*2*3;
  for (let bk=0;bk<nb;bk++){
    const y0=bk*16, y1=Math.min(h,y0+16), raw=new Uint8Array((y1-y0)*lineBytes), rv=new DataView(raw.buffer);
    for (let y=y0;y<y1;y++){ const base=(y-y0)*lineBytes; for (let c=0;c<3;c++){ const ch=2-c; /* B, G, R */ for (let x=0;x<w;x++) rv.setUint16(base+(c*w+x)*2, half[(y*w+x)*3+ch], true); } }
    const n=raw.length, t=new Uint8Array(n); let a=0, b2=(n+1)>>1;
    for (let k=0;k<n;k++){ if (k&1) t[b2++]=raw[k]; else t[a++]=raw[k]; }
    for (let k=n-1;k>0;k--) t[k]=(t[k]-t[k-1]+128)&255;
    let data=await zlib(t); if (data.length>=n) data=raw;
    const ch=new Uint8Array(8+data.length), cd=new DataView(ch.buffer); cd.setInt32(0,y0,true); cd.setInt32(4,data.length,true); ch.set(data,8); chunks.push(ch);
  }
  const table=new Uint8Array(nb*8), td=new DataView(table.buffer); let pos=head.length+table.length;
  chunks.forEach((c,k)=>{ td.setBigUint64(k*8,BigInt(pos),true); pos+=c.length; });
  return concat([head,table,...chunks]);
}
/* render the current source to one file of format f */
async function encodeCurrent(f,meta){
  await stockReady();
  if (!XF[f].high){
    const [t,q]= f==="png"?["image/png"]: f==="webp"?["image/webp",0.95]:["image/jpeg",0.95];
    const b=await renderToBlob(t,q); return {data:new Uint8Array(await b.arrayBuffer()), ext: f==="webp"&&b.type!=="image/webp" ? "png" : XF[f].ext};
  }
  const F=renderFloat(); let data;
  if (f==="png16") data=await encPNG16(F); else if (f==="tif16") data=encTIFF16(F);
  else if (f==="dpx10") data=encDPX(F,10,meta); else if (f==="dpx16") data=encDPX(F,16,meta);
  else if (f==="cin") data=encCIN(F,meta); else data=await encEXR(F,meta);
  return {data, ext:XF[f].ext};
}

/* ---- names: one file per source; when two sources would give the same name, the source type is added, then a number ---- */
function exportNames(list,choice){
  const look=slug(presetName), base=it=>it.seq?it.name.replace(/\s*\[.*\]$/,""):it.name, out=new Map(), used=new Set();
  const plain=it=>`${base(it)}_${look}.${XF[fmtFor(it,choice)].ext}`;
  const count={}; for (const it of list) count[plain(it).toLowerCase()]=(count[plain(it).toLowerCase()]||0)+1;
  for (const it of list){
    let nm=plain(it); if (count[nm.toLowerCase()]>1) nm=`${base(it)}_${srcExt(it)}_${look}.${XF[fmtFor(it,choice)].ext}`;
    let k=2, stem=nm.replace(/\.[^.]+$/,""), ext=nm.slice(stem.length); while (used.has(nm.toLowerCase())) nm=`${stem}_${k++}${ext}`;
    used.add(nm.toLowerCase()); out.set(it,it.seq?nm.replace(/\.[^.]+$/,""):nm);   /* sequences: a folder of that name */
  }
  return out;
}
/* ---- where the files go: straight into a folder (Chrome / Edge desktop) or one zip ---- */
const canFolder=()=>!!window.showDirectoryPicker && !window.claude;
async function folderSink(){
  const root=await window.showDirectoryPicker({id:"ernestlab-export",mode:"readwrite"}); let n=0;
  return {kind:"folder", async put(path,data){ const parts=path.split("/"); let d=root; for (const p of parts.slice(0,-1)) d=await d.getDirectoryHandle(p,{create:true});
      const fh=await d.getFileHandle(parts[parts.length-1],{create:true}), wr=await fh.createWritable(); await wr.write(data); await wr.close(); n++; },
    async done(){ toast(`Saved ${n} files into ${root.name}.`,4200); } };
}
function zipSink(name){ const files=[]; return {kind:"zip", async put(path,data){ files.push({name:path,data}); },
  async done(){ await offer(name, makeZip(files)); } }; }
const estBytes=(list,choice)=>list.reduce((a,it)=>a+(it.w||1000)*(it.h||1000)*XF[fmtFor(it,choice)].bpp*(it.seq?it.frames.length:1),0);
async function pickSink(list,choice,zipName){
  const est=estBytes(list,choice), seq=list.some(it=>it.seq);
  if (canFolder() && (seq || est>1e9)){
    toast("Choose a folder: the files are saved straight into it.",3200);
    try{ return await folderSink(); }catch(e){ if (e&&e.name==="AbortError") return null; console.warn(e); }
  }
  if (est>3.5e9){ toast("That's too big for a zip in the browser (over 3.5 GB). Use Chrome or Edge on a computer to save straight into a folder, or export fewer frames.",6000); return null; }
  if (est>1.2e9) toast("This is a big export; the zip is built in memory, so keep this tab in front.",4200);
  return zipSink(zipName);
}
/* ---- one export run over some sources (stills and sequences) ---- */
async function exportMany(list,choice,label,zipName){
  if (vidConv) return; const sink=await pickSink(list,choice,zipName); if (!sink) return;
  const names=exportNames(list,choice), keep=cur, btn=label; let done=0, total=list.reduce((a,it)=>a+(it.seq?it.frames.length:1),0), cancelled=false;
  const box=$("vExp"), T=$("vExpT"), bar=$("vExpBar"); box.hidden=false; bar.style.width="0%"; vidConv={cancel(){ cancelled=true; }};
  try{
    for (const it of list){
      const i=items.indexOf(it), f=fmtFor(it,choice), look=presetName;
      if (it.seq){
        cur=i; if (!(await ensureSource(i))) continue; it.el.pause();
        const pad=it.pad||4, prefix=it.prefix!=null?it.prefix:(it.name.replace(/\s*\[.*\]$/,"")+".");
        for (let k=0;k<it.frames.length;k++){
          if (cancelled) throw Object.assign(new Error("cancelled"),{name:"cancel"});
          const r=await it.el.frame(k); it.el.prefetch(k,3); it.el.idx=k; seqUpload(it,r); grainFrame=k;
          const num=String(it.nums[k]).padStart(pad,"0"), e=await encodeCurrent(f,{frame:it.nums[k],fps:it.fps,look,file:`${prefix}${num}`});
          await sink.put(`${names.get(it)}/${prefix}${num}.${e.ext}`,e.data);
          done++; bar.style.width=Math.round(done/total*100)+"%"; T.textContent=`${it.name}: frame ${k+1} / ${it.frames.length}`;
        }
        grainFrame=0; it.el.idx=0;
      } else {
        if (cancelled) throw Object.assign(new Error("cancelled"),{name:"cancel"});
        cur=i; if (!(await ensureSource(i))) continue;
        T.textContent=`Rendering ${it.name}… (${done+1} / ${total})`;
        const e=await encodeCurrent(f,{look,file:it.name}); let nm=names.get(it); if (!nm.endsWith("."+e.ext)) nm=nm.replace(/\.[^.]+$/,"."+e.ext);
        await sink.put(nm,e.data); done++; bar.style.width=Math.round(done/total*100)+"%";
      }
    }
    const lj=lookJSON(); const dv={}; for (const it of list) if (it.dev && devActive(it.dev)) dv[it.name]=it.dev;
    if (Object.keys(dv).length) lj.development=dv;
    await sink.put("look.json",new TextEncoder().encode(JSON.stringify(lj,null,2)));
    T.textContent= sink.kind==="zip" ? "Zipping…" : "Finishing…"; await sink.done();
  }catch(err){
    if (err && /cancel/i.test(err.name+err.message)) toast("Export cancelled.");
    else { console.error(err); toast(String(err&&err.message||err).slice(0,160),5000); }
  }finally{ vidConv=null; box.hidden=true; select(keep); }
}
/* PNG bit depth, from the file (IHDR byte 24), so "same as source" keeps 16-bit PNGs 16-bit */
async function pngBits(f){ try{ const b=new Uint8Array(await f.slice(0,26).arrayBuffer()); return b[1]===80&&b[2]===78 ? b[24] : 8; }catch(e){ return 8; } }
