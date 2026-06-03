// ============================================================
// OLIVIUM GAME - Complete with Wallet Balances
// ============================================================

import { sb, getIdentity, isConnected, connection } from "./src/connection.ts";
import { PublicKey } from "@solana/web3.js";

let currentUser = null;
let walletSolBalance = 0;
let walletOlvBalance = 0;

// ============================================================
// GAME STATE
// ============================================================

const state = {
    sol: 25.0, seeds: 0, oil: 0, hopper: 0, lifetimeSol: 25.0,
    treesPlanted: 3, totalHarvests: 0, comboRecord: 1.0, rareCount: 0,
    trees: [],
    upgrades: { irrigation: false, misting: false, fertilizer: false },
    skills: [],
    skillMultipliers: { yield: 1.0, speed: 1.0, extraction: 1.0, rare: 0.1 },
    world: { time: 8, temp: 24, weather: 'Clear', season: 'Spring', price: 2.50, demand: 'Normal' },
    mill: { mash: 0, gunk: 0 },
    combo: 1.0, comboRef: null,
    quest: { target: 50, current: 0, reward: 10, seedReward: 1 },
    achievements: { firstHarvest: false, groveMaster: false, tycoon: false, comboKing: false, rareCollector: false }
};

const rarityIcons = {
    common: { icon: '🌳', bonus: 1.0, name: 'Common' },
    rare: { icon: '💎', bonus: 2.0, name: 'Rare' }
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function getRarity() {
    let roll = Math.random();
    if (roll < state.skillMultipliers.rare) return 'rare';
    return 'common';
}

function showToast(msg, isError = false) {
    const toast = document.createElement('div');
    toast.innerText = msg;
    toast.style.position = 'fixed';
    toast.style.bottom = '100px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.background = isError ? '#ef4444' : 'linear-gradient(135deg, #c9903e, #b8860b)';
    toast.style.color = isError ? 'white' : 'black';
    toast.style.padding = '10px 20px';
    toast.style.borderRadius = '40px';
    toast.style.fontSize = '12px';
    toast.style.fontWeight = 'bold';
    toast.style.zIndex = '1000';
    toast.style.whiteSpace = 'nowrap';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
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
    const comboDisplay = document.getElementById('combo-display');
    if (comboDisplay) comboDisplay.innerHTML = `${state.combo.toFixed(1)}x`;
    clearTimeout(state.comboRef);
    state.comboRef = setTimeout(() => {
        state.combo = 1.0;
        if (comboDisplay) comboDisplay.innerHTML = '1.0x';
    }, 3000);
    if (state.comboRecord >= 5 && !state.achievements.comboKing) {
        state.achievements.comboKing = true;
        state.sol += 5;
        showToast("🏆 Combo King! +5 SOL");
        render();
        if (currentUser) saveGameToCloud();
    }
}

// ============================================================
// WALLET BALANCE FUNCTIONS
// ============================================================

async function fetchWalletBalances(walletAddress) {
    if (!walletAddress || !connection) return { sol: 0, olv: 0 };
    
    try {
        const balance = await connection.getBalance(new PublicKey(walletAddress));
        const solInSol = balance / 1_000_000_000;
        
        // OLV balance - replace with your actual OLV token logic
        let olvBalance = 2500; // Mock for now
        
        return { sol: solInSol, olv: olvBalance };
    } catch (err) {
        console.error("Balance fetch error:", err);
        return { sol: 0, olv: 0 };
    }
}

async function updateWalletBalancesUI() {
    if (!currentUser || !currentUser.wallet) return;
    
    const balances = await fetchWalletBalances(currentUser.wallet);
    walletSolBalance = balances.sol;
    walletOlvBalance = balances.olv;
    
    const walletSolEl = document.getElementById('wallet-sol-balance');
    const walletOlvEl = document.getElementById('wallet-olv-balance');
    const uiSolEl = document.getElementById('ui-sol');
    const uiOlvEl = document.getElementById('ui-olv');
    
    if (walletSolEl) walletSolEl.innerText = walletSolBalance.toFixed(4);
    if (walletOlvEl) walletOlvEl.innerText = Math.floor(walletOlvBalance);
    if (uiOlvEl) uiOlvEl.innerText = Math.floor(walletOlvBalance);
    
    if (uiSolEl && walletSolBalance > 0 && state.sol === 25) {
        state.sol = walletSolBalance;
        uiSolEl.innerText = state.sol.toFixed(4);
    }
    
    const estateValue = state.oil * state.world.price + state.hopper * 0.5;
    const estateValueEl = document.getElementById('estate-value');
    if (estateValueEl) estateValueEl.innerText = `Estate Value: ${estateValue.toFixed(2)} SOL`;
    
    render();
}

async function refreshBalances() {
    if (!currentUser) { showToast("Connect wallet first!", true); return; }
    showToast("Refreshing balances...");
    await updateWalletBalancesUI();
    showToast("Balances updated!");
    if (currentUser) await saveGameToCloud();
}

// ============================================================
// CONNECT MODAL FUNCTIONS
// ============================================================

function showConnectModal() {
    const modal = document.getElementById('connectModal');
    if (modal) modal.style.display = 'flex';
}

function hideConnectModal() {
    const modal = document.getElementById('connectModal');
    if (modal) modal.style.display = 'none';
}

// ============================================================
// DISCONNECT FUNCTION
// ============================================================

function handleDisconnect() {
    currentUser = null;
    
    const navIdentity = document.getElementById('nav-identity-display');
    const navTier = document.getElementById('nav-tier-label');
    const connectBtn = document.getElementById('connectBtn');
    const uiSolEl = document.getElementById('ui-sol');
    const walletSolEl = document.getElementById('wallet-sol-balance');
    const walletOlvEl = document.getElementById('wallet-olv-balance');
    
    if (navIdentity) navIdentity.innerText = 'NOT CONNECTED';
    if (navTier) navTier.innerText = 'Guest Mode';
    if (connectBtn) {
        connectBtn.innerText = 'Connect Profile';
        connectBtn.onclick = showConnectModal;
        connectBtn.style.background = '#5a7a2b';
        connectBtn.style.borderColor = '';
    }
    if (walletSolEl) walletSolEl.innerText = '0.00';
    if (walletOlvEl) walletOlvEl.innerText = '0';
    
    if (uiSolEl && state.sol === walletSolBalance) {
        state.sol = 25;
        uiSolEl.innerText = state.sol.toFixed(2);
    }
    
    showToast('🔒 Disconnected.');
    log('Disconnected from profile.');
    render();
}

// ============================================================
// WALLET CONNECTION (Phantom)
// ============================================================

async function connectWallet() {
    try {
        const provider = window.phantom?.solana || window.solana;
        
        if (!provider) {
            showToast("Please install Phantom wallet!", true);
            window.open("https://phantom.app/", "_blank");
            return;
        }
        
        const response = await provider.connect();
        const walletAddress = response.publicKey.toBase58();
        
        currentUser = {
            wallet: walletAddress,
            type: 'wallet',
            display: walletAddress.slice(0, 8) + '...'
        };
        
        localStorage.setItem('walletAddress', walletAddress);
        
        const navIdentity = document.getElementById('nav-identity-display');
        const navTier = document.getElementById('nav-tier-label');
        const connectBtn = document.getElementById('connectBtn');
        
        const icon = '◎';
        if (navIdentity) navIdentity.innerText = currentUser.display;
        if (navTier) navTier.innerText = 'Mignole Steward';
        if (connectBtn) {
            connectBtn.innerText = `${icon} Disconnect`;
            connectBtn.onclick = handleDisconnect;
            connectBtn.style.background = '#3a2a10';
            connectBtn.style.borderColor = '#C5A059';
        }
        
        hideConnectModal();
        showToast('✅ Wallet connected! Fetching balances...');
        
        await updateWalletBalancesUI();
        await loadGameFromCloud();
        
    } catch (err) {
        console.error("Wallet connection error:", err);
        showToast("Failed to connect wallet", true);
    }
}

// ============================================================
// EMAIL LOGIN
// ============================================================

async function emailLogin() {
    currentUser = {
        email: 'steward@olivium.io',
        wallet: 'email_' + Date.now(),
        type: 'email',
        display: 'steward@...'
    };
    
    const navIdentity = document.getElementById('nav-identity-display');
    const navTier = document.getElementById('nav-tier-label');
    const connectBtn = document.getElementById('connectBtn');
    
    const icon = '✉';
    if (navIdentity) navIdentity.innerText = currentUser.display;
    if (navTier) navTier.innerText = 'Mignole Steward';
    if (connectBtn) {
        connectBtn.innerText = `${icon} Disconnect`;
        connectBtn.onclick = handleDisconnect;
        connectBtn.style.background = '#3a2a10';
        connectBtn.style.borderColor = '#C5A059';
    }
    
    hideConnectModal();
    showToast('✅ Logged in! Loading your estate...');
    await loadGameFromCloud();
}

// ============================================================
// GAME ACTIONS
// ============================================================

function buyTree() {
    if (state.sol < 5) { showToast("Need 5 SOL!", true); return; }
    state.sol -= 5;
    const rarity = getRarity();
    if (rarity === 'rare') state.rareCount++;
    state.trees.push({
        id: '#' + (state.treesPlanted + 1),
        age: 0, health: 100, water: 85, pests: 0,
        stage: 'seed', rarity: rarity
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
        let baseYield = 10 * (tree.health / 100) * (tree.water / 100);
        let finalYield = baseYield * rarityIcons[tree.rarity].bonus * state.skillMultipliers.yield * state.combo;
        if (tree.pests > 0) finalYield *= (100 - tree.pests) / 100;
        
        state.hopper += finalYield;
        state.totalHarvests++;
        state.quest.current += finalYield;
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
    if (state.hopper <= 0) { showToast("No fruit in hopper!", true); return; }
    if (state.mill.gunk >= 100) { showToast("Mill clogged! Clean it!", true); return; }
    
    state.mill.mash += 15;
    state.hopper = Math.max(0, state.hopper - 1.5);
    state.mill.gunk = Math.min(100, state.mill.gunk + 1.5);
    
    if (state.mill.mash >= 100) {
        const isNight = state.world.time > 20 || state.world.time < 6;
        const coldBonus = (isNight && state.skillMultipliers.extraction > 1) ? 1.5 : 1.0;
        const oilYield = (state.hopper + 15) * 0.22 * ((100 - state.mill.gunk) / 100) * coldBonus * state.skillMultipliers.extraction;
        state.oil += oilYield;
        state.hopper = 0;
        state.mill.mash = 0;
        log(`🏺 Pressed ${oilYield.toFixed(2)}L EVOO`);
        showToast(`+${oilYield.toFixed(1)}L Oil`);
    }
    render();
    if (currentUser) saveGameToCloud();
}

function cleanMill() {
    if (state.sol < 0.2) { showToast("Need 0.2 SOL", true); return; }
    state.sol -= 0.2;
    state.mill.gunk = 0;
    showToast("Mill cleaned!");
    log("🧼 Mill cleaned");
    render();
    if (currentUser) saveGameToCloud();
}

function upgrade(type) {
    const costs = { irrigation: 15, misting: 10, fertilizer: 8 };
    if (state.sol < costs[type]) { showToast(`Need ${costs[type]} SOL`, true); return; }
    if (state.upgrades[type]) { showToast("Already purchased!", true); return; }
    state.sol -= costs[type];
    state.upgrades[type] = true;
    log(`✅ ${type} installed!`);
    render();
    if (currentUser) saveGameToCloud();
}

function unlockSkill(skill) {
    const costs = { yield: 5, speed: 5, cold: 5, rare: 8 };
    if (state.seeds < costs[skill]) { showToast(`Need ${costs[skill]} Ancient Seeds`, true); return; }
    if (state.skills.includes(skill)) { showToast("Already unlocked!", true); return; }
    state.seeds -= costs[skill];
    state.skills.push(skill);
    if (skill === 'yield') state.skillMultipliers.yield = 1.8;
    if (skill === 'speed') state.skillMultipliers.speed = 2.5;
    if (skill === 'cold') state.skillMultipliers.extraction = 1.6;
    if (skill === 'rare') state.skillMultipliers.rare = 0.25;
    log(`✨ Unlocked ${skill.toUpperCase()}!`);
    render();
    if (currentUser) saveGameToCloud();
}

function sellOil() {
    if (state.oil < 0.1) { showToast("No oil to sell", true); return; }
    let revenue = state.oil * state.world.price;
    state.sol += revenue;
    state.lifetimeSol += revenue;
    showToast(`+${revenue.toFixed(2)} SOL`);
    log(`💰 Sold ${state.oil.toFixed(1)}L for ${revenue.toFixed(2)} SOL`);
    state.oil = 0;
    render();
    checkAchievements();
    if (currentUser) saveGameToCloud();
}

function sprayGrove() {
    if (state.sol < 0.5) { showToast("Need 0.5 SOL", true); return; }
    state.sol -= 0.5;
    state.trees.forEach(t => t.pests = 0);
    showToast("Pests removed!");
    log("🐛 Pest control applied");
    render();
    if (currentUser) saveGameToCloud();
}

function prestige() {
    let reward = Math.floor(state.lifetimeSol / 40);
    if (reward < 1) { showToast("Earn 40 lifetime SOL first!", true); return; }
    if (confirm(`Liquidate estate for ${reward} Ancient Seeds?`)) {
        state.seeds += reward;
        state.sol = 25;
        state.oil = 0;
        state.hopper = 0;
        state.trees = [];
        state.lifetimeSol = 0;
        state.totalHarvests = 0;
        state.rareCount = 0;
        state.mill = { mash: 0, gunk: 0 };
        for (let i = 0; i < 3; i++) buyTree();
        log("🔄 Estate liquidated! Ancient knowledge preserved.");
        render();
        if (currentUser) saveGameToCloud();
    }
}

function checkAchievements() {
    if (state.totalHarvests >= 1 && !state.achievements.firstHarvest) {
        state.achievements.firstHarvest = true;
        state.sol += 2;
        showToast("🏆 First Harvest! +2 SOL");
    }
    if (state.trees.length >= 10 && !state.achievements.groveMaster) {
        state.achievements.groveMaster = true;
        state.sol += 10;
        state.seeds++;
        showToast("🏆 Grove Master! +10 SOL + Seed");
    }
    if (state.lifetimeSol >= 100 && !state.achievements.tycoon) {
        state.achievements.tycoon = true;
        state.sol += 20;
        showToast("🏆 Tycoon! +20 SOL");
    }
    if (state.rareCount >= 5 && !state.achievements.rareCollector) {
        state.achievements.rareCollector = true;
        state.sol += 15;
        state.seeds++;
        showToast("🏆 Rare Collector! +15 SOL + Seed");
    }
    render();
}

function checkQuest() {
    if (state.quest.current >= state.quest.target) {
        state.sol += state.quest.reward;
        state.seeds += state.quest.seedReward;
        showToast(`✅ Quest complete! +${state.quest.reward} SOL`);
        state.quest.current = 0;
        state.quest.target = Math.floor(Math.random() * 80) + 40;
        state.quest.reward = Math.floor(state.quest.target / 5) + 5;
        render();
    }
}

// ============================================================
// GAME LOOPS
// ============================================================

function gameLoop() {
    state.trees.forEach(tree => {
        if (tree.health <= 0) return;
        let waterLoss = state.world.weather === 'Heatwave' ? 12 : (state.world.weather === 'Rainy' ? -8 : 3);
        if (state.upgrades.irrigation && tree.water < 70) waterLoss = -5;
        tree.water = Math.max(0, Math.min(100, tree.water - waterLoss));
        let growthRate = 0.05 * state.skillMultipliers.speed;
        if (tree.water > 40 && tree.health > 30) tree.age += growthRate;
        if (tree.age > 5 && tree.stage === 'seed') tree.stage = 'sapling';
        if (tree.age > 12 && tree.stage === 'sapling') tree.stage = 'mature';
        if (state.world.season === 'Summer' && Math.random() < 0.03) tree.pests = Math.min(100, tree.pests + 5);
        if (state.upgrades.misting && tree.pests > 0) tree.pests = Math.max(0, tree.pests - 2);
        if (tree.water < 15) tree.health -= 4;
        if (tree.pests > 40) tree.health -= 3;
        if (tree.health <= 0) tree.stage = 'dead';
    });
    state.mill.mash = Math.max(0, state.mill.mash - 4);
    render();
}

function weatherCycle() {
    const weathers = [{ type: 'Clear', temp: 24 }, { type: 'Rainy', temp: 18 }, { type: 'Heatwave', temp: 36 }];
    const newWeather = weathers[Math.floor(Math.random() * weathers.length)];
    state.world.weather = newWeather.type;
    state.world.temp = newWeather.temp;
    if (newWeather.type === 'Rainy') state.trees.forEach(t => t.water = Math.min(100, t.water + 15));
    render();
}

function marketCycle() {
    let drift = (Math.random() - 0.5) * 0.8;
    state.world.price = Math.max(0.8, Math.min(6.0, state.world.price + drift));
    const demandLevels = ['Very Low', 'Low', 'Normal', 'High', 'Very High'];
    const idx = Math.floor(state.world.price / 1.2);
    state.world.demand = demandLevels[Math.min(4, idx)];
    const trendPercent = (drift * 10).toFixed(1);
    const trendEl = document.getElementById('ui-trend');
    if (trendEl) {
        trendEl.innerText = (drift >= 0 ? '+' : '') + trendPercent + '%';
        trendEl.className = drift >= 0 ? 'text-xs text-green-500' : 'text-xs text-red-500';
    }
    const demandEl = document.getElementById('ui-demand');
    if (demandEl) demandEl.innerText = state.world.demand;
    render();
}

// ============================================================
// CLOUD SAVE FUNCTIONS
// ============================================================

async function saveGameToCloud() {
    if (!currentUser || !sb) return;
    
    const saveData = {
        wallet: currentUser.wallet,
        sol: state.sol,
        seeds: state.seeds,
        oil: state.oil,
        hopper: state.hopper,
        lifetimeSol: state.lifetimeSol,
        treesPlanted: state.treesPlanted,
        totalHarvests: state.totalHarvests,
        comboRecord: state.comboRecord,
        rareCount: state.rareCount,
        trees: JSON.stringify(state.trees),
        upgrades: JSON.stringify(state.upgrades),
        skills: state.skills,
        skillMultipliers: JSON.stringify(state.skillMultipliers),
        mill: JSON.stringify(state.mill),
        quest: JSON.stringify(state.quest),
        achievements: JSON.stringify(state.achievements),
        updated_at: new Date().toISOString()
    };
    
    try {
        const { error } = await sb
            .from('game_saves')
            .upsert(saveData, { onConflict: 'wallet' });
        
        if (error) console.error('Save error:', error);
        else console.log('💾 Game saved to cloud');
    } catch (err) {
        console.error('Cloud save failed:', err);
    }
}

async function loadGameFromCloud() {
    if (!currentUser || !sb) return false;
    
    try {
        const { data, error } = await sb
            .from('game_saves')
            .select('*')
            .eq('wallet', currentUser.wallet)
            .maybeSingle();
        
        if (error || !data) {
            console.log('No saved game found');
            return false;
        }
        
        state.sol = data.sol ?? 25;
        state.seeds = data.seeds ?? 0;
        state.oil = data.oil ?? 0;
        state.hopper = data.hopper ?? 0;
        state.lifetimeSol = data.lifetimeSol ?? 25;
        state.treesPlanted = data.treesPlanted ?? 3;
        state.totalHarvests = data.totalHarvests ?? 0;
        state.comboRecord = data.comboRecord ?? 1.0;
        state.rareCount = data.rareCount ?? 0;
        state.trees = data.trees ? JSON.parse(data.trees) : [];
        state.upgrades = data.upgrades ? JSON.parse(data.upgrades) : { irrigation: false, misting: false, fertilizer: false };
        state.skills = data.skills || [];
        state.skillMultipliers = data.skillMultipliers ? JSON.parse(data.skillMultipliers) : { yield: 1.0, speed: 1.0, extraction: 1.0, rare: 0.1 };
        state.mill = data.mill ? JSON.parse(data.mill) : { mash: 0, gunk: 0 };
        state.quest = data.quest ? JSON.parse(data.quest) : { target: 50, current: 0, reward: 10, seedReward: 1 };
        state.achievements = data.achievements ? JSON.parse(data.achievements) : { firstHarvest: false, groveMaster: false, tycoon: false, comboKing: false, rareCollector: false };
        
        if (state.skills.includes('yield')) state.skillMultipliers.yield = 1.8;
        if (state.skills.includes('speed')) state.skillMultipliers.speed = 2.5;
        if (state.skills.includes('cold')) state.skillMultipliers.extraction = 1.6;
        if (state.skills.includes('rare')) state.skillMultipliers.rare = 0.25;
        
        render();
        log("🌿 Game loaded from cloud! Welcome back.");
        return true;
    } catch (err) {
        console.error('Load error:', err);
        return false;
    }
}

// ============================================================
// RENDER FUNCTION
// ============================================================

function render() {
    if (!document.getElementById('ui-sol')) return;
    
    document.getElementById('ui-sol').innerText = state.sol.toFixed(4);
    document.getElementById('ui-oil').innerText = state.oil.toFixed(1);
    document.getElementById('ui-seeds').innerText = state.seeds;
    document.getElementById('ui-hopper').innerText = state.hopper.toFixed(1) + ' kg';
    document.getElementById('ui-price').innerText = state.world.price.toFixed(2);
    document.getElementById('ui-time').innerText = state.world.time.toString().padStart(2,'0') + ':00';
    document.getElementById('ui-temp').innerText = state.world.temp + '°C';
    document.getElementById('ui-weather').innerText = state.world.weather;
    document.getElementById('ui-level').innerText = Math.floor(state.lifetimeSol / 20) + 1;
    document.getElementById('tree-count').innerText = state.trees.length;
    document.getElementById('rare-count').innerText = state.rareCount;
    
    const mashBar = document.getElementById('mash-bar');
    if (mashBar) mashBar.style.width = state.mill.mash + '%';
    const gunkBar = document.getElementById('gunk-bar');
    if (gunkBar) gunkBar.style.width = state.mill.gunk + '%';
    document.getElementById('mash-pct').innerHTML = state.mill.mash + '%';
    document.getElementById('gunk-pct').innerHTML = state.mill.gunk + '%';
    document.getElementById('quest-current').innerHTML = state.quest.current.toFixed(0);
    document.getElementById('quest-target').innerHTML = state.quest.target;
    const questProgress = document.getElementById('quest-progress');
    if (questProgress) questProgress.style.width = (state.quest.current / state.quest.target) * 100 + '%';
    const seedsDisplay = document.getElementById('seeds-display');
    if (seedsDisplay) seedsDisplay.innerHTML = state.seeds;
    
    const statsLifetime = document.getElementById('stats-lifetime');
    if (statsLifetime) statsLifetime.innerHTML = state.lifetimeSol.toFixed(2);
    const statsTreesPlanted = document.getElementById('stats-trees-planted');
    if (statsTreesPlanted) statsTreesPlanted.innerHTML = state.treesPlanted;
    const statsHarvests = document.getElementById('stats-harvests');
    if (statsHarvests) statsHarvests.innerHTML = state.totalHarvests;
    const statsCombo = document.getElementById('stats-combo');
    if (statsCombo) statsCombo.innerHTML = `x${state.comboRecord.toFixed(1)}`;
    const statsRare = document.getElementById('stats-rare');
    if (statsRare) statsRare.innerHTML = state.rareCount;
    
    const ach1 = document.getElementById('ach1');
    if (ach1) ach1.innerHTML = state.achievements.firstHarvest ? '✅' : '❌';
    const ach2 = document.getElementById('ach2');
    if (ach2) ach2.innerHTML = state.achievements.groveMaster ? '✅' : '❌';
    const ach3 = document.getElementById('ach3');
    if (ach3) ach3.innerHTML = state.achievements.tycoon ? '✅' : '❌';
    const ach4 = document.getElementById('ach4');
    if (ach4) ach4.innerHTML = state.achievements.comboKing ? '✅' : '❌';
    const ach5 = document.getElementById('ach5');
    if (ach5) ach5.innerHTML = state.achievements.rareCollector ? '✅' : '❌';
    
    const seasons = ['Spring', 'Summer', 'Autumn', 'Winter'];
    const seasonIndex = Math.floor(Date.now() / 600000) % 4;
    state.world.season = seasons[seasonIndex];
    const seasonEmoji = state.world.season === 'Spring' ? '🌸' : state.world.season === 'Summer' ? '☀️' : state.world.season === 'Autumn' ? '🍂' : '❄️';
    const uiSeason = document.getElementById('ui-season');
    if (uiSeason) uiSeason.innerHTML = seasonEmoji;
    
    const container = document.getElementById('grove-container');
    if (!container) return;
    
    container.innerHTML = '';
    state.trees.forEach((tree, idx) => {
        const isReady = tree.stage === 'mature';
        const emoji = tree.stage === 'seed' ? '🌱' : tree.stage === 'sapling' ? '🌿' : tree.stage === 'mature' ? '🫒' : '🍂';
        const card = document.createElement('div');
        card.className = `tree-card ${isReady ? 'ready' : ''} ${tree.pests > 30 ? 'infested' : ''}`;
        card.onclick = () => interactTree(idx);
        card.innerHTML = `
            <div class="tree-emoji">${emoji}</div>
            <div class="tree-id">${tree.id}</div>
            <div class="progress-bar"><div class="progress-fill fill-water" style="width:${tree.water}%"></div></div>
            <div class="progress-bar"><div class="progress-fill fill-health" style="width:${tree.health}%"></div></div>
            ${tree.pests > 0 ? `<div class="progress-bar"><div class="progress-fill fill-pest" style="width:${tree.pests}%"></div></div>` : ''}
            ${isReady ? '<div class="text-center text-gold text-[9px] mt-2">⬤ READY</div>' : ''}
            ${tree.rarity === 'rare' ? '<div class="rarity-badge">💎</div>' : ''}
        `;
        container.appendChild(card);
    });
    if (state.trees.length === 0) {
        container.innerHTML = '<div class="text-center py-10 opacity-50 col-span-full">Tap + PLANT to start</div>';
    }
}

// ============================================================
// PANEL NAVIGATION
// ============================================================

function openPanel(panelId) {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('open'));
    const panel = document.getElementById(`panel-${panelId}`);
    if (panel) panel.classList.add('open');
    const overlay = document.getElementById('panel-overlay');
    if (overlay) overlay.classList.add('active');
}

function closePanel() {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('open'));
    const overlay = document.getElementById('panel-overlay');
    if (overlay) overlay.classList.remove('active');
}

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🎮 OLIVIUM Estate loading...');
    
    // Set up event listeners
    const plantBtn = document.getElementById('plant-btn');
    if (plantBtn) plantBtn.onclick = () => buyTree();
    
    const sprayBtn = document.getElementById('spray-btn');
    if (sprayBtn) sprayBtn.onclick = () => sprayGrove();
    
    const sellBtn = document.getElementById('sell-btn');
    if (sellBtn) sellBtn.onclick = () => sellOil();
    
    const fabMill = document.getElementById('fab-mill');
    if (fabMill) fabMill.onclick = () => pressMill();
    
    const refreshBtn = document.getElementById('refreshBalanceBtn');
    if (refreshBtn) refreshBtn.onclick = () => refreshBalances();
    
    // Connect button
    const connectBtn = document.getElementById('connectBtn');
    if (connectBtn) connectBtn.onclick = showConnectModal;
    
    // Modal buttons
    const connectWalletBtn = document.getElementById('connectWalletBtn');
    if (connectWalletBtn) connectWalletBtn.onclick = connectWallet;
    
    const emailLoginBtn = document.getElementById('emailLoginBtn');
    if (emailLoginBtn) emailLoginBtn.onclick = emailLogin;
    
    const closeModalBtn = document.getElementById('closeConnectModalBtn');
    if (closeModalBtn) closeModalBtn.onclick = hideConnectModal;
    
    const modal = document.getElementById('connectModal');
    if (modal) modal.onclick = (e) => { if (e.target === modal) hideConnectModal(); };
    
    // Bottom navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.onclick = () => openPanel(item.dataset.panel);
    });
    
    // Expose game functions globally
    window.game = { 
        upgrade: (t) => { upgrade(t); closePanel(); }, 
        unlockSkill: (s) => { unlockSkill(s); closePanel(); }, 
        cleanMill, 
        prestige, 
        buyTree, 
        sprayGrove, 
        sellOil, 
        pressMill 
    };
    window.closePanel = closePanel;
    window.openPanel = openPanel;
    
    // Check if already connected via localStorage
    const savedWallet = localStorage.getItem('walletAddress');
    if (savedWallet) {
        currentUser = {
            wallet: savedWallet,
            type: 'wallet',
            display: savedWallet.slice(0, 8) + '...'
        };
        updateWalletBalancesUI();
        loadGameFromCloud();
    }
    
    // Start game
    for (let i = 0; i < 3; i++) buyTree();
    setInterval(gameLoop, 2000);
    setInterval(weatherCycle, 20000);
    setInterval(marketCycle, 15000);
    setInterval(() => { state.world.time = (state.world.time + 1) % 24; render(); }, 30000);
    render();
    log("🌿 Tap trees to water/harvest. Press the gold button for the mill!");
    log("🔐 Click 'Connect Profile' to connect your wallet and save progress!");
});

// Auto-save every 30 seconds
setInterval(() => {
    if (currentUser) saveGameToCloud();
}, 30000);
