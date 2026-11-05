// Builds deck/STF_jamming_analysis.pptx (structured deck: theme, layouts, sections, notes).
//   NODE_PATH=<dir with pptxgenjs, react-icons, react, react-dom, sharp> \
//   PPTX_SKILL=<pptx skill dir with scripts/apply_theme.js> node deck/build_deck.js
const path = require("path");
const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const fa = require("react-icons/fa");

const ROOT = path.resolve(__dirname, "..");
const FIG = (f) => path.join(ROOT, "deck", "fig", f);
const RES = (f) => path.join(ROOT, "results", f);
const OUT = path.join(ROOT, "deck", "STF_jamming_analysis.pptx");

const THEME = {
  name: "STF Jamming",
  headFontFace: "Cambria",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "1B2430", lt1: "FFFFFF", dk2: "1F3550", lt2: "EEF3F8",
    accent1: "2A78D6", accent2: "EB6834", accent3: "1BAF7A", accent4: "EDA100",
    accent5: "6250D6", accent6: "5B6573", hlink: "2A78D6", folHlink: "6250D6",
  },
};
const HEX = THEME.colors;

async function icon(Comp, color, size = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Comp, { color: "#" + color, size: String(size) }));
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}

async function fitImage(slide, file, x, y, maxW, maxH, opts = {}) {
  const m = await sharp(file).metadata();
  const ar = m.width / m.height;
  let w = maxW, h = maxW / ar;
  if (h > maxH) { h = maxH; w = maxH * ar; }
  const xx = opts.align === "left" ? x : x + (maxW - w) / 2;
  const yy = opts.valign === "top" ? y : y + (maxH - h) / 2;
  slide.addImage({ path: file, x: xx, y: yy, w, h, altText: opts.alt || "", objectName: opts.name || path.basename(file) });
  return { x: xx, y: yy, w, h };
}

(async () => {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  pres.title = "Does STF jam inside the fracture?";
  pres.subject = "Prediction of borehole-pressure rebuild in STF fracturing";
  const C = pres.SchemeColor;

  // ------------------------------------------------------------- layouts
  pres.defineSlideMaster({
    title: "TITLE_DARK",
    background: { color: HEX.dk2 },
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: 0.7, y: 1.55, w: 5.9, h: 2.2, fontSize: 40, bold: true,
        color: C.background1, valign: "bottom", margin: 0 }, text: "" } },
      { placeholder: { options: { name: "body", type: "body", x: 0.7, y: 4.0, w: 5.9, h: 2.4, fontSize: 16,
        color: C.background2, valign: "top", margin: 0 }, text: "" } },
    ],
  });
  pres.defineSlideMaster({
    title: "CONTENT",
    background: { color: HEX.lt1 },
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.32, w: 12.1, h: 0.85, fontSize: 32, bold: true,
        color: C.text1, valign: "middle", margin: 0 }, text: "" } },
      { text: { text: "STF jamming analysis  ·  data: Mukuhira et al. (2025), IJRMMS 188:106051",
        options: { x: 0.6, y: 7.0, w: 9.5, h: 0.3, fontSize: 10, color: C.accent6, margin: 0 } } },
    ],
    slideNumber: { x: 12.2, y: 7.0, w: 0.5, h: 0.3, fontSize: 10, color: HEX.accent6, align: "right" },
  });
  pres.defineSlideMaster({
    title: "CLOSING_DARK",
    background: { color: HEX.dk2 },
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.4, w: 12.1, h: 0.9, fontSize: 36, bold: true,
        color: C.background1, valign: "middle", margin: 0 }, text: "" } },
    ],
    slideNumber: { x: 12.2, y: 7.0, w: 0.5, h: 0.3, fontSize: 10, color: "C9D6E6", align: "right" },
  });

  const card = (slide, x, y, w, h, name, fill = C.background2) =>
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, fill: { color: fill }, line: { type: "none" }, objectName: name });
  const txt = (slide, text, o) => slide.addText(text, Object.assign({ isTextBox: true, margin: 0, valign: "top", fontSize: 15, color: C.text1 }, o));
  const SUBS = { "Π_J": ["Π", "J"], "Q_inj": ["Q", "inj"], "Q_cap": ["Q", "cap"] };
  const rich = (str, base = {}) => str.split(/(Π_J|Q_inj|Q_cap)/).filter((p) => p).flatMap((p) => SUBS[p]
    ? [{ text: SUBS[p][0], options: Object.assign({}, base) }, { text: SUBS[p][1], options: Object.assign({}, base, { subscript: true }) }]
    : [{ text: p, options: Object.assign({}, base) }]);
  const PiJ = (size, extra = {}) => [
    { text: "Π", options: Object.assign({ fontSize: size }, extra) },
    { text: "J", options: Object.assign({ fontSize: size, subscript: true }, extra) },
  ];

  // ===================================================================== 1
  pres.addSection({ title: "Question" });
  let s = pres.addSlide({ masterName: "TITLE_DARK", sectionTitle: "Question" });
  s.addText("Does STF jam inside the fracture?", { placeholder: "title" });
  s.addText([
    { text: "Predicting borehole-pressure rebuild in STF fracturing from the measured viscosity curve", options: { breakLine: true } },
    { text: " ", options: { breakLine: true, fontSize: 8 } },
    { text: "Analysis of the Mukuhira et al. (2025) experiments", options: { breakLine: true, fontSize: 14 } },
    { text: "Watanabe Lab, Tohoku University  ·  November 2026", options: { fontSize: 14 } },
  ], { placeholder: "body" });
  card(s, 6.95, 1.75, 5.85, 3.25, "Title figure card", C.background1);
  await fitImage(s, FIG("C_jamming_concept.png"), 7.1, 1.9, 5.55, 2.95, { alt: "STF jams near the fracture outlet; silicone oil flows out", name: "Jamming concept" });
  s.addNotes("Goal: explain, with a simple physics model, why the borehole pressure rebuilds after breakdown when the fracturing fluid is STF, but not when it is a Newtonian fluid of the same viscosity. The prediction uses the measured STF viscosity curve and the measured breakdown pressure as inputs.");

  // ===================================================================== 2
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Question" });
  s.addText("The answer in one slide", { placeholder: "title" });
  const stats = [
    { big: [{ text: "7 / 7", options: { fontSize: 60 } }], label: "tests where the pressure rebuild (yes / no) is predicted correctly" },
    { big: PiJ(54).concat([{ text: " > 1", options: { fontSize: 54 } }]), label: "jamming criterion: the injection rate exceeds what jammed STF can pass through the fracture" },
    { big: [{ text: "≈ 14 MPa", options: { fontSize: 54 } }], label: "predicted re-peak pressure when the jammed STF plug yields (measured re-peaks 5–28 MPa)" },
  ];
  for (let i = 0; i < 3; i++) {
    const x = 0.6 + i * (3.83 + 0.3);
    card(s, x, 1.55, 3.83, 3.6, "Stat card " + (i + 1));
    txt(s, stats[i].big.map((r) => ({ text: r.text, options: Object.assign({ bold: true, color: C.accent1, fontFace: THEME.headFontFace }, r.options) })),
      { x: x + 0.3, y: 1.85, w: 3.23, h: 1.3, valign: "middle", objectName: "Stat value " + (i + 1) });
    txt(s, stats[i].label, { x: x + 0.3, y: 3.3, w: 3.23, h: 1.6, fontSize: 16, color: C.text1, objectName: "Stat label " + (i + 1) });
  }
  txt(s, [
    { text: "Inputs: ", options: { bold: true } },
    { text: "measured STF viscosity curve · injection rate · specimen geometry · applied stresses · rock stiffness.  ", options: {} },
    { text: "One calibration: ", options: { bold: true } },
    { text: "the fracture aperture, taken from the silicone-oil control test (STF4).", options: {} },
  ], { x: 0.6, y: 5.5, w: 12.1, h: 1.0, fontSize: 16, objectName: "Inputs line" });
  s.addNotes("7/7 includes the calibration test STF4; the independent checks are the five granite STF tests and the PMMA STF test. Pi_J is the injection rate divided by the largest flow that jammed STF can pass through the narrowest part of the fracture. The 14 MPa is the borehole pressure at which the jammed plug flows at the yield stress measured in the rheometer, so it is a lower bound.");

  // ===================================================================== 3
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Question" });
  s.addText("What we want to explain", { placeholder: "title" });
  await fitImage(s, FIG("A_setup.png"), 0.5, 1.35, 5.9, 5.35, { alt: "Specimen, borehole, fracture and loading", name: "Setup sketch" });
  await fitImage(s, FIG("B_observation.png"), 6.6, 1.45, 6.15, 2.45, { alt: "Pressure history of STF1 and STF4", name: "Observation plot" });
  card(s, 6.6, 4.25, 6.13, 2.45, "Question card");
  txt(s, [
    { text: "Same rock, same low-shear viscosity (4.8 Pa·s).", options: { bold: true, breakLine: true } },
    { text: "Only the STF makes the borehole pressure rebuild after breakdown — again and again — and this gives the multidirectional fractures.", options: { breakLine: true } },
    { text: " ", options: { breakLine: true, fontSize: 6 } },
    { text: "Can the measured viscosity curve alone predict this?", options: { bold: true, color: C.accent1 } },
  ], { x: 6.9, y: 4.5, w: 5.55, h: 2.0, fontSize: 16, objectName: "Question text" });
  s.addNotes("Experimental system of Mukuhira et al. (2025): 100 mm Inada granite cubes with a 10 mm through borehole, true-triaxial cell, water pumped at 1 mL/min pushes STF from a reservoir into the borehole. Left of the plot: STF1, uniaxial Sv = 50 MPa, five rebuilds. Right: STF4, dimethylpolysiloxane with the same low-shear viscosity, single drop.");

  // ===================================================================== 4
  pres.addSection({ title: "Method" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Method" });
  s.addText("Analysis procedure in six steps", { placeholder: "title" });
  const steps = [
    [fa.FaFileImport, "Digitize the data", "Viscosity curve, breakdown pressures and P(t) of 7 tests from the open-access paper"],
    [fa.FaFlask, "From viscosity to flow law", "Exact slot-flow integral of the measured viscosity curve: flux through a fracture of aperture w"],
    [fa.FaRulerHorizontal, "Calibrate the aperture", "Silicone-oil leak-off plateau (STF4) + cubic law → w ≈ 76 µm"],
    [fa.FaTint, "Outflow vs pressure", "How much fluid each fracture passes at every borehole pressure"],
    [fa.FaTachometerAlt, "Jamming number & P(t)", "Π_J = Q_inj / Q_cap and the borehole pressure history after breakdown"],
    [fa.FaCheckDouble, "Compare with 7 tests", "Rebuild yes / no, re-peak pressure, rebuild rate, timing"],
  ];
  for (let i = 0; i < 6; i++) {
    const col = i % 3, row = Math.floor(i / 3);
    const x = 0.6 + col * (3.83 + 0.3), y = 1.5 + row * (2.6 + 0.3);
    card(s, x, y, 3.83, 2.6, "Step card " + (i + 1));
    s.addShape(pres.shapes.OVAL, { x: x + 0.3, y: y + 0.3, w: 0.75, h: 0.75, fill: { color: C.accent1 }, line: { type: "none" }, objectName: "Step icon circle " + (i + 1) });
    s.addImage({ data: await icon(steps[i][0], "FFFFFF"), x: x + 0.47, y: y + 0.47, w: 0.41, h: 0.41, altText: steps[i][1] + " icon", objectName: "Step icon " + (i + 1) });
    txt(s, (i + 1) + "  " + steps[i][1], { x: x + 1.25, y: y + 0.3, w: 2.4, h: 0.75, fontSize: 17, bold: true, valign: "middle", fontFace: THEME.headFontFace, objectName: "Step title " + (i + 1) });
    txt(s, rich(steps[i][2]), { x: x + 0.3, y: y + 1.25, w: 3.25, h: 1.2, fontSize: 15, color: C.text1, objectName: "Step text " + (i + 1) });
  }
  s.addNotes("Everything runs from stf_jamming_sim/run_all.py in about 40 s. Step 3 is the only calibration. The breakdown pressure is not predicted: the simulation starts from the state just after the first breakdown pressure drop.");

  // ===================================================================== 5
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Method" });
  s.addText("Step 2 · The viscosity curve becomes a fracture flow law", { placeholder: "title" });
  await fitImage(s, RES("fig1_rheology.png"), 0.6, 1.3, 12.1, 4.45, { alt: "Measured STF viscosity and the stress-controlled flow curve", name: "Rheology figure" });
  card(s, 0.6, 5.85, 12.1, 0.95, "Flow law card");
  txt(s, [
    { text: "Flux per unit height:  q = (w²/2)·Φ(τ", options: {} }, { text: "w", options: { subscript: true } },
    { text: "),   Φ = (1/τ", options: {} }, { text: "w", options: { subscript: true } }, { text: "²) ∫ τ·γ̇(τ) dτ   (Newtonian → cubic law).   ", options: {} },
    { text: "Jammed STF cannot be sheared faster than ~60–140 1/s; above 15.6 kPa the plug yields.", options: { bold: true } },
  ], { x: 0.85, y: 5.95, w: 11.6, h: 0.75, fontSize: 15, valign: "middle", objectName: "Flow law text" });
  s.addNotes("Left: digitized Fig. 1a and the interpolation used as model input (no rheological model is assumed). Right: the same curve as shear rate versus imposed stress, which is what matters in pressure-driven flow. The shear rate saturates between ~20 and ~140 1/s while the stress rises 100-fold: this is jamming. The stress maximum of the measured curve, 15.6 kPa, is taken as the yield stress of the jammed STF.");

  // ===================================================================== 6
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Method" });
  s.addText("Why it jams: the STF has a speed limit", { placeholder: "title" });
  await fitImage(s, FIG("D_speed_limit.png"), 0.5, 1.35, 6.9, 5.35, { alt: "Shear rate needed to carry 1 mL/min vs aperture, with the STF speed limit", name: "Speed limit plot" });
  const reasons = [
    [fa.FaArrowRight, C.text1, "Needed", "Carrying 1 mL/min through a 76 µm fracture needs a wall shear rate of ~170 1/s"],
    [fa.FaBan, C.accent1, "Possible", "Jammed STF passes at most the equivalent of ~100 1/s"],
    [fa.FaCompressArrowsAlt, C.accent1, "Result", "The fracture throttles the flow: the borehole pressure must rebuild"],
    [fa.FaTint, C.accent2, "Silicone oil", "No speed limit, so it leaks off at 0.9 MPa"],
  ];
  for (let i = 0; i < 4; i++) {
    const y = 1.5 + i * 1.32;
    const hex = i === 3 ? HEX.accent2 : (i === 0 ? HEX.dk1 : HEX.accent1);
    s.addShape(pres.shapes.OVAL, { x: 7.75, y: y + 0.05, w: 0.6, h: 0.6, fill: { color: i === 3 ? C.accent2 : (i === 0 ? C.text1 : C.accent1) }, line: { type: "none" }, objectName: "Reason circle " + (i + 1) });
    s.addImage({ data: await icon(reasons[i][0], "FFFFFF"), x: 7.89, y: y + 0.19, w: 0.32, h: 0.32, altText: reasons[i][2], objectName: "Reason icon " + (i + 1) });
    txt(s, reasons[i][2], { x: 8.6, y: y, w: 4.1, h: 0.4, fontSize: 17, bold: true, color: reasons[i][1], fontFace: THEME.headFontFace, objectName: "Reason title " + (i + 1) });
    txt(s, reasons[i][3], { x: 8.6, y: y + 0.42, w: 4.1, h: 0.8, fontSize: 15, objectName: "Reason text " + (i + 1) });
  }
  s.addNotes("Black line: Newtonian-equivalent wall shear rate 6Q/(h w^2) needed to push the injection rate through one fracture of height 100 mm. Dashed line: the largest equivalent shear rate jammed STF can sustain, 3*Phi(tau_max) = 100 1/s, from the measured curve. Where the black line is above the dashed one, the STF jams. In granite the fracture is narrow enough (76 um); in PMMA the soft specimen lets the fracture open to ~110 um already at 2 MPa, so the STF flows.");

  // ===================================================================== 7
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Method" });
  s.addText("Step 3 · One calibration from the silicone-oil test", { placeholder: "title" });
  await fitImage(s, FIG("E_calibration.png"), 0.5, 1.35, 6.9, 5.35, { alt: "STF4 pressure with the leak-off plateau", name: "Calibration plot" });
  card(s, 7.75, 1.55, 4.95, 5.05, "Calibration card");
  txt(s, [
    { text: "Steady plateau", options: { bold: true, breakLine: true, fontFace: THEME.headFontFace, fontSize: 17 } },
    { text: "outflow = injection = 1 mL/min at 0.91 MPa", options: { breakLine: true } },
    { text: " ", options: { breakLine: true, fontSize: 8 } },
    { text: "Cubic law (Newtonian)", options: { bold: true, breakLine: true, fontFace: THEME.headFontFace, fontSize: 17 } },
    { text: "Q = h·w³·ΔP / (12 µ L),  µ = 4.8 Pa·s, L = 45 mm", options: { breakLine: true } },
  ], { x: 8.05, y: 1.85, w: 4.4, h: 2.4, fontSize: 15, objectName: "Calibration steps" });
  txt(s, [{ text: "w ≈ 76 µm", options: { bold: true, color: C.accent1, fontSize: 44, fontFace: THEME.headFontFace } }],
    { x: 8.05, y: 4.3, w: 4.4, h: 0.9, valign: "middle", objectName: "Aperture value" });
  txt(s, "Used unchanged for every STF test", { x: 8.05, y: 5.3, w: 4.4, h: 0.9, fontSize: 15, color: C.text1, objectName: "Aperture note" });
  s.addNotes("The silicone oil sat on a steady 0.9 MPa plateau for ~400 s after breakdown: the oil flowed out through the fracture as fast as it was injected. With the cubic law this gives a hydraulic aperture of 76 um for one fracture running from the borehole wall to the specimen surface. This is the only number taken from the experiments to build the model; the breakdown pressure is only the starting point.");

  // ===================================================================== 8
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Method" });
  s.addText("Inside the fracture: STF jams within ~30 s", { placeholder: "title" });
  await fitImage(s, RES("fig3_jamming_inside_fracture.png"), 0.6, 1.35, 12.1, 4.3, { alt: "Borehole pressure and apparent viscosity in the fracture, STF vs silicone oil", name: "Jamming map" });
  card(s, 0.6, 5.8, 5.9, 1.0, "STF takeaway card");
  txt(s, [{ text: "STF: ", options: { bold: true, color: C.accent1 } }, { text: "viscosity > 10× its liquid value along the whole fracture after ~30 s, highest near the outlet → pressure rebuilds" }],
    { x: 0.85, y: 5.9, w: 5.45, h: 0.8, fontSize: 14, valign: "middle", objectName: "STF takeaway" });
  card(s, 6.8, 5.8, 5.9, 1.0, "Oil takeaway card");
  txt(s, [{ text: "Silicone oil: ", options: { bold: true, color: C.accent2 } }, { text: "stays at 4.8 Pa·s everywhere → pressure stays at 0.9 MPa" }],
    { x: 7.05, y: 5.9, w: 5.45, h: 0.8, fontSize: 14, valign: "middle", objectName: "Oil takeaway" });
  s.addNotes("Transient 1D lubrication model of the fracture coupled to the borehole compliance, same 76 um fracture, starting 1 MPa after the drop. The colour is the apparent viscosity (Newtonian viscosity giving the same flux). The black contour marks 10 times the low-shear viscosity.");

  // ===================================================================== 9
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Method" });
  s.addText("Step 4 · The outflow curve decides: rebuild or leak-off", { placeholder: "title" });
  await fitImage(s, RES("fig4_outflow_curves.png"), 0.5, 1.35, 7.9, 5.35, { alt: "Steady outflow through the fracture vs borehole pressure", name: "Outflow curves" });
  const outs = [
    [C.accent2, "Silicone oil", "crosses 1 mL/min at 0.9 MPa → leaks off, no rebuild"],
    [C.accent3, "STF in PMMA", "the soft specimen lets the fracture open: crosses at 1.6 MPa → no rebuild"],
    [C.accent1, "STF in granite", "stays below 1 mL/min up to ~14 MPa, where the plug yields → rebuild, drop, rebuild…"],
  ];
  for (let i = 0; i < 3; i++) {
    const y = 1.55 + i * 1.72;
    card(s, 8.65, y, 4.05, 1.55, "Outflow card " + (i + 1));
    txt(s, outs[i][1], { x: 8.9, y: y + 0.15, w: 3.6, h: 0.4, fontSize: 17, bold: true, color: outs[i][0], fontFace: THEME.headFontFace, objectName: "Outflow title " + (i + 1) });
    txt(s, outs[i][2], { x: 8.9, y: y + 0.58, w: 3.6, h: 0.9, fontSize: 14, objectName: "Outflow text " + (i + 1) });
  }
  s.addNotes("For each borehole pressure, the steady flux through the fracture is computed with the full flow curve (including yield above 15.6 kPa) and an aperture that closes under the normal stress and opens elastically with pressure. Where a curve is below the 1 mL/min line, more is injected than leaves, so the pressure rises. The pressure levels off where the curve crosses the line.");

  // ===================================================================== 10
  pres.addSection({ title: "Results" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Results" });
  s.addText("Step 6 · Predicted vs measured pressure histories", { placeholder: "title" });
  await fitImage(s, FIG("F_results_grid.png"), 0.6, 1.25, 12.1, 5.25, { alt: "Measured and predicted borehole pressure for six tests", name: "Results grid" });
  txt(s, "Model starts 1 MPa after the first breakdown (the breakdown pressure is input data). Solid: aperture from STF4; dashed: aperture × 2/3.",
    { x: 0.6, y: 6.55, w: 12.1, h: 0.35, fontSize: 12, color: C.accent6, objectName: "Results caption" });
  s.addNotes("Good: STF3 first rebuild (shape and 13.5 MPa peak), STF4 and STF8 plateaus. STF1 and STF5 rebuild faster and higher than predicted (narrower fracture? the dashed x2/3 aperture brackets them). STF6/STF7 do jam, but only after 250-650 s at ~0 MPa, which the model does not reproduce.");

  // ===================================================================== 11
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Results" });
  s.addText("Rebuild predicted correctly for 7 of 7 tests", { placeholder: "title" });
  const H = (t) => ({ text: t, options: { bold: true, color: C.background1, fill: { color: C.text2 }, fontSize: 14, valign: "middle" } });
  const hPi = { text: rich("Π_J", { bold: true, color: C.background1 }), options: { bold: true, color: C.background1, fill: { color: C.text2 }, fontSize: 14, valign: "middle" } };
  const rows = [[H("Test"), H("Specimen / fluid"), H("Stress (MPa)"), H("1st BP (MPa)"), hPi, H("Model: STF jams & P rebuilds?"), H("Observed")]];
  const data = [
    ["STF1", "granite / STF", "Sv 50", "36.7", "1.71", "yes", "yes"],
    ["STF3", "granite / STF", "Sv 20, SH 2", "22.0", "1.71", "yes", "yes"],
    ["STF5", "granite / STF", "Sv 20, SH 5", "35.8", "1.71", "yes", "yes"],
    ["STF6", "granite / STF", "Sv 20, SH 5, Sh 1", "45.0", "2.91", "yes", "yes (after ~650 s)"],
    ["STF7", "granite / STF", "Sv 20, SH 5, Sh 1", "34.3", "2.91", "yes", "yes (after ~250 s)"],
    ["STF4", "granite / silicone oil", "Sv 20", "15.0", "0 (Newtonian)", "no", "no"],
    ["STF8", "PMMA / STF", "Sv 12", "60.4", "1.71*", "no", "no"],
  ];
  data.forEach((r, i) => {
    const fill = { color: i % 2 ? C.background1 : C.background2 };
    rows.push(r.map((v, j) => ({ text: v, options: { fill, fontSize: 14, valign: "middle",
      bold: (j === 5 || j === 6) && v.startsWith("yes"), color: (j === 5 || j === 6) && v.startsWith("yes") ? C.accent1 : C.text1 } })));
  });
  s.addTable(rows, { x: 0.6, y: 1.45, w: 12.1, colW: [0.9, 2.3, 2.0, 1.35, 1.55, 2.3, 1.7], rowH: 0.5,
    border: { type: "solid", pt: 0.5, color: "D5DCE5" }, fontFace: THEME.bodyFontFace, objectName: "Prediction table" });
  txt(s, [
    ...rich("Π_J = injection rate ÷ largest flow jammed STF can pass;  > 1 → jams.  "),
    { text: "* PMMA: the fracture opens with pressure, so jamming holds only below 1.3 MPa. ", options: {} },
    { text: "STF4 is the calibration; the independent checks are the five granite STF tests and PMMA.", options: { bold: true } },
  ], { x: 0.6, y: 5.65, w: 12.1, h: 0.9, fontSize: 14, objectName: "Table note" });
  s.addNotes("Pi_J for the true-triaxial tests is larger because Sh = 1 MPa closes the fracture outlet a little (58 um instead of 76 um). Observed re-peaks: STF1 17.5-28, STF3 9-13.5, STF5 5-17, STF6 14.5-15, STF7 5-14.5 MPa; model level ~14 MPa.");

  // ===================================================================== 12
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Results" });
  s.addText("Design map: the STF-only jamming window", { placeholder: "title" });
  await fitImage(s, RES("fig5_regime_map.png"), 0.5, 1.3, 7.3, 5.5, { alt: "Regime map of injection rate vs aperture", name: "Regime map" });
  const pts = [
    [fa.FaCrosshairs, "At 1 mL/min, one open fracture", "STF jams for apertures of 43–100 µm — where a Newtonian fluid would just leak off"],
    [fa.FaTachometerAlt, "Faster injection", "widens the window (Π_J grows with Q): jamming becomes easier"],
    [fa.FaCodeBranch, "More open fractures", "share the flow, so each needs a narrower aperture to jam"],
    [fa.FaCube, "Softer specimen (PMMA)", "opens past the window → no rebuild, single fracture"],
  ];
  for (let i = 0; i < 4; i++) {
    const y = 1.45 + i * 1.33;
    s.addShape(pres.shapes.OVAL, { x: 8.1, y: y + 0.03, w: 0.6, h: 0.6, fill: { color: C.accent1 }, line: { type: "none" }, objectName: "Map circle " + (i + 1) });
    s.addImage({ data: await icon(pts[i][0], "FFFFFF"), x: 8.24, y: y + 0.17, w: 0.32, h: 0.32, altText: pts[i][1], objectName: "Map icon " + (i + 1) });
    txt(s, pts[i][1], { x: 8.95, y: y, w: 3.8, h: 0.4, fontSize: 17, bold: true, fontFace: THEME.headFontFace, objectName: "Map title " + (i + 1) });
    txt(s, rich(pts[i][2]), { x: 8.95, y: y + 0.42, w: 3.8, h: 0.85, fontSize: 14, objectName: "Map text " + (i + 1) });
  }
  s.addNotes("Blue lines: Q = n_f h (w^2/2) Phi(tau_max) for 1, 2, 3 open fractures; above a line the STF jams. Orange line: above it, even a 4.8 Pa s Newtonian fluid would hold more than 5 MPa. The blue band between them is where jamming is specific to the STF; the granite tests sit inside it.");

  // ===================================================================== 13
  pres.addSection({ title: "Discussion" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Discussion" });
  s.addText("What the model does not capture (yet)", { placeholder: "title" });
  const lims = [
    [fa.FaBolt, "Breakdown and drops are input", "Rock-fracturing events are not simulated; after the plug yields the pressure is reset to 1 MPa."],
    [fa.FaShieldAlt, "Plug strength is a lower bound", "The yield stress is the unconfined rheometer value (15.6 kPa); squeezed in a fracture the STF is likely stronger — peaks up to 28 MPa."],
    [fa.FaHourglassHalf, "Rebuild ~2× too slow for STF1/5/7", "Points to narrower fractures than the silicone-oil test; silica residue sealing fractures is seen in thin sections. Aperture × 2/3 matches."],
    [fa.FaRandom, "Delays in STF6 / STF7", "250–650 s near 0 MPa: probably several paths open at first (Π_J < 1); jamming once paths close or clog. Clogging is not modelled."],
  ];
  for (let i = 0; i < 4; i++) {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.6 + col * (5.9 + 0.3), y = 1.5 + row * (2.55 + 0.3);
    card(s, x, y, 5.9, 2.55, "Limitation card " + (i + 1));
    s.addShape(pres.shapes.OVAL, { x: x + 0.3, y: y + 0.3, w: 0.6, h: 0.6, fill: { color: C.accent6 }, line: { type: "none" }, objectName: "Limitation circle " + (i + 1) });
    s.addImage({ data: await icon(lims[i][0], "FFFFFF"), x: x + 0.44, y: y + 0.44, w: 0.32, h: 0.32, altText: lims[i][1], objectName: "Limitation icon " + (i + 1) });
    txt(s, lims[i][1], { x: x + 1.1, y: y + 0.3, w: 4.55, h: 0.6, fontSize: 17, bold: true, valign: "middle", fontFace: THEME.headFontFace, objectName: "Limitation title " + (i + 1) });
    txt(s, rich(lims[i][2]), { x: x + 0.3, y: y + 1.1, w: 5.3, h: 1.3, fontSize: 15, objectName: "Limitation text " + (i + 1) });
  }
  s.addNotes("Also not included: friction at the loading platens in uniaxial tests. Higher Sv could clamp the fracture shut (narrower aperture, easier jamming), which would fit the ARMA 2025 observation that multidirectional fracturing is favoured at high vertical stress. To be tested with the Tokutake data.");

  // ===================================================================== 14
  s = pres.addSlide({ masterName: "CLOSING_DARK", sectionTitle: "Discussion" });
  s.addText("Next steps", { placeholder: "title" });
  const nexts = [
    [fa.FaTable, "Apply to Tokutake (MSc) and my JSRM52 tests", "Per test: stresses, breakdown pressure, injection rate, P(t), STF curve. Add one row to experiments.py and run run_all.py."],
    [fa.FaVial, "Test the predictions", "Vary the injection rate (Π_J grows with Q), STF concentration, and Sv in uniaxial tests (platen-clamping hypothesis)."],
    [fa.FaProjectDiagram, "Fracture patterns in 2D / 3D", "Use this flow law in the lab DEM (Wada et al., 2024), a cohesive-zone FEM or a phase-field model."],
  ];
  for (let i = 0; i < 3; i++) {
    const x = 0.6 + i * (3.83 + 0.3);
    card(s, x, 1.6, 3.83, 4.4, "Next step card " + (i + 1), C.background1);
    s.addShape(pres.shapes.OVAL, { x: x + 0.3, y: 1.9, w: 0.7, h: 0.7, fill: { color: C.accent1 }, line: { type: "none" }, objectName: "Next circle " + (i + 1) });
    s.addImage({ data: await icon(nexts[i][0], "FFFFFF"), x: x + 0.47, y: 2.07, w: 0.36, h: 0.36, altText: nexts[i][1], objectName: "Next icon " + (i + 1) });
    txt(s, nexts[i][1], { x: x + 0.3, y: 2.8, w: 3.23, h: 1.0, fontSize: 18, bold: true, fontFace: THEME.headFontFace, objectName: "Next title " + (i + 1) });
    txt(s, rich(nexts[i][2]), { x: x + 0.3, y: 3.9, w: 3.23, h: 1.9, fontSize: 15, objectName: "Next text " + (i + 1) });
  }
  txt(s, "Code and data: stf_jamming_sim/ (python run_all.py).  Data digitized from Mukuhira et al. (2025), Int J Rock Mech Min Sci 188:106051, CC BY-NC 4.0.",
    { x: 0.6, y: 6.35, w: 12.1, h: 0.5, fontSize: 12, color: C.background2, objectName: "Closing source line" });
  s.addNotes("The model is general: any STF viscosity curve, injection rate, specimen size and stress state can be entered. Only the fracture aperture needs a calibration, ideally from a Newtonian control test in the same set-up.");

  await pres.writeFile({ fileName: OUT });
  const { applyTheme } = require(path.join(process.env.PPTX_SKILL, "scripts", "apply_theme.js"));
  await applyTheme(OUT, THEME);
  console.log("wrote", OUT);
})().catch((e) => { console.error(e); process.exit(1); });
