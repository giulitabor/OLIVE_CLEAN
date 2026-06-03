// ============================================================
// OLIVIUM GAME — webgame3.js
// Auth is 100% delegated to connection.ts (already loaded on
// the page).  This file only manages game state + UI.
//
// connection.ts exposes on window:
//   connectWallet()       — Phantom, fires olivium:connected
//   connectEmail(e, w)    — email+custodial, fires olivium:connected
//   disconnectWallet()    — any mode, fires olivium:disconnected
//   getIdentity()         → { type, wallet, label, email }
//   isConnected()         → boolean
//   sb                    — Supabase client
// ============================================================
import {
  sb,
  connection,
  getIdentity,
  isConnected,
} from "./connection";

// ── Supabase client — provided by connection.ts ─────────────
// We read it lazily via window.sb so connection.ts init order
// doesn't matter.
function getSb() { return window.sb || null; }

// ── Current connected identity (mirrors connection.ts state) ─
let currentUser = null; // { id, display, type }

// ============================================================
// REACT TO CONNECTION.TS EVENTS
// ============================================================

window.addEventListener('olivium:connected', async (e) => {
    const identity = window.getIdentity?.() ?? e.detail;
    if (!identity || identity.type === 'guest') return;

    currentUser = {
        id:      identity.wallet,                    // on-chain pubkey or custodial
        display: identity.label,
        type:    identity.type,                      // 'wallet' | 'email'
    };

    updateNavUI(currentUser);
    hideConnectModal();

    const loaded = await loadGameFromCloud();
    showToast(loaded ? '✅ Estate loaded!' : '✅ Connected — new estate started');
    if (!loaded) log('🌿 Fresh estate created. Welcome!');
});

window.addEventListener('olivium:disconnected', () => {
    currentUser = null;
    updateNavUI(null);
    showToast('👋 Disconnected. Progress won\'t be saved.');
    log('🔒 Session ended.');
});

// ============================================================
// MODAL — built dynamically so it always matches live state
// ============================================================

function showConnectModal() {
    buildModalContent();
    document.getElementById('connectModal').style.display = 'flex';
}

function hideConnectModal() {
    const m = document.getElementById('connectModal');
    if (m) m.style.display = 'none';
}

function buildModalContent() {
    const modal = document.getElementById('connectModal');
    if (!modal) return;

    modal.innerHTML = `
    <div style="max-width:420px;width:100%;background:#0d0d0b;border:1px solid #2a2a20;
                border-radius:24px;padding:32px;position:relative;
                font-family:'JetBrains Mono',monospace;margin:16px;">

      <button id="closeConnectModalBtn"
        style="position:absolute;top:16px;right:20px;background:none;border:none;
               color:#888;font-size:22px;cursor:pointer;line-height:1;">&times;</button>

      <div style="text-align:center;margin-bottom:24px;">
        <span style="font-size:32px;">🌿</span>
        <h2 style="color:#fff;font-family:'Playfair Display',serif;
                   font-size:22px;margin:8px 0 4px;">Connect to Olivium</h2>
        <p style="color:#666;font-size:11px;letter-spacing:.1em;text-transform:uppercase;">
          Choose your verification method</p>
      </div>

      <!-- PHANTOM WALLET -->
      <div style="background:#111;border:1px solid #222;border-radius:16px;
                  padding:16px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;
                    align-items:center;margin-bottom:6px;">
          <span style="color:#fff;font-size:13px;font-weight:700;">◎ Phantom Wallet</span>
          <span style="background:rgba(197,160,89,.1);color:#C5A059;font-size:9px;
                       padding:2px 8px;border-radius:20px;">SOLANA</span>
        </div>
        <p style="color:#555;font-size:11px;margin-bottom:12px;">
          Connect via Phantom extension. Signs a message — no transaction needed.</p>
        <button id="modal-phantom-btn"
          style="width:100%;background:#5a7a2b;color:#fff;font-size:12px;
                 font-weight:700;padding:10px;border-radius:12px;border:none;
                 cursor:pointer;letter-spacing:.05em;">
          Connect Phantom
        </button>
        <div id="modal-wallet-status"
             style="font-size:11px;color:#ef4444;margin-top:8px;min-height:16px;"></div>
      </div>

      <!-- EMAIL (custodial) -->
      <div style="background:#111;border:1px solid #222;border-radius:16px;padding:16px;">
        <div style="display:flex;justify-content:space-between;
                    align-items:center;margin-bottom:6px;">
          <span style="color:#fff;font-size:13px;font-weight:700;">✉ Email Profile</span>
          <span style="background:rgba(59,130,246,.1);color:#60a5fa;font-size:9px;
                       padding:2px 8px;border-radius:20px;">CUSTODIAL</span>
        </div>
        <p style="color:#555;font-size:11px;margin-bottom:12px;">
          Sign in with your Olivium email. Your custodial wallet is resolved automatically.</p>

        <input id="modal-email-input" type="email" placeholder="your@email.com"
          style="width:100%;box-sizing:border-box;background:#0d0d0b;border:1px solid #333;
                 color:#fff;padding:9px 12px;border-radius:10px;font-size:12px;
                 font-family:inherit;outline:none;margin-bottom:8px;" />

        <input id="modal-password-input" type="password" placeholder="Password"
          style="width:100%;box-sizing:border-box;background:#0d0d0b;border:1px solid #333;
                 color:#fff;padding:9px 12px;border-radius:10px;font-size:12px;
                 font-family:inherit;outline:none;margin-bottom:8px;" />

        <button id="modal-email-btn"
          style="width:100%;background:#1e3a5f;color:#60a5fa;font-size:12px;
                 font-weight:700;padding:10px;border-radius:10px;border:1px solid #2563eb;
                 cursor:pointer;">
          Sign In
        </button>
        <div id="modal-email-status"
             style="font-size:11px;color:#60a5fa;margin-top:8px;min-height:16px;"></div>
      </div>
    </div>`;

    // ── wire events ──────────────────────────────────────────

    document.getElementById('closeConnectModalBtn').onclick = hideConnectModal;
    modal.onclick = (e) => { if (e.target === modal) hideConnectModal(); };

    // Phantom
    document.getElementById('modal-phantom-btn').onclick = async () => {
        const statusEl = document.getElementById('modal-wallet-status');
        const btn      = document.getElementById('modal-phantom-btn');
        btn.disabled   = true;
        btn.innerText  = 'Connecting…';
        statusEl.innerText = '';
        try {
            // Delegates entirely to connection.ts — it fires olivium:connected
            await window.connectWallet();
        } catch (err) {
            statusEl.style.color = '#ef4444';
            statusEl.innerText   = err.message || 'Connection failed.';
            btn.disabled = false;
            btn.innerText = 'Connect Phantom';
        }
    };

    // Email / password — Supabase password auth, then look up custodial wallet
    document.getElementById('modal-email-btn').onclick = async () => {
        const emailInput = document.getElementById('modal-email-input');
        const passInput  = document.getElementById('modal-password-input');
        const statusEl   = document.getElementById('modal-email-status');
        const btn        = document.getElementById('modal-email-btn');

        const email    = emailInput.value.trim();
        const password = passInput.value;

        if (!email || !email.includes('@')) {
            statusEl.style.color  = '#ef4444';
            statusEl.innerText    = 'Enter a valid email.';
            return;
        }
        if (!password) {
            statusEl.style.color = '#ef4444';
            statusEl.innerText   = 'Enter your password.';
            return;
        }

        btn.disabled  = true;
        btn.innerText = 'Signing in…';
        statusEl.innerText = '';

        try {
            const sb = getSb();
            if (!sb) throw new Error('Supabase not initialised yet.');

            // 1. Supabase email+password sign-in
            const { data: authData, error: authErr } =
                await sb.auth.signInWithPassword({ email, password });
            if (authErr) throw authErr;

            // 2. Fetch custodial wallet from your profiles / users table
            //    Adjust the table name + column to match your schema.
            const userId = authData.user.id;
            const { data: profile, error: profileErr } = await sb
                .from('users')                      // ← your table
                .select('wallet')            // ← your column
                .eq('id', userId)
                .maybeSingle();

            if (profileErr) throw profileErr;
            if (!profile?.wallet)
                throw new Error('No custodial wallet found for this account.');

            // 3. Hand off to connection.ts — fires olivium:connected
            await window.connectEmail(email, profile.wallet);

        } catch (err) {
            statusEl.style.color = '#ef4444';
            statusEl.innerText   = err.message || 'Sign-in failed.';
            btn.disabled  = false;
            btn.innerText = 'Sign In';
        }
    };
}

// ============================================================
// NAV UI
// ============================================================

function updateNavUI(user) {
    const navIdentity = document.getElementById('nav-identity-display');
    const navTier     = document.getElementById('nav-tier-label');
    const connectBtn  = document.getElementById('connectBtn');

    if (user) {
        const icon = user.type === 'wallet' ? '◎' : '✉';
        if (navIdentity) navIdentity.innerText = user.display;
        if (navTier)     navTier.innerText     = 'Mignole Steward';
        if (connectBtn) {
            connectBtn.innerText             = `${icon} Disconnect`;
            connectBtn.onclick               = handleDisconnect;
            connectBtn.style.background      = '#3a2a10';
            connectBtn.style.borderColor     = '#C5A059';
        }
    } else {
        if (navIdentity) navIdentity.innerText = 'NOT CONNECTED';
        if (navTier)     navTier.innerText     = 'Guest Mode';
        if (connectBtn) {
            connectBtn.innerText         = 'Connect Profile';
            connectBtn.onclick           = showConnectModal;
            connectBtn.style.background  = '';
            connectBtn.style.borderColor = '';
        }
    }
}

async function handleDisconnect() {
    // connection.ts handles both wallet and email — one function for all
    await window.disconnectWallet?.();
}

// ============================================================
// CLOUD SAVE / LOAD  (via window.sb set by connection.ts)
// ============================================================

async function saveGameToCloud() {
    const sb = getSb();
    if (!currentUser || !sb) return;

    const saveData = {
        wallet:           currentUser.id,
        sol:              state.sol,
        seeds:            state.seeds,
        oil:              state.oil,
        hopper:           state.hopper,
        lifetimeSol:      state.lifetimeSol,
        treesPlanted:     state.treesPlanted,
        totalHarvests:    state.totalHarvests,
        comboRecord:      state.comboRecord,
        rareCount:        state.rareCount,
        trees:            JSON.stringify(state.trees),
        upgrades:         JSON.stringify(state.upgrades),
        skills:           state.skills,
        skillMultipliers: JSON.stringify(state.skillMultipliers),
        mill:             JSON.stringify(state.mill),
        quest:            JSON.stringify(state.quest),
        achievements:     JSON.stringify(state.achievements),
        updated_at:       new Date().toISOString(),
    };

    try {
        const { error } = await sb
            .from('game_saves')
            .upsert(saveData, { onConflict: 'wallet' });
        if (error) console.error('Save error:', error);
        else console.log('💾 Saved');
    } catch (err) {
        console.error('Cloud save failed:', err);
    }
}

async function loadGameFromCloud() {
    const sb = getSb();
    if (!currentUser || !sb) return false;

    try {
        const { data, error } = await sb
            .from('game_saves')
            .select('*')
            .eq('wallet', currentUser.id)
            .maybeSingle();

        if (error || !data) return false;

        state.sol              = data.sol;
        state.seeds            = data.seeds;
        state.oil              = data.oil;
        state.hopper           = data.hopper;
        state.lifetimeSol      = data.lifetimeSol;
        state.treesPlanted     = data.treesPlanted;
        state.totalHarvests    = data.totalHarvests;
        state.comboRecord      = data.comboRecord;
        state.rareCount        = data.rareCount;
        state.trees            = JSON.parse(data.trees);
        state.upgrades         = JSON.parse(data.upgrades);
        state.skills           = data.skills || [];
        state.skillMultipliers = JSON.parse(data.skillMultipliers);
        state.mill             = JSON.parse(data.mill);
        state.quest            = JSON.parse(data.quest);
        state.achievements     = JSON.parse(data.achievements);

        // Re-apply skill multipliers
        if (state.skills.includes('yield')) state.skillMultipliers.yield      = 1.8;
        if (state.skills.includes('speed')) state.skillMultipliers.speed      = 2.5;
        if (state.skills.includes('cold'))  state.skillMultipliers.extraction = 1.6;
        if (state.skills.includes('rare'))  state.skillMultipliers.rare       = 0.25;

        render();
        log('🌿 Estate loaded from cloud. Welcome back!');
        return true;
    } catch (err) {
        console.error('Load error:', err);
        return false;
    }
}

// ============================================================
// GAME STATE
// ============================================================

const state = {
    sol: 25.0, seeds: 0, oil: 0, hopper: 0, lifetimeSol: 25.0,
    treesPlanted: 0, totalHarvests: 0, comboRecord: 1.0, rareCount: 0,
    trees: [],
    upgrades: { irrigation: false, misting: false, fertilizer: false },
    skills: [],
    skillMultipliers: { yield: 1.0, speed: 1.0, extraction: 1.0, rare: 0.1 },
    world: { time: 8, temp: 24, weather: 'Clear', season: 'Spring', price: 2.50, demand: 'Normal' },
    mill: { mash: 0, gunk: 0 },
    combo: 1.0, comboRef: null,
    quest: { target: 50, current: 0, reward: 10, seedReward: 1 },
    achievements: { firstHarvest: false, groveMaster: false, tycoon: false, comboKing: false, rareCollector: false },
};

const rarityIcons = {
    common: { icon: '🌳', bonus: 1.0, name: 'Common' },
    rare:   { icon: '💎', bonus: 2.0, name: 'Rare' },
};

// ============================================================
// GAME LOGIC  (unchanged from original)
// ============================================================

function getRarity() {
    return Math.random() < state.skillMultipliers.rare ? 'rare' : 'common';
}

function showToast(msg, isError = false) {
    const t = document.createElement('div');
    t.innerText = msg;
    Object.assign(t.style, {
        position: 'fixed', bottom: '100px', left: '50%',
        transform: 'translateX(-50%)',
        background: isError ? '#ef4444' : 'linear-gradient(135deg,#c9903e,#b8860b)',
        color: isError ? '#fff' : '#000',
        padding: '10px 20px', borderRadius: '40px',
        fontSize: '12px', fontWeight: 'bold',
        zIndex: '9999', whiteSpace: 'nowrap',
    });
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
}

function log(msg) {
    const ledger = document.getElementById('ledger');
    if (!ledger) return;
    const entry = document.createElement('div');
    entry.innerHTML = `> ${msg}`;
    entry.className = 'opacity-60 pb-1';
    ledger.prepend(entry);
    if (ledger.children.length > 20) ledger.lastChild.remove();
}

function addCombo() {
    state.combo += 0.15;
    if (state.combo > state.comboRecord) state.comboRecord = state.combo;
    const el = document.getElementById('combo-display');
    if (el) el.innerHTML = `${state.combo.toFixed(1)}x`;
    clearTimeout(state.comboRef);
    state.comboRef = setTimeout(() => {
        state.combo = 1.0;
        if (el) el.innerHTML = '1.0x';
    }, 3000);
    if (state.comboRecord >= 5 && !state.achievements.comboKing) {
        state.achievements.comboKing = true;
        state.sol += 5;
        showToast('🏆 Combo King! +5 SOL');
        render();
        if (currentUser) saveGameToCloud();
    }
}

function buyTree() {
    if (state.sol < 5) { showToast('Need 5 SOL!', true); return; }
    state.sol -= 5;
    const rarity = getRarity();
    if (rarity === 'rare') state.rareCount++;
    state.trees.push({
        id: '#' + (state.treesPlanted + 1),
        age: 0, health: 100, water: 85, pests: 0,
        stage: 'seed', rarity,
    });
    state.treesPlanted++;
    log(`🌱 Planted ${rarityIcons[rarity].name} tree`);
    render();
    checkAchievements();
    if (currentUser) saveGameToCloud();
}

function interactTree(index) {
    const tree = state.trees[index];
    if (!tree || tree.health <= 0) return;
    if (tree.stage === 'mature') {
        const finalYield = 10
            * (tree.health / 100)
            * (tree.water  / 100)
            * rarityIcons[tree.rarity].bonus
            * state.skillMultipliers.yield
            * state.combo
            * ((100 - tree.pests) / 100);
        state.hopper         += finalYield;
        state.totalHarvests  += 1;
        state.quest.current  += finalYield;
        tree.age = 0; tree.stage = 'seed'; tree.pests = 0;
        addCombo();
        showToast(`+${finalYield.toFixed(1)}kg`);
        log(`🫒 Harvested ${finalYield.toFixed(1)}kg`);
        checkQuest();
        checkAchievements();
    } else {
        tree.water = Math.min(100, tree.water + 30);
        showToast('💧 +30% Water');
    }
    render();
    if (currentUser) saveGameToCloud();
}

function pressMill() {
    if (state.hopper <= 0)      { showToast('No fruit in hopper!', true); return; }
    if (state.mill.gunk >= 100) { showToast('Mill clogged! Clean it!', true); return; }
    state.mill.mash  = Math.min(100, state.mill.mash + 15);
    state.hopper     = Math.max(0,   state.hopper    - 1.5);
    state.mill.gunk  = Math.min(100, state.mill.gunk + 1.5);
    if (state.mill.mash >= 100) {
        const isNight   = state.world.time > 20 || state.world.time < 6;
        const coldBonus = (isNight && state.skillMultipliers.extraction > 1) ? 1.5 : 1.0;
        const oilYield  = (state.hopper + 15) * 0.22
            * ((100 - state.mill.gunk) / 100)
            * coldBonus
            * state.skillMultipliers.extraction;
        state.oil       += oilYield;
        state.hopper     = 0;
        state.mill.mash  = 0;
        log(`🏺 Pressed ${oilYield.toFixed(2)}L EVOO`);
        showToast(`+${oilYield.toFixed(1)}L Oil`);
    }
    render();
    if (currentUser) saveGameToCloud();
}

function cleanMill() {
    if (state.sol < 0.2) { showToast('Need 0.2 SOL', true); return; }
    state.sol -= 0.2; state.mill.gunk = 0;
    showToast('Mill cleaned!'); log('🧼 Mill cleaned'); render();
    if (currentUser) saveGameToCloud();
}

function upgrade(type) {
    const costs = { irrigation: 15, misting: 10, fertilizer: 8 };
    if (state.sol < costs[type])  { showToast(`Need ${costs[type]} SOL`, true); return; }
    if (state.upgrades[type])     { showToast('Already purchased!', true); return; }
    state.sol -= costs[type]; state.upgrades[type] = true;
    log(`✅ ${type} installed!`); render();
    if (currentUser) saveGameToCloud();
}

function unlockSkill(skill) {
    const costs = { yield: 5, speed: 5, cold: 5, rare: 8 };
    if (state.seeds < costs[skill])   { showToast(`Need ${costs[skill]} Seeds`, true); return; }
    if (state.skills.includes(skill)) { showToast('Already unlocked!', true); return; }
    state.seeds -= costs[skill]; state.skills.push(skill);
    if (skill === 'yield') state.skillMultipliers.yield      = 1.8;
    if (skill === 'speed') state.skillMultipliers.speed      = 2.5;
    if (skill === 'cold')  state.skillMultipliers.extraction = 1.6;
    if (skill === 'rare')  state.skillMultipliers.rare       = 0.25;
    log(`✨ Unlocked ${skill.toUpperCase()}!`); render();
    if (currentUser) saveGameToCloud();
}

function sellOil() {
    if (state.oil < 0.1) { showToast('No oil to sell', true); return; }
    const revenue = state.oil * state.world.price;
    state.sol += revenue; state.lifetimeSol += revenue;
    showToast(`+${revenue.toFixed(2)} SOL`);
    log(`💰 Sold ${state.oil.toFixed(1)}L for ${revenue.toFixed(2)} SOL`);
    state.oil = 0; render(); checkAchievements();
    if (currentUser) saveGameToCloud();
}

function sprayGrove() {
    if (state.sol < 0.5) { showToast('Need 0.5 SOL', true); return; }
    state.sol -= 0.5; state.trees.forEach(t => t.pests = 0);
    showToast('Pests removed!'); log('🐛 Pest control applied'); render();
    if (currentUser) saveGameToCloud();
}

function prestige() {
    const reward = Math.floor(state.lifetimeSol / 40);
    if (reward < 1) { showToast('Earn 40 lifetime SOL first!', true); return; }
    if (confirm(`Liquidate estate for ${reward} Ancient Seeds?`)) {
        state.seeds += reward;
        state.sol = 25; state.oil = 0; state.hopper = 0;
        state.trees = []; state.lifetimeSol = 0;
        state.totalHarvests = 0; state.rareCount = 0;
        state.mill = { mash: 0, gunk: 0 };
        for (let i = 0; i < 3; i++) buyTree();
        log('🔄 Estate liquidated! Ancient knowledge preserved.'); render();
        if (currentUser) saveGameToCloud();
    }
}

function checkAchievements() {
    const a = state.achievements;
    if (state.totalHarvests >= 1 && !a.firstHarvest) {
        a.firstHarvest = true; state.sol += 2; showToast('🏆 First Harvest! +2 SOL');
    }
    if (state.trees.length >= 10 && !a.groveMaster) {
        a.groveMaster = true; state.sol += 10; state.seeds++;
        showToast('🏆 Grove Master! +10 SOL + Seed');
    }
    if (state.lifetimeSol >= 100 && !a.tycoon) {
        a.tycoon = true; state.sol += 20; showToast('🏆 Tycoon! +20 SOL');
    }
    if (state.rareCount >= 5 && !a.rareCollector) {
        a.rareCollector = true; state.sol += 15; state.seeds++;
        showToast('🏆 Rare Collector! +15 SOL + Seed');
    }
    render();
}

function checkQuest() {
    if (state.quest.current >= state.quest.target) {
        state.sol += state.quest.reward; state.seeds += state.quest.seedReward;
        showToast(`✅ Quest complete! +${state.quest.reward} SOL`);
        state.quest.current = 0;
        state.quest.target  = Math.floor(Math.random() * 80) + 40;
        state.quest.reward  = Math.floor(state.quest.target / 5) + 5;
        render();
    }
}

// ── Game loops ───────────────────────────────────────────────

function gameLoop() {
    state.trees.forEach(tree => {
        if (tree.health <= 0) return;
        let waterLoss = state.world.weather === 'Heatwave' ? 12
            : state.world.weather === 'Rainy' ? -8 : 3;
        if (state.upgrades.irrigation && tree.water < 70) waterLoss = -5;
        tree.water = Math.max(0, Math.min(100, tree.water - waterLoss));
        const growthRate = 0.05 * state.skillMultipliers.speed;
        if (tree.water > 40 && tree.health > 30) tree.age += growthRate;
        if (tree.age > 5  && tree.stage === 'seed')    tree.stage = 'sapling';
        if (tree.age > 12 && tree.stage === 'sapling') tree.stage = 'mature';
        if (state.world.season === 'Summer' && Math.random() < 0.03)
            tree.pests = Math.min(100, tree.pests + 5);
        if (state.upgrades.misting && tree.pests > 0)
            tree.pests = Math.max(0, tree.pests - 2);
        if (tree.water < 15) tree.health -= 4;
        if (tree.pests > 40) tree.health -= 3;
        if (tree.health <= 0) tree.stage = 'dead';
    });
    state.mill.mash = Math.max(0, state.mill.mash - 4);
    render();
}

function weatherCycle() {
    const weathers = [
        { type: 'Clear', temp: 24 },
        { type: 'Rainy', temp: 18 },
        { type: 'Heatwave', temp: 36 },
    ];
    const w = weathers[Math.floor(Math.random() * 3)];
    state.world.weather = w.type; state.world.temp = w.temp;
    if (w.type === 'Rainy') state.trees.forEach(t => t.water = Math.min(100, t.water + 15));
    render();
}

function marketCycle() {
    const drift        = (Math.random() - 0.5) * 0.8;
    state.world.price  = Math.max(0.8, Math.min(6.0, state.world.price + drift));
    const levels       = ['Very Low', 'Low', 'Normal', 'High', 'Very High'];
    state.world.demand = levels[Math.min(4, Math.floor(state.world.price / 1.2))];
    const trendEl = document.getElementById('ui-trend');
    if (trendEl) {
        trendEl.innerText = (drift >= 0 ? '+' : '') + (drift * 10).toFixed(1) + '%';
        trendEl.className = drift >= 0 ? 'text-xs text-green-500' : 'text-xs text-red-500';
    }
    const demandEl = document.getElementById('ui-demand');
    if (demandEl) demandEl.innerText = state.world.demand;
    render();
}

// ── Render ───────────────────────────────────────────────────

function render() {
    if (!document.getElementById('ui-sol')) return;

    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = val;
    };

    set('ui-sol',    state.sol.toFixed(2));
    set('ui-oil',    state.oil.toFixed(1));
    set('ui-seeds',  state.seeds);
    set('ui-hopper', state.hopper.toFixed(1) + ' kg');
    set('ui-price',  state.world.price.toFixed(2));
    set('ui-time',   state.world.time.toString().padStart(2, '0') + ':00');
    set('ui-temp',   state.world.temp + '°C');
    set('ui-weather',state.world.weather);
    set('ui-level',  Math.floor(state.lifetimeSol / 20) + 1);
    set('tree-count',state.trees.length);
    set('rare-count',state.rareCount);

    const mashBar = document.getElementById('mash-bar');
    const gunkBar = document.getElementById('gunk-bar');
    if (mashBar) mashBar.style.width = state.mill.mash + '%';
    if (gunkBar) gunkBar.style.width = state.mill.gunk + '%';
    set('mash-pct', state.mill.mash + '%');
    set('gunk-pct', state.mill.gunk + '%');
    set('quest-current', state.quest.current.toFixed(0));
    set('quest-target',  state.quest.target);
    const questBar = document.getElementById('quest-progress');
    if (questBar) questBar.style.width = (state.quest.current / state.quest.target) * 100 + '%';
    set('seeds-display', state.seeds);

    set('stats-lifetime',      state.lifetimeSol.toFixed(2));
    set('stats-trees-planted', state.treesPlanted);
    set('stats-harvests',      state.totalHarvests);
    set('stats-combo',         `x${state.comboRecord.toFixed(1)}`);
    set('stats-rare',          state.rareCount);

    const a = state.achievements;
    set('ach1', a.firstHarvest  ? '✅' : '❌');
    set('ach2', a.groveMaster   ? '✅' : '❌');
    set('ach3', a.tycoon        ? '✅' : '❌');
    set('ach4', a.comboKing     ? '✅' : '❌');
    set('ach5', a.rareCollector ? '✅' : '❌');

    const seasons      = ['Spring', 'Summer', 'Autumn', 'Winter'];
    state.world.season = seasons[Math.floor(Date.now() / 600000) % 4];
    const seasonEmoji  = { Spring: '🌸', Summer: '☀️', Autumn: '🍂', Winter: '❄️' }[state.world.season];
    set('ui-season', seasonEmoji);

    const container = document.getElementById('grove-container');
    if (!container) return;
    container.innerHTML = '';

    if (state.trees.length === 0) {
        container.innerHTML =
            '<div class="text-center py-10 opacity-50 col-span-full">Tap + PLANT to start</div>';
        return;
    }

    state.trees.forEach((tree, idx) => {
        const isReady = tree.stage === 'mature';
        const emoji   = { seed: '🌱', sapling: '🌿', mature: '🫒', dead: '🍂' }[tree.stage] || '🌱';
        const card    = document.createElement('div');
        card.className = `tree-card ${isReady ? 'ready' : ''} ${tree.pests > 30 ? 'infested' : ''}`;
        card.onclick   = () => interactTree(idx);
        card.innerHTML = `
            <div class="tree-emoji">${emoji}</div>
            <div class="tree-id">${tree.id}</div>
            <div class="progress-bar">
              <div class="progress-fill fill-water"  style="width:${tree.water}%"></div></div>
            <div class="progress-bar">
              <div class="progress-fill fill-health" style="width:${tree.health}%"></div></div>
            ${tree.pests > 0
                ? `<div class="progress-bar">
                     <div class="progress-fill fill-pest" style="width:${tree.pests}%"></div>
                   </div>` : ''}
            ${isReady          ? '<div class="text-center text-gold text-[9px] mt-2">⬤ READY</div>' : ''}
            ${tree.rarity === 'rare' ? '<div class="rarity-badge">💎</div>' : ''}`;
        container.appendChild(card);
    });
}

// ── Panel helpers ────────────────────────────────────────────

function openPanel(panelId) {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('open'));
    document.getElementById(`panel-${panelId}`)?.classList.add('open');
    document.getElementById('panel-overlay')?.classList.add('active');
}

function closePanel() {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('open'));
    document.getElementById('panel-overlay')?.classList.remove('active');
}

// ============================================================
// INIT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('plant-btn').onclick  = buyTree;
    document.getElementById('spray-btn').onclick  = sprayGrove;
    document.getElementById('sell-btn').onclick   = sellOil;
    document.getElementById('fab-mill').onclick   = pressMill;
    document.getElementById('connectBtn').onclick = showConnectModal;

    document.querySelectorAll('.nav-item').forEach(item => {
        item.onclick = () => openPanel(item.dataset.panel);
    });

    window.game       = { upgrade, unlockSkill, cleanMill, prestige, buyTree, sprayGrove, sellOil, pressMill };
    window.closePanel = closePanel;

    // If connection.ts already restored a session before DOMContentLoaded
    // (unlikely but possible), sync the UI now.
    if (window.isConnected?.()) {
        const id = window.getIdentity();
        currentUser = { id: id.wallet, display: id.label, type: id.type };
        updateNavUI(currentUser);
        loadGameFromCloud();
    } else if (state.trees.length === 0) {
        // Guest start
        for (let i = 0; i < 3; i++) buyTree();
        log('🌿 Tap trees to water/harvest. Press 🏺 for the mill!');
        log('🔐 Connect your profile to save progress to the cloud.');
    }

    setInterval(gameLoop,    2000);
    setInterval(weatherCycle,20000);
    setInterval(marketCycle, 15000);
    setInterval(() => { state.world.time = (state.world.time + 1) % 24; render(); }, 30000);
    setInterval(() => { if (currentUser) saveGameToCloud(); }, 30000);

    render();
});
