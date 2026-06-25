
// ==================== COMPLETE APP ====================
// FULLY INTEGRATED: Personal + Relationship + Baby Readiness + Archetype + Mastery
// EVERYTHING grows together

let sbClient = null;
let currentUser = null;
let currentRelationshipId = null;
let currentMySlot = 'A';
let liveData = {};
let realtimeChannels = [];
let completedTasks = {};
let xpData = {A:0, B:0};
let selectedDreamTags = [];
let galaxyRAF = null;
let streakData = { days: 0, lastDate: null };
let achievements = [];
let timerInterval = null;
let timerRunning = false;
let timerSeconds = 0;
let timerTotalSeconds = 0;
let sanctuaryRAF = null;

// ── Personal Metrics ──
let personalMetrics = {
  empathy: { base: 58, current: 58, changes: [] },
  selfAwareness: { base: 65, current: 65, changes: [] },
  communication: { base: 56, current: 56, changes: [] },
  confidence: { base: 70, current: 70, changes: [] },
  vulnerability: { base: 64, current: 64, changes: [] }
};

// ── Relationship Metrics ──
let relationshipMetrics = {
  sharedVision: { base: 48, current: 48, changes: [] },
  friendship: { base: 75, current: 75, changes: [] },
  trust: { base: 60, current: 60, changes: [] },
  teamwork: { base: 60, current: 60, changes: [] },
  communication: { base: 60, current: 60, changes: [] },
  intimacy: { base: 65, current: 65, changes: [] }
};

// ── Baby Readiness ──
let babyReadiness = 70;

// ── Paths Progress ──
let pathProgress = {
  variety: { xp: 0, level: 1, skills: [], rank: 0 },
  development: { xp: 0, level: 1, skills: [], rank: 0 },
  consummation: { xp: 0, level: 1, skills: [], rank: 0 },
  transcendence: { xp: 0, level: 1, skills: [], rank: 0 }
};
const MASTERY_RANKS = ['Explorer', 'Practitioner', 'Companion', 'Guide', 'Master'];
const PATH_LEVELS = {
  variety: { name: 'Variety', icon: '🌸', badge: 'Heart Awakening', maxLevel: 10 },
  development: { name: 'Development', icon: '👁', badge: 'Mirror of Souls', maxLevel: 10 },
  consummation: { name: 'Consummation', icon: '❤️', badge: 'Sacred Partnership', maxLevel: 10 },
  transcendence: { name: 'Transcendence', icon: '✨', badge: 'Innate Light', maxLevel: 10 }
};

// ── Temple State ──
let templeState = {
  personal: { sleep: 0, hydration: 0, movement: 0, breath: 0, nourishment: 0, presence: 0 },
  waterGlasses: 0,
  waterGoal: 8,
  breathSessions: { solar: 0, lunar: 0, harmony: 0 },
  completedGates: {},
  riverBalance: { moon: 50, sun: 50, central: 50 },
  dailyQuestion: null,
  questionAnswered: false
};

// ── Data ──
const THOUGHT_QUESTIONS = [
  { id:'tq1', cat:'self', icon:'🌿', q:'What part of yourself have you been neglecting lately?' },
  { id:'tq2', cat:'self', icon:'🔥', q:'When did you last feel truly alive — not just content, but lit up?' },
  { id:'tq3', cat:'self', icon:'🌊', q:'What emotion have you been avoiding naming this week?' },
  { id:'tq11', cat:'couple', icon:'👁️', q:'When did you last truly look at your partner — not through habit, but with fresh eyes?' },
  { id:'tq12', cat:'couple', icon:'💬', q:'What conversation have you both been circling without landing?' },
  { id:'tq21', cat:'body', icon:'🫁', q:'When did you last breathe deeply — not because you were told to, but because you needed to?' },
  { id:'tq26', cat:'purpose', icon:'🧭', q:'What are you building this year — and does your partner know about it?' },
];

const NINE_GATES = [
  { id:'vision', icon:'👁️', name:'Vision', q:'Do I truly see my partner — beyond habit, beyond projection?', practice:'Sit together for 2 minutes in silence. Simply look at each other.' },
  { id:'listening', icon:'👂', name:'Listening', q:'Do I listen to understand, or do I listen to respond?', practice:'Ask one question today. Then only listen — no advice, no stories.' },
  { id:'speech', icon:'🗣️', name:'Speech', q:'Do my words create healing or do they quietly wound?', practice:'Offer one specific, genuine appreciation.' },
  { id:'awareness', icon:'🧠', name:'Awareness', q:'Can I observe my thoughts before letting them become reactions?', practice:'3-minute body scan before the next difficult conversation.' },
  { id:'intimacy', icon:'❤️', name:'Intimacy', q:'Is our closeness built on trust, comfort, and consent?', practice:'Share one emotional need you haven\'t voiced in a while.' },
  { id:'compassion', icon:'🌸', name:'Compassion', q:'Can I stay gentle when I most want to be right?', practice:'In the next disagreement — pause. Breathe. Then respond.' },
  { id:'presence', icon:'🌿', name:'Presence', q:'Am I fully here, or am I somewhere else in my mind?', practice:'One device-free hour together this week.' },
  { id:'purpose', icon:'☀️', name:'Purpose', q:'What are we building together that has meaning beyond ourselves?', practice:'Share one dream you\'ve been holding quietly.' },
  { id:'consciousness', icon:'💫', name:'Consciousness', q:'Who am I becoming — and does my partner know that person?', practice:'Journal: "The person I am growing into looks like…"' },
];

const TEMPLE_PRACTICES = [
  { id:'tp1', icon:'🫁', title:'5-Min Shared Breathing', dur:'5 min', xp:30, desc:'Sit facing each other. Sync your breath without speaking.', timerSec:300 },
  { id:'tp2', icon:'👁️', title:'Eye-Contact Meditation', dur:'3 min', xp:40, desc:'Look into each other\'s eyes. Real seeing. Breathe.', timerSec:180 },
  { id:'tp3', icon:'🙏', title:'Gratitude Exchange', dur:'5 min', xp:30, desc:'"I\'m grateful for you because…" — specific, recent, real.', timerSec:300 },
  { id:'tp4', icon:'🚶', title:'Silent Walk Together', dur:'15 min', xp:40, desc:'Walk without phones, without agenda.', timerSec:900 },
];

const BREATHING_SESSIONS = [
  { id:'solar', icon:'☀️', name:'Solar Breath', color:'#c9a84c', purpose:'Energize · Focus', duration:300, desc:'Breathe in courage, breathe out hesitation.' },
  { id:'lunar', icon:'🌙', name:'Lunar Breath', color:'#9b6dff', purpose:'Calm · Release', duration:600, desc:'Slow, softening breath. Let the day settle.' },
  { id:'harmony', icon:'🌿', name:'Harmony Breath', color:'#4ecdc4', purpose:'Balance · Center', duration:300, desc:'Equal rhythm. Action and rest in harmony.' },
];

const WATER_WISDOM = [
  { icon:'💧', title:'Why hydration matters', body:'Your body is ~60% water. Even mild dehydration affects mood, focus, and energy.' },
  { icon:'🌊', title:'Morning hydration', body:'Drinking water first thing replenishes what sleep depleted. The simplest act of self-care.' },
  { icon:'🏃', title:'Hydration & movement', body:'During exercise, listen to your body\'s thirst. No perfect formula — only presence.' },
  { icon:'🌿', title:'Signs of dehydration', body:'Fatigue, headaches, difficulty concentrating can all signal you need more water.' },
  { icon:'🍵', title:'Enjoyable hydration', body:'Herbal teas, sparkling water, even warm broth count. Hydration should feel like nourishment.' },
];

const SHADOW_QS = [
  {id:'judge_partner', label:'The thing I secretly judge my partner for is…'},
  {id:'judge_self', label:'The thing I secretly judge myself for is…'},
  {id:'fear', label:'The fear I rarely admit is…'},
  {id:'truth', label:'The truth I have not fully spoken is…'},
];

const DREAM_TAGS = ['💞 Love','🌊 Water','✈️ Flight','👶 Child','🏠 Home','🌑 Shadow','💡 Clarity','⚡ Anxiety','🌈 Joy','🌀 Transform'];

const AFFIRMATIONS = [
  'You are exactly where you need to be 🌱',
  'Your love is a garden — water it daily 💧',
  'Growth happens in the quiet moments 🌙',
  'You are braver than you know 💪',
  'This connection is sacred 🙏',
  'Every step forward is a victory 🏆',
  'You are creating something beautiful ✨',
  'Trust the process 🌿',
  'Your heart knows the way ❤️',
  'Today is a new beginning 🌅',
];

const ACHIEVEMENTS = [
  { id: 'first_xp', icon: '🌟', title: 'First Steps', desc: 'Earn your first XP!', xpReq: 10 },
  { id: 'streak_3', icon: '🔥', title: 'On Fire!', desc: '3 day streak!', xpReq: 50 },
  { id: 'xp_100', icon: '💫', title: 'Centurion', desc: 'Reach 100 XP', xpReq: 100 },
  { id: 'gate_keeper', icon: '🚪', title: 'Gate Keeper', desc: 'Complete your first Gate', xpReq: 80 },
  { id: 'xp_520', icon: '🌿', title: 'Temple Guardian', desc: 'Unlock the Temple of the Body', xpReq: 520 },
  { id: 'water_master', icon: '💧', title: 'Water Master', desc: 'Log 10 glasses of water', xpReq: 30 },
  { id: 'path_variety_5', icon: '🌸', title: 'Heart Awakening', desc: 'Reach Level 5 in Variety Path', xpReq: 200 },
  { id: 'path_development_5', icon: '👁', title: 'Mirror of Souls', desc: 'Reach Level 5 in Development Path', xpReq: 350 },
  { id: 'path_consummation_5', icon: '❤️', title: 'Sacred Partnership', desc: 'Reach Level 5 in Consummation Path', xpReq: 500 },
  { id: 'path_transcendence_5', icon: '✨', title: 'Innate Light', desc: 'Reach Level 5 in Transcendence Path', xpReq: 700 },
];

function safeSubscribe(channel) { realtimeChannels.push(channel); return channel; }

// ==================== METRICS SYSTEM ====================

function getPersonalMetric(name) {
  return personalMetrics[name]?.current || 50;
}

function getRelationshipMetric(name) {
  let map = {
    'sharedVision': 'sharedVision',
    'friendship': 'friendship',
    'trust': 'trust',
    'teamwork': 'teamwork',
    'communication': 'communication',
    'intimacy': 'intimacy'
  };
  let key = map[name] || name;
  return relationshipMetrics[key]?.current || 50;
}

function getBabyReadiness() {
  // Baby readiness = weighted average of key relationship metrics
  let vision = getRelationshipMetric('sharedVision');
  let trust = getRelationshipMetric('trust');
  let teamwork = getRelationshipMetric('teamwork');
  let intimacy = getRelationshipMetric('intimacy');
  let comm = getRelationshipMetric('communication');
  let friendship = getRelationshipMetric('friendship');

  // Weighted formula
  let readiness = (vision * 0.25 + trust * 0.20 + teamwork * 0.15 + intimacy * 0.15 + comm * 0.15 + friendship * 0.10);
  return Math.min(100, Math.round(readiness));
}

function getArchetype() {
  let metrics = [
    { name: 'Builders', symbol: '⚒', lesson: 'Create foundations before expansion.', score: getRelationshipMetric('teamwork') + getRelationshipMetric('sharedVision') },
    { name: 'Healers', symbol: '🌿', lesson: 'Your wounds are portals to deeper connection.', score: getPersonalMetric('empathy') + getRelationshipMetric('trust') },
    { name: 'Explorers', symbol: '🧭', lesson: 'Keep moving — but build a home base together.', score: getRelationshipMetric('friendship') + getPersonalMetric('confidence') },
    { name: 'Lovers', symbol: '❤️', lesson: 'Passion without depth becomes habit. Deepen daily.', score: getRelationshipMetric('intimacy') + getPersonalMetric('vulnerability') },
    { name: 'Alchemists', symbol: '🔥', lesson: 'You are here to transform each other consciously.', score: getPersonalMetric('selfAwareness') + getRelationshipMetric('communication') }
  ];
  let best = metrics.reduce((a, b) => a.score > b.score ? a : b);
  return best;
}

function addPersonalMetric(name, amount, source) {
  if (!personalMetrics[name]) return;
  let old = personalMetrics[name].current;
  let newVal = Math.min(100, Math.max(0, old + amount));
  personalMetrics[name].current = Math.round(newVal);
  personalMetrics[name].changes.push({ amount, source, timestamp: new Date().toISOString() });
  if (personalMetrics[name].changes.length > 20) personalMetrics[name].changes.shift();
  spawnFloatingEmoji('📈 +' + amount + ' ' + name);
}

function addRelationshipMetric(name, amount, source) {
  let map = {
    'sharedVision': 'sharedVision',
    'friendship': 'friendship',
    'trust': 'trust',
    'teamwork': 'teamwork',
    'communication': 'communication',
    'intimacy': 'intimacy'
  };
  let key = map[name] || name;
  if (!relationshipMetrics[key]) return;
  let old = relationshipMetrics[key].current;
  let newVal = Math.min(100, Math.max(0, old + amount));
  relationshipMetrics[key].current = Math.round(newVal);
  relationshipMetrics[key].changes.push({ amount, source, timestamp: new Date().toISOString() });
  if (relationshipMetrics[key].changes.length > 20) relationshipMetrics[key].changes.shift();
  spawnFloatingEmoji('💑 +' + amount + ' ' + name);

  // Baby readiness auto-updates via getBabyReadiness()
}

function addAllRelationshipMetrics(amount, source) {
  Object.keys(relationshipMetrics).forEach(key => {
    let old = relationshipMetrics[key].current;
    let newVal = Math.min(100, Math.max(0, old + amount));
    relationshipMetrics[key].current = Math.round(newVal);
    relationshipMetrics[key].changes.push({ amount, source, timestamp: new Date().toISOString() });
    if (relationshipMetrics[key].changes.length > 20) relationshipMetrics[key].changes.shift();
  });
  spawnFloatingEmoji('💑 +' + amount + ' all relationship');
}

function addAllPersonalMetrics(amount, source) {
  Object.keys(personalMetrics).forEach(key => {
    let old = personalMetrics[key].current;
    let newVal = Math.min(100, Math.max(0, old + amount));
    personalMetrics[key].current = Math.round(newVal);
    personalMetrics[key].changes.push({ amount, source, timestamp: new Date().toISOString() });
    if (personalMetrics[key].changes.length > 20) personalMetrics[key].changes.shift();
  });
  spawnFloatingEmoji('🧑 +' + amount + ' all personal');
}

function initializeMetrics(intakeData, coupleStats) {
  // Personal metrics from intake
  personalMetrics.empathy.base = calculatePersonalBase(intakeData, coupleStats, 'empathy');
  personalMetrics.selfAwareness.base = calculatePersonalBase(intakeData, coupleStats, 'selfAwareness');
  personalMetrics.communication.base = calculatePersonalBase(intakeData, coupleStats, 'communication');
  personalMetrics.confidence.base = calculatePersonalBase(intakeData, coupleStats, 'confidence');
  personalMetrics.vulnerability.base = calculatePersonalBase(intakeData, coupleStats, 'vulnerability');

  Object.keys(personalMetrics).forEach(key => {
    personalMetrics[key].current = personalMetrics[key].base;
  });

  // Relationship metrics from couple_stats
  if (coupleStats) {
    relationshipMetrics.sharedVision.base = coupleStats.vision || 48;
    relationshipMetrics.friendship.base = coupleStats.friendship || 75;
    relationshipMetrics.trust.base = coupleStats.trust || 60;
    relationshipMetrics.teamwork.base = coupleStats.teamwork || 60;
    relationshipMetrics.communication.base = coupleStats.communication || 60;
    relationshipMetrics.intimacy.base = coupleStats.intimacy || 65;

    Object.keys(relationshipMetrics).forEach(key => {
      relationshipMetrics[key].current = relationshipMetrics[key].base;
    });
  }

  recalculateAllMetrics();
}

function calculatePersonalBase(intake, stats, metric) {
  function r(id, fallback) { var v = Number(intake[id]); return isNaN(v) ? fallback : Math.round(v * 10); }
  function has(id) { return intake[id] && intake[id].length > 20; }
  function cap(v) { return Math.min(95, Math.max(10, Math.round(v))); }

  switch(metric) {
    case 'empathy':
      return cap(r('rate_emotional', 7) * 0.4 + (has('shadow_judge_p') ? 80 : 50) * 0.2 + (has('admire') ? 90 : 60) * 0.2 + (stats.trust || 70) * 0.2);
    case 'selfAwareness':
      return cap((has('shadow_fear') ? 90 : 50) * 0.25 + (has('shadow_truth') ? 90 : 50) * 0.25 + (has('final') ? 90 : 60) * 0.25 + r('rate_emotional', 6) * 0.25);
    case 'communication':
      return cap(r('rate_communication', 7) * 0.6 + (has('energy_leak') ? 80 : 50) * 0.2 + (has('unloved') ? 80 : 50) * 0.2);
    case 'confidence':
      return cap(r('rate_vision', 7) * 0.4 + (has('child_imagine') ? 80 : 50) * 0.3 + (has('vision_10yr') ? 90 : 50) * 0.3);
    case 'vulnerability':
      return cap((has('shadow_truth') ? 90 : 40) * 0.35 + (has('final') ? 90 : 50) * 0.35 + (has('unloved') ? 80 : 50) * 0.3);
    default:
      return 50;
  }
}

// Add this guard at the top level
let isRecalculating = false;
let recalcCount = 0;

// COMPLETE REPLACEMENT of recalculateAllMetrics
function recalculateAllMetrics() {
  // ── PREVENT RECURSION ──
  if (isRecalculating) {
    console.warn('⏳ Recalculation already in progress, skipping...');
    return;
  }
  
  isRecalculating = true;
  recalcCount++;
  
  try {
    let totalXP = getTotalXP();
    let vLevel = getPathLevel('variety');
    let dLevel = getPathLevel('development');
    let cLevel = getPathLevel('consummation');
    let tLevel = getPathLevel('transcendence');
    
    // ── RESET TO BASE ──
    Object.keys(personalMetrics).forEach(key => {
      personalMetrics[key].current = personalMetrics[key].base || 50;
    });
    Object.keys(relationshipMetrics).forEach(key => {
      relationshipMetrics[key].current = relationshipMetrics[key].base || 50;
    });
    
    // ── APPLY DECAY HISTORY ──
    const decayHistory = JSON.parse(localStorage.getItem('lovebase_decay_history') || '{}');
    Object.keys(personalMetrics).forEach(key => {
      if (decayHistory[key]) {
        personalMetrics[key].current = Math.max(20, personalMetrics[key].current - decayHistory[key]);
      }
    });
    Object.keys(relationshipMetrics).forEach(key => {
      if (decayHistory[key]) {
        relationshipMetrics[key].current = Math.max(20, relationshipMetrics[key].current - decayHistory[key]);
      }
    });
    
    // ── PERSONAL PATH BONUSES (REDUCED) ──
    // Variety → Empathy
    if (vLevel >= 3) personalMetrics.empathy.current += Math.min(3, vLevel);
    if (vLevel >= 5) personalMetrics.empathy.current += Math.min(5, vLevel * 1.5);
    if (vLevel >= 7) personalMetrics.empathy.current += Math.min(4, vLevel);
    if (vLevel >= 10) personalMetrics.empathy.current += Math.min(3, vLevel);
    // Variety → Confidence
    if (vLevel >= 4) personalMetrics.confidence.current += Math.min(3, vLevel);
    if (vLevel >= 6) personalMetrics.confidence.current += Math.min(4, vLevel);
    
    // Development → Self-Awareness
    if (dLevel >= 3) personalMetrics.selfAwareness.current += Math.min(3, dLevel);
    if (dLevel >= 5) personalMetrics.selfAwareness.current += Math.min(5, dLevel * 1.5);
    if (dLevel >= 7) personalMetrics.selfAwareness.current += Math.min(4, dLevel);
    if (dLevel >= 10) personalMetrics.selfAwareness.current += Math.min(3, dLevel);
    // Development → Communication
    if (dLevel >= 4) personalMetrics.communication.current += Math.min(3, dLevel);
    if (dLevel >= 6) personalMetrics.communication.current += Math.min(4, dLevel);
    
    // ── RELATIONSHIP PATH BONUSES (REDUCED) ──
    // Variety → Friendship + Intimacy
    if (vLevel >= 3) {
      relationshipMetrics.friendship.current += Math.min(2, vLevel);
      relationshipMetrics.intimacy.current += Math.min(1, vLevel);
    }
    if (vLevel >= 5) {
      relationshipMetrics.friendship.current += Math.min(3, vLevel);
      relationshipMetrics.intimacy.current += Math.min(2, vLevel);
    }
    
    // Development → Trust + Communication
    if (dLevel >= 3) {
      relationshipMetrics.trust.current += Math.min(2, dLevel);
      relationshipMetrics.communication.current += Math.min(2, dLevel);
    }
    if (dLevel >= 5) {
      relationshipMetrics.trust.current += Math.min(3, dLevel);
      relationshipMetrics.communication.current += Math.min(3, dLevel);
    }
    
    // Consummation → Shared Vision + Teamwork
    if (cLevel >= 3) {
      relationshipMetrics.sharedVision.current += Math.min(2, cLevel);
      relationshipMetrics.teamwork.current += Math.min(2, cLevel);
    }
    if (cLevel >= 5) {
      relationshipMetrics.sharedVision.current += Math.min(3, cLevel);
      relationshipMetrics.teamwork.current += Math.min(3, cLevel);
    }
    
    // Transcendence → Shared Vision + Trust + Intimacy
    if (tLevel >= 3) {
      relationshipMetrics.sharedVision.current += Math.min(2, tLevel);
      relationshipMetrics.trust.current += Math.min(1, tLevel);
      relationshipMetrics.intimacy.current += Math.min(1, tLevel);
    }
    if (tLevel >= 5) {
      relationshipMetrics.sharedVision.current += Math.min(3, tLevel);
      relationshipMetrics.trust.current += Math.min(2, tLevel);
      relationshipMetrics.intimacy.current += Math.min(2, tLevel);
    }
    
    // ── MASTERY RANK BONUSES (REDUCED) ──
    let vRank = getPathRank('variety');
    if (vRank >= 1) relationshipMetrics.friendship.current += Math.min(vRank, 5);
    
    let dRank = getPathRank('development');
    if (dRank >= 1) relationshipMetrics.trust.current += Math.min(dRank, 5);
    
    let cRank = getPathRank('consummation');
    if (cRank >= 1) {
      relationshipMetrics.sharedVision.current += Math.min(cRank, 5);
      relationshipMetrics.teamwork.current += Math.min(cRank, 5);
    }
    
    let tRank = getPathRank('transcendence');
    if (tRank >= 1) {
      relationshipMetrics.sharedVision.current += Math.min(tRank, 5);
      relationshipMetrics.trust.current += Math.min(tRank, 5);
      relationshipMetrics.intimacy.current += Math.min(tRank, 5);
    }
    
    // ── CONTINUOUS XP-TO-METRIC CONVERSION (REDUCED) ──
    // Every 30 XP = +0.5 to all metrics, max +8 total
    let xpBonus = Math.min(8, Math.floor(totalXP / 30) * 0.5);
    Object.keys(personalMetrics).forEach(k => personalMetrics[k].current += xpBonus);
    Object.keys(relationshipMetrics).forEach(k => relationshipMetrics[k].current += xpBonus);
    
    // ── XP MILESTONE BONUSES (REDUCED) ──
    let milestoneBonus = 0;
    let xpMilestones = [
      { xp: 100, bonus: 1 }, { xp: 250, bonus: 1.5 }, { xp: 500, bonus: 2 },
      { xp: 750, bonus: 1.5 }, { xp: 1000, bonus: 2 }, { xp: 1500, bonus: 2 }, 
      { xp: 2000, bonus: 3 }, { xp: 3000, bonus: 2 }, { xp: 5000, bonus: 3 }
    ];
    
    xpMilestones.forEach(m => {
      if (totalXP >= m.xp) milestoneBonus += m.bonus;
    });
    milestoneBonus = Math.min(10, milestoneBonus); // Cap at 10 (was 20)
    
    Object.keys(personalMetrics).forEach(k => personalMetrics[k].current += milestoneBonus);
    Object.keys(relationshipMetrics).forEach(k => relationshipMetrics[k].current += milestoneBonus);
    
    // ── TEMPLE STAGE BONUSES (REDUCED) ──
    let stage = computeSanctuaryStage();
    let templeBonus = Math.min(8, stage * 0.8);
    
    if (stage >= 1) {
      relationshipMetrics.trust.current += Math.min(1, templeBonus);
      relationshipMetrics.intimacy.current += Math.min(1, templeBonus);
    }
    if (stage >= 3) {
      relationshipMetrics.friendship.current += Math.min(1.5, templeBonus);
      relationshipMetrics.teamwork.current += Math.min(1.5, templeBonus);
    }
    if (stage >= 5) {
      relationshipMetrics.sharedVision.current += Math.min(2, templeBonus);
      relationshipMetrics.communication.current += Math.min(2, templeBonus);
    }
    if (stage >= 7) {
      Object.keys(relationshipMetrics).forEach(k => 
        relationshipMetrics[k].current += Math.min(2, templeBonus)
      );
    }
    
    // ── ACHIEVEMENT BONUSES (REDUCED) ──
    if (achievements.includes('first_xp')) {
      Object.keys(personalMetrics).forEach(k => personalMetrics[k].current += 0.5);
      Object.keys(relationshipMetrics).forEach(k => relationshipMetrics[k].current += 0.5);
    }
    
    if (achievements.includes('water_master')) {
      personalMetrics.selfAwareness.current += 1.5;
      relationshipMetrics.trust.current += 1;
    }
    
    if (achievements.includes('gate_keeper')) {
      relationshipMetrics.trust.current += 1.5;
      relationshipMetrics.communication.current += 1.5;
      personalMetrics.communication.current += 1.5;
      personalMetrics.selfAwareness.current += 1.5;
    }
    
    if (achievements.includes('xp_520')) {
      Object.keys(personalMetrics).forEach(k => personalMetrics[k].current += 2);
      Object.keys(relationshipMetrics).forEach(k => relationshipMetrics[k].current += 2);
    }
    
    if (achievements.includes('path_variety_5')) {
      personalMetrics.empathy.current += 3;
      relationshipMetrics.friendship.current += 2;
    }
    
    if (achievements.includes('path_development_5')) {
      personalMetrics.selfAwareness.current += 3;
      relationshipMetrics.communication.current += 2;
    }
    
    if (achievements.includes('path_consummation_5')) {
      Object.keys(relationshipMetrics).forEach(k => relationshipMetrics[k].current += 3);
    }
    
    if (achievements.includes('path_transcendence_5')) {
      Object.keys(personalMetrics).forEach(k => personalMetrics[k].current += 4);
      Object.keys(relationshipMetrics).forEach(k => relationshipMetrics[k].current += 4);
    }
    
    // ── STREAK BONUSES (REDUCED) ──
    let streakBonus = Math.min(5, Math.floor(streakData.days / 7));
    
    if (streakData.days >= 7) {
      Object.keys(relationshipMetrics).forEach(k => 
        relationshipMetrics[k].current += streakBonus
      );
      Object.keys(personalMetrics).forEach(k => 
        personalMetrics[k].current += Math.floor(streakBonus / 2)
      );
    }
    
    if (streakData.days >= 30) {
      let extraBonus = Math.min(2, Math.floor((streakData.days - 30) / 30));
      Object.keys(relationshipMetrics).forEach(k => 
        relationshipMetrics[k].current += extraBonus
      );
      Object.keys(personalMetrics).forEach(k => 
        personalMetrics[k].current += Math.floor(extraBonus / 2)
      );
    }
    
    // ── FEEDBACK LOOP (CAPPED AND LIMITED) ──
    // Only run the feedback loop if recalcCount < 3
    // This prevents infinite amplification
    if (recalcCount < 3) {
      // Personal → Relationship (reduced)
      let pComm = Math.min(100, personalMetrics.communication.current);
      let rComm = Math.min(100, relationshipMetrics.communication.current);
      let commBoost = Math.min(6, Math.round(pComm * 0.08)); // was 0.2 → 0.08
      relationshipMetrics.communication.current = Math.min(100, Math.round(rComm + commBoost));
      
      let pEmp = Math.min(100, personalMetrics.empathy.current);
      let trustBoost = Math.min(4, Math.round(pEmp * 0.05)); // was 0.1 → 0.05
      let intimacyBoost = Math.min(4, Math.round(pEmp * 0.05));
      relationshipMetrics.trust.current = Math.min(100, Math.round(relationshipMetrics.trust.current + trustBoost));
      relationshipMetrics.intimacy.current = Math.min(100, Math.round(relationshipMetrics.intimacy.current + intimacyBoost));
      
      let pVul = Math.min(100, personalMetrics.vulnerability.current);
      let vulBoost = Math.min(4, Math.round(pVul * 0.05));
      relationshipMetrics.intimacy.current = Math.min(100, Math.round(relationshipMetrics.intimacy.current + vulBoost));
      
      // Relationship → Personal (reduced)
      let rTrust = Math.min(100, relationshipMetrics.trust.current);
      let confidenceBoost = Math.min(4, Math.round(rTrust * 0.04)); // was 0.08 → 0.04
      personalMetrics.confidence.current = Math.min(100, Math.round(personalMetrics.confidence.current + confidenceBoost));
      
      let rComm2 = Math.min(100, relationshipMetrics.communication.current);
      let pCommBoost = Math.min(4, Math.round(rComm2 * 0.04));
      personalMetrics.communication.current = Math.min(100, Math.round(personalMetrics.communication.current + pCommBoost));
      
      let rIntim = Math.min(100, relationshipMetrics.intimacy.current);
      let vulBoost2 = Math.min(3, Math.round(rIntim * 0.03)); // was 0.06 → 0.03
      personalMetrics.vulnerability.current = Math.min(100, Math.round(personalMetrics.vulnerability.current + vulBoost2));
    } else {
      // Reset the counter after 3 iterations
      recalcCount = 0;
    }
    
    // ── FINAL CAP: All metrics max 90, min 20 ──
    // Setting max to 90 creates room for meaningful growth
    Object.keys(personalMetrics).forEach(key => {
      personalMetrics[key].current = Math.max(20, Math.min(90, Math.round(personalMetrics[key].current)));
    });
    Object.keys(relationshipMetrics).forEach(key => {
      relationshipMetrics[key].current = Math.max(20, Math.min(90, Math.round(relationshipMetrics[key].current)));
    });
    
    // ── UPDATE BABY READINESS ──
    babyReadiness = getBabyReadiness();
    
    // ── UPDATE UI ──
    renderGrowthBars();
    drawWheel();
    renderCoupleExtras();
    updateWeatherProgress();
    drawTree();
    updateHomeScreen();
    updateXpDisplay();
    updateStreakDisplay();
    
    // ── SAVE STATE ──
    if (sbClient && currentRelationshipId && currentUser) {
      saveTempleState();
      savePathProgress();
      safeRelUpdate({ 
        personal_metrics: JSON.stringify(personalMetrics),
        relationship_metrics: JSON.stringify(relationshipMetrics),
        baby_readiness: babyReadiness
      });
    }
    
  } catch(e) {
    console.error('❌ Error in recalculateAllMetrics:', e);
  } finally {
    isRecalculating = false;
  }
}



function resetMetrics() {
  if (!confirm('Reset all metrics to baseline? This cannot be undone.')) return;
  
  // Reset personal metrics
  Object.keys(personalMetrics).forEach(key => {
    personalMetrics[key].current = personalMetrics[key].base || 50;
    personalMetrics[key].changes = [];
  });
  
  // Reset relationship metrics
  Object.keys(relationshipMetrics).forEach(key => {
    relationshipMetrics[key].current = relationshipMetrics[key].base || 50;
    relationshipMetrics[key].changes = [];
  });
  
  // Reset decay history
  localStorage.removeItem('lovebase_decay_history');
  localStorage.removeItem('lovebase_last_decay');
  
  // Reset streak
  streakData.days = 0;
  localStorage.setItem('lovebase_streak', JSON.stringify(streakData));
  
  // Reset achievements
  achievements = [];
  
  recalcCount = 0;
  
  showToast('🔄 Metrics reset to baseline');
  recalculateAllMetrics();
  updateAllUI();
}
  // ADD THIS FUNCTION
// REPLACE the applyMetricDecay function
function applyMetricDecay() {
  const today = new Date().toDateString();
  const lastDecay = localStorage.getItem('lovebase_last_decay');
  
  // Only apply decay once per day
  if (lastDecay === today) {
    return;
  }
  
  console.log('🌙 Applying metric decay...');
  
  // Personal metrics decay slightly when not maintained
  const personalDecay = 2; // 2% per day (increased from 0.5% to be noticeable)
  const relationshipDecay = 1.5; // 1.5% per day (increased from 0.3%)
  
  let decayApplied = false;
  
  Object.keys(personalMetrics).forEach(key => {
    // Don't decay below 20%
    if (personalMetrics[key].current > 20) {
      const oldValue = personalMetrics[key].current;
      personalMetrics[key].current = Math.max(20, Math.round(oldValue - personalDecay));
      if (personalMetrics[key].current < oldValue) {
        decayApplied = true;
      }
    }
  });
  
  Object.keys(relationshipMetrics).forEach(key => {
    // Don't decay below 20%
    if (relationshipMetrics[key].current > 20) {
      const oldValue = relationshipMetrics[key].current;
      relationshipMetrics[key].current = Math.max(20, Math.round(oldValue - relationshipDecay));
      if (relationshipMetrics[key].current < oldValue) {
        decayApplied = true;
      }
    }
  });
  
  // Baby readiness decays slightly
  if (babyReadiness > 20) {
    const oldValue = babyReadiness;
    babyReadiness = Math.max(20, Math.round(oldValue - 1));
    if (babyReadiness < oldValue) {
      decayApplied = true;
    }
  }
  
  localStorage.setItem('lovebase_last_decay', today);
  
  if (decayApplied) {
    // Show a subtle notification
    showToast('🌙 Some metrics have naturally settled. Keep growing!');
    
    // Update UI without resetting everything
    renderGrowthBars();
    drawWheel();
    renderCoupleExtras();
    updateWeatherProgress();
    drawTree();
    updateHomeScreen();
    
    // Save state
    if (sbClient && currentRelationshipId && currentUser) {
      safeRelUpdate({ 
        personal_metrics: JSON.stringify(personalMetrics),
        relationship_metrics: JSON.stringify(relationshipMetrics),
        baby_readiness: babyReadiness
      });
    }
  }
}

// Call this periodically and on app load
function checkDecay() {
  const lastDecay = localStorage.getItem('lovebase_last_decay');
  const today = new Date().toDateString();
  
  // If we haven't decayed today, apply it
  if (lastDecay !== today) {
    applyMetricDecay();
  }
}

// ==================== PATH SYSTEM ====================
const PATH_ACTIVITIES = {
  variety: [
    { id: 'v1', icon: '😊', name: 'Smile Challenge', desc: 'Spend one minute smiling at each other without speaking.', xp: 15, cat: 'Emotional awareness',
      personalBonus: { empathy: 2, confidence: 1 }, relationshipBonus: { friendship: 2, intimacy: 1 } },
    { id: 'v2', icon: '💖', name: 'Daily Appreciation', desc: 'Tell your partner three genuine things you appreciate.', xp: 10, cat: 'Gratitude',
      personalBonus: { empathy: 3, confidence: 1 }, relationshipBonus: { friendship: 3, intimacy: 2 } },
    { id: 'v3', icon: '📝', name: 'Beauty Journal', desc: 'Write five beautiful things you noticed today.', xp: 20, cat: 'Presence',
      personalBonus: { empathy: 2, selfAwareness: 1 }, relationshipBonus: { friendship: 1 } },
    { id: 'v4', icon: '🧘', name: 'Heart Meditation', desc: 'Five-minute heart meditation focusing on love.', xp: 20, cat: 'Presence',
      personalBonus: { empathy: 3, confidence: 2 }, relationshipBonus: { trust: 2 } },
    { id: 'v5', icon: '👁️', name: 'Eye Contact', desc: '30 seconds of silent eye contact, simply present.', xp: 15, cat: 'Presence',
      personalBonus: { empathy: 2, vulnerability: 1 }, relationshipBonus: { intimacy: 3, trust: 2 } },
  ],
  development: [
    { id: 'd1', icon: '🗣️', name: 'Conscious Conversation', desc: '20 minutes without interruptions, truly listening.', xp: 30, cat: 'Communication',
      personalBonus: { communication: 3, empathy: 2 }, relationshipBonus: { communication: 3, trust: 3, sharedVision: 3 } },
    { id: 'd2', icon: '👂', name: 'Active Listening', desc: 'Reflect back what your partner shared.', xp: 25, cat: 'Listening',
      personalBonus: { communication: 3, selfAwareness: 2 }, relationshipBonus: { communication: 3, trust: 2 } },
    { id: 'd3', icon: '💭', name: 'Dream Sharing', desc: 'Share a hope and a fear openly.', xp: 20, cat: 'Vulnerability',
      personalBonus: { vulnerability: 3, selfAwareness: 2 }, relationshipBonus: { intimacy: 3, trust: 2 } },
    { id: 'd4', icon: '🫂', name: 'Guided Meditation', desc: 'Breathe together for 5 minutes.', xp: 30, cat: 'Trust',
      personalBonus: { selfAwareness: 3, empathy: 2 }, relationshipBonus: { trust: 3, intimacy: 2 } },
    { id: 'd5', icon: '🤝', name: 'Conflict Resolution', desc: 'Resolve a disagreement peacefully with active listening.', xp: 40, cat: 'Understanding',
      personalBonus: { communication: 4, vulnerability: 3 }, relationshipBonus: { trust: 4, communication: 4, teamwork: 3 } },
  ],
  consummation: [
    { id: 'c1', icon: '🤝', name: 'Team Challenge', desc: 'Complete a project together (cook, build, plan).', xp: 40, cat: 'Cooperation',
      personalBonus: { communication: 3, confidence: 2 }, relationshipBonus: { teamwork: 4, sharedVision: 3, friendship: 2 } },
    { id: 'c2', icon: '🍳', name: 'Cook Together', desc: 'Prepare a meal together from start to finish.', xp: 20, cat: 'Shared experiences',
      personalBonus: { communication: 2, empathy: 2 }, relationshipBonus: { teamwork: 3, friendship: 2 } },
    { id: 'c3', icon: '🤲', name: 'Volunteer Together', desc: 'Help someone or something together.', xp: 50, cat: 'Service',
      personalBonus: { empathy: 4, vulnerability: 2 }, relationshipBonus: { friendship: 3, teamwork: 3, trust: 3 } },
    { id: 'c4', icon: '🎨', name: 'Create Together', desc: 'Art, music, garden — create something meaningful.', xp: 40, cat: 'Shared experiences',
      personalBonus: { communication: 3, confidence: 3 }, relationshipBonus: { sharedVision: 3, teamwork: 3 } },
    { id: 'c5', icon: '🫂', name: 'Mindful Embrace', desc: 'A mindful hug, present and connected.', xp: 15, cat: 'Compassion',
      personalBonus: { empathy: 2, vulnerability: 2 }, relationshipBonus: { intimacy: 3, trust: 2 } },
  ],
  transcendence: [
    { id: 't1', icon: '🧘', name: 'Meditate Together', desc: '20-minute shared meditation.', xp: 50, cat: 'Meditation',
      personalBonus: { selfAwareness: 4, empathy: 3 }, relationshipBonus: { trust: 3, intimacy: 2 } },
    { id: 't2', icon: '🚶', name: 'Silent Walk', desc: 'Walk in nature without phones or words.', xp: 40, cat: 'Presence',
      personalBonus: { selfAwareness: 3, empathy: 3 }, relationshipBonus: { intimacy: 3, trust: 2 } },
    { id: 't3', icon: '🤲', name: 'Acts of Kindness', desc: 'Help someone anonymously.', xp: 30, cat: 'Service',
      personalBonus: { empathy: 3, vulnerability: 2 }, relationshipBonus: { friendship: 2, trust: 2 } },
    { id: 't4', icon: '📖', name: 'Study Wisdom', desc: 'Read and discuss philosophy or spiritual teachings.', xp: 40, cat: 'Wisdom',
      personalBonus: { selfAwareness: 3, communication: 2 }, relationshipBonus: { sharedVision: 3 } },
    { id: 't5', icon: '🎯', name: 'Vision Board', desc: 'Create a shared vision for the future.', xp: 35, cat: 'Purpose',
      personalBonus: { confidence: 3, empathy: 2 }, relationshipBonus: { sharedVision: 4, trust: 3 } },
  ]
};

const PATH_SKILLS = {
  variety: ['Presence', 'Emotional Awareness', 'Calmness', 'Appreciation'],
  development: ['Trust', 'Deep Listening', 'Compassion', 'Authenticity'],
  consummation: ['Unity', 'Stability', 'Compassion', 'Partnership'],
  transcendence: ['Serenity', 'Higher Awareness', 'Unity', 'Inner Peace']
};

const XP_CATEGORIES = {
  variety: ['Emotional awareness', 'Gratitude', 'Appreciation', 'Presence', 'Confidence', 'Playfulness'],
  development: ['Communication', 'Vulnerability', 'Trust', 'Listening', 'Understanding', 'Acceptance'],
  consummation: ['Commitment', 'Cooperation', 'Shared experiences', 'Service', 'Compassion'],
  transcendence: ['Meditation', 'Service', 'Wisdom', 'Purpose', 'Creativity', 'Spiritual insight']
};

function getPathLevel(pathKey) {
  return pathProgress[pathKey]?.level || 1;
}

function getPathXP(pathKey) {
  return pathProgress[pathKey]?.xp || 0;
}

function getPathXPNeeded(pathKey) {
  let level = getPathLevel(pathKey);
  return level * 25 + 10;
}

function getPathRank(pathKey) {
  let level = getPathLevel(pathKey);
  if (level >= 9) return 4;
  if (level >= 7) return 3;
  if (level >= 5) return 2;
  if (level >= 3) return 1;
  return 0;
}

function getPathBadge(pathKey) {
  let lvl = getPathLevel(pathKey);
  let badges = ['🌸 Heart Awakening', '👁 Mirror of Souls', '❤️ Sacred Partnership', '✨ Innate Light'];
  let idx = ['variety','development','consummation','transcendence'].indexOf(pathKey);
  if (lvl >= 5) return badges[idx] + ' ★';
  if (lvl >= 3) return badges[idx];
  return PATH_LEVELS[pathKey]?.badge || '🌱';
}

// MODIFY addPathXP to cap at level 10
function addPathXP(pathKey, amount) {
  if (!pathProgress[pathKey]) pathProgress[pathKey] = { xp: 0, level: 1, skills: [], rank: 0 };
  
  // Cap at level 10
  if (pathProgress[pathKey].level >= 10) {
    pathProgress[pathKey].xp = Math.min(pathProgress[pathKey].xp + amount, 9999);
    return;
  }
  
  pathProgress[pathKey].xp += amount;
  let needed = getPathXPNeeded(pathKey);
  while (pathProgress[pathKey].xp >= needed && pathProgress[pathKey].level < 10) {
    pathProgress[pathKey].level += 1;
    let skills = PATH_SKILLS[pathKey] || [];
    if (pathProgress[pathKey].level <= skills.length) {
      pathProgress[pathKey].skills.push(skills[pathProgress[pathKey].level - 1]);
    }
    spawnConfetti();
    showToast('🌱 ' + PATH_LEVELS[pathKey]?.name + ' Path Level ' + pathProgress[pathKey].level + '!');
    if (pathProgress[pathKey].level === 5) {
      let achMap = { variety: 'path_variety_5', development: 'path_development_5', consummation: 'path_consummation_5', transcendence: 'path_transcendence_5' };
      unlockAchievement(achMap[pathKey]);
    }
    recalculateAllMetrics();
    needed = getPathXPNeeded(pathKey);
  }
  renderPathsTab();
  savePathProgress();
}

function savePathProgress() {
  if (sbClient && currentRelationshipId && currentUser) {
    safeRelUpdate({ path_progress: JSON.stringify(pathProgress) });
  }
}

function loadPathProgress(data) {
  if (data && data.path_progress) {
    try { pathProgress = JSON.parse(data.path_progress); } catch(e) {}
  }
}

function renderPathsTab() {
  let container = document.getElementById('paths-container');
  if (!container) return;
  let html = '';
  let paths = ['variety', 'development', 'consummation', 'transcendence'];
  let pathNames = { variety: 'Variety', development: 'Development', consummation: 'Consummation', transcendence: 'Transcendence' };
  let pathIcons = { variety: '🌸', development: '👁', consummation: '❤️', transcendence: '✨' };
  let pathColors = { variety: '#ffb7c5', development: '#9b6dff', consummation: '#e87070', transcendence: '#4ecdc4' };
  let pathThemes = {
    variety: 'Learning to Open the Heart · The Smile',
    development: 'Deepening Connection · The Gaze',
    consummation: 'Complete Union of Purpose · The Embrace',
    transcendence: 'Growing Beyond Self · Full Union with Life'
  };

  paths.forEach(key => {
    let p = pathProgress[key] || { xp: 0, level: 1, skills: [], rank: 0 };
    let needed = getPathXPNeeded(key);
    let pct = Math.min(100, Math.round((p.xp / needed) * 100));
    let skills = p.skills || [];
    let allSkills = PATH_SKILLS[key] || [];
    let cats = XP_CATEGORIES[key] || [];
    let activities = PATH_ACTIVITIES[key] || [];
    let rank = getPathRank(key);
    let rankName = MASTERY_RANKS[rank] || 'Explorer';

    html += '<div class="card" style="border-left: 3px solid ' + pathColors[key] + ';">';
    html += '<div class="card-title">' + pathIcons[key] + ' ' + pathNames[key] + ' Path <span class="path-badge l' + (key === 'variety' ? '1' : key === 'development' ? '2' : key === 'consummation' ? '3' : '4') + '">' + getPathBadge(key) + '</span> <span class="mastery-rank">' + rankName + '</span></div>';
    html += '<div style="font-size:11px;color:var(--text2);font-style:italic;margin-bottom:8px;">' + pathThemes[key] + '</div>';
    html += '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;"><span>Level ' + p.level + ' / 10</span><span>' + p.xp + ' / ' + needed + ' XP</span></div>';
    html += '<div style="height:6px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden;margin-bottom:10px;"><div style="height:100%;width:' + pct + '%;background:' + pathColors[key] + ';border-radius:3px;"></div></div>';

    html += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;">';
    allSkills.forEach(s => {
      let unlocked = skills.includes(s);
      html += '<span class="skill-pill" style="' + (unlocked ? 'color:' + pathColors[key] + ';border-color:' + pathColors[key] + ';' : 'opacity:0.4;') + '">' + (unlocked ? '✓' : '🔒') + ' ' + s + '</span>';
    });
    html += '</div>';

    html += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px;">';
    cats.forEach(c => {
      html += '<span class="xp-cat">' + c + '</span>';
    });
    html += '</div>';

    html += '<div style="font-size:11px;color:var(--text3);margin-bottom:6px;">Activities</div>';
    activities.forEach(a => {
      let slot = currentMySlot || 'A';
      let key2 = slot + '_path_' + a.id;
      let done = completedTasks && completedTasks[key2];
      let personalDisplay = '';
      let relationshipDisplay = '';
      if (a.personalBonus) {
        let parts = Object.entries(a.personalBonus).map(([m, v]) => m.charAt(0).toUpperCase() + m.slice(1) + ' +' + v);
        personalDisplay = ' <span style="font-size:9px;color:var(--teal);">🧑 ' + parts.join(' ') + '</span>';
      }
      if (a.relationshipBonus) {
        let parts = Object.entries(a.relationshipBonus).map(([m, v]) => {
          let labels = { sharedVision: 'Vision', friendship: 'Friendship', trust: 'Trust', teamwork: 'Teamwork', communication: 'Comm', intimacy: 'Intimacy' };
          return (labels[m] || m) + ' +' + v;
        });
        relationshipDisplay = ' <span style="font-size:9px;color:var(--gold);">💑 ' + parts.join(' ') + '</span>';
      }
      html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--glass2);border-radius:10px;margin-bottom:4px;border:0.5px solid ' + (done ? pathColors[key] : 'var(--border)') + ';">';
      html += '<span style="font-size:16px;">' + a.icon + '</span>';
      html += '<div style="flex:1;font-size:12px;color:var(--text1);">' + a.name + ' <span style="font-size:10px;color:var(--text2);">(' + a.cat + ')</span>' + personalDisplay + relationshipDisplay + '</div>';
      html += '<span style="font-size:10px;color:var(--gold);">+' + a.xp + ' XP</span>';
      html += '<button onclick="completePathActivity(\'' + key + '\',\'' + a.id + '\',' + a.xp + ',this)" style="padding:2px 10px;border-radius:20px;background:' + (done ? 'rgba(78,205,196,0.15)' : 'rgba(201,168,76,0.1)') + ';border:0.5px solid ' + (done ? 'var(--teal)' : 'var(--gold)') + ';color:' + (done ? 'var(--teal)' : 'var(--gold)') + ';font-size:10px;cursor:pointer;">' + (done ? '✓ Done' : 'Start') + '</button>';
      html += '</div>';
    });
    html += '</div>';
  });

  container.innerHTML = html;
}

// REPLACE the completePathActivity function
async function completePathActivity(pathKey, activityId, xp, btn) {
  let slot = currentMySlot || 'A';
  let key = slot + '_path_' + activityId;
  if (completedTasks && completedTasks[key]) {
    showToast('Already completed today ✓');
    return;
  }
  if (!completedTasks) completedTasks = {};
  completedTasks[key] = true;
  if (btn) {
    btn.textContent = '✓ Done';
    btn.style.background = 'rgba(78,205,196,0.15)';
    btn.style.borderColor = 'var(--teal)';
    btn.style.color = 'var(--teal)';
  }

  let activity = PATH_ACTIVITIES[pathKey]?.find(a => a.id === activityId);
  if (activity) {
    if (activity.personalBonus) {
      Object.entries(activity.personalBonus).forEach(([metric, bonus]) => {
        addPersonalMetric(metric, bonus, 'activity: ' + activity.name);
      });
    }
    if (activity.relationshipBonus) {
      Object.entries(activity.relationshipBonus).forEach(([metric, bonus]) => {
        addRelationshipMetric(metric, bonus, 'activity: ' + activity.name);
      });
    }
    showToast('📈 Personal & Relationship metrics updated!');
  }

  // REMOVED: await awardXP(xp); - Path activities should only give path XP
  // The path XP will feed back into metrics via the path bonus system
  addPathXP(pathKey, xp);
  spawnFloatingEmoji('🌱+' + xp + ' path XP');

  if (sbClient && currentRelationshipId && currentUser) {
    await safeRelUpdate({ completed_tasks: completedTasks });
  }
  renderPathsTab();
  savePathProgress();
  recalculateAllMetrics();
}

// ==================== PATH POPUP ====================
let pendingPathActivity = null;

function openPathPopup(pathKey, activityId, xp, btn) {
  let activity = PATH_ACTIVITIES[pathKey]?.find(a => a.id === activityId);
  if (!activity) return;
  
  // Store for confirmation
  pendingPathActivity = { pathKey, activityId, xp, btn };
  
  // Fill popup with activity data
  document.getElementById('popup-icon').textContent = activity.icon || '🌟';
  document.getElementById('popup-title').textContent = activity.name;
  document.getElementById('popup-desc').textContent = activity.desc || 'Complete this practice together.';
  document.getElementById('popup-xp').textContent = activity.xp || 0;
  document.getElementById('popup-practice').innerHTML = '✦ ' + (activity.practice || 'Do this practice with your partner.') + ' ✦';
  
  // Personal bonuses
  let personalHtml = '';
  if (activity.personalBonus) {
    let labels = { empathy: 'Empathy', selfAwareness: 'Self-Awareness', communication: 'Communication', confidence: 'Confidence', vulnerability: 'Vulnerability' };
    Object.entries(activity.personalBonus).forEach(([key, val]) => {
      personalHtml += `<span style="background:rgba(78,205,196,0.15); padding:4px 12px; border-radius:20px; border:0.5px solid rgba(78,205,196,0.3);">${labels[key] || key} +${val}</span>`;
    });
  }
  document.getElementById('popup-personal').innerHTML = personalHtml || 'No personal bonuses';
  
  // Relationship bonuses
  let relHtml = '';
  if (activity.relationshipBonus) {
    let labels = { sharedVision: 'Shared Vision', friendship: 'Friendship', trust: 'Trust', teamwork: 'Teamwork', communication: 'Communication', intimacy: 'Intimacy' };
    Object.entries(activity.relationshipBonus).forEach(([key, val]) => {
      relHtml += `<span style="background:rgba(201,168,76,0.15); padding:4px 12px; border-radius:20px; border:0.5px solid rgba(201,168,76,0.3);">${labels[key] || key} +${val}</span>`;
    });
  }
  document.getElementById('popup-relationship').innerHTML = relHtml || 'No relationship bonuses';
  
  // Show popup
  document.getElementById('path-popup').style.display = 'flex';
  document.getElementById('path-popup').style.animation = 'fadeIn 0.3s ease';
}

function closePathPopup() {
  document.getElementById('path-popup').style.display = 'none';
  pendingPathActivity = null;
}

function confirmPathActivity() {
  if (!pendingPathActivity) return;
  
  const { pathKey, activityId, xp, btn } = pendingPathActivity;
  
  // Call the original function
  completePathActivity(pathKey, activityId, xp, btn);
  
  // Close popup
  closePathPopup();
}

// Make popup functions global
window.openPathPopup = openPathPopup;
window.closePathPopup = closePathPopup;
window.confirmPathActivity = confirmPathActivity;
// ==================== INIT ====================
document.getElementById('connect-btn').onclick = () => {
  const url = "https://eohdfgvebqdxstwdildk.supabase.co";
  const key = "sb_publishable_OpCJbA6slz0upKAtwFAiWg_fQTpukHY";
  sbClient = window.supabase.createClient(url, key);
  document.getElementById('setup-screen').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'block';
};

document.getElementById('demo-btn').onclick = () => { startDemoMode(); };

document.getElementById('login-btn').onclick = async () => {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl = document.getElementById('auth-error-msg');
  errEl.textContent = '';
  if (!email || !password) { errEl.textContent = 'Enter email and password.'; return; }
  const btn = document.getElementById('login-btn');
  btn.disabled = true; btn.innerHTML = 'Signing in…';
  const { data, error } = await sbClient.auth.signInWithPassword({ email, password });
  btn.disabled = false; btn.innerHTML = 'Sign In';
  if (error) { errEl.textContent = error.message; return; }
  currentUser = data.user;
  setTimeout(loadUserRelationship, 0);
};

document.getElementById('signup-btn').onclick = async () => {
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  if (!email || !password || password.length < 6) { alert('Password must be at least 6 characters'); return; }
  const { data, error } = await sbClient.auth.signUp({ email, password });
  if (error) { alert('Signup error: ' + error.message); return; }
  currentUser = data.user;
  showRelationshipSetup();
};

document.getElementById('create-relation-btn').onclick = async () => {
  const nameA = document.getElementById('rel-name-a').value;
  const nameB = document.getElementById('rel-name-b').value;
  if (!nameA || !nameB) { alert('Enter both names'); return; }
  const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  const relationId = 'rel_' + Date.now();
  const relationData = {
    id: relationId, invite_code: inviteCode,
    partner_a_id: currentUser.id, partner_a_name: nameA,
    partner_b_id: null, partner_b_name: nameB, partner_b_joined: false,
    couple_stats: { trust: 60, intimacy: 65, communication: 60, vision: 48, friendship: 75, teamwork: 60 },
    baby_readiness: 70,
    temple_state: JSON.stringify(templeState),
    path_progress: JSON.stringify(pathProgress),
    personal_metrics: JSON.stringify(personalMetrics),
    relationship_metrics: JSON.stringify(relationshipMetrics),
    created_at: new Date().toISOString()
  };
  const { error } = await sbClient.from('relationships').insert([relationData]);
  if (error) { alert('Error: ' + error.message); return; }
  currentRelationshipId = relationId;
  document.getElementById('invite-code-display').innerText = inviteCode;
  showWaitingScreen();
  sbClient.channel(`relation_${relationId}`).on('postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'relationships', filter: `id=eq.${relationId}` },
    (payload) => { if (payload.new.partner_b_joined) startMainApp(payload.new); }
  ).subscribe();
};

document.getElementById('join-relation-btn').onclick = async () => {
  const code = document.getElementById('join-code').value.toUpperCase();
  const { data, error } = await sbClient.from('relationships').select('*').eq('invite_code', code).single();
  if (error || !data) { alert('Invalid invite code'); return; }
  const updateData = { partner_b_id: currentUser.id, partner_b_joined: true };
  const { error: updateError } = await sbClient.from('relationships').update(updateData).eq('id', data.id);
  if (updateError) { alert('Error joining: ' + updateError.message); return; }
  currentRelationshipId = data.id;
  startMainApp({ ...data, ...updateData });
};

document.getElementById('copy-code-btn').onclick = () => {
  const code = document.getElementById('invite-code-display').innerText;
  navigator.clipboard.writeText(code);
  showToast('Code copied! Share with your partner.');
};

// ==================== CORE ====================
async function loadUserRelationship() {
  const { data, error } = await sbClient.from('relationships')
    .select('*').or(`partner_a_id.eq.${currentUser.id},partner_b_id.eq.${currentUser.id}`);
  if (error) { console.error(error); return; }
  if (!data || data.length === 0) { showRelationshipSetup(); return; }
  const relation = data[0];
  currentRelationshipId = relation.id;
  if (relation.partner_b_joined || relation.partner_b_id) {
    startMainApp(relation);
  } else if (relation.partner_a_id === currentUser.id && !relation.partner_b_joined) {
    document.getElementById('invite-code-display').innerText = relation.invite_code;
    showWaitingScreen();
    sbClient.channel(`relation_${relation.id}`).on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'relationships', filter: `id=eq.${relation.id}` },
      (payload) => { if (payload.new.partner_b_joined) startMainApp(payload.new); }
    ).subscribe();
  } else {
    startMainApp(relation);
  }
}

function showRelationshipSetup() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('relationship-setup-screen').style.display = 'block';
}
function showWaitingScreen() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('relationship-setup-screen').style.display = 'none';
  document.getElementById('waiting-screen').style.display = 'block';
}

function startMainApp(relation) {
  if (!relation) return;
  var slot = currentUser && relation.partner_a_id === currentUser.id ? 'A' : 'B';
  currentMySlot = slot;
  var intakeDone = slot === 'A' ? relation.intake_a_done : relation.intake_b_done;
  if (!intakeDone) { startIntake(relation, slot); return; }

  if (relation.temple_state) {
    try { templeState = JSON.parse(relation.temple_state); } catch(e) {}
  }
  if (relation.path_progress) {
    try { pathProgress = JSON.parse(relation.path_progress); } catch(e) {}
  }
  if (relation.personal_metrics) {
    try {
      let saved = JSON.parse(relation.personal_metrics);
      Object.keys(saved).forEach(key => {
        if (personalMetrics[key]) {
          personalMetrics[key].base = saved[key].base || personalMetrics[key].base;
          personalMetrics[key].current = saved[key].current || personalMetrics[key].current;
          personalMetrics[key].changes = saved[key].changes || [];
        }
      });
    } catch(e) {}
  }
  if (relation.relationship_metrics) {
    try {
      let saved = JSON.parse(relation.relationship_metrics);
      Object.keys(saved).forEach(key => {
        if (relationshipMetrics[key]) {
          relationshipMetrics[key].base = saved[key].base || relationshipMetrics[key].base;
          relationshipMetrics[key].current = saved[key].current || relationshipMetrics[key].current;
          relationshipMetrics[key].changes = saved[key].changes || [];
        }
      });
    } catch(e) {}
  }

  var slotData = slot === 'A' ? relation.intake_a : relation.intake_b;
  if (slotData) {
    initializeMetrics(slotData || {}, relation.couple_stats || {});
  }

  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('relationship-setup-screen').style.display = 'none';
  document.getElementById('waiting-screen').style.display = 'none';
  document.getElementById('main-app').style.display = 'block';
  document.getElementById('bottom-nav').style.display = 'flex';
  liveData = relation;
  xpData = {A: relation.xp_a || 0, B: relation.xp_b || 0};
  completedTasks = relation.completed_tasks || {};
  document.getElementById('couple-names').innerHTML = `${relation.partner_a_name} & ${relation.partner_b_name || '...'}`;
  setupRealtimeForRelationship();
  updateAllUI();
  startAnimations();
  renderTempleTab();
  drawWheel();
  loadStreak();
  checkAchievements();
  renderPathsTab();
  // REMOVED: recalculateAllMetrics(); - already called in updateAllUI
  checkDailyLogin();
  checkDecay();
  checkWaterDecay();

}

function startDemoMode() {
  document.getElementById('setup-screen').style.display = 'none';
  document.getElementById('main-app').style.display = 'block';
  document.getElementById('bottom-nav').style.display = 'flex';
  currentMySlot = 'A';

  let demoIntake = {
    rate_emotional: 7, rate_communication: 6, rate_vision: 8,
    rate_trust: 7, rate_friendship: 8, rate_teamwork: 7, rate_sexual: 6,
    shadow_judge_p: 'Sometimes I judge when...',
    shadow_fear: 'I fear being misunderstood...',
    shadow_truth: 'I haven\'t said that I...',
    final: 'If my partner understood one thing...',
    admire: 'I admire how you...',
    unloved: 'I feel unloved when...',
    child_imagine: 'I imagine being a parent who...',
    vision_10yr: 'In 10 years, we wake up...'
  };

  let demoStats = { trust: 60, intimacy: 65, communication: 60, vision: 48, friendship: 75, teamwork: 60 };

  liveData = {
    partner_a_name: 'Ana', partner_b_name: 'Marco',
    couple_stats: demoStats,
    baby_readiness: 70,
    xp_a: 120, xp_b: 80,
    temple_state: JSON.stringify(templeState),
    path_progress: JSON.stringify(pathProgress),
    intake_a: demoIntake,
    intake_a_done: true
  };

  initializeMetrics(demoIntake, demoStats);

  xpData = {A: 120, B: 80};
  completedTasks = {p1: true, c1: true};
  updateAllUI();
  startAnimations();
  renderTempleTab();
  drawWheel();
  loadStreak();
  checkAchievements();
  renderPathsTab();
  recalculateAllMetrics();
  checkDailyLogin();
}

function setupRealtimeForRelationship() {
  if (!sbClient) return;
  realtimeChannels.forEach(ch => sbClient.removeChannel(ch));
  realtimeChannels = [];
  const relChannel = safeSubscribe(sbClient.channel(`rel_${currentRelationshipId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'relationships', filter: `id=eq.${currentRelationshipId}` },
      (payload) => {
        if (payload?.new) {
          liveData = payload.new;
          xpData = {A: liveData.xp_a||0, B: liveData.xp_b||0};
          completedTasks = liveData.completed_tasks||{};
          if (liveData.temple_state) {
            try { templeState = JSON.parse(liveData.temple_state); } catch(e) {}
          }
          if (liveData.path_progress) {
            try { pathProgress = JSON.parse(liveData.path_progress); } catch(e) {}
          }
          if (liveData.personal_metrics) {
            try {
              let saved = JSON.parse(liveData.personal_metrics);
              Object.keys(saved).forEach(key => {
                if (personalMetrics[key]) personalMetrics[key].current = saved[key].current || personalMetrics[key].current;
              });
            } catch(e) {}
          }
          if (liveData.relationship_metrics) {
            try {
              let saved = JSON.parse(liveData.relationship_metrics);
              Object.keys(saved).forEach(key => {
                if (relationshipMetrics[key]) relationshipMetrics[key].current = saved[key].current || relationshipMetrics[key].current;
              });
            } catch(e) {}
          }
          updateAllUI();
          renderTempleTab();
          drawWheel();
          renderPathsTab();
          recalculateAllMetrics();
        }
      }
    ).subscribe()
  );
  const msgChannel = safeSubscribe(sbClient.channel(`messages_${currentRelationshipId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `relationship_id=eq.${currentRelationshipId}` },
      () => renderJournal()
    ).subscribe()
  );
}

async function safeRelUpdate(updates) {
  if (!sbClient || !currentRelationshipId || !currentUser) return false;
  try {
    var res = await sbClient.from('relationships').update(updates)
      .eq('id', currentRelationshipId).or('partner_a_id.eq.' + currentUser.id + ',partner_b_id.eq.' + currentUser.id);
    if (res.error) { console.error('safeRelUpdate error:', res.error); return false; }
    return true;
  } catch(e) { console.error('safeRelUpdate exception:', e); return false; }
}

// ==================== UI ====================
function updateAllUI() {
  updateWeatherProgress(); 
  drawTree(); 
  renderGrowthBars(); 
  
  if (typeof renderPrivateEntries === 'function') {
    renderPrivateEntries(); 
  }
  
  renderJournal();
  updatePartnerDisplay(); 
  updateXpDisplay();
  
  let baby = getBabyReadiness();
  const babyEl = document.getElementById('baby-pct');
  if (babyEl) babyEl.innerHTML = baby + '%';
  
  let avgGrowth = Math.round((getPersonalMetric('empathy') + getPersonalMetric('selfAwareness') + getPersonalMetric('communication')) / 3);
  const statGrowth = document.getElementById('stat-growth');
  const statHarmony = document.getElementById('stat-harmony');
  const statVision = document.getElementById('stat-vision');
  
  if (statGrowth) statGrowth.innerHTML = avgGrowth + '%';
  if (statHarmony) statHarmony.innerHTML = getRelationshipMetric('trust') + '%';
  if (statVision) statVision.innerHTML = getRelationshipMetric('sharedVision') + '%';
  
  updateHomeScreen(); 
  renderCoupleExtras();
  // REMOVED: recalculateAllMetrics() - this causes recursion
}

function updateWeatherProgress() {
  const el = document.getElementById('weather-progress');
  if (!el) return;
  const metrics = [
    { label: 'Shared Vision', value: getRelationshipMetric('sharedVision') },
    { label: 'Friendship', value: getRelationshipMetric('friendship') },
    { label: 'Trust', value: getRelationshipMetric('trust') },
    { label: 'Teamwork', value: getRelationshipMetric('teamwork') },
    { label: 'Communication', value: getRelationshipMetric('communication') },
    { label: 'Intimacy', value: getRelationshipMetric('intimacy') }
  ];
  el.innerHTML = metrics.map(m =>
    `<div class="progress-row"><div class="progress-label">${m.label}</div><div class="progress-track"><div class="progress-fill" style="width:${m.value}%"></div></div><div>${m.value}%</div></div>`
  ).join('');
}

function drawTree() {
  const canvas = document.getElementById('tree-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth;
  canvas.height = 220;
  const w = canvas.width, h = canvas.height, cx = w/2, base = h-15;
  ctx.clearRect(0, 0, w, h);
  ctx.beginPath(); ctx.moveTo(cx, base); ctx.lineTo(cx, base-80); ctx.strokeStyle = '#8B5A2B'; ctx.lineWidth = 8; ctx.stroke();
  for(let i=0;i<6;i++){ ctx.beginPath(); ctx.moveTo(cx, base); ctx.lineTo(cx-15+i*5, base+12); ctx.stroke(); }
  const trust = getRelationshipMetric('trust');
  const comm = getRelationshipMetric('communication');
  const growth = (trust + comm) / 2;
  for(let i=0;i<8+Math.floor(growth/10);i++){ let x=cx-20+Math.random()*40, y=base-70+Math.random()*50; ctx.beginPath(); ctx.arc(x,y,6,0,Math.PI*2); ctx.fillStyle='#3c9e6d'; ctx.fill(); }
  const intimacy = getRelationshipMetric('intimacy');
  for(let i=0;i<4+Math.floor(intimacy/20);i++){ let x=cx-20+Math.random()*40, y=base-70+Math.random()*50; ctx.beginPath(); ctx.arc(x,y,5,0,Math.PI*2); ctx.fillStyle='#ffb7c5'; ctx.fill(); }
  // Add baby readiness as a small fruit
  let baby = getBabyReadiness();
  if (baby > 70) {
    let fruitCount = Math.floor((baby - 70) / 5);
    for (let i = 0; i < Math.min(fruitCount, 5); i++) {
      let x = cx - 15 + i * 8 + Math.random() * 4;
      let y = base - 50 + Math.random() * 20;
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ff6b6b'; ctx.fill();
    }
  }
}

function renderGrowthBars() {
  const el = document.getElementById('growth-bars');
  if(!el) return;

  const personal = [
    { key: 'empathy', label: 'Empathy', value: getPersonalMetric('empathy') },
    { key: 'selfAwareness', label: 'Self-Awareness', value: getPersonalMetric('selfAwareness') },
    { key: 'communication', label: 'Communication', value: getPersonalMetric('communication') },
    { key: 'confidence', label: 'Confidence', value: getPersonalMetric('confidence') },
    { key: 'vulnerability', label: 'Vulnerability', value: getPersonalMetric('vulnerability') }
  ];

  const relationship = [
    { key: 'sharedVision', label: 'Shared Vision', value: getRelationshipMetric('sharedVision') },
    { key: 'friendship', label: 'Friendship', value: getRelationshipMetric('friendship') },
    { key: 'trust', label: 'Trust', value: getRelationshipMetric('trust') },
    { key: 'teamwork', label: 'Teamwork', value: getRelationshipMetric('teamwork') },
    { key: 'communication', label: 'Communication', value: getRelationshipMetric('communication') },
    { key: 'intimacy', label: 'Intimacy', value: getRelationshipMetric('intimacy') }
  ];

  let html = '<div style="font-size:10px;color:var(--text3);margin-bottom:8px;letter-spacing:1px;">🧑 Personal Growth</div>';
  personal.forEach(m => {
    let change = personalMetrics[m.key]?.changes?.slice(-1)[0];
    let changeHtml = change && change.amount > 0 ? ' <span class="metric-change">+'+change.amount+'</span>' : '';
    html += `<div class="progress-row"><div class="progress-label">${m.label}</div><div class="progress-track"><div class="progress-fill teal" style="width:${m.value}%"></div></div><div>${m.value}%${changeHtml}</div></div>`;
  });

  html += '<div style="font-size:10px;color:var(--text3);margin:12px 0 8px;letter-spacing:1px;">💑 Relationship Growth</div>';
  relationship.forEach(m => {
    let change = relationshipMetrics[m.key]?.changes?.slice(-1)[0];
    let changeHtml = change && change.amount > 0 ? ' <span class="metric-change">+'+change.amount+'</span>' : '';
    html += `<div class="progress-row"><div class="progress-label">${m.label}</div><div class="progress-track"><div class="progress-fill" style="width:${m.value}%;background:linear-gradient(90deg,var(--gold),var(--gold2));"></div></div><div>${m.value}%${changeHtml}</div></div>`;
  });

  // Baby Readiness
  let baby = getBabyReadiness();
  html += `<div style="margin-top:12px;padding:10px;background:var(--glass2);border-radius:12px;border:0.5px solid rgba(78,205,196,0.2);">
    <div style="font-size:10px;color:var(--text3);letter-spacing:1px;">👶 Baby Readiness</div>
    <div class="progress-row"><div class="progress-label">Readiness</div><div class="progress-track"><div class="progress-fill" style="width:${baby}%;background:linear-gradient(90deg,#ff6b6b,var(--teal));"></div></div><div>${baby}%</div></div>
  </div>`;

  el.innerHTML = html;
}

async function renderJournal() {
  const el = document.getElementById('journal-entries');
  if(!el || !currentRelationshipId) return;
  if(!sbClient) {
    el.innerHTML = '<div style="color:var(--text3);text-align:center;padding:20px;">Connect to Supabase first.</div>';
    return;
  }
  const { data, error } = await sbClient.from('messages').select('*').eq('relationship_id', currentRelationshipId).order('created_at', { ascending: false }).limit(50);
  if(error){ console.error(error); el.innerHTML = '<div style="color:var(--rose);padding:16px;">Error loading messages.</div>'; return; }
  el.innerHTML = data.map(msg => `
    <div class="journal-entry">
      <div style="font-size:10px;color:var(--text3);margin-bottom:4px;">${new Date(msg.created_at).toLocaleString()}</div>
      <div style="font-size:13px;color:var(--text1);line-height:1.6;font-family:var(--font);font-style:italic;">"${escHtml(msg.body)}"</div>
      <div style="font-size:11px;color:var(--text2);margin-top:6px;">— ${escHtml(msg.author_name || 'Partner')}</div>
    </div>
  `).join('');
}

function updatePartnerDisplay() {
  var slot = currentMySlot || 'A';
  var av = document.getElementById('growth-avatar');
  var nm = document.getElementById('growth-name');
  if(av) av.textContent = slot === 'A' ? '🌸' : '🌿';
  if(nm) nm.textContent = slot === 'A' ? (liveData.partner_a_name || 'You') : (liveData.partner_b_name || 'You');
  updateXpDisplay();
}

  // ADD THIS FUNCTION - It was missing
function renderPrivateEntries() {
  // This is a placeholder - the actual loading happens in loadPrivateNotes()
  // But we need it for updateAllUI to work
  if (!document.getElementById('private-entries')) return;
  // If we're on the private tab, load the notes
  if (document.getElementById('tab-private') && document.getElementById('tab-private').style.display !== 'none') {
    loadPrivateNotes();
  }
}
// REPLACE the addJournalEntry function
async function addJournalEntry() {
  const input = document.getElementById('journal-input');
  if(!input.value.trim()) return;
  if(!sbClient) { showToast('Connect to Supabase first.'); return; }
  var slot = currentMySlot || 'A';
  const authorName = slot === 'A' ? (liveData.partner_a_name || 'Partner A') : (liveData.partner_b_name || 'Partner B');
  const { error } = await sbClient.from('messages').insert({
    relationship_id: currentRelationshipId,
    sender_id: currentUser?.id || null,
    author_name: authorName,
    body: input.value.trim()
  });
  if(error){ alert(error.message); return; }
  input.value = '';
  renderJournal();
  showToast('📖 Entry shared!');

  // ADDED: XP for journaling
  await awardXP(5); // Daily journal XP
  addPathXP('variety', 3); // Contributes to emotional awareness
  addPathXP('development', 2); // Contributes to communication

  addPersonalMetric('selfAwareness', 1, 'journal entry');
  addRelationshipMetric('communication', 1, 'journal entry');
  addRelationshipMetric('friendship', 1, 'journal entry');
  recalculateAllMetrics();
}
// ADD THIS FUNCTION
function checkDailyLogin() {
  const today = new Date().toDateString();
  const lastLogin = localStorage.getItem('lovebase_last_login');

  if (lastLogin !== today) {
    // First login of the day
    awardXP(5); // Daily login bonus
    addPathXP('variety', 2);
    spawnFloatingEmoji('☀️ +5 XP');
    localStorage.setItem('lovebase_last_login', today);
    showToast('☀️ Daily login bonus! +5 XP');
  }
}



function switchGrowthTab(tab, btn) {
  ['radar','practices','couples','wheel','private','temple','paths'].forEach(t => {
    var el=document.getElementById('tab-'+t); if(el) el.style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  if(tab === 'wheel') drawWheel();
  if(tab === 'temple') renderTempleTab();
  if(tab === 'private') loadPrivateNotes();
  if(tab === 'practices') renderPractices();
  if(tab === 'couples') renderCouplesTasks();
  if(tab === 'paths') renderPathsTab();
}

function switchScreen(screen, btn) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const _t = document.getElementById('screen-' + screen);
  if (_t) _t.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  if (screen === 'journal') renderJournal();
  if (screen === 'couple') renderCoupleExtras();
  if (screen === 'growth') { renderGrowthBars(); renderPractices(); renderCouplesTasks(); renderTempleTab(); drawWheel(); renderPathsTab(); recalculateAllMetrics(); }
  if (screen === 'cosmic') updateCosmicScreen();
  if (screen === 'home') updateHomeScreen();
}

function startAnimations() {
  drawTree();
  setInterval(drawTree, 5000);
  const updateDate = () => {
    const now = new Date();
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dateEl = document.getElementById('hdr-date');
    if(dateEl) dateEl.textContent = `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]}`;
  };
  updateDate();
  setInterval(updateDate, 60000);
  startGalaxy();
}

// ==================== XP & STREAK ====================
function getTotalXP() { return (xpData[currentMySlot === 'A' ? 'A' : 'B'] || 0); }

function updateXpDisplay() {
  var el = document.getElementById('growth-xp');
  if(!el) return;
  el.textContent = '✨ ' + getTotalXP() + ' XP';
}

async function awardXP(amount) {
  var p = currentMySlot || 'A';
  xpData[p] = (xpData[p]||0) + amount;
  updateXpDisplay();
  spawnFloatingEmoji('+'+amount+' ✨');
  showToast(AFFIRMATIONS[Math.floor(Math.random() * AFFIRMATIONS.length)]);
  updateStreak();
  if(sbClient && currentRelationshipId && currentUser) {
    var field = p === 'A' ? 'xp_a' : 'xp_b';
    var upd = {}; upd[field] = xpData[p];
    await safeRelUpdate(upd);
  }
  renderTempleTab();
  drawWheel();
  checkAchievements();
  renderPathsTab();
  recalculateAllMetrics();
}

function loadStreak() {
  try {
    var saved = localStorage.getItem('lovebase_streak');
    if (saved) { streakData = JSON.parse(saved); }
    updateStreakDisplay();
  } catch(e) {}
}

// MODIFY the updateStreak function to add decay awareness
function updateStreak() {
  var today = new Date().toDateString();
  
  // Check if we missed a day
  var yesterday = new Date(); 
  yesterday.setDate(yesterday.getDate() - 1);
  var dayBefore = new Date();
  dayBefore.setDate(dayBefore.getDate() - 2);
  
  if (streakData.lastDate === today) return;
  
  if (streakData.lastDate === yesterday.toDateString()) {
    // Consecutive day
    streakData.days += 1;
  } else if (streakData.lastDate !== today) {
    // Missed a day - reset streak
    if (streakData.lastDate !== dayBefore.toDateString()) {
      // More than 1 day gap
      streakData.days = 1;
      showToast('🔥 Streak reset! Starting fresh.');
    } else {
      // Only 1 day gap - keep streak but warn
      streakData.days = streakData.days; // Keep same
      showToast('⚠️ Missed a day! Streak preserved but decay applied.');
    }
  }
  
  streakData.lastDate = today;
  try { localStorage.setItem('lovebase_streak', JSON.stringify(streakData)); } catch(e) {}
  updateStreakDisplay();
  
  // Achievement and bonus logic...
  if (streakData.days >= 3) unlockAchievement('streak_3');
  if (streakData.days >= 7) {
    addAllRelationshipMetrics(2, 'streak: 7 days');
    addAllPersonalMetrics(1, 'streak: 7 days');
    recalculateAllMetrics();
  }
  if (streakData.days >= 30) {
    addAllRelationshipMetrics(4, 'streak: 30 days');
    addAllPersonalMetrics(2, 'streak: 30 days');
    recalculateAllMetrics();
  }
}

  // ADD water decay tracking
function checkWaterDecay() {
  const today = new Date().toDateString();
  const lastWater = localStorage.getItem('lovebase_last_water');
  
  if (lastWater !== today) {
    // Water glasses reset daily (user needs to log water each day)
    // But keep the water_master achievement if already earned
    if (templeState.waterGlasses > 0 && !achievements.includes('water_master')) {
      templeState.waterGlasses = 0;
      showToast('💧 Water reset for today! Log your water intake.');
    }
    localStorage.setItem('lovebase_last_water', today);
  }
}

function updateStreakDisplay() {
  var el = document.getElementById('streak-badge');
  if(el) el.textContent = '🔥 ' + streakData.days + ' day streak';
}

// ==================== ACHIEVEMENTS ====================
function checkAchievements() {
  var xp = getTotalXP();
  // Check if any achievements were already unlocked (don't re-unlock)
  ACHIEVEMENTS.forEach(a => {
    if (xp >= a.xpReq && !achievements.includes(a.id)) {
      unlockAchievement(a.id);
    }
  });
  
  // Water Master - check current water glasses, not cumulative
  if (templeState.waterGlasses >= 10 && !achievements.includes('water_master')) {
    unlockAchievement('water_master');
  }
  
  // Gate Keeper - check completed gates
  if (Object.keys(templeState.completedGates).length > 0 && !achievements.includes('gate_keeper')) {
    unlockAchievement('gate_keeper');
  }
  
  // Path achievements
  const pathKeys = ['variety', 'development', 'consummation', 'transcendence'];
  const pathAchMap = { variety: 'path_variety_5', development: 'path_development_5', consummation: 'path_consummation_5', transcendence: 'path_transcendence_5' };
  
  pathKeys.forEach(key => {
    const level = getPathLevel(key);
    const achId = pathAchMap[key];
    if (level >= 5 && !achievements.includes(achId)) {
      unlockAchievement(achId);
    }
  });
}

function unlockAchievement(id) {
  if (achievements.includes(id)) return;
  achievements.push(id);
  var a = ACHIEVEMENTS.find(x => x.id === id);
  if (!a) return;
  document.getElementById('achievement-icon').textContent = a.icon;
  document.getElementById('achievement-title').textContent = a.title;
  document.getElementById('achievement-desc').textContent = a.desc;
  document.getElementById('achievement-unlock').classList.add('show');
  spawnConfetti();
  showToast('🏆 ' + a.title + ' unlocked!');
  clearTimeout(window._achTimeout);
  window._achTimeout = setTimeout(closeAchievement, 5000);
  recalculateAllMetrics();
}

// Make it globally accessible
window.closeAchievement = function() {
  document.getElementById('achievement-unlock').classList.remove('show');
};

// Also make other functions global if they're used in onclick
window.unlockAchievement = unlockAchievement;
window.spawnConfetti = spawnConfetti;
window.showToast = showToast;

function spawnConfetti() {
  var colors = ['#c9a84c', '#e8c96a', '#4ecdc4', '#9b6dff', '#e87070', '#ffb7c5'];
  for (var i = 0; i < 40; i++) {
    var el = document.createElement('div');
    el.className = 'confetti-piece';
    el.style.left = Math.random() * 100 + '%';
    el.style.width = (4 + Math.random() * 8) + 'px';
    el.style.height = (4 + Math.random() * 8) + 'px';
    el.style.background = colors[Math.floor(Math.random() * colors.length)];
    el.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    el.style.animationDuration = (1.5 + Math.random() * 2) + 's';
    el.style.animationDelay = Math.random() * 0.5 + 's';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }
}

function spawnFloatingEmoji(text) {
  var el = document.createElement('div');
  el.className = 'floating-emoji';
  el.textContent = text;
  el.style.left = (20 + Math.random() * 60) + '%';
  el.style.top = (20 + Math.random() * 30) + '%';
  el.style.fontSize = (20 + Math.random() * 24) + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

// ==================== TOAST ====================
function showToast(msg) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(window._toastT);
  window._toastT = setTimeout(function(){ el.classList.remove('show'); }, 2800);
}

// ==================== HELPER ====================
function escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function fmtTime(s){return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}

// ==================== TIMER MODAL ====================
function openTimerModal(icon, label, seconds) {
  timerTotalSeconds = seconds;
  timerSeconds = 0;
  timerRunning = false;
  clearInterval(timerInterval);
  document.getElementById('timer-modal-icon').textContent = icon || '⏱';
  document.getElementById('timer-modal-label').textContent = label || 'Practice';
  document.getElementById('timer-modal-display').textContent = fmtTime(seconds);
  document.getElementById('timer-modal-display').className = 'timer-display';
  var circle = document.getElementById('timer-circle');
  circle.style.setProperty('--progress', '0%');
  var btn = document.getElementById('timer-modal-start');
  btn.textContent = '▶ Start';
  btn.className = 'timer-btn';
  document.getElementById('timer-modal').classList.add('show');
}

function toggleTimerModal() {
  var btn = document.getElementById('timer-modal-start');
  var display = document.getElementById('timer-modal-display');
  var circle = document.getElementById('timer-circle');
  if (!timerRunning) {
    timerRunning = true;
    btn.textContent = '⏸ Pause';
    btn.className = 'timer-btn pause';
    timerInterval = setInterval(function() {
      timerSeconds++;
      var remaining = Math.max(0, timerTotalSeconds - timerSeconds);
      display.textContent = fmtTime(remaining);
      var progress = (timerSeconds / timerTotalSeconds) * 100;
      circle.style.setProperty('--progress', progress + '%');
      if (remaining <= 10) {
        display.className = 'timer-display warning';
      } else {
        display.className = 'timer-display';
      }
      if (remaining === 0) {
        clearInterval(timerInterval);
        timerRunning = false;
        btn.textContent = '✓ Done!';
        btn.className = 'timer-btn';
        display.textContent = '🎉';
        display.className = 'timer-display';
        spawnConfetti();
        showToast('🎉 Practice complete! Amazing work!');
        awardXP(10);
        addPersonalMetric('selfAwareness', 2, 'timer practice');
        addRelationshipMetric('trust', 1, 'timer practice');
        recalculateAllMetrics();
      }
    }, 1000);
  } else {
    clearInterval(timerInterval);
    timerRunning = false;
    btn.textContent = '▶ Resume';
    btn.className = 'timer-btn';
  }
}

function closeTimerModal() {
  clearInterval(timerInterval);
  timerRunning = false;
  document.getElementById('timer-modal').classList.remove('show');
}

document.getElementById('timer-modal').addEventListener('click', function(e) {
  if (e.target === this) closeTimerModal();
});

// ==================== SHADOW MODAL ====================
function openShadowModal() {
  var el = document.getElementById('shadow-questions');
  if(!el) return;
  el.innerHTML = SHADOW_QS.map(q =>
    '<div style="margin-bottom:14px;"><div style="font-size:12px;color:var(--text2);font-style:italic;margin-bottom:6px;">"' + escHtml(q.label) + '"</div>' +
    '<textarea class="journal-textarea" id="shadow-' + q.id + '" placeholder="Courage required…" style="height:70px;"></textarea></div>'
  ).join('');
  document.getElementById('shadow-modal').classList.add('show');
}

function closeShadowModal() {
  document.getElementById('shadow-modal').classList.remove('show');
}

async function saveShadowWork() {
  var answers = {};
  SHADOW_QS.forEach(q => {
    var el = document.getElementById('shadow-' + q.id);
    answers[q.id] = el ? el.value.trim() : '';
  });
  if(!Object.values(answers).some(v => v.length > 0)) {
    showToast('Write something in at least one field');
    return;
  }
  if(sbClient && currentUser && currentRelationshipId) {
    await sbClient.from('private_notes').insert({
      user_id: currentUser.id,
      relationship_id: currentRelationshipId,
      body: JSON.stringify(answers),
      shared: false,
      note_type: 'shadow'
    });
  }
  closeShadowModal();
  showToast('🌑 Shadow work saved privately.');
  await awardXP(3);
  spawnFloatingEmoji('🌑');
  addPathXP('development', 20);
  addPersonalMetric('selfAwareness', 3, 'shadow work');
  addPersonalMetric('vulnerability', 3, 'shadow work');
  addRelationshipMetric('trust', 3, 'shadow work');
  addRelationshipMetric('intimacy', 3, 'shadow work');
  recalculateAllMetrics();
}

document.getElementById('shadow-modal').addEventListener('click', function(e) {
  if (e.target === this) closeShadowModal();
});

// ==================== TASKS ====================
const PRACTICES = [
  {id:'p1',icon:'🌬️',title:'Box Breathing', dur:'4 min', xp:20, desc:'Inhale 4s → hold 4s → exhale 4s → hold 4s.', timerSec:240 },
  {id:'p2',icon:'🙏', title:'Gratitude Scan', dur:'5 min', xp:20, desc:'Speak 5 specific things you are grateful for.', timerSec:300 },
  {id:'p3',icon:'🧘', title:'Body Check-In', dur:'3 min', xp:15, desc:'Scan from feet to crown. Name tension without changing it.', timerSec:180 },
  {id:'p4',icon:'✍️', title:'Morning Pages', dur:'10 min', xp:30, desc:'10 minutes of unfiltered stream of consciousness.', timerSec:600 },
];
const COUPLE_TASKS = [
  {id:'c1',icon:'👁️',title:'Eye Gazing', dur:'3 min', xp:50, desc:'Sit facing each other. Breathe. No words.', timerSec:180 },
  {id:'c2',icon:'🤲',title:'Hand Holding', dur:'5 min', xp:40, desc:'Hold hands in silence. Feel the warmth.', timerSec:300 },
  {id:'c3',icon:'💬',title:'Two Truths', dur:'10 min', xp:60, desc:'Share two truths and one feeling. No advice.', timerSec:600 },
  {id:'c4',icon:'🙏',title:'Gratitude Out Loud', dur:'5 min', xp:50, desc:'Three specific things you love about your partner.', timerSec:300 },
];

function taskCardHTML(t, isCouple){
  var slot=currentMySlot||'A'; var key=slot+'_'+t.id; var done=completedTasks && completedTasks[key];
  let bonusText = '';
  if (isCouple) {
    bonusText = ' <span style="font-size:9px;color:var(--gold);">💑 All Relationship +2</span>';
  } else {
    bonusText = ' <span style="font-size:9px;color:var(--teal);">🧑 +Self-Awareness +1</span>';
  }
  return '<div style="background:var(--glass);border:0.5px solid var(--border);border-radius:20px;padding:16px;margin-bottom:10px;">'
    +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">'
    +'<div style="font-size:24px;flex-shrink:0;">'+t.icon+'</div>'
    +'<div style="font-size:14px;font-weight:600;color:var(--text1);">'+t.title+'</div>'
    +'<div style="font-size:11px;color:var(--gold);margin-left:auto;white-space:nowrap;">'+t.dur+'</div></div>'
    +'<div style="font-size:13px;color:var(--text2);line-height:1.5;margin-bottom:10px;">'+t.desc+bonusText+'</div>'
    +'<div style="display:flex;gap:6px;flex-wrap:wrap;">'
    +'<div onclick="markTaskComplete(\''+t.id+'\','+t.xp+','+(isCouple?'true':'false')+',this)" style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;background:'+(done?'rgba(78,205,196,0.2)':'rgba(78,205,196,0.1)')+';border:0.5px solid var(--teal);border-radius:8px;color:var(--teal);font-size:12px;cursor:pointer;opacity:'+(done?'0.7':'1')+';">'+(done?'✓ Completed':'Complete (+'+t.xp+' XP)')+'</div>'
    +(t.timerSec?'<div onclick="openTimerModal(\''+t.icon+'\',\''+t.title+'\','+t.timerSec+')" style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;background:rgba(201,168,76,0.1);border:0.5px solid var(--gold);border-radius:8px;color:var(--gold);font-size:12px;cursor:pointer;">⏱ Timer</div>':'')
    +'</div></div>';
}

async function markTaskComplete(taskId, xp, isCouple, btnEl) {
  if(!completedTasks) completedTasks = {};
  var slot = currentMySlot || 'A';
  var key = slot + '_' + taskId;
  if(completedTasks[key]) { showToast('Already completed today ✓'); return; }
  completedTasks[key] = true;
  if(btnEl){ btnEl.innerHTML = '✓ Completed'; btnEl.style.opacity = '0.7'; }
  await awardXP(xp);

  if (taskId.startsWith('p')) {
    addPathXP('variety', Math.floor(xp * 0.5));
    addPersonalMetric('selfAwareness', 1, 'practice: ' + taskId);
    addPersonalMetric('confidence', 1, 'practice: ' + taskId);
  }
  if (taskId.startsWith('c') || isCouple) {
    addPathXP('consummation', Math.floor(xp * 0.5));
    // All relationship metrics get a boost from couple tasks
    addAllRelationshipMetrics(2, 'couple task: ' + taskId);
    addPersonalMetric('communication', 2, 'couple task: ' + taskId);
    addPersonalMetric('empathy', 1, 'couple task: ' + taskId);
  }

  if(sbClient && currentRelationshipId && currentUser) {
    await safeRelUpdate({ completed_tasks: completedTasks });
  }
  spawnConfetti();
  spawnFloatingEmoji('🎉');
  recalculateAllMetrics();
}

function renderPractices(){var el=document.getElementById('practices-list');if(el)el.innerHTML=PRACTICES.map(t => taskCardHTML(t, false)).join('');}
function renderCouplesTasks(){var el=document.getElementById('couples-list');if(el)el.innerHTML=COUPLE_TASKS.map(t => taskCardHTML(t, true)).join('');}

// ==================== TEMPLE ====================
function renderTempleTab() {
  var container = document.getElementById('temple-container');
  if (!container) return;
  var unlocked = getTotalXP() >= 520;
  var xpNeeded = Math.max(0, 520 - getTotalXP());
  if (!unlocked) {
    container.innerHTML = '<div class="card" style="text-align:center;padding:30px 20px;">' +
      '<div style="font-size:48px;margin-bottom:16px;">🌿</div>' +
      '<div style="font-size:16px;color:var(--gold2);font-family:var(--font);margin-bottom:8px;">Temple of the Body</div>' +
      '<div style="font-size:13px;color:var(--text2);line-height:1.6;">' +
      'This sacred space unlocks at <strong style="color:var(--gold);">520 XP</strong>.<br>' +
      'You need <strong style="color:var(--gold);">' + xpNeeded + ' more XP</strong> to enter.' +
      '</div>' +
      '<div style="margin-top:14px;font-size:11px;color:var(--text3);">Complete daily practices and couple exercises to earn XP.</div>' +
      '</div>';
    return;
  }
  var stage = computeSanctuaryStage();
  var stageNames = ['Empty Courtyard','Flowers Bloom','Birds Arrive','Trees Mature','Fountain Flows','Fireflies Appear','Butterflies Visit','Temple Illuminated','Living Sanctuary'];
  var q = getDailyQuestion();
  templeState.dailyQuestion = q;

  var wisdomIdx = new Date().getDate() % WATER_WISDOM.length;
  var wisdom = WATER_WISDOM[wisdomIdx];

  container.innerHTML =
    '<div class="card"><div class="card-title">🌿 Sanctuary · ' + stageNames[stage] + ' (Stage ' + (stage + 1) + '/9)</div>' +
    '<canvas id="sanctuary-canvas" style="width:100%;height:180px;display:block;margin:0 0 12px;border-radius:16px;background:rgba(10,14,26,0.6);"></canvas>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">' + templeFoundationMini() + '</div></div>' +
    '<div class="card"><div class="card-title">Three Rivers</div>' + riverBalanceHTML() + '</div>' +
    '<div class="card"><div class="card-title">Today\'s Reflection</div>' +
    '<div style="text-align:center;font-size:28px;margin:6px 0;">' + q.icon + '</div>' +
    '<div style="font-size:14px;color:var(--gold2);text-align:center;line-height:1.6;font-style:italic;margin-bottom:10px;">"' + q.q + '"</div>' +
    '<textarea id="temple-reflection-input" style="width:100%;background:rgba(255,255,255,0.05);border:0.5px solid var(--border);border-radius:16px;padding:12px;color:var(--text1);font-size:13px;resize:none;height:70px;font-family:inherit;line-height:1.6;" placeholder="Write freely…"></textarea>' +
    '<button onclick="saveTempleReflection()" style="width:100%;padding:10px;border-radius:40px;background:linear-gradient(135deg,rgba(201,168,76,0.2),rgba(201,168,76,0.05));border:0.5px solid var(--gold);color:var(--gold);font-size:13px;font-weight:600;cursor:pointer;margin-top:8px;">Save Reflection ✦</button>' +
    '<div style="margin-top:12px;font-size:11px;color:var(--text3);text-align:center;font-style:italic;">Click a question below to change the reflection</div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px;">' +
    THOUGHT_QUESTIONS.slice(0, 5).map(q2 =>
      '<div onclick="setTempleQuestion(\'' + q2.id + '\')" style="font-size:10px;padding:4px 10px;border-radius:20px;border:0.5px solid var(--border);background:var(--glass);color:var(--text2);cursor:pointer;">' + q2.icon + ' ' + q2.cat + '</div>'
    ).join('') +
    '</div></div>' +
    '<div class="card"><div class="card-title">💧 Sacred Waters</div>' +
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">' +
    '<div style="flex:1;height:8px;background:rgba(255,255,255,0.08);border-radius:4px;overflow:hidden;">' +
    '<div id="temple-water-bar" style="width:' + Math.min(100, Math.round(templeState.waterGlasses / templeState.waterGoal * 100)) + '%;height:100%;background:linear-gradient(90deg,#4ecdc4,#80e8e2);border-radius:4px;transition:width 0.5s ease;"></div></div>' +
    '<div style="font-size:13px;color:var(--teal);font-weight:600;min-width:50px;text-align:right;" id="temple-water-count">' + templeState.waterGlasses + '/' + templeState.waterGoal + '💧</div></div>' +
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;">' +
    ['💧','🍵','🫧','🌿'].map(i => '<div onclick="logWater()" style="text-align:center;background:var(--glass2);border-radius:10px;padding:8px 4px;cursor:pointer;border:0.5px solid var(--border);font-size:18px;">' + i + '</div>').join('') +
    '</div>' +
    '<div class="water-wisdom-card">' +
    '<div style="font-size:20px;text-align:center;margin-bottom:4px;">' + wisdom.icon + '</div>' +
    '<div style="font-size:13px;font-weight:600;color:var(--teal);text-align:center;margin-bottom:4px;">' + wisdom.title + '</div>' +
    '<div style="font-size:12px;color:var(--text2);line-height:1.6;text-align:center;font-style:italic;">' + wisdom.body + '</div>' +
    '</div></div>' +
    '<div class="card"><div class="card-title">☀️🌙 Breath</div>' +
    BREATHING_SESSIONS.map(s => '<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:0.5px solid var(--border);">' +
      '<div style="font-size:22px;">' + s.icon + '</div>' +
      '<div style="flex:1;"><div style="font-size:13px;font-weight:600;color:var(--text1);">' + s.name + '</div>' +
      '<div style="font-size:10px;color:var(--text2);">' + s.purpose + '</div></div>' +
      '<div style="font-size:11px;color:' + s.color + ';background:rgba(255,255,255,0.05);padding:2px 10px;border-radius:20px;">' + (templeState.breathSessions[s.id]||0) + 'x</div>' +
      '<button onclick="startBreathSession(\'' + s.id + '\')" style="padding:4px 12px;border-radius:20px;background:rgba(201,168,76,0.1);border:0.5px solid ' + s.color + ';color:' + s.color + ';font-size:11px;cursor:pointer;">Start</button>' +
      '<button onclick="openTimerModal(\'' + s.icon + '\',\'' + s.name + '\',' + s.duration + ')" style="padding:4px 10px;border-radius:20px;background:var(--glass);border:0.5px solid var(--border);color:var(--text2);font-size:11px;cursor:pointer;">⏱</button>' +
      '</div>').join('') +
    '</div>' +
    '<div class="card"><div class="card-title">Nine Gates</div>' +
    NINE_GATES.slice(0, 5).map(g => {
      var done = !!templeState.completedGates[g.id];
      return '<div class="temple-gate-card' + (done ? ' done' : '') + '" style="padding:10px 14px;margin-bottom:6px;">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">' +
        '<div style="font-size:18px;">' + g.icon + '</div>' +
        '<div style="font-size:13px;font-weight:600;color:var(--text1);">Gate of ' + g.name + '</div>' +
        (done ? '<div style="font-size:10px;color:var(--teal);margin-left:auto;">✓</div>' : '') +
        '</div>' +
        '<div style="font-size:11px;color:var(--text2);font-style:italic;line-height:1.4;">"' + g.q + '"</div>' +
        '<div style="font-size:11px;color:var(--text3);padding:6px 8px;background:rgba(255,255,255,0.03);border-radius:8px;margin:4px 0;">🌿 ' + g.practice + '</div>' +
        '<button onclick="markGateComplete(\'' + g.id + '\',this)" style="margin-top:4px;padding:4px 12px;border-radius:20px;background:' + (done ? 'rgba(78,205,196,0.15)' : 'rgba(201,168,76,0.1)') + ';border:0.5px solid ' + (done ? 'var(--teal)' : 'var(--gold)') + ';color:' + (done ? 'var(--teal)' : 'var(--gold)') + ';font-size:11px;cursor:pointer;">' + (done ? '✓ Completed' : 'Practice') + '</button>' +
        '</div>';
    }).join('') + '</div>' +
    '<div class="card"><div class="card-title">Temple Practices</div>' +
    TEMPLE_PRACTICES.slice(0, 4).map(t => {
      var slot = currentMySlot || 'A';
      var key = slot + '_tp_' + t.id;
      var done = completedTasks && completedTasks[key];
      return '<div class="temple-practice-card" style="padding:12px;margin-bottom:8px;">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">' +
        '<div style="font-size:24px;flex-shrink:0;">' + t.icon + '</div>' +
        '<div style="font-size:14px;font-weight:600;color:var(--text1);">' + t.title + '</div>' +
        '<div style="font-size:11px;color:var(--gold);margin-left:auto;">' + t.dur + '</div></div>' +
        '<div style="font-size:12px;color:var(--text2);line-height:1.4;margin-bottom:10px;">' + t.desc + '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
        '<div onclick="markTemplePractice(\'' + t.id + '\',' + t.xp + ',this)" style="display:inline-flex;align-items:center;gap:4px;padding:4px 12px;background:' + (done ? 'rgba(78,205,196,0.2)' : 'rgba(78,205,196,0.1)') + ';border:0.5px solid var(--teal);border-radius:8px;color:var(--teal);font-size:11px;cursor:pointer;opacity:' + (done ? '0.7' : '1') + ';">' + (done ? '✓ Completed' : 'Complete (+' + t.xp + ' XP)') + '</div>' +
        (t.timerSec ? '<div onclick="openTimerModal(\'' + t.icon + '\',\'' + t.title + '\',' + t.timerSec + ')" style="display:inline-flex;align-items:center;gap:4px;padding:4px 12px;background:rgba(201,168,76,0.1);border:0.5px solid var(--gold);border-radius:8px;color:var(--gold);font-size:11px;cursor:pointer;">⏱ Timer</div>' : '') +
        '</div></div>';
    }).join('') + '</div>';
  setTimeout(drawSanctuaryCanvas, 100);
  startSanctuaryAnimation();
}

function startSanctuaryAnimation() {
  if (sanctuaryRAF) cancelAnimationFrame(sanctuaryRAF);
  function frame() {
    drawSanctuaryCanvas();
    sanctuaryRAF = requestAnimationFrame(frame);
  }
  frame();
}

function computeSanctuaryStage() {
  var total = 0;
  var p = templeState.personal;
  total += (p.sleep + p.hydration + p.movement + p.breath + p.nourishment + p.presence) / 6;
  total += templeState.waterGlasses / templeState.waterGoal;
  total += (templeState.breathSessions.solar + templeState.breathSessions.lunar + templeState.breathSessions.harmony) / 10;
  total += Object.keys(templeState.completedGates).length / 9;
  return Math.min(9, Math.floor(total * 3));
}

function templeFoundationMini() {
  var foundations = [
    { icon:'🌙', label:'Sleep', key:'sleep' },
    { icon:'💧', label:'Hydration', key:'hydration' },
    { icon:'🚶', label:'Movement', key:'movement' },
    { icon:'🫁', label:'Breath', key:'breath' },
    { icon:'🥗', label:'Nourishment', key:'nourishment' },
    { icon:'🧘', label:'Presence', key:'presence' },
  ];
  return foundations.map(f => {
    var v = templeState.personal[f.key] || 0;
    return '<div onclick="openFoundationModal(\'' + f.key + '\',\'' + f.label + '\',\'' + f.icon + '\')" style="background:var(--glass2);border-radius:12px;padding:8px 4px;text-align:center;cursor:pointer;border:0.5px solid var(--border);">' +
      '<div style="font-size:18px;">' + f.icon + '</div>' +
      '<div style="font-size:9px;color:var(--text2);margin:2px 0;">' + f.label + '</div>' +
      '<div style="height:3px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden;">' +
      '<div style="width:' + v + '%;height:100%;background:linear-gradient(90deg,var(--gold),var(--gold2));border-radius:2px;"></div></div>' +
      '<div style="font-size:10px;color:var(--gold);margin-top:2px;">' + v + '%</div></div>';
  }).join('');
}

function riverBalanceHTML() {
  var rivers = [
    { icon:'🌙', name:'Moon River', color:'var(--purple)', desc:'Emotion · Intuition', key:'moon' },
    { icon:'☀️', name:'Sun River', color:'var(--gold)', desc:'Action · Courage', key:'sun' },
    { icon:'🌿', name:'Central River', color:'var(--teal)', desc:'Balance · Mindfulness', key:'central' },
  ];
  return rivers.map(r => {
    var v = templeState.riverBalance[r.key] || 50;
    return '<div style="margin-bottom:10px;">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">' +
      '<span style="font-size:16px;">' + r.icon + '</span>' +
      '<span style="font-size:12px;color:var(--text1);">' + r.name + '</span>' +
      '<span style="font-size:10px;color:var(--text2);margin-left:4px;">' + r.desc + '</span>' +
      '<span style="margin-left:auto;font-size:11px;color:' + r.color + ';">' + v + '%</span></div>' +
      '<div style="height:6px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden;">' +
      '<div style="width:' + v + '%;height:100%;background:' + r.color + ';border-radius:3px;transition:width 0.5s ease;"></div></div></div>';
  }).join('');
}

function drawSanctuaryCanvas() {
  var canvas = document.getElementById('sanctuary-canvas');
  if (!canvas) return;
  var dpr = window.devicePixelRatio || 1;
  var W = canvas.offsetWidth || 340;
  var H = canvas.offsetHeight || 180;
  canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  var ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  var stage = computeSanctuaryStage();
  var hydration = templeState.waterGlasses;
  var skyTop = stage < 4 ? '#0a0e1a' : (stage < 7 ? '#0f1830' : '#111630');
  var skyBot = stage < 4 ? '#141c30' : (stage < 7 ? '#1a2040' : '#1e2850');
  var sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, skyTop); sky.addColorStop(1, skyBot);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  var starOpacity = Math.max(0.05, 0.4 - stage * 0.04);
  for (var i = 0; i < 30; i++) {
    var sx = (i * 137.5) % W, sy = (i * 89.3) % (H * 0.5);
    ctx.beginPath(); ctx.arc(sx, sy, 0.6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(245,223,160,' + starOpacity + ')'; ctx.fill();
  }
  ctx.fillStyle = 'rgba(20,32,20,0.9)';
  ctx.beginPath(); ctx.moveTo(0, H * 0.65); ctx.bezierCurveTo(W * 0.3, H * 0.62, W * 0.7, H * 0.68, W, H * 0.64); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
  var riverFill = Math.min(1, hydration / 8);
  if (riverFill > 0) {
    var riverY = H * 0.72, riverH = 8 + riverFill * 16, riverAlpha = 0.3 + riverFill * 0.5;
    var riverCol = riverFill > 0.7 ? 'rgba(78,205,196,' : 'rgba(60,150,200,';
    var rg = ctx.createLinearGradient(0, riverY, W, riverY);
    rg.addColorStop(0, riverCol + riverAlpha + ')');
    rg.addColorStop(0.5, riverCol + (riverAlpha + 0.15) + ')');
    rg.addColorStop(1, riverCol + riverAlpha + ')');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.moveTo(0, riverY);
    ctx.bezierCurveTo(W * 0.25, riverY - 3, W * 0.75, riverY + 3, W, riverY);
    ctx.lineTo(W, riverY + riverH);
    ctx.bezierCurveTo(W * 0.75, riverY + riverH - 2, W * 0.25, riverY + riverH + 2, 0, riverY + riverH);
    ctx.fill();
  }
  var templeAlpha = 0.15 + stage * 0.08;
  var cx = W / 2;
  ctx.fillStyle = 'rgba(180,160,100,' + Math.min(0.9, templeAlpha) + ')';
  ctx.fillRect(cx - 25, H * 0.42, 50, H * 0.25);
  ctx.beginPath(); ctx.moveTo(cx - 32, H * 0.42); ctx.lineTo(cx, H * 0.28); ctx.lineTo(cx + 32, H * 0.42); ctx.closePath();
  ctx.fillStyle = 'rgba(160,140,80,' + Math.min(0.9, templeAlpha) + ')'; ctx.fill();
  ctx.fillStyle = 'rgba(60,40,20,' + Math.min(0.9, templeAlpha + 0.2) + ')';
  ctx.beginPath(); ctx.arc(cx, H * 0.58, 7, Math.PI, 0); ctx.fillRect(cx - 7, H * 0.56, 14, 6); ctx.fill();
  if (stage >= 1) {
    var candleAlpha = Math.min(1, stage * 0.2);
    var candlePositions = [[cx - 40, H * 0.62], [cx + 40, H * 0.62]];
    candlePositions.slice(0, Math.min(2, stage + 1)).forEach(pos => {
      ctx.fillStyle = 'rgba(220,200,140,' + candleAlpha + ')';
      ctx.fillRect(pos[0] - 2, pos[1] - 8, 4, 8);
      var flame = ctx.createRadialGradient(pos[0], pos[1] - 10, 0, pos[0], pos[1] - 10, 5);
      flame.addColorStop(0, 'rgba(255,200,80,0.8)'); flame.addColorStop(1, 'rgba(255,120,0,0)');
      ctx.fillStyle = flame; ctx.beginPath(); ctx.arc(pos[0], pos[1] - 10, 5, 0, Math.PI * 2); ctx.fill();
    });
  }
  if (stage >= 2) {
    var flowerColors = ['rgba(232,112,112,0.7)','rgba(201,168,76,0.7)','rgba(155,109,255,0.6)','rgba(78,205,196,0.6)'];
    for (var f = 0; f < Math.min(8, stage * 2); f++) {
      var fx = W * (0.02 + (f * 91.3) % 0.95), fy = H * (0.70 + (f * 37.1) % 0.10);
      ctx.beginPath(); ctx.arc(fx, fy, 2 + (f % 2), 0, Math.PI * 2);
      ctx.fillStyle = flowerColors[f % flowerColors.length]; ctx.fill();
    }
  }
  if (stage >= 3) {
    for (var t = 0; t < Math.min(3, Math.floor(stage * 0.5)); t++) {
      var tx = W * (0.08 + t * 0.35), ty = H * 0.62, th = 30 + t * 10;
      ctx.fillStyle = 'rgba(90,60,30,0.8)';
      ctx.fillRect(tx - 2, ty - th, 4, th);
      ctx.beginPath(); ctx.arc(tx, ty - th, 14 + t * 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(40,110,50,' + (0.5 + stage * 0.04) + ')'; ctx.fill();
    }
  }
}

function getDailyQuestion() {
  var now = new Date();
  var seed = now.getFullYear() * 1000 + now.getMonth() * 31 + now.getDate();
  return THOUGHT_QUESTIONS[seed % THOUGHT_QUESTIONS.length];
}

function setTempleQuestion(qId) {
  var q = THOUGHT_QUESTIONS.find(q => q.id === qId);
  if (!q) return;
  templeState.dailyQuestion = q;
  var qEl = document.querySelector('#temple-container .card:nth-child(3) div[style*="font-size:14px"]');
  if (qEl) qEl.textContent = '"' + q.q + '"';
  var iconEl = document.querySelector('#temple-container .card:nth-child(3) div[style*="font-size:28px"]');
  if (iconEl) iconEl.textContent = q.icon;
  var inputEl = document.getElementById('temple-reflection-input');
  if (inputEl) inputEl.value = '';
  showToast(q.icon + ' Question selected. Sit with it.');
}

window.logWater = function() {
  templeState.waterGlasses = Math.min(templeState.waterGoal + 2, templeState.waterGlasses + 1);
  var bar = document.getElementById('temple-water-bar');
  var cnt = document.getElementById('temple-water-count');
  var pct = Math.min(100, Math.round(templeState.waterGlasses / templeState.waterGoal * 100));
  if (bar) bar.style.width = pct + '%';
  if (cnt) cnt.textContent = templeState.waterGlasses + '/' + templeState.waterGoal + '💧';
  awardXP(5);
  spawnFloatingEmoji('💧');
  showToast('💧 Water logged! Nourishing your temple.');
  updateRiverBalance('moon', 2);
  updateRiverBalance('central', 1);
  renderTempleTab();
  saveTempleState();
  if (templeState.waterGlasses >= 10) checkAchievements();
  addPathXP('variety', 3);
  addPersonalMetric('selfAwareness', 1, 'water logging');
  addRelationshipMetric('trust', 1, 'water logging');
  recalculateAllMetrics();
};

window.startBreathSession = function(type) {
  templeState.breathSessions[type] = (templeState.breathSessions[type] || 0) + 1;
  awardXP(20);
  var name = type === 'solar' ? 'Solar Breath' : type === 'lunar' ? 'Lunar Breath' : 'Harmony Breath';
  showToast('🌬️ ' + name + ' — settling into stillness…');
  updateRiverBalance(type === 'solar' ? 'sun' : type === 'lunar' ? 'moon' : 'central', 5);
  renderTempleTab();
  saveTempleState();
  spawnFloatingEmoji('🌬️');
  addPathXP('transcendence', 10);
  addPersonalMetric('selfAwareness', 2, 'breath: ' + name);
  addRelationshipMetric('trust', 2, 'breath: ' + name);
  addRelationshipMetric('intimacy', 1, 'breath: ' + name);
  recalculateAllMetrics();
};

window.markGateComplete = function(gateId, btn) {
  templeState.completedGates[gateId] = true;
  if (btn) { btn.textContent = '✓ Completed'; btn.style.background = 'rgba(78,205,196,0.15)'; btn.style.borderColor = 'var(--teal)'; btn.style.color = 'var(--teal)'; }
  awardXP(25);
  var gate = NINE_GATES.find(g => g.id === gateId);
  showToast('✦ Gate of ' + gate.name + ' — honored.');
  updateRiverBalance('central', 3);
  renderTempleTab();
  saveTempleState();
  spawnConfetti();
  checkAchievements();
  addPathXP('development', 15);
  addPersonalMetric('communication', 3, 'gate: ' + gate.name);
  addPersonalMetric('selfAwareness', 3, 'gate: ' + gate.name);
  addRelationshipMetric('trust', 4, 'gate: ' + gate.name);
  addRelationshipMetric('communication', 4, 'gate: ' + gate.name);
  addRelationshipMetric('intimacy', 2, 'gate: ' + gate.name);
  recalculateAllMetrics();
};

window.markTemplePractice = function(id, xp, btnEl) {
  var slot = currentMySlot || 'A';
  var key = slot + '_tp_' + id;
  if (completedTasks && completedTasks[key]) { showToast('Already completed today ✓'); return; }
  if (!completedTasks) completedTasks = {};
  completedTasks[key] = true;
  if (btnEl) { btnEl.textContent = '✓ Completed'; btnEl.style.opacity = '0.7'; }
  awardXP(xp);
  spawnFloatingEmoji('🎯');
  if (sbClient && currentRelationshipId && currentUser) {
    safeRelUpdate({ completed_tasks: completedTasks });
  }
  renderTempleTab();
  saveTempleState();
  addPathXP('consummation', Math.floor(xp * 0.5));
  addPersonalMetric('empathy', 2, 'temple practice');
  addPersonalMetric('communication', 2, 'temple practice');
  addRelationshipMetric('trust', 3, 'temple practice');
  addRelationshipMetric('intimacy', 3, 'temple practice');
  addRelationshipMetric('friendship', 1, 'temple practice');
  recalculateAllMetrics();
};

window.saveTempleReflection = async function() {
  var input = document.getElementById('temple-reflection-input');
  if (!input || !input.value.trim()) { showToast('Write something first ✦'); return; }
  var q = templeState.dailyQuestion || THOUGHT_QUESTIONS[0];
  if (sbClient && currentUser && currentRelationshipId) {
    await sbClient.from('private_notes').insert({
      user_id: currentUser.id, relationship_id: currentRelationshipId,
      body: '🌿 Temple Reflection\n\n"' + q.q + '"\n\n' + input.value.trim(),
      shared: false, note_type: 'temple_reflection'
    });
  }
  awardXP(15);
  showToast('✦ Reflection saved. The sanctuary grows.');
  input.value = '';
  updateRiverBalance('moon', 3);
  updateRiverBalance('central', 2);
  renderTempleTab();
  saveTempleState();
  spawnFloatingEmoji('📝');
  addPathXP('transcendence', 10);
  addPersonalMetric('selfAwareness', 3, 'temple reflection');
  addRelationshipMetric('trust', 3, 'temple reflection');
  addRelationshipMetric('intimacy', 2, 'temple reflection');
  recalculateAllMetrics();
};

async function saveTempleState() {
  if (sbClient && currentRelationshipId && currentUser) {
    await safeRelUpdate({ temple_state: JSON.stringify(templeState) });
  }
}

window.openFoundationModal = function(key, label, icon) {
  var existing = document.getElementById('modal-foundation');
  if (existing) existing.remove();
  var div = document.createElement('div');
  div.id = 'modal-foundation';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);backdrop-filter:blur(12px);display:flex;align-items:flex-end;justify-content:center;z-index:1001;padding-bottom:0px;';
  div.innerHTML = '<div style="width:100%;max-width:480px;background:#11151f;border:0.5px solid var(--border);border-radius:32px 32px 0 0;padding:24px;">' +
    '<div style="width:40px;height:4px;background:rgba(201,168,76,0.35);border-radius:2px;margin:0 auto 20px;"></div>' +
    '<div style="text-align:center;margin-bottom:12px;"><div style="font-size:32px;">' + icon + '</div><div style="font-size:16px;color:var(--gold2);margin-top:4px;">' + label + '</div></div>' +
    '<div style="font-size:12px;color:var(--text2);text-align:center;margin-bottom:12px;font-style:italic;">How well are you caring for this today?</div>' +
    '<div style="display:flex;gap:4px;justify-content:center;margin-bottom:14px;">' +
    [20,40,60,80,100].map(v => '<div onclick="setFoundation(\'' + key + '\',' + v + ',this)" style="flex:1;max-width:44px;height:38px;border-radius:8px;background:var(--glass);border:0.5px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--text2);cursor:pointer;">' + v + '</div>').join('') +
    '</div><button onclick="document.getElementById(\'modal-foundation\').remove()" style="width:100%;padding:10px;border-radius:40px;background:var(--glass);border:0.5px solid var(--border);color:var(--text2);font-size:13px;cursor:pointer;">Close</button></div>';
  document.body.appendChild(div);
  div.addEventListener('click', e => { if (e.target === div) div.remove(); });
};

// REPLACE the setFoundation function - Make it async
window.setFoundation = async function(key, value, btn) {
  templeState.personal[key] = value;
  if (btn) {
    btn.parentNode.querySelectorAll('div').forEach(d => { 
      d.style.background = 'var(--glass)'; 
      d.style.borderColor = 'var(--border)'; 
      d.style.color = 'var(--text2)'; 
    });
    btn.style.background = 'rgba(201,168,76,0.2)'; 
    btn.style.borderColor = 'var(--gold)'; 
    btn.style.color = 'var(--gold)';
  }
  showToast('✦ ' + key + ' updated to ' + value + '%');
  
  // ADDED: Small XP for self-care check-ins
  await awardXP(3); // Small reward for self-awareness
  addPathXP('variety', 2);
  
  setTimeout(() => { 
    document.getElementById('modal-foundation').remove(); 
    renderTempleTab(); 
    saveTempleState(); 
  }, 500);
  
  addPersonalMetric('selfAwareness', 2, 'foundation: ' + key);
  addRelationshipMetric('trust', 1, 'foundation: ' + key);
  recalculateAllMetrics();
};
function updateRiverBalance(river, delta) {
  templeState.riverBalance[river] = Math.min(100, (templeState.riverBalance[river] || 50) + delta);
}

// ==================== WHEEL ====================
function drawWheel() {
  var canvas = document.getElementById('wheel-canvas');
  if (!canvas) return;
  var S = 200, cx = S / 2, cy = S / 2, r = 72, dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.height = S * dpr; canvas.style.width = canvas.style.height = S + 'px';
  var ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr); ctx.clearRect(0, 0, S, S);

  // Combine personal + relationship metrics for the wheel
  var sl = [
    {l:'Empathy', v: Math.min(1, getPersonalMetric('empathy') / 100), c: 'rgba(78,205,196,0.8)'},
    {l:'Self-Awareness', v: Math.min(1, getPersonalMetric('selfAwareness') / 100), c: 'rgba(155,109,255,0.8)'},
    {l:'Communication', v: Math.min(1, (getPersonalMetric('communication') + getRelationshipMetric('communication')) / 200), c: 'rgba(201,168,76,0.8)'},
    {l:'Trust', v: Math.min(1, getRelationshipMetric('trust') / 100), c: 'rgba(232,112,112,0.8)'},
    {l:'Intimacy', v: Math.min(1, getRelationshipMetric('intimacy') / 100), c: 'rgba(201,168,76,0.7)'}
  ];

  var n = sl.length;
  sl.forEach((s, i) => {
    var a0 = (i / n) * Math.PI * 2 - Math.PI / 2, a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r * s.v, a0, a1); ctx.closePath(); ctx.fillStyle = s.c; ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, a0, a1); ctx.closePath(); ctx.strokeStyle = 'rgba(240,232,208,0.08)'; ctx.lineWidth = 0.5; ctx.stroke();
  });
  [0.25, 0.5, 0.75, 1].forEach(f => { ctx.beginPath(); ctx.arc(cx, cy, r * f, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(240,232,208,0.06)'; ctx.lineWidth = 0.5; ctx.stroke(); });
  sl.forEach((_, i) => { var a = (i / n) * Math.PI * 2 - Math.PI / 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.strokeStyle = 'rgba(240,232,208,0.1)'; ctx.lineWidth = 0.5; ctx.stroke(); });

  var lb = document.getElementById('wheel-labels');
  if(lb) {
    lb.innerHTML = sl.map(s => {
      let pChange = null;
      let rChange = null;
      let label = s.l.toLowerCase().replace('-', '');
      if (personalMetrics[label]) pChange = personalMetrics[label]?.changes?.slice(-1)[0];
      if (relationshipMetrics[label]) rChange = relationshipMetrics[label]?.changes?.slice(-1)[0];
      let changeHtml = '';
      if (pChange && pChange.amount > 0) changeHtml = ' <span style="font-size:9px;color:var(--teal);">+'+pChange.amount+'</span>';
      if (rChange && rChange.amount > 0) changeHtml += ' <span style="font-size:9px;color:var(--gold);">💑+'+rChange.amount+'</span>';
      return '<div class="wheel-label-item"><span class="label-name">' + s.l + '</span><span class="label-value">' + Math.round(s.v * 100) + '%' + changeHtml + '</span></div>';
    }).join('');
  }

  var container = canvas.parentElement;
  var existing = container.querySelector('.wheel-lock-overlay');
  if (existing) existing.remove();
  if (!isFeatureUnlocked(520)) {
    var lockDiv = document.createElement('div');
    lockDiv.className = 'wheel-lock-overlay';
    lockDiv.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.55);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;color:var(--gold);font-weight:600;pointer-events:none;text-align:center;padding:20px;';
    lockDiv.textContent = '🔒 ' + (520 - getTotalXP()) + ' XP needed to unlock Soul Wheel';
    container.appendChild(lockDiv);
  }
}

function isFeatureUnlocked(xpNeeded) { return getTotalXP() >= xpNeeded; }

// ==================== COUPLE EXTRAS ====================
function renderCoupleExtras() {
  drawMountain();
  startGalaxy();
  renderInsights();
  var el = document.getElementById('couple-progress');
  if(el) {
    var bars = [
      ['Shared Vision', getRelationshipMetric('sharedVision')],
      ['Friendship', getRelationshipMetric('friendship')],
      ['Trust', getRelationshipMetric('trust')],
      ['Teamwork', getRelationshipMetric('teamwork')],
      ['Communication', getRelationshipMetric('communication')],
      ['Intimacy', getRelationshipMetric('intimacy')]
    ];
    el.innerHTML = bars.map(b => '<div style="display:flex;align-items:center;gap:10px;margin:8px 0"><div style="font-size:12px;color:var(--text2);width:110px;flex-shrink:0;">' + b[0] + '</div><div style="flex:1;height:6px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden;"><div style="height:100%;border-radius:3px;background:linear-gradient(90deg,var(--gold),var(--gold2));width:' + b[1] + '%"></div></div><div style="font-size:12px;color:var(--gold);min-width:32px;text-align:right;">' + b[1] + '%</div></div>').join('');
  }
}

function renderInsights() {
  var el = document.getElementById('insights-content'); if(!el) return;
  var trust = getRelationshipMetric('trust');
  var vision = getRelationshipMetric('sharedVision');
  var comm = getRelationshipMetric('communication');
  var intimacy = getRelationshipMetric('intimacy');
  var friendship = getRelationshipMetric('friendship');
  var teamwork = getRelationshipMetric('teamwork');
  var items = [];
  if (vision >= 70) items.push({c:'teal', icon:'🌅', t:'Vision Alignment', txt:'Both of you want the same life. Your future is aligned.'});
  if (trust >= 70) items.push({c:'teal', icon:'🔐', t:'Deep Trust', txt:'Trust is the soil of your connection. It runs deep.'});
  if (trust < 60) items.push({c:'rose', icon:'⚠️', t:'Trust Building', txt:'Trust is the foundation. Focus on consistency and honesty.'});
  if (comm < 65) items.push({c:'rose', icon:'⚠️', t:'Communication Pressure', txt:'Hard conversations may be accumulating. Create safe space.'});
  if (intimacy < 70) items.push({c:'rose', icon:'⚠️', t:'Intimacy Attention', txt:'Emotional and physical closeness needs intentional care.'});
  if (friendship >= 80) items.push({c:'teal', icon:'🤝', t:'Strong Friendship', txt:'Your friendship is the bedrock. This is beautiful.'});
  if (teamwork >= 75) items.push({c:'teal', icon:'⚡', t:'Great Teamwork', txt:'You work together like a well-oiled machine.'});
  if (items.length === 0) {
    items.push({c:'purple', icon:'🌟', t:'Strong Connection', txt:'Your relationship is flourishing. Keep nurturing it.'});
  }
  items.push({c:'purple', icon:'🌿', t:'Next Edge', txt:"Your next level requires one conversation you've both been avoiding."});
  el.innerHTML = items.map(i => '<div style="padding:14px;background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.07);border-radius:14px;margin-bottom:10px;"><div style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--' + i.c + ');margin-bottom:8px;">' + i.icon + ' ' + i.t + '</div><div style="font-size:13px;color:var(--text1);line-height:1.7;font-family:var(--font);font-style:italic;">' + i.txt + '</div></div>').join('');
}

function drawMountain() {
  var canvas = document.getElementById('mountain-canvas'); 
  if(!canvas) return;
  var rect = canvas.getBoundingClientRect();
  var dpr = window.devicePixelRatio || 1;
  var W = rect.width || canvas.offsetWidth || 340;
  var H = 200;
  
  // Set canvas size properly
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  
  var ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);
  
  var cx = W / 2, top = 20;
  // Mountain body
  ctx.beginPath();
  ctx.moveTo(W * 0.05, H - 10);
  ctx.lineTo(cx - 18, top + 30);
  ctx.lineTo(cx, top);
  ctx.lineTo(cx + 18, top + 30);
  ctx.lineTo(W * 0.95, H - 10);
  ctx.closePath();
  var mg = ctx.createLinearGradient(0, top, 0, H);
  mg.addColorStop(0, 'rgba(30,40,70,0.9)');
  mg.addColorStop(1, 'rgba(15,21,37,0.4)');
  ctx.fillStyle = mg;
  ctx.fill();
  
  // Snow cap
  ctx.beginPath();
  ctx.moveTo(cx, top);
  ctx.lineTo(cx - 18, top + 28);
  ctx.lineTo(cx + 18, top + 28);
  ctx.closePath();
  ctx.fillStyle = 'rgba(245,245,255,0.85)';
  ctx.fill();
  
  // Path line
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(cx, H - 15);
  ctx.bezierCurveTo(cx + 15, H * 0.6, cx - 10, H * 0.3, cx, top + 10);
  ctx.strokeStyle = 'rgba(201,168,76,0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);
  
  // Stages with metrics
  var stages = [
    {l:'Friendship', v: getRelationshipMetric('friendship')},
    {l:'Trust', v: getRelationshipMetric('trust')},
    {l:'Intimacy', v: getRelationshipMetric('intimacy')},
    {l:'Vision', v: getRelationshipMetric('sharedVision')}
  ];
  
  var climbPct = stages.reduce((a,b) => a + b.v, 0) / 4 / 100;
  var coupleY = top + (H - 30) * (1 - Math.min(climbPct * 0.88, 0.85));
  
  stages.forEach((sg, i) => {
    var frac = i / (stages.length - 1);
    var y = H - 15 - (H - 40) * frac;
    ctx.beginPath();
    ctx.arc(cx, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(201,168,76,0.7)';
    ctx.fill();
    ctx.font = '10px sans-serif';
    ctx.fillStyle = 'rgba(240,232,208,0.6)';
    ctx.textAlign = i % 2 === 0 ? 'right' : 'left';
    ctx.fillText(sg.l + ' ' + sg.v + '%', i % 2 === 0 ? cx - 12 : cx + 12, y + 4);
  });
  
  // Couple at current position
  ctx.font = '18px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('💑', cx, coupleY);
  ctx.fillStyle = 'rgba(245,223,160,0.8)';
  ctx.font = '10px sans-serif';
  ctx.fillText('🏔 Summit', cx, top - 6);
}

function startGalaxy() { 
  if(galaxyRAF) cancelAnimationFrame(galaxyRAF); 
  drawGalaxyFrame(); 
}

function drawGalaxyFrame() {
  var canvas = document.getElementById('galaxy-canvas'); 
  if(!canvas) return;
  
  var rect = canvas.getBoundingClientRect();
  var dpr = window.devicePixelRatio || 1;
  var W = rect.width || canvas.offsetWidth || 340;
  var H = 240;
  
  // Set canvas size properly
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  
  var ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);
  
  var t = Date.now() * 0.001;
  var aX = W * 0.25, aY = H * 0.45;
  var bX = W * 0.75, bY = H * 0.55;
  var cX = W / 2, cY = H / 2;
  
  // Orbit rings
  [30, 50, 70].forEach((r, i) => {
    ctx.beginPath();
    ctx.arc(aX, aY, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(78,205,196,' + (0.07 - i * 0.02) + ')';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  });
  
  [25, 45, 65].forEach((r, i) => {
    ctx.beginPath();
    ctx.arc(bX, bY, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(155,109,255,' + (0.07 - i * 0.02) + ')';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  });
  
  // Orbiting particles
  for(var i = 0; i < 8; i++) {
    var a = t * 0.5 + (i / 8) * Math.PI * 2;
    var px = aX + Math.cos(a) * (35 + i * 4) * 0.6;
    var py = aY + Math.sin(a) * (35 + i * 4) * 0.3;
    ctx.beginPath();
    ctx.arc(px, py, 1, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(78,205,196,' + (0.3 + i * 0.04) + ')';
    ctx.fill();
  }
  
  for(var i = 0; i < 8; i++) {
    var a = -t * 0.4 + (i / 8) * Math.PI * 2;
    var px = bX + Math.cos(a) * (30 + i * 4) * 0.6;
    var py = bY + Math.sin(a) * (30 + i * 4) * 0.3;
    ctx.beginPath();
    ctx.arc(px, py, 1, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(155,109,255,' + (0.3 + i * 0.04) + ')';
    ctx.fill();
  }
  
  // Connection line
  var trust = getRelationshipMetric('trust');
  var intimacy = getRelationshipMetric('intimacy');
  var align = (trust + intimacy) / 200;
  
  var bg = ctx.createLinearGradient(aX, aY, bX, bY);
  bg.addColorStop(0, 'rgba(78,205,196,0.15)');
  bg.addColorStop(0.5, 'rgba(201,168,76,' + (0.1 + align * 0.2) + ')');
  bg.addColorStop(1, 'rgba(155,109,255,0.15)');
  ctx.beginPath();
  ctx.moveTo(aX, aY);
  ctx.lineTo(bX, bY);
  ctx.strokeStyle = bg;
  ctx.lineWidth = 2;
  ctx.stroke();
  
  // Center pulse
  var pulse = (Math.sin(t * 2) + 1) * 3;
  ctx.beginPath();
  ctx.arc(cX, cY, 8 + pulse, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(232,112,112,' + (0.1 + pulse * 0.02) + ')';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cX, cY, 5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(232,112,112,0.8)';
  ctx.fill();
  
  // Pull effect based on alignment
  var pull = (1 - align) * 0.15;
  var axF = aX + (cX - aX) * pull;
  var bxF = bX + (cX - bX) * pull;
  
  function drawStar(x, y, emoji, lbl, glow) {
    var sg = ctx.createRadialGradient(x, y, 0, x, y, 28);
    sg.addColorStop(0, glow.replace('1)', '0.3)'));
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(x, y, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(emoji, x, y + 8);
    ctx.font = '11px sans-serif';
    ctx.fillStyle = 'rgba(240,232,208,0.6)';
    ctx.fillText(lbl, x, y + 26);
  }
  
  drawStar(axF, aY, '🌸', liveData.partner_a_name || 'Partner A', 'rgba(78,205,196,1)');
  drawStar(bxF, bY, '🌿', liveData.partner_b_name || 'Partner B', 'rgba(155,109,255,1)');
  
  galaxyRAF = requestAnimationFrame(drawGalaxyFrame);
}

// ==================== HOME ====================
function updateHomeScreen() {
  var now = new Date();
  var D = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'], M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var hd = document.getElementById('hdr-date'); if(hd) hd.textContent = D[now.getDay()]+', '+now.getDate()+' '+M[now.getMonth()]+' '+now.getFullYear();
  var moon = getMoonPhase(now);
  var hm = document.getElementById('hdr-moon'); if(hm) hm.textContent = moon.icon + ' ' + moon.name;
  renderDailyPulse(now, moon);
  renderArchetype();
}

function getMoonPhase(date) {
  var d = date || new Date();
  var known = new Date('2000-01-06T18:14:00Z');
  var synodic = 29.53058867;
  var phase = (((d - known) / 86400000 % synodic) + synodic) % synodic;
  if (phase < 1.85)  return {name:'New Moon', icon:'🌑', release:'old patterns', invite:'fresh intentions', energy:'Plant seeds. Begin.'};
  if (phase < 7.38)  return {name:'Waxing Crescent', icon:'🌒', release:'doubt', invite:'momentum', energy:'Build. Take first steps.'};
  if (phase < 11.08) return {name:'First Quarter', icon:'🌓', release:'hesitation', invite:'action', energy:'Overcome resistance.'};
  if (phase < 14.77) return {name:'Waxing Gibbous', icon:'🌔', release:'control', invite:'trust', energy:'Build rather than fix.'};
  if (phase < 18.46) return {name:'Full Moon', icon:'🌕', release:'what no longer serves', invite:'completion', energy:'Illuminate. Celebrate.'};
  if (phase < 22.15) return {name:'Waning Gibbous', icon:'🌖', release:'ego', invite:'gratitude', energy:'Give back.'};
  if (phase < 25.84) return {name:'Last Quarter', icon:'🌗', release:'resentment', invite:'forgiveness', energy:'Clear. Make space.'};
  return {name:'Waning Crescent', icon:'🌘', release:'exhaustion', invite:'rest', energy:'Surrender. Restore.'};
}

function renderDailyPulse(now, moon) {
  var PULSE_THEMES = [
    {theme:'"Build rather than fix."', him:"Ask one deeper question about her inner world.", her:"Share one thing you've been keeping quietly to yourself.", together:"10-minute gratitude ritual."},
    {theme:'"The space between two people is sacred."', him:"Be fully present for one hour.", her:"Tell him one thing you've been afraid to want.", together:"Cook a meal in silence."},
    {theme:'"Love is not a feeling. It is a practice."', him:"Write three things you love that you've stopped saying.", her:"Initiate one act of tenderness.", together:"Sit outside and look at the same sky."},
  ];
  var idx = (now.getFullYear() * 365 + now.getMonth() * 31 + now.getDate()) % PULSE_THEMES.length;
  var p = PULSE_THEMES[idx];
  var ld = liveData || {};
  var et = document.getElementById('pulse-theme'); if(et) et.textContent = p.theme;
  var ep = document.getElementById('pulse-tasks');
  if(ep) ep.innerHTML = [
    {who: ld.partner_a_name || 'Him', what: p.him},
    {who: ld.partner_b_name || 'Her', what: p.her},
    {who: 'Together', what: p.together}
  ].map(t => '<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:var(--glass);border-radius:10px;border:0.5px solid var(--border);margin-bottom:8px;"><div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--gold);min-width:36px;flex-shrink:0;margin-top:1px;">' + escHtml(t.who) + '</div><div style="font-size:13px;color:var(--text1);line-height:1.4;">' + escHtml(t.what) + '</div></div>').join('');
}

function renderArchetype() {
  let arch = getArchetype();
  var sym = document.getElementById('arch-symbol'), nm = document.getElementById('arch-name'), ls = document.getElementById('arch-lesson');
  if(sym) sym.textContent = arch.symbol;
  if(nm) nm.textContent = arch.name;
  if(ls) ls.textContent = arch.lesson;
}

// ==================== COSMIC ====================
function updateCosmicScreen() {
  var moon = getMoonPhase(new Date());
  document.getElementById('moon-big-icon').textContent = moon.icon;
  document.getElementById('moon-big-phase').textContent = moon.name;
  document.getElementById('moon-release-txt').textContent = 'Release: ' + moon.release;
  document.getElementById('moon-invite-txt').textContent = 'Invite: ' + moon.invite;
  document.getElementById('moon-energy-txt').textContent = moon.energy;
  var slot = currentMySlot || 'A';
  var myIntake = (liveData && (slot === 'A' ? liveData.intake_a : liveData.intake_b)) || {};
  var birthEl = document.getElementById('cosmic-birth-info');
  if(birthEl) {
    var parts = [];
    if(myIntake.dob) parts.push(new Date(myIntake.dob + 'T12:00:00').toLocaleDateString('en-GB', {day:'numeric', month:'long', year:'numeric'}));
    if(myIntake.birth_time) parts.push('born ' + myIntake.birth_time);
    if(myIntake.birthplace) parts.push(myIntake.birthplace);
    birthEl.textContent = parts.length ? '✦ ' + parts.join(' · ') : '';
  }
  var hc = document.getElementById('horoscope-content');
  if(hc) {
    var now = new Date(), idx = (now.getMonth() * 31 + now.getDate()) % 3;
    var msgs = [{sign:'♋ Cancer Season', txt:'Home is not a place but a feeling you create between you.'}, {sign:'♑ For the Builder', txt:'Are you communicating what you feel, or what you think they want to hear?'}, {sign:'♉ For the Nurturer', txt:'Notice where you mistake stillness for safety.'}];
    hc.innerHTML = msgs.map(m => '<div style="padding:14px;background:rgba(155,109,255,0.06);border:0.5px solid rgba(155,109,255,0.2);border-radius:14px;margin-bottom:10px;"><div style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--purple);margin-bottom:6px;">' + m.sign + '</div><div style="font-size:13px;color:var(--text1);line-height:1.7;font-family:var(--font);font-style:italic;">' + m.txt + '</div></div>').join('');
  }
  var dt = document.getElementById('dream-tags');
  if(dt) {
    dt.innerHTML = DREAM_TAGS.map(tag =>
      '<div class="dream-tag' + (selectedDreamTags.includes(tag) ? ' active' : '') + '" onclick="toggleDreamTag(this,\'' + escHtml(tag) + '\')" data-tag="' + escHtml(tag) + '">' + tag + '</div>'
    ).join('');
  }
  loadDreams();
}

function toggleDreamTag(el, tag) {
  var idx = selectedDreamTags.indexOf(tag);
  if(idx >= 0) { selectedDreamTags.splice(idx, 1); el.classList.remove('active'); }
  else { selectedDreamTags.push(tag); el.classList.add('active'); }
}

async function saveDreamEntry() {
  var title = document.getElementById('dream-title').value.trim();
  var body = document.getElementById('dream-input').value.trim();
  if(!body){ showToast('Describe the dream first'); return; }
  var ld = liveData || {};
  var _dSlot = currentMySlot || 'A';
  var authorName = _dSlot === 'A' ? (ld.partner_a_name || 'Partner A') : (ld.partner_b_name || 'Partner B');
  if(!sbClient || !currentRelationshipId) {
    prependDreamRow({ id: Date.now(), created_at: new Date().toISOString(), title: title || 'Untitled Dream', body: body, tags: selectedDreamTags.slice(), author_name: authorName });
  } else {
    var btn = document.getElementById('dream-submit-btn'); if(btn) btn.disabled = true;
    var res = await sbClient.from('dreams').insert({relationship_id: currentRelationshipId, sender_id: currentUser ? currentUser.id : null, author_name: authorName, title: title || 'Untitled Dream', body: body, tags: selectedDreamTags}).select('id,created_at,author_name,title,body,tags').single();
    if(btn) btn.disabled = false;
    if(res.error){ showToast('⚠️ ' + res.error.message); return; }
    if(res.data) prependDreamRow(res.data);
  }
  document.getElementById('dream-title').value = '';
  document.getElementById('dream-input').value = '';
  selectedDreamTags = [];
  document.querySelectorAll('#dream-tags .dream-tag').forEach(el => el.classList.remove('active'));
  showToast('Dream recorded ✨');
  await awardXP(20);
  spawnFloatingEmoji('🌙');
  addPathXP('transcendence', 10);
  addPersonalMetric('selfAwareness', 2, 'dream recording');
  addPersonalMetric('empathy', 2, 'dream recording');
  addRelationshipMetric('intimacy', 3, 'dream recording');
  addRelationshipMetric('trust', 2, 'dream recording');
  recalculateAllMetrics();
}

async function loadDreams() {
  var el = document.getElementById('dream-entries'); if(!el) return;
  if(!sbClient || !currentRelationshipId){ el.innerHTML = '<div style="color:var(--text3);text-align:center;padding:20px;font-style:italic;">No dreams yet.</div>'; return; }
  el.innerHTML = '<div style="text-align:center;color:var(--text3);padding:20px;">Loading…</div>';
  var res = await sbClient.from('dreams').select('id,created_at,author_name,title,body,tags').eq('relationship_id', currentRelationshipId).order('created_at', {ascending: false}).limit(40);
  if(res.error){ el.innerHTML = '<div style="color:var(--rose);padding:16px;">' + escHtml(res.error.message) + '</div>'; return; }
  el.innerHTML = '';
  if(!res.data || res.data.length === 0){ el.innerHTML = '<div style="color:var(--text3);text-align:center;padding:20px;font-style:italic;">No dreams recorded yet ✨</div>'; return; }
  res.data.forEach(d => el.insertAdjacentHTML('beforeend', buildDreamRow(d)));
}

function buildDreamRow(d) {
  var tags = (d.tags || []).map(t => '<span style="font-size:10px;padding:2px 8px;background:rgba(155,109,255,0.12);border-radius:20px;border:0.5px solid rgba(155,109,255,0.25);color:var(--purple);">' + escHtml(t) + '</span>').join(' ');
  return '<div style="padding:14px;background:linear-gradient(135deg,rgba(155,109,255,0.06),rgba(78,205,196,0.04));border-left:2px solid var(--purple);border-radius:0 16px 16px 0;margin-bottom:10px;" data-dream-id="' + d.id + '">' +
    '<div style="font-size:10px;color:var(--text3);margin-bottom:4px;">' + new Date(d.created_at).toLocaleString() + ' · ' + escHtml(d.author_name || 'Partner') + '</div>' +
    '<div style="font-size:14px;font-weight:600;color:var(--gold2);margin-bottom:6px;">' + escHtml(d.title || 'Dream') + '</div>' +
    '<div style="font-size:13px;color:var(--text1);line-height:1.6;font-style:italic;font-family:var(--font);word-break:break-word;">' + escHtml(d.body) + '</div>' +
    (tags ? '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:8px;">' + tags + '</div>' : '') +
    '</div>';
}

function prependDreamRow(d) {
  var el = document.getElementById('dream-entries'); if(!el) return;
  if(el.querySelector('[data-dream-id="' + d.id + '"]')) return;
  el.insertAdjacentHTML('afterbegin', buildDreamRow(d));
}

// ==================== PRIVATE NOTES ====================
async function loadPrivateNotes() {
  var el = document.getElementById('private-entries'); if(!el) return;
  if(!sbClient || !currentUser) { el.innerHTML = '<div style="color:var(--text3);text-align:center;padding:20px;font-style:italic;">Sign in to load private notes.</div>'; return; }
  el.innerHTML = '<div style="text-align:center;color:var(--text3);padding:20px;">Loading…</div>';
  var res = await sbClient.from('private_notes').select('id,created_at,body,shared').eq('user_id', currentUser.id).eq('relationship_id', currentRelationshipId).order('created_at', {ascending: false}).limit(30);
  if(res.error) { el.innerHTML = '<div style="color:var(--rose);padding:16px;">' + escHtml(res.error.message) + '</div>'; return; }
  el.innerHTML = '';
  if(!res.data || res.data.length === 0) { el.innerHTML = '<div style="color:var(--text3);text-align:center;padding:20px;font-style:italic;">No private notes yet.</div>'; return; }
  res.data.forEach(n => el.insertAdjacentHTML('beforeend', buildPrivateRow(n)));
}

function buildPrivateRow(n) {
  return '<div style="padding:14px;background:rgba(155,109,255,0.06);border-left:2px solid var(--purple);border-radius:0 16px 16px 0;margin-bottom:10px;" data-note-id="' + n.id + '"><div style="font-size:10px;color:var(--text3);margin-bottom:4px;">' + new Date(n.created_at).toLocaleString() + '</div><div style="font-size:13px;color:var(--text1);line-height:1.6;font-style:italic;font-family:var(--font);">' + escHtml(n.body) + '</div><div style="display:inline-flex;align-items:center;gap:4px;font-size:10px;color:var(--rose);background:rgba(232,112,112,0.1);border:0.5px solid rgba(232,112,112,0.3);border-radius:20px;padding:2px 8px;margin-top:6px;">' + (n.shared ? '👁 Shared' : '🔒 Private') + '</div></div>';
}

async function savePrivateNote() {
  var input = document.getElementById('private-input'), shared = document.getElementById('private-share-toggle').checked, body = input ? input.value.trim() : '';
  if(!body) { showToast('Write something first'); return; }
  if(!sbClient || !currentUser || !currentRelationshipId) { showToast('Not connected.'); return; }
  var res = await sbClient.from('private_notes').insert({user_id: currentUser.id, relationship_id: currentRelationshipId, body: body, shared: shared}).select('id,created_at,body,shared').single();
  if(res.error) { showToast('⚠️ ' + res.error.message); return; }
  if(input) input.value = '';
  var el = document.getElementById('private-entries');
  if(el && res.data) el.insertAdjacentHTML('afterbegin', buildPrivateRow(res.data));
  showToast(shared ? '✨ Saved! Partner can see this.' : '🔒 Saved privately.');
  await awardXP(10);
  spawnFloatingEmoji('📝');
  addPathXP('development', 5);
  addPersonalMetric('selfAwareness', 2, 'private note');
  addRelationshipMetric('trust', 2, 'private note');
  addRelationshipMetric('intimacy', 1, 'private note');
  recalculateAllMetrics();
}

// ==================== INTAKE ====================
const INTAKE_PAGES = [
  { title:'About You', icon:'🌱', subtitle:'Your personal baseline.',
    fields: [
      {id:'dob', label:'Date of birth', type:'date'},
      {id:'birth_time', label:'Time of birth', type:'time'},
      {id:'birthplace', label:'Place of birth', type:'text', placeholder:'City, country'},
      {id:'nationality', label:'Nationality', type:'text'},
      {id:'children', label:'Do you already have children?', type:'yesno'},
      {id:'together', label:'How long have you been together?', type:'text', placeholder:'e.g. 4 years'},
    ]
  },
  { title:'Love Language', icon:'❤️', subtitle:'Complete these sentences.',
    fields: [
      {id:'origin', label:'The moment you knew this was different', type:'textarea'},
      {id:'loved_when', label:'I feel most loved when…', type:'textarea'},
      {id:'unloved', label:'I feel least loved when…', type:'textarea'},
      {id:'admire', label:'What I admire most about my partner', type:'textarea'},
    ]
  },
  { title:'Rate Your Relationship', icon:'📊', subtitle:'Score 1–10.',
    fields: [
      {id:'rate_friendship', label:'Friendship', type:'scale'},
      {id:'rate_trust', label:'Trust', type:'scale'},
      {id:'rate_sexual', label:'Sexual connection', type:'scale'},
      {id:'rate_emotional', label:'Emotional intimacy', type:'scale'},
      {id:'rate_teamwork', label:'Teamwork', type:'scale'},
      {id:'rate_communication', label:'Communication', type:'scale'},
      {id:'rate_vision', label:'Shared vision', type:'scale'},
    ]
  },
  { title:'The Future', icon:'🌅', subtitle:'One of the most important sections.', courage:true,
    fields: [
      {id:'child_why', label:'Why do you want a child?', type:'textarea'},
      {id:'child_fear', label:'Your fears about becoming a parent?', type:'textarea'},
      {id:'child_imagine', label:'What kind of parent do you imagine being?', type:'textarea'},
      {id:'vision_10yr', label:'10 years from now — describe your morning together.', type:'textarea'},
    ]
  },
  { title:'Shadow & Soul', icon:'🌑', subtitle:'What you cannot say becomes the wall.', courage:true,
    fields: [
      {id:'shadow_judge_p', label:'What I secretly judge my partner for…', type:'textarea'},
      {id:'shadow_fear', label:'The fear I rarely admit…', type:'textarea'},
      {id:'shadow_truth', label:'The truth I have not fully spoken…', type:'textarea'},
      {id:'final', label:'If my partner could understand one thing about me completely…', type:'textarea'},
    ]
  },
];

let intakeAnswers = {};
let intakePage = 0;

function startIntake(relation, slot) {
  liveData = relation; currentMySlot = slot; currentRelationshipId = relation.id;
  intakeAnswers = Object.assign({}, slot === 'A' ? (relation.intake_a || {}) : (relation.intake_b || {}));
  intakePage = 0;
  ['auth-screen','relationship-setup-screen','waiting-screen','main-app','forgot-password-screen'].forEach(id => { var el=document.getElementById(id); if(el) el.style.display='none'; });
  document.getElementById('intake-screen').style.display = 'block';
  renderIntakePage();
}

function renderIntakePage() {
  var page = INTAKE_PAGES[intakePage];
  var inner = document.getElementById('intake-inner');
  if(!inner) return;
  var pips = INTAKE_PAGES.map((_, i) => '<div class="intake-pip ' + (i < intakePage ? 'done' : i === intakePage ? 'current' : '') + '"></div>').join('');
  var fieldsHtml = page.fields.map(f => {
    var saved = intakeAnswers[f.id] || '';
    var el = '';
    if(f.type === 'date') el = '<input type="date" class="intake-input" id="if_' + f.id + '" value="' + escHtml(saved) + '">';
    else if(f.type === 'time') el = '<input type="time" class="intake-input" id="if_' + f.id + '" value="' + escHtml(saved) + '">';
    else if(f.type === 'text') el = '<input type="text" class="intake-input" id="if_' + f.id + '" placeholder="' + (f.placeholder||'') + '" value="' + escHtml(saved) + '">';
    else if(f.type === 'textarea') el = '<textarea class="intake-input" id="if_' + f.id + '" placeholder="' + (f.placeholder||'') + '" rows="3">' + escHtml(saved) + '</textarea>';
    else if(f.type === 'scale') {
      var dots = '';
      for(var n=1; n<=10; n++) { dots += '<div class="intake-scale-dot' + (String(saved) === String(n) ? ' sel' : '') + '" onclick="selectIntakeScale(this,\'' + f.id + '\',' + n + ')">' + n + '</div>'; }
      el = '<div class="intake-scale">' + dots + '</div>';
    } else if(f.type === 'yesno') {
      el = '<div class="intake-yesno"><div class="intake-yn-btn' + (saved === 'yes' ? ' sel' : '') + '" onclick="selectIntakeYN(this,\'' + f.id + '\',\'yes\')">Yes</div><div class="intake-yn-btn' + (saved === 'no' ? ' sel' : '') + '" onclick="selectIntakeYN(this,\'' + f.id + '\',\'no\')">No</div></div>';
    }
    return '<div class="intake-field"><label class="intake-label">' + f.label + '</label>' + el + '</div>';
  }).join('');
  inner.innerHTML =
    '<div class="intake-hero"><div class="intake-hero-icon">' + page.icon + '</div><div class="intake-hero-title">' + page.title + '</div><div class="intake-hero-sub">' + page.subtitle + '</div></div>' +
    '<div class="intake-progress">' + pips + '</div>' +
    (page.courage ? '<div class="intake-courage-note">🌑 Shadow section — stored privately.</div>' : '') +
    fieldsHtml +
    '<div class="intake-nav">' +
    (intakePage > 0 ? '<button class="intake-back" onclick="intakeBack()">← Back</button>' : '') +
    '<button class="intake-next" onclick="intakeNext()">' + (intakePage === INTAKE_PAGES.length - 1 ? 'Complete ✨' : 'Continue →') + '</button></div>';
}

function selectIntakeScale(el, fieldId, val) { intakeAnswers[fieldId] = val; el.parentNode.querySelectorAll('.intake-scale-dot').forEach(d => d.classList.remove('sel')); el.classList.add('sel'); }
function selectIntakeYN(el, fieldId, val) { intakeAnswers[fieldId] = val; el.parentNode.querySelectorAll('.intake-yn-btn').forEach(d => d.classList.remove('sel')); el.classList.add('sel'); }
function collectIntakePage() { INTAKE_PAGES[intakePage].fields.forEach(f => { if(f.type !== 'scale' && f.type !== 'yesno') { var el = document.getElementById('if_' + f.id); if(el) intakeAnswers[f.id] = el.value.trim(); } }); }
function intakeBack() { collectIntakePage(); if(intakePage > 0){ intakePage--; renderIntakePage(); } }
async function intakeNext() { collectIntakePage(); await saveIntakeProgress(false); if(intakePage < INTAKE_PAGES.length - 1) { intakePage++; renderIntakePage(); window.scrollTo(0,0); } else { await completeIntake(); } }

async function saveIntakeProgress(done) {
  if(!sbClient || !currentRelationshipId || !currentUser) return;
  var slot = currentMySlot;
  var updates = {};
  updates['intake_' + slot.toLowerCase()] = intakeAnswers;
  if(done) {
    updates['intake_' + slot.toLowerCase() + '_done'] = true;
    var derived = deriveProfileFromIntake(intakeAnswers);
    var existing = (liveData && liveData.couple_stats) || {};
    updates.couple_stats = mergeStats(existing, derived.couple_stats, slot);
    updates.baby_readiness = derived.baby_readiness;
    initializeMetrics(intakeAnswers, updates.couple_stats || {});
    updates.personal_metrics = JSON.stringify(personalMetrics);
    updates.relationship_metrics = JSON.stringify(relationshipMetrics);
  }
  await safeRelUpdate(updates);
}

function deriveProfileFromIntake(answers) {
  function rating(id, fallback){ var v = Number(answers[id]); return isNaN(v) ? (fallback || 7) * 10 : Math.round(v * 10); }
  var trust = rating('rate_trust', 6), intimacy = Math.round((rating('rate_emotional', 6) + rating('rate_sexual', 6)) / 2);
  var communication = rating('rate_communication', 6), vision = rating('rate_vision', 5), friendship = rating('rate_friendship', 8), teamwork = rating('rate_teamwork', 6);
  var couple_stats = {trust, intimacy, communication, vision, friendship, teamwork};
  var baby_readiness = Math.min(100, Math.round((trust * 0.4 + intimacy * 0.3 + communication * 0.3) * 0.3 + (teamwork * 0.5 + trust * 0.5) * 0.3 + (friendship * 0.4 + vision * 0.6) * 0.2 + 65 * 0.2));
  return {couple_stats, baby_readiness};
}

function mergeStats(existing, newStats, slot) {
  var merged = {};
  Object.keys(newStats).forEach(k => {
    var ex = existing[k] != null ? existing[k] : 60;
    merged[k] = (ex === 60 || ex == null) ? newStats[k] : Math.round((ex + newStats[k]) / 2);
  });
  return merged;
}

async function completeIntake() {
  var nextBtn = document.querySelector('.intake-next');
  if(nextBtn){ nextBtn.disabled = true; nextBtn.textContent = 'Saving…'; }
  await saveIntakeProgress(true);
  document.getElementById('intake-screen').style.display = 'none';
  showToast('Profile complete! Welcome ✨');
  spawnConfetti();
  if(sbClient && currentRelationshipId) {
    var res = await sbClient.from('relationships').select('*').eq('id', currentRelationshipId).single();
    if(res.data) { liveData = res.data; var slot = currentMySlot || 'A'; if(slot === 'A') liveData.intake_a_done = true; else liveData.intake_b_done = true; startMainApp(liveData); }
  } else {
    var slot2 = currentMySlot || 'A'; if(slot2 === 'A') liveData.intake_a_done = true; else liveData.intake_b_done = true; startMainApp(liveData);
  }
}

// ==================== FORGOT PASSWORD ====================
function showForgotPassword() {
  ['setup-screen','auth-screen','relationship-setup-screen','waiting-screen','forgot-password-screen','main-app'].forEach(id => { var el=document.getElementById(id); if(el) el.style.display='none'; });
  document.getElementById('forgot-password-screen').style.display = 'flex';
  var authEmail = document.getElementById('auth-email');
  var resetEmail = document.getElementById('reset-email');
  if(authEmail && resetEmail && authEmail.value) resetEmail.value = authEmail.value;
}

function showSignIn() {
  ['setup-screen','auth-screen','relationship-setup-screen','waiting-screen','forgot-password-screen','main-app'].forEach(id => { var el=document.getElementById(id); if(el) el.style.display='none'; });
  document.getElementById('auth-screen').style.display = 'flex';
}

async function sendPasswordReset() {
  var emailEl = document.getElementById('reset-email');
  var errEl = document.getElementById('reset-error');
  var sucEl = document.getElementById('reset-success');
  var btn = document.getElementById('reset-btn');
  if(errEl) errEl.textContent = '';
  if(sucEl) sucEl.textContent = '';
  var email = emailEl ? emailEl.value.trim() : '';
  if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { if(errEl) errEl.textContent = 'Enter a valid email address.'; return; }
  if(!sbClient) { if(errEl) errEl.textContent = 'Not connected to Supabase.'; return; }
  if(btn) { btn.disabled = true; btn.innerHTML = 'Sending…'; }
  var res = await sbClient.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname + '?mode=reset' });
  if(btn) { btn.disabled = false; btn.innerHTML = 'Send Reset Link ✉️'; }
  if(res.error) { if(errEl) errEl.textContent = res.error.message; return; }
  if(sucEl) sucEl.textContent = '✉️ Reset link sent to ' + email + '. Check your inbox.';
}

// ==================== STARS ====================
function initStars() {
  const canvas = document.getElementById('stars-canvas');
  if(!canvas) return;
  canvas.width = window.innerWidth; 
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  const stars = Array.from({length:150}, () => ({ 
    x: Math.random()*canvas.width, 
    y: Math.random()*canvas.height, 
    r: Math.random()*1.5, 
    a: Math.random() 
  }));
  function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    stars.forEach(s => { 
      ctx.beginPath(); 
      ctx.arc(s.x,s.y,s.r,0,Math.PI*2); 
      ctx.fillStyle = `rgba(245,223,160,${0.2+Math.sin(s.a)*0.3})`; 
      ctx.fill(); 
      s.a += 0.01; 
    });
    requestAnimationFrame(draw);
  }
  draw();
}

// ==================== INIT ====================
initStars();

// ==================== MAKE FUNCTIONS GLOBAL ====================
// This makes all functions accessible to HTML onclick attributes

// Navigation functions
window.switchScreen = switchScreen;
window.switchGrowthTab = switchGrowthTab;

// Achievement functions
window.closeAchievement = closeAchievement;
window.unlockAchievement = unlockAchievement;

// Timer functions
window.closeTimerModal = closeTimerModal;
window.toggleTimerModal = toggleTimerModal;
window.openTimerModal = openTimerModal;

// Journal functions
window.addJournalEntry = addJournalEntry;

// Dream functions
window.saveDreamEntry = saveDreamEntry;

// Private notes
window.savePrivateNote = savePrivateNote;

// Shadow work
window.saveShadowWork = saveShadowWork;

// Temple functions
window.logWater = logWater;
window.startBreathSession = startBreathSession;
window.markGateComplete = markGateComplete;
window.markTemplePractice = markTemplePractice;
window.saveTempleReflection = saveTempleReflection;
window.setFoundation = setFoundation;
window.openFoundationModal = openFoundationModal;

// Reset
window.resetMetrics = resetMetrics;

// Intake
window.intakeNext = intakeNext;
window.intakeBack = intakeBack;
window.selectIntakeScale = selectIntakeScale;
window.selectIntakeYN = selectIntakeYN;

// Auth
window.showForgotPassword = showForgotPassword;
window.showSignIn = showSignIn;
window.sendPasswordReset = sendPasswordReset;

// ⭐ PATH ACTIVITIES ⭐
window.completePathActivity = completePathActivity;
window.markTaskComplete = markTaskComplete;

console.log('✅ completePathActivity registered:', typeof window.completePathActivity);
console.log('✅ App loaded successfully!');
