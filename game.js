(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const startBtn = $('startBtn');
  const keys = new Set();
  const TAU = Math.PI * 2;
  let W = 0, H = 0, dpr = 1, last = 0, running = false, paused = false;
  let timeLeft = 90, hunterHealth = 100, units = 12, feedTimer = 0, pulse = 0, elapsed = 0;
  let camera = {x: 0, y: 0}, leader = {x: 0, y: 0}, target = null, hunter = {x: 0, y: 0, vx: 0, vy: 0, attack: 1, flash: 0, stunned: 0};
  let strays = [], bolts = [], particles = [], graves = [], bloodMarks = [], floaters = [];
  let moveTouch = {x: 0, y: 0}, mouse = {down: false}, audioOn = true, audioCtx = null;

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!running) { leader.x = W * .5; leader.y = H * .56; }
    makeGraves();
  }
  function makeGraves() {
    graves = [];
    for (let i = 0; i < 47; i++) {
      let x = ((i * 197 + 41) % 1200) / 1200 * W;
      let y = ((i * 311 + 83) % 900) / 900 * H;
      if (Math.hypot(x-W*.5,y-H*.5) < 100) continue;
      graves.push({x,y,w: 9 + (i*13)%9,h: 13 + (i*11)%10, tilt: Math.sin(i*12.7)*.15, type:i%4});
    }
  }
  const rand = (a,b) => a + Math.random()*(b-a);
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
  const dist = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  function reset() {
    timeLeft = 90; hunterHealth = 100; units = 12; feedTimer = 0; pulse = 0; elapsed = 0;
    strays = []; bolts = []; particles = []; bloodMarks = []; floaters = [];
    leader = {x: W*.5, y: H*.56}; target = null;
    hunter = {x: W*.77, y: H*.43, vx:0, vy:0, attack:1.2, flash:0, stunned:0};
    for (let i=0;i<24;i++) addStray();
    $('hunterHealth').style.width='100%'; $('hunterHealthText').textContent='100%'; $('unitCount').textContent=units;
    $('swarmFill').style.width=(units/40*100)+'%'; $('timer').textContent='01:30';
    $('objectiveText').textContent='THE HUNTER IS ON THE MOVE'; $('feedCooldown').style.transform='scaleX(1)';
  }
  function addStray(x,y) {
    let a=rand(0,TAU), r=rand(Math.min(W,H)*.18,Math.min(W,H)*.48);
    strays.push({x:x ?? clamp(leader.x+Math.cos(a)*r,24,W-24),y:y ?? clamp(leader.y+Math.sin(a)*r,30,H-30),phase:rand(0,TAU),life:rand(18,42)});
  }
  function toast(text) { const el=$('toast'); el.textContent=text; el.classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove('show'),1250); }
  function sound(freq=220,duration=.08,type='sine',volume=.035) {
    if (!audioOn) return;
    try { audioCtx ||= new (window.AudioContext||window.webkitAudioContext)(); const o=audioCtx.createOscillator(),g=audioCtx.createGain(); o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(volume,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+duration); } catch(e){}
  }
  function start() {
    reset(); running=true; paused=false; overlay.classList.add('hidden'); $('pauseBadge').classList.remove('show');
    if (!last) last=performance.now(); sound(380,.14,'triangle',.04); requestAnimationFrame(loop);
  }
  function finish(win) {
    running=false; paused=false;
    const card=overlay.querySelector('.title-card');
    card.innerHTML=`<div class="eyebrow"><span class="live-dot"></span> FIELD REPORT · ${win?'HUNT COMPLETE':'SWARM DISPERSED'}</div><h1>${win?'NIGHT':'HUNT'}<br><em>${win?'FALLS':'OVER'}</em></h1><p class="subtitle">${win?'The hunter won’t make it to dawn.':'The hunter broke through the swarm.'}</p><div class="intro-rule"></div><p class="intro-copy">${units} creatures made it through the night.<br>${win?'A new legend crawls out of the dark.':'There is always another night.'}</p><div class="start-row"><button class="primary-button" id="againBtn">${win?'HUNT AGAIN':'RISE AGAIN'} <span>↗</span></button><span class="run-time">${win?'DAWN DENIED':'THE NIGHT IS YOUNG'}</span></div><div class="controls-note"><span>WASD</span> MOVE <i>·</i> <span>SPACE</span> FEED <i>·</i> <span>CLICK</span> RALLY</div>`;
    overlay.classList.remove('hidden'); $('againBtn').addEventListener('click', start); sound(win?500:100,.5,'sawtooth',.04);
  }
  startBtn.addEventListener('click',start);
  window.addEventListener('resize',resize); resize();

  function feed() {
    if (!running || paused || feedTimer>0) return;
    feedTimer=7; pulse=.65; sound(160,.22,'sawtooth',.05);
    let eaten=0;
    for (let i=strays.length-1;i>=0;i--) if (dist(leader,strays[i])<150 && units<40) { strays.splice(i,1);units++;eaten++; }
    if (units<40) { let gain=Math.min(3,40-units);units+=gain;eaten+=gain; }
    hunter.stunned=Math.max(hunter.stunned,.75);
    hunterHealth=Math.max(0,hunterHealth-2.5);
    burst(leader.x,leader.y,'#d5fa66',24,1.3);
    $('unitCount').textContent=units; $('swarmFill').style.width=(units/40*100)+'%';
    toast(eaten?`THE HORDE FEEDS · +${eaten}`:'THE HORDE SURGES');
  }
  window.addEventListener('keydown',e=>{
    const k=e.key.toLowerCase(); if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k)) e.preventDefault();
    keys.add(k); if(k===' '&&!e.repeat) feed();
    if(k==='escape'||k==='p') { if(running){paused=!paused;$('pauseBadge').classList.toggle('show',paused);if(!paused){last=performance.now();requestAnimationFrame(loop);}} }
  });
  window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
  $('resumeBtn').addEventListener('click',()=>{paused=false;$('pauseBadge').classList.remove('show');last=performance.now();requestAnimationFrame(loop);});
  $('soundBtn').addEventListener('click',()=>{audioOn=!audioOn;$('soundBtn').innerHTML=`♫ <span>SOUND ${audioOn?'ON':'OFF'}</span>`;if(audioOn)sound(420,.09);});
  canvas.addEventListener('pointerdown',e=>{ if(!running)return; const r=canvas.getBoundingClientRect(); target={x:e.clientX-r.left,y:e.clientY-r.top}; mouse.down=true; canvas.setPointerCapture?.(e.pointerId); });
  canvas.addEventListener('pointermove',e=>{if(mouse.down&&running){const r=canvas.getBoundingClientRect();target={x:e.clientX-r.left,y:e.clientY-r.top};}});
  canvas.addEventListener('pointerup',()=>mouse.down=false);
  $('feedTouch').addEventListener('pointerdown',e=>{e.preventDefault();feed();});
  const joy=$('joystick'); let joyPointer=null;
  joy.addEventListener('pointerdown',e=>{e.preventDefault();joyPointer=e.pointerId;joy.setPointerCapture(e.pointerId);setJoy(e);});
  joy.addEventListener('pointermove',e=>{if(e.pointerId===joyPointer)setJoy(e);});
  function setJoy(e){const r=joy.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),m=Math.hypot(dx,dy),max=27,s=Math.min(1,max/(m||1));moveTouch={x:dx*s/max,y:dy*s/max};joy.querySelector('i').style.transform=`translate(calc(-50% + ${dx*s}px),calc(-50% + ${dy*s}px))`;}
  function endJoy(){joyPointer=null;moveTouch={x:0,y:0};joy.querySelector('i').style.transform='translate(-50%,-50%)';}
  joy.addEventListener('pointerup',endJoy);joy.addEventListener('pointercancel',endJoy);

  function burst(x,y,color,n=8,power=1) { for(let i=0;i<n;i++){let a=rand(0,TAU),v=rand(25,150)*power;particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:rand(.25,.65),max:.65,color,size:rand(1,3)});} }
  function update(dt) {
    elapsed+=dt; timeLeft-=dt; feedTimer=Math.max(0,feedTimer-dt);pulse=Math.max(0,pulse-dt);
    const speed=190, input={x:0,y:0};
    if(keys.has('w')||keys.has('arrowup'))input.y--; if(keys.has('s')||keys.has('arrowdown'))input.y++;
    if(keys.has('a')||keys.has('arrowleft'))input.x--; if(keys.has('d')||keys.has('arrowright'))input.x++;
    input.x+=moveTouch.x;input.y+=moveTouch.y;
    if(Math.hypot(input.x,input.y)>.1){let l=Math.hypot(input.x,input.y);leader.x+=input.x/l*speed*dt;leader.y+=input.y/l*speed*dt;target=null;}
    else if(target){let dx=target.x-leader.x,dy=target.y-leader.y,l=Math.hypot(dx,dy);if(l>7){leader.x+=dx/l*speed*.82*dt;leader.y+=dy/l*speed*.82*dt;}else target=null;}
    leader.x=clamp(leader.x,24,W-24);leader.y=clamp(leader.y,48,H-28);
    hunter.stunned=Math.max(0,hunter.stunned-dt); hunter.flash=Math.max(0,hunter.flash-dt);
    let dx=leader.x-hunter.x,dy=leader.y-hunter.y,d=Math.hypot(dx,dy)||1;
    const hunterSpeed=hunter.stunned?0:54+Math.min(elapsed*.35,30);
    hunter.vx+=(dx/d*hunterSpeed-hunter.vx)*Math.min(1,dt*2);hunter.vy+=(dy/d*hunterSpeed-hunter.vy)*Math.min(1,dt*2);
    hunter.x+=hunter.vx*dt;hunter.y+=hunter.vy*dt;
    hunter.x=clamp(hunter.x,28,W-28);hunter.y=clamp(hunter.y,45,H-35);
    hunter.attack-=dt;
    if(hunter.attack<=0&&d<330&&!hunter.stunned){hunter.attack=1.2;let aim=Math.atan2(leader.y-hunter.y,leader.x-hunter.x);bolts.push({x:hunter.x,y:hunter.y,vx:Math.cos(aim)*245,vy:Math.sin(aim)*245,life:1.9});sound(125,.1,'square',.012);}

    for(let i=strays.length-1;i>=0;i--){let s=strays[i];s.phase+=dt*2;s.life-=dt;if(s.life<=0){strays.splice(i,1);continue;}if(dist(leader,s)<24&&units<40){strays.splice(i,1);units++;burst(s.x,s.y,'#a8e8a4',5,.5);$('unitCount').textContent=units;$('swarmFill').style.width=(units/40*100)+'%';if(units%5===0){toast('THE SWARM GROWS');sound(360,.12,'sine');}}}
    if(strays.length<13&&Math.random()<dt*.55)addStray();

    const near=dist(leader,hunter);
    if(near<105&&units>0&&!hunter.stunned){hunterHealth-=dt*(.55+units*.115);hunter.flash=.06;if(Math.random()<dt*4)bloodMarks.push({x:hunter.x+rand(-12,12),y:hunter.y+rand(-9,9),r:rand(3,8)});}
    if(near<34&&hunter.attack<.15){units=Math.max(0,units-1);hunter.attack=1.1;burst(leader.x,leader.y,'#ef5d54',8);toast('THE HUNTER STRIKES');}
    for(let i=bolts.length-1;i>=0;i--){let b=bolts[i];b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;if(b.life<=0||b.x<0||b.x>W||b.y<0||b.y>H){bolts.splice(i,1);continue;}if(Math.hypot(b.x-leader.x,b.y-leader.y)<22){bolts.splice(i,1);units=Math.max(0,units-1);burst(b.x,b.y,'#f45c54',7,.6);$('unitCount').textContent=units;$('swarmFill').style.width=(units/40*100)+'%';}}
    for(let i=particles.length-1;i>=0;i--){let p=particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.97;p.vy*=.97;p.life-=dt;if(p.life<=0)particles.splice(i,1);}
    if(bloodMarks.length>35)bloodMarks.splice(0,bloodMarks.length-35);
    hunterHealth=clamp(hunterHealth,0,100);$('hunterHealth').style.width=hunterHealth+'%';$('hunterHealthText').textContent=Math.ceil(hunterHealth)+'%';
    $('timer').textContent=`${String(Math.floor(Math.max(0,timeLeft)/60)).padStart(2,'0')}:${String(Math.floor(Math.max(0,timeLeft)%60)).padStart(2,'0')}`;
    $('feedCooldown').style.transform=`scaleX(${1-feedTimer/7})`;
    if(elapsed>8)$('objectiveText').textContent=near<130?'THE HORDE IS FEASTING':'CLOSE IN ON THE HUNTER';
    if(hunterHealth<=0){finish(true);return;} if(timeLeft<=0||units<=0){finish(false);return;}
  }

  function drawBackground(t) {
    const g=ctx.createLinearGradient(0,0,W,H);g.addColorStop(0,'#1c2829');g.addColorStop(.52,'#172125');g.addColorStop(1,'#11191e');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    // Moonlit clearing and soft pools of mist.
    let glow=ctx.createRadialGradient(W*.75,H*.21,4,W*.75,H*.21,Math.min(W,H)*.46);glow.addColorStop(0,'#7784781b');glow.addColorStop(1,'#77847800');ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);
    ctx.save();ctx.globalAlpha=.22;ctx.strokeStyle='#a5afa044';ctx.lineWidth=1;
    for(let i=0;i<15;i++){let x=(i*173+37)%W,y=(i*271+91)%H;ctx.beginPath();ctx.arc(x,y,1+(i%2),0,TAU);ctx.stroke();}
    ctx.restore();
    // Old paths: broken, hand-drawn cemetery trails.
    ctx.save();ctx.lineCap='round';ctx.strokeStyle='#9aa08a0b';ctx.lineWidth=22;ctx.beginPath();ctx.moveTo(-20,H*.79);ctx.bezierCurveTo(W*.24,H*.64,W*.57,H*.94,W+40,H*.57);ctx.stroke();ctx.restore();
    for(const grave of graves){ctx.save();ctx.translate(grave.x,grave.y);ctx.rotate(grave.tilt);ctx.fillStyle='#0c1316a8';ctx.fillRect(-grave.w/2+2,4,grave.w,grave.h);ctx.fillStyle=grave.type===0?'#384344':grave.type===1?'#303b3e':'#354043';ctx.beginPath();ctx.roundRect(-grave.w/2,-grave.h/2,grave.w,grave.h,grave.type===0?[5,5,1,1]:[2,2,1,1]);ctx.fill();ctx.strokeStyle='#8c99944a';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-grave.w*.29,-grave.h*.25);ctx.lineTo(grave.w*.28,-grave.h*.25);ctx.stroke();if(grave.type===0){ctx.beginPath();ctx.moveTo(0,-grave.h*.37);ctx.lineTo(0,-grave.h*.08);ctx.stroke();}ctx.restore();}
    // Dim lanterns sit at the edge of the clearing.
    for(const [x,y] of [[W*.11,H*.35],[W*.88,H*.74],[W*.67,H*.12]]){let halo=ctx.createRadialGradient(x,y,1,x,y,45);halo.addColorStop(0,'#e1b46724');halo.addColorStop(1,'#e1b46700');ctx.fillStyle=halo;ctx.fillRect(x-45,y-45,90,90);ctx.fillStyle='#bc9860';ctx.fillRect(x-2,y-2,4,4);}
    // drifting ground haze
    for(let i=0;i<5;i++){let x=((i*287+t*7)%(W+180))-90,y=H*(.25+i*.14)+Math.sin(t*.3+i)*20;ctx.fillStyle='#c1cdc708';ctx.beginPath();ctx.ellipse(x,y,70+i*11,7+i*2,0,0,TAU);ctx.fill();}
  }
  function drawStray(s,t) {let bob=Math.sin(t*3+s.phase)*2;ctx.save();ctx.shadowColor='#9ceab9';ctx.shadowBlur=12;ctx.fillStyle='#9be8ad';ctx.beginPath();ctx.arc(s.x,s.y+bob,3,0,TAU);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#deffdb';ctx.beginPath();ctx.arc(s.x-1,s.y+bob-1,1,0,TAU);ctx.fill();ctx.restore();}
  function drawMinion(x,y,r,t,i) {let wob=Math.sin(t*5+i*2)*1.5;ctx.save();ctx.translate(x,y+wob);ctx.fillStyle='#070d0e88';ctx.beginPath();ctx.ellipse(1,r*.48,r*.9,r*.38,0,0,TAU);ctx.fill();let grad=ctx.createRadialGradient(-r*.3,-r*.4,1,0,0,r*1.3);grad.addColorStop(0,'#ceffb6');grad.addColorStop(.35,'#83d98a');grad.addColorStop(1,'#398b66');ctx.fillStyle=grad;ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.fill();ctx.strokeStyle='#d3ffc399';ctx.lineWidth=1;ctx.stroke();ctx.fillStyle='#f0ffda';ctx.beginPath();ctx.arc(-r*.28,-r*.06,Math.max(1,r*.1),0,TAU);ctx.arc(r*.26,-r*.06,Math.max(1,r*.1),0,TAU);ctx.fill();ctx.fillStyle='#182722';ctx.beginPath();ctx.arc(-r*.27,-r*.05,Math.max(.7,r*.045),0,TAU);ctx.arc(r*.27,-r*.05,Math.max(.7,r*.045),0,TAU);ctx.fill();ctx.restore();}
  function swarmPoint(i,t) {let n=Math.max(1,units),a=i*TAU/n+t*(i%2?-.12:.12);let ring=i%5,rad=17+Math.sqrt(n)*4+ring*3;return{x:leader.x+Math.cos(a)*rad,y:leader.y+Math.sin(a)*rad*.68};}
  function drawLeader(t) {
    if(pulse>0){ctx.strokeStyle=`rgba(213,250,102,${pulse*.6})`;ctx.lineWidth=2;ctx.beginPath();ctx.arc(leader.x,leader.y,(.65-pulse)*240,0,TAU);ctx.stroke();}
    for(let i=0;i<units;i++){let p=swarmPoint(i,t),r=clamp(4+units*.045,4.4,6);drawMinion(p.x,p.y,r,t,i);}
    // One slightly larger familiar is the swarm's visible anchor.
    ctx.save();ctx.globalAlpha=.8;ctx.strokeStyle='#d5fa6688';ctx.setLineDash([2,4]);ctx.beginPath();ctx.arc(leader.x,leader.y,11,0,TAU);ctx.stroke();ctx.restore();
    if(target){ctx.strokeStyle='#d5fa6688';ctx.beginPath();ctx.arc(target.x,target.y,8+Math.sin(t*8)*2,0,TAU);ctx.moveTo(target.x-3,target.y);ctx.lineTo(target.x+3,target.y);ctx.moveTo(target.x,target.y-3);ctx.lineTo(target.x,target.y+3);ctx.stroke();}
  }
  function drawHunter(t) {
    const x=hunter.x,y=hunter.y,angle=Math.atan2(leader.y-y,leader.x-x);ctx.save();ctx.translate(x,y);ctx.rotate(angle);
    // long coat silhouette
    ctx.fillStyle='#070b0ee0';ctx.beginPath();ctx.ellipse(-1,5,15,12,0,0,TAU);ctx.fill();ctx.fillStyle=hunter.flash>0?'#f7d8b7':'#6d3133';ctx.beginPath();ctx.moveTo(-12,-5);ctx.lineTo(-18,10);ctx.lineTo(-9,8);ctx.lineTo(-3,15);ctx.lineTo(4,8);ctx.lineTo(14,11);ctx.lineTo(10,-6);ctx.closePath();ctx.fill();ctx.fillStyle='#29252a';ctx.beginPath();ctx.ellipse(1,-2,7,9,0,0,TAU);ctx.fill();ctx.fillStyle='#d4b68f';ctx.beginPath();ctx.arc(4,-11,6,0,TAU);ctx.fill();ctx.fillStyle='#25242a';ctx.beginPath();ctx.moveTo(-4,-13);ctx.lineTo(3,-23);ctx.lineTo(10,-12);ctx.closePath();ctx.fill();ctx.fillStyle='#fa6658';ctx.fillRect(6,-13,2,2);
    // lantern / crossbow
    ctx.strokeStyle='#b79869';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(5,1);ctx.lineTo(19,3);ctx.stroke();ctx.fillStyle='#e2b55e';ctx.shadowColor='#ffbf5b';ctx.shadowBlur=12;ctx.beginPath();ctx.arc(20,4,3,0,TAU);ctx.fill();ctx.restore();
    if(hunter.stunned>0){ctx.fillStyle='#d5fa66';ctx.font='11px sans-serif';ctx.fillText('✦  ✦',x-11,y-28);}
  }
  function draw() {
    const t=elapsed;drawBackground(t);
    // painted stains beneath the fight
    for(const m of bloodMarks){ctx.fillStyle='#822e2b33';ctx.beginPath();ctx.ellipse(m.x,m.y,m.r,m.r*.55,0,0,TAU);ctx.fill();}
    for(const s of strays)drawStray(s,t);
    drawLeader(t);drawHunter(t);
    for(const b of bolts){ctx.save();ctx.shadowColor='#ff6556';ctx.shadowBlur=12;ctx.strokeStyle='#ff7864';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(b.x-b.vx*.035,b.y-b.vy*.035);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.restore();}
    for(const p of particles){ctx.globalAlpha=clamp(p.life/.65,0,1);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,TAU);ctx.fill();}ctx.globalAlpha=1;
    // Aim line guides the pack without clutter.
    if(running&&!paused){let d=dist(leader,hunter);if(d>110){ctx.setLineDash([2,7]);ctx.strokeStyle='#d5fa6620';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(leader.x,leader.y);ctx.lineTo(hunter.x,hunter.y);ctx.stroke();ctx.setLineDash([]);}}
  }
  function loop(now) {
    if(!running||paused)return;
    const dt=Math.min(.04,Math.max(0,(now-last)/1000));last=now;update(dt);draw();
    if(running&&!paused)requestAnimationFrame(loop);
  }
  // Render the live field behind the opening title before the first run.
  reset(); draw();
})();
