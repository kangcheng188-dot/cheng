'use strict';
// Age of War Plus: persistent settings, records, achievements, tutorial progress and save games.

const Store = {
  get(k, def) { try { const v = localStorage.getItem('aowp_' + k); return v === null ? def : JSON.parse(v); } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem('aowp_' + k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem('aowp_' + k); } catch (e) {} },
};

const Settings = Object.assign({ sound: true, music: 0.6, sfx: 0.8, dmgNumbers: true, blood: true, hints: true, speed: 1 }, Store.get('settings', {}));
function saveSettings() { Store.set('settings', Settings); }
function applyAudioSettings() {
  Sfx.on = Settings.sound; Sfx.sfxVol = Settings.sfx; Sfx.musicVol = Settings.music;
  Sfx.musicOn = Settings.music > 0;
  Sfx.applyVolumes();
}

const Meta = {
  ach: Store.get('ach', {}),          // id -> unlock time
  records: Store.get('records', {}),  // diff -> { wins, stars, time }
  tut: Store.get('tut', {}),          // tutorial tip id -> shown
  games: Store.get('games', 0),
  unlockedNow: [],                    // unlocked during the current match (for the end screen)
  toast: null,                        // { id, t }

  unlock(id) {
    if (this.ach[id]) return;
    this.ach[id] = Date.now();
    Store.set('ach', this.ach);
    this.unlockedNow.push(id);
    this.toast = { id, t: 0 };
    Sfx.play('achieve');
  },
  count() { return ACHIEVEMENTS.filter(a => this.ach[a.id]).length; },
  record(diff, stars, time) {
    const r = this.records[diff] || { wins: 0, stars: 0, time: 0 };
    r.wins++;
    r.stars = Math.max(r.stars, stars);
    r.time = r.time ? Math.min(r.time, time) : time;
    this.records[diff] = r;
    Store.set('records', this.records);
  },
  tutDone(id) { if (!this.tut[id]) { this.tut[id] = 1; Store.set('tut', this.tut); } },
  resetTut() { this.tut = {}; Store.set('tut', this.tut); },
};

// ------------------------------------------------------------------ save / continue
// Only what is needed to rebuild the battle: projectiles, particles and running specials are dropped.
function serializeMatch() {
  if (!S || S.over) return null;
  const U = S.units.filter(u => !u.dead).map(u => [u.id, u.side, Math.round(u.x * 10) / 10, Math.round(u.hp), u.max, u.dmg, u.rdmg, u.reward]);
  const tur = (arr) => arr.map(t => t ? t.id : 0);
  return {
    v: 1, diff: S.diff, tick: S.tick, cash: S.cash, xp: S.xp, tech: S.tech, etech: S.etech, addons: S.addons, eaddons: S.eaddons,
    spots: tur(S.spots), espots: tur(S.espots), units: U,
    pb: [S.pBase.hp, S.pBase.max], eb: [S.eBase.hp, S.eBase.max],
    tray: S.tray, trainId: S.trainId, trainTimer: S.trainTimer, trainTotal: S.trainTotal,
    specTimer: S.specTimer, eSpec: S.eSpec, ai: S.ai, up: S.up, stats: S.stats, camX: S.camX, tutT: S.tutT,
  };
}
function saveMatch() { const d = serializeMatch(); if (d) Store.set('save', d); }
function hasSave() { const d = Store.get('save', null); return !!(d && d.v === 1); }
function clearSave() { Store.del('save'); }

function loadMatch() {
  const d = Store.get('save', null);
  if (!d || d.v !== 1) return false;
  newMatch(d.diff);
  Object.assign(S, {
    tick: d.tick, cash: d.cash, xp: d.xp, tech: d.tech, etech: d.etech, addons: d.addons, eaddons: d.eaddons,
    tray: d.tray, trainId: d.trainId, trainTimer: d.trainTimer, trainTotal: d.trainTotal,
    specTimer: d.specTimer, eSpec: d.eSpec, ai: d.ai, up: d.up, stats: d.stats, camX: d.camX, pcamX: d.camX, tutT: d.tutT || 0,
  });
  S.pBase.hp = d.pb[0]; S.pBase.max = d.pb[1]; S.eBase.hp = d.eb[0]; S.eBase.max = d.eb[1];
  d.spots.forEach((id, i) => { if (id) placeTurret(1, i, id); });
  d.espots.forEach((id, i) => { if (id) placeTurret(2, i, id); });
  for (const [id, side, x, hp, max, dmg, rdmg, reward] of d.units) {
    const u = spawnUnit(id, side, true);
    u.x = u.px = x; u.hp = hp; u.max = max; u.dmg = dmg; u.rdmg = rdmg; u.reward = reward; u.c = 1;
  }
  Env.reset(S.tech);
  return true;
}
