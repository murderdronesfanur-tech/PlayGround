(() => {
  'use strict';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const ui = {
    title: document.getElementById('title-screen'), top: document.getElementById('topbar'), hud: document.getElementById('game-hud'),
    pause: document.getElementById('pause-screen'), upgrade: document.getElementById('upgrade-screen'), end: document.getElementById('end-screen'),
    timer: document.getElementById('timer'), kills: document.getElementById('kills'), swarm: document.getElementById('swarm-count'),
    health: document.getElementById('health-fill'), healthText: document.getElementById('health-text'), xp: document.getElementById('xp-fill'),
    xpText: document.getElementById('xp-text'), level: document.getElementById('level-text'), objective: document.getElementById('objective-text'),
    cards: document.getElementById('upgrade-cards'), toast: document.getElementById('toast'), mobileHint: document.getElementById('mobile-hint')
  };
  let W = 0, H = 0, DPR = 1, last = 0, state = 'menu', elapsed = 0, spawnClock = 0, enemyId = 0, toastClock = 0;
  let player, minions = [], enemies = [], projectiles = [], orbs = [], particles = [], floaters = [], decor = [], camera = {x: 0, y: 0};
  const keys = new Set(), input = {x: 0, y: 0}, pointer = {active: false, id: null, x: 0, y: 0, dx: 0, dy: 0};
  const WORLD = 2600, TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize); resize();
  function seedDecor() {
    decor = [];
    for (let i = 0; i < 190; i++) decor.push({x: rand(45, WORLD - 45), y: rand(45, WORLD - 45), type: Math.random() < .7 ? 'grass' : 'stone', s: rand(.5, 1.4), rot: rand(0, TAU)});
  }
  seedDecor();

  function resetGame() {
    elapsed = 0; spawnClock = 0; enemyId = 0; enemies = []; projectiles = []; orbs = []; particles = []; floaters = [];
    player = {x: WORLD / 2, y: WORLD / 2, r: 18, hp: 100, maxHp: 100, xp: 0, nextXp: 8, level: 1, kills: 0, speed: 210, damage: 18, attackRate: 1, range: 235, magnet: 135, invuln: 0, hitFlash: 0, facing: 1, bossSpawned: false};
    minions = Array.from({length: 5}, (_, i) => ({angle: TAU * i / 5, phase: rand(0, TAU), cooldown: rand(0, .7), x: player.x, y: player.y, hit: 0}));
    camera.x = player.x; camera.y = player.y; input.x = input.y = 0;
    ui.title.hidden = true; ui.pause.hidden = true; ui.upgrade.hidden = true; ui.end.hidden = true;
    ui.top.hidden = false; ui.hud.hidden = false; ui.mobileHint.hidden = !('ontouchstart' in window);
    state = 'playing'; last = performance.now(); updateHud();
    for (let i = 0; i < 5; i++) spawnEnemy(true);
  }
  function showToast(message) {
    ui.toast.textContent = message; ui.toast.classList.add('show'); toastClock = 2.2;
  }
  function updateHud() {
    if (!player) return;
    const m = Math.floor(elapsed / 60), s = Math.floor(elapsed % 60);
    ui.timer.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    ui.kills.textContent = String(player.kills).padStart(2, '0'); ui.swarm.textContent = String(minions.length).padStart(2, '0');
    ui.health.style.width = `${clamp(player.hp / player.maxHp * 100, 0, 100)}%`;
    ui.healthText.textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
    ui.xp.style.width = `${clamp(player.xp / player.nextXp * 100, 0, 100)}%`;
    ui.xpText.textContent = `${Math.floor(player.xp)} / ${player.nextXp}`; ui.level.textContent = `LV ${player.level}`;
    ui.objective.textContent = elapsed < 120 ? `GROW THE SWARM · HUNTER IN ${timeText(120 - elapsed)}` : (enemies.some(e => e.boss) ? 'THE HUNTER IS HERE · BRING IT DOWN' : 'THE HUNTER HAS FALLEN · THE NIGHT IS YOURS');
  }
  function timeText(t) { return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`; }
  function spawnEnemy(initial = false, boss = false) {
    const ang = rand(0, TAU), pad = Math.max(W, H) * .63 + rand(90, 260);
    const x = clamp(player.x + Math.cos(ang) * pad, 32, WORLD - 32), y = clamp(player.y + Math.sin(ang) * pad, 32, WORLD - 32);
    const type = boss ? 'hunter' : pick(['villager', 'guard', 'archer']);
    const base = {id: enemyId++, x, y, vx: 0, vy: 0, r: 13, hp: 34 + elapsed * .14, maxHp: 34 + elapsed * .14, speed: 38 + Math.min(elapsed * .11, 20), damage: 5, attack: rand(.5, 1.5), ranged: false, color: '#e6a783', boss: false, hit: 0, anim: rand(0, TAU)};
    if (type === 'guard') Object.assign(base, {r: 15, hp: 54 + elapsed * .2, maxHp: 54 + elapsed * .2, speed: 31 + Math.min(elapsed * .08, 14), damage: 8, color: '#9eabc8', ranged: true});
    if (type === 'archer') Object.assign(base, {r: 12, hp: 28 + elapsed * .12, maxHp: 28 + elapsed * .12, speed: 43 + Math.min(elapsed * .1, 18), damage: 5, color: '#d8b8e4', ranged: true});
    if (boss) Object.assign(base, {r: 29, hp: 850, maxHp: 850, speed: 47, damage: 18, color: '#ff5969', ranged: true, boss: true, attack: 1.4});
    enemies.push(base);
    if (boss) showToast('THE HUNTER HAS ENTERED THE HOLLOW');
    return base;
  }
  function nearestEnemy(x, y, maxRange = Infinity) {
    let target = null, best = maxRange * maxRange;
    for (const e of enemies) { const d = (e.x - x) ** 2 + (e.y - y) ** 2; if (d < best) { best = d; target = e; } }
    return target;
  }
  function update(dt) {
    if (state !== 'playing') return;
    elapsed += dt; spawnClock += dt;
    if (!player.bossSpawned && elapsed >= 120) { player.bossSpawned = true; spawnEnemy(false, true); }
    if (elapsed < 120 && elapsed > 0) {
      const interval = Math.max(.43, 1.28 - elapsed * .004);
      if (spawnClock > interval && enemies.length < 38) { spawnClock = 0; spawnEnemy(); if (Math.random() < .24 && enemies.length < 38) spawnEnemy(); }
    } else if (elapsed >= 120 && enemies.length < 32 && spawnClock > 1.35) { spawnClock = 0; spawnEnemy(); }
    const kx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0) + input.x;
    const ky = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0) + input.y;
    const mag = Math.hypot(kx, ky), mx = mag > 1 ? kx / mag : kx, my = mag > 1 ? ky / mag : ky;
    player.x = clamp(player.x + mx * player.speed * dt, 28, WORLD - 28); player.y = clamp(player.y + my * player.speed * dt, 28, WORLD - 28);
    if (Math.abs(mx) > .1) player.facing = Math.sign(mx);
    camera.x += (player.x - camera.x) * Math.min(1, dt * 5); camera.y += (player.y - camera.y) * Math.min(1, dt * 5);
    player.invuln = Math.max(0, player.invuln - dt); player.hitFlash = Math.max(0, player.hitFlash - dt);
    for (let i = minions.length - 1; i >= 0; i--) {
      const m = minions[i]; m.phase += dt * (1.25 + i * .013); m.cooldown -= dt; m.hit = Math.max(0, m.hit - dt * 3);
      const target = nearestEnemy(player.x, player.y, player.range);
      const targetAngle = target ? Math.atan2(target.y - player.y, target.x - player.x) : m.angle + m.phase * .2;
      const near = target && dist2(player, target) < (player.range * .83) ** 2;
      const desiredAngle = near ? targetAngle + (i - (minions.length - 1) / 2) * .12 : m.phase + i * TAU / Math.max(minions.length, 1);
      let angleDelta = Math.atan2(Math.sin(desiredAngle - m.angle), Math.cos(desiredAngle - m.angle));
      m.angle += angleDelta * Math.min(1, dt * (near ? 4 : 2));
      const radius = near ? 49 + (i % 3) * 7 : 43 + (i % 3) * 10;
      m.x += (player.x + Math.cos(m.angle) * radius - m.x) * Math.min(1, dt * 8);
      m.y += (player.y + Math.sin(m.angle) * radius - m.y) * Math.min(1, dt * 8);
      if (target && near && m.cooldown <= 0) {
        const d = Math.sqrt(dist2(m, target));
        target.hp -= player.damage * (target.boss ? .78 : 1); target.hit = .12; m.hit = 1;
        m.cooldown = Math.max(.28, .82 / player.attackRate) * rand(.78, 1.15);
        particles.push({x: target.x, y: target.y, life: .22, max: .22, type: 'slash', tx: m.x, ty: m.y, color: target.boss ? '#ff5969' : '#c9b9ff'});
        if (Math.random() < .34) burst(target.x + rand(-7, 7), target.y + rand(-7, 7), '#d5c8ff', 2, 45);
        if (d < 80) target.hp -= player.damage * .12;
      }
    }
    for (const e of enemies) {
      e.anim += dt * 6; e.attack -= dt; e.hit = Math.max(0, e.hit - dt);
      const dx = player.x - e.x, dy = player.y - e.y, d = Math.hypot(dx, dy) || 1;
      const desired = e.ranged && d < (e.boss ? 370 : 205) ? 0 : 1;
      const approach = e.ranged && d < (e.boss ? 370 : 205) ? -1 : 1;
      e.vx += ((dx / d) * e.speed * approach - e.vx) * Math.min(1, dt * 3);
      e.vy += ((dy / d) * e.speed * approach - e.vy) * Math.min(1, dt * 3);
      if (desired === 0) { e.vx += -dy / d * Math.sin(e.anim) * 12 * dt; e.vy += dx / d * Math.sin(e.anim) * 12 * dt; }
      e.x = clamp(e.x + e.vx * dt, 20, WORLD - 20); e.y = clamp(e.y + e.vy * dt, 20, WORLD - 20);
      if (d < player.r + e.r + 5 && e.attack <= 0) { hurtPlayer(e.damage); e.attack = e.boss ? 1.1 : 1.25; }
      if (e.ranged && e.attack <= 0 && d < (e.boss ? 540 : 360) && d > 85) {
        projectiles.push({x: e.x, y: e.y, vx: dx / d * (e.boss ? 205 : 145), vy: dy / d * (e.boss ? 205 : 145), r: e.boss ? 7 : 4, damage: e.damage, color: e.boss ? '#ff5969' : '#ffc28e', life: 3});
        e.attack = e.boss ? 1.6 : rand(2.4, 3.8);
      }
    }
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (dist2(p, player) < (player.r + p.r) ** 2) { hurtPlayer(p.damage); projectiles.splice(i, 1); continue; }
      if (p.life <= 0) projectiles.splice(i, 1);
    }
    for (let i = orbs.length - 1; i >= 0; i--) {
      const o = orbs[i], dx = player.x - o.x, dy = player.y - o.y, d = Math.hypot(dx, dy) || 1;
      if (d < player.magnet) { const pull = 300 + (player.magnet - d) * 3; o.x += dx / d * pull * dt; o.y += dy / d * pull * dt; }
      if (d < player.r + 13) { gainXp(o.value); burst(o.x, o.y, '#b9a3ff', 5, 95); orbs.splice(i, 1); continue; }
      o.age += dt;
    }
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i]; if (e.hp <= 0) {
        player.kills++; burst(e.x, e.y, e.boss ? '#ff5969' : '#e8a7a5', e.boss ? 24 : 9, e.boss ? 175 : 100);
        if (!e.boss) orbs.push({x: e.x, y: e.y, value: e.ranged ? 2 : 1, age: 0});
        else { orbs.push({x: e.x, y: e.y, value: 12, age: 0}); endGame(true); }
        enemies.splice(i, 1);
      }
    }
    for (let i = particles.length - 1; i >= 0; i--) { particles[i].life -= dt; if (particles[i].type === 'dot') { particles[i].x += particles[i].vx * dt; particles[i].y += particles[i].vy * dt; particles[i].vx *= .97; particles[i].vy *= .97; } if (particles[i].life <= 0) particles.splice(i, 1); }
    for (let i = floaters.length - 1; i >= 0; i--) { const f = floaters[i]; f.life -= dt; f.y -= 24 * dt; if (f.life <= 0) floaters.splice(i, 1); }
    if (toastClock > 0 && (toastClock -= dt) <= 0) ui.toast.classList.remove('show');
    if (elapsed >= 240 && state === 'playing') endGame(true);
    updateHud();
  }
  function hurtPlayer(damage) {
    if (player.invuln > 0 || state !== 'playing') return;
    player.hp = Math.max(0, player.hp - damage); player.invuln = .55; player.hitFlash = .18;
    burst(player.x, player.y, '#ff5969', 7, 90); floaters.push({x: player.x, y: player.y - 27, text: `-${Math.ceil(damage)}`, color: '#ff6878', life: .9, max: .9});
    if (player.hp <= 0) endGame(false);
  }
  function gainXp(value) {
    player.xp += value;
    while (player.xp >= player.nextXp && state === 'playing') {
      player.xp -= player.nextXp; player.level++; player.nextXp = Math.floor(player.nextXp * 1.28 + 3);
      state = 'upgrade'; showUpgrade(); break;
    }
  }
  const upgrades = [
    {icon:'✦', name:'SWELL THE SWARM', description:'+2 shadowlings orbit your heart and tear into anything nearby.', tag:'MORE TEETH', apply:()=>{for(let i=0;i<2;i++)minions.push({angle:rand(0,TAU),phase:rand(0,TAU),cooldown:rand(0,.5),x:player.x,y:player.y,hit:0});}},
    {icon:'⌁', name:'BLOODIER BITES', description:'Every shadowling deals 25% more damage with each strike.', tag:'+25% DAMAGE', apply:()=>{player.damage*=1.25;}},
    {icon:'➶', name:'NIGHTWIND', description:'Move 15% faster. The living cannot outrun the dead.', tag:'+15% SPEED', apply:()=>{player.speed*=1.15;}},
    {icon:'♥', name:'HIVE HEART', description:'Restore 30 health and increase your max health by 20.', tag:'+20 MAX HEALTH', apply:()=>{player.maxHp+=20;player.hp=Math.min(player.maxHp,player.hp+30);}},
    {icon:'◎', name:'GRAVE-SENSE', description:'Your shadowlings can strike from farther away.', tag:'+20% REACH', apply:()=>{player.range*=1.2;player.magnet+=25;}},
    {icon:'⟳', name:'FEEDING FRENZY', description:'Your horde attacks 18% faster.', tag:'+18% ATTACK SPEED', apply:()=>{player.attackRate*=1.18;}}
  ];
  function showUpgrade() {
    ui.cards.replaceChildren();
    const choices = [...upgrades].sort(() => Math.random() - .5).slice(0, 3);
    for (const u of choices) {
      const card = document.createElement('button'); card.className = 'upgrade-card';
      card.innerHTML = `<span class="upgrade-icon">${u.icon}</span><h3>${u.name}</h3><p>${u.description}</p><span class="card-tag">${u.tag}</span>`;
      card.addEventListener('click', () => { u.apply(); ui.upgrade.hidden = true; state = 'playing'; showToast(`${u.name} — THE HIVE GROWS`); updateHud(); last = performance.now(); });
      ui.cards.append(card);
    }
    ui.upgrade.hidden = false;
  }
  function endGame(won) {
    if (state === 'ended') return;
    state = 'ended'; ui.pause.hidden = true; ui.upgrade.hidden = true; ui.end.hidden = false;
    const title = document.getElementById('end-title');
    document.getElementById('end-eyebrow').innerHTML = `<span></span> ${won ? 'THE NIGHT REMEMBERS' : 'THE HOLLOW FALLS SILENT'}`;
    title.innerHTML = won ? 'THE HUNT<br><em>IS YOURS.</em>' : 'THE SWARM<br><em>IS SILENT.</em>';
    document.getElementById('end-copy').textContent = won ? 'The hunter has fallen. The hollow belongs to you.' : 'The villagers found the hive heart. Tonight, they survive.';
    document.getElementById('result-kills').textContent = player.kills;
    document.getElementById('result-level').textContent = player.level;
    document.getElementById('result-time').textContent = timeText(elapsed);
  }

  function burst(x, y, color, count = 6, speed = 80) {
    for (let i = 0; i < count; i++) { const a = rand(0, TAU), v = rand(speed * .3, speed); particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:rand(.22,.55),max:.55,r:rand(1,3),color,type:'dot'}); }
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H);
    const grad = ctx.createRadialGradient(W*.5,H*.43,20,W*.5,H*.5,Math.max(W,H)*.8);
    grad.addColorStop(0,'#1a1b29'); grad.addColorStop(.55,'#11131e'); grad.addColorStop(1,'#0a0c13'); ctx.fillStyle=grad; ctx.fillRect(0,0,W,H);
    const camX = player ? camera.x : WORLD/2, camY = player ? camera.y : WORLD/2;
    const ox = W/2-camX, oy = H/2-camY;
    drawGround(ox,oy);
    ctx.save(); ctx.translate(ox,oy);
    for(const d of decor){ if(d.x<camX-W*.65||d.x>camX+W*.65||d.y<camY-H*.65||d.y>camY+H*.65)continue; drawDecor(d); }
    for(const o of orbs) drawOrb(o);
    for(const p of projectiles) drawProjectile(p);
    for(const e of enemies) drawEnemy(e);
    if(player) { drawHorde(); drawPlayer(); }
    drawParticles();
    ctx.restore();
    if(pointer.active) drawJoystick();
    if(state==='playing' && enemies.some(e=>e.boss)) drawBossBar();
    requestAnimationFrame(frame);
  }
  function drawGround(ox,oy) {
    const step=80, sx=((ox%step)+step)%step, sy=((oy%step)+step)%step;
    ctx.strokeStyle='#cbd0ff08';ctx.lineWidth=1;ctx.beginPath();
    for(let x=sx;x<W;x+=step){ctx.moveTo(x,0);ctx.lineTo(x,H)}for(let y=sy;y<H;y+=step){ctx.moveTo(0,y);ctx.lineTo(W,y)}ctx.stroke();
    ctx.fillStyle='#d5d9ff08';
    for(let x=sx+40;x<W;x+=step)for(let y=sy+40;y<H;y+=step){ctx.fillRect(x,y,1,1)}
  }
  function drawDecor(d){
    ctx.save();ctx.translate(d.x,d.y);ctx.rotate(d.rot);ctx.globalAlpha=.35*d.s;
    if(d.type==='grass'){ctx.strokeStyle='#767b83';ctx.lineWidth=1.1;ctx.beginPath();ctx.moveTo(0,4);ctx.lineTo(-3,-4);ctx.moveTo(0,4);ctx.lineTo(3,-5);ctx.moveTo(0,4);ctx.lineTo(1,-6);ctx.stroke();}
    else{ctx.fillStyle='#717386';ctx.beginPath();ctx.ellipse(0,0,4*d.s,2.4*d.s,.2,0,TAU);ctx.fill();ctx.strokeStyle='#b8b7c640';ctx.stroke();}
    ctx.restore();
  }
  function drawPlayer(){
    const p=player;ctx.save();ctx.translate(p.x,p.y);
    ctx.fillStyle='#a995ff14';ctx.beginPath();ctx.arc(0,0,53,0,TAU);ctx.fill();
    ctx.strokeStyle='#a995ff33';ctx.lineWidth=1;ctx.setLineDash([3,8]);ctx.beginPath();ctx.arc(0,0,47,0,TAU);ctx.stroke();ctx.setLineDash([]);
    if(p.hitFlash>0)ctx.globalAlpha=.55+Math.sin(performance.now()*.08)*.35;
    ctx.shadowColor='#9a80ff';ctx.shadowBlur=22;ctx.fillStyle='#d6c9ff';ctx.beginPath();ctx.arc(0,0,17,0,TAU);ctx.fill();ctx.shadowBlur=0;
    ctx.fillStyle='#625590';ctx.beginPath();ctx.arc(0,0,11,0,TAU);ctx.fill();ctx.fillStyle='#f1edff';ctx.font='16px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('✦',0,1);
    ctx.restore();
  }
  function drawHorde(){
    for(let i=0;i<minions.length;i++){
      const m=minions[i], r=8+(i%3===0?1:0);ctx.save();ctx.translate(m.x,m.y);
      ctx.globalAlpha=.25;ctx.fillStyle='#a995ff';ctx.beginPath();ctx.ellipse(0,7,r*1.1,3,0,0,TAU);ctx.fill();ctx.globalAlpha=1;
      ctx.shadowColor=m.hit?'#fff':'#9d87ff';ctx.shadowBlur=m.hit?18:9;ctx.fillStyle=m.hit?'#ffffff':'#9382dc';ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.fill();ctx.shadowBlur=0;
      ctx.fillStyle='#e7e0ff';ctx.beginPath();ctx.arc(2,-2,2,0,TAU);ctx.fill();ctx.restore();
    }
  }
  function drawEnemy(e){
    ctx.save();ctx.translate(e.x,e.y);const bob=Math.sin(e.anim)*1.5;ctx.translate(0,bob);
    if(e.boss){ctx.fillStyle='#ff59691c';ctx.beginPath();ctx.arc(0,0,47,0,TAU);ctx.fill();ctx.strokeStyle='#ff596977';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,38,0,TAU);ctx.stroke();}
    ctx.globalAlpha=e.hit>0?.55+Math.random()*.4:1;
    ctx.fillStyle='#0007';ctx.beginPath();ctx.ellipse(0,e.r*.75,e.r*.92,e.r*.35,0,0,TAU);ctx.fill();
    ctx.fillStyle=e.color;ctx.beginPath();ctx.ellipse(0,0,e.r*.73,e.r*.9,0,0,TAU);ctx.fill();
    ctx.fillStyle=e.boss?'#532833':'#373544';ctx.beginPath();ctx.arc(0,-e.r*.28,e.r*.63,Math.PI,0);ctx.fill();
    if(e.boss){ctx.fillStyle='#ead69a';ctx.beginPath();ctx.moveTo(-14,-22);ctx.lineTo(-20,-39);ctx.lineTo(-7,-27);ctx.lineTo(0,-43);ctx.lineTo(7,-27);ctx.lineTo(20,-39);ctx.lineTo(14,-22);ctx.fill();}
    ctx.fillStyle='#ffedb3';ctx.shadowColor='#ffedb3';ctx.shadowBlur=5;ctx.beginPath();ctx.arc(-e.r*.22,-1,2.1,0,TAU);ctx.arc(e.r*.22,-1,2.1,0,TAU);ctx.fill();ctx.shadowBlur=0;
    if(e.ranged&&!e.boss){ctx.strokeStyle='#d8c29a';ctx.lineWidth=2;ctx.beginPath();ctx.arc(e.r*.72,-1,e.r*.7,-1.2,1.2);ctx.stroke();}
    if(e.boss||e.hp<e.maxHp){const bw=e.boss?60:29, by=-e.r-13;ctx.fillStyle='#0009';ctx.fillRect(-bw/2,by,bw,4);ctx.fillStyle=e.boss?'#ff5969':'#d48272';ctx.fillRect(-bw/2,by,bw*clamp(e.hp/e.maxHp,0,1),4);}
    ctx.restore();
  }
  function drawOrb(o){const pulse=.8+Math.sin(performance.now()*.006+o.age*5)*.2;ctx.save();ctx.translate(o.x,o.y);ctx.shadowColor='#a995ff';ctx.shadowBlur=16;ctx.fillStyle='#b8a4ff';ctx.beginPath();ctx.arc(0,0,4.2*pulse,0,TAU);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(-1,-1,1.2,0,TAU);ctx.fill();ctx.restore();}
  function drawProjectile(p){ctx.save();ctx.shadowColor=p.color;ctx.shadowBlur=15;ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,TAU);ctx.fill();ctx.restore();}
  function drawParticles(){
    for(const p of particles){const alpha=clamp(p.life/(p.max||.55),0,1);ctx.globalAlpha=alpha;if(p.type==='slash'){ctx.strokeStyle=p.color;ctx.lineWidth=2+alpha*2;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.tx,p.ty);ctx.stroke();}else{ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.r*alpha,0,TAU);ctx.fill();}}
    ctx.globalAlpha=1;
    for(const f of floaters){ctx.globalAlpha=clamp(f.life/f.max,0,1);ctx.fillStyle=f.color;ctx.font='bold 12px "DM Mono",monospace';ctx.textAlign='center';ctx.fillText(f.text,f.x,f.y);}ctx.globalAlpha=1;
  }
  function drawJoystick(){
    const bx=pointer.x,by=pointer.y,dx=pointer.dx,dy=pointer.dy;ctx.save();ctx.globalAlpha=.62;ctx.fillStyle='#ffffff15';ctx.strokeStyle='#ffffff52';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(bx,by,47,0,TAU);ctx.fill();ctx.stroke();ctx.fillStyle='#d4fc7240';ctx.strokeStyle='#d4fc72aa';ctx.beginPath();ctx.arc(bx+dx*34,by+dy*34,20,0,TAU);ctx.fill();ctx.stroke();ctx.restore();
  }
  function drawBossBar(){const boss=enemies.find(e=>e.boss);if(!boss)return;const w=Math.min(440,W-50),x=(W-w)/2,y=96;ctx.fillStyle='#07080dbb';ctx.fillRect(x-12,y-17,w+24,41);ctx.fillStyle='#ff5969';ctx.font='9px "DM Mono",monospace';ctx.textAlign='left';ctx.fillText('THE HUNTER',x,y-3);ctx.fillStyle='#ffffff22';ctx.fillRect(x,y+5,w,5);ctx.fillStyle='#ff5969';ctx.fillRect(x,y+5,w*clamp(boss.hp/boss.maxHp,0,1),5);}

  function frame(now){const dt=Math.min(.033,(now-last)/1000||0);last=now;update(dt);draw();}
  document.getElementById('start-button').addEventListener('click',resetGame);
  document.getElementById('again-button').addEventListener('click',resetGame);
  document.getElementById('pause-button').addEventListener('click',()=>{if(state==='playing'){state='paused';ui.pause.hidden=false;ui.mobileHint.hidden=true;}});
  document.getElementById('resume-button').addEventListener('click',()=>{if(state==='paused'){state='playing';ui.pause.hidden=true;last=performance.now();ui.mobileHint.hidden= !('ontouchstart' in window);}});
  document.getElementById('pause-restart').addEventListener('click',resetGame);
  window.addEventListener('keydown',e=>{const k=e.key.toLowerCase();if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k))e.preventDefault();keys.add(k);if(k==='escape'&&state==='playing'){state='paused';ui.pause.hidden=false;ui.mobileHint.hidden=true;}else if(k==='escape'&&state==='paused'){state='playing';ui.pause.hidden=true;last=performance.now();}});
  window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
  canvas.addEventListener('pointerdown',e=>{if(state!=='playing'||e.clientX>W*.68)return;pointer.active=true;pointer.id=e.pointerId;pointer.x=e.clientX;pointer.y=e.clientY;pointer.dx=pointer.dy=0;canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!pointer.active||e.pointerId!==pointer.id)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y,len=Math.hypot(dx,dy)||1;pointer.dx=clamp(dx/Math.max(46,len),-1,1);pointer.dy=clamp(dy/Math.max(46,len),-1,1);input.x=pointer.dx;input.y=pointer.dy;});
  function releasePointer(e){if(pointer.active&&(!e||e.pointerId===pointer.id)){pointer.active=false;pointer.id=null;pointer.dx=pointer.dy=0;input.x=input.y=0;}}
  canvas.addEventListener('pointerup',releasePointer);canvas.addEventListener('pointercancel',releasePointer);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&state==='playing'){state='paused';ui.pause.hidden=false;ui.mobileHint.hidden=true;}});
  last=performance.now();requestAnimationFrame(frame);
})();
