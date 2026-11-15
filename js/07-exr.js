/* Ernest Lab · js/07-exr.js · OpenEXR stills (decoder in ./exr/).
   Classic script (not a module): files load in order from index.html and share one global scope. */
"use strict";
/* ---------------- EXR (v1.0) ----------------
   CG renders arrive scene-linear, often brighter than white, in the renderer's own primaries. The file is decoded
   in a worker (three.js EXRLoader, patched to pick a layer in multi-layer files) to RGBA half floats and enters the
   pipeline like a RAW (uInXfer=1), with a 3×3 matrix from the file's primaries to the working space (linear Rec.709,
   D65; Bradford for the ACES D60 white). No base exposure: a render is already exposed as its author meant.
   Alpha is ignored on purpose: EXR colour is premultiplied, i.e. already "over black"; dividing by alpha (what makes
   Resolve blow out EXR highlights when Alpha Mode is wrong) is never done here. */
const EXR_EXT=/\.exr$/i;
/* input colour spaces: chromaticities (red xy, green xy, blue xy, white xy) */
const EXR_CS={
  rec709: {name:"Linear Rec.709 / sRGB", hint:"Blender's default (Linear Rec.709), most renderers' default", c:[0.64,0.33,0.30,0.60,0.15,0.06,0.3127,0.3290]},
  acescg: {name:"ACEScg (AP1)", hint:"ACES CG working space (Nuke / Houdini / Maya ACES configs)", c:[0.713,0.293,0.165,0.830,0.128,0.044,0.32168,0.33767]},
  aces:   {name:"ACES2065-1 (AP0)", hint:"ACES interchange / archive EXRs", c:[0.7347,0.2653,0.0,1.0,0.0001,-0.077,0.32168,0.33767]},
  p3:     {name:"Linear P3-D65", hint:"Display P3 primaries, linear", c:[0.680,0.320,0.265,0.690,0.150,0.060,0.3127,0.3290]},
  rec2020:{name:"Linear Rec.2020", hint:"Rec.2020 primaries, linear", c:[0.708,0.292,0.170,0.797,0.131,0.046,0.3127,0.3290]},
};
const m3=(a,b)=>{ const r=[]; for (let i=0;i<3;i++) for (let j=0;j<3;j++){ let s=0; for (let k=0;k<3;k++) s+=a[i*3+k]*b[k*3+j]; r.push(s); } return r; };
const inv3=m=>{ const [a,b,c,d,e,f,g,h,i]=m, A=e*i-f*h, B=-(d*i-f*g), C=d*h-e*g, D=a*A+b*B+c*C;
  return [A/D,-(b*i-c*h)/D,(b*f-c*e)/D, B/D,(a*i-c*g)/D,-(a*f-c*d)/D, C/D,-(a*h-b*g)/D,(a*e-b*d)/D]; };
const mv3=(m,v)=>[m[0]*v[0]+m[1]*v[1]+m[2]*v[2], m[3]*v[0]+m[4]*v[1]+m[5]*v[2], m[6]*v[0]+m[7]*v[1]+m[8]*v[2]];
const xyY=(x,y)=>[x/y,1,(1-x-y)/y];
function rgb2xyz(c){ const P=[0,1,2].map(i=>[xyY(c[0],c[1]),xyY(c[2],c[3]),xyY(c[4],c[5])].map(v=>v[i])).flat(), S=mv3(inv3(P),xyY(c[6],c[7])); return P.map((v,k)=>v*S[k%3]); }
const BRADFORD=[0.8951,0.2664,-0.1614,-0.7502,1.7135,0.0367,0.0389,-0.0685,1.0296];
function bradford(ws,wd){ const s=mv3(BRADFORD,xyY(...ws)), d=mv3(BRADFORD,xyY(...wd)); return m3(inv3(BRADFORD), m3([d[0]/s[0],0,0,0,d[1]/s[1],0,0,0,d[2]/s[2]],BRADFORD)); }
/* row-major 3×3: the file's linear RGB → linear Rec.709 / D65 (checked against colour-science, within 2e-4) */
function csToRec709(c){ const t=EXR_CS.rec709.c; return m3(inv3(rgb2xyz(t)), m3(bradford([c[6],c[7]],[t[6],t[7]]), rgb2xyz(c))); }
const IDENT3=[1,0,0,0,1,0,0,0,1];
/* which space this EXR is in: the user's choice, else the file's own metadata, else Blender's default */
function exrSpace(it,d){
  const pick=d&&d.inCS&&d.inCS!=="auto"?d.inCS:null, inf=it.info||{};
  if (pick) return {key:pick, name:EXR_CS[pick].name, from:"chosen", mat:csToRec709(EXR_CS[pick].c)};
  if (inf.aces===1) return {key:"aces", name:EXR_CS.aces.name, from:"file (ACES container flag)", mat:csToRec709(EXR_CS.aces.c)};
  const ch=inf.chromaticities;
  if (ch){ for (const k in EXR_CS) if (EXR_CS[k].c.every((v,i)=>Math.abs(v-ch[i])<0.002)) return {key:k, name:EXR_CS[k].name, from:"file (chromaticities)", mat:csToRec709(EXR_CS[k].c)};
    return {key:"file", name:"the file's own primaries", from:"file (chromaticities)", mat:csToRec709(ch)}; }
  return {key:"rec709", name:EXR_CS.rec709.name, from:"assumed (no colour metadata in the file)", mat:IDENT3};
}
/* the matrix the scene pass uses for the current source (identity for RAW, which LibRaw already gives in Rec.709) */
function srcInMat(){ const it=srcItem; return it&&(it.exr||it.video||it.dpx) ? srcSpaceOf(it).mat : IDENT3; }

let exrQueue=Promise.resolve(), exrCache=null;   /* one decode at a time; the last decoded still stays in memory */
function exrJob(fn){ const r=exrQueue.then(fn,fn); exrQueue=r.then(()=>{},()=>{}); return r; }
function exrRun(buf,layer){ return new Promise((res,rej)=>{
  const w=new Worker(new URL("exr/worker.js",document.baseURI).href,{type:"module"});
  w.onmessage=e=>{ w.terminate(); e.data.error?rej(new Error(e.data.error)):res(e.data); };
  w.onerror=e=>{ w.terminate(); rej(new Error(e.message||"EXR worker failed")); };
  w.postMessage({buf,layer,maxTex:MAXTEX},[buf]); }); }
const h2f=(()=>{ const t=new Float32Array(65536); for (let h=0;h<65536;h++){ const s=h&0x8000?-1:1, e=(h>>10)&31, m=h&1023;
  t[h]= e===0? s*m*Math.pow(2,-24) : e===31? (m?0:s*65504) : s*Math.pow(2,e-15)*(1+m/1024); } return t; })();
async function exrDecodeRaw(it){
  if (exrCache && exrCache.it===it && exrCache.layer===it.layer) return exrCache.r;
  const r=await exrRun(await it.file.arrayBuffer(), it.layer??null);
  exrCache={it,layer:it.layer,r}; return r;
}
/* thumbnail + histogram, from the decoded data through the file's colour space and the default profile */
async function exrPrepare(it,r){
  const {w:W,h:H,data:d}=r, M=exrSpace(it,it.dev||DEV0).mat, prof=mcurve(EXR_SCENE);
  const n=Math.min(60000,W*H), step=Math.max(1,Math.floor(W*H/n)), lum=new Float32Array(n);
  for (let i=0;i<n;i++){ const k=i*step*4, c=mv3(M,[h2f[d[k]],h2f[d[k+1]],h2f[d[k+2]]]); lum[i]=Math.max(0,0.2126*c[0]+0.7152*c[1]+0.0722*c[2]); }
  it.hist=histFromLum(i=>lum[i],n);
  const sc=Math.min(1,480/Math.max(W,H)), tw=Math.max(1,Math.round(W*sc)), th=Math.max(1,Math.round(H*sc));
  const cv=document.createElement("canvas"); cv.width=tw; cv.height=th; const x=cv.getContext("2d"), im=x.createImageData(tw,th);
  const enc=v=>{ v=Math.min(1,Math.max(0,v)); return 255*(v<=0.0031308?v*12.92:1.055*Math.pow(v,1/2.4)-0.055); };
  for (let y=0;y<th;y++) for (let xx=0;xx<tw;xx++){ const s=(Math.floor(y/sc)*W+Math.floor(xx/sc))*4, o=(y*tw+xx)*4;
    const c=mv3(M,[h2f[d[s]],h2f[d[s+1]],h2f[d[s+2]]]), L=Math.max(1e-6,0.2126*c[0]+0.7152*c[1]+0.0722*c[2]), g=0.18*Math.pow(2,prof(Math.log2(L/0.18)))/L;
    im.data[o]=enc(c[0]*g); im.data[o+1]=enc(c[1]*g); im.data[o+2]=enc(c[2]*g); im.data[o+3]=255; }
  x.putImageData(im,0,0); if (it.url) URL.revokeObjectURL(it.url);
  it.url=URL.createObjectURL(await new Promise(res=>cv.toBlob(res,"image/jpeg",0.85)));
}
/* add-time: decode once (worker), keep the metadata, thumbnail and histogram */
async function exrProbe(f){
  return exrJob(async()=>{
    const it={name:f.name.replace(/\.[^.]+$/,""), exr:true, file:f, url:null, layer:null};
    const r=await exrDecodeRaw(it); it.w=r.w; it.h=r.h; it.info=r.info; it.layer=r.info.layer; exrCache.layer=it.layer;
    await exrPrepare(it,r); return it;
  });
}
/* full decode → RGBA16F data (cached for the last one) */
async function exrDecode(it){
  return exrJob(async()=>{
    const r=await exrDecodeRaw(it); it.info=r.info;
    if (r.info.scale>1) toast(`${it.name} was decoded at 1/${r.info.scale} size (${r.w}×${r.h}), the largest this GPU handles.`);
    return {W:r.w,H:r.h,data:r.data};
  });
}
/* Development rows for EXRs: input colour space and (multi-layer files) which layer */
function exrSync(){
  const it=items[cur], row=$("inCsRow"), lrow=$("layerRow"); if (!row) return;
  const kind=!it?null:it.seq?(it.kind==="exr"?"exr":it.kind==="dpx"?"scan":"video"):it.exr?"exr":it.dpx?"scan":it.video?"video":null;
  const on=!!kind, vid=kind==="video"; row.hidden=!on; $("inCsNote").hidden=!on; lrow.hidden=!(it&&(it.exr||(it.seq&&it.kind==="exr"))&&it.info&&it.info.layers&&it.info.layers.length>1);
  if (!on) return;
  const sel=$("devInCS"), d=curDev();
  if (kind==="scan"){ if (sel.dataset.kind!=="scan"){ sel.dataset.kind="scan"; sel.innerHTML='<option value="auto">Auto</option>'+Object.entries(SCS).map(([k,v])=>`<option value="${k}" title="${v.hint}">${v.name}</option>`).join(""); }
    const sp=scanSpace(it,d), inf=it.info||{};
    sel.options[0].textContent=`Auto: ${scanSpace(it,Object.assign({},d,{inCS:"auto"})).name}`; sel.value=SCS[d.inCS]?d.inCS:"auto";
    $("inCsNote").textContent=`Reading it as ${sp.name}, ${sp.from}. ${inf.bits}-bit${inf.bits===32?" float":""} ${inf.desc||""}, ${inf.endian||""}-endian${inf.fps?`, ${+inf.fps.toFixed(3)} fps in the header`:""}.`
      + (sp.xfer>=1 ? ` Converted to scene-linear light (18 % grey = 0.18), linear Rec.709; highlights above white are kept, and the profile rolls them off.` : ` Display-referred, read like a JPEG (sRGB).`)
      + (inf.alpha ? " Alpha is ignored." : "");
    return; }
  if (sel.dataset.kind!==kind){ sel.dataset.kind=kind; const T=vid?VCS:EXR_CS;
    sel.innerHTML='<option value="auto">Auto</option>'+Object.entries(T).map(([k,v])=>`<option value="${k}" title="${v.hint}">${v.name}</option>`).join(""); }
  if (vid){ const sp=vidSpace(it,d), m=it.vmeta||{};
    sel.options[0].textContent=`Auto: ${vidSpace(it,Object.assign({},d,{inCS:"auto"})).name}`;
    sel.value=VCS[d.inCS]?d.inCS:"auto";
    $("inCsNote").textContent=`Reading it as ${sp.name}, ${sp.from}.`
      + (sp.xfer>=2 ? ` Converted to scene-linear light (18 % grey = 0.18) and the working space (linear Rec.709); highlights above white are kept, and the profile rolls them off.` : ` Display-referred video, read like a JPEG (sRGB).`)
      + (it.dec ? (it.path==="rgb" ? ` This browser hands over its frames as 8-bit RGB, so the extra bits are lost here.` : ` Decoded here at ${m.bits||8} bits${m.alpha?(sp.xfer===0?"; alpha composited over black":"; alpha ignored"):""}.`)
                : (m.bits>8||m.hdr ? ` Previewed through the browser's player (8-bit).` : ""))
      + (sp.xfer>=4 ? ` Log footage: pick the camera's curve here if Auto didn't (files rarely say).` : "");
    return; }
  const sp=exrSpace(it,d);
  sel.options[0].textContent=`Auto: ${sp.from.startsWith("chosen")?exrSpace(it,Object.assign({},d,{inCS:"auto"})).name:sp.name}`;
  sel.value=EXR_CS[d.inCS]?d.inCS:"auto";
  $("inCsNote").textContent=`Reading it as ${sp.name}, ${sp.from}. Converted to the working space (linear Rec.709) with a 3×3 matrix; nothing is clipped. Alpha is ignored: EXR colour is already premultiplied (over black).`;
  if (!lrow.hidden){ const ls=$("devLayer"); ls.innerHTML=""; for (const l of it.info.layers){ const o=document.createElement("option"); o.value=l; o.textContent=l||"(main RGB)"; ls.appendChild(o); } ls.value=it.layer??""; }
}
function buildExrRows(){
  const sel=$("devInCS"); if (!sel) return;
  sel.addEventListener("change",()=>{ setDev("inCS",sel.value); const it=items[cur]; if (it&&it.exr&&exrCache&&exrCache.it===it) exrPrepare(it,exrCache.r).then(buildStrip);
    if (it&&it.dpx&&dpxCache&&dpxCache.it===it) codePrepare(it,dpxCache.r).then(buildStrip); });
  $("devLayer").addEventListener("change",async()=>{ const it=items[cur]; if (!it) return; it.layer=$("devLayer").value; srcItem=null;
    if (await ensureSource(cur)){ await exrPrepare(it,exrCache.r); buildStrip(); syncDev(); schedule(); } });
}
