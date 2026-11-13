# Regression test (v0.6.1): the first frame after a tone-curve change must equal the next frame.
# Uploading the curve LUT used to clobber the texture unit of the photo mid-pass. Usage: python3 curve_change_test.py index.html
import asyncio
from playwright.async_api import async_playwright
JS="""async()=>{
  const snap=()=>{ render(); const c=document.createElement('canvas'); c.width=64; c.height=36; c.getContext('2d').drawImage(canvas,0,0,64,36); return c.getContext('2d').getImageData(0,0,64,36).data; };
  const diff=(a,b)=>{ let m=0; for (let i=0;i<a.length;i++) m=Math.max(m,Math.abs(a[i]-b[i])); return m; };
  const out=[];
  for (const pts of [[[-6,-6],[-2,-1.5],[0,0.3],[3,3]], [[-6,-6.5],[0,0],[2,1.4],[4,2.2]], [[-5,-5],[1,1.6],[3,2.5]]]){
    setCurve(pts); const a=snap(); const b=snap();     // first frame after the change vs the next frame
    out.push(diff(a,b));
  }
  return out; }"""
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(args=["--use-gl=swiftshader","--enable-unsafe-swiftshader"])
    import sys
    for f in sys.argv[1:]:
      pg=await b.new_page(viewport={"width":1440,"height":900}); await pg.goto("file://"+__import__("os").path.abspath(f)); await pg.wait_for_timeout(2500)
      print(f, "max pixel difference, frame after a curve change vs next frame:", await pg.evaluate(JS)); await pg.close()
    await b.close()
asyncio.run(main())
