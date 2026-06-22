// ═══════════════════════════════════════════════════════════════════════════
//  TEMPLE OF THE BODY  —  olive.temple.js  v1.0
//  Drop this file into the project and reference it with:
//    <script src="temple.js"></script>   (after supabase, before </body>)
//  Relies on globals from the main app: sbClient, currentUser,
//  currentRelationshipId, currentMySlot, liveData, showToast, awardXP,
//  escHtml, safeRelUpdate
// ═══════════════════════════════════════════════════════════════════════════

(function TempleModule() {
'use strict';

// ── TEMPLE LOCAL STATE ─────────────────────────────────────────────────────
var templeState = {
  personal: {
    sleep: 0, hydration: 0, movement: 0, breath: 0, nourishment: 0, presence: 0
  },
  sanctuary: {
    flowers: 0, birds: 0, trees: 0, candles: 0, fountain: 0,
    fireflies: 0, butterflies: 0, stage: 0
  },
  waterGlasses: 0,
  waterGoal: 8,
  breathSessions: { solar: 0, lunar: 0, harmony: 0 },
  completedGates: {},
  riverBalance: { moon: 50, sun: 50, central: 50 },
  dailyQuestion: null,
  questionAnswered: false
};

// ── THOUGHT QUESTIONS DATA ─────────────────────────────────────────────────
var THOUGHT_QUESTIONS = [
  // Personal awareness
  { id:'tq1',  cat:'self',    icon:'🌿', q:'What part of yourself have you been neglecting lately?' },
  { id:'tq2',  cat:'self',    icon:'🔥', q:'When did you last feel truly alive — not just content, but lit up?' },
  { id:'tq3',  cat:'self',    icon:'🌊', q:'What emotion have you been avoiding naming this week?' },
  { id:'tq4',  cat:'self',    icon:'🧠', q:'What belief about yourself are you most afraid to question?' },
  { id:'tq5',  cat:'self',    icon:'💧', q:'If your body could speak right now, what would it ask for?' },
  { id:'tq6',  cat:'self',    icon:'🌙', q:'What do you need to release to sleep peacefully tonight?' },
  { id:'tq7',  cat:'self',    icon:'☀️', q:'What would you do tomorrow if fear had no voice?' },
  { id:'tq8',  cat:'self',    icon:'🌱', q:'Where are you growing without noticing?' },
  { id:'tq9',  cat:'self',    icon:'🪞', q:'What truth about yourself are you most afraid your partner already sees?' },
  { id:'tq10', cat:'self',    icon:'⚡', q:'What drains you that you keep saying yes to?' },
  // Couple insight
  { id:'tq11', cat:'couple',  icon:'👁️', q:'When did you last truly look at your partner — not through habit, but with fresh eyes?' },
  { id:'tq12', cat:'couple',  icon:'💬', q:'What conversation have you both been circling without landing?' },
  { id:'tq13', cat:'couple',  icon:'🤲', q:'What does your partner need from you that they haven\'t asked for?' },
  { id:'tq14', cat:'couple',  icon:'🌸', q:'What quality in your partner makes you proud that you rarely say out loud?' },
  { id:'tq15', cat:'couple',  icon:'🌑', q:'Where are you expecting your partner to fill something only you can fill in yourself?' },
  { id:'tq16', cat:'couple',  icon:'🔐', q:'What promise to each other are you both pretending doesn\'t need renewal?' },
  { id:'tq17', cat:'couple',  icon:'🎭', q:'Which version of yourself do you perform for your partner, and which do you hide?' },
  { id:'tq18', cat:'couple',  icon:'🌊', q:'How do you handle your partner\'s sadness — do you fix, or do you stay?' },
  { id:'tq19', cat:'couple',  icon:'🌿', q:'What ritual have you let fade that once made you feel most connected?' },
  { id:'tq20', cat:'couple',  icon:'⚖️', q:'Are you contributing equally to emotional labor right now — or is one of you carrying more?' },
  // Body & temple
  { id:'tq21', cat:'body',    icon:'🫁', q:'When did you last breathe deeply — not because you were told to, but because you needed to?' },
  { id:'tq22', cat:'body',    icon:'💤', q:'What are you sacrificing sleep for, and is it worth the cost?' },
  { id:'tq23', cat:'body',    icon:'🚶', q:'How long since your body moved just for the joy of moving, without a goal?' },
  { id:'tq24', cat:'body',    icon:'🥗', q:'Are you nourishing your body, or are you punishing or ignoring it?' },
  { id:'tq25', cat:'body',    icon:'🌡️', q:'Where in your body do you hold your relationship\'s tension right now?' },
  // Purpose & growth
  { id:'tq26', cat:'purpose', icon:'🧭', q:'What are you building this year — and does your partner know about it?' },
  { id:'tq27', cat:'purpose', icon:'🏔️', q:'What dream have you stopped mentioning because you fear their reaction?' },
  { id:'tq28', cat:'purpose', icon:'🌅', q:'Five years from now, what do you want your relationship to feel like on a Tuesday morning?' },
  { id:'tq29', cat:'purpose', icon:'🔑', q:'What would change in your relationship if you both chose courage over comfort this month?' },
  { id:'tq30', cat:'purpose', icon:'💎', q:'What are you building together that neither of you could build alone?' },
];

var WATER_WISDOM = [
  { icon:'💧', title:'Why hydration matters', body:'Your body is ~60% water. Even mild dehydration affects mood, focus, and energy. Drinking water is caring for the vessel that carries your love.' },
  { icon:'🌊', title:'Morning hydration', body:'Drinking water first thing replenishes what sleep depleted. It\'s the simplest act of self-care — before the world asks anything of you.' },
  { icon:'🏃', title:'Hydration & movement', body:'During exercise, listen to your body\'s thirst. There\'s no perfect formula — only presence with what your body is telling you.' },
  { icon:'🌿', title:'Signs of dehydration', body:'Fatigue, headaches, difficulty concentrating, and irritability can all signal you need more water. Your body speaks — practice listening.' },
  { icon:'🍵', title:'Enjoyable hydration', body:'Herbal teas, sparkling water, even warm broth count. Hydration should feel like nourishment, not a duty.' },
];

var NINE_GATES = [
  { id:'vision',      icon:'👁️',  name:'Vision',      q:'Do I truly see my partner — beyond habit, beyond projection?', practice:'Sit together for 2 minutes in silence. Simply look at each other.' },
  { id:'listening',   icon:'👂',  name:'Listening',   q:'Do I listen to understand, or do I listen to respond?', practice:'Ask one question today. Then only listen — no advice, no stories.' },
  { id:'speech',      icon:'🗣️', name:'Speech',       q:'Do my words create healing or do they quietly wound?', practice:'Offer one specific, genuine appreciation. Not general — name the moment.' },
  { id:'awareness',   icon:'🧠',  name:'Awareness',   q:'Can I observe my thoughts before letting them become reactions?', practice:'3-minute body scan before the next difficult conversation.' },
  { id:'intimacy',    icon:'❤️',  name:'Intimacy',    q:'Is our closeness built on trust, comfort, and consent?', practice:'Share one emotional need you haven\'t voiced in a while.' },
  { id:'compassion',  icon:'🌸',  name:'Compassion',  q:'Can I stay gentle when I most want to be right?', practice:'In the next disagreement — pause. Breathe. Then respond.' },
  { id:'presence',    icon:'🌿',  name:'Presence',    q:'Am I fully here, or am I somewhere else in my mind?', practice:'One device-free hour together this week.' },
  { id:'purpose',     icon:'☀️',  name:'Purpose',     q:'What are we building together that has meaning beyond ourselves?', practice:'Share one dream you\'ve been holding quietly.' },
  { id:'consciousness',icon:'💫', name:'Consciousness',q:'Who am I becoming — and does my partner know that person?', practice:'Journal: "The person I am growing into looks like…"' },
];

var BREATHING_SESSIONS = [
  { id:'solar',   icon:'☀️',  name:'Solar Breath',   color:'#c9a84c', purpose:'Energize · Focus · Begin',    duration:300,  desc:'Gentle activating breath. Breathe in courage, breathe out hesitation.' },
  { id:'lunar',   icon:'🌙',  name:'Lunar Breath',   color:'#9b6dff', purpose:'Calm · Unwind · Release',    duration:600,  desc:'Slow, softening breath. Let the day settle like water finding stillness.' },
  { id:'harmony', icon:'🌿',  name:'Harmony Breath', color:'#4ecdc4', purpose:'Balance · Center · Integrate', duration:300,  desc:'Equal rhythm. Breathe as one — action and rest in harmony.' },
];

var TEMPLE_PRACTICES = [
  { id:'tp1', icon:'🫁', title:'5-Min Shared Breathing',  dur:'5 min',  xp:30, desc:'Sit facing each other. Sync your breath without speaking. Let your nervous systems meet.', timerSec:300 },
  { id:'tp2', icon:'👁️', title:'Eye-Contact Meditation',  dur:'3 min',  xp:40, desc:'Look into each other\'s eyes. Not the performance of looking — real seeing. Breathe.', timerSec:180 },
  { id:'tp3', icon:'🙏', title:'Gratitude Exchange',       dur:'5 min',  xp:30, desc:'"I\'m grateful for you because…" — specific, recent, real. Not what they do — who they are.', timerSec:300 },
  { id:'tp4', icon:'🚶', title:'Silent Walk Together',     dur:'15 min', xp:40, desc:'Walk without phones, without agenda. Just two bodies moving through the world together.', timerSec:900 },
  { id:'tp5', icon:'✍️', title:'Morning Intention',        dur:'2 min',  xp:20, desc:'Each speaks one intention aloud: "Today I want to bring _____ to our relationship."', timerSec:120 },
  { id:'tp6', icon:'🕯️', title:'Evening Appreciation',    dur:'5 min',  xp:25, desc:'Before sleep: one thing you noticed in your partner today that you loved. Name it.', timerSec:300 },
  { id:'tp7', icon:'💧', title:'Morning Water Together',   dur:'1 min',  xp:15, desc:'Begin the day by drinking a full glass of water together. A small ritual of shared care.', timerSec:60 },
];

// ── SANCTUARY CANVAS RENDERER ──────────────────────────────────────────────
function drawSanctuary(canvasId, stage, hydration, breathBalance) {
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;
  var dpr = window.devicePixelRatio || 1;
  var W = canvas.offsetWidth || 340;
  var H = canvas.offsetHeight || 200;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  var ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  // Sky gradient — shifts from dawn to dusk based on stage
  var skyTop = stage < 4 ? '#0a0e1a' : (stage < 7 ? '#0f1830' : '#111630');
  var skyBot = stage < 4 ? '#141c30' : (stage < 7 ? '#1a2040' : '#1e2850');
  var sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, skyTop); sky.addColorStop(1, skyBot);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

  // Stars (always present but fade as sanctuary brightens)
  var starOpacity = Math.max(0.05, 0.4 - stage * 0.04);
  for (var i = 0; i < 40; i++) {
    var sx = (i * 137.5) % W, sy = (i * 89.3) % (H * 0.55);
    ctx.beginPath(); ctx.arc(sx, sy, 0.8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(245,223,160,' + starOpacity + ')'; ctx.fill();
  }

  // Moon (visible at lower stages)
  if (stage < 6) {
    ctx.beginPath(); ctx.arc(W * 0.8, H * 0.18, 14, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(200,190,160,0.15)'; ctx.fill();
    ctx.beginPath(); ctx.arc(W * 0.8, H * 0.18, 10, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(230,215,170,' + (0.08 + stage * 0.01) + ')'; ctx.fill();
  }

  // Sun glow (stages 5+)
  if (stage >= 5) {
    var sunGlow = ctx.createRadialGradient(W * 0.15, H * 0.15, 0, W * 0.15, H * 0.15, 60);
    sunGlow.addColorStop(0, 'rgba(201,168,76,0.18)'); sunGlow.addColorStop(1, 'rgba(201,168,76,0)');
    ctx.fillStyle = sunGlow; ctx.fillRect(0, 0, W, H);
  }

  // Ground
  var grd = ctx.createLinearGradient(0, H * 0.6, 0, H);
  grd.addColorStop(0, 'rgba(20,32,20,0.9)'); grd.addColorStop(1, 'rgba(10,18,12,1)');
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.moveTo(0, H * 0.65); ctx.bezierCurveTo(W * 0.3, H * 0.62, W * 0.7, H * 0.68, W, H * 0.64); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();

  // River / water (based on hydration)
  var riverFill = Math.min(1, hydration / 8);
  if (riverFill > 0) {
    var riverY = H * 0.73;
    var riverH = 12 + riverFill * 18;
    var riverAlpha = 0.3 + riverFill * 0.5;
    var riverCol = riverFill > 0.7 ? 'rgba(78,205,196,' : 'rgba(60,150,200,';
    var rg = ctx.createLinearGradient(0, riverY, W, riverY);
    rg.addColorStop(0, riverCol + riverAlpha + ')');
    rg.addColorStop(0.5, riverCol + (riverAlpha + 0.15) + ')');
    rg.addColorStop(1, riverCol + riverAlpha + ')');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.moveTo(0, riverY);
    ctx.bezierCurveTo(W * 0.25, riverY - 4, W * 0.75, riverY + 4, W, riverY);
    ctx.lineTo(W, riverY + riverH);
    ctx.bezierCurveTo(W * 0.75, riverY + riverH - 3, W * 0.25, riverY + riverH + 3, 0, riverY + riverH);
    ctx.fill();

    // Sparkle on river
    if (riverFill > 0.5) {
      for (var r = 0; r < 5; r++) {
        var rx = W * (0.1 + r * 0.18), ry = riverY + 5;
        ctx.beginPath(); ctx.arc(rx, ry, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(200,240,255,0.6)'; ctx.fill();
      }
    }
  }

  // Trees (stage 3+)
  if (stage >= 3) {
    var treeCount = Math.min(4, Math.floor(stage * 0.6));
    for (var t = 0; t < treeCount; t++) {
      var tx = W * (0.05 + t * 0.28 + (t % 2) * 0.08), ty = H * 0.62;
      var th = 40 + t * 12;
      // trunk
      ctx.fillStyle = 'rgba(90,60,30,0.8)';
      ctx.fillRect(tx - 3, ty - th, 6, th);
      // canopy
      var greenAlpha = 0.6 + stage * 0.04;
      ctx.beginPath(); ctx.arc(tx, ty - th, 18 + t * 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(40,110,50,' + greenAlpha + ')'; ctx.fill();
    }
  }

  // Flowers (stage 2+)
  if (stage >= 2) {
    var flowerColors = ['rgba(232,112,112,0.8)','rgba(201,168,76,0.8)','rgba(155,109,255,0.7)','rgba(78,205,196,0.7)','rgba(240,180,120,0.8)'];
    var flowerCount = Math.min(12, stage * 2);
    for (var f = 0; f < flowerCount; f++) {
      var fx = W * (0.02 + (f * 91.3) % 0.95), fy = H * (0.70 + (f * 37.1) % 0.12);
      ctx.beginPath(); ctx.arc(fx, fy, 3 + (f % 3), 0, Math.PI * 2);
      ctx.fillStyle = flowerColors[f % flowerColors.length]; ctx.fill();
    }
  }

  // Temple structure (always visible, brightens with stage)
  var templeAlpha = 0.15 + stage * 0.08;
  var cx = W / 2;
  ctx.fillStyle = 'rgba(180,160,100,' + Math.min(0.9, templeAlpha) + ')';
  ctx.fillRect(cx - 30, H * 0.38, 60, H * 0.28);
  ctx.beginPath(); ctx.moveTo(cx - 38, H * 0.38); ctx.lineTo(cx, H * 0.22); ctx.lineTo(cx + 38, H * 0.38); ctx.closePath();
  ctx.fillStyle = 'rgba(160,140,80,' + Math.min(0.9, templeAlpha) + ')'; ctx.fill();
  // Door
  ctx.fillStyle = 'rgba(60,40,20,' + Math.min(0.9, templeAlpha + 0.2) + ')';
  ctx.beginPath(); ctx.arc(cx, H * 0.58, 9, Math.PI, 0); ctx.fillRect(cx - 9, H * 0.56, 18, 8); ctx.fill();

  // Candles (stage 1+)
  if (stage >= 1) {
    var candleAlpha = Math.min(1, stage * 0.2);
    var candlePositions = [[cx - 50, H * 0.64], [cx + 50, H * 0.64], [cx - 68, H * 0.66], [cx + 68, H * 0.66]];
    candlePositions.slice(0, Math.min(4, stage + 1)).forEach(function(pos) {
      ctx.fillStyle = 'rgba(220,200,140,' + candleAlpha + ')';
      ctx.fillRect(pos[0] - 2, pos[1] - 10, 4, 10);
      var flame = ctx.createRadialGradient(pos[0], pos[1] - 12, 0, pos[0], pos[1] - 12, 6);
      flame.addColorStop(0, 'rgba(255,200,80,0.9)'); flame.addColorStop(1, 'rgba(255,120,0,0)');
      ctx.fillStyle = flame; ctx.beginPath(); ctx.arc(pos[0], pos[1] - 12, 6, 0, Math.PI * 2); ctx.fill();
    });
  }

  // Fireflies (stage 6+)
  if (stage >= 6) {
    var t2 = Date.now() * 0.001;
    for (var ff = 0; ff < 8; ff++) {
      var ffx = W * (0.1 + (ff * 0.13) % 0.8) + Math.sin(t2 * 0.7 + ff) * 12;
      var ffy = H * (0.5 + (ff * 0.07) % 0.25) + Math.cos(t2 * 0.5 + ff) * 8;
      var ffAlpha = 0.4 + Math.sin(t2 * 2 + ff) * 0.3;
      ctx.beginPath(); ctx.arc(ffx, ffy, 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(180,255,150,' + ffAlpha + ')'; ctx.fill();
    }
  }

  // Butterflies (stage 7+)
  if (stage >= 7) {
    for (var b = 0; b < 3; b++) {
      var bt = Date.now() * 0.001;
      var bx = W * (0.2 + b * 0.3) + Math.sin(bt * 0.8 + b * 2) * 15;
      var by = H * (0.35 + b * 0.08) + Math.cos(bt * 0.6 + b) * 10;
      ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(['🦋','🌸','✨'][b], bx, by);
    }
  }

  // Fountain (stages 4+, based on sacred spring)
  if (stage >= 4 && riverFill > 0.3) {
    var fcy = H * 0.63, fcx = cx;
    ctx.beginPath(); ctx.arc(fcx, fcy, 10, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(78,205,196,0.3)'; ctx.fill();
    ctx.beginPath(); ctx.arc(fcx, fcy, 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(130,230,220,0.5)'; ctx.fill();
  }
}

// ── SANCTUARY STAGE CALCULATOR ─────────────────────────────────────────────
function computeSanctuaryStage() {
  var total = 0;
  var p = templeState.personal;
  total += (p.sleep + p.hydration + p.movement + p.breath + p.nourishment + p.presence) / 6;
  total += templeState.waterGlasses / templeState.waterGoal;
  total += (templeState.breathSessions.solar + templeState.breathSessions.lunar + templeState.breathSessions.harmony) / 10;
  total += Object.keys(templeState.completedGates).length / 9;
  return Math.min(9, Math.floor(total * 3));
}

// ── DAILY THOUGHT QUESTION PICKER ─────────────────────────────────────────
function getDailyQuestion() {
  var now = new Date();
  var seed = now.getFullYear() * 1000 + now.getMonth() * 31 + now.getDate();
  var idx = seed % THOUGHT_QUESTIONS.length;
  return THOUGHT_QUESTIONS[idx];
}

// ── RENDER TEMPLE SCREEN ──────────────────────────────────────────────────
function renderTempleScreen() {
  var el = document.getElementById('screen-temple');
  if (!el) return;

  var stage = computeSanctuaryStage();
  templeState.sanctuary.stage = stage;
  var q = getDailyQuestion();
  templeState.dailyQuestion = q;

  var stageNames = [
    'Empty Courtyard','Flowers Bloom','Birds Arrive','Trees Mature',
    'Fountain Flows','Fireflies Appear','Butterflies Visit','Temple Illuminated','Living Sanctuary'
  ];

  el.innerHTML =
    // ── Header ──
    '<div class="header-strip">'
    + '<div class="header-date">Temple of the Body</div>'
    + '<div class="header-row"><div style="font-size:13px;color:var(--gold2)">🌿 Personal & Shared Sanctuary</div></div>'
    + '</div>'

    // ── Tab row ──
    + '<div class="tab-row" id="temple-tab-row" style="margin:8px 16px 0;overflow-x:auto;scrollbar-width:none">'
    + '<div class="tab active" onclick="templeTab(\'sanctuary\',this)">Sanctuary</div>'
    + '<div class="tab" onclick="templeTab(\'question\',this)">Reflection</div>'
    + '<div class="tab" onclick="templeTab(\'water\',this)">💧 Waters</div>'
    + '<div class="tab" onclick="templeTab(\'breath\',this)">☀️🌙 Breath</div>'
    + '<div class="tab" onclick="templeTab(\'gates\',this)">Gates</div>'
    + '<div class="tab" onclick="templeTab(\'practices\',this)">Practices</div>'
    + '</div>'

    // ── TAB: SANCTUARY ──
    + '<div id="temple-tab-sanctuary">'
    + '<canvas id="sanctuary-canvas" style="width:100%;height:200px;display:block;margin:12px 0 0"></canvas>'
    + '<div class="card" style="margin-top:0">'
    + '<div class="card-title">' + stageNames[stage] + ' · Stage ' + (stage + 1) + ' of 9</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">'
    + templeFoundationMini()
    + '</div>'
    + '</div>'
    + '<div class="card">'
    + '<div class="card-title">Three Rivers</div>'
    + riverBalanceHTML()
    + '</div>'
    + '<div class="card">'
    + '<div class="card-title">Sacred Fire</div>'
    + sacredFireHTML()
    + '</div>'
    + '</div>'

    // ── TAB: DAILY QUESTION ──
    + '<div id="temple-tab-question" style="display:none">'
    + '<div class="card">'
    + '<div class="card-title">Today\'s Reflection</div>'
    + '<div style="text-align:center;font-size:36px;margin:12px 0">' + q.icon + '</div>'
    + '<div style="font-size:17px;font-family:var(--font);color:var(--gold2);text-align:center;line-height:1.6;padding:0 8px;margin-bottom:16px;font-style:italic">"' + q.q + '"</div>'
    + '<div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--text2);text-align:center;margin-bottom:12px">' + q.cat.toUpperCase() + ' · ' + new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'}) + '</div>'
    + '<textarea id="temple-reflection-input" style="width:100%;background:rgba(255,255,255,0.05);border:0.5px solid var(--border);border-radius:16px;padding:14px;color:var(--text1);font-size:14px;resize:none;height:100px;font-family:inherit;line-height:1.6" placeholder="Write freely — this is for you…"></textarea>'
    + '<button onclick="saveTempleReflection()" style="width:100%;padding:13px;border-radius:40px;background:linear-gradient(135deg,rgba(201,168,76,0.25),rgba(201,168,76,0.1));border:0.5px solid var(--gold);color:var(--gold);font-size:14px;font-weight:600;cursor:pointer;margin-top:10px">Save Reflection ✦</button>'
    + '</div>'
    + questionArchiveHTML()
    + '</div>'

    // ── TAB: SACRED WATERS ──
    + '<div id="temple-tab-water" style="display:none">'
    + waterTabHTML()
    + '</div>'

    // ── TAB: BREATH ──
    + '<div id="temple-tab-breath" style="display:none">'
    + breathTabHTML()
    + '</div>'

    // ── TAB: NINE GATES ──
    + '<div id="temple-tab-gates" style="display:none">'
    + nineGatesHTML()
    + '</div>'

    // ── TAB: PRACTICES ──
    + '<div id="temple-tab-practices" style="display:none">'
    + templePracticesHTML()
    + '</div>';

  // Draw sanctuary after DOM is ready
  setTimeout(function() {
    drawSanctuary('sanctuary-canvas', stage, templeState.waterGlasses, templeState.riverBalance);
    startSanctuaryAnimation();
  }, 50);
}

function templeFoundationMini() {
  var foundations = [
    { icon:'🌙', label:'Sleep',      key:'sleep' },
    { icon:'💧', label:'Hydration',  key:'hydration' },
    { icon:'🚶', label:'Movement',   key:'movement' },
    { icon:'🫁', label:'Breath',     key:'breath' },
    { icon:'🥗', label:'Nourishment',key:'nourishment' },
    { icon:'🧘', label:'Presence',   key:'presence' },
  ];
  return foundations.map(function(f) {
    var v = templeState.personal[f.key];
    return '<div onclick="openFoundationModal(\'' + f.key + '\',\'' + f.label + '\',\'' + f.icon + '\')" style="background:var(--glass2);border-radius:14px;padding:10px 6px;text-align:center;cursor:pointer;border:0.5px solid var(--border)">'
      + '<div style="font-size:20px">' + f.icon + '</div>'
      + '<div style="font-size:10px;color:var(--text2);margin:4px 0">' + f.label + '</div>'
      + '<div style="height:4px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden">'
      + '<div style="width:' + v + '%;height:100%;background:linear-gradient(90deg,var(--gold),var(--gold2));border-radius:2px"></div>'
      + '</div>'
      + '<div style="font-size:11px;color:var(--gold);margin-top:4px">' + v + '%</div>'
      + '</div>';
  }).join('');
}

function riverBalanceHTML() {
  var rivers = [
    { icon:'🌙', name:'Moon River', color:'var(--purple)', desc:'Emotion · Intuition · Rest', key:'moon' },
    { icon:'☀️',  name:'Sun River',  color:'var(--gold)',   desc:'Action · Courage · Purpose', key:'sun' },
    { icon:'🌿', name:'Central River', color:'var(--teal)', desc:'Balance · Mindfulness', key:'central' },
  ];
  return rivers.map(function(r) {
    var v = templeState.riverBalance[r.key];
    return '<div style="margin-bottom:12px">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'
      + '<span style="font-size:16px">' + r.icon + '</span>'
      + '<span style="font-size:13px;color:var(--text1)">' + r.name + '</span>'
      + '<span style="font-size:11px;color:var(--text2);margin-left:4px">' + r.desc + '</span>'
      + '<span style="margin-left:auto;font-size:12px;color:' + r.color + '">' + v + '%</span>'
      + '</div>'
      + '<div style="height:6px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden">'
      + '<div style="width:' + v + '%;height:100%;background:' + r.color + ';border-radius:3px;transition:width 0.5s ease"></div>'
      + '</div></div>';
  }).join('');
}

function sacredFireHTML() {
  var fireLevel = (templeState.riverBalance.moon + templeState.riverBalance.sun + templeState.riverBalance.central) / 3;
  var fireEmoji = fireLevel < 40 ? '🕯️' : (fireLevel < 65 ? '🔥' : '✨🔥✨');
  return '<div style="text-align:center;padding:12px 0">'
    + '<div style="font-size:40px">' + fireEmoji + '</div>'
    + '<div style="font-size:13px;color:var(--gold2);margin:8px 0;font-family:var(--font);font-style:italic">Inner Fire · Shared Spark</div>'
    + '<div style="font-size:12px;color:var(--text2);line-height:1.6">Grows through forgiveness, affection,<br>honest conversations, shared rituals.</div>'
    + '</div>';
}

function waterTabHTML() {
  var glasses = templeState.waterGlasses;
  var goal = templeState.waterGoal;
  var pct = Math.min(100, Math.round(glasses / goal * 100));
  var stageLabels = ['Dry stone basin','Small spring appearing','Flowing fountain','Fish appear','Lotus flowers bloom','Crystal waterfall','Living river'];
  var springStage = Math.min(6, Math.floor(glasses / goal * 7));

  var drinkTypes = [
    {icon:'💧',label:'Water'},
    {icon:'🍵',label:'Tea'},
    {icon:'🫧',label:'Sparkling'},
    {icon:'🌿',label:'Herbal'},
  ];

  var wisdomIdx = (new Date().getDate()) % WATER_WISDOM.length;
  var wisdom = WATER_WISDOM[wisdomIdx];

  return '<div class="card">'
    + '<div class="card-title">Today\'s Water</div>'
    + '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">'
    + '<div style="flex:1;height:10px;background:rgba(255,255,255,0.08);border-radius:5px;overflow:hidden">'
    + '<div id="water-bar" style="width:' + pct + '%;height:100%;background:linear-gradient(90deg,#4ecdc4,#80e8e2);border-radius:5px;transition:width 0.5s ease"></div>'
    + '</div>'
    + '<div style="font-size:14px;color:var(--teal);font-weight:600;min-width:60px;text-align:right" id="water-count">' + glasses + ' / ' + goal + ' 💧</div>'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px">'
    + drinkTypes.map(function(d) {
        return '<div onclick="logWater()" style="text-align:center;background:var(--glass2);border-radius:12px;padding:10px 4px;cursor:pointer;border:0.5px solid var(--border)">'
          + '<div style="font-size:22px">' + d.icon + '</div>'
          + '<div style="font-size:10px;color:var(--text2);margin-top:4px">' + d.label + '</div>'
          + '</div>';
      }).join('')
    + '</div>'
    + '<div style="text-align:center;font-size:12px;color:var(--text2);font-style:italic">' + pct + '% — ' + (pct >= 100 ? 'Sacred spring flowing ✨' : pct >= 75 ? 'Almost there — keep going 🌊' : pct >= 50 ? 'Halfway — good flow 💧' : 'Begin the flow today 🌱') + '</div>'
    + '</div>'

    // Sacred Spring progress
    + '<div class="card">'
    + '<div class="card-title">Sacred Spring</div>'
    + '<div style="text-align:center;font-size:13px;color:var(--teal);margin-bottom:12px">' + stageLabels[springStage] + '</div>'
    + '<div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap">'
    + stageLabels.map(function(s, i) {
        var done = i <= springStage;
        return '<div style="font-size:10px;padding:5px 10px;border-radius:20px;border:0.5px solid ' + (done ? 'var(--teal)' : 'var(--border)') + ';background:' + (done ? 'rgba(78,205,196,0.12)' : 'var(--glass)') + ';color:' + (done ? 'var(--teal)' : 'var(--text2)') + '">' + (done ? '✓ ' : '') + s + '</div>';
      }).join('')
    + '</div></div>'

    // Emotional waters
    + '<div class="card">'
    + '<div class="card-title">Emotional Waters</div>'
    + '<div style="font-size:12px;color:var(--text2);margin-bottom:12px;font-style:italic">How do your emotions feel today?</div>'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
    + [['😌','Calm'],['⚖️','Balanced'],['🌧️','Heavy'],['🌊','Overwhelmed'],['🌸','Hopeful']].map(function(e) {
        return '<div onclick="logEmotion(\'' + e[1] + '\',this)" style="padding:8px 14px;border-radius:40px;border:0.5px solid var(--border);background:var(--glass);color:var(--text2);font-size:13px;cursor:pointer">' + e[0] + ' ' + e[1] + '</div>';
      }).join('')
    + '</div></div>'

    // Water wisdom card
    + '<div class="card" style="background:rgba(78,205,196,0.06);border-color:rgba(78,205,196,0.2)">'
    + '<div class="card-title" style="color:var(--teal)">💧 Water Wisdom</div>'
    + '<div style="font-size:20px;text-align:center;margin-bottom:8px">' + wisdom.icon + '</div>'
    + '<div style="font-size:14px;font-weight:600;color:var(--text1);margin-bottom:8px">' + wisdom.title + '</div>'
    + '<div style="font-size:13px;color:var(--text2);line-height:1.7;font-style:italic">' + wisdom.body + '</div>'
    + '</div>'

    // Mindful drinking prompt
    + '<div class="card" style="background:rgba(201,168,76,0.04);border-color:rgba(201,168,76,0.15)">'
    + '<div class="card-title">Mindful Drinking</div>'
    + '<div style="font-size:13px;color:var(--text2);line-height:1.8;font-style:italic;text-align:center;padding:4px 0">'
    + 'Before your next sip...<br>Pause. Take one deep breath.<br>Notice the coolness of the water.<br>'
    + '<span style="color:var(--gold2)">Thank your body for everything it does.</span>'
    + '</div></div>';
}

function breathTabHTML() {
  return '<div class="card">'
    + '<div class="card-title">Solar & Lunar Balance</div>'
    + '<div style="font-size:13px;color:var(--text2);line-height:1.7;font-style:italic;margin-bottom:14px">'
    + 'Just as day and night create rhythm in nature, we each experience moments of action and rest. Recognizing these rhythms cultivates presence and harmony.'
    + '</div>'
    + '<div style="display:flex;gap:10px;margin-bottom:8px">'
    + '<div style="flex:1;padding:12px;background:rgba(201,168,76,0.08);border:0.5px solid rgba(201,168,76,0.25);border-radius:16px">'
    + '<div style="font-size:18px;text-align:center">☀️</div>'
    + '<div style="font-size:12px;font-weight:600;color:var(--gold);text-align:center;margin:4px 0">Solar Energy</div>'
    + '<div style="font-size:11px;color:var(--text2);text-align:center;line-height:1.5">Action · Focus<br>Courage · Purpose</div>'
    + '</div>'
    + '<div style="flex:1;padding:12px;background:rgba(155,109,255,0.08);border:0.5px solid rgba(155,109,255,0.25);border-radius:16px">'
    + '<div style="font-size:18px;text-align:center">🌙</div>'
    + '<div style="font-size:12px;font-weight:600;color:var(--purple);text-align:center;margin:4px 0">Lunar Energy</div>'
    + '<div style="font-size:11px;color:var(--text2);text-align:center;line-height:1.5">Rest · Intuition<br>Compassion · Stillness</div>'
    + '</div>'
    + '</div></div>'
    + BREATHING_SESSIONS.map(function(s) {
        var count = templeState.breathSessions[s.id] || 0;
        return '<div class="card">'
          + '<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">'
          + '<div style="font-size:32px">' + s.icon + '</div>'
          + '<div>'
          + '<div style="font-size:15px;font-weight:600;color:var(--text1)">' + s.name + '</div>'
          + '<div style="font-size:11px;color:var(--text2)">' + s.purpose + '</div>'
          + '</div>'
          + '<div style="margin-left:auto;font-size:11px;color:' + s.color + ';background:rgba(255,255,255,0.05);padding:3px 10px;border-radius:20px">' + count + ' sessions</div>'
          + '</div>'
          + '<div style="font-size:13px;color:var(--text2);line-height:1.6;margin-bottom:12px;font-style:italic">' + s.desc + '</div>'
          + '<div style="display:flex;gap:8px">'
          + '<button onclick="startBreathSession(\'' + s.id + '\',\'' + s.name + '\',' + s.duration + ')" style="flex:1;padding:10px;border-radius:40px;background:rgba(201,168,76,0.12);border:0.5px solid ' + s.color + ';color:' + s.color + ';font-size:13px;cursor:pointer">Begin ✦</button>'
          + '<button onclick="openTimer(\'breath_' + s.id + '\',\'' + s.icon + '\',\'' + s.name + '\',' + s.duration + ')" style="padding:10px 16px;border-radius:40px;background:var(--glass);border:0.5px solid var(--border);color:var(--text2);font-size:13px;cursor:pointer">⏱ Timer</button>'
          + '</div></div>';
      }).join('')
    + dailyBalanceHTML();
}

function dailyBalanceHTML() {
  return '<div class="card">'
    + '<div class="card-title">Daily Balance Check-In</div>'
    + '<div style="font-size:13px;color:var(--text2);margin-bottom:10px">How are you arriving today?</div>'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">'
    + [['⚡','Energized'],['⚖️','Balanced'],['🪞','Reflective'],['💤','Drained']].map(function(e) {
        return '<div onclick="logBreathState(this,\'' + e[1] + '\')" style="padding:8px 14px;border-radius:40px;border:0.5px solid var(--border);background:var(--glass);color:var(--text2);font-size:13px;cursor:pointer">' + e[0] + ' ' + e[1] + '</div>';
      }).join('')
    + '</div></div>';
}

function nineGatesHTML() {
  return '<div class="card">'
    + '<div class="card-title">The Nine Gates</div>'
    + '<div style="font-size:12px;color:var(--text2);line-height:1.6;margin-bottom:14px;font-style:italic">'
    + 'Nine areas of awareness — not to complete, but to return to. Each gate is an invitation to deeper presence.'
    + '</div></div>'
    + NINE_GATES.map(function(g) {
        var done = !!templeState.completedGates[g.id];
        return '<div class="card" style="' + (done ? 'border-color:rgba(78,205,196,0.3)' : '') + '">'
          + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">'
          + '<div style="font-size:24px">' + g.icon + '</div>'
          + '<div><div style="font-size:15px;font-weight:600;color:var(--text1)">Gate of ' + g.name + '</div>'
          + (done ? '<div style="font-size:10px;color:var(--teal)">✓ Practiced today</div>' : '') + '</div>'
          + '</div>'
          + '<div style="font-size:13px;color:var(--gold2);font-style:italic;line-height:1.5;margin-bottom:8px">"' + g.q + '"</div>'
          + '<div style="font-size:12px;color:var(--text2);padding:10px;background:rgba(255,255,255,0.03);border-radius:10px;border:0.5px solid var(--border);margin-bottom:10px">'
          + '🌿 Practice: ' + g.practice
          + '</div>'
          + '<button onclick="markGateComplete(\'' + g.id + '\',this)" style="padding:8px 18px;border-radius:40px;background:' + (done ? 'rgba(78,205,196,0.15)' : 'rgba(201,168,76,0.1)') + ';border:0.5px solid ' + (done ? 'var(--teal)' : 'var(--gold)') + ';color:' + (done ? 'var(--teal)' : 'var(--gold)') + ';font-size:12px;cursor:pointer">'
          + (done ? '✓ Completed' : 'I practiced this ✦')
          + '</button></div>';
      }).join('');
}

function templePracticesHTML() {
  return '<div style="font-size:11px;color:var(--text2);padding:12px 16px 4px;letter-spacing:1px;text-transform:uppercase">Temple Practices</div>'
    + '<div style="padding:0 16px">'
    + TEMPLE_PRACTICES.map(function(t) {
        var tKey = (typeof currentMySlot !== 'undefined' ? (currentMySlot || 'A') : 'A') + '_tp_' + t.id;
        var done = typeof completedTasks !== 'undefined' && completedTasks && completedTasks[tKey];
        return '<div style="background:var(--glass);border:0.5px solid var(--border);border-radius:20px;padding:16px;margin-bottom:10px">'
          + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">'
          + '<div style="font-size:24px;flex-shrink:0">' + t.icon + '</div>'
          + '<div style="font-size:14px;font-weight:600;color:var(--text1)">' + t.title + '</div>'
          + '<div style="font-size:11px;color:var(--gold);margin-left:auto">' + t.dur + '</div>'
          + '</div>'
          + '<div style="font-size:13px;color:var(--text2);line-height:1.5;margin-bottom:10px">' + t.desc + '</div>'
          + '<div style="display:flex;gap:6px;flex-wrap:wrap">'
          + '<div id="tpbtn-' + t.id + '" onclick="markTemplePractice(\'' + t.id + '\',' + t.xp + ',this)" style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;background:' + (done ? 'rgba(78,205,196,0.2)' : 'rgba(78,205,196,0.1)') + ';border:0.5px solid var(--teal);border-radius:8px;color:var(--teal);font-size:12px;cursor:pointer;opacity:' + (done ? '0.7' : '1') + '">' + (done ? '✓ Completed' : 'Complete (+' + t.xp + ' XP)') + '</div>'
          + (t.timerSec ? '<div onclick="openTimer(\'tp_' + t.id + '\',\'' + t.icon + '\',\'' + t.title + '\',' + t.timerSec + ')" style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;background:rgba(201,168,76,0.1);border:0.5px solid var(--gold);border-radius:8px;color:var(--gold);font-size:12px;cursor:pointer">⏱ Timer</div>' : '')
          + '</div></div>';
      }).join('')
    + '</div>';
}

function questionArchiveHTML() {
  return '<div class="card">'
    + '<div class="card-title">Question Archive</div>'
    + '<div style="font-size:12px;color:var(--text2);margin-bottom:10px;font-style:italic">Other questions to sit with — choose one when called.</div>'
    + '<div style="max-height:300px;overflow-y:auto">'
    + THOUGHT_QUESTIONS.slice(0, 10).map(function(q) {
        return '<div onclick="setTempleQuestion(\'' + q.id + '\')" style="padding:12px;background:var(--glass2);border-radius:12px;margin-bottom:6px;cursor:pointer;border:0.5px solid var(--border)">'
          + '<span style="font-size:16px;margin-right:8px">' + q.icon + '</span>'
          + '<span style="font-size:13px;color:var(--text2);font-style:italic">' + q.q + '</span>'
          + '</div>';
      }).join('')
    + '</div></div>';
}

// ── SANCTUARY ANIMATION LOOP ───────────────────────────────────────────────
var sanctuaryRAF = null;
function startSanctuaryAnimation() {
  if (sanctuaryRAF) cancelAnimationFrame(sanctuaryRAF);
  function frame() {
    var stage = computeSanctuaryStage();
    drawSanctuary('sanctuary-canvas', stage, templeState.waterGlasses, templeState.riverBalance);
    sanctuaryRAF = requestAnimationFrame(frame);
  }
  frame();
}

// ── INTERACTION HANDLERS ───────────────────────────────────────────────────
window.templeTab = function(tab, btn) {
  ['sanctuary','question','water','breath','gates','practices'].forEach(function(t) {
    var el = document.getElementById('temple-tab-' + t);
    if (el) el.style.display = t === tab ? 'block' : 'none';
  });
  var row = document.getElementById('temple-tab-row');
  if (row) row.querySelectorAll('.tab').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  if (tab === 'sanctuary') {
    setTimeout(function() { startSanctuaryAnimation(); }, 50);
  }
};

window.logWater = function() {
  templeState.waterGlasses = Math.min(templeState.waterGoal + 2, templeState.waterGlasses + 1);
  var bar = document.getElementById('water-bar');
  var cnt = document.getElementById('water-count');
  var pct = Math.min(100, Math.round(templeState.waterGlasses / templeState.waterGoal * 100));
  if (bar) bar.style.width = pct + '%';
  if (cnt) cnt.textContent = templeState.waterGlasses + ' / ' + templeState.waterGoal + ' 💧';
  if (typeof awardXP === 'function') awardXP(5);
  if (typeof showToast === 'function') showToast('💧 Water logged! Nourishing your temple.');
  updateRiverBalance('moon', 2);
  updateRiverBalance('central', 1);
};

window.logEmotion = function(name, el) {
  document.querySelectorAll('#temple-tab-water .card:nth-child(3) div div').forEach(function(d) {
    d.style.borderColor = 'var(--border)'; d.style.color = 'var(--text2)';
  });
  if (el) { el.style.borderColor = 'var(--teal)'; el.style.color = 'var(--teal)'; }
  if (typeof showToast === 'function') showToast('🌊 Emotion noted: ' + name + '. Awareness is the first act of care.');
};

window.logBreathState = function(el, state) {
  el.parentNode.querySelectorAll('div').forEach(function(d) { d.style.borderColor = 'var(--border)'; d.style.color = 'var(--text2)'; });
  el.style.borderColor = 'var(--gold)'; el.style.color = 'var(--gold)';
  if (typeof showToast === 'function') showToast('Balance noted: ' + state + ' ✦');
};

window.startBreathSession = function(type, name, durationSec) {
  templeState.breathSessions[type] = (templeState.breathSessions[type] || 0) + 1;
  if (typeof awardXP === 'function') awardXP(20);
  if (typeof showToast === 'function') showToast('🌬️ ' + name + ' — settling into stillness…');
  updateRiverBalance(type === 'solar' ? 'sun' : type === 'lunar' ? 'moon' : 'central', 5);
  if (typeof openTimer === 'function') openTimer('breath_' + type, type === 'solar' ? '☀️' : type === 'lunar' ? '🌙' : '🌿', name, durationSec);
};

window.markGateComplete = function(gateId, btn) {
  templeState.completedGates[gateId] = true;
  if (btn) {
    btn.textContent = '✓ Completed';
    btn.style.background = 'rgba(78,205,196,0.15)';
    btn.style.borderColor = 'var(--teal)';
    btn.style.color = 'var(--teal)';
  }
  if (typeof awardXP === 'function') awardXP(25);
  if (typeof showToast === 'function') showToast('✦ Gate of ' + NINE_GATES.find(function(g){return g.id===gateId;}).name + ' — honored.');
  updateRiverBalance('central', 3);
};

window.markTemplePractice = function(id, xp, btnEl) {
  var slot = (typeof currentMySlot !== 'undefined' ? currentMySlot : 'A') || 'A';
  var key = slot + '_tp_' + id;
  if (typeof completedTasks === 'undefined') window.completedTasks = {};
  if (completedTasks[key]) { if (typeof showToast === 'function') showToast('Already completed today ✓'); return; }
  completedTasks[key] = true;
  if (btnEl) { btnEl.textContent = '✓ Completed'; btnEl.style.opacity = '0.7'; }
  if (typeof awardXP === 'function') awardXP(xp);
  if (typeof safeRelUpdate === 'function') safeRelUpdate({ completed_tasks: completedTasks });
};

window.saveTempleReflection = async function() {
  var input = document.getElementById('temple-reflection-input');
  if (!input || !input.value.trim()) {
    if (typeof showToast === 'function') showToast('Write something first ✦');
    return;
  }
  var q = templeState.dailyQuestion;
  var entry = { question: q ? q.q : '', answer: input.value.trim(), cat: q ? q.cat : 'self', ts: new Date().toISOString() };
  // Persist locally and optionally to Supabase private notes
  if (typeof sbClient !== 'undefined' && sbClient && typeof currentUser !== 'undefined' && currentUser && typeof currentRelationshipId !== 'undefined' && currentRelationshipId) {
    await sbClient.from('private_notes').insert({
      user_id: currentUser.id,
      relationship_id: currentRelationshipId,
      body: '🌿 Temple Reflection\n\n"' + entry.question + '"\n\n' + entry.answer,
      shared: false,
      note_type: 'temple_reflection'
    });
  }
  if (typeof awardXP === 'function') awardXP(15);
  if (typeof showToast === 'function') showToast('✦ Reflection saved. The sanctuary grows.');
  input.value = '';
  updateRiverBalance('moon', 3);
  updateRiverBalance('central', 2);
};

window.setTempleQuestion = function(qId) {
  var q = THOUGHT_QUESTIONS.find(function(q) { return q.id === qId; });
  if (!q) return;
  templeState.dailyQuestion = q;
  var inputEl = document.getElementById('temple-reflection-input');
  var qEl = document.querySelector('#temple-tab-question .card div[style*="font-size:17px"]');
  if (qEl) qEl.textContent = '"' + q.q + '"';
  if (inputEl) inputEl.value = '';
  if (typeof showToast === 'function') showToast(q.icon + ' Question selected. Sit with it.');
  templeTab('question', document.querySelector('#temple-tab-row .tab:nth-child(2)'));
};

window.openFoundationModal = function(key, label, icon) {
  // Build a quick rating modal
  var existing = document.getElementById('modal-foundation');
  if (existing) existing.remove();
  var div = document.createElement('div');
  div.id = 'modal-foundation';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);backdrop-filter:blur(12px);display:flex;align-items:flex-end;justify-content:center;z-index:1001;padding-bottom:var(--safe-bottom,0px)';
  div.innerHTML = '<div style="width:100%;max-width:480px;background:#11151f;border:0.5px solid var(--border);border-radius:32px 32px 0 0;padding:24px">'
    + '<div style="width:40px;height:4px;background:rgba(201,168,76,0.35);border-radius:2px;margin:0 auto 20px"></div>'
    + '<div style="text-align:center;margin-bottom:16px"><div style="font-size:36px">' + icon + '</div><div style="font-size:18px;color:var(--gold2);margin-top:6px">' + label + '</div></div>'
    + '<div style="font-size:13px;color:var(--text2);text-align:center;margin-bottom:14px;font-style:italic">How well are you caring for this today?</div>'
    + '<div style="display:flex;gap:6px;justify-content:center;margin-bottom:16px">'
    + [20,40,60,80,100].map(function(v) {
        return '<div onclick="setFoundation(\'' + key + '\',' + v + ',this)" style="flex:1;max-width:52px;height:44px;border-radius:10px;background:var(--glass);border:0.5px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:13px;color:var(--text2);cursor:pointer">' + v + '</div>';
      }).join('')
    + '</div>'
    + '<button onclick="document.getElementById(\'modal-foundation\').remove()" style="width:100%;padding:12px;border-radius:40px;background:var(--glass);border:0.5px solid var(--border);color:var(--text2);font-size:14px;cursor:pointer">Close</button>'
    + '</div>';
  document.body.appendChild(div);
  div.addEventListener('click', function(e) { if (e.target === div) div.remove(); });
};

window.setFoundation = function(key, value, btn) {
  templeState.personal[key] = value;
  if (btn) {
    btn.parentNode.querySelectorAll('div').forEach(function(d) { d.style.background = 'var(--glass)'; d.style.borderColor = 'var(--border)'; d.style.color = 'var(--text2)'; });
    btn.style.background = 'rgba(201,168,76,0.2)'; btn.style.borderColor = 'var(--gold)'; btn.style.color = 'var(--gold)';
  }
  if (typeof showToast === 'function') showToast('✦ ' + key + ' updated to ' + value + '%');
  setTimeout(function() {
    document.getElementById('modal-foundation').remove();
    renderTempleScreen();
  }, 600);
};

function updateRiverBalance(river, delta) {
  templeState.riverBalance[river] = Math.min(100, (templeState.riverBalance[river] || 50) + delta);
}

// ── INJECT TEMPLE SCREEN INTO DOM ─────────────────────────────────────────
function injectTempleScreen() {
  if (document.getElementById('screen-temple')) return;
  var mainApp = document.getElementById('main-app');
  if (!mainApp) return;

  // Add screen div before bottom-nav
  var screen = document.createElement('div');
  screen.id = 'screen-temple';
  screen.className = 'screen';
  var nav = document.getElementById('bottom-nav');
  if (nav) mainApp.insertBefore(screen, nav);
  else mainApp.appendChild(screen);

  // Inject nav item
  if (nav) {
    var btn = document.createElement('button');
    btn.className = 'nav-item';
    btn.setAttribute('data-nav', 'temple');
    btn.onclick = function() { switchScreen('temple', this); };
    btn.innerHTML = '<span class="nav-icon">🌿</span><span>Temple</span><div class="nav-dot"></div>';
    nav.appendChild(btn);
  }
}

// ── HOOK INTO switchScreen ─────────────────────────────────────────────────
var _origSwitchScreen = typeof switchScreen === 'function' ? switchScreen : null;
window.switchScreen = function(screen, btn) {
  if (_origSwitchScreen) _origSwitchScreen(screen, btn);
  if (screen === 'temple') {
    renderTempleScreen();
    setTimeout(startSanctuaryAnimation, 100);
  } else {
    if (sanctuaryRAF) { cancelAnimationFrame(sanctuaryRAF); sanctuaryRAF = null; }
  }
};

// ── HOOK INTO startMainApp & startDemoMode ─────────────────────────────────
var _prevSMA = typeof startMainApp === 'function' ? startMainApp : null;
window.startMainApp = function(rel) {
  if (_prevSMA) _prevSMA(rel);
  injectTempleScreen();
};

var _prevDemo = typeof startDemoMode === 'function' ? startDemoMode : null;
window.startDemoMode = function() {
  if (_prevDemo) _prevDemo();
  injectTempleScreen();
};

// ── ALSO INJECT if main-app already visible (late load) ───────────────────
(function() {
  var mainApp = document.getElementById('main-app');
  if (mainApp && mainApp.style.display !== 'none') {
    injectTempleScreen();
  }
})();

})(); // end TempleModule
