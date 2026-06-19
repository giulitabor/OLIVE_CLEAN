// ============================================================
// OLIVIUM — KINTARA EDITION (High-Stakes Resource Strategy)
// ============================================================

import { sb, getIdentity, isConnected, connection } from "./src/connection.ts";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { Transaction, TransactionInstruction } from "@solana/web3.js";
import BN from 'bn.js';

const OLV_MINT_ADDRESS = new PublicKey("6C3xwo24Tvkw6fxSK1PNLCcQsWJt7Y9seH95xMtTP8V9");

let currentUser = null;
let walletSolBalance = 0;
let walletOlvBalance = 0;
let treasurySolBalance = 0;

// ============================================================
// GAME STATE (Expanded for Kintara-Mode Mechanics)
// ============================================================
const state = {
    sol: 25.0, seeds: 0, oil: 0, hopper: 0, lifetimeSol: 25.0,
    treesPlanted: 3, totalHarvests: 0, comboRecord: 1.0, rareCount: 0,
    trees: [],
    // Kintara Build Spec paths: 'none', 'agrarian', 'industrialist', 'speculator'
    specialization: 'none', 
    upgrades: { irrigation: false, misting: false, fertilizer: false, flyTraps: false },
    skills: [],
    skillMultipliers: { yield: 1.0, speed: 1.0, extraction: 1.0, rare: 0.1 },
    world: { time: 8, temp: 24, weather: 'Clear', season: 'Spring', price: 2.50, demand: 'Normal' },
    // Mill tracking: mash tracks total volume, gunk now acts as the toxic "Thermal Stress" gauge
    mill: { mash: 0, gunk: 0, broken: false },
    combo: 1.0, comboRef: null,
    quest: { target: 50, current: 0, reward: 10, seedReward: 1 },
    achievements: { firstHarvest: false, groveMaster: false, tycoon: false, comboKing: false, rareCollector: false },
    fertilizerBoost: false,
    fertilizerBoostEnd: 0,
    protectionActive: false,
    protectionEnd: 0,
    nextTreeLegendary: false
};

const rarityIcons = {
    common: { icon: '🌳', bonus: 1.0, name: 'Common' },
    rare: { icon: '💎', bonus: 2.2, name: 'Rare' },
    legendary: { icon: '👑', bonus: 5.5, name: 'Legendary' }
};

// ============================================================
// KINTARA SYSTEMIC MECHANICS (New Code Injections)
// ============================================================

/**
 * Archetype Lock Engine: Restructures player priorities per run
 */
function chooseSpecialization(specName) {
    if (state.specialization !== 'none') {
        showToast("⚠️ Specialization locked for this cycle! Liquidate to re-spec.", true);
        return;
    }
    state.specialization = specName;
    
    if (specName === 'agrarian') {
        state.skillMultipliers.yield = 1.5;
        state.skillMultipliers.speed = 1.3;
        log("🌾 Path of the Agrarian chosen: +50% Yield, +30% Growth Speed. Blight risks increased.");
    } else if (specName === 'industrialist') {
        state.skillMultipliers.extraction = 1.75;
        log("⚙️ Path of the Industrialist chosen: +75% Extraction Efficiency. Mill structural hazard expanded.");
    } else if (specName === 'speculator') {
        log("📊 Path of the Speculator chosen: Immune to dynamic asset market drops. Futures contract access enabled.");
    }
    render();
    if (currentUser) saveGameToCloud();
}

/**
 * Grid Proximity Processing: Spatially handles contagious blight vectors
 */
function processGridContagion(tree, idx) {
    if (tree.pests > 45 && !tree.protected) {
        // Grid calculations mapping close nodes: 3-column rows
        const checkIndices = [];
        if (idx % 3 !== 0) checkIndices.push(idx - 1); // West
        if (idx % 3 !== 2) checkIndices.push(idx + 1); // East
        if (idx >= 3) checkIndices.push(idx - 3);      // North
        if (idx + 3 < state.trees.length) checkIndices.push(idx + 3); // South

        const spreadChance = state.specialization === 'agrarian' ? 0.15 : 0.07;
        
        checkIndices.forEach(nIdx => {
            const neighbor = state.trees[nIdx];
            if (neighbor && neighbor.health > 0 && !neighbor.protected) {
                const legacyPests = neighbor.pests;
                neighbor.pests = Math.min(100, neighbor.pests + (state.world.weather === 'Heatwave' ? 8 : 4));
                if (legacyPests < 20 && neighbor.pests >= 20) {
                    log(`⚠️ Blight contagion spreading from Tree ${tree.id} ➔ Tree ${neighbor.id}!`);
                }
            }
        });
    }
}

// ============================================================
// CORE PROCESSING LOOPS
// ============================================================

function gameLoop() {
    // Check durations
    if (state.fertilizerBoost && Date.now() > state.fertilizerBoostEnd) {
        state.fertilizerBoost = false;
        log("🌿 Fertilizer boost expired.");
    }
    if (state.protectionActive && Date.now() > state.protectionEnd) {
        state.protectionActive = false;
        log("🛡️ Protection field dissolved.");
    }

    // Dynamic Spoilage: Hopper inventory slowly decays if left unrefined
    if (state.hopper > 0) {
        const decayRate = state.specialization === 'industrialist' ? 0.02 : 0.1;
        state.hopper = Math.max(0, state.hopper - decayRate);
    }

    // Cooling cycle for the extraction unit
    if (state.mill.gunk > 0) {
        const coolRate = state.specialization === 'industrialist' ? 2.5 : 1.2;
        state.mill.gunk = Math.max(0, state.mill.gunk - coolRate);
    }

    // Tree Simulation Engine
    state.trees.forEach((tree, idx) => {
        if (tree.health <= 0) return;

        // Process spatial blight logic
        processGridContagion(tree, idx);

        // Core dehydration loop mechanics
        let waterLoss = state.world.weather === 'Heatwave' ? 14 : (state.world.weather === 'Rainy' ? -10 : 4);
        if (state.upgrades.irrigation && tree.water < 70) waterLoss = -4;
        tree.water = Math.max(0, Math.min(100, tree.water - waterLoss));

        // Kintara Precision Hydration Window Check (72% - 88% Balance)
        let inOptimalZone = (tree.water >= 72 && tree.water <= 88);
        
        let growthRate = 0.05 * state.skillMultipliers.speed;
        if (inOptimalZone) growthRate *= 1.6; // Perfect Bloom Bonus
        if (state.fertilizerBoost) growthRate *= 1.5;
        if (tree.water > 95) tree.health = Math.max(0, tree.health - 2); // Overwatering rot

        if (tree.water > 30 && tree.health > 20 && tree.stage !== 'mature') {
            tree.age += growthRate;
        }

        if (tree.age > 5 && tree.stage === 'seed') tree.stage = 'sapling';
        if (tree.age > 12 && tree.stage === 'sapling') tree.stage = 'mature';

        // Pest Generation
        let pestRoll = state.world.season === 'Summer' ? 0.05 : 0.02;
        if (state.specialization === 'agrarian') pestRoll *= 1.8; // High-density vulnerability
        
        if (!tree.protected && Math.random() < pestRoll) {
            tree.pests = Math.min(100, tree.pests + 6);
        }

        // Pest mitigation vectors
        if (state.upgrades.misting && tree.pests > 0) tree.pests = Math.max(0, tree.pests - 1.5);
        if (state.upgrades.flyTraps && tree.pests > 0) tree.pests = Math.max(0, tree.pests - 2.5);

        // Health Degradation State
        if (tree.water <= 0 || tree.pests >= 100) {
            tree.health = Math.max(0, tree.health - 5);
        } else if (tree.water > 45 && tree.pests === 0) {
            tree.health = Math.min(100, tree.health + 1.5);
        }
    });

    render();
}

// ============================================================
// REWORKED KINTARA INDUSTRIAL MILL MECHANICS
// ============================================================

function pressMill() {
    if (state.mill.broken) {
        showToast("💥 Mechanical system ruptured! Force repair required.", true);
        return;
    }
    if (state.hopper <= 0) {
        showToast("No biomass in hopper!", true);
        return;
    }

    // Operational parameters change depending on build path selection
    const rawFeed = 3.5; 
    const thermalStress = state.specialization === 'industrialist' ? 3.0 : 6.0;

    state.mill.mash += 12;
    state.mill.gunk += thermalStress; // Gunk represents Thermal Overpressure
    state.hopper = Math.max(0, state.hopper - rawFeed);

    // Critical failure trigger checks
    if (state.mill.gunk >= 100) {
        state.mill.broken = true;
        state.mill.mash = 0;
        state.mill.gunk = 100;
        state.hopper = Math.max(0, state.hopper - 40); // Material blowback loss
        log("💥 CRITICAL FAILURE: Refinery thermal lines ruptured! Lost local hopper reserves.");
        showToast("💥 REFINE BLOWOUT! Mill broken.", true);
        render();
        return;
    }

    // Processing resolution cycle
    if (state.mill.mash >= 100) {
        const coldBonus = (state.world.time > 20 || state.world.time < 6) ? 1.4 : 1.0;
        const processEfficiency = (100 - state.mill.gunk) / 100;
        
        let oilYield = 2.5 * processEfficiency * coldBonus * state.skillMultipliers.extraction;
        
        state.oil += oilYield;
        state.mill.mash = 0;
        
        log(`🏺 Refined ${oilYield.toFixed(2)}L EVOO. Thermal Stress: ${Math.floor(state.mill.gunk)}%`);
        if (state.mill.gunk > 75) log("⚠️ Heat generation approaching structural threshold boundaries!");
    }
    
    render();
    if (currentUser) saveGameToCloud();
}

function cleanMill() {
    // Acts as manual field-repair mechanics matrix
    if (state.mill.broken) {
        const repairCost = 1.5;
        if (state.sol < repairCost) {
            showToast(`Need ${repairCost} SOL to rebuild core layout!`, true);
            return;
        }
        state.sol -= repairCost;
        state.mill.broken = false;
        state.mill.gunk = 0;
        log("🔧 Rebuilt processing core. Refinery mechanics online.");
        showToast("🔧 Core rebuilt!");
    } else {
        const cleanCost = 0.15;
        if (state.sol < cleanCost) {
            showToast(`Need ${cleanCost} SOL for rapid cooling fluid!`, true);
            return;
        }
        state.sol -= cleanCost;
        state.mill.gunk = 0;
        log("🧼 Flush cycles completed. Engine cooled to 0%.");
        showToast("❄️ Thermal engine flushed");
    }
    render();
    if (currentUser) saveGameToCloud();
}

// ============================================================
// DYNAMIC MACRO MARKET SIMULATION
// ============================================================

function sellOil() {
    if (state.oil < 0.1) {
        showToast("No fluid commodity assets stored.", true);
        return;
    }
    let revenue = state.oil * state.world.price;
    state.sol += revenue;
    state.lifetimeSol += revenue;
    
    log(`💰 Exchanged ${state.oil.toFixed(2)}L for +${revenue.toFixed(3)} SOL.`);
    
    // Kintara Dynamic Price Slippage System: Selling dumps local market pools
    if (state.specialization !== 'speculator') {
        const drop = (state.oil * 0.04);
        state.world.price = Math.max(0.8, parseFloat((state.world.price - drop).toFixed(2)));
        log(`📉 Asset pool diluted! Market price drops to ${state.world.price.toFixed(2)} SOL.`);
    }
    
    state.oil = 0;
    render();
    checkAchievements();
    if (currentUser) saveGameToCloud();
}

function marketCycle() {
    const demands = ['Low', 'Normal', 'High', 'Surging'];
    state.world.demand = demands[Math.floor(Math.random() * demands.length)];
    
    let modifier = 1.0;
    if (state.world.demand === 'Low') modifier = 0.55;
    if (state.world.demand === 'High') modifier = 1.35;
    if (state.world.demand === 'Surging') modifier = 2.3;

    // Reset baseline price corridors dynamically
    state.world.price = parseFloat(((Math.random() * 1.4 + 1.6) * modifier).toFixed(2));
    log(`📊 Market Update: Demand is ${state.world.demand}. Global price: ${state.world.price.toFixed(2)} SOL/L`);
    render();
}

function weatherCycle() {
    const conditions = ['Clear', 'Rainy', 'Heatwave', 'Overcast'];
    state.world.weather = conditions[Math.floor(Math.random() * conditions.length)];
    
    if (state.world.weather === 'Heatwave') {
        state.world.temp = Math.floor(Math.random() * 10) + 33;
        log("🚨 HEATWAVE REGISTERED: Water consumption rates spiked dramatically!");
    } else if (state.world.weather === 'Rainy') {
        state.world.temp = Math.floor(Math.random() * 8) + 14;
        log("🌧️ Aquifer recharging automatically via precipitation.");
    } else {
        state.world.temp = Math.floor(Math.random() * 10) + 20;
    }
    render();
}

// ============================================================
// CRITICAL CYCLICAL PRESTIGE ENGINE
// ============================================================

function prestige() {
    let reward = Math.floor(state.lifetimeSol / 35);
    if (reward < 1) {
        showToast("Minimum 35 lifetime SOL required to liquidate assets!", true);
        return;
    }

    // Kintara strategic timing check: Liquidating during surging demand doubles token awards
    if (state.world.demand === 'Surging') {
        reward *= 2;
        showToast("👑 MARKET SURGE RUN BONUS UNLOCKED!");
    }

    if (confirm(`Liquidate your entire infrastructure profile for ${reward} Ancient Seeds?\n\nThis completely resets the current run loop to re-spec your specialization archetype.`)) {
        state.seeds += reward;
        state.sol = 25.0;
        state.oil = 0;
        state.hopper = 0;
        state.trees = [];
        state.lifetimeSol = 25.0;
        state.totalHarvests = 0;
        state.rareCount = 0;
        state.specialization = 'none'; // Wipe archetype settings to select fresh specialization path
        state.mill = { mash: 0, gunk: 0, broken: false };
        
        // Spawn fresh baseline grid nodes
        state.treesPlanted = 0;
        for (let i = 0; i < 3; i++) {
            state.trees.push({
                id: '#' + (state.treesPlanted + 1),
                age: 0, health: 100, water: 80, pests: 0,
                stage: 'seed', rarity: 'common', protected: false
            });
            state.treesPlanted++;
        }
        
        log("🔄 Estate successfully liquidated. Re-enter the grid layout.");
        render();
        if (currentUser) saveGameToCloud();
    }
}

// ============================================================
// REWRITTEN CORE RENDER MATRIX
// ============================================================

function render() {
    // Upper Data Nodes
    document.getElementById('ui-time').innerText = `${String(state.world.time).padStart(2, '0')}:00`;
    document.getElementById('ui-temp').innerText = `${state.world.temp}°C`;
    document.getElementById('ui-weather').innerText = state.world.weather;
    document.getElementById('ui-season').innerText = state.world.season;
    
    document.getElementById('ui-sol').innerText = state.sol.toFixed(2);
    document.getElementById('ui-olv').innerText = Math.floor(walletOlvBalance);
    document.getElementById('ui-oil').innerText = state.oil.toFixed(2);
    document.getElementById('ui-seeds').innerText = state.seeds;
    document.getElementById('tree-count').innerText = state.trees.length;
    document.getElementById('ui-price').innerText = state.world.price.toFixed(2);
    document.getElementById('ui-demand').innerText = state.world.demand;
    document.getElementById('ui-hopper').innerText = `${state.hopper.toFixed(1)} kg`;
    
    // Specialization Archetype Tracker Injection
    const levelNode = document.getElementById('ui-level');
    if (levelNode) {
        levelNode.innerText = state.specialization.toUpperCase();
        levelNode.className = `text-xs font-bold font-mono ${
            state.specialization === 'none' ? 'text-stone-400' : 
            state.specialization === 'agrarian' ? 'text-green-400' : 
            state.specialization === 'industrialist' ? 'text-yellow-500' : 'text-purple-400'
        }`;
    }

    // Core Thermal Engineering Processing Indicators
    const mashPct = Math.floor(state.mill.mash);
    const thermalStress = Math.floor(state.mill.gunk);
    
    document.getElementById('mash-pct').innerText = `${mashPct}%`;
    document.getElementById('mash-bar').style.width = `${mashPct}%`;
    
    const gunkLabel = document.getElementById('gunk-pct');
    const gunkBar = document.getElementById('gunk-bar');
    
    if (state.mill.broken) {
        gunkLabel.innerText = "BURST";
        gunkLabel.className = "font-mono text-red-500 font-bold animate-pulse";
        gunkBar.style.width = "100%";
        gunkBar.className = "bg-red-700 h-full transition-all";
    } else {
        gunkLabel.innerText = `${thermalStress}%`;
        gunkLabel.className = "font-mono text-yellow-600";
        gunkBar.style.width = `${thermalStress}%`;
        gunkBar.className = thermalStress > 75 ? "bg-yellow-500 h-full animate-pulse" : "bg-yellow-600 h-full";
    }
    
    // Contracts Layout
    document.getElementById('quest-current').innerText = Math.floor(state.quest.current);
    document.getElementById('quest-target').innerText = state.quest.target;
    document.getElementById('quest-progress').style.width = `${Math.min(100, (state.quest.current / state.quest.target) * 100)}%`;
    
    // Spatial Grid Execution Elements
    const container = document.getElementById('grove-container');
    if (container) {
        container.innerHTML = '';
        state.trees.forEach((tree, idx) => {
            const el = document.createElement('div');
            
            // Highlight optimal water metrics (72-88%) using structural border enhancements
            const inOptZone = (tree.water >= 72 && tree.water <= 88 && tree.health > 0);
            
            el.className = `p-3 rounded-xl border relative text-center cursor-pointer select-none transition-all ${
                tree.health <= 0 ? 'bg-red-950/20 border-red-900/40' : 
                inOptZone ? 'bg-stone-900/70 border-green-500/60' : 'bg-stone-900/40 border-white/5'
            }`;
            el.onclick = () => interactTree(idx);
            
            const badge = rarityIcons[tree.rarity] || rarityIcons.common;
            el.innerHTML = `
                <div class="text-2xl mb-1">${tree.health <= 0 ? '💀' : badge.icon}</div>
                <div class="text-[9px] font-bold tracking-wider text-stone-400">${tree.id}</div>
                <div class="text-[10px] uppercase font-mono mt-1 ${tree.stage === 'mature' ? 'text-green-400 font-bold' : 'text-stone-500'}">${tree.stage}</div>
                <div class="space-y-1 mt-2 text-[8px] font-mono">
                    <div class="w-full bg-black/40 h-1 rounded"><div class="bg-blue-500 h-1 rounded" style="width:${tree.water}%"></div></div>
                    <div class="w-full bg-black/40 h-1 rounded"><div class="bg-green-500 h-1 rounded" style="width:${tree.health}%"></div></div>
                    ${tree.pests > 0 ? `<div class="text-red-500 font-bold text-[8px] mt-0.5">⚠️ BLIGHT ${tree.pests}%</div>` : ''}
                </div>
            `;
            container.appendChild(el);
        });
    }
}

// ============================================================
// WALLET INTERFACE SIMULATORS
// ============================================================
async function spendOlvTokens(amount, reason) {
    log(`💸 Authorizing ${amount} OLV spent for: ${reason}`);
    walletOlvBalance = Math.max(0, walletOlvBalance - amount);
    return true;
}

async function fetchRealOlvBalance(walletAddress) { return 0; }
async function getTreasurySolBalance() { return 0; }
async function fetchWalletBalances(walletAddress) { return { sol: 25.0, olv: 0, treasury: 0 }; }
async function updateWalletBalancesUI() { render(); }
async function refreshBalances() { showToast("Synced with network endpoints."); render(); }

async function saveGameToCloud() {
    if (!currentUser) return;
    localStorage.setItem(`kintara_olv_save_${currentUser.wallet}`, JSON.stringify({ state }));
}

async function loadGameFromCloud() {
    if (!currentUser) return false;
    const data = localStorage.getItem(`kintara_olv_save_${currentUser.wallet}`);
    if (data) {
        Object.assign(state, JSON.parse(data).state);
        return true;
    }
    return false;
}

// ============================================================
// CORE SEED ACTIONS (Standard Handling)
// ============================================================

function buyTree() {
    if (state.sol < 5) { showToast("Need 5 SOL!", true); return; }
    state.sol -= 5;
    let roll = Math.random();
    let rarity = 'common';
    if (roll < state.skillMultipliers.rare) rarity = 'rare';
    if (state.nextTreeLegendary) { rarity = 'legendary'; state.nextTreeLegendary = false; }
    
    state.trees.push({
        id: '#' + (state.treesPlanted + 1),
        age: 0, health: 100, water: 80, pests: 0,
        stage: 'seed', rarity: rarity, protected: state.protectionActive
    });
    state.treesPlanted++;
    log(`🌱 Planted fresh ${rarity.toUpperCase()} node across grid.`);
    render();
    if (currentUser) saveGameToCloud();
}

function interactTree(index) {
    const tree = state.trees[index];
    if (!tree || tree.health <= 0) return;
    
    if (tree.stage === 'mature') {
        let baseYield = 11 * (tree.health / 100);
        let finalYield = baseYield * (rarityIcons[tree.rarity]?.bonus || 1) * state.skillMultipliers.yield;
        
        state.hopper += finalYield;
        state.totalHarvests++;
        state.quest.current += finalYield;
        
        tree.age = 0; tree.stage = 'seed'; tree.pests = 0;
        showToast(`+${finalYield.toFixed(1)}kg collected`);
        log(`🫒 Grid index harvest generated +${finalYield.toFixed(1)}kg.`);
        checkQuest();
    } else {
        tree.water = Math.min(100, tree.water + 25);
        showToast('💧 Hydration matrix calibrated');
    }
    render();
}

function harvestAll() {
    const targets = state.trees.filter(t => t.stage === 'mature' && t.health > 0);
    if (targets.length === 0) { showToast("No mature items found.", true); return; }
    targets.forEach((_, idx) => {
        const actualIdx = state.trees.findIndex(t => t.stage === 'mature' && t.health > 0);
        if (actualIdx !== -1) interactTree(actualIdx);
    });
}

function waterAll() {
    state.trees.forEach(t => { if (t.health > 0) t.water = Math.min(100, t.water + 25); });
    showToast("💧 Grid hydration sequence completed.");
    render();
}

function sprayGrove() {
    if (state.sol < 0.5) { showToast("Insufficent operational SOL", true); return; }
    state.sol -= 0.5;
    state.trees.forEach(t => t.pests = 0);
    showToast("🐛 Pest vectors eradicated.");
    render();
}

function checkQuest() {
    if (state.quest.current >= state.quest.target) {
        state.sol += state.quest.reward;
        state.seeds += state.quest.seedReward;
        showToast(`🏆 CONTRACT FULFILLED! +${state.quest.reward} SOL`);
        state.quest.current = 0;
        state.quest.target = Math.floor(Math.random() * 60) + 40;
        render();
    }
}

function checkAchievements() {}
function sellHalfOil() {}
function resetGame() { if(confirm("Hard clear estate context data?")) { localStorage.clear(); location.reload(); } }

// ============================================================
// SYSTEM ENTRY CONFIGURATIONS
// ============================================================

window.addEventListener('DOMContentLoaded', () => {
    // Basic structural initialization actions
    document.getElementById('plant-btn').onclick = buyTree;
    document.getElementById('spray-btn').onclick = sprayGrove;
    document.getElementById('harvest-all-btn').onclick = harvestAll;
    document.getElementById('water-all-btn').onclick = waterAll;
    document.getElementById('style-sell-btn').onclick = sellOil;
    document.getElementById('fab-mill').onclick = pressMill;
    
    // Injection of dynamic archetype panel selection bindings directly to bottom utilities
    const utilitiesContainer = document.querySelector('.fixed.bottom-0 div');
    if (utilitiesContainer) {
        utilitiesContainer.innerHTML = `
            <button class="text-center text-green-500 font-bold" onclick="chooseSpecialization('agrarian')">🌾<br>AGRARIAN</button>
            <button class="text-center text-yellow-500 font-bold" onclick="chooseSpecialization('industrialist')">⚙️<br>INDUSTRIAL</button>
            <button class="text-center text-purple-400 font-bold" onclick="chooseSpecialization('speculator')">📊<br>SPECULATOR</button>
            <button class="text-center hover:text-white" onclick="cleanMill()">🔧<br>COOL/REPAIR</button>
        `;
    }

    // Frame loops execution
    setInterval(gameLoop, 2000);
    setInterval(weatherCycle, 16000);
    setInterval(marketCycle, 22000);
    
    // Initialize baseline starting items
    for (let i = 0; i < 3; i++) {
        state.trees.push({
            id: '#' + (i + 1), age: 0, health: 100, water: 80, stage: 'seed', rarity: 'common', protected: false
        });
    }
    
    render();
    log("🎮 Kintara System Core initiated. Select a specialization archetype below to begin your operational strategy run!");
});
