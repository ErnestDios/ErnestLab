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
    ["bwR","Red counts",-1,2,0.01,0.204,""],
    ["bwG","Green counts",-1,2,0.01,0.384,""],
    ["bwB","Blue counts",-1,2,0.01,0.412,""],
  ]},
  {id:"hal", title:"Halation & bloom", params:[
    ["hal","Halation",0,1.5,0.01,0,""],
    ["halThr","Threshold",0.3,0.98,0.01,0.7,""],
    ["halR","Spread",0,1,0.01,0.5,""],
    ["halWarm","Red bias",0,1,0.01,0.6,""],
    ["bloom","Bloom",0,1,0.01,0,""],
    ["halClip","Clipped light",0,6,0.1,0,"EV"],
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
/* Measured grain (v0.9): gStock = a GRAIN_DATA id (0 = grain set by eye, the sliders as before); gGauge = gate width
   in mm. With a measured stock, Amount 1 = the datasheet granularity on that gauge, and how grain changes with
   tone comes from the datasheet (Midtone bias / Shadow grain don't apply). */
DEF.gStock=0; DEF.gGauge=0;
/* Physical halation (v0.9): halPhys = 1 makes the Halation & bloom section physical: no threshold, sizes in mm on film
   (gauge from gGauge, or 35mm still), halation from base reflection into the layers nearest the base, bloom as
   energy-conserving scatter. 0 = the threshold model, as before. */
DEF.halPhys=0;
const NONMIX = ["gStock","gGauge","halPhys","halClip","bwR","bwG","bwB","seed","halThr","halR","halWarm","softStart","vigSize","vigFeather","grainSize","grainCol","grainResp","grainRough","grainShadow","shHue","hiHue","lutMix",
  "gAmtR","gAmtG","gAmtB","gSizeR","gSizeG","gSizeB","gClumpR","gClumpG","gClumpB"];
const MIXABLE = Object.keys(DEF).filter(k => !NONMIX.includes(k));
/* Grain stocks. "· measured": amount, per-layer balance and tone response from Kodak datasheet granularity
   (GRAIN_DATA, js/03-measured.js) on the stock's own gauge; size, colour independence and clumping are still
   chosen by eye (datasheets don't give clump size). The rest are approximations by eye, not measured data.
   Size on a measured stock is physical: 1 = 8 µm on film. */
const MEAS={grain:1,gAmtR:1,gAmtG:1,gAmtB:1,gSizeR:1,gSizeG:1,gSizeB:1,gClumpR:1,gClumpG:1,gClumpB:1};
const GRAIN_STOCKS = {
  "Vision3 50D · Super 35 · measured":    {...MEAS,gStock:1,gGauge:24.89,grainSize:0.9, grainCol:0.15,grainRough:0.15,gSizeG:0.92,gSizeB:1.2},
  "Vision3 250D · Super 35 · measured":   {...MEAS,gStock:2,gGauge:24.89,grainSize:1.25,grainCol:0.22,grainRough:0.3, gSizeG:0.9,gSizeB:1.22},
  "Vision3 500T · Super 35 · measured":   {...MEAS,gStock:3,gGauge:24.89,grainSize:1.6, grainCol:0.3, grainRough:0.45,gSizeG:0.9,gSizeB:1.28},
  "Vision3 500T · Super 16 · measured":   {...MEAS,gStock:4,gGauge:12.52,grainSize:1.6, grainCol:0.3, grainRough:0.45,gSizeG:0.9,gSizeB:1.28},
  "5219 at EI 800 · 35mm still · measured (CineStill 800T-like)": {...MEAS,gStock:5,gGauge:36,grainSize:1.8,grainCol:0.35,grainRough:0.5,gSizeG:0.92,gSizeB:1.35},
  "Ektachrome 100D · 35mm still · measured": {...MEAS,gStock:6,gGauge:36,grainSize:1.0, grainCol:0.2, grainRough:0.15,gSizeG:0.95,gSizeB:1.1},
  "Ektachrome 100D · Super 8 · measured": {...MEAS,gStock:7,gGauge:5.79,grainSize:1.0, grainCol:0.2, grainRough:0.15,gSizeG:0.95,gSizeB:1.1},
  "Tri-X 400 · 35mm still · measured":    {...MEAS,gStock:8,gGauge:36,grainCol:0,grainSize:1.7,grainRough:0.65},
  "Double-X 5222 · Super 35 · measured":  {...MEAS,gStock:9,gGauge:24.89,grainCol:0,grainSize:1.5,grainRough:0.55},
  "Soft 500 · 35mm (Eterna 500-inspired)":     {gStock:0,gGauge:0,grain:0.5, grainSize:1.45,grainCol:0.2, grainResp:0.65,grainRough:0.4, grainShadow:0.4, gAmtR:1.0,gAmtG:0.82,gAmtB:1.35,gSizeR:1.0,gSizeG:0.9,gSizeB:1.25,gClumpR:1.0,gClumpG:0.9,gClumpB:1.2},
  "Portrait 400 (Portra 400-inspired)":           {gStock:0,gGauge:0,grain:0.32,grainSize:1.3, grainCol:0.28,grainResp:0.7, grainRough:0.25,grainShadow:0.3, gAmtR:0.95,gAmtG:0.8,gAmtB:1.25,gSizeR:1.0,gSizeG:0.9,gSizeB:1.2,gClumpR:1.0,gClumpG:0.85,gClumpB:1.15},
  "Everyday 200 (Gold 200-inspired)":             {gStock:0,gGauge:0,grain:0.45,grainSize:1.5, grainCol:0.35,grainResp:0.6, grainRough:0.4, grainShadow:0.35, gAmtR:1.05,gAmtG:0.85,gAmtB:1.4,gSizeR:1.0,gSizeG:0.92,gSizeB:1.3,gClumpR:1.0,gClumpG:0.95,gClumpB:1.25},
  "B&W 400 pushed +2 (HP5-inspired)": {gStock:0,gGauge:0,grain:1.15,grainSize:2.1, grainCol:0,   grainResp:0.4, grainRough:0.8, grainShadow:0.7, gAmtR:1,gAmtG:1,gAmtB:1,gSizeR:1,gSizeG:1,gSizeB:1,gClumpR:1,gClumpG:1,gClumpB:1},
};

/* B&W emulsions (v0.9: derived from spectra). A silver layer adds up the light it receives over wavelength:
   exposure = ∫ reflectance · light · filter · sensitivity dλ. Giving each RGB pixel a spectrum with a linear
   upsampling (Mallett & Yuksel 2019) turns that integral into exactly three weights per film + filter, computed
   offline by tools/spectral/bw_weights.py from Kodak datasheet curves (Tri-X 400, Double-X 5222) and measured
   Wratten filter transmissions, under daylight. Weights are normalised (mid grey stays mid grey); the 4th number
   is what the filter costs in exposure, in stops. Check: computed Tri-X filter factors land within ~0.15 stop of
   Kodak's published table. null = the filter blocks what that film can see (no usable exposure).
   Orthochromatic, blue-sensitive and extended red are modelled from emulsion chemistry on the Tri-X curve;
   infrared can't be computed from RGB (it lives beyond what a pixel records), so it stays a look.
   The table itself (BW_W) is generated into js/03-measured.js. */
const BW_FILMS = {
  pan:   {name:"Panchromatic · Tri-X 400 data", note:"Measured Kodak curve: sees blue strongly (blue counts about 40 %) and dips in the green, so unfiltered skies print pale and foliage a little dark. That pale-sky look is why a yellow filter is the classic default."},
  cine:  {name:"Panchromatic cine · Double-X data", note:"Measured Kodak 5222 curve, the classic black-and-white motion-picture negative: even more blue-leaning than Tri-X. Skies go very light without a filter."},
  ortho: {name:"Orthochromatic (red-blind)", note:"Modelled: the panchromatic curve with the red sensitiser removed (cut at about 590 nm). Reds go nearly black, skin darker and textured, skies pale: the silent-film look. Red filters pass nothing it can see."},
  blue:  {name:"Blue-sensitive (1800s)", note:"Modelled: bare silver bromide, which only absorbs UV and blue (edge near 490 nm). White skies, dark faces and lips, like the earliest portraits. Only a blue filter makes sense; yellow and redder filters starve it."},
  xred:  {name:"Extended red (SFX-type)", note:"Modelled: panchromatic plus a deep-red sensitiser around 700 nm. Skin smooth and light, skies darker even without a filter; a red filter costs little because the film is so red-hungry."},
  ir:    {name:"Infrared-like", w:[0.10,1.40,-0.50], note:"A look, not a computation: real infrared film sees light beyond 700 nm that a pixel never recorded. Foliage glows white and blue skies go black; it's shot through a deep red filter already."},
  eye:   {name:"Digital luminance", w:[0.2126,0.7152,0.0722], note:"The weights a computer uses to desaturate (Rec.709 luminance): the eye's sensitivity, not any film. Same machinery check: the eye curve integrated this way gives exactly these numbers."},
};
const BW_FILTERS = {
  none:   {name:"No filter"},
  yellow: {name:"Yellow (K2 / #8)",       note:"Darkens blue sky a little and lifts clouds: the classic landscape default."},
  dyellow:{name:"Deep yellow (G / #15)",  note:"A stronger sky and haze cut than #8, still natural."},
  orange: {name:"Orange (#21)",           note:"Dramatic skies, smooth skin, haze cut."},
  red:    {name:"Red (#25)",              note:"Near-black skies and bright clouds; foliage darkens; skin goes pale and smooth."},
  dred:   {name:"Deep red (#29)",         note:"The red filter pushed further: skies black, very graphic."},
  green:  {name:"Green (#58)",            note:"Bright foliage, darker lips and skin tones, more freckles."},
  blue:   {name:"Blue (#47)",             note:"Emphasises haze and atmosphere; pale skies, dark reds."},
};
const BW_SPECTRAL = f => !!BW_W[f];
function bwEntry(film,filter){ return BW_SPECTRAL(film) ? BW_W[film][filter]||null : (filter==="none"?[...BW_FILMS[film].w,0]:null); }
function bwW(film,filter){ const e=bwEntry(film,filter)||bwEntry(film,"none"), s=e[0]+e[1]+e[2];
  return {bwR:+(e[0]/s).toFixed(3), bwG:+(e[1]/s).toFixed(3), bwB:+(e[2]/s).toFixed(3)}; }
const BWGRAIN={grainCol:0, gAmtR:1,gAmtG:1,gAmtB:1,gSizeR:1,gSizeG:1,gSizeB:1,gClumpR:1,gClumpG:1,gClumpB:1};   /* silver grain: one layer, no colour */
const PRESETS = {
  "Neutral (no look)": {},
  "Warm Muted": {temp:0.06,con:0.18,roll:0.45,fade:0.065,crush:0.02,gB:0.02,sat:0.78,shHue:195,shAmt:0.07,hiHue:38,hiAmt:0.08,hal:0.35,halThr:0.72,halR:0.55,halWarm:0.6,bloom:0.1,ca:0.35,soft:0.35,softStart:0.45,vig:0.3,vigSize:0.42,vigFeather:0.75,grain:0.55,grainSize:1.5,grainCol:0.2,grainResp:0.6},
  "Cold Muted": {temp:-0.12,tint:0.02,con:0.22,roll:0.45,fade:0.055,crush:0.02,gR:0.01,gB:-0.015,sat:0.78,shHue:205,shAmt:0.09,hiHue:195,hiAmt:0.04,hal:0.22,halThr:0.72,halR:0.5,halWarm:0.25,bloom:0.08,ca:0.3,soft:0.3,softStart:0.45,vig:0.28,vigSize:0.42,vigFeather:0.75,grain:0.5,grainSize:1.45,grainCol:0.2,grainResp:0.6},
  "Daylight 250 (Vision3 250D-inspired)": {temp:0.08,con:0.32,roll:0.35,fade:0.035,crush:0.01,gR:-0.015,gB:0.03,sat:0.9,shHue:190,shAmt:0.06,hiHue:35,hiAmt:0.06,hal:0.08,halR:0.4,bloom:0.07,ca:0.25,soft:0.25,vig:0.22,grain:1,grainSize:1.25,grainCol:0.25,gAmtR:1,gAmtG:1,gAmtB:1,gSizeR:1,gSizeG:0.9,gSizeB:1.22,gClumpR:1,gClumpG:1,gClumpB:1,gStock:2,gGauge:24.89,halPhys:1,halWarm:0.9,halClip:2.5},
  "Tungsten 500 (Vision3 500T-inspired)": {temp:-0.05,con:0.28,roll:0.42,fade:0.05,crush:0.015,gR:-0.01,gB:0.015,sat:0.84,shHue:200,shAmt:0.1,hiHue:30,hiAmt:0.05,hal:0.08,halR:0.4,halWarm:0.9,bloom:0.12,ca:0.3,soft:0.3,vig:0.3,grain:1,grainSize:1.6,grainCol:0.3,gAmtR:1,gAmtG:1,gAmtB:1,gSizeR:1,gSizeG:0.9,gSizeB:1.28,gClumpR:1,gClumpG:1,gClumpB:1,gStock:3,gGauge:24.89,halPhys:1,halClip:3.5},
  "Soft 500 (Eterna 500-inspired)": {temp:-0.02,con:0.08,roll:0.48,fade:0.06,crush:0.02,gR:0.02,gG:-0.012,sat:0.7,shHue:165,shAmt:0.1,hiHue:50,hiAmt:0.04,hal:0.08,bloom:0.06,ca:0.2,soft:0.25,vig:0.25,grain:0.5,grainSize:1.5,grainCol:0.2,gAmtR:1.0,gAmtG:0.82,gAmtB:1.35,gSizeR:1.0,gSizeG:0.9,gSizeB:1.25,gClumpR:1.0,gClumpG:0.9,gClumpB:1.2,gGauge:24.89,halPhys:1,halR:0.4,halWarm:0.85,halClip:3},
  "Portrait 400 (Portra 400-inspired)": {temp:0.12,tint:0.03,con:0.18,roll:0.5,fade:0.04,sat:0.86,gB:0.02,shHue:210,shAmt:0.04,hiHue:30,hiAmt:0.08,hal:0.04,bloom:0.06,vig:0.18,grain:0.35,grainSize:1.3,grainCol:0.3,gAmtR:0.95,gAmtG:0.8,gAmtB:1.25,gSizeR:1.0,gSizeG:0.9,gSizeB:1.2,gClumpR:1.0,gClumpG:0.85,gClumpB:1.15,halPhys:1,halR:0.33,halWarm:0.85,halClip:2.5},
  "Night 800T (CineStill 800T-inspired)": {temp:-0.15,con:0.34,roll:0.38,fade:0.05,crush:0.01,sat:0.95,shHue:195,shAmt:0.08,hiHue:20,hiAmt:0.04,hal:1.0,halR:0.4,halWarm:1,bloom:0.16,ca:0.3,soft:0.2,vig:0.25,grain:1,grainSize:1.8,grainCol:0.35,gAmtR:1,gAmtG:1,gAmtB:1,gSizeR:1,gSizeG:0.92,gSizeB:1.35,gClumpR:1,gClumpG:1,gClumpB:1,gStock:5,gGauge:36,halPhys:1,halClip:4},
  "Slide 100 (Ektachrome 100-inspired)": {temp:-0.02,con:0.5,roll:0.25,fade:0.01,sat:1.15,gB:-0.01,shHue:220,shAmt:0.07,hiHue:45,hiAmt:0.03,hal:0.04,vig:0.2,grain:1,grainSize:1.0,grainCol:0.2,gAmtR:1,gAmtG:1,gAmtB:1,gSizeR:1,gSizeG:0.95,gSizeB:1.1,gClumpR:1,gClumpG:1,gClumpB:1,gStock:6,gGauge:36,halPhys:1,halR:0.33,halWarm:0.85,halClip:2.5},
  "B&W 400 (Tri-X-inspired)": {...bwW("pan","none"),...BWGRAIN,bw:1,con:0.38,roll:0.35,fade:0.03,crush:0.01,hal:0.05,ca:0.2,soft:0.25,vig:0.25,grain:1,grainSize:1.7,grainRough:0.6,gStock:8,gGauge:36,halPhys:1,halR:0.33,halWarm:0,halClip:2.5},
  "B&W 400 pushed +2 (HP5-inspired)": {bw:1,...bwW("pan","yellow"),con:0.62,roll:0.25,fade:0.02,crush:0.02,hal:0.05,halPhys:1,halR:0.33,halWarm:0,ca:0.2,soft:0.25,vig:0.3,...BWGRAIN,grain:1.15,grainSize:2.1,grainResp:0.4,grainRough:0.8,grainShadow:0.7,halClip:3},
  "B&W 100 fine grain (FP4-inspired)": {...bwW("pan","none"),...BWGRAIN,bw:1,con:0.28,roll:0.45,fade:0.02,hal:0.04,vig:0.18,grain:0.3,grainSize:1.1,grainResp:0.55,grainRough:0.3,grainShadow:0.35,halPhys:1,halR:0.33,halWarm:0,halClip:2.5},
  "B&W red filter landscape": {...bwW("pan","red"),...BWGRAIN,bw:1,con:0.45,roll:0.35,fade:0.015,crush:0.01,hal:0.05,vig:0.22,grain:0.45,grainSize:1.4,grainResp:0.5,grainRough:0.4,grainShadow:0.45,halPhys:1,halR:0.33,halWarm:0,halClip:2.5},
  "B&W orthochromatic (silent-era)": {...bwW("ortho","none"),...BWGRAIN,bw:1,con:0.42,roll:0.3,fade:0.05,crush:0.02,hal:0.5,bloom:0.12,ca:0.3,soft:0.4,vig:0.45,vigSize:0.4,grain:0.65,grainSize:1.7,grainResp:0.5,grainRough:0.55,grainShadow:0.5,halPhys:1,halR:0.45,halWarm:0,halClip:3},
  "B&W infrared-like": {...bwW("ir","none"),...BWGRAIN,bw:1,con:0.45,roll:0.3,fade:0.02,hal:1.2,halR:0.5,bloom:0.25,vig:0.3,grain:0.9,grainSize:1.9,grainResp:0.5,grainRough:0.65,grainShadow:0.6,halPhys:1,halWarm:0,halClip:2.5},
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

