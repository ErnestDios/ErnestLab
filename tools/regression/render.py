"""Render every built-in preset over the test images at exposure 0 and +1 EV.
Usage: python render.py path/to/index.html out_dir   (needs: pip install playwright pillow numpy; playwright install chromium)
Rendering uses SwiftShader, so it is deterministic: the same build gives identical PNGs."""
import asyncio, base64, sys, json
from playwright.async_api import async_playwright
import os
html, out = os.path.abspath(sys.argv[1]), sys.argv[2]
IMG_DIR=os.path.join(os.path.dirname(os.path.abspath(__file__)),"images")
os.makedirs(out, exist_ok=True)
exps = [0, 1.0]   # also test +1 EV to see headroom behaviour
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=["--use-gl=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg=await b.new_page(); errs=[]; pg.on("pageerror",lambda e: errs.append(str(e)))
        await pg.goto("file://"+html); await pg.wait_for_timeout(1500)
        names=await pg.evaluate("Object.keys(PRESETS)")
        async def shoot(tag):
            for n in names:
                for ex in exps:
                    data=await pg.evaluate("""async ([n,ex])=>{ applyPreset(n,false); base.exp=ex; lookMix=1;
                        const b=await renderToBlob('image/png'); const buf=new Uint8Array(await b.arrayBuffer());
                        let s=''; for(let i=0;i<buf.length;i+=32768) s+=String.fromCharCode.apply(null,buf.subarray(i,i+32768)); return btoa(s); }""",[n,ex])
                    fn=f"{out}/{tag}__{n.replace(' ','_').replace('·','').replace('(','').replace(')','')}__e{ex:+.0f}.png"
                    open(fn,"wb").write(base64.b64decode(data))
        await shoot("sample")
        for img in ["ramp","highkey"]:
            await pg.set_input_files("#fileIn",[f"{IMG_DIR}/{img}.png"]); await pg.wait_for_timeout(600)
            await pg.evaluate("()=>{ while(items.length>1){ removeItem(0); } select(0); }")
            await shoot(img)
        print("presets",len(names),"errors",errs); await b.close()
asyncio.run(main())
