'use strict';
// Age of War Plus menus: animated title, difficulty, achievements, unit gallery, settings,
// pause and end-of-war screens. Also boots the game.

function titleText(str, x, y, size) {
  const c = G.ctx;
  c.font = `700 ${size}px ${FONT_TITLE}`;
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  c.lineJoin = 'round';
  c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillText(str, x + 3, y + 4);
  c.strokeStyle = '#5a4000'; c.lineWidth = Math.max(2, size / 24); c.strokeText(str, x, y);
  c.fillStyle = linGrad(0, y - size * 0.75, 0, y, [[0, '#ffffff'], [0.22, '#fff6b0'], [0.45, '#f2c21c'], [0.62, '#a87800'], [0.8, '#f8e070'], [1, '#fffbe0']]);
  c.fillText(str, x, y);
}
function serifText(str, x, y, size, opt = {}) {
  text(str, x, y, Object.assign({ font: `bold ${size}px ${FONT_SERIF}`, color: '#fff', shadow: 'rgba(0,0,0,0.75)', sd: Math.max(1, size / 14), align: 'center', base: 'middle' }, opt));
}
function wrapLines(str, maxW, font) {
  const c = G.ctx; c.font = font;
  const cjk = /[　-鿿]/.test(str);
  const words = cjk ? str.split('') : str.split(' ');
  const out = []; let line = '';
  for (const w of words) {
    const test = line + (cjk || !line ? '' : ' ') + w;
    if (c.measureText(test).width > maxW && line) { out.push(line); line = w; } else line = test;
  }
  if (line) out.push(line);
  return out;
}

// ------------------------------------------------------------------ animated menu background
const Title = { cam: 120, dir: 1, ageT: 0, parade: [], spawnT: 0 };
function titleTick() {
  Title.ageT++;
  if (Title.ageT > 560) { Title.ageT = 0; Env.setAge(Env.age % 5 + 1); }
  const [lo, hi] = camRange();
  Title.cam += 0.3 * Title.dir;
  if (Title.cam > hi) { Title.cam = hi; Title.dir = -1; }
  if (Title.cam < lo) { Title.cam = lo; Title.dir = 1; }
  if (--Title.spawnT <= 0) {
    const ids = unitIdsForAge(Env.age);
    const id = ids[Math.floor(Math.random() * ids.length)];
    Title.parade.push({ id, x: Title.cam - 80, f: Math.random() * 40 });
    Title.spawnT = 70 + Math.random() * 90;
  }
  for (const p of Title.parade) { p.x += UNIT_SPEED * 1.2; p.f++; }
  Title.parade = Title.parade.filter(p => p.x < Title.cam + viewW + 120);
}
function drawMenuBackdrop(dim) {
  const c = G.ctx;
  drawEnvironment(Title.cam, Game.t);
  save(); tr(-Title.cam, 0);
  drawNear(Title.cam);
  for (const p of Title.parade) {
    const U = UNITS[p.id];
    save(); tr(p.x, GROUND_Y); drawShadow(U.w); blitUnit(p.id, 'walk', p.f % U.anim.walk, U.anim.walk, 0, 0); restore();
  }
  restore();
  c.fillStyle = radGrad(viewW / 2, 230, 120, viewW * 0.75, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.5)']]);
  c.fillRect(0, 0, viewW, STAGE_H);
  if (dim) { c.fillStyle = `rgba(8,5,2,${dim})`; c.fillRect(0, 0, viewW, STAGE_H); }
}
function backButton(onClick) {
  uiButton('back', 12, 12, 92, 32, '← ' + (lang === 'zh' ? '返回' : 'Back'), onClick || (() => { Game.screen = 'title'; Sfx.play('close'); }), { kind: 'dark', size: 13 });
}

// ------------------------------------------------------------------ title
function drawTitle() {
  const c = G.ctx;
  drawMenuBackdrop(0);
  const cx = viewW / 2;
  c.fillStyle = linGrad(0, 0, 0, 150, [[0, 'rgba(0,0,0,0.45)'], [1, 'rgba(0,0,0,0)']]);
  c.fillRect(0, 0, viewW, 150);
  const bob = Math.sin(Game.t * 0.04) * 2;
  titleText(T.title, cx, 84 + bob, Math.min(66, viewW * 0.09));
  // PLUS ribbon
  const rw = lang === 'zh' ? 150 : 96, ry = 104 + bob;
  poly([cx - rw / 2 - 14, ry, cx - rw / 2, ry + 10, cx - rw / 2 - 14, ry + 20, cx - rw / 2 + 4, ry + 20, cx - rw / 2 + 4, ry], '#7a0e08', '#2a0000', 1);
  poly([cx + rw / 2 + 14, ry, cx + rw / 2, ry + 10, cx + rw / 2 + 14, ry + 20, cx + rw / 2 - 4, ry + 20, cx + rw / 2 - 4, ry], '#7a0e08', '#2a0000', 1);
  rrect(cx - rw / 2, ry - 2, rw, 22, 3, linGrad(0, ry - 2, 0, ry + 20, [[0, '#e0402a'], [1, '#9a1a0e']]), '#3a0000', 1.2);
  uiText(T.subtitle, cx, ry + 9.5, 13, '#fff3d0', { align: 'center', family: FONT_SERIF, stroke: '#4a0800', sw: 2 });

  const items = [];
  if (hasSave()) items.push(['continue', T.continueGame, () => { if (continueGame()) Sfx.play('confirm'); }, 'green']);
  items.push(['new', T.newGame, () => { Game.screen = 'difficulty'; Sfx.play('open'); }, 'gold']);
  items.push(['ach', T.achievementsBtn + `  ${Meta.count()}/${ACHIEVEMENTS.length}`, () => { Game.screen = 'achievements'; Sfx.play('open'); }, 'dark']);
  items.push(['gal', T.gallery, () => { Game.screen = 'gallery'; Sfx.play('open'); }, 'dark']);
  items.push(['set', T.settings, () => { Game.overlay = 'settings'; Sfx.play('open'); }, 'dark']);
  const bw = 236, bh = 38, gap = 9;
  const y0 = 142;
  items.forEach(([id, label, fn, kind], i) => {
    uiButton('t_' + id, cx - bw / 2, y0 + i * (bh + gap), bw, bh, label, fn, { kind, size: 16, family: FONT_SERIF });
  });
  // small buttons along the bottom
  uiButton('lang', viewW - 98, STAGE_H - 44, 86, 30, lang === 'zh' ? 'English' : '中文', () => { setLang(lang === 'zh' ? 'en' : 'zh'); Sfx.play('click'); }, { kind: 'dark', size: 12 });
  uiButton('snd', viewW - 140, STAGE_H - 44, 36, 30, '', toggleSound, { kind: 'dark', icon: (x, y) => speakerIcon(x + 18, y + 15, Settings.sound) });
  if (canFullscreen()) uiButton('full', viewW - 182, STAGE_H - 44, 36, 30, '⛶', toggleFullscreen, { kind: 'dark', size: 15 });
  if (!window.AOW_EMBEDDED) uiButton('classic', 12, STAGE_H - 44, 150, 30, T.classic + ' →', () => { window.location.href = '../ageofwar/'; }, { kind: 'dark', size: 12, tip: { text: T.classicHint } });
  uiText(T.credits, cx, STAGE_H - 8, 9, 'rgba(255,245,220,0.75)', { align: 'center', weight: 'normal', stroke: 'rgba(0,0,0,0.5)', sw: 2 });
  drawCardTip();
}

// ------------------------------------------------------------------ difficulty
function drawDifficulty() {
  drawMenuBackdrop(0.35);
  const cx = viewW / 2;
  serifText(lang === 'zh' ? '选择难度' : 'Choose difficulty', cx, 42, 28, { color: UI.goldHi });
  backButton();
  const names = [T.normal, T.harder, T.impossible];
  const cols = [['#8fe06a', '#2f7a1c'], ['#ffc060', '#b86a10'], ['#ff7a6a', '#a01a10']];
  const cw = Math.min(210, (viewW - 60) / 3), ch = 300, gap = 14;
  const x0 = cx - (3 * cw + 2 * gap) / 2, y = 78;
  for (let i = 0; i < 3; i++) {
    const d = i + 1, x = x0 + i * (cw + gap);
    const b = { id: 'd' + d, x, y, w: cw, h: ch, onClick: () => startGame(d) };
    buttons.push(b);
    const hv = hovered(b), oy = pressed(b) ? 2 : hv ? -2 : 0;
    uiPanel(x, y + oy, cw, ch, { r: 14, border: hv ? UI.goldHi : UI.gold, lw: hv ? 2.2 : 1.5 });
    rrect(x + 6, y + 6 + oy, cw - 12, 56, 10, linGrad(0, y, 0, y + 62, [[0, cols[i][0]], [1, cols[i][1]]]), 'rgba(0,0,0,0.4)', 1);
    serifText(names[i], x + cw / 2, y + 25 + oy, 22, { color: '#fff' });
    for (let k = 0; k < d; k++) skullIcon(x + cw / 2 + (k - (d - 1) / 2) * 20, y + 48 + oy, 0.8);
    const lines = wrapLines(T.diffDesc[i], cw - 28, `bold 12px ${FONT_HUD}`);
    lines.forEach((l, j) => uiText(l, x + cw / 2, y + 86 + j * 17 + oy, 12, '#f0e2c0', { align: 'center' }));
    // record
    const r = Meta.records[d];
    uiText(T.best, x + cw / 2, y + 170 + oy, 10.5, '#bfa77a', { align: 'center' });
    for (let k = 0; k < 3; k++) starIcon(x + cw / 2 + (k - 1) * 26, y + 194 + oy, 10, r && r.stars > k ? '#ffd23a' : 'rgba(255,255,255,0.12)', r && r.stars > k ? '#6a4400' : 'rgba(255,255,255,0.25)');
    uiText(r ? fmtTime(r.time) + (lang === 'zh' ? ` · 胜利 ${r.wins} 次` : ` · ${r.wins} win${r.wins > 1 ? 's' : ''}`) : T.noRecord, x + cw / 2, y + 220 + oy, 11, r ? '#fff' : '#a89878', { align: 'center' });
    rrect(x + 18, y + ch - 50 + oy, cw - 36, 34, 10, linGrad(0, y + ch - 50, 0, y + ch - 16, [[0, hv ? '#fff0b0' : '#ffe9a0'], [1, '#c8961c']]), '#5a3c08', 1.2);
    uiText(lang === 'zh' ? '开战！' : 'Start!', x + cw / 2, y + ch - 32.5 + oy, 15, '#2a1a00', { align: 'center', family: FONT_SERIF });
  }
}
function skullIcon(x, y, s) {
  save(); tr(x, y); scl(s);
  blob([-7, -2, -6, -8, 0, -10, 6, -8, 7, -2, 4, 2, 4, 6, -4, 6, -4, 2], '#f4ecd8', '#2a1a06', 1);
  ell(-3, -3, 2.2, 2.6, '#2a1a06', null); ell(3, -3, 2.2, 2.6, '#2a1a06', null);
  pline([-2, 4, -2, 6], '#2a1a06', 0.8); pline([0, 4, 0, 6], '#2a1a06', 0.8); pline([2, 4, 2, 6], '#2a1a06', 0.8);
  restore();
}

// ------------------------------------------------------------------ achievements
function drawAchievements() {
  drawMenuBackdrop(0.55);
  const cx = viewW / 2;
  serifText(T.achTitle, cx, 36, 26, { color: UI.goldHi });
  uiText(T.unlocked(Meta.count(), ACHIEVEMENTS.length), cx, 62, 11.5, '#e8d6ae', { align: 'center' });
  backButton();
  const cols = viewW >= 820 ? 3 : 2;
  const gap = 10, cw = Math.min(262, (viewW - 32 - (cols - 1) * gap) / cols), ch = 50;
  const x0 = cx - (cols * cw + (cols - 1) * gap) / 2, y0 = 78;
  ACHIEVEMENTS.forEach((a, i) => {
    const x = x0 + (i % cols) * (cw + gap), y = y0 + Math.floor(i / cols) * (ch + 6);
    const on = !!Meta.ach[a.id];
    uiPanel(x, y, cw, ch, { r: 9, border: on ? UI.gold : 'rgba(150,130,100,0.5)', top: on ? UI.panelTop : 'rgba(30,26,20,0.9)', bot: on ? UI.panelBot : 'rgba(18,16,12,0.9)', shadow: false });
    if (on) { G.ctx.globalCompositeOperation = 'lighter'; glowAt('warm', x + 24, y + ch / 2, 22, 0.35); G.ctx.globalCompositeOperation = 'source-over'; G.ctx.globalAlpha = 1; }
    trophyIcon(x + 24, y + ch / 2, 1.1, on);
    if (!on) lockIcon(x + 33, y + ch / 2 + 9, 0.8);
    const [name, desc] = T.ach[a.id];
    uiText(name, x + 46, y + 17, 12.5, on ? UI.goldHi : '#b8ae98', { family: FONT_SERIF });
    const dl = wrapLines(desc, cw - 54, `normal 10px ${FONT_HUD}`);
    dl.slice(0, 2).forEach((l, j) => uiText(l, x + 46, y + 32 + j * 11, 10, on ? '#e8d6ae' : '#8a8274', { weight: 'normal' }));
  });
}

// ------------------------------------------------------------------ unit gallery
function drawGallery() {
  drawMenuBackdrop(0.55);
  const cx = viewW / 2;
  serifText(T.gallery, cx, 36, 26, { color: UI.goldHi });
  backButton();
  const rowH = 80, y0 = 60;
  const lw = 92;
  const cw = Math.min(170, (viewW - 40 - lw) / 4);
  const x0 = cx - (lw + 4 * cw) / 2;
  for (let a = 1; a <= 5; a++) {
    const y = y0 + (a - 1) * rowH;
    uiPanel(x0 - 6, y + 2, lw + 4 * cw + 12, rowH - 6, { r: 10, shadow: false, top: 'rgba(36,26,14,0.8)', bot: 'rgba(18,12,6,0.8)', border: 'rgba(214,173,82,0.5)', lw: 1 });
    uiText(T.ageNames[a - 1], x0 + 6, y + rowH / 2, 12, UI.goldHi, { family: FONT_SERIF });
    unitIdsForAge(a).forEach((id, i) => {
      const U = UNITS[id];
      const x = x0 + lw + i * cw;
      save(); tr(x + 30, y + rowH - 12);
      scl(Math.min(0.8, 52 / (U.h + 6), 62 / (U.w + 10)));
      drawShadow(U.w);
      const anim = (Math.floor(Game.t / 160) + id) % 2 ? 'walk' : 'attack';
      const A = U.anim, len = anim === 'walk' ? A.walk : A.attack[0][0];
      blitUnit(id, anim, Game.t % len, len, anim === 'attack' ? A.attack[0][1] : 0, 0);
      restore();
      uiText(T.unitNames[id], x + 64, y + 20, 10.5, '#fff2d0');
      coinIcon(x + 68, y + 36, 3.8);
      uiText(fmtFull(U.cost), x + 75, y + 36.5, 9.5, '#ffe45a');
      uiText(`${T.hp} ${U.hp}`, x + 64, y + 50, 9.5, '#bfe8a0', { weight: 'normal' });
      uiText(`${T.dmg} ${U.dmg}` + (U.rdmg ? `/${U.rdmg}` : ''), x + 64, y + 62, 9.5, '#ffc0a0', { weight: 'normal' });
    });
  }
}

// ------------------------------------------------------------------ settings (overlay on any screen)
function uiToggle(id, x, y, on, onClick) {
  const b = { id, x, y, w: 64, h: 26, onClick };
  buttons.push(b);
  rrect(x, y, 64, 26, 13, on ? linGrad(0, y, 0, y + 26, [[0, '#9ae07a'], [1, '#3a9a22']]) : 'rgba(0,0,0,0.5)', on ? '#1a4a06' : 'rgba(214,173,82,0.5)', 1.2);
  circ(on ? x + 51 : x + 13, y + 13, 10, linGrad(0, y + 3, 0, y + 23, [[0, '#fff'], [1, '#d8d0c0']]), '#3a3020', 1);
  uiText(on ? T.on : T.off, on ? x + 22 : x + 42, y + 13.5, 10.5, on ? '#0a2a00' : '#bfa77a', { align: 'center' });
}
function uiSlider(id, x, y, w, v, onChange) {
  const set = (px) => { const nv = Math.round(clamp((px - x) / w, 0, 1) * 20) / 20; onChange(nv); };
  buttons.push({ id, x: x - 8, y: y - 6, w: w + 16, h: 28, onDown: set, onDrag: set, onClick: () => {} });
  rrect(x, y + 5, w, 8, 4, 'rgba(0,0,0,0.55)', 'rgba(214,173,82,0.5)', 1);
  if (v > 0) rrect(x, y + 5, w * v, 8, 4, linGrad(0, y + 5, 0, y + 13, [[0, '#ffe9a0'], [1, '#c8961c']]), null);
  circ(x + w * v, y + 9, 9, linGrad(0, y, 0, y + 18, [[0, '#fff'], [1, '#d8d0c0']]), '#3a3020', 1.2);
  uiText(Math.round(v * 100) + '%', x + w + 16, y + 9.5, 10.5, '#e8d6ae');
}
function drawSettings() {
  const c = G.ctx;
  c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0, 0, viewW, STAGE_H);
  buttons.push({ id: 'setbg', x: 0, y: 0, w: viewW, h: STAGE_H, onClick: () => {} });
  const w = 420, h = 360, x = viewW / 2 - w / 2, y = 70;
  uiPanel(x, y, w, h, { r: 16 });
  serifText(T.settings, viewW / 2, y + 26, 22, { color: UI.goldHi });
  const rows = [
    [T.music, 'slider', Settings.music, (v) => { Settings.music = v; saveSettings(); Sfx.init(); applyAudioSettings(); if (v > 0 && Settings.sound) Sfx.playMusic(Sfx.track || (Game.screen === 'play' ? 'battle' : 'title'), true); }],
    [T.sfx, 'slider', Settings.sfx, (v) => { Settings.sfx = v; saveSettings(); applyAudioSettings(); Sfx.play('tick'); }],
    [T.dmgNumbers, 'toggle', Settings.dmgNumbers, () => { Settings.dmgNumbers = !Settings.dmgNumbers; saveSettings(); Sfx.play('click'); }],
    [T.blood, 'toggle', Settings.blood, () => { Settings.blood = !Settings.blood; saveSettings(); Sfx.play('click'); }],
    [T.hints, 'toggle', Settings.hints, () => { Settings.hints = !Settings.hints; if (Settings.hints) Meta.resetTut(); saveSettings(); Sfx.play('click'); }],
    [T.language, 'lang', 0, () => { setLang(lang === 'zh' ? 'en' : 'zh'); Sfx.play('click'); }],
  ];
  rows.forEach(([label, kind, v, fn], i) => {
    const ry = y + 60 + i * 42;
    uiText(label, x + 30, ry + 13, 14, '#fff2d0', { family: FONT_SERIF });
    if (kind === 'slider') uiSlider('s' + i, x + 190, ry + 4, 150, v, fn);
    else if (kind === 'toggle') uiToggle('s' + i, x + 190, ry, v, fn);
    else uiButton('s' + i, x + 190, ry, 130, 26, lang === 'zh' ? '中文 / English' : 'English / 中文', fn, { kind: 'dark', size: 11.5, r: 7 });
    if (i < rows.length - 1) { c.fillStyle = 'rgba(214,173,82,0.15)'; c.fillRect(x + 24, ry + 34, w - 48, 1); }
  });
  uiButton('setclose', viewW / 2 - 70, y + h - 50, 140, 36, T.close, () => { Game.overlay = null; Sfx.play('close'); }, { kind: 'gold', size: 15, family: FONT_SERIF });
}

// ------------------------------------------------------------------ pause
function drawPauseMenu() {
  const c = G.ctx;
  buttons = [];
  c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(0, 0, viewW, STAGE_H);
  const w = 300, h = 318, x = viewW / 2 - w / 2, y = STAGE_H / 2 - h / 2 - 10;
  uiPanel(x, y, w, h, { r: 16 });
  serifText(T.paused, viewW / 2, y + 30, 24, { color: UI.goldHi });
  uiText(`${fmtTime(S.tick)} · ${T.stats.kills} ${S.stats.kills} · ${[T.normal, T.harder, T.impossible][S.diff - 1]}`, viewW / 2, y + 56, 11, '#bfa77a', { align: 'center' });
  const items = [
    ['resume', T.resume, () => togglePause(), 'gold'],
    ['restart', T.restart, () => { const d = S.diff; startGame(d); }, 'dark'],
    ['psettings', T.settings, () => { Game.overlay = 'settings'; Sfx.play('open'); }, 'dark'],
    ['menu', T.mainMenu, () => toMainMenu(), 'dark'],
  ];
  items.forEach(([id, label, fn, kind], i) => uiButton(id, x + 40, y + 76 + i * 52, w - 80, 40, label, fn, { kind, size: 16, family: FONT_SERIF }));
}

// ------------------------------------------------------------------ end of the war
function drawEndScreen() {
  const c = G.ctx;
  const R = S.result;
  if (!R) return;
  const t = S.endT;
  const k = smooth(t / 20);
  c.fillStyle = `rgba(0,0,0,${0.55 * k})`; c.fillRect(0, 0, viewW, STAGE_H);
  const w = Math.min(520, viewW - 40), h = 408, x = viewW / 2 - w / 2, y = 44 + (1 - k) * 30;
  c.globalAlpha = k;
  if (R.win) { c.globalCompositeOperation = 'lighter'; glowAt('hot', viewW / 2, y + 40, 200, 0.35); c.globalCompositeOperation = 'source-over'; c.globalAlpha = k; }
  uiPanel(x, y, w, h, { r: 18, border: R.win ? UI.goldHi : '#c05040', lw: 2 });
  if (R.win) titleText(T.victory, viewW / 2, y + 60, 46);
  else serifText(T.defeat, viewW / 2, y + 42, 42, { color: '#ff7a6a' });
  uiText(R.win ? T.victorySub : T.defeatSub, viewW / 2, y + 84, 12, '#e8d6ae', { align: 'center' });
  // stars
  const labels = lang === 'zh' ? ['赢得战争', '基地生命 ≥ 50%', '20 分钟内获胜'] : ['Win the war', 'Base health ≥ 50%', 'Win within 20 min'];
  for (let i = 0; i < 3; i++) {
    const st = 20 + i * 14;
    const on = R.ok[i] && t >= st;
    const pop = on ? 1 + Math.max(0, 1 - (t - st) / 8) * 0.6 : 1;
    const sx = viewW / 2 + (i - 1) * 110, sy = y + 124;
    if (on) { c.globalCompositeOperation = 'lighter'; glowAt('hot', sx, sy, 34, 0.5); c.globalCompositeOperation = 'source-over'; c.globalAlpha = k; }
    starIcon(sx, sy, 20 * pop, on ? linGrad(sx, sy - 20, sx, sy + 20, [[0, '#fff3a0'], [0.5, '#ffd23a'], [1, '#d28a00']]) : 'rgba(255,255,255,0.1)', on ? '#6a4400' : 'rgba(255,255,255,0.3)');
    uiText(labels[i], sx, sy + 32, 10, on ? '#fff2d0' : '#8a8274', { align: 'center' });
  }
  // stats
  const st = S.stats;
  const rows = [
    [T.stats.time, fmtTime(S.tick)], [T.stats.kills, fmtFull(st.kills)], [T.stats.lost, fmtFull(st.lost)], [T.stats.gold, fmtFull(st.gold)],
    [T.stats.dmg, fmtFull(Math.round(st.dmg))], [T.stats.age, T.ageNames[S.tech - 1]], [T.stats.turrets, String(st.turrets)], [T.stats.specials, String(st.specials)],
  ];
  const colW = (w - 60) / 2;
  rows.forEach(([kk, v], i) => {
    const rx = x + 30 + (i % 2) * (colW + 0), ry = y + 184 + Math.floor(i / 2) * 22;
    const a = clamp((t - 30 - i * 3) / 8, 0, 1);
    c.globalAlpha = k * a;
    uiText(kk, rx, ry, 11.5, '#bfa77a');
    uiText(v, rx + colW - 16, ry, 12, '#fff', { align: 'right' });
  });
  c.globalAlpha = k;
  // achievements unlocked in this war
  if (Meta.unlockedNow.length) {
    uiText(T.newAch + ':', x + 30, y + 282, 11, UI.goldHi);
    let ax = x + 30;
    for (const id of Meta.unlockedNow.slice(0, 4)) {
      trophyIcon(ax + 8, y + 302, 0.8, true);
      uiText(T.ach[id][0], ax + 20, y + 302.5, 11, '#fff2d0');
      G.ctx.font = `bold 11px ${FONT_HUD}`;
      ax += 34 + G.ctx.measureText(T.ach[id][0]).width;
      if (ax > x + w - 80) break;
    }
  }
  if (t > 24) {
    uiButton('again', viewW / 2 - 150, y + h - 58, 140, 40, T.playAgain, () => startGame(S.diff), { kind: 'gold', size: 16, family: FONT_SERIF });
    uiButton('emenu', viewW / 2 + 10, y + h - 58, 140, 40, T.mainMenu, () => toMainMenu(), { kind: 'dark', size: 16, family: FONT_SERIF });
  }
  c.globalAlpha = 1;
  // sounds for the stars
  if (Game.lastStarT !== t) {
    Game.lastStarT = t;
    for (let i = 0; i < 3; i++) if (R.ok[i] && t === 20 + i * 14) Sfx.play('coin');
  }
}

// ------------------------------------------------------------------ flow
function startGame(d) {
  newMatch(d);
  Env.reset(1);
  caches.base = {};
  clearSave();
  Game.screen = 'play'; Game.overlay = null;
  Sfx.init(); applyAudioSettings();
  Sfx.playMusic('battle', true);
  Sfx.play('confirm');
}
function continueGame() {
  if (!loadMatch()) return false;
  caches.base = {};
  Game.screen = 'play'; Game.overlay = null;
  Sfx.init(); applyAudioSettings();
  Sfx.playMusic('battle', true);
  return true;
}
function toMainMenu() {
  if (S && !S.over) saveMatch();
  S = null;
  Game.screen = 'title'; Game.overlay = null;
  Title.ageT = 0;
  Sfx.playMusic('title', true);
  Sfx.play('close');
}

function drawScreen(alpha) {
  switch (Game.screen) {
    case 'title': drawTitle(); break;
    case 'difficulty': drawDifficulty(); break;
    case 'achievements': drawAchievements(); break;
    case 'gallery': drawGallery(); break;
    case 'play':
      drawWorld(S.paused || Game.overlay ? 1 : alpha);
      drawHUD();
      if (S.paused && !Game.overlay) drawPauseMenu();
      break;
    case 'end':
      drawWorld(alpha);
      buttons = [];
      drawEndScreen();
      break;
  }
  if (Game.overlay === 'settings') { buttons = []; drawSettings(); }
}

function boot() {
  applyAudioSettings();
  document.getElementById('rotateGo').textContent = T.rotateGo;
  document.getElementById('rotateTxt').textContent = T.rotate;
  document.getElementById('rotateGo').onclick = () => { Game.portraitOk = true; document.getElementById('rotate').style.display = 'none'; };
  resize();
  Env.reset(1);
  Title.cam = camRange()[0] + 40;
  requestAnimationFrame(frame);
}

// wait for the fonts so cached text uses them
if (document.fonts && document.fonts.load) {
  Promise.all([document.fonts.load('bold 20px AoWSerif'), document.fonts.load('700 40px AoWTitle')]).then(boot, boot);
} else boot();
