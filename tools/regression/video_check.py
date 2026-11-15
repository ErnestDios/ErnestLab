#!/usr/bin/env python3
"""Reads the scene-linear values of the video_samples.py clips back out of Ernest Lab (scene pass, Flat profile) and
prints the error per grey patch in stops and per colour patch (linear). v1.2: all transfers within ~0.05 stop."""
import asyncio, json, sys, math
from playwright.async_api import async_playwright
import os
APP=os.environ.get("APP","http://localhost:8790/ernestlab/index.html")   # serve the app; run from the folder with the clips
ARGS=["--use-gl=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"]
CASES=[("h264_sdr.mp4","auto"),("prores422hq_sdr.mov","auto"),("prores4444_alpha.mov","auto"),("vp9_hlg10.webm","auto"),("prores422_hlg.mov","auto"),
       ("prores422_applelog.mov","applelog"),("prores422_slog3.mov","slog3"),("prores422_logc3.mov","logc3"),("hevc_hlg10.mp4","auto"),("hevc_sdr8.mp4","auto")]
GREYS=[0.18*2**s for s in range(-6,4)]
COLS=[(0.30,0.05,0.04),(0.05,0.25,0.06),(0.04,0.06,0.30),(0.30,0.25,0.04),(0.05,0.22,0.28),(0.28,0.06,0.25)]
READ="""async (cs)=>{ const it=items[cur]; it.dev=Object.assign({},DEV0,{profile:'flat',inCS:cs}); applyPreset('Neutral (no look)',false); syncUI(); syncDev();
  await new Promise(r=>setTimeout(r,300)); render();
  const e=effective(), cr=cropRect(curDev(),srcW,srcH);
  drawTo(T.A,P.scene,u=>{ bindTex(0,srcTex); gl.uniform1i(u.uSrc,0); gl.uniform1i(u.uInXfer,srcXfer); gl.uniformMatrix3fv(u.uInMat,true,srcInMat()); gl.uniform4f(u.uCrop,cr.x,cr.y,cr.w,cr.h); setSceneUniforms(u,e,curDev(),profileFor(items[cur],curDev())); });
  const px=(x,y)=>{ const b=new Float32Array(4); gl.bindFramebuffer(gl.FRAMEBUFFER,T.A.fb); gl.readPixels(x,srcH-1-y,1,1,gl.RGBA,gl.FLOAT,b); return [...b].slice(0,3); };
  const g=[...Array(10).keys()].map(i=>px(Math.round((i+0.5)*128),120)), c=[...Array(6).keys()].map(i=>px(Math.round((i+0.5)*213),330));
  return {name:it.name, dec:!!it.dec, path:it.path||null, meta:$('meta').textContent, note:$('inCsNote').textContent, xfer:srcXfer, W:srcW, H:srcH, g, c,
          tl:px(5,5), ramp:[...Array(9).keys()].map(i=>px(80+i*140,510)[1])}; }"""
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(args=ARGS); pg=await b.new_page(); errs=[]
    pg.on("pageerror",lambda e: errs.append(str(e))); pg.on("console",lambda m: errs.append("console: "+m.text) if m.type in("error","warning") else None)
    await pg.add_init_script("localStorage.setItem('filmlab.guideSeen','1')")
    await pg.goto(APP); await pg.wait_for_timeout(2500)
    for f,cs in (CASES if len(sys.argv)<2 else [c for c in CASES if c[0] in sys.argv[1:]]):
      n0=await pg.evaluate("items.length")
      await pg.set_input_files("#fileIn",[f])
      stem=f.rsplit('.',1)[0]
      try: await pg.wait_for_function(f"items.some(x=>x.name==={stem!r})",timeout=60000)
      except Exception as e:
        print(f, "NOT ADDED; toast:", await pg.evaluate("$('toast')?$('toast').textContent:''")); errs.clear(); continue
      await pg.evaluate(f"select(items.findIndex(x=>x.name==={stem!r}))"); await pg.wait_for_timeout(2500)
      r=await pg.evaluate(READ,cs)
      ge=[ (math.log2(max(v[1],1e-6)/GREYS[i]) if GREYS[i]<=1 or r['xfer']>=2 else None) for i,v in enumerate(r['g'])]
      ce=max(max(abs(a-b2) for a,b2 in zip(v,COLS[i])) for i,v in enumerate(r['c']))
      print(f"\n{f}: dec={r['dec']} path={r['path']} xfer={r['xfer']} {r['W']}x{r['H']}\n  meta: {r['meta']}\n  note: {r['note'][:200]}")
      print("  grey err (stops):", [None if e is None else round(e,3) for e in ge])
      print("  colour max abs err:", round(ce,4), " top-left:", [round(x,3) for x in r['tl']], " ramp G:", [round(x,4) for x in r['ramp']])
      if errs: print("  ERRORS:", errs[:4]); errs.clear()
    await b.close()
asyncio.run(main())
