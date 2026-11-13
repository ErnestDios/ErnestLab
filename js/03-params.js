/* Ernest Lab · js/03-params.js · look parameters, B&W films and filters, grain stocks, presets.
   Classic script (not a module): files load in order from index.html and share one global scope. */
"use strict";
/* ---------------- Parameters ---------------- */
const GROUPS = [
  {id:"tone", title:"Exposure & balance", params:[
    ["exp","Exposure",-2,2,0.01,0,"EV"],
    ["temp","Temperature",-1,1,0.01,0,""],
    ["tint","Tint",-1,1,0.01,0,""],
  ]},
  {id:"curve", title:"Film curve", params:[
    ["con","Contrast",-1,1,0.01,0,""],
    ["roll","Highlight roll-off",0,1,0.01,0,""],
    ["fade","Black lift",0,0.2,0.001,0,""],
    ["crush","White crush",0,0.2,0.001,0,""],
    ["gR","Red gamma",-0.15,0.15,0.001,0,""],
    ["gG","Green gamma",-0.15,0.15,0.001,0,""],
    ["gB","Blue gamma",-0.15,0.15,0.001,0,""],
  ]},
  {id:"color", title:"Colour", params:[
    ["sat","Saturation",0,1.6,0.01,1,""],
    ["shHue","Shadow hue",0,360,1,200,"°"],
    ["shAmt","Shadow tint",0,0.3,0.001,0,""],
    ["hiHue","Highlight hue",0,360,1,35,"°"],
    ["hiAmt","Highlight tint",0,0.3,0.001,0,""],
    ["lutMix","External LUT",0,1,0.01,1,""],
  ]},
  /* Black & white (v0.7): a single silver layer sees colour through its spectral sensitivity and the lens filter.
     bwR/G/B = how much each colour counts towards the grey (set by the Film and Filter pickers, or by hand). */
  {id:"bw", title:"Black & white", params:[
    ["bw","Black & white",0,1,0.01,0,""],
    ["bwR","Red counts",-1,2,0.01,0.28,""],
    ["bwG","Green counts",-1,2,0.01,0.5,""],
    ["bwB","Blue counts",-1,2,0.01,0.22,""],
  ]},
  {id:"hal", title:"Halation & bloom", params:[
    ["hal","Halation",0,1.5,0.01,0,""],
    ["halThr","Threshold",0.3,0.98,0.01,0.7,""],
    ["halR","Spread",0,1,0.01,0.5,""],
    ["halWarm","Red bias",0,1,0.01,0.6,""],
    ["bloom","Bloom",0,1,0.01,0,""],
  ]},
  {id:"lens", title:"Lens", params:[
    ["ca","Chromatic ab.",0,2,0.01,0,""],
    ["soft","Edge softness",0,1,0.01,0,""],
    ["softStart","Soft from",0,0.9,0.01,0.45,""],
    ["vig","Vignette",0,1,0.01,0,""],
    ["vigSize","Vignette size",0.1,1,0.01,0.45,""],
    ["vigFeather","Vignette feather",0.1,1.2,0.01,0.7,""],
  ]},
  {id:"grain", title:"Grain", params:[
    ["grain","Amount",0,2,0.01,0,""],
    ["grainSize","Size",0.6,4,0.01,1.4,""],
    ["grainCol","Colour grain",0,1,0.01,0.25,""],
    ["grainResp","Midtone bias",0,1,0.01,0.6,""],
    ["grainRough","Clumping",0,1,0.01,0.35,""],
    ["grainShadow","Shadow grain",0,1,0.01,0.3,""],
    ["seed","Seed",0,99,1,7,""],
    /* Emulsion layers (R/G/B colour records): multipliers on the masters above. Colour-negative defaults:
       green finest, blue coarsest and noisiest. */
    ["gAmtR","Red amount",0,2,0.01,1.0,"×","layer"],
    ["gAmtG","Green amount",0,2,0.01,0.8,"×","layer"],
    ["gAmtB","Blue amount",0,2,0.01,1.35,"×","layer"],
    ["gSizeR","Red size",0.5,2,0.01,1.0,"×","layer"],
    ["gSizeG","Green size",0.5,2,0.01,0.9,"×","layer"],
    ["gSizeB","Blue size",0.5,2,0.01,1.25,"×","layer"],
    ["gClumpR","Red clumping",0,2,0.01,1.0,"×","layer"],
    ["gClumpG","Green clumping",0,2,0.01,0.9,"×","layer"],
    ["gClumpB","Blue clumping",0,2,0.01,1.2,"×","layer"],
  ]},
];
const DEF = {};
for (const g of GROUPS) for (const p of g.params) DEF[p[0]] = p[5];
const NONMIX = ["bwR","bwG","bwB","seed","halThr","halR","halWarm","softStart","vigSize","vigFeather","grainSize","grainCol","grainResp","grainRough","grainShadow","shHue","hiHue","lutMix",
  "gAmtR","gAmtG","gAmtB","gSizeR","gSizeG","gSizeB","gClumpR","gClumpG","gClumpB"];
const MIXABLE = Object.keys(DEF).filter(k => !NONMIX.includes(k));
/* Grain stocks: emulations of each stock's grain character (amount, size, dye-cloud colour, clumping, shadow grain)
   and its emulsion layers (R/G/B amount, size, clumping multipliers). Approximations by eye, not measured data. */
const GRAIN_STOCKS = {
  "Daylight 50 · 35mm (Vision3 50D-inspired)":   {grain:0.18,grainSize:0.9, grainCol:0.15,grainResp:0.55,grainRough:0.15,grainShadow:0.25, gAmtR:1.0,gAmtG:0.85,gAmtB:1.25,gSizeR:1.0,gSizeG:0.92,gSizeB:1.2,gClumpR:1.0,gClumpG:0.9,gClumpB:1.15},
  "Daylight 250 · 35mm (Vision3 250D-inspired)":  {grain:0.35,grainSize:1.25,grainCol:0.22,grainResp:0.6, grainRough:0.3, grainShadow:0.3, gAmtR:1.0,gAmtG:0.8,gAmtB:1.3,gSizeR:1.0,gSizeG:0.9,gSizeB:1.22,gClumpR:1.0,gClumpG:0.9,gClumpB:1.2},
  "Tungsten 500 · 35mm (Vision3 500T-inspired)":  {grain:0.6, grainSize:1.6, grainCol:0.3, grainResp:0.6, grainRough:0.45,grainShadow:0.45, gAmtR:1.0,gAmtG:0.8,gAmtB:1.4,gSizeR:1.0,gSizeG:0.9,gSizeB:1.28,gClumpR:1.0,gClumpG:0.9,gClumpB:1.25},
  "Soft 500 · 35mm (Eterna 500-inspired)":     {grain:0.5, grainSize:1.45,grainCol:0.2, grainResp:0.65,grainRough:0.4, grainShadow:0.4, gAmtR:1.0,gAmtG:0.82,gAmtB:1.35,gSizeR:1.0,gSizeG:0.9,gSizeB:1.25,gClumpR:1.0,gClumpG:0.9,gClumpB:1.2},
  "Portrait 400 (Portra 400-inspired)":           {grain:0.32,grainSize:1.3, grainCol:0.28,grainResp:0.7, grainRough:0.25,grainShadow:0.3, gAmtR:0.95,gAmtG:0.8,gAmtB:1.25,gSizeR:1.0,gSizeG:0.9,gSizeB:1.2,gClumpR:1.0,gClumpG:0.85,gClumpB:1.15},
  "Everyday 200 (Gold 200-inspired)":             {grain:0.45,grainSize:1.5, grainCol:0.35,grainResp:0.6, grainRough:0.4, grainShadow:0.35, gAmtR:1.05,gAmtG:0.85,gAmtB:1.4,gSizeR:1.0,gSizeG:0.92,gSizeB:1.3,gClumpR:1.0,gClumpG:0.95,gClumpB:1.25},
  "Night 800T (CineStill 800T-inspired)":             {grain:0.72,grainSize:1.8, grainCol:0.35,grainResp:0.55,grainRough:0.5, grainShadow:0.55, gAmtR:1.05,gAmtG:0.85,gAmtB:1.5,gSizeR:1.0,gSizeG:0.92,gSizeB:1.35,gClumpR:1.0,gClumpG:0.95,gClumpB:1.3},
  "Slide 100 (Ektachrome 100-inspired)":       {grain:0.2, grainSize:1.0, grainCol:0.2, grainResp:0.45,grainRough:0.15,grainShadow:0.15, gAmtR:0.95,gAmtG:0.9,gAmtB:1.1,gSizeR:1.0,gSizeG:0.95,gSizeB:1.1,gClumpR:1.0,gClumpG:0.95,gClumpB:1.05},
  "Classic B&W 400 (Tri-X 400-inspired)":      {grain:0.8, grainSize:1.7, grainCol:0,   grainResp:0.5, grainRough:0.65,grainShadow:0.4, gAmtR:1,gAmtG:1,gAmtB:1,gSizeR:1,gSizeG:1,gSizeB:1,gClumpR:1,gClumpG:1,gClumpB:1},
  "B&W 400 pushed +2 (HP5-inspired)": {grain:1.15,grainSize:2.1, grainCol:0,   grainResp:0.4, grainRough:0.8, grainShadow:0.7, gAmtR:1,gAmtG:1,gAmtB:1,gSizeR:1,gSizeG:1,gSizeB:1,gClumpR:1,gClumpG:1,gClumpB:1},
  "Tungsten 500 · 16mm (7219-inspired)":          {grain:1.0, grainSize:2.4, grainCol:0.35,grainResp:0.55,grainRough:0.6, grainShadow:0.6, gAmtR:1.0,gAmtG:0.8,gAmtB:1.4,gSizeR:1.0,gSizeG:0.9,gSizeB:1.28,gClumpR:1.0,gClumpG:0.9,gClumpB:1.25},
  "Reversal · Super 8 (Ektachrome-inspired)":       {grain:1.35,grainSize:3.1, grainCol:0.4, grainResp:0.45,grainRough:0.75,grainShadow:0.5, gAmtR:1.0,gAmtG:0.9,gAmtB:1.2,gSizeR:1.0,gSizeG:0.95,gSizeB:1.15,gClumpR:1.0,gClumpG:0.95,gClumpB:1.1},
};

/* B&W emulsions as RGB weights: how much each colour record counts towards the grey. Approximations of each
   emulsion type's spectral sensitivity (RGB can't hold a spectrum), by eye from published curves, not measured. */
const BW_FILMS = {
  pan:   {name:"Panchromatic (Tri-X, HP5)", w:[0.28,0.50,0.22], note:"Sees the whole spectrum, a little more blue and less green than your eye: skies a touch lighter, foliage a touch darker."},
  ortho: {name:"Orthochromatic (red-blind)",       w:[0.02,0.55,0.43], note:"Blue and green only: reds go nearly black, skin darker and textured, skies pale. The silent-film look."},
  blue:  {name:"Blue-sensitive (1800s)",     w:[0.00,0.12,0.88], note:"Plain silver: blue and UV only. White skies, dark faces and lips, like the earliest portraits."},
  xred:  {name:"Extended red (SFX)",          w:[0.45,0.40,0.15], note:"Panchromatic with extra red: skin smooth and light, skies darker even without a filter."},
  ir:    {name:"Infrared-like",        w:[0.10,1.40,-0.50], note:"Foliage glows white and blue skies go black. Real infrared film sees light RGB can't hold, so this imitates the look; it's shot through a deep red filter already."},
  eye:   {name:"Digital luminance",     w:[0.2126,0.7152,0.0722], note:"The weights a computer uses to desaturate: matched to the eye, not to any film."},
};
const BW_FILTERS = {
  none:  {name:"No filter",              t:[1,1,1],          stops:0},
  yellow:{name:"Yellow (K2 / #8)",       t:[1,0.92,0.30],    stops:1,   note:"Darkens blue sky a little and lifts clouds: the classic landscape default."},
  orange:{name:"Orange (#21)",           t:[1,0.55,0.10],    stops:2,   note:"Dramatic skies, smooth skin, haze cut."},
  red:   {name:"Red (#25)",              t:[1,0.10,0.02],    stops:3,   note:"Near-black skies and bright clouds; foliage darkens; skin goes pale and smooth."},
  dred:  {name:"Deep red (#29)",         t:[1,0.04,0.01],    stops:4,   note:"The red filter pushed further: skies black, very graphic."},
  ygreen:{name:"Yellow-green (X1 / #11)",t:[0.55,1,0.35],    stops:2,   note:"Lighter foliage and natural skin under daylight; slightly darker skies."},
  green: {name:"Green (#58)",            t:[0.20,1,0.15],    stops:2.5, note:"Bright foliage, darker lips and skin tones, more freckles."},
  blue:  {name:"Blue (#47)",             t:[0.10,0.30,1],    stops:2.5, note:"Emphasises haze and atmosphere; pale skies, dark reds."},
};
function bwW(film,filter){ const f=BW_FILMS[film].w, t=film==="ir"?[1,1,1]:BW_FILTERS[filter].t, w=f.map((v,i)=>v*t[i]), s=w[0]+w[1]+w[2];
  return {bwR:+(w[0]/s).toFixed(3), bwG:+(w[1]/s).toFixed(3), bwB:+(w[2]/s).toFixed(3)}; }
const BWGRAIN={grainCol:0, gAmtR:1,gAmtG:1,gAmtB:1,gSizeR:1,gSizeG:1,gSizeB:1,gClumpR:1,gClumpG:1,gClumpB:1};   /* silver grain: one layer, no colour */
const PRESETS = {
  "Neutral (no look)": {},
  "Warm Muted": {temp:0.06,con:0.18,roll:0.45,fade:0.065,crush:0.02,gB:0.02,sat:0.78,shHue:195,shAmt:0.07,hiHue:38,hiAmt:0.08,hal:0.35,halThr:0.72,halR:0.55,halWarm:0.6,bloom:0.1,ca:0.35,soft:0.35,softStart:0.45,vig:0.3,vigSize:0.42,vigFeather:0.75,grain:0.55,grainSize:1.5,grainCol:0.2,grainResp:0.6},
  "Cold Muted": {temp:-0.12,tint:0.02,con:0.22,roll:0.45,fade:0.055,crush:0.02,gR:0.01,gB:-0.015,sat:0.78,shHue:205,shAmt:0.09,hiHue:195,hiAmt:0.04,hal:0.22,halThr:0.72,halR:0.5,halWarm:0.25,bloom:0.08,ca:0.3,soft:0.3,softStart:0.45,vig:0.28,vigSize:0.42,vigFeather:0.75,grain:0.5,grainSize:1.45,grainCol:0.2,grainResp:0.6},
  "Daylight 250 (Vision3 250D-inspired)": {temp:0.08,con:0.32,roll:0.35,fade:0.035,crush:0.01,gR:-0.015,gB:0.03,sat:0.9,shHue:190,shAmt:0.06,hiHue:35,hiAmt:0.06,hal:0.25,halThr:0.75,halR:0.5,bloom:0.07,ca:0.25,soft:0.25,vig:0.22,grain:0.4,grainSize:1.35,grainCol:0.25,gAmtR:1.0,gAmtG:0.8,gAmtB:1.3,gSizeR:1.0,gSizeG:0.9,gSizeB:1.22,gClumpR:1.0,gClumpG:0.9,gClumpB:1.2},
  "Tungsten 500 (Vision3 500T-inspired)": {temp:-0.05,con:0.28,roll:0.42,fade:0.05,crush:0.015,gR:-0.01,gB:0.015,sat:0.84,shHue:200,shAmt:0.1,hiHue:30,hiAmt:0.05,hal:0.45,halThr:0.66,halR:0.6,halWarm:0.7,bloom:0.12,ca:0.3,soft:0.3,vig:0.3,grain:0.65,grainSize:1.7,grainCol:0.3,gAmtR:1.0,gAmtG:0.8,gAmtB:1.4,gSizeR:1.0,gSizeG:0.9,gSizeB:1.28,gClumpR:1.0,gClumpG:0.9,gClumpB:1.25},
  "Soft 500 (Eterna 500-inspired)": {temp:-0.02,con:0.08,roll:0.48,fade:0.06,crush:0.02,gR:0.02,gG:-0.012,sat:0.7,shHue:165,shAmt:0.1,hiHue:50,hiAmt:0.04,hal:0.2,halThr:0.72,bloom:0.06,ca:0.2,soft:0.25,vig:0.25,grain:0.5,grainSize:1.5,grainCol:0.2,gAmtR:1.0,gAmtG:0.82,gAmtB:1.35,gSizeR:1.0,gSizeG:0.9,gSizeB:1.25,gClumpR:1.0,gClumpG:0.9,gClumpB:1.2},
  "Portrait 400 (Portra 400-inspired)": {temp:0.12,tint:0.03,con:0.18,roll:0.5,fade:0.04,sat:0.86,gB:0.02,shHue:210,shAmt:0.04,hiHue:30,hiAmt:0.08,hal:0.15,halThr:0.75,bloom:0.06,vig:0.18,grain:0.35,grainSize:1.3,grainCol:0.3,gAmtR:0.95,gAmtG:0.8,gAmtB:1.25,gSizeR:1.0,gSizeG:0.9,gSizeB:1.2,gClumpR:1.0,gClumpG:0.85,gClumpB:1.15},
  "Night 800T (CineStill 800T-inspired)": {temp:-0.15,con:0.34,roll:0.38,fade:0.05,crush:0.01,sat:0.95,shHue:195,shAmt:0.08,hiHue:20,hiAmt:0.04,hal:0.95,halThr:0.55,halR:0.65,halWarm:1,bloom:0.16,ca:0.3,soft:0.2,vig:0.25,grain:0.7,grainSize:1.8,grainCol:0.35,gAmtR:1.05,gAmtG:0.85,gAmtB:1.5,gSizeR:1.0,gSizeG:0.92,gSizeB:1.35,gClumpR:1.0,gClumpG:0.95,gClumpB:1.3},
  "Slide 100 (Ektachrome 100-inspired)": {temp:-0.02,con:0.5,roll:0.25,fade:0.01,sat:1.15,gB:-0.01,shHue:220,shAmt:0.07,hiHue:45,hiAmt:0.03,hal:0.1,halThr:0.8,vig:0.2,grain:0.22,grainSize:1.1,grainCol:0.2,gAmtR:0.95,gAmtG:0.9,gAmtB:1.1,gSizeR:1.0,gSizeG:0.95,gSizeB:1.1,gClumpR:1.0,gClumpG:0.95,gClumpB:1.05},
  "B&W 400 (Tri-X-inspired)": {bw:1,...bwW("pan","none"),con:0.38,roll:0.35,fade:0.03,crush:0.01,hal:0.12,halThr:0.75,ca:0.2,soft:0.25,vig:0.25,...BWGRAIN,grain:0.75,grainSize:1.8,grainResp:0.5,grainRough:0.6,grainShadow:0.6},
  "B&W 400 pushed +2 (HP5-inspired)": {bw:1,...bwW("pan","yellow"),con:0.62,roll:0.25,fade:0.02,crush:0.02,hal:0.15,halThr:0.72,ca:0.2,soft:0.25,vig:0.3,...BWGRAIN,grain:1.15,grainSize:2.1,grainResp:0.4,grainRough:0.8,grainShadow:0.7},
  "B&W 100 fine grain (FP4-inspired)": {bw:1,...bwW("pan","none"),con:0.28,roll:0.45,fade:0.02,hal:0.08,vig:0.18,...BWGRAIN,grain:0.3,grainSize:1.1,grainResp:0.55,grainRough:0.3,grainShadow:0.35},
  "B&W red filter landscape": {bw:1,...bwW("pan","red"),con:0.45,roll:0.35,fade:0.015,crush:0.01,hal:0.1,vig:0.22,...BWGRAIN,grain:0.45,grainSize:1.4,grainResp:0.5,grainRough:0.4,grainShadow:0.45},
  "B&W orthochromatic (silent-era)": {bw:1,...bwW("ortho","none"),con:0.42,roll:0.3,fade:0.05,crush:0.02,hal:0.3,halThr:0.65,bloom:0.12,ca:0.3,soft:0.4,vig:0.45,vigSize:0.4,...BWGRAIN,grain:0.65,grainSize:1.7,grainResp:0.5,grainRough:0.55,grainShadow:0.5},
  "B&W infrared-like": {bw:1,...bwW("ir","none"),con:0.45,roll:0.3,fade:0.02,hal:0.6,halThr:0.6,halR:0.7,bloom:0.25,vig:0.3,...BWGRAIN,grain:0.9,grainSize:1.9,grainResp:0.5,grainRough:0.65,grainShadow:0.6},
  "B&W selenium print": {bw:1,...bwW("pan","yellow"),con:0.4,roll:0.35,fade:0.02,shHue:255,shAmt:0.05,hiHue:40,hiAmt:0.01,vig:0.2,...BWGRAIN,grain:0.5,grainSize:1.5,grainResp:0.5,grainRough:0.45,grainShadow:0.5},
  "B&W sepia print": {bw:1,...bwW("pan","none"),con:0.3,roll:0.4,fade:0.05,crush:0.03,shHue:28,shAmt:0.12,hiHue:42,hiAmt:0.1,vig:0.3,...BWGRAIN,grain:0.55,grainSize:1.6,grainResp:0.5,grainRough:0.5,grainShadow:0.5},
  "Bleach bypass": {con:0.7,roll:0.2,fade:0.02,sat:0.45,shHue:200,shAmt:0.05,hiHue:45,hiAmt:0.02,hal:0.1,ca:0.2,soft:0.2,vig:0.35,grain:0.5,grainSize:1.5,grainCol:0.1},
};

let userLooks = {};
/* Storage keys keep the original "filmlab." prefix so looks saved before the rename stay available. */
try { userLooks = JSON.parse(localStorage.getItem("filmlab.looks") || "{}"); } catch(e) { userLooks = {}; }
function saveUserLooks(){ try { localStorage.setItem("filmlab.looks", JSON.stringify(userLooks)); } catch(e){} }

let base = Object.assign({}, DEF);      // values chosen in sliders
const DEFAULT_LOOK = "Neutral (no look)";   /* v0.6: start clean; pick a look on purpose */
let presetName = DEFAULT_LOOK;
let lookMix = 1;
let presetVals = Object.assign({}, DEF);
let gsName = "";

