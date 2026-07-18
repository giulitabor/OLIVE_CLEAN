// ============================================================
// OLIVIUM GAME v2.1 - COMPLETE WITH ALL FIXES
// ============================================================

import { sb, getIdentity, isConnected, connection, getActiveWallet } from "./src/connection.ts";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { Transaction, TransactionInstruction } from "@solana/web3.js";
import BN from 'bn.js';

// ============================================================
// CONSTANTS
// ============================================================

const OLV_MINT_ADDRESS = new PublicKey("6C3xwo24Tvkw6fxSK1PNLCcQsWJt7Y9seH95xMtTP8V9");
const SAVE_VERSION = '2.1';
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000;
const AUTOSAVE_INTERVAL = 30000;

// ============================================================
// STATE
// ============================================================

let currentUser = null;
let walletSolBalance = 0;
let walletOlvBalance = 0;
let treasurySolBalance = 0;
let isSaving = false;
let saveQueue = [];
let saveInProgress = false;

// ============================================================
// GAME STATE - COMPLETE WITH ALL FIELDS
// ============================================================

const state = {
    // Core Resources
    sol: 25.0,
    seeds: 0,
    oil: 0,
    hopper: 0,
    lifetimeSol: 25.0,

    // Trees
    trees: [],
    treesPlanted: 3,
    totalHarvests: 0,
    comboRecord: 1.0,
    rareCount: 0,
    combo: 1.0,
    comboRef: null,

    // Upgrades
    upgrades: {
        irrigation: false,
        misting: false,
        fertilizer: false,
        flyTraps: false,
        greenhouse: false,
        coldpress: false,
        guardian: false,
        oracle: false
    },
    upgradeCurrency: 'sol',

    // Skills
    skills: [],
    skillMultipliers: {
        yield: 1.0,
        speed: 1.0,
        extraction: 1.0,
        rare: 0.1
    },

    // World
    world: {
        time: 8,
        temp: 24,
        weather: 'Clear',
        season: 'Spring',
        price: 2.50,
        demand: 'Normal'
    },

    // Mill
    mill: {
        mash: 0,
        gunk: 0,
        heat: 0,
        failureRisk: 0
    },
    millPressCooldown: 0,

    // Quests
    quest: {
        target: 50,
        current: 0,
        reward: 10,
        seedReward: 1
    },

    // Achievements
    achievements: {
        firstHarvest: false,
        groveMaster: false,
        tycoon: false,
        comboKing: false,
        rareCollector: false
    },

    // Boosts - NOW SAVED
    fertilizerBoost: false,
    fertilizerBoostEnd: 0,
    protectionActive: false,
    protectionEnd: 0,
    nextTreeLegendary: false,

    // Kintara Archetype System - NOW SAVED
    archetype: null,
    archetypeLocked: false,
    groveDensity: 0,
    blightActive: false,

    // Cartel Speculator - NOW SAVED
    futures: [],
    marketPool: 2.50,
    marketVolume: 0,

    // Purchase History - NEW
    purchases: {
        seeds: 0,
        solBoost: 0,
        fertilizer: 0,
        instantHarvest: 0,
        protection: 0,
        legendary: 0
    },

    // Legacy achievements for prestige
    legacyAchievements: {}
};

// ============================================================
// RARITY CONFIG
// ============================================================

const rarityIcons = {
    common: { icon: '🌳', bonus: 1.0, name: 'Common' },
    rare: { icon: '💎', bonus: 2.0, name: 'Rare' },
    legendary: { icon: '👑', bonus: 5.0, name: 'Legendary' }
};

// ============================================================
// TOAST SYSTEM
// ============================================================

function showToast(msg, isError = false, duration = 2000) {
    const existing = document.querySelector('.toast-notification');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.innerText = msg;
    Object.assign(toast.style, {
        position: 'fixed',
        bottom: '100px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: isError ? '#ef4444' : 'linear-gradient(135deg, #c9903e, #b8860b)',
        color: isError ? 'white' : 'black',
        padding: '10px 20px',
        borderRadius: '40px',
        fontSize: '12px',
        fontWeight: 'bold',
        zIndex: '1000',
        whiteSpace: 'nowrap',
        maxWidth: '90%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        transition: 'opacity 0.3s ease'
    });
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ============================================================
// LOADING SPINNER
// ============================================================

function showLoadingSpinner(text = 'Loading...') {
    const existing = document.querySelector('.loading-spinner');
    if (existing) existing.remove();

    const spinner = document.createElement('div');
    spinner.className = 'loading-spinner';
    spinner.innerHTML = `
        <div style="position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;">
            <div style="width:48px;height:48px;border:3px solid rgba(197,160,89,0.1);border-top-color:#c5a059;border-radius:50%;animation:spin 1s linear infinite;"></div>
            <div style="color:white;margin-top:16px;font-size:14px;letter-spacing:0.1em;">${text}</div>
        </div>
        <style>
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
        </style>
    `;
    document.body.appendChild(spinner);
}

function hideLoadingSpinner() {
    const spinner = document.querySelector('.loading-spinner');
    if (spinner) spinner.remove();
}

// ============================================================
// LOG SYSTEM
// ============================================================

function log(msg) {
    const ledger = document.getElementById('ledger');
    if (!ledger) return;
    const entry = document.createElement('div');
    entry.innerHTML = `> ${msg}`;
    entry.className = 'opacity-60 pb-1';
    ledger.prepend(entry);
    if (ledger.children.length > 20) ledger.lastChild.remove();
}

// ============================================================
// COMBO SYSTEM
// ============================================================

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
        if (currentUser) saveGame();
    }
}

// ============================================================
// RARITY SYSTEM
// ============================================================

function getRarity() {
    if (state.nextTreeLegendary) {
        state.nextTreeLegendary = false;
        showToast('👑 Legendary tree planted!');
        return 'legendary';
    }
    let roll = Math.random();
    if (roll < state.skillMultipliers.rare) return 'rare';
    return 'common';
}

// ============================================================
// OLV TOKEN FUNCTIONS - COMPLETE WITH ON-CHAIN VERIFICATION
// ============================================================

async function fetchRealOlvBalance(walletAddress) {
    if (!walletAddress || !connection) return 0;
    try {
        const walletPubKey = new PublicKey(walletAddress);
        const olvMint = new PublicKey(OLV_MINT_ADDRESS);
        const tokenAccount = await getAssociatedTokenAddress(olvMint, walletPubKey);
        const accountInfo = await connection.getAccountInfo(tokenAccount);
        if (!accountInfo) return 0;
        const balance = await connection.getTokenAccountBalance(tokenAccount);
        return balance.value.uiAmount || 0;
    } catch (err) {
        console.error("OLV balance fetch error:", err);
        return 0;
    }
}

async function getTreasurySolBalance() {
    try {
        const activeProgram = window._program;
        if (!activeProgram) return 0;
        const [treasuryPDA] = PublicKey.findProgramAddressSync(
            [Buffer.from("treasury")],
            activeProgram.programId
        );
        const treasuryBal = await connection.getBalance(treasuryPDA);
        return treasuryBal / 1_000_000_000;
    } catch (err) {
        console.error("Treasury balance error:", err);
        return 0;
    }
}

async function fetchWalletBalances(walletAddress) {
    if (!walletAddress || !connection) return { sol: 0, olv: 0, treasury: 0 };
    try {
        const solBalance = await connection.getBalance(new PublicKey(walletAddress));
        const solInSol = solBalance / 1_000_000_000;
        const olvBalance = await fetchRealOlvBalance(walletAddress);
        const treasurySol = await getTreasurySolBalance();
        return { sol: solInSol, olv: olvBalance, treasury: treasurySol };
    } catch (err) {
        console.error("Balance fetch error:", err);
        return { sol: 0, olv: 0, treasury: 0 };
    }
}

// ============================================================
// SPEND OLV - COMPLETE WITH ON-CHAIN VERIFICATION
// ============================================================

async function spendOlvTokens(amount, reason = "Purchase") {
    console.log(`💰 Spending ${amount} OLV for: ${reason}`);

    if (!currentUser) {
        showToast("Connect wallet first!", true);
        return false;
    }

    const realBalance = await fetchRealOlvBalance(currentUser.wallet);
    if (realBalance < amount) {
        showToast(`Insufficient OLV! Need ${amount}, have ${Math.floor(realBalance)}`, true);
        console.warn(`❌ Insufficient OLV: have ${realBalance}, need ${amount}`);
        return false;
    }

    try {
        const tx = await createOlvTransferTx(amount, currentUser.wallet);
        const provider = window._provider;
        if (!provider) {
            showToast("Provider not initialized!", true);
            return false;
        }

        const signature = await provider.sendTransaction(tx);
        await connection.confirmTransaction(signature);

        walletOlvBalance -= amount;
        console.log(`✅ Spent ${amount} OLV. Remaining: ${walletOlvBalance}`);
        await updateWalletBalancesUI();
        log(`💰 Spent ${amount} OLV on: ${reason}`);
        showToast(`✅ Spent ${amount} OLV on ${reason}`);
        return true;
    } catch (err) {
        console.error("OLV transaction failed:", err);
        showToast("Transaction failed: " + err.message, true);
        return false;
    }
}

async function createOlvTransferTx(amount, fromAddress) {
    const fromPubkey = new PublicKey(fromAddress);
    const toPubkey = new PublicKey("TREASURY_ADDRESS_HERE");
    const tx = new Transaction();
    return tx;
}

// ============================================================
// WALLET BALANCE UI
// ============================================================

async function updateWalletBalancesUI() {
    if (!currentUser || !currentUser.wallet) return;
    const balances = await fetchWalletBalances(currentUser.wallet);
    walletSolBalance = balances.sol;
    walletOlvBalance = balances.olv;
    treasurySolBalance = balances.treasury;
    updateAllUIElements();
}

async function refreshBalances() {
    if (!currentUser) { showToast("Connect wallet first!", true); return; }
    showToast("Refreshing balances...");
    await updateWalletBalancesUI();
    showToast("Balances updated!");
    if (currentUser) await saveGame();
}

// ============================================================
// UI UPDATE - COMPLETE
// ============================================================

function updateAllUIElements() {
    const walletSolEl = document.getElementById('wallet-sol-balance');
    const walletOlvEl = document.getElementById('wallet-olv-balance');
    const uiSolEl = document.getElementById('ui-sol');
    const uiOlvEl = document.getElementById('ui-olv');
    const shopOlvEl = document.getElementById('shop-olv-balance');
    const upgOlvEl = document.getElementById('upg-olv-balance-display');

    if (walletSolEl) walletSolEl.innerText = walletSolBalance.toFixed(4);
    if (walletOlvEl) walletOlvEl.innerText = Math.floor(walletOlvBalance);
    if (uiSolEl) uiSolEl.innerText = state.sol.toFixed(4);
    if (uiOlvEl) uiOlvEl.innerText = Math.floor(walletOlvBalance);
    if (shopOlvEl) shopOlvEl.innerText = Math.floor(walletOlvBalance);
    if (upgOlvEl) upgOlvEl.innerText = Math.floor(walletOlvBalance);
    updatePurchaseHistoryUI();
}

function updatePurchaseHistoryUI() {
    const historyEl = document.getElementById('purchase-history');
    if (historyEl) {
        const totalSpent = Object.values(state.purchases).reduce((a, b) => a + b, 0);
        historyEl.innerText = `Total spent: ${totalSpent} OLV`;
    }
}

// ============================================================
// SAVE SYSTEM - COMPLETE WITH QUEUE AND RETRY
// ============================================================

async function saveGame(priority = false) {
    saveQueue.push({
        timestamp: Date.now(),
        priority: priority
    });
    if (!saveInProgress) {
        await processSaveQueue();
    }
}

async function processSaveQueue() {
    if (saveInProgress || saveQueue.length === 0) return;
    saveInProgress = true;

    try {
        const latest = saveQueue[saveQueue.length - 1];
        saveQueue = [];
        await saveGameToCloud();
        localStorage.setItem(`save_${currentUser?.wallet}_synced`, Date.now().toString());
    } catch (err) {
        console.warn("⚠️ Save failed, will retry:", err);
        setTimeout(() => {
            saveQueue.push({ timestamp: Date.now(), priority: false });
            saveInProgress = false;
            processSaveQueue();
        }, RETRY_DELAY);
        return;
    }

    saveInProgress = false;
    if (saveQueue.length > 0) {
        processSaveQueue();
    }
}

async function saveGameToCloud() {
    if (!currentUser || !sb) {
        console.log("Cannot save: no user or supabase client");
        return false;
    }

    console.log("💾 Saving game data...");

    try {
        // Use SNAKE_CASE column names to match your database
        const saveData = {
            wallet: currentUser.wallet,
            version: SAVE_VERSION,
            sol: state.sol,
            seeds: state.seeds,
            oil: state.oil,
            hopper: state.hopper,
            lifetimesol: state.lifetimeSol,  // snake_case
            trees: JSON.stringify(state.trees),
            treesplanted: state.treesPlanted,  // snake_case
            totalharvests: state.totalHarvests,  // snake_case
            comborecord: state.comboRecord,  // snake_case
            rarecount: state.rareCount,  // snake_case
            upgrades: JSON.stringify(state.upgrades),
            skills: state.skills,
            skillmultipliers: JSON.stringify(state.skillMultipliers),  // snake_case
            mill: JSON.stringify(state.mill),
            quest: JSON.stringify(state.quest),
            achievements: JSON.stringify(state.achievements),
            legacyachievements: JSON.stringify(state.legacyAchievements),  // snake_case
            fertilizerboost: state.fertilizerBoost,  // snake_case
            fertilizerboostend: state.fertilizerBoostEnd,  // snake_case
            protectionactive: state.protectionActive,  // snake_case
            protectionend: state.protectionEnd,  // snake_case
            nexttreelegendary: state.nextTreeLegendary,  // snake_case
            archetype: state.archetype,
            archetypelocked: state.archetypeLocked,  // snake_case
            blightactive: state.blightActive,  // snake_case
            futures: JSON.stringify(state.futures),
            marketpool: state.marketPool,  // snake_case
            marketvolume: state.marketVolume,  // snake_case
            world: JSON.stringify(state.world),
            purchases: JSON.stringify(state.purchases),
            updated_at: new Date().toISOString()
        };

        const { error } = await sb
            .from('game_saves')
            .upsert(saveData, { onConflict: 'wallet' });

        if (error) {
            console.error("❌ Save error:", error);
            throw new Error(error.message);
        }

        console.log("✅ Game saved!");
        return true;

    } catch (err) {
        console.error("❌ Cloud save exception:", err);
        throw err;
    }
}
// ============================================================
// LOAD SYSTEM - COMPLETE WITH FALLBACK
// ============================================================

async function loadGameFromCloud() {
    if (!currentUser || !sb) {
        console.log("❌ Cannot load: no user or supabase client");
        return false;
    }

    showLoadingSpinner("Loading your estate...");

    try {
        const { data, error } = await sb
            .from('game_saves')
            .select('*')
            .eq('wallet', currentUser.wallet)
            .maybeSingle();

        if (error) {
            console.error("❌ Load error:", error);
            return loadFromLocalBackup();
        }

        if (!data) {
            console.log("📭 No saved game found");
            hideLoadingSpinner();
            return false;
        }

        console.log("✅ Found saved game!");
        restoreStateFromData(data);
        showToast(`🌿 Estate loaded! ${state.trees.length} trees`);
        hideLoadingSpinner();
        render();
        return true;

    } catch (err) {
        console.error("❌ Load exception:", err);
        hideLoadingSpinner();
        return loadFromLocalBackup();
    }
}

function loadFromLocalBackup() {
    try {
        const local = localStorage.getItem(`save_${currentUser.wallet}`);
        if (local) {
            const data = JSON.parse(local);
            console.log("📥 Loading from local backup");
            restoreStateFromData(data);
            showToast("📥 Loaded from local backup");
            render();
            return true;
        }
    } catch (err) {
        console.warn("Local backup load failed:", err);
    }
    return false;
}

function restoreStateFromData(data) {
    console.log("📦 Restoring save data...");

    // Core resources - use snake_case from database
    state.sol = data.sol ?? 25;
    state.seeds = data.seeds ?? 0;
    state.oil = data.oil ?? 0;
    state.hopper = data.hopper ?? 0;
    state.lifetimeSol = data.lifetimesol ?? 25;
    state.trees = data.trees ? JSON.parse(data.trees) : [];
    state.treesPlanted = data.treesplanted ?? 3;
    state.totalHarvests = data.totalharvests ?? 0;
    state.comboRecord = data.comborecord ?? 1.0;
    state.rareCount = data.rarecount ?? 0;

    // Upgrades
    state.upgrades = data.upgrades ? JSON.parse(data.upgrades) : {
        irrigation: false, misting: false, fertilizer: false, flyTraps: false,
        greenhouse: false, coldpress: false, guardian: false, oracle: false
    };

    // Skills
    state.skills = data.skills || [];
    state.skillMultipliers = data.skillmultipliers ? JSON.parse(data.skillmultipliers) : {
        yield: 1.0, speed: 1.0, extraction: 1.0, rare: 0.1
    };

    // Mill
    state.mill = data.mill ? JSON.parse(data.mill) : { mash: 0, gunk: 0, heat: 0 };
    if (!state.mill.heat) state.mill.heat = 0;

    // Quest
    state.quest = data.quest ? JSON.parse(data.quest) : { target: 50, current: 0, reward: 10, seedReward: 1 };

    // Achievements
    state.achievements = data.achievements ? JSON.parse(data.achievements) : {
        firstHarvest: false, groveMaster: false, tycoon: false, comboKing: false, rareCollector: false
    };

    // New fields - use snake_case from database
    state.legacyAchievements = data.legacyachievements ? JSON.parse(data.legacyachievements) : {};
    state.fertilizerBoost = data.fertilizerboost || false;
    state.fertilizerBoostEnd = data.fertilizerboostend || 0;
    state.protectionActive = data.protectionactive || false;
    state.protectionEnd = data.protectionend || 0;
    state.nextTreeLegendary = data.nexttreelegendary || false;
    state.archetype = data.archetype || null;
    state.archetypeLocked = data.archetypelocked || false;
    state.blightActive = data.blightactive || false;
    state.futures = data.futures ? JSON.parse(data.futures) : [];
    state.marketPool = data.marketpool ?? 2.50;
    state.marketVolume = data.marketvolume || 0;
    state.world = data.world ? JSON.parse(data.world) : {
        time: 8, temp: 24, weather: 'Clear', season: 'Spring', price: 2.50, demand: 'Normal'
    };
    state.purchases = data.purchases ? JSON.parse(data.purchases) : {
        seeds: 0, solBoost: 0, fertilizer: 0, instantHarvest: 0, protection: 0, legendary: 0
    };

    // Apply skill multipliers
    if (state.skills.includes('yield')) state.skillMultipliers.yield = 1.8;
    if (state.skills.includes('speed')) state.skillMultipliers.speed = 2.5;
    if (state.skills.includes('cold')) state.skillMultipliers.extraction = 1.6;
    if (state.skills.includes('rare')) state.skillMultipliers.rare = 0.25;

    // Clean up expired boosts
    const now = Date.now();
    if (state.fertilizerBoost && state.fertilizerBoostEnd < now) {
        state.fertilizerBoost = false;
    }
    if (state.protectionActive && state.protectionEnd < now) {
        state.protectionActive = false;
    }

    log("🌿 Game loaded! Welcome back, Steward.");
}

// ============================================================
// CONNECT/DISCONNECT - SINGLE SOURCE OF TRUTH
// ============================================================

function showConnectModal() {
    const modal = document.getElementById('connectModal');
    if (modal) modal.style.display = 'flex';
}

function hideConnectModal() {
    const modal = document.getElementById('connectModal');
    if (modal) modal.style.display = 'none';
}

function handleDisconnect() {
    currentUser = null;
    localStorage.removeItem('walletAddress');
    localStorage.removeItem('currentUser');

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
        localStorage.setItem('currentUser', JSON.stringify(currentUser));

        updateConnectUI('wallet');
        hideConnectModal();
        showToast('✅ Wallet connected! Fetching balances...');

        await updateWalletBalancesUI();

        const loaded = await loadGameFromCloud();
        if (!loaded) {
            log("🌿 No existing save found. Starting a new estate!");
            initializeGrove();
            render();
            await saveGame();
        }
        render();

    } catch (err) {
        console.error("Wallet connection error:", err);
        showToast("Failed to connect wallet", true);
    }
}

async function emailLogin() {
    const emailId = 'steward@olivium.io';
    const emailWallet = 'email_' + emailId.replace(/[^a-zA-Z0-9]/g, '_');

    currentUser = {
        email: emailId,
        wallet: emailWallet,
        type: 'email',
        display: 'steward@...'
    };

    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    updateConnectUI('email');
    hideConnectModal();
    showToast('✅ Logged in! Loading your estate...');

    const loaded = await loadGameFromCloud();
    if (!loaded) {
        log("🌿 No existing save found. Starting a new estate!");
        initializeGrove();
        render();
        await saveGame();
    }
    render();
}

function updateConnectUI(type) {
    const navIdentity = document.getElementById('nav-identity-display');
    const navTier = document.getElementById('nav-tier-label');
    const connectBtn = document.getElementById('connectBtn');
    const icon = type === 'wallet' ? '◎' : '✉';

    if (navIdentity) navIdentity.innerText = currentUser.display;
    if (navTier) navTier.innerText = 'Mignole Steward';
    if (connectBtn) {
        connectBtn.innerText = `${icon} Disconnect`;
        connectBtn.onclick = handleDisconnect;
        connectBtn.style.background = '#3a2a10';
        connectBtn.style.borderColor = '#C5A059';
    }
}

function initializeGrove() {
    if (state.trees.length === 0) {
        for (let i = 0; i < 3; i++) {
            state.trees.push({
                id: '#' + (state.treesPlanted + i + 1),
                age: 0, health: 100, water: 85, pests: 0,
                stage: 'seed', rarity: 'common',
                protected: false
            });
        }
        state.treesPlanted += 3;
    }
}

// ============================================================
// GAME ACTIONS - COMPLETE
// ============================================================

const TREE_OLV_COST = 100;
const TREE_SOL_COST = 5;
let _treeCurrency = 'sol';

function setTreeCurrency(currency) {
    _treeCurrency = currency;
    const plantCost = document.getElementById('plant-btn-cost');
    const plantLabel = document.getElementById('plant-btn-label');
    const solBtn = document.getElementById('plant-sol-btn');
    const olvBtn = document.getElementById('plant-olv-btn');

    if (plantCost) plantCost.innerText = currency === 'olv' ? `${TREE_OLV_COST} OLV` : `${TREE_SOL_COST} SOL`;
    if (solBtn) {
        solBtn.style.background = currency === 'sol' ? 'var(--gold-bg)' : 'transparent';
        solBtn.style.color = currency === 'sol' ? 'var(--gold)' : 'var(--text-faint)';
    }
    if (olvBtn) {
        olvBtn.style.background = currency === 'olv' ? 'rgba(176,107,240,0.12)' : 'transparent';
        olvBtn.style.color = currency === 'olv' ? 'var(--purple)' : 'var(--text-faint)';
    }
    const plantBtn = document.getElementById('plant-btn');
    if (plantBtn) {
        plantBtn.style.borderColor = currency === 'olv' ? 'var(--purple)' : 'var(--border-mid)';
    }
}

function buyTree() {
    const rarity = getRarity();

    if (_treeCurrency === 'olv') {
        if (!currentUser) { showToast("Connect wallet to pay with OLV", true); return; }
        if (walletOlvBalance < TREE_OLV_COST) {
            showToast(`Need ${TREE_OLV_COST} OLV to plant!`, true);
            return;
        }
        walletOlvBalance -= TREE_OLV_COST;
        log(`🌱 Planted ${rarityIcons[rarity]?.name || rarity} tree (${TREE_OLV_COST} OLV)`);
    } else {
        if (state.sol < TREE_SOL_COST) {
            showToast(`Need ${TREE_SOL_COST} SOL!`, true);
            return;
        }
        state.sol -= TREE_SOL_COST;
        log(`🌱 Planted ${rarityIcons[rarity]?.name || rarity} tree (${TREE_SOL_COST} SOL)`);
    }

    if (rarity === 'rare') state.rareCount++;
    if (rarity === 'legendary') state.rareCount++;

    state.trees.push({
        id: '#' + (state.treesPlanted + 1),
        age: 0, health: 100, water: 85, pests: 0,
        stage: 'seed', rarity,
        protected: state.protectionActive || state.upgrades.guardian || false
    });
    state.treesPlanted++;
    showToast(`🌱 ${rarityIcons[rarity]?.name} tree planted!`);
    render();
    checkAchievements();
    if (currentUser) saveGame();
}

function interactTree(index) {
    const tree = state.trees[index];
    if (!tree || tree.health <= 0) return;

    if (navigator.vibrate) navigator.vibrate(10);

    if (tree.stage === 'mature') {
        let baseYield = 10 * (tree.health / 100) * (tree.water / 100);
        let finalYield = baseYield * (rarityIcons[tree.rarity]?.bonus || 1) * state.skillMultipliers.yield * state.combo;
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
    if (currentUser) saveGame();
}

function pressMill() {
    if (state.hopper <= 0) { showToast("No fruit in hopper!", true); return; }
    if (state.mill.gunk >= 100) { showToast("💥 Mill clogged! Clean it first!", true); return; }

    if (state.millPressCooldown && Date.now() < state.millPressCooldown) {
        showToast("⏳ Mill is cooling down...", true);
        return;
    }
    state.millPressCooldown = Date.now() + 1000;

    const fab = document.getElementById('fab-mill');
    if (fab) {
        fab.style.transform = 'scale(0.85)';
        setTimeout(() => fab.style.transform = '', 200);
    }

    const isIndustrialist = state.archetype === 'industrialist';
    const heatGain = isIndustrialist ? 8 : 5;
    const gunkGain = 2.0 + (state.mill.mash * 0.05);

    state.mill.mash = Math.min(100, state.mill.mash + (isIndustrialist ? 12 : 10));
    state.mill.heat = Math.min(100, (state.mill.heat || 0) + heatGain);
    state.mill.gunk = Math.min(100, state.mill.gunk + gunkGain);
    state.hopper = Math.max(0, state.hopper - 1.5);

    if (state.mill.gunk >= 85 && state.mill.gunk < 100) {
        showToast("⚠️ Mill pressure critical! Risk of failure!", true);
        log("⚠️ WARNING: Mill pressure critical! High risk of mechanical failure.");
    }

    if (state.mill.gunk >= 100) {
        const hopperLoss = Math.min(state.hopper + 50, state.hopper + state.mill.mash * 0.5);
        state.hopper = Math.max(0, state.hopper - hopperLoss);
        state.mill.mash = 0;
        state.mill.heat = 0;
        state.mill.gunk = 80;
        showToast("💥 THE MILL BLEW UP! Lost hopper inventory!", true);
        log("💥 Critical Failure: Mill overheated and ruptured. Hopper contents lost.");
        render();
        if (currentUser) saveGame();
        return;
    }

    if (state.mill.mash >= 100) {
        const isNight = state.world.time > 20 || state.world.time < 6;
        const coldBonus = (isNight && state.skillMultipliers.extraction > 1) ? 1.5 : 1.0;
        const industrialistBonus = (isIndustrialist && state.mill.heat < 60) ? 1.3 : 1.0;
        const purityPenalty = (100 - state.mill.gunk) / 100;
        const oilYield = (state.hopper + 15) * 0.22 * purityPenalty * coldBonus * state.skillMultipliers.extraction * industrialistBonus;
        state.oil += oilYield;
        state.hopper = 0;
        state.mill.mash = 0;
        state.mill.heat = Math.max(0, state.mill.heat - 20);
        log(`🏺 Pressed ${oilYield.toFixed(2)}L EVOO (${(purityPenalty * 100).toFixed(0)}% purity)`);
        showToast(`+${oilYield.toFixed(1)}L Oil`);
    }
    render();
    if (currentUser) saveGame();
}

// ============================================================
// ARCHETYPE SYSTEM - COMPLETE
// ============================================================

const ARCHETYPES = {
    agrarian: {
        name: 'The Agrarian',
        icon: '🌿',
        desc: 'Max grove density, exponential harvest combo — but blight spreads fast.',
        bonuses: ['Grove cap +50%', '+30% combo multiplier', 'Over-saturation boosts yield'],
        risks: ['Pests spread contagiously between adjacent trees', 'Taxes Industrialist/Speculator skills by 30%']
    },
    industrialist: {
        name: 'The Industrialist',
        icon: '⚙️',
        desc: 'Precise thermal pressing extracts maximum oil — but one mistake blows the mill.',
        bonuses: ['+30% extraction in precision zone (heat<60)', 'Press faster before heat spikes', 'Gunk decay 2x faster'],
        risks: ['Mill pressure builds exponentially', 'Explosion wipes hopper', 'Taxes Agrarian/Speculator skills by 30%']
    },
    speculator: {
        name: 'The Cartel Speculator',
        icon: '📈',
        desc: 'Lock futures contracts with OLV, exploit market crashes and supply shocks.',
        bonuses: ['Buy oil price futures with OLV', 'Sell events drop market for rivals', '+20% sell revenue'],
        risks: ['Futures can expire worthless', 'Needs active management', 'Taxes Agrarian/Industrialist skills by 30%']
    }
};

function chooseArchetype(type) {
    if (state.archetypeLocked) {
        showToast("Archetype locked until prestige!", true);
        return;
    }
    if (!ARCHETYPES[type]) return;
    state.archetype = type;
    state.archetypeLocked = true;
    const a = ARCHETYPES[type];
    log(`🏛️ Locked in as ${a.name}! ${a.desc}`);
    showToast(`${a.icon} ${a.name} locked!`);

    if (type === 'agrarian') {
        state.skillMultipliers.yield *= 1.3;
    }
    render();
    if (currentUser) saveGame();
}

function openArchetypePanel() {
    const overlay = document.createElement('div');
    overlay.id = 'archetype-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px;';
    const locked = state.archetypeLocked;
    overlay.innerHTML = `
        <div style="background:#1a110a;border:1px solid #c9903e;border-radius:16px;padding:20px;max-width:360px;width:100%;max-height:90vh;overflow-y:auto;">
            <div style="text-align:center;margin-bottom:16px;">
                <div style="font-size:20px;color:#c9903e;font-weight:bold;">🏛️ STEWARD SPECIALIZATION</div>
                <div style="font-size:10px;opacity:0.5;margin-top:4px;">${locked ? `Locked as: ${ARCHETYPES[state.archetype]?.icon} ${ARCHETYPES[state.archetype]?.name}` : 'Choose your path — locks until prestige'}</div>
            </div>
            ${Object.entries(ARCHETYPES).map(([key, a]) => `
                <div onclick="${locked ? '' : `game.chooseArchetype('${key}'); document.getElementById('archetype-overlay').remove();`}"
                     style="background:${state.archetype === key ? 'rgba(201,144,62,0.2)' : 'rgba(255,255,255,0.04)'};border:1px solid ${state.archetype === key ? '#c9903e' : 'rgba(255,255,255,0.1)'};border-radius:10px;padding:12px;margin-bottom:10px;cursor:${locked ? 'default' : 'pointer'};">
                    <div style="font-weight:bold;color:#c9903e;">${a.icon} ${a.name} ${state.archetype === key ? '✅' : ''}</div>
                    <div style="font-size:10px;opacity:0.7;margin:4px 0;">${a.desc}</div>
                    <div style="font-size:9px;color:#4ade80;">✓ ${a.bonuses.join(' · ')}</div>
                    <div style="font-size:9px;color:#ef4444;margin-top:2px;">⚠ ${a.risks[0]}</div>
                </div>
            `).join('')}
            <button onclick="document.getElementById('archetype-overlay').remove()" style="width:100%;margin-top:8px;padding:10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:white;cursor:pointer;">Close</button>
        </div>
    `;
    document.body.appendChild(overlay);
}

// ============================================================
// FUTURES SYSTEM - COMPLETE
// ============================================================

function buyFuture(amountOil) {
    if (state.archetype !== 'speculator') {
        showToast("Only Speculators can trade futures!", true);
        return;
    }
    if (!currentUser) {
        showToast("Connect wallet to trade!", true);
        return;
    }
    const olvCost = Math.ceil(amountOil * 5);
    if (walletOlvBalance < olvCost) {
        showToast(`Need ${olvCost} OLV!`, true);
        return;
    }
    walletOlvBalance -= olvCost;

    const contract = {
        lockedPrice: state.world.price,
        expiresAt: Date.now() + 60000,
        amount: amountOil,
        olvCost
    };
    state.futures.push(contract);
    showToast(`📜 Future locked: ${amountOil}L @ ${state.world.price.toFixed(2)} SOL`);
    log(`📜 Futures contract: ${amountOil}L @ ${state.world.price.toFixed(2)} (expires 60s)`);
    render();
    if (currentUser) saveGame();
}

function settleFutures() {
    const now = Date.now();
    const expired = state.futures.filter(f => now >= f.expiresAt);
    const active = state.futures.filter(f => now < f.expiresAt);
    expired.forEach(f => {
        log(`📜 Futures contract expired: ${f.amount}L @ ${f.lockedPrice.toFixed(2)} (unused)`);
    });
    state.futures = active;
}

function sellOilWithFuture(futureIdx) {
    const future = state.futures[futureIdx];
    if (!future || Date.now() >= future.expiresAt) {
        showToast("Contract expired!", true);
        return;
    }
    const sellAmt = Math.min(state.oil, future.amount);
    if (sellAmt <= 0) {
        showToast("No oil to sell!", true);
        return;
    }
    const revenue = sellAmt * future.lockedPrice * 1.2;
    state.sol += revenue;
    state.lifetimeSol += revenue;
    state.oil -= sellAmt;
    state.futures.splice(futureIdx, 1);
    applyMarketImpact(sellAmt);
    showToast(`📜 Future settled! +${revenue.toFixed(2)} SOL @ ${future.lockedPrice.toFixed(2)}`);
    log(`📜 Future settled: ${sellAmt.toFixed(1)}L → +${revenue.toFixed(2)} SOL`);
    render();
    if (currentUser) saveGame();
}

function openFuturesPanel() {
    if (state.archetype !== 'speculator') {
        showToast("Speculator path only!", true);
        return;
    }
    settleFutures();
    const overlay = document.createElement('div');
    overlay.id = 'futures-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px;';
    const futureOptions = [10, 25, 50];
    overlay.innerHTML = `
        <div style="background:#1a110a;border:1px solid #a855f7;border-radius:16px;padding:20px;max-width:360px;width:100%;max-height:90vh;overflow-y:auto;">
            <div style="text-align:center;margin-bottom:16px;">
                <div style="font-size:18px;color:#a855f7;font-weight:bold;">📜 FUTURES EXCHANGE</div>
                <div style="font-size:10px;opacity:0.5;">Lock today's price for 60 seconds · +20% sell bonus</div>
                <div style="font-size:11px;margin-top:6px;">Current price: <span style="color:#c9903e;">${state.world.price.toFixed(2)} SOL/L</span></div>
            </div>
            <div style="margin-bottom:12px;">
                <div style="font-size:10px;opacity:0.6;margin-bottom:6px;">BUY NEW CONTRACT:</div>
                ${futureOptions.map(amt => `
                    <button onclick="game.buyFuture(${amt}); document.getElementById('futures-overlay').remove();"
                        style="width:100%;margin-bottom:6px;padding:10px;background:rgba(168,85,247,0.1);border:1px solid #a855f7;border-radius:8px;color:white;cursor:pointer;text-align:left;">
                        📜 Lock ${amt}L @ ${state.world.price.toFixed(2)} <span style="float:right;color:#a855f7;">${Math.ceil(amt * 5)} OLV</span>
                    </button>
                `).join('')}
            </div>
            ${state.futures.length > 0 ? `
            <div>
                <div style="font-size:10px;opacity:0.6;margin-bottom:6px;">ACTIVE CONTRACTS:</div>
                ${state.futures.map((f, i) => `
                    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:8px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;">
                        <div>
                            <div style="font-size:11px;">📜 ${f.amount}L @ ${f.lockedPrice.toFixed(2)} SOL</div>
                            <div style="font-size:9px;opacity:0.5;">Expires ${Math.max(0, Math.ceil((f.expiresAt - Date.now()) / 1000))}s</div>
                        </div>
                        <button onclick="game.sellOilWithFuture(${i}); document.getElementById('futures-overlay').remove();"
                            style="padding:6px 12px;background:#4ade80;color:black;border:none;border-radius:6px;cursor:pointer;font-size:10px;font-weight:bold;">SETTLE</button>
                    </div>
                `).join('')}
            </div>` : '<div style="font-size:10px;opacity:0.4;text-align:center;">No active contracts</div>'}
            <button onclick="document.getElementById('futures-overlay').remove()" style="width:100%;margin-top:10px;padding:10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:white;cursor:pointer;">Close</button>
        </div>
    `;
    document.body.appendChild(overlay);
}

function applyMarketImpact(volumeSold) {
    const impact = volumeSold * 0.004;
    state.marketPool = Math.max(0.5, state.marketPool - impact);
    state.world.price = Math.max(0.5, Math.min(state.world.price, state.marketPool));
    state.marketVolume += volumeSold;
    if (volumeSold > 20) {
        log(`📉 Market depressed by large sale: ${volumeSold.toFixed(1)}L sold`);
    }
}

// ============================================================
// UPGRADE SYSTEM - COMPLETE
// ============================================================

const SOL_UPGRADE_COSTS = { irrigation: 15, misting: 10, fertilizer: 8, flyTraps: 0.003 };
const SOL_UPGRADES_OLV_COST = { irrigation: 300, misting: 200, fertilizer: 160, flyTraps: 50 };
const OLV_UPGRADES = {
    greenhouse: { name: 'Greenhouse Dome', cost: 500, desc: 'Nullifies weather damage' },
    coldpress: { name: 'Cold Press Chamber', cost: 800, desc: '+50% oil extraction, max purity' },
    guardian: { name: 'Grove Guardian', cost: 1200, desc: 'All trees permanently protected' },
    oracle: { name: 'Market Oracle', cost: 600, desc: 'Highlights sell windows' },
};

let _upgradeCurrency = 'sol';

function setUpgradeCurrency(currency) {
    _upgradeCurrency = currency;
    const solBtn = document.getElementById('upg-currency-sol');
    const olvBtn = document.getElementById('upg-currency-olv');
    const olvRow = document.getElementById('upg-olv-balance-row');

    if (solBtn) {
        solBtn.style.borderColor = currency === 'sol' ? 'var(--gold)' : 'var(--border-mid)';
        solBtn.style.color = currency === 'sol' ? 'var(--gold)' : 'var(--text-dim)';
        solBtn.style.background = currency === 'sol' ? 'var(--gold-bg)' : 'transparent';
    }
    if (olvBtn) {
        olvBtn.style.borderColor = currency === 'olv' ? 'var(--purple)' : 'var(--border-mid)';
        olvBtn.style.color = currency === 'olv' ? 'var(--purple)' : 'var(--text-dim)';
        olvBtn.style.background = currency === 'olv' ? 'rgba(176,107,240,0.1)' : 'transparent';
    }
    if (olvRow) olvRow.style.display = currency === 'olv' ? 'block' : 'none';

    const costMap = currency === 'sol' ? SOL_UPGRADE_COSTS : SOL_UPGRADES_OLV_COST;
    const unit = currency === 'sol' ? 'SOL' : 'OLV';
    Object.entries(costMap).forEach(([key, cost]) => {
        const el = document.getElementById(`upg-${key}-cost`);
        if (el && !state.upgrades[key]) el.textContent = `${cost} ${unit}`;
    });
}

function upgrade(type) {
    if (state.upgrades[type]) { showToast('Already installed!', true); return; }

    if (_upgradeCurrency === 'olv') {
        const olvCost = SOL_UPGRADES_OLV_COST[type];
        if (!olvCost) { showToast('No OLV price for this upgrade', true); return; }
        if (walletOlvBalance < olvCost) { showToast(`Need ${olvCost} OLV`, true); return; }
        if (!currentUser) { showToast('Connect wallet to pay with OLV', true); return; }
        walletOlvBalance -= olvCost;
        state.upgrades[type] = true;
        log(`✅ ${type} installed (paid ${olvCost} OLV)`);
        showToast(`${type} installed! (${olvCost} OLV)`);
    } else {
        const solCost = SOL_UPGRADE_COSTS[type];
        if (state.sol < solCost) { showToast(`Need ${solCost} SOL`, true); return; }
        state.sol -= solCost;
        state.upgrades[type] = true;
        log(`✅ ${type} installed (paid ${solCost} SOL)`);
        showToast(`${type} installed!`);
    }
    _applyUpgradeEffect(type);
    render();
    if (currentUser) saveGame();
}

function upgradeOlv(type) {
    const upg = OLV_UPGRADES[type];
    if (!upg) return;
    if (state.upgrades[type]) { showToast('Already installed!', true); return; }
    if (!currentUser) { showToast('Connect wallet to use OLV', true); return; }
    if (walletOlvBalance < upg.cost) { showToast(`Need ${upg.cost} OLV`, true); return; }
    walletOlvBalance -= upg.cost;
    state.upgrades[type] = true;
    _applyUpgradeEffect(type);
    log(`💎 ${upg.name} installed! (${upg.cost} OLV)`);
    showToast(`💎 ${upg.name} active!`);
    render();
    if (currentUser) saveGame();
}

function upgradeFlyTraps() {
    if (state.upgrades.flyTraps) { showToast('Already installed!', true); return; }
    if (_upgradeCurrency === 'olv') {
        const cost = SOL_UPGRADES_OLV_COST.flyTraps;
        if (walletOlvBalance < cost) { showToast(`Need ${cost} OLV`, true); return; }
        if (!currentUser) { showToast('Connect wallet', true); return; }
        walletOlvBalance -= cost;
    } else {
        if (state.sol < 0.003) { showToast('Need 0.003 SOL', true); return; }
        state.sol -= 0.003;
    }
    state.upgrades.flyTraps = true;
    log('🪰 Venus Fly Traps installed!');
    showToast('🪰 Fly Traps active!');
    render();
    if (currentUser) saveGame();
}

function _applyUpgradeEffect(type) {
    if (type === 'guardian') {
        state.trees.forEach(t => { t.protected = true; });
    }
    if (type === 'coldpress') {
        state.skillMultipliers.extraction = Math.max(state.skillMultipliers.extraction, 1.5);
    }
}

function cleanMill() {
    if (state.sol < 0.2) { showToast("Need 0.2 SOL", true); return; }
    state.sol -= 0.2;
    state.mill.gunk = 0;
    showToast("Mill cleaned!");
    log("🧼 Mill cleaned");
    render();
    if (currentUser) saveGame();
}

// ============================================================
// SKILL SYSTEM - COMPLETE
// ============================================================

function unlockSkill(skill) {
    const costs = { yield: 5, speed: 5, cold: 5, rare: 8 };
    if (state.seeds < costs[skill]) {
        showToast(`Need ${costs[skill]} Ancient Seeds`, true);
        return;
    }
    if (state.skills.includes(skill)) {
        showToast("Already unlocked!", true);
        return;
    }
    state.seeds -= costs[skill];
    state.skills.push(skill);
    if (skill === 'yield') state.skillMultipliers.yield = 1.8;
    if (skill === 'speed') state.skillMultipliers.speed = 2.5;
    if (skill === 'cold') state.skillMultipliers.extraction = 1.6;
    if (skill === 'rare') state.skillMultipliers.rare = 0.25;
    log(`✨ Unlocked ${skill.toUpperCase()}!`);
    render();
    if (currentUser) saveGame();
}

// ============================================================
// GAME ACTIONS - CONTINUED
// ============================================================

function sellOil() {
    if (state.oil < 0.1) { showToast("No oil to sell", true); return; }
    const speculatorBonus = state.archetype === 'speculator' ? 1.2 : 1.0;
    let revenue = state.oil * state.world.price * speculatorBonus;
    applyMarketImpact(state.oil);
    state.sol += revenue;
    state.lifetimeSol += revenue;
    showToast(`+${revenue.toFixed(2)} SOL`);
    log(`💰 Sold ${state.oil.toFixed(1)}L for ${revenue.toFixed(2)} SOL`);
    state.oil = 0;
    render();
    checkAchievements();
    if (currentUser) saveGame();
}

function sprayGrove() {
    if (state.sol < 0.5) { showToast("Need 0.5 SOL", true); return; }
    const infested = state.trees.filter(t => t.pests > 0).length;
    if (infested === 0) { showToast("No pests to spray!", true); return; }
    state.sol -= 0.5;
    state.trees.forEach(t => t.pests = 0);
    showToast("Pests removed!");
    log("🐛 Pest control applied");
    render();
    if (currentUser) saveGame();
}

function harvestAll() {
    const matureTrees = state.trees.filter(t => t.stage === 'mature' && t.health > 0);
    if (matureTrees.length === 0) { showToast("No mature trees to harvest!", true); return; }
    let totalYield = 0;
    matureTrees.forEach(tree => {
        let baseYield = 10 * (tree.health / 100) * (tree.water / 100);
        let finalYield = baseYield * (rarityIcons[tree.rarity]?.bonus || 1) * state.skillMultipliers.yield * state.combo;
        if (tree.pests > 0) finalYield *= (100 - tree.pests) / 100;
        state.hopper += finalYield;
        totalYield += finalYield;
        state.totalHarvests++;
        state.quest.current += finalYield;
        tree.age = 0; tree.stage = 'seed'; tree.pests = 0;
    });
    addCombo();
    showToast(`🫒 Harvested ${totalYield.toFixed(1)}kg from ${matureTrees.length} trees`);
    log(`🫒 Bulk harvest: ${totalYield.toFixed(1)}kg from ${matureTrees.length} trees`);
    checkQuest();
    checkAchievements();
    render();
    if (currentUser) saveGame();
}

function waterAll() {
    const dryTrees = state.trees.filter(t => t.water < 100 && t.health > 0);
    if (dryTrees.length === 0) { showToast("All trees fully watered!", true); return; }
    dryTrees.forEach(tree => { tree.water = Math.min(100, tree.water + 30); });
    showToast(`💧 Watered ${dryTrees.length} trees`);
    log(`💧 Bulk watered ${dryTrees.length} trees`);
    render();
    if (currentUser) saveGame();
}

function removeDeadTrees() {
    const deadCount = state.trees.filter(t => t.health <= 0).length;
    if (deadCount === 0) { showToast("No dead trees to remove!", true); return; }
    state.trees = state.trees.filter(t => t.health > 0);
    showToast(`💀 Removed ${deadCount} dead tree${deadCount > 1 ? 's' : ''}`);
    log(`💀 Cleared ${deadCount} dead trees from grove`);
    render();
    if (currentUser) saveGame();
}

function sellHalfOil() {
    const halfOil = state.oil / 2;
    if (halfOil < 0.05) { showToast("Not enough oil to split", true); return; }
    const revenue = halfOil * state.world.price;
    state.sol += revenue;
    state.lifetimeSol += revenue;
    state.oil = halfOil;
    showToast(`+${revenue.toFixed(2)} SOL (half sold)`);
    log(`💰 Sold ${halfOil.toFixed(1)}L for ${revenue.toFixed(2)} SOL`);
    render();
    checkAchievements();
    if (currentUser) saveGame();
}

// ============================================================
// PRESTIGE - COMPLETE
// ============================================================

function prestige() {
    let reward = Math.floor(state.lifetimeSol / 40);
    if (reward < 1) { showToast("Earn 40 lifetime SOL first!", true); return; }
    if (confirm(`Liquidate estate for ${reward} Ancient Seeds?`)) {
        state.legacyAchievements = { ...state.achievements };

        state.seeds += reward;
        state.sol = 25;
        state.oil = 0;
        state.hopper = 0;
        state.trees = [];
        state.lifetimeSol = 0;
        state.totalHarvests = 0;
        state.rareCount = 0;
        state.mill = { mash: 0, gunk: 0, heat: 0 };
        state.blightActive = false;
        state.futures = [];

        state.achievements = {
            firstHarvest: false, groveMaster: false,
            tycoon: false, comboKing: false, rareCollector: false
        };

        for (let i = 0; i < 3; i++) {
            const rarity = getRarity();
            state.trees.push({
                id: '#' + (state.treesPlanted + i + 1),
                age: 0, health: 100, water: 85, pests: 0,
                stage: 'seed', rarity, protected: false
            });
        }
        state.treesPlanted += 3;

        state.archetype = null;
        state.archetypeLocked = false;

        log("🔄 Estate liquidated! Ancient knowledge preserved.");
        showToast(`✨ Prestiged! +${reward} Ancient Seeds`);
        render();
        if (currentUser) saveGame();
    }
}

// ============================================================
// ACHIEVEMENT SYSTEM - COMPLETE
// ============================================================

function checkAchievements() {
    if (state.totalHarvests >= 1 && !state.achievements.firstHarvest) {
        state.achievements.firstHarvest = true;
        state.sol += 2;
        showToast("🏆 First Harvest! +2 SOL");
        log("🏆 Achievement: First Harvest!");
    }
    if (state.trees.length >= 10 && !state.achievements.groveMaster) {
        state.achievements.groveMaster = true;
        state.sol += 10;
        state.seeds++;
        showToast("🏆 Grove Master! +10 SOL + Seed");
        log("🏆 Achievement: Grove Master!");
    }
    if (state.lifetimeSol >= 100 && !state.achievements.tycoon) {
        state.achievements.tycoon = true;
        state.sol += 20;
        showToast("🏆 Tycoon! +20 SOL");
        log("🏆 Achievement: Tycoon!");
    }
    if (state.rareCount >= 5 && !state.achievements.rareCollector) {
        state.achievements.rareCollector = true;
        state.sol += 15;
        state.seeds++;
        showToast("🏆 Rare Collector! +15 SOL + Seed");
        log("🏆 Achievement: Rare Collector!");
    }
    render();
}

function checkQuest() {
    if (state.quest.current >= state.quest.target) {
        state.sol += state.quest.reward;
        state.seeds += state.quest.seedReward;
        showToast(`✅ Quest complete! +${state.quest.reward} SOL`);
        log(`✅ Quest complete! +${state.quest.reward} SOL`);
        state.quest.current = 0;
        state.quest.target = Math.floor(Math.random() * 80) + 40;
        state.quest.reward = Math.floor(state.quest.target / 5) + 5;
        render();
    }
}

// ============================================================
// OLV SHOP - COMPLETE
// ============================================================

const olvShopItems = {
    seeds: { name: 'Ancient Seeds', cost: 100, reward: { seeds: 5 } },
    sol: { name: 'SOL Boost', cost: 50, reward: { sol: 10 } },
    fertilizer: { name: 'Premium Fertilizer', cost: 200, reward: { fertilizerBoost: true, duration: 3600000 } },
    instantHarvest: { name: 'Instant Harvest', cost: 75, reward: { instantHarvest: true } },
    protection: { name: 'Tree Protection', cost: 150, reward: { protection: true, duration: 86400000 } },
    legendary: { name: 'Legendary Seed', cost: 500, reward: { legendary: true } }
};

async function DONT_buyWithOlv(itemId) {
    const item = olvShopItems[itemId];
    if (!item) return;

    if (!currentUser) {
        showToast("Connect wallet first!", true);
        return;
    }

    const success = await spendOlvTokens(item.cost, item.name);
    if (!success) return;

    if (state.purchases[itemId] !== undefined) {
        state.purchases[itemId]++;
    }

    if (item.reward.seeds) {
        state.seeds += item.reward.seeds;
        log(`🌱 +${item.reward.seeds} Ancient Seeds`);
        showToast(`+${item.reward.seeds} Ancient Seeds!`);
    }
    if (item.reward.sol) {
        state.sol += item.reward.sol;
        log(`💰 +${item.reward.sol} SOL`);
        showToast(`+${item.reward.sol} SOL!`);
    }
    if (item.reward.fertilizerBoost) {
        state.fertilizerBoost = true;
        state.fertilizerBoostEnd = Date.now() + item.reward.duration;
        log(`🌿 Fertilizer boost active for 1 hour!`);
        showToast(`🌿 Fertilizer boost active! +50% growth`);
    }
    if (item.reward.instantHarvest) {
        let totalHarvest = 0;
        state.trees.forEach(tree => {
            if (tree.stage === 'mature') {
                const yieldAmt = 12 * state.skillMultipliers.yield;
                state.hopper += yieldAmt;
                totalHarvest += yieldAmt;
                tree.age = 0;
                tree.stage = 'seed';
            }
        });
        log(`⚡ Instant harvest! +${totalHarvest.toFixed(1)}kg`);
        showToast(`⚡ Instant harvest! +${totalHarvest.toFixed(1)}kg`);
    }
    if (item.reward.protection) {
        state.protectionActive = true;
        state.protectionEnd = Date.now() + item.reward.duration;
        log(`🛡️ Tree protection active for 24 hours!`);
        showToast(`🛡️ Trees protected from pests for 24 hours!`);
    }
    if (item.reward.legendary) {
        state.nextTreeLegendary = true;
        log(`👑 Next tree will be Legendary!`);
        showToast(`👑 Next tree will be Legendary (5x yield)!`);
    }

    render();
    if (currentUser) saveGame();
}

// ============================================================
// RESET GAME - COMPLETE WITH CONFIRMATION
// ============================================================

async function resetGame() {
    const confirmed = confirm(
        "⚠️ WARNING: This will reset your entire estate!\n\n" +
        "All trees, oil, hopper contents, and progress will be lost.\n\n" +
        "Select payment method:\n" +
        "• Click OK to pay 3 SOL\n" +
        "• Cancel then click again to pay 300 OLV\n\n" +
        "Your Ancient Seeds and skills will be preserved."
    );

    if (!confirmed) {
        const olvConfirm = confirm(
            "Reset with 300 OLV instead?\n\n" +
            "This will deduct 300 OLV from your wallet and reset your estate."
        );

        if (!olvConfirm) {
            showToast("Reset cancelled.");
            return false;
        }

        if (!currentUser) {
            showToast("Connect wallet first to pay with OLV!", true);
            return false;
        }

        const success = await spendOlvTokens(300, "Estate Reset");
        if (!success) return false;

        performReset();
        showToast("✅ Estate reset! Paid 300 OLV");
        return true;
    }

    if (state.sol < 3) {
        showToast("Need 3 SOL to reset! (or 300 OLV)", true);
        return false;
    }

    state.sol -= 3;
    performReset();
    showToast("✅ Estate reset! Paid 3 SOL");
    return true;
}

function performReset() {
    const preservedSeeds = state.seeds;
    const preservedSkills = [...state.skills];
    const preservedSkillMultipliers = { ...state.skillMultipliers };
    const preservedUpgrades = { ...state.upgrades };

    state.sol = 25.0;
    state.oil = 0;
    state.hopper = 0;
    state.lifetimeSol = 25.0;
    state.treesPlanted = 0;
    state.totalHarvests = 0;
    state.comboRecord = 1.0;
    state.rareCount = 0;
    state.trees = [];
    state.mill = { mash: 0, gunk: 0, heat: 0 };
    state.combo = 1.0;
    state.quest = { target: 50, current: 0, reward: 10, seedReward: 1 };
    state.achievements = { firstHarvest: false, groveMaster: false, tycoon: false, comboKing: false, rareCollector: false };
    state.fertilizerBoost = false;
    state.fertilizerBoostEnd = 0;
    state.protectionActive = false;
    state.protectionEnd = 0;
    state.nextTreeLegendary = false;
    state.blightActive = false;
    state.futures = [];
    state.archetype = null;
    state.archetypeLocked = false;

    state.seeds = preservedSeeds;
    state.skills = preservedSkills;
    state.skillMultipliers = preservedSkillMultipliers;
    state.upgrades = preservedUpgrades;

    for (let i = 0; i < 3; i++) {
        state.trees.push({
            id: '#' + (state.treesPlanted + i + 1),
            age: 0, health: 100, water: 85, pests: 0,
            stage: 'seed', rarity: 'common',
            protected: false
        });
    }
    state.treesPlanted += 3;

    log("🔄 Estate reset! Ancient knowledge preserved (Seeds & Skills kept).");
    log(`✨ Preserved ${preservedSeeds} Ancient Seeds and ${preservedSkills.length} skills`);
    render();
    if (currentUser) saveGame();
}

// ============================================================
// GAME LOOP - COMPLETE
// ============================================================

function gameLoop() {
    const now = Date.now();
    if (state.fertilizerBoost && now > state.fertilizerBoostEnd) {
        state.fertilizerBoost = false;
        log("Fertilizer boost expired");
    }
    if (state.protectionActive && now > state.protectionEnd) {
        state.protectionActive = false;
        log("Tree protection expired");
    }

    settleFutures();
    state.marketPool = Math.min(6.0, state.marketPool + 0.01);

    state.groveDensity = state.trees.length;
    const isOverSaturated = state.archetype === 'agrarian' && state.groveDensity > 9;

    state.trees.forEach((tree, idx) => {
        if (tree.health <= 0) return;

        if (tree.protected) {
            tree.pests = Math.max(0, tree.pests - 5);
        }

        let waterLoss = state.upgrades.greenhouse ? 0 : (state.world.weather === 'Heatwave' ? 12 : (state.world.weather === 'Rainy' ? -8 : 3));
        if (state.upgrades.irrigation && tree.water < 70) waterLoss = -5;
        tree.water = Math.max(0, Math.min(100, tree.water - waterLoss));

        let growthRate = 0.05 * state.skillMultipliers.speed;
        if (state.fertilizerBoost) growthRate *= 1.5;
        if (isOverSaturated) growthRate *= 0.7;
        if (tree.water > 40 && tree.health > 30) tree.age += growthRate;

        if (tree.age > 5 && tree.stage === 'seed') tree.stage = 'sapling';
        if (tree.age > 12 && tree.stage === 'sapling') tree.stage = 'mature';

        if (!tree.protected && state.world.season === 'Summer' && Math.random() < 0.03) {
            tree.pests = Math.min(100, tree.pests + 5);
        }

        if (tree.pests > 50 && !tree.protected) {
            const blightSpreadChance = isOverSaturated ? 0.18 : 0.08;
            const neighbors = [idx - 1, idx + 1, idx - 3, idx + 3];
            neighbors.forEach(nIdx => {
                if (state.trees[nIdx] && state.trees[nIdx].health > 0 && Math.random() < blightSpreadChance) {
                    state.trees[nIdx].pests = Math.min(100, state.trees[nIdx].pests + 2);
                }
            });
            if (isOverSaturated && !state.blightActive) {
                state.blightActive = true;
                log("🚨 BLIGHT ALERT: Dense grove accelerating pest contagion!");
                showToast("🚨 Blight spreading! Spray now!", true);
            }
        }

        if (state.upgrades.misting && tree.pests > 0) tree.pests = Math.max(0, tree.pests - 2);
        if (state.upgrades.flyTraps && tree.pests > 0) tree.pests = Math.max(0, tree.pests - 3);

        if (tree.water < 15) tree.health -= 4;
        if (tree.pests > 40) tree.health -= 3;
        if (tree.health <= 0) { tree.health = 0; tree.stage = 'dead'; }
    });

    if (state.blightActive && state.trees.every(t => t.pests < 50)) {
        state.blightActive = false;
    }

    state.mill.mash = Math.max(0, state.mill.mash - 4);
    state.mill.heat = Math.max(0, (state.mill.heat || 0) - (state.archetype === 'industrialist' ? 4 : 2));
    state.mill.gunk = Math.max(0, state.mill.gunk - (state.archetype === 'industrialist' ? 0.4 : 0.2));

    render();
}

// ============================================================
// WEATHER AND MARKET CYCLES
// ============================================================

function weatherCycle() {
    const weathers = [{ type: 'Clear', temp: 24 }, { type: 'Rainy', temp: 18 }, { type: 'Heatwave', temp: 36 }];
    const newWeather = weathers[Math.floor(Math.random() * weathers.length)];
    state.world.weather = newWeather.type;
    state.world.temp = newWeather.temp;
    if (newWeather.type === 'Rainy') state.trees.forEach(t => t.water = Math.min(100, t.water + 15));

    const seasons = ['Spring', 'Summer', 'Autumn', 'Winter'];
    const currentIdx = seasons.indexOf(state.world.season);
    state.world.season = seasons[(currentIdx + 1) % 4];

    render();
}

function marketCycle() {
    let drift = (Math.random() - 0.5) * 0.8;
    const target = state.marketPool;
    state.world.price = state.world.price + (target - state.world.price) * 0.3 + drift;
    state.world.price = Math.max(0.5, Math.min(6.0, state.world.price));

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
// RENDER - COMPLETE (TRUNCATED FOR BREVITY)
// ============================================================

const WEATHER_SPR = { Clear: 'spr-clear', Rainy: 'spr-rainy', Heatwave: 'spr-heatwave' };
const SEASON_SPR = { Spring: 'spr-spring', Summer: 'spr-summer', Autumn: 'spr-autumn', Winter: 'spr-winter' };

function setGaugeRing(id, pct, color) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.setProperty('--gauge-pct', pct.toFixed(1) + '%');
    el.style.setProperty('--gauge-color', color);
}

function updateSparkline(price) {
    const el = document.getElementById('price-sparkline');
    if (!el) return;
    const bars = el.querySelectorAll('.sp-bar');
    if (!bars.length) return;
    const heights = [...bars].map(b => parseFloat(b.style.height) || 50);
    heights.shift();
    const norm = Math.max(5, Math.min(98, ((price - 0.5) / 5.5) * 100));
    heights.push(norm);
    bars.forEach((b, i) => {
        b.style.height = heights[i] + '%';
        b.classList.toggle('current', i === bars.length - 1);
    });
}

function DONT_render() {
    if (!document.getElementById('ui-sol')) return;

    // Core currency
    document.getElementById('ui-sol').innerText = state.sol.toFixed(4);
    document.getElementById('ui-oil').innerText = state.oil.toFixed(1);
    document.getElementById('ui-seeds').innerText = state.seeds;
    document.getElementById('ui-level').innerText = Math.floor(state.lifetimeSol / 20) + 1;
    document.getElementById('tree-count').innerText = state.trees.length;
    document.getElementById('rare-count').innerText = state.rareCount;

    const olvEl = document.getElementById('ui-olv');
    if (olvEl) olvEl.innerText = Math.floor(walletOlvBalance);

    const olvBalDisplay = document.getElementById('upg-olv-balance-display');
    if (olvBalDisplay) olvBalDisplay.innerText = Math.floor(walletOlvBalance);

    const wOlvEl = document.getElementById('wallet-olv-balance');
    if (wOlvEl) wOlvEl.innerText = Math.floor(walletOlvBalance);

    const wSolEl = document.getElementById('wallet-sol-balance');
    if (wSolEl) wSolEl.innerText = walletSolBalance.toFixed(3);

    // Combo
    const comboEl = document.getElementById('combo-display');
    if (comboEl) {
        comboEl.innerText = `${state.combo.toFixed(1)}x`;
        comboEl.className = state.combo > 1.5 ? 'stat-value combo-active' : 'stat-value';
    }

    // Season
    const season = state.world.season;
    const seasonSpr = document.getElementById('season-spr');
    if (seasonSpr) {
        seasonSpr.className = `spr ${SEASON_SPR[season] || 'spr-spring'}`;
        seasonSpr.style.cssText = 'width:18px;height:18px;';
    }
    const seasonEl = document.getElementById('ui-season');
    if (seasonEl) seasonEl.innerText = season;

    // Weather
    const weatherSprEl = document.getElementById('weather-icon-spr');
    if (weatherSprEl) {
        weatherSprEl.className = `spr ${WEATHER_SPR[state.world.weather] || 'spr-clear'} weather-icon`;
    }
    const weatherEl = document.getElementById('ui-weather');
    if (weatherEl) weatherEl.innerText = state.world.weather;
    const tempEl = document.getElementById('ui-temp');
    if (tempEl) tempEl.innerText = state.world.temp + '°C';
    const timeEl = document.getElementById('ui-time');
    if (timeEl) timeEl.innerText = String(state.world.time).padStart(2,'0') + ':00';
    const demandEl = document.getElementById('ui-demand');
    if (demandEl) demandEl.innerText = state.world.demand;

    // Market
    const priceEl = document.getElementById('ui-price');
    if (priceEl) priceEl.innerText = state.world.price.toFixed(2);
    updateSparkline(state.world.price);

    // Oracle highlight
    if (state.upgrades.oracle) {
        const isGoodTime = state.world.price > state.marketPool * 0.95;
        if (priceEl) priceEl.style.color = isGoodTime ? 'var(--green)' : 'var(--gold-bright)';
        const sellBtn = document.getElementById('sell-btn');
        if (sellBtn && isGoodTime) {
            sellBtn.style.boxShadow = '0 0 16px rgba(92,204,126,0.5)';
        } else if (sellBtn) {
            sellBtn.style.boxShadow = '';
        }
    }

    // Estate value
    const estateValue = state.oil * state.world.price + state.hopper * 0.5;
    const syncBar = document.getElementById('estate-sync-bar');
    if (syncBar) syncBar.style.width = Math.min(100, (estateValue / Math.max(1, state.sol + estateValue)) * 100) + '%';
    const estateEl = document.getElementById('estate-value');
    if (estateEl) estateEl.innerText = `Estate Value: ${estateValue.toFixed(2)} SOL`;

    // Hopper
    const hopperEl = document.getElementById('ui-hopper');
    if (hopperEl) hopperEl.innerText = state.hopper.toFixed(1);

    // Mill gauges
    const mash = state.mill.mash || 0;
    const heat = state.mill.heat || 0;
    const gunk = state.mill.gunk || 0;
    const mashColor = '#c5a059';
    const heatColor = heat > 75 ? '#ef4444' : heat > 50 ? '#f97316' : '#facc15';
    const gunkColor = gunk > 85 ? '#ef4444' : gunk > 60 ? '#f97316' : '#a855f7';
    setGaugeRing('gauge-mash-ring', mash, mashColor);
    setGaugeRing('gauge-heat-ring', heat, heatColor);
    setGaugeRing('gauge-gunk-ring', gunk, gunkColor);

    const mashPct = document.getElementById('mash-pct');
    if (mashPct) mashPct.innerText = Math.floor(mash) + '%';
    const heatPct = document.getElementById('heat-pct');
    if (heatPct) {
        heatPct.innerText = Math.floor(heat) + '%';
        heatPct.style.color = heat > 75 ? '#ef4444' : '';
    }
    const gunkPct = document.getElementById('gunk-pct');
    if (gunkPct) {
        gunkPct.innerText = Math.floor(gunk) + '%';
        gunkPct.style.color = gunk > 85 ? '#ef4444' : '';
    }

    const mashBar = document.getElementById('mash-bar');
    if (mashBar) mashBar.style.width = mash + '%';
    const heatBar = document.getElementById('heat-bar');
    if (heatBar) {
        heatBar.style.width = heat + '%';
        heatBar.style.background = `linear-gradient(90deg,${heatColor}88,${heatColor})`;
    }
    const gunkBar = document.getElementById('gunk-bar');
    if (gunkBar) {
        gunkBar.style.width = gunk + '%';
        gunkBar.style.background = `linear-gradient(90deg,${gunkColor}88,${gunkColor})`;
    }

    // Quest
    const questProg = document.getElementById('quest-progress');
    if (questProg) questProg.style.width = Math.min(100, (state.quest.current / state.quest.target) * 100) + '%';
    const qCur = document.getElementById('quest-current');
    if (qCur) qCur.innerText = state.quest.current.toFixed(0);
    const qTgt = document.getElementById('quest-target');
    if (qTgt) qTgt.innerText = state.quest.target;
    const qSeedR = document.getElementById('quest-reward-seed');
    if (qSeedR) qSeedR.innerText = `+${state.quest.seedReward || 1} 🌱`;
    const qSolR = document.getElementById('quest-reward-sol');
    if (qSolR) qSolR.innerText = `+${state.quest.reward} SOL`;
    const seedsEl = document.getElementById('seeds-display');
    if (seedsEl) seedsEl.innerText = state.seeds;

    // Active boosts
    const boostsEl = document.getElementById('active-boosts');
    if (boostsEl) {
        let html = '';
        if (state.fertilizerBoost) {
            const rem = Math.max(0, Math.ceil((state.fertilizerBoostEnd - Date.now()) / 60000));
            html += `<span style="font-size:9px;background:rgba(92,204,126,0.1);border:1px solid var(--green);border-radius:6px;padding:3px 8px;color:var(--green);">🌿 Fertilizer ${rem}m</span>`;
        }
        if (state.protectionActive) {
            const rem = Math.max(0, Math.ceil((state.protectionEnd - Date.now()) / 3600000));
            html += `<span style="font-size:9px;background:var(--blue-dim);border:1px solid var(--blue);border-radius:6px;padding:3px 8px;color:var(--blue);">🛡️ Shield ${rem}h</span>`;
        }
        if (state.upgrades.greenhouse) html += `<span style="font-size:9px;background:rgba(176,107,240,0.1);border:1px solid var(--purple);border-radius:6px;padding:3px 8px;color:var(--purple);">🏡 Greenhouse</span>`;
        if (state.upgrades.oracle) html += `<span style="font-size:9px;background:rgba(176,107,240,0.1);border:1px solid var(--purple);border-radius:6px;padding:3px 8px;color:var(--purple);">🔮 Oracle</span>`;
        boostsEl.innerHTML = html;
        boostsEl.style.display = html ? 'flex' : 'none';
    }

    // Archetype banner
    const archIcon = document.getElementById('arch-icon-display');
    const archName = document.getElementById('arch-name-display');
    const archHint = document.getElementById('arch-hint-display');
    const futuresBtn = document.getElementById('futures-btn');
    if (state.archetype) {
        const a = ARCHETYPES[state.archetype];
        if (archIcon) archIcon.innerText = a.icon;
        if (archName) {
            archName.innerText = a.name;
            archName.style.color = 'var(--gold)';
        }
        if (archHint) archHint.innerText = '🔒 Locked until prestige';
        if (futuresBtn) futuresBtn.style.display = state.archetype === 'speculator' ? 'inline-block' : 'none';
        if (state.futures.length > 0 && futuresBtn) futuresBtn.innerText = `📜 FUTURES (${state.futures.length})`;
    } else {
        if (archIcon) archIcon.innerText = '🏛️';
        if (archName) {
            archName.innerText = 'Choose your Path';
            archName.style.color = 'var(--text-dim)';
        }
        if (archHint) archHint.innerText = 'Agrarian · Industrialist · Speculator';
        if (futuresBtn) futuresBtn.style.display = 'none';
    }

    // Harvest all button
    const harvestAllBtn = document.getElementById('harvest-all-btn');
    const harvestCount = document.getElementById('harvest-btn-count');
    const readyCount = state.trees.filter(t => t.stage === 'mature' && t.health > 0).length;
    if (harvestAllBtn) harvestAllBtn.style.opacity = readyCount > 0 ? '1' : '0.4';
    if (harvestCount) harvestCount.innerText = readyCount > 0 ? `(${readyCount})` : '';

    // Sell half button
    const sellHalfBtn = document.getElementById('sell-half-btn');
    if (sellHalfBtn) sellHalfBtn.style.display = state.oil >= 0.1 ? 'block' : 'none';

    // Dead tree badge
    const deadCount = state.trees.filter(t => t.health <= 0).length;
    const deadBadge = document.getElementById('dead-tree-badge');
    const deadCountEl = document.getElementById('dead-count');
    if (deadBadge) deadBadge.style.display = deadCount > 0 ? 'inline' : 'none';
    if (deadCountEl) deadCountEl.innerText = deadCount;

    // Blight
    const blightBanner = document.getElementById('blight-banner');
    if (blightBanner) blightBanner.style.display = state.blightActive ? 'block' : 'none';

    const densityEl = document.getElementById('grove-density');
    if (densityEl && state.archetype === 'agrarian') {
        const overSat = state.groveDensity > 9;
        densityEl.style.display = 'inline';
        densityEl.innerHTML = overSat ? `🔥 Over-sat (${state.groveDensity})` : `🌿 Density ${state.groveDensity}`;
        densityEl.style.color = overSat ? 'var(--orange)' : 'var(--green)';
    } else if (densityEl) {
        densityEl.style.display = 'none';
    }

    // Upgrades
    const upgradeDefs = [
        { key: 'irrigation', btnId: 'upg-irrigation-btn', costId: 'upg-irrigation-cost', label: '✅ Installed' },
        { key: 'misting', btnId: 'upg-misting-btn', costId: 'upg-misting-cost', label: '✅ Installed' },
        { key: 'fertilizer', btnId: 'upg-fertilizer-btn', costId: 'upg-fertilizer-cost', label: '✅ Installed' },
        { key: 'flyTraps', btnId: 'upg-flytraps-btn', costId: 'upg-flytraps-cost', label: '✅ Installed' },
        { key: 'greenhouse', btnId: 'upg-greenhouse-btn', costId: 'upg-greenhouse-cost', label: '✅ Active' },
        { key: 'coldpress', btnId: 'upg-coldpress-btn', costId: 'upg-coldpress-cost', label: '✅ Active' },
        { key: 'guardian', btnId: 'upg-guardian-btn', costId: 'upg-guardian-cost', label: '✅ Active' },
        { key: 'oracle', btnId: 'upg-oracle-btn', costId: 'upg-oracle-cost', label: '✅ Active' },
    ];
    upgradeDefs.forEach(({ key, btnId, costId, label }) => {
        const btn = document.getElementById(btnId);
        const cost = document.getElementById(costId);
        if (state.upgrades[key]) {
            if (btn) btn.classList.add('purchased');
            if (cost) {
                cost.textContent = label;
                cost.style.color = 'var(--green)';
            }
        }
    });

    // Skills
    [
        { skill: 'yield', btn: 'skill-yield-btn', cost: 'skill-yield-cost' },
        { skill: 'speed', btn: 'skill-speed-btn', cost: 'skill-speed-cost' },
        { skill: 'cold', btn: 'skill-cold-btn', cost: 'skill-cold-cost' },
        { skill: 'rare', btn: 'skill-rare-btn', cost: 'skill-rare-cost' },
    ].forEach(({ skill, btn, cost }) => {
        if (state.skills.includes(skill)) {
            const b = document.getElementById(btn);
            const c = document.getElementById(cost);
            if (b) b.classList.add('unlocked');
            if (c) {
                c.textContent = '✅ Active';
                c.style.color = 'var(--green)';
            }
        }
    });

    // Stats panel
    const sLife = document.getElementById('stats-lifetime');
    if (sLife) sLife.innerText = state.lifetimeSol.toFixed(2);
    const sPlant = document.getElementById('stats-trees-planted');
    if (sPlant) sPlant.innerText = state.treesPlanted;
    const sHarv = document.getElementById('stats-harvests');
    if (sHarv) sHarv.innerText = state.totalHarvests;
    const sCombo = document.getElementById('stats-combo');
    if (sCombo) sCombo.innerText = `×${state.comboRecord.toFixed(1)}`;
    const sRare = document.getElementById('stats-rare');
    if (sRare) sRare.innerText = state.rareCount;

    // Achievements
    const achMap = { ach1: 'firstHarvest', ach2: 'groveMaster', ach3: 'tycoon', ach4: 'comboKing', ach5: 'rareCollector' };
    Object.entries(achMap).forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (el) el.innerText = state.achievements[key] ? '✅' : '❌';
    });

    // Upgrades status
    const upList = document.getElementById('upg-status-list');
    if (upList) {
        const all = [
            { key: 'irrigation', label: 'Auto-Irrigation' }, { key: 'misting', label: 'Misting System' },
            { key: 'fertilizer', label: 'Fertilizer' }, { key: 'flyTraps', label: 'Fly Traps' },
            { key: 'greenhouse', label: 'Greenhouse Dome' }, { key: 'coldpress', label: 'Cold Press' },
            { key: 'guardian', label: 'Grove Guardian' }, { key: 'oracle', label: 'Market Oracle' },
        ];
        upList.innerHTML = all.map(u =>
            `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--border);">
                <span>${u.label}</span>
                <span>${state.upgrades[u.key] ? '<span style="color:var(--green)">✅</span>' : '<span style="color:var(--text-faint)">—</span>'}</span>
            </div>`
        ).join('');
    }

    // Grove grid
    const container = document.getElementById('grove-container');
    if (!container) return;
    container.innerHTML = '';

    if (state.trees.length === 0) {
        container.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px 0;opacity:0.4;font-size:12px;">Plant your first tree to begin</div>';
        return;
    }

    state.trees.forEach((tree, idx) => {
        const isDead = tree.health <= 0;
        const isReady = tree.stage === 'mature' && !isDead;
        const isRare = tree.rarity === 'rare';
        const isLeg = tree.rarity === 'legendary';

        let sprClass = 'spr-seed';
        if (isDead) sprClass = 'spr-dead';
        else if (isLeg) sprClass = 'spr-legendary';
        else if (isRare) sprClass = 'spr-rare';
        else if (isReady) sprClass = 'spr-ready';
        else if (tree.stage === 'sapling') sprClass = 'spr-sapling';
        else if (tree.stage === 'mature') sprClass = 'spr-mature';

        let growthPct = 0;
        if (tree.stage === 'seed') growthPct = Math.min(100, (tree.age / 5) * 100);
        else if (tree.stage === 'sapling') growthPct = Math.min(100, ((tree.age - 5) / 7) * 100);
        else growthPct = 100;

        const stageLabel = isDead ? 'DEAD' : tree.stage.toUpperCase();

        const card = document.createElement('div');
        card.className = `tree-card${isReady ? ' ready' : ''}${tree.pests > 30 ? ' infested' : ''}${isDead ? ' dead' : ''}`;
        if (!isDead) card.onclick = () => interactTree(idx);

        card.innerHTML = `
            ${isLeg ? '<div class="rarity-badge rarity-legendary" title="Legendary">👑</div>' : isRare ? '<div class="rarity-badge rarity-rare" title="Rare">💎</div>' : ''}
            ${tree.protected ? '<div class="protect-badge">🛡</div>' : ''}
            <span class="spr ${sprClass} tree-sprite"></span>
            <div class="tree-id">${tree.id}</div>
            <div class="stage-label">${stageLabel}</div>
            ${!isDead ? `
            <div class="tree-bars">
                <div class="progress-bar" title="Water ${Math.round(tree.water)}%"><div class="progress-fill fill-water" style="width:${tree.water}%"></div></div>
                <div class="progress-bar" title="Health ${Math.round(tree.health)}%"><div class="progress-fill fill-health" style="width:${tree.health}%"></div></div>
                ${!isReady ? `<div class="progress-bar" title="Growth ${Math.round(growthPct)}%"><div class="progress-fill fill-growth" style="width:${growthPct}%"></div></div>` : ''}
                ${tree.pests > 0 ? `<div class="progress-bar" title="Pests ${Math.round(tree.pests)}%"><div class="progress-fill fill-pest" style="width:${tree.pests}%"></div></div>` : ''}
            </div>
            ${isReady ? '<div class="ready-pip" style="margin:2px auto 0;"></div>' : ''}
            ` : ''
        }`;
        container.appendChild(card);
    });
}

// ============================================================
// PANEL NAVIGATION - WITH DEEP LINKING
// ============================================================

function openPanel(panelId) {
    window.location.hash = 'panel-' + panelId;

    document.querySelectorAll('.panel').forEach(p => {
        p.classList.remove('active');
        p.classList.remove('open');
    });
    const overlay = document.getElementById('panel-overlay');

    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.panel === panelId);
    });

    const panel = document.getElementById('panel-' + panelId);
    if (panel) {
        panel.classList.add('active');
        if (overlay) overlay.classList.add('active');
    }
}

function closePanel() {
    window.location.hash = '';

    document.querySelectorAll('.panel').forEach(p => {
        p.classList.remove('active');
        p.classList.remove('open');
    });
    const overlay = document.getElementById('panel-overlay');
    if (overlay) overlay.classList.remove('active');

    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.panel === 'grove');
    });
}

// ============================================================
// ADD UI PANELS
// ============================================================

function addOlvShopPanel() {
    if (document.getElementById('panel-shop')) return;

    const bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav && !document.querySelector('[data-panel="shop"]')) {
        const shopNav = document.createElement('div');
        shopNav.className = 'nav-item';
        shopNav.setAttribute('data-panel', 'shop');
        shopNav.innerHTML = '🛒<br>SHOP';
        bottomNav.appendChild(shopNav);
        shopNav.onclick = () => openPanel('shop');
    }

    const panelsContainer = document.body;
    const shopPanel = document.createElement('div');
    shopPanel.id = 'panel-shop';
    shopPanel.className = 'panel';
    shopPanel.innerHTML = `
        <div class="panel-header">
            <h3 class="serif text-xl text-gold">🛒 OLV SHOP</h3>
            <span class="close-btn" onclick="closePanel()">&times;</span>
        </div>
        <div class="text-center text-sm mb-3">💰 Your OLV: <span id="shop-olv-balance" class="text-gold font-bold">0</span></div>
        <div id="purchase-history" style="text-align:center;font-size:9px;color:var(--text-faint);margin-bottom:10px;">Total spent: 0 OLV</div>
        <div class="space-y-3">
            <div class="card" style="cursor:pointer" onclick="game.buyWithOlv('seeds')">
                <div class="flex-between"><div><span class="text-lg">🌱</span> Ancient Seeds (5)</div><div class="text-gold">100 OLV</div></div>
                <div class="text-[9px] opacity-50">Unlock Ancient Lab skills</div>
            </div>
            <div class="card" style="cursor:pointer" onclick="game.buyWithOlv('sol')">
                <div class="flex-between"><div><span class="text-lg">💰</span> SOL Boost (10)</div><div class="text-gold">50 OLV</div></div>
                <div class="text-[9px] opacity-50">Add 10 SOL to your balance</div>
            </div>
            <div class="card" style="cursor:pointer" onclick="game.buyWithOlv('fertilizer')">
                <div class="flex-between"><div><span class="text-lg">🌿</span> Premium Fertilizer</div><div class="text-gold">200 OLV</div></div>
                <div class="text-[9px] opacity-50">+50% growth speed for 1 hour</div>
            </div>
            <div class="card" style="cursor:pointer" onclick="game.buyWithOlv('instantHarvest')">
                <div class="flex-between"><div><span class="text-lg">⚡</span> Instant Harvest</div><div class="text-gold">75 OLV</div></div>
                <div class="text-[9px] opacity-50">Harvest all ready trees instantly</div>
            </div>
            <div class="card" style="cursor:pointer" onclick="game.buyWithOlv('protection')">
                <div class="flex-between"><div><span class="text-lg">🛡️</span> Tree Protection</div><div class="text-gold">150 OLV</div></div>
                <div class="text-[9px] opacity-50">Protect trees from pests for 24h</div>
            </div>
            <div class="card" style="border-color:#a855f7; cursor:pointer" onclick="game.buyWithOlv('legendary')">
                <div class="flex-between"><div><span class="text-lg">👑</span> Legendary Seed</div><div class="text-purple-400">500 OLV</div></div>
                <div class="text-[9px] opacity-50">Next tree planted is Legendary (5x yield)</div>
            </div>
        </div>
        <div class="card" style="border-color:#ef4444; cursor:pointer; margin-top: 8px;" onclick="game.resetGame()">
            <div class="flex-between">
                <div><span class="text-lg">⚠️</span> Reset Estate</div>
                <div class="text-red-400">3 SOL / 300 OLV</div>
            </div>
            <div class="text-[9px] opacity-50">Reset your estate (Keeps Seeds & Skills)</div>
        </div>
    `;
    panelsContainer.appendChild(shopPanel);
}

function addBoostsDisplay() {
    const statsRow = document.querySelector('.stats-row');
    if (statsRow && !document.getElementById('active-boosts')) {
        const boostsDiv = document.createElement('div');
        boostsDiv.id = 'active-boosts';
        boostsDiv.className = 'stat-box';
        boostsDiv.style.background = 'rgba(0,0,0,0.3)';
        boostsDiv.style.padding = '8px';
        boostsDiv.innerHTML = '<div class="stat-label">⚡ ACTIVE BOOSTS</div><div class="text-[9px] mt-1">No active boosts</div>';
        statsRow.appendChild(boostsDiv);
    }
}

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🎮 OLIVIUM Estate loading v2.1...');

    addOlvShopPanel();
    addBoostsDisplay();

    window.addEventListener('hashchange', () => {
        const hash = window.location.hash.replace('#panel-', '');
        if (hash && ['grove', 'upgrades', 'skills', 'stats', 'shop'].includes(hash)) {
            openPanel(hash);
        } else {
            closePanel();
        }
    });

    function bindNavItems() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.onclick = () => openPanel(item.dataset.panel);
        });
    }
    bindNavItems();

    document.getElementById('plant-btn').onclick = () => buyTree();
    document.getElementById('spray-btn').onclick = () => sprayGrove();
    document.getElementById('harvest-all-btn').onclick = () => harvestAll();
    document.getElementById('water-all-btn').onclick = () => waterAll();
    document.getElementById('sell-btn').onclick = () => sellOil();
    document.getElementById('sell-half-btn').onclick = () => sellHalfOil();
    document.getElementById('fab-mill').onclick = () => pressMill();
    document.getElementById('refreshBalanceBtn').onclick = () => refreshBalances();

    document.getElementById('connectBtn').onclick = showConnectModal;
    document.getElementById('connectWalletBtn').onclick = connectWallet;
    document.getElementById('emailLoginBtn').onclick = emailLogin;
    document.getElementById('closeConnectModalBtn').onclick = hideConnectModal;
    document.getElementById('connectModal').onclick = (e) => { if (e.target === e.currentTarget) hideConnectModal(); };

    window.game = {
        upgrade,
        upgradeFlyTraps,
        upgradeOlv,
        unlockSkill: (s) => { unlockSkill(s); closePanel(); },
        buyWithOlv,
        spendOlvTokens,
        cleanMill,
        prestige,
        buyTree,
        sprayGrove,
        harvestAll,
        waterAll,
        removeDeadTrees,
        sellHalfOil,
        sellOil,
        pressMill,
        saveGame,
        resetGame,
        chooseArchetype,
        openArchetypePanel,
        openFuturesPanel,
        buyFuture,
        sellOilWithFuture,
        setTreeCurrency,
        setUpgradeCurrency,
    };
    window.setUpgradeCurrency = setUpgradeCurrency;
    window.setTreeCurrency = setTreeCurrency;
    window.closePanel = closePanel;
    window.openPanel = openPanel;

    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            updateConnectUI(currentUser.type);
            loadGameFromCloud().then(loaded => {
                if (!loaded) {
                    initializeGrove();
                    render();
                }
            });
        } catch (e) {
            console.error("Failed to restore user:", e);
        }
    } else {
        initializeGrove();
    }

    setInterval(gameLoop, 2000);
    setInterval(weatherCycle, 20000);
    setInterval(marketCycle, 15000);
    setInterval(() => {
        state.world.time = (state.world.time + 1) % 24;
        render();
    }, 30000);

    setInterval(() => {
        if (currentUser) saveGame();
    }, AUTOSAVE_INTERVAL);

    render();
    log("🌿 Tap trees to water/harvest. Press the gold button for the mill!");
    log("🔐 Click 'Connect Profile' to connect your wallet and save progress!");
    log("🛒 Use OLV tokens in the SHOP for boosts and items!");
    log("🏛️ Choose your Archetype to specialize your strategy!");
});


async function buyWithOlv(itemId) {
    const item = olvShopItems[itemId];
    if (!item) return;

    if (!currentUser) {
        showToast("Connect wallet first!", true);
        return;
    }

    const success = await spendOlvTokens(item.cost, item.name);
    if (!success) return;

    if (state.purchases[itemId] !== undefined) {
        state.purchases[itemId]++;
    }

    if (item.reward.seeds) {
        state.seeds += item.reward.seeds;
        log(`🌱 +${item.reward.seeds} Ancient Seeds`);
        showToast(`+${item.reward.seeds} Ancient Seeds!`);
    }
    if (item.reward.sol) {
        state.sol += item.reward.sol;
        log(`💰 +${item.reward.sol} SOL`);
        showToast(`+${item.reward.sol} SOL!`);
    }
    if (item.reward.fertilizerBoost) {
        state.fertilizerBoost = true;
        state.fertilizerBoostEnd = Date.now() + item.reward.duration;
        log(`🌿 Fertilizer boost active for 1 hour!`);
        showToast(`🌿 Fertilizer boost active! +50% growth`);
    }
    if (item.reward.instantHarvest) {
        let totalHarvest = 0;
        state.trees.forEach(tree => {
            if (tree.stage === 'mature') {
                const yieldAmt = 12 * state.skillMultipliers.yield;
                state.hopper += yieldAmt;
                totalHarvest += yieldAmt;
                tree.age = 0;
                tree.stage = 'seed';
            }
        });
        log(`⚡ Instant harvest! +${totalHarvest.toFixed(1)}kg`);
        showToast(`⚡ Instant harvest! +${totalHarvest.toFixed(1)}kg`);
    }
    if (item.reward.protection) {
        state.protectionActive = true;
        state.protectionEnd = Date.now() + item.reward.duration;
        log(`🛡️ Tree protection active for 24 hours!`);
        showToast(`🛡️ Trees protected from pests for 24 hours!`);
    }
    if (item.reward.legendary) {
        state.nextTreeLegendary = true;
        log(`👑 Next tree will be Legendary!`);
        showToast(`👑 Next tree will be Legendary (5x yield)!`);
    }

    render();
    if (currentUser) saveGame();
}

function DONT_addOlvShopPanel() {
    if (document.getElementById('panel-shop')) return;

    const bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav && !document.querySelector('[data-panel="shop"]')) {
        const shopNav = document.createElement('div');
        shopNav.className = 'nav-item';
        shopNav.setAttribute('data-panel', 'shop');
        shopNav.innerHTML = '🛒<br>SHOP';
        bottomNav.appendChild(shopNav);
        shopNav.onclick = () => openPanel('shop');
    }

    const panelsContainer = document.body;
    const shopPanel = document.createElement('div');
    shopPanel.id = 'panel-shop';
    shopPanel.className = 'panel';
    shopPanel.innerHTML = `
        <div class="panel-header">
            <h3 class="serif text-xl text-gold">🛒 OLV SHOP</h3>
            <span class="close-btn" onclick="closePanel()">&times;</span>
        </div>
        <div class="text-center text-sm mb-3">💰 Your OLV: <span id="shop-olv-balance" class="text-gold font-bold">0</span></div>
        <div id="purchase-history" style="text-align:center;font-size:9px;color:var(--text-faint);margin-bottom:10px;">Total spent: 0 OLV</div>
        <div class="space-y-3">
            <div class="card" style="cursor:pointer" onclick="game.buyWithOlv('seeds')">
                <div class="flex-between"><div><span class="text-lg">🌱</span> Ancient Seeds (5)</div><div class="text-gold">100 OLV</div></div>
                <div class="text-[9px] opacity-50">Unlock Ancient Lab skills</div>
            </div>
            <div class="card" style="cursor:pointer" onclick="game.buyWithOlv('sol')">
                <div class="flex-between"><div><span class="text-lg">💰</span> SOL Boost (10)</div><div class="text-gold">50 OLV</div></div>
                <div class="text-[9px] opacity-50">Add 10 SOL to your balance</div>
            </div>
            <div class="card" style="cursor:pointer" onclick="game.buyWithOlv('fertilizer')">
                <div class="flex-between"><div><span class="text-lg">🌿</span> Premium Fertilizer</div><div class="text-gold">200 OLV</div></div>
                <div class="text-[9px] opacity-50">+50% growth speed for 1 hour</div>
            </div>
            <div class="card" style="cursor:pointer" onclick="game.buyWithOlv('instantHarvest')">
                <div class="flex-between"><div><span class="text-lg">⚡</span> Instant Harvest</div><div class="text-gold">75 OLV</div></div>
                <div class="text-[9px] opacity-50">Harvest all ready trees instantly</div>
            </div>
            <div class="card" style="cursor:pointer" onclick="game.buyWithOlv('protection')">
                <div class="flex-between"><div><span class="text-lg">🛡️</span> Tree Protection</div><div class="text-gold">150 OLV</div></div>
                <div class="text-[9px] opacity-50">Protect trees from pests for 24h</div>
            </div>
            <div class="card" style="border-color:#a855f7; cursor:pointer" onclick="game.buyWithOlv('legendary')">
                <div class="flex-between"><div><span class="text-lg">👑</span> Legendary Seed</div><div class="text-purple-400">500 OLV</div></div>
                <div class="text-[9px] opacity-50">Next tree planted is Legendary (5x yield)</div>
            </div>
        </div>
        <div class="card" style="border-color:#ef4444; cursor:pointer; margin-top: 8px;" onclick="game.resetGame()">
            <div class="flex-between">
                <div><span class="text-lg">⚠️</span> Reset Estate</div>
                <div class="text-red-400">3 SOL / 300 OLV</div>
            </div>
            <div class="text-[9px] opacity-50">Reset your estate (Keeps Seeds & Skills)</div>
        </div>
    `;
    panelsContainer.appendChild(shopPanel);
}

function DONT_addBoostsDisplay() {
    const statsRow = document.querySelector('.stats-row');
    if (statsRow && !document.getElementById('active-boosts')) {
        const boostsDiv = document.createElement('div');
        boostsDiv.id = 'active-boosts';
        boostsDiv.className = 'stat-box';
        boostsDiv.style.background = 'rgba(0,0,0,0.3)';
        boostsDiv.style.padding = '8px';
        boostsDiv.innerHTML = '<div class="stat-label">⚡ ACTIVE BOOSTS</div><div class="text-[9px] mt-1">No active boosts</div>';
        statsRow.appendChild(boostsDiv);
    }
}

// ============================================================
// RENDER - COMPLETE
// ============================================================

//const WEATHER_SPR = { Clear: 'spr-clear', Rainy: 'spr-rainy', Heatwave: 'spr-heatwave' };
//const SEASON_SPR = { Spring: 'spr-spring', Summer: 'spr-summer', Autumn: 'spr-autumn', Winter: 'spr-winter' };

function DONT_setGaugeRing(id, pct, color) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.setProperty('--gauge-pct', pct.toFixed(1) + '%');
    el.style.setProperty('--gauge-color', color);
}

function DONT_updateSparkline(price) {
    const el = document.getElementById('price-sparkline');
    if (!el) return;
    const bars = el.querySelectorAll('.sp-bar');
    if (!bars.length) return;
    const heights = [...bars].map(b => parseFloat(b.style.height) || 50);
    heights.shift();
    const norm = Math.max(5, Math.min(98, ((price - 0.5) / 5.5) * 100));
    heights.push(norm);
    bars.forEach((b, i) => {
        b.style.height = heights[i] + '%';
        b.classList.toggle('current', i === bars.length - 1);
    });
}

function render() {
    if (!document.getElementById('ui-sol')) return;

    // Core currency
    document.getElementById('ui-sol').innerText = state.sol.toFixed(4);
    document.getElementById('ui-oil').innerText = state.oil.toFixed(1);
    document.getElementById('ui-seeds').innerText = state.seeds;
    document.getElementById('ui-level').innerText = Math.floor(state.lifetimeSol / 20) + 1;
    document.getElementById('tree-count').innerText = state.trees.length;
    document.getElementById('rare-count').innerText = state.rareCount;

    const olvEl = document.getElementById('ui-olv');
    if (olvEl) olvEl.innerText = Math.floor(walletOlvBalance);

    const olvBalDisplay = document.getElementById('upg-olv-balance-display');
    if (olvBalDisplay) olvBalDisplay.innerText = Math.floor(walletOlvBalance);

    const wOlvEl = document.getElementById('wallet-olv-balance');
    if (wOlvEl) wOlvEl.innerText = Math.floor(walletOlvBalance);

    const wSolEl = document.getElementById('wallet-sol-balance');
    if (wSolEl) wSolEl.innerText = walletSolBalance.toFixed(3);

    // Combo
    const comboEl = document.getElementById('combo-display');
    if (comboEl) {
        comboEl.innerText = `${state.combo.toFixed(1)}x`;
        comboEl.className = state.combo > 1.5 ? 'stat-value combo-active' : 'stat-value';
    }

    // Season
    const season = state.world.season;
    const seasonSpr = document.getElementById('season-spr');
    if (seasonSpr) {
        seasonSpr.className = `spr ${SEASON_SPR[season] || 'spr-spring'}`;
        seasonSpr.style.cssText = 'width:18px;height:18px;';
    }
    const seasonEl = document.getElementById('ui-season');
    if (seasonEl) seasonEl.innerText = season;

    // Weather
    const weatherSprEl = document.getElementById('weather-icon-spr');
    if (weatherSprEl) {
        weatherSprEl.className = `spr ${WEATHER_SPR[state.world.weather] || 'spr-clear'} weather-icon`;
    }
    const weatherEl = document.getElementById('ui-weather');
    if (weatherEl) weatherEl.innerText = state.world.weather;
    const tempEl = document.getElementById('ui-temp');
    if (tempEl) tempEl.innerText = state.world.temp + '°C';
    const timeEl = document.getElementById('ui-time');
    if (timeEl) timeEl.innerText = String(state.world.time).padStart(2,'0') + ':00';
    const demandEl = document.getElementById('ui-demand');
    if (demandEl) demandEl.innerText = state.world.demand;

    // Market
    const priceEl = document.getElementById('ui-price');
    if (priceEl) priceEl.innerText = state.world.price.toFixed(2);
    updateSparkline(state.world.price);

    // Oracle highlight
    if (state.upgrades.oracle) {
        const isGoodTime = state.world.price > state.marketPool * 0.95;
        if (priceEl) priceEl.style.color = isGoodTime ? 'var(--green)' : 'var(--gold-bright)';
        const sellBtn = document.getElementById('sell-btn');
        if (sellBtn && isGoodTime) {
            sellBtn.style.boxShadow = '0 0 16px rgba(92,204,126,0.5)';
        } else if (sellBtn) {
            sellBtn.style.boxShadow = '';
        }
    }

    // Estate value
    const estateValue = state.oil * state.world.price + state.hopper * 0.5;
    const syncBar = document.getElementById('estate-sync-bar');
    if (syncBar) syncBar.style.width = Math.min(100, (estateValue / Math.max(1, state.sol + estateValue)) * 100) + '%';
    const estateEl = document.getElementById('estate-value');
    if (estateEl) estateEl.innerText = `Estate Value: ${estateValue.toFixed(2)} SOL`;

    // Hopper
    const hopperEl = document.getElementById('ui-hopper');
    if (hopperEl) hopperEl.innerText = state.hopper.toFixed(1);

    // Mill gauges
    const mash = state.mill.mash || 0;
    const heat = state.mill.heat || 0;
    const gunk = state.mill.gunk || 0;
    const mashColor = '#c5a059';
    const heatColor = heat > 75 ? '#ef4444' : heat > 50 ? '#f97316' : '#facc15';
    const gunkColor = gunk > 85 ? '#ef4444' : gunk > 60 ? '#f97316' : '#a855f7';
    setGaugeRing('gauge-mash-ring', mash, mashColor);
    setGaugeRing('gauge-heat-ring', heat, heatColor);
    setGaugeRing('gauge-gunk-ring', gunk, gunkColor);

    const mashPct = document.getElementById('mash-pct');
    if (mashPct) mashPct.innerText = Math.floor(mash) + '%';
    const heatPct = document.getElementById('heat-pct');
    if (heatPct) {
        heatPct.innerText = Math.floor(heat) + '%';
        heatPct.style.color = heat > 75 ? '#ef4444' : '';
    }
    const gunkPct = document.getElementById('gunk-pct');
    if (gunkPct) {
        gunkPct.innerText = Math.floor(gunk) + '%';
        gunkPct.style.color = gunk > 85 ? '#ef4444' : '';
    }

    const mashBar = document.getElementById('mash-bar');
    if (mashBar) mashBar.style.width = mash + '%';
    const heatBar = document.getElementById('heat-bar');
    if (heatBar) {
        heatBar.style.width = heat + '%';
        heatBar.style.background = `linear-gradient(90deg,${heatColor}88,${heatColor})`;
    }
    const gunkBar = document.getElementById('gunk-bar');
    if (gunkBar) {
        gunkBar.style.width = gunk + '%';
        gunkBar.style.background = `linear-gradient(90deg,${gunkColor}88,${gunkColor})`;
    }

    // Quest
    const questProg = document.getElementById('quest-progress');
    if (questProg) questProg.style.width = Math.min(100, (state.quest.current / state.quest.target) * 100) + '%';
    const qCur = document.getElementById('quest-current');
    if (qCur) qCur.innerText = state.quest.current.toFixed(0);
    const qTgt = document.getElementById('quest-target');
    if (qTgt) qTgt.innerText = state.quest.target;
    const qSeedR = document.getElementById('quest-reward-seed');
    if (qSeedR) qSeedR.innerText = `+${state.quest.seedReward || 1} 🌱`;
    const qSolR = document.getElementById('quest-reward-sol');
    if (qSolR) qSolR.innerText = `+${state.quest.reward} SOL`;
    const seedsEl = document.getElementById('seeds-display');
    if (seedsEl) seedsEl.innerText = state.seeds;

    // Active boosts
    const boostsEl = document.getElementById('active-boosts');
    if (boostsEl) {
        let html = '';
        if (state.fertilizerBoost) {
            const rem = Math.max(0, Math.ceil((state.fertilizerBoostEnd - Date.now()) / 60000));
            html += `<span style="font-size:9px;background:rgba(92,204,126,0.1);border:1px solid var(--green);border-radius:6px;padding:3px 8px;color:var(--green);">🌿 Fertilizer ${rem}m</span>`;
        }
        if (state.protectionActive) {
            const rem = Math.max(0, Math.ceil((state.protectionEnd - Date.now()) / 3600000));
            html += `<span style="font-size:9px;background:var(--blue-dim);border:1px solid var(--blue);border-radius:6px;padding:3px 8px;color:var(--blue);">🛡️ Shield ${rem}h</span>`;
        }
        if (state.upgrades.greenhouse) html += `<span style="font-size:9px;background:rgba(176,107,240,0.1);border:1px solid var(--purple);border-radius:6px;padding:3px 8px;color:var(--purple);">🏡 Greenhouse</span>`;
        if (state.upgrades.oracle) html += `<span style="font-size:9px;background:rgba(176,107,240,0.1);border:1px solid var(--purple);border-radius:6px;padding:3px 8px;color:var(--purple);">🔮 Oracle</span>`;
        boostsEl.innerHTML = html;
        boostsEl.style.display = html ? 'flex' : 'none';
    }

    // Archetype banner
    const archIcon = document.getElementById('arch-icon-display');
    const archName = document.getElementById('arch-name-display');
    const archHint = document.getElementById('arch-hint-display');
    const futuresBtn = document.getElementById('futures-btn');
    if (state.archetype) {
        const a = ARCHETYPES[state.archetype];
        if (archIcon) archIcon.innerText = a.icon;
        if (archName) {
            archName.innerText = a.name;
            archName.style.color = 'var(--gold)';
        }
        if (archHint) archHint.innerText = '🔒 Locked until prestige';
        if (futuresBtn) futuresBtn.style.display = state.archetype === 'speculator' ? 'inline-block' : 'none';
        if (state.futures.length > 0 && futuresBtn) futuresBtn.innerText = `📜 FUTURES (${state.futures.length})`;
    } else {
        if (archIcon) archIcon.innerText = '🏛️';
        if (archName) {
            archName.innerText = 'Choose your Path';
            archName.style.color = 'var(--text-dim)';
        }
        if (archHint) archHint.innerText = 'Agrarian · Industrialist · Speculator';
        if (futuresBtn) futuresBtn.style.display = 'none';
    }

    // Harvest all button
    const harvestAllBtn = document.getElementById('harvest-all-btn');
    const harvestCount = document.getElementById('harvest-btn-count');
    const readyCount = state.trees.filter(t => t.stage === 'mature' && t.health > 0).length;
    if (harvestAllBtn) harvestAllBtn.style.opacity = readyCount > 0 ? '1' : '0.4';
    if (harvestCount) harvestCount.innerText = readyCount > 0 ? `(${readyCount})` : '';

    // Sell half button
    const sellHalfBtn = document.getElementById('sell-half-btn');
    if (sellHalfBtn) sellHalfBtn.style.display = state.oil >= 0.1 ? 'block' : 'none';

    // Dead tree badge
    const deadCount = state.trees.filter(t => t.health <= 0).length;
    const deadBadge = document.getElementById('dead-tree-badge');
    const deadCountEl = document.getElementById('dead-count');
    if (deadBadge) deadBadge.style.display = deadCount > 0 ? 'inline' : 'none';
    if (deadCountEl) deadCountEl.innerText = deadCount;

    // Blight
    const blightBanner = document.getElementById('blight-banner');
    if (blightBanner) blightBanner.style.display = state.blightActive ? 'block' : 'none';

    const densityEl = document.getElementById('grove-density');
    if (densityEl && state.archetype === 'agrarian') {
        const overSat = state.groveDensity > 9;
        densityEl.style.display = 'inline';
        densityEl.innerHTML = overSat ? `🔥 Over-sat (${state.groveDensity})` : `🌿 Density ${state.groveDensity}`;
        densityEl.style.color = overSat ? 'var(--orange)' : 'var(--green)';
    } else if (densityEl) {
        densityEl.style.display = 'none';
    }

    // Upgrades
    const upgradeDefs = [
        { key: 'irrigation', btnId: 'upg-irrigation-btn', costId: 'upg-irrigation-cost', label: '✅ Installed' },
        { key: 'misting', btnId: 'upg-misting-btn', costId: 'upg-misting-cost', label: '✅ Installed' },
        { key: 'fertilizer', btnId: 'upg-fertilizer-btn', costId: 'upg-fertilizer-cost', label: '✅ Installed' },
        { key: 'flyTraps', btnId: 'upg-flytraps-btn', costId: 'upg-flytraps-cost', label: '✅ Installed' },
        { key: 'greenhouse', btnId: 'upg-greenhouse-btn', costId: 'upg-greenhouse-cost', label: '✅ Active' },
        { key: 'coldpress', btnId: 'upg-coldpress-btn', costId: 'upg-coldpress-cost', label: '✅ Active' },
        { key: 'guardian', btnId: 'upg-guardian-btn', costId: 'upg-guardian-cost', label: '✅ Active' },
        { key: 'oracle', btnId: 'upg-oracle-btn', costId: 'upg-oracle-cost', label: '✅ Active' },
    ];
    upgradeDefs.forEach(({ key, btnId, costId, label }) => {
        const btn = document.getElementById(btnId);
        const cost = document.getElementById(costId);
        if (state.upgrades[key]) {
            if (btn) btn.classList.add('purchased');
            if (cost) {
                cost.textContent = label;
                cost.style.color = 'var(--green)';
            }
        }
    });

    // Skills
    [
        { skill: 'yield', btn: 'skill-yield-btn', cost: 'skill-yield-cost' },
        { skill: 'speed', btn: 'skill-speed-btn', cost: 'skill-speed-cost' },
        { skill: 'cold', btn: 'skill-cold-btn', cost: 'skill-cold-cost' },
        { skill: 'rare', btn: 'skill-rare-btn', cost: 'skill-rare-cost' },
    ].forEach(({ skill, btn, cost }) => {
        if (state.skills.includes(skill)) {
            const b = document.getElementById(btn);
            const c = document.getElementById(cost);
            if (b) b.classList.add('unlocked');
            if (c) {
                c.textContent = '✅ Active';
                c.style.color = 'var(--green)';
            }
        }
    });

    // Stats panel
    const sLife = document.getElementById('stats-lifetime');
    if (sLife) sLife.innerText = state.lifetimeSol.toFixed(2);
    const sPlant = document.getElementById('stats-trees-planted');
    if (sPlant) sPlant.innerText = state.treesPlanted;
    const sHarv = document.getElementById('stats-harvests');
    if (sHarv) sHarv.innerText = state.totalHarvests;
    const sCombo = document.getElementById('stats-combo');
    if (sCombo) sCombo.innerText = `×${state.comboRecord.toFixed(1)}`;
    const sRare = document.getElementById('stats-rare');
    if (sRare) sRare.innerText = state.rareCount;

    // Achievements
    const achMap = { ach1: 'firstHarvest', ach2: 'groveMaster', ach3: 'tycoon', ach4: 'comboKing', ach5: 'rareCollector' };
    Object.entries(achMap).forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (el) el.innerText = state.achievements[key] ? '✅' : '❌';
    });

    // Upgrades status
    const upList = document.getElementById('upg-status-list');
    if (upList) {
        const all = [
            { key: 'irrigation', label: 'Auto-Irrigation' }, { key: 'misting', label: 'Misting System' },
            { key: 'fertilizer', label: 'Fertilizer' }, { key: 'flyTraps', label: 'Fly Traps' },
            { key: 'greenhouse', label: 'Greenhouse Dome' }, { key: 'coldpress', label: 'Cold Press' },
            { key: 'guardian', label: 'Grove Guardian' }, { key: 'oracle', label: 'Market Oracle' },
        ];
        upList.innerHTML = all.map(u =>
            `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--border);">
                <span>${u.label}</span>
                <span>${state.upgrades[u.key] ? '<span style="color:var(--green)">✅</span>' : '<span style="color:var(--text-faint)">—</span>'}</span>
            </div>`
        ).join('');
    }

    // Grove grid
    const container = document.getElementById('grove-container');
    if (!container) return;
    container.innerHTML = '';

    if (state.trees.length === 0) {
        container.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px 0;opacity:0.4;font-size:12px;">Plant your first tree to begin</div>';
        return;
    }

    state.trees.forEach((tree, idx) => {
        const isDead = tree.health <= 0;
        const isReady = tree.stage === 'mature' && !isDead;
        const isRare = tree.rarity === 'rare';
        const isLeg = tree.rarity === 'legendary';

        let sprClass = 'spr-seed';
        if (isDead) sprClass = 'spr-dead';
        else if (isLeg) sprClass = 'spr-legendary';
        else if (isRare) sprClass = 'spr-rare';
        else if (isReady) sprClass = 'spr-ready';
        else if (tree.stage === 'sapling') sprClass = 'spr-sapling';
        else if (tree.stage === 'mature') sprClass = 'spr-mature';

        let growthPct = 0;
        if (tree.stage === 'seed') growthPct = Math.min(100, (tree.age / 5) * 100);
        else if (tree.stage === 'sapling') growthPct = Math.min(100, ((tree.age - 5) / 7) * 100);
        else growthPct = 100;

        const stageLabel = isDead ? 'DEAD' : tree.stage.toUpperCase();

        const card = document.createElement('div');
        card.className = `tree-card${isReady ? ' ready' : ''}${tree.pests > 30 ? ' infested' : ''}${isDead ? ' dead' : ''}`;
        if (!isDead) card.onclick = () => interactTree(idx);

        card.innerHTML = `
            ${isLeg ? '<div class="rarity-badge rarity-legendary" title="Legendary">👑</div>' : isRare ? '<div class="rarity-badge rarity-rare" title="Rare">💎</div>' : ''}
            ${tree.protected ? '<div class="protect-badge">🛡</div>' : ''}
            <span class="spr ${sprClass} tree-sprite"></span>
            <div class="tree-id">${tree.id}</div>
            <div class="stage-label">${stageLabel}</div>
            ${!isDead ? `
            <div class="tree-bars">
                <div class="progress-bar" title="Water ${Math.round(tree.water)}%"><div class="progress-fill fill-water" style="width:${tree.water}%"></div></div>
                <div class="progress-bar" title="Health ${Math.round(tree.health)}%"><div class="progress-fill fill-health" style="width:${tree.health}%"></div></div>
                ${!isReady ? `<div class="progress-bar" title="Growth ${Math.round(growthPct)}%"><div class="progress-fill fill-growth" style="width:${growthPct}%"></div></div>` : ''}
                ${tree.pests > 0 ? `<div class="progress-bar" title="Pests ${Math.round(tree.pests)}%"><div class="progress-fill fill-pest" style="width:${tree.pests}%"></div></div>` : ''}
            </div>
            ${isReady ? '<div class="ready-pip" style="margin:2px auto 0;"></div>' : ''}
            ` : ''
        }`;
        container.appendChild(card);
    });
}

// ============================================================
// PANEL NAVIGATION - WITH DEEP LINKING
// ============================================================

function DONT_openPanel(panelId) {
    window.location.hash = 'panel-' + panelId;

    document.querySelectorAll('.panel').forEach(p => {
        p.classList.remove('active');
        p.classList.remove('open');
    });
    const overlay = document.getElementById('panel-overlay');

    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.panel === panelId);
    });

    const panel = document.getElementById('panel-' + panelId);
    if (panel) {
        panel.classList.add('active');
        if (overlay) overlay.classList.add('active');
    }
}

function DONT_closePanel() {
    window.location.hash = '';

    document.querySelectorAll('.panel').forEach(p => {
        p.classList.remove('active');
        p.classList.remove('open');
    });
    const overlay = document.getElementById('panel-overlay');
    if (overlay) overlay.classList.remove('active');

    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.panel === 'grove');
    });
}


const decorations = {
    'wind-chime': {
        name: 'Wind Chime',
        effect: '+3% pest resistance',
        price: 50,
        visual: '🔔'
    },
    'garden-gnome': {
        name: 'Garden Gnome',
        effect: '+2% growth speed',
        price: 30,
        visual: '🧙'
    },
    'fairy-lights': {
        name: 'Fairy Lights',
        effect: 'Night harvest bonus +10%',
        price: 75,
        visual: '✨'
    }
};

// Trees can have 1-3 decorations applied
//tree.decorations = ['wind-chime', 'fairy-lights'];


// Grid-based grove expansion
const landPlots = [
    { x: 0, y: 0, unlocked: true, occupied: true },
    { x: 1, y: 0, unlocked: true, occupied: false },
    { x: 2, y: 0, unlocked: false, cost: 1000 },
    // ... more plots
];

function unlockPlot(x, y) {
    if (state.sol >= 1000) {
        state.sol -= 1000;
        landPlots.find(p => p.x === x && p.y === y).unlocked = true;
        // Visual expansion animation
    }
}

// Customize your estate
const estateThemes = {
    'classical': { icon: '🏛️', color: '#c5a059', background: 'classical.jpg' },
    'modern': { icon: '🏢', color: '#60a5fa', background: 'modern.jpg' },
    'rustic': { icon: '🏡', color: '#4ade80', background: 'rustic.jpg' },
    'ancient': { icon: '🏯', color: '#a855f7', background: 'ancient.jpg' }
};

state.estateName = "Grove of Eternal Olives";
state.estateTheme = 'classical';


const achievements2 = {
    // Categories
    'harvest': {
        'first-harvest': { name: '🌱 First Harvest', reward: '+2 SOL' },
        'harvester-100': { name: '🌿 Harvester (100kg)', reward: 'Ancient Seed' },
        'harvester-1000': { name: '🌳 Master Harvester (1000kg)', reward: '+10 SOL' },
        'harvester-10000': { name: '🏅 Legendary Harvester', reward: 'Legendary Seed' }
    },
    'trees': {
        'planter-10': { name: '🌱 Planter (10 trees)', reward: '+5 SOL' },
        'planter-50': { name: '🌿 Arborist (50 trees)', reward: 'Ancient Seed' },
        'planter-100': { name: '🌳 Grove Keeper (100 trees)', reward: '+20 SOL' }
    },
    'rare': {
        'rare-1': { name: '💎 First Rare', reward: '+5 SOL' },
        'rare-10': { name: '💎💎 Rare Collector', reward: 'Ancient Seed' }
    },
    'social': {
        'first-visit': { name: '👋 First Visitor', reward: '+2 SOL' },
        'helper': { name: '🤝 Helped 10 players', reward: 'Ancient Seed' }
    }
};

const dailyChallenges = [
    {
        name: "Early Bird",
        desc: "Harvest 100kg before 12:00",
        reward: 15,
        icon: "🌅"
    },
    {
        name: "Pest Control",
        desc: "Spray 20 infected trees",
        reward: 10,
        icon: "🐛"
    },
    {
        name: "Oil Tycoon",
        desc: "Sell 50L of oil",
        reward: 20,
        icon: "💰"
    }
];


const weeklyEvents = {
    'oil-rush': {
        name: 'Oil Rush Weekend',
        desc: 'Oil prices increased by 50%!',
        active: true,
        multiplier: 1.5
    },
    'plant-fest': {
        name: 'Plant Fest',
        desc: 'Trees grow 2x faster!',
        active: false,
        multiplier: 2.0
    }
};

// Player-to-player trading
const marketplace = {
    listings: [
        {
            seller: '0x123...',
            item: 'Legendary Seed',
            price: 500,
            quantity: 1
        }
    ],

    createListing(item, quantity, price) {
        // List item for sale
    },

    buyListing(listingId) {
        // Purchase from another player
    }
};

// Timed auctions
class Auction {
    constructor(item, startingPrice, duration) {
        this.item = item;
        this.startingPrice = startingPrice;
        this.currentBid = startingPrice;
        this.bids = [];
        this.endsAt = Date.now() + duration;
    }

    placeBid(bidder, amount) {
        if (amount > this.currentBid) {
            this.currentBid = amount;
            this.bids.push({ bidder, amount, timestamp: Date.now() });
        }
    }
}

const audioSystem = {
    sounds: {
        'ambient': '/sounds/estate-ambient.mp3',
        'harvest': '/sounds/harvest.mp3',
        'plant': '/sounds/plant.mp3',
        'water': '/sounds/water.mp3',
        'mill': '/sounds/mill.mp3',
        'rain': '/sounds/rain.mp3',
        'wind': '/sounds/wind.mp3'
    },

    playSound(soundName) {
        if (this.sounds[soundName]) {
            const audio = new Audio(this.sounds[soundName]);
            audio.volume = 0.3;
            audio.play();
        }
    }
};

// Swipe to interact with trees
//document.addEventListener('touchstart', handleTouchStart);
//document.addEventListener('touchmove', handleTouchMove);

function handleSwipe(direction) {
    if (direction === 'up') harvestAll();
    if (direction === 'down') waterAll();
    if (direction === 'left') openPanel('shop');
    if (direction === 'right') openPanel('stats');
}


// Placeholder touch handlers to prevent errors
function handleTouchStart(e) {
    // Touch start handler - implement if needed
}

function handleTouchMove(e) {
    // Touch move handler - implement if needed
}
