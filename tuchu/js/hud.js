/* HUD：罗盘、小地图、血条、武器槽、击杀播报、横幅、结算 */
import { QUALITY, ITEMS, ARMOR, THROWABLES } from './data.js';

const $ = s => document.querySelector(s);

export class HUD {
  constructor(game) {
    this.game = game;
    this.root = $('#hud');
    this.compass = $('#compassStrip');
    this.mapCvs = $('#minimap');
    this.mctx = this.mapCvs.getContext('2d');
    this.killfeed = $('#killfeed');
    this.dmgDirs = $('#dmgDirs');
    this.hintEl = $('#hint');
    this.hintT = 0;
    this.mapFrame = 0;
    this.buildCompass();
    this.slots = Array.from(document.querySelectorAll('.wslot')).map(el => ({
      el, name: el.querySelector('.wname'), q: el.querySelector('.wq'),
      ammo: el.querySelector('.wammo'), evo: el.querySelector('.wevoFill'), lv: el.querySelector('.wlv'),
    }));
    this.meds = Array.from(document.querySelectorAll('.med')).map(el => ({ el, n: el.querySelector('.n'), id: el.dataset.item }));
    this.lastHp = 100;
    // 每帧要改的元素全部缓存，避免 querySelector 开销
    const ids = ['hpFill','hpGhost','hpText','hpBar','boostFill','lowhp','blindFx','helmIcon','vestIcon',
      'helmLv','vestLv','revN','cAlive','cKill','throwName','reticle','scopeMask','reloadRing','reloadArc',
      'useBar','useFill','useName','downed','downFill','downSec','blockWarn','pickPrompt','pickName',
      'lockHint','phaseLabel','phaseTime','phaseBar','bossBar','bossFill','bossPhase','hitmark','banner','result',
      'rTitle','rTitleSub','rWave','rKill','rDmg','rAcc','rHead','rTime','rScore','rTitleName'];
    this.el = {};
    for (const id of ids) this.el[id] = document.getElementById(id);
    this.bn1 = this.el.banner.querySelector('.bn1');
    this.bn2 = this.el.banner.querySelector('.bn2');
    this._cache = {};
  }

  buildCompass() {
    const px = 4.6;                       // 每度像素
    const names = { 0: '北', 45: '东北', 90: '东', 135: '东南', 180: '南', 225: '西南', 270: '西', 315: '西北' };
    let html = '';
    for (let d = -190; d <= 550; d += 5) {
      const n = ((d % 360) + 360) % 360;
      const x = (d + 190) * px;
      const major = n % 15 === 0;
      html += `<i class="${major ? 'maj' : ''}" style="left:${x}px"></i>`;
      if (n % 45 === 0) {
        const isCard = n % 90 === 0;
        html += `<b class="${isCard ? 'card' : ''}" style="left:${x}px">${names[n]}</b>`;
      } else if (n % 15 === 0) {
        html += `<b style="left:${x}px;opacity:.55;font-size:10px">${n}</b>`;
      }
    }
    this.compass.innerHTML = html;
    this.compass.style.width = (740 * px) + 'px';
    this.compassPx = px;
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  hint(text, dur) {
    this.hintEl.textContent = text;
    this.hintEl.classList.add('on');
    this.hintT = dur || 1.8;
  }

  killFeedAdd(weaponName, victim, head) {
    const el = document.createElement('div');
    el.className = 'kf' + (head ? ' head' : '');
    el.innerHTML = `<span class="me">你</span> 使用 <span class="w">${weaponName}</span> 淘汰了 <span class="vic">${victim}</span>${head ? ' <span class="w">爆头</span>' : ''}`;
    this.killfeed.appendChild(el);
    while (this.killfeed.children.length > 5) this.killfeed.removeChild(this.killfeed.firstChild);
    setTimeout(() => el.remove(), 5200);
  }

  banner(main, sub) {
    const b = this.el.banner;
    this.bn1.textContent = main;
    this.bn2.textContent = sub || '';
    b.classList.remove('on'); void b.offsetWidth; b.classList.add('on');
  }

  hitMark(head) {
    const h = this.el.hitmark;
    h.classList.toggle('head', !!head);
    h.classList.remove('on'); void h.offsetWidth; h.classList.add('on');
    const r = this.el.reticle;
    r.classList.add('hit');
    clearTimeout(this._hitT);
    this._hitT = setTimeout(() => r.classList.remove('hit'), 140);
  }

  damageDir(angleRad) {
    const d = document.createElement('div');
    d.className = 'ddir';
    d.style.transform = `rotate(${angleRad}rad)`;
    d.innerHTML = '<i></i>';
    this.dmgDirs.appendChild(d);
    setTimeout(() => d.remove(), 1200);
    const f = $('#hurtFlash');
    f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  }

  setPhase(label, time, warn) {
    const c = this._cache;
    if (c.pl !== label) { this.el.phaseLabel.textContent = label; c.pl = label; }
    if (c.pt !== time) { this.el.phaseTime.textContent = time; c.pt = time; }
    this.el.phaseBar.classList.toggle('warn', !!warn);
  }

  setBoss(e) {
    const bar = this.el.bossBar;
    if (!e) { if (!bar.classList.contains('hidden')) bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    this.el.bossFill.style.width = Math.max(0, e.hp / e.maxHp * 100) + '%';
    if (this._cache.bp !== e.phase) { this.el.bossPhase.textContent = `阶段 ${e.phase} / 3`; this._cache.bp = e.phase; }
  }

  update(dt, game) {
    const p = game.player, E = this.el, c = this._cache;

    // 罗盘
    const heading = ((-p.yaw * 180 / Math.PI) % 360 + 360) % 360;
    const w = this.compass.parentElement.clientWidth;
    this.compass.style.transform = `translateX(${w / 2 - (heading + 190) * this.compassPx}px)`;

    // 血条
    const hpPct = Math.max(0, p.hp / p.maxHp * 100);
    E.hpFill.style.width = hpPct + '%';
    E.hpGhost.style.width = hpPct + '%';
    const hpTxt = String(Math.ceil(Math.max(0, p.hp)));
    if (c.hp !== hpTxt) { E.hpText.textContent = hpTxt; c.hp = hpTxt; }
    E.hpBar.classList.toggle('low', p.hp < 35);
    E.boostFill.style.width = Math.min(100, p.boost) + '%';
    E.lowhp.style.opacity = p.hp < 40 ? String((1 - p.hp / 40) * 0.9) : '0';
    E.blindFx.style.opacity = p.blindT > 0 ? String(Math.min(1, p.blindT)) : '0';

    // 护甲
    E.helmIcon.classList.toggle('lv0', p.helmet === 0);
    E.vestIcon.classList.toggle('lv0', p.vest === 0);
    if (c.hl !== p.helmet) { E.helmLv.textContent = p.helmet || '-'; c.hl = p.helmet; }
    if (c.vl !== p.vest) { E.vestLv.textContent = p.vest || '-'; c.vl = p.vest; }
    if (c.rv !== p.revives) { E.revN.textContent = p.revives; c.rv = p.revives; }

    // 计数
    const na = game.enemies.alive() + (game.pendingSpawns || 0);
    if (c.na !== na) { E.cAlive.textContent = na; c.na = na; }
    if (c.nk !== game.stats.kills) { E.cKill.textContent = game.stats.kills; c.nk = game.stats.kills; }

    // 武器槽
    for (let i = 0; i < 3; i++) {
      const S = this.slots[i], w = game.slots[i];
      const key = 's' + i;
      if (!w) {
        if (c[key] !== 'empty') {
          S.el.classList.add('empty'); S.el.classList.remove('cur', 'maxed');
          S.name.textContent = '—'; S.ammo.innerHTML = '<b></b><span>空槽位</span>';
          S.evo.style.width = '0%'; S.lv.textContent = '';
          c[key] = 'empty';
        }
        continue;
      }
      S.el.classList.remove('empty');
      S.el.classList.toggle('cur', i === game.slotIdx);
      S.el.classList.toggle('maxed', w.maxed);
      const q = QUALITY[w.level];
      const sig = `${w.id}|${w.level}|${w.ammo}|${game.reserveOf(w.def.ammo)}|${w.kills}`;
      if (c[key] !== sig) {
        c[key] = sig;
        S.el.style.borderLeftColor = q.color;
        S.name.textContent = w.def.name;
        S.q.style.background = q.color; S.q.style.boxShadow = `0 0 7px ${q.glow}`;
        if (w.def.melee) S.ammo.innerHTML = '<b>∞</b><span></span>';
        else S.ammo.innerHTML = `<b>${w.ammo}</b><span>/${game.reserveOf(w.def.ammo)}</span>`;
        S.ammo.classList.toggle('low', !w.def.melee && w.ammo <= w.maxMag * 0.25);
        S.evo.style.width = (w.evoProgress * 100) + '%';
        S.lv.textContent = w.maxed ? '满级' : `Lv${w.level + 1} ${w.kills}/${w.evoNext}`;
      }
    }

    // 药品
    for (const m of this.meds) {
      const n = game.inv[m.id] || 0;
      if (c['m' + m.id] !== n) { m.n.textContent = n; m.el.classList.toggle('empty', n <= 0); c['m' + m.id] = n; }
    }
    // 投掷物按钮
    const th = THROWABLES[game.throwType];
    const ts = `${th.name} ${game.inv[game.throwType] || 0}`;
    if (c.th !== ts) { E.throwName.textContent = ts; c.th = ts; }

    // 准心
    const ret = E.reticle;
    const cw = game.currentWeapon;
    let sp = 11;
    if (cw) {
      sp = 6 + cw.def.spread * 2.6 + Math.hypot(p.vx, p.vz) * 1.5 + p.recoilAccum * 1.4;
      if (p.ads) sp *= 0.42;
    }
    ret.style.setProperty('--sp', sp.toFixed(1) + 'px');
    ret.classList.toggle('ads', p.ads);
    const scoped = p.ads && cw && (cw.def.adsFov <= 25);
    E.scopeMask.classList.toggle('hidden', !scoped);
    ret.classList.toggle('hide', p.downed);

    // 换弹
    const rr = E.reloadRing;
    if (cw && cw.reloading) {
      rr.classList.remove('hidden');
      const k = 1 - cw.reloadT / cw.reloadTime;
      E.reloadArc.style.strokeDashoffset = String(100.5 * (1 - k));
    } else if (!rr.classList.contains('hidden')) rr.classList.add('hidden');

    // 使用道具进度
    const ub = E.useBar;
    if (p.useT > 0 && p.useItem) {
      ub.classList.remove('hidden');
      const def = ITEMS[p.useItem];
      E.useFill.style.width = ((1 - p.useT / def.use) * 100) + '%';
      if (c.ui !== p.useItem) { E.useName.textContent = '使用 ' + def.name; c.ui = p.useItem; }
    } else if (!ub.classList.contains('hidden')) { ub.classList.add('hidden'); c.ui = null; }

    // 倒地
    const dn = E.downed;
    if (p.downed) {
      dn.classList.remove('hidden');
      E.downFill.style.width = (p.downT / 10 * 100) + '%';
      const ds = Math.ceil(p.downT);
      if (c.ds !== ds) { E.downSec.textContent = ds; c.ds = ds; }
    } else if (!dn.classList.contains('hidden')) dn.classList.add('hidden');

    // 封锁线警告
    const r = Math.hypot(p.x, p.z);
    E.blockWarn.classList.toggle('hidden', r <= game.world.blockadeR);

    // 鼠标锁定提示（仅桌面端且未锁定）
    E.lockHint.classList.toggle('hidden', game.touch || game.pointerLocked || game.state === 'over');

    // 提示
    if (this.hintT > 0) { this.hintT -= dt; if (this.hintT <= 0) this.hintEl.classList.remove('on'); }

    // 拾取提示
    const pk = E.pickPrompt;
    if (game.nearPickup) {
      pk.classList.remove('hidden');
      if (c.pn !== game.nearPickup.label) { E.pickName.textContent = game.nearPickup.label; c.pn = game.nearPickup.label; }
    } else if (!pk.classList.contains('hidden')) { pk.classList.add('hidden'); c.pn = null; }

    // BOSS
    this.setBoss(game.enemies.boss);

    // 小地图（隔帧）
    if ((this.mapFrame++ & 1) === 0) this.drawMinimap(game);
  }

  drawMinimap(game) {
    const c = this.mctx, W = this.mapCvs.width, H = this.mapCvs.height;
    const p = game.player;
    const view = 78;                       // 可视半径（米）
    const s = (W / 2) / view;
    c.clearRect(0, 0, W, H);
    c.fillStyle = game.world.theme.night ? '#0c1218' : '#3a3120';
    c.fillRect(0, 0, W, H);

    c.save();
    c.translate(W / 2, H / 2);
    c.scale(s, s);
    c.translate(-p.x, -p.z);

    // 停机坪
    c.fillStyle = 'rgba(120,130,140,.28)';
    c.beginPath(); c.arc(0, -62, 13, 0, 7); c.fill();

    // 建筑与掩体
    c.fillStyle = 'rgba(210,215,220,.30)';
    c.strokeStyle = 'rgba(255,255,255,.16)'; c.lineWidth = 0.4;
    for (const col of game.world.colliders) {
      if (col.dead) continue;
      const w = col.x1 - col.x0, h = col.z1 - col.z0;
      if (w < 1.2 && h < 1.2) continue;
      if (Math.abs(col.x0 - p.x) > view + 30 || Math.abs(col.z0 - p.z) > view + 30) continue;
      c.globalAlpha = col.low ? 0.35 : 0.75;
      c.fillRect(col.x0, col.z0, w, h);
    }
    c.globalAlpha = 1;

    // 封锁线
    c.strokeStyle = 'rgba(255,70,50,.95)'; c.lineWidth = 1.6;
    c.beginPath(); c.arc(0, 0, game.world.blockadeR, 0, 7); c.stroke();
    c.strokeStyle = 'rgba(255,70,50,.22)'; c.lineWidth = 5;
    c.beginPath(); c.arc(0, 0, game.world.blockadeR + 2.5, 0, 7); c.stroke();

    // 撤离点
    if (game.world.extraction.visible) {
      c.fillStyle = '#3affb8';
      c.beginPath(); c.arc(0, -62, 4.5, 0, 7); c.fill();
      c.strokeStyle = 'rgba(58,255,184,.7)'; c.lineWidth = 1.2;
      c.beginPath(); c.arc(0, -62, 9 + Math.sin(game.time * 3) * 2, 0, 7); c.stroke();
    }

    // 空投
    for (const d of game.drops) {
      if (d.taken) continue;
      c.fillStyle = d.crate ? '#ff9a3c' : '#cfd8dd';
      c.fillRect(d.x - 1.6, d.z - 1.6, 3.2, 3.2);
    }

    // 敌人
    for (const e of game.enemies.list) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if (d > view + 8) continue;
      c.fillStyle = e.def.boss ? '#ff2a2a' : e.def.elite ? '#ffd24a' : e.def.flying ? '#6fd0ff' : '#ff5a3c';
      const r = e.def.boss ? 4.6 : e.def.elite ? 3.2 : 2.2;
      c.beginPath(); c.arc(e.x, e.z, r, 0, 7); c.fill();
    }
    c.restore();

    // 玩家箭头（始终居中，指向朝向）
    c.save();
    c.translate(W / 2, H / 2);
    c.rotate(-p.yaw + Math.PI);
    c.fillStyle = '#ffffff';
    c.strokeStyle = 'rgba(0,0,0,.7)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -9); c.lineTo(6.5, 8); c.lineTo(0, 4.5); c.lineTo(-6.5, 8); c.closePath();
    c.stroke(); c.fill();
    c.restore();
    // 视野扇形
    c.save();
    c.translate(W / 2, H / 2);
    c.rotate(-p.yaw + Math.PI);
    const grd = c.createRadialGradient(0, 0, 0, 0, 0, 62);
    grd.addColorStop(0, 'rgba(255,255,255,.22)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = grd;
    c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 62, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55); c.closePath(); c.fill();
    c.restore();

    // 北标
    c.fillStyle = '#f5c33b'; c.font = 'bold 15px sans-serif'; c.textAlign = 'center';
    c.fillText('北', W / 2, 16);
  }

  showResult(game, win) {
    const st = game.stats;
    const E = this.el;
    E.rTitle.textContent = win ? '突围成功' : '突围失败';
    E.rTitle.classList.toggle('fail', !win);
    E.rTitleSub.textContent = win ? '直升机已带你离开包围圈' : '你没能冲出重围';
    E.rWave.textContent = String(game.wave);
    E.rKill.textContent = String(st.kills);
    E.rDmg.textContent = String(Math.round(st.dmg));
    E.rAcc.textContent = (st.shots ? Math.round(st.hits / st.shots * 100) : 0) + '%';
    E.rHead.textContent = String(st.heads);
    const sec = Math.floor(st.time);
    E.rTime.textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
    const score = game.computeScore(win);
    E.rScore.textContent = String(score);
    const title = game.titleFor(score, win);
    const tn = E.rTitleName;
    tn.textContent = title.name;
    tn.style.color = title.color;
    tn.style.borderColor = title.color;
    tn.style.boxShadow = `0 0 22px ${title.color}44`;
    E.result.classList.remove('hidden');
  }
}
