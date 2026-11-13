/* Ernest Lab · js/13-help.js · the ? section help cards.
   Classic script (not a module): files load in order from index.html and share one global scope. */
"use strict";
/* ---------------- Section help (v0.8): the physical thing, what you'll see, one thing to try ---------------- */
const HELP={
  dev:  {t:"Development", film:"Before any look, the lab decides the frame (the camera gate, the crop) and develops the negative so it holds detail in the shadows and the highlights.",
         see:"Format crops the frame before the lens effects, so vignette and softness follow the new shape. Profile and Shadows / Midtones / Highlights shape the tones of this photo only.",
         tryit:"2.39 for a cinema frame; Shadows +0.5 on a backlit face."},
  look: {t:"Film stock", film:"Each film stock is a recipe: its own curve, colours, halation and grain, all decided by its chemistry.",
         see:"A preset sets every section at once; Look strength blends it with your photo.",
         tryit:"Start from a stock, adjust it, then save it as your own look."},
  tone: {t:"Exposure & balance", film:"How much light reaches the film (aperture, shutter speed) and the colour of that light: daylight is bluish, tungsten bulbs are orange.",
         see:"Exposure works in stops: +1 doubles the light, −1 halves it. Temperature warms or cools; Tint shifts green ↔ magenta.",
         tryit:"+0.5 to +1 on a dark CG render to open it up; Temperature +0.2 for golden hour."},
  curve:{t:"Film curve", film:"Film answers light in an S shape: a soft toe in the shadows, a straight middle, and a shoulder that squeezes highlights instead of clipping them.",
         see:"Contrast steepens the middle. Highlight roll-off lets lamps and skies fade gently. Black lift and White crush give the faded look of a print.",
         tryit:"Raise Highlight roll-off on a render with hard, clipped lights."},
  color:{t:"Colour", film:"The dyes of each stock render colour their own way, and printing or grading adds tints, like teal shadows and warm highlights.",
         see:"Saturation sets colour strength; Shadow and Highlight tint push a hue into the darks and the brights; an external LUT plugs in your own grade.",
         tryit:"A little teal (≈190°) in the shadows and amber (≈35°) in the highlights: the classic cinema split."},
  bw:   {t:"Black & white", film:"One layer of silver. Its sensitivity decides which colours become which greys, and a coloured filter on the lens changes that mix.",
         see:"Red filter: dark skies, pale skin. Orthochromatic: dark reds and lips. The counts show what your grey is made of.",
         tryit:"Switch the header to R, G or B to predict what a red, green or blue filter will do."},
  hal:  {t:"Halation & bloom", film:"Strong light goes through the emulsion, bounces off the film base and comes back, exposing the red layer again: a warm halo. Bloom is light scattering in the lens and the air.",
         see:"Red-orange glows around lamps, neon and bright edges; bloom softens and glows the brightest areas.",
         tryit:"Night scenes with practical lights: Halation up, Threshold down."},
  lens: {t:"Lens", film:"Real glass isn't perfect: colours focus at slightly different points, and the corners get softer and darker than the centre.",
         see:"Colour fringes on high-contrast edges, softer corners and a vignette that draws the eye to the middle.",
         tryit:"For CG, a little aberration and edge softness hide the too-perfect render. Subtle is best."},
  grain:{t:"Grain", film:"The image is made of tiny silver crystals or dye clouds: bigger in faster film, and every colour layer has its own.",
         see:"An organic texture, strongest in the mid tones. It breaks up banding and the plastic look of CG; on video it changes every frame.",
         tryit:"Pick a grain stock first, then lower Amount until you only just feel it."},
};
function helpCard(key){ const h=HELP[key], c=document.createElement("div"); c.className="helpcard"; c.hidden=true;
  c.innerHTML=`<p><b>On film</b> ${h.film}</p><p><b>You'll see</b> ${h.see}</p><p><b>Try</b> ${h.tryit}</p>`; return c; }
function helpBtn(key,card,onOpen){ const b=document.createElement("button"); b.type="button"; b.className="qh"; b.textContent="?";
  b.setAttribute("aria-label",`What does ${HELP[key].t} do?`); b.setAttribute("aria-expanded","false"); b.title=`What does ${HELP[key].t} do?`;
  b.addEventListener("click",ev=>{ ev.preventDefault(); ev.stopPropagation(); if (onOpen) onOpen(); card.hidden=!card.hidden; b.setAttribute("aria-expanded",String(!card.hidden)); b.classList.toggle("on",!card.hidden); });
  return b; }
function setupHelp(){
  const inSummary=(key,sum)=>{ if (!sum || sum.querySelector(".qh")) return; const det=sum.parentElement, card=helpCard(key), b=helpBtn(key,card,()=>{ det.open=true; });
    const sw=sum.querySelector(".byp"); sw ? sum.insertBefore(b,sw) : sum.appendChild(b); sum.after(card); };
  inSummary("dev", $("tick-dev").parentElement);
  for (const g of GROUPS) if (HELP[g.id]) inSummary(g.id, $("tick-"+g.id).parentElement);
  const pb=document.querySelector(".presetbar"), lab=pb.querySelector('label[for="preset"]'), card=helpCard("look");
  const row=document.createElement("div"); row.className="lookhead"; lab.before(row); row.appendChild(lab); row.appendChild(helpBtn("look",card)); row.after(card);
}


