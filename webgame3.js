// ============================================================
// OLIVIUM GAME - Complete Game Logic
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

function addCombo() {
    state.combo += 0.15;
    if (state.combo > state.comboRecord) state.comboRecord = state.combo;
    document.getElementById('combo-display').innerHTML = `${state.combo.toFixed(1)}x`;
    clearTimeout(state.comboRef);
    state.comboRef = setTimeout(() => {
        state.combo = 1.0;
        document.getElementById('combo-display').innerHTML = '1.0x';
    }, 3000);
    if (state.comboRecord >= 5 && !state.achievements.comboKing) {
        state.achievements.comboKing = true;
        state.sol += 5;
        showToast("🏆 Combo King! +5 SOL");
        render();
    }
}

function log(msg) {
    const ledger = document.getElementById('ledger');
    const entry = document.createElement('div');
    entry.innerHTML = `> ${msg}`;
    entry.className = 'opacity-60 pb-1';
    ledger.prepend(entry);
    if (ledger.children.length > 20) ledger.lastChild.remove();
}

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
}

function cleanMill() {
    if (state.sol < 0.2) { showToast("Need 0.2 SOL", true); return; }
    state.sol -= 0.2;
    state.mill.gunk = 0;
    showToast("Mill cleaned!");
    log("🧼 Mill cleaned");
    render();
}

function upgrade(type) {
    const costs = { irrigation: 15, misting: 10, fertilizer: 8 };
    if (state.sol < costs[type]) { showToast(`Need ${costs[type]} SOL`, true); return; }
    if (state.upgrades[type]) { showToast("Already purchased!", true); return; }
    state.sol -= costs[type];
    state.upgrades[type] = true;
    log(`✅ ${type} installed!`);
    render();
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
}

function sprayGrove() {
    if (state.sol < 0.5) { showToast("Need 0.5 SOL", true); return; }
    state.sol -= 0.5;
    state.trees.forEach(t => t.pests = 0);
    showToast("Pests removed!");
    log("🐛 Pest control applied");
    render();
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

// Game Loop
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
    trendEl.innerText = (drift >= 0 ? '+' : '') + trendPercent + '%';
    trendEl.className = drift >= 0 ? 'text-xs text-green-500' : 'text-xs text-red-500';
    document.getElementById('ui-demand').innerText = state.world.demand;
    render();
}

function render() {
    document.getElementById('ui-sol').innerText = state.sol.toFixed(2);
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
    document.getElementById('mash-bar').style.width = state.mill.mash + '%';
    document.getElementById('gunk-bar').style.width = state.mill.gunk + '%';
    document.getElementById('mash-pct').innerHTML = state.mill.mash + '%';
    document.getElementById('gunk-pct').innerHTML = state.mill.gunk + '%';
    document.getElementById('quest-current').innerHTML = state.quest.current.toFixed(0);
    document.getElementById('quest-target').innerHTML = state.quest.target;
    document.getElementById('quest-progress').style.width = (state.quest.current / state.quest.target) * 100 + '%';
    document.getElementById('seeds-display').innerHTML = state.seeds;
    
    document.getElementById('stats-lifetime').innerHTML = state.lifetimeSol.toFixed(2);
    document.getElementById('stats-trees-planted').innerHTML = state.treesPlanted;
    document.getElementById('stats-harvests').innerHTML = state.totalHarvests;
    document.getElementById('stats-combo').innerHTML = `x${state.comboRecord.toFixed(1)}`;
    document.getElementById('stats-rare').innerHTML = state.rareCount;
    
    document.getElementById('ach1').innerHTML = state.achievements.firstHarvest ? '✅' : '❌';
    document.getElementById('ach2').innerHTML = state.achievements.groveMaster ? '✅' : '❌';
    document.getElementById('ach3').innerHTML = state.achievements.tycoon ? '✅' : '❌';
    document.getElementById('ach4').innerHTML = state.achievements.comboKing ? '✅' : '❌';
    document.getElementById('ach5').innerHTML = state.achievements.rareCollector ? '✅' : '❌';
    
    const seasons = ['Spring', 'Summer', 'Autumn', 'Winter'];
    const seasonIndex = Math.floor(Date.now() / 600000) % 4;
    state.world.season = seasons[seasonIndex];
    const seasonEmoji = state.world.season === 'Spring' ? '🌸' : state.world.season === 'Summer' ? '☀️' : state.world.season === 'Autumn' ? '🍂' : '❄️';
    document.getElementById('ui-season').innerHTML = seasonEmoji;
    
    const container = document.getElementById('grove-container');
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

// Panel Navigation
function openPanel(panelId) {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('open'));
    document.getElementById(`panel-${panelId}`).classList.add('open');
    document.getElementById('panel-overlay').classList.add('active');
}

function closePanel() {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('open'));
    document.getElementById('panel-overlay').classList.remove('active');
}

// Event Listeners
document.getElementById('plant-btn').onclick = () => buyTree();
document.getElementById('spray-btn').onclick = () => sprayGrove();
document.getElementById('sell-btn').onclick = () => sellOil();
document.getElementById('fab-mill').onclick = () => pressMill();

document.querySelectorAll('.nav-item').forEach(item => {
    item.onclick = () => openPanel(item.dataset.panel);
});

// Expose game for inline onclick
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

// Initialize
for (let i = 0; i < 3; i++) buyTree();
setInterval(gameLoop, 2000);
setInterval(weatherCycle, 20000);
setInterval(marketCycle, 15000);
setInterval(() => { state.world.time = (state.world.time + 1) % 24; render(); }, 30000);
render();
log("🌿 Tap trees to water/harvest. Press the gold button for the mill!");