// ============================================================
// OLIVIUM GAME - Complete with Wallet Balances & OLV Shop
// ============================================================

import { sb, getIdentity, isConnected, connection } from "./src/connection.ts";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { Transaction, TransactionInstruction } from "@solana/web3.js";
import BN from 'bn.js';

// OLV Token Mint Address - REPLACE WITH YOUR ACTUAL OLV MINT
const OLV_MINT_ADDRESS = new PublicKey("6C3xwo24Tvkw6fxSK1PNLCcQsWJt7Y9seH95xMtTP8V9");

let currentUser = null;
let walletSolBalance = 0;
let walletOlvBalance = 0;
let treasurySolBalance = 0;

// ============================================================
// GAME STATE
// ============================================================

const state = {
    sol: 25.0, seeds: 0, oil: 0, hopper: 0, lifetimeSol: 25.0,
    treesPlanted: 3, totalHarvests: 0, comboRecord: 1.0, rareCount: 0,
    trees: [],
    upgrades: { irrigation: false, misting: false, fertilizer: false, flyTraps: false },
    skills: [],
    skillMultipliers: { yield: 1.0, speed: 1.0, extraction: 1.0, rare: 0.1 },
    world: { time: 8, temp: 24, weather: 'Clear', season: 'Spring', price: 2.50, demand: 'Normal' },
    mill: { mash: 0, gunk: 0 },
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
    rare: { icon: '💎', bonus: 2.0, name: 'Rare' },
    legendary: { icon: '👑', bonus: 5.0, name: 'Legendary' }
};

// ============================================================
// OLV TOKEN FUNCTIONS
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
        console.log(`💰 Wallet: ${solInSol} SOL, ${olvBalance} OLV`);
        return { sol: solInSol, olv: olvBalance, treasury: treasurySol };
    } catch (err) {
        console.error("Balance fetch error:", err);
        return { sol: 0, olv: 0, treasury: 0 };
    }
}

function createTransferInstruction(source, destination, owner, amount) {
    return new TransactionInstruction({
        keys: [
            { pubkey: source, isSigner: false, isWritable: true },
            { pubkey: destination, isSigner: false, isWritable: true },
            { pubkey: owner, isSigner: true, isWritable: false },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }
        ],
        programId: TOKEN_PROGRAM_ID,
        data: Buffer.from([3, ...new BN(amount).toArray('le', 8)])
    });
}

async function spendOlvTokens(amount, reason) {
    // Simulates or signs an OLV token burn/transfer instruction transaction
    log(`💸 Requesting signature to spend ${amount} OLV for: ${reason}`);
    try {
        // If wallet is connected, a custom transaction can be pushed to window.solana here
        walletOlvBalance = Math.max(0, walletOlvBalance - amount);
        return true;
    } catch(e) {
        console.error("Token spend failed", e);
        showToast("Transaction signature rejected", true);
        return false;
    }
}

// ============================================================
// CLOUD RETRIEVAL/SAVE PLACEHOLDERS
// ============================================================

async function saveGameToCloud() {
    if (!currentUser) return;
    try {
        const payload = JSON.stringify({ state });
        localStorage.setItem(`olv_save_${currentUser.wallet}`, payload);
    } catch(e) {
        console.error("Error saving state", e);
    }
}

async function loadGameFromCloud() {
    if (!currentUser) return false;
    try {
        const data = localStorage.getItem(`olv_save_${currentUser.wallet}`);
        if (data) {
            const parsed = JSON.parse(data);
            Object.assign(state, parsed.state);
            return true;
        }
    } catch(e) {
        console.error("Error loading save", e);
    }
    return false;
}

// ============================================================
// RESET FUNCTION
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
        if (walletOlvBalance < 300) {
            showToast(`Need 300 OLV! You have ${walletOlvBalance}`, true);
            return false;
        }
        const spent = await spendOlvTokens(300, "Estate Reset");
        if (!spent) return false;
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
    state.mill = { mash: 0, gunk: 0 };
    state.combo = 1.0;
    state.quest = { target: 50, current: 0, reward: 10, seedReward: 1 };
    state.achievements = { firstHarvest: false, groveMaster: false, tycoon: false, comboKing: false, rareCollector: false };
    state.fertilizerBoost = false;
    state.fertilizerBoostEnd = 0;
    state.protectionActive = false;
    state.protectionEnd = 0;
    state.nextTreeLegendary = false;
    
    state.seeds = preservedSeeds;
    state.skills = preservedSkills;
    state.skillMultipliers = preservedSkillMultipliers;
    state.upgrades = preservedUpgrades;
    
    for (let i = 0; i < 3; i++) {
        state.trees.push({
            id: '#' + (state.treesPlanted + i + 1),
            age: 0, health: 100, water: 85, pests: 0,
            stage: 'seed', rarity: 'common', protected: false
        });
    }
    state.treesPlanted += 3;
    
    log("🔄 Estate reset! Ancient knowledge preserved (Seeds & Skills kept).");
    log(`✨ Preserved ${preservedSeeds} Ancient Seeds and ${preservedSkills.length} skills`);
    render();
    if (currentUser) saveGameToCloud();
}

function upgradeFlyTraps() {
    const cost = 0.003;
    if (state.sol < cost) {
        showToast(`Need ${cost} SOL to install Fly Traps!`, true);
        return;
    }
    if (state.upgrades.flyTraps) {
        showToast("Fly Traps already installed!", true);
        return;
    }
    state.sol -= cost;
    state.upgrades.flyTraps = true;
    log("🪰 Fly Traps installed! Pests now die 50% faster.");
    showToast("🪰 Fly Traps installed! +50% pest reduction rate");
    render();
    if (currentUser) saveGameToCloud();
}

// ============================================================
// OLV SHOP FUNCTIONS
// ============================================================

const olvShopItems = {
    seeds: { name: 'Ancient Seeds', cost: 100, reward: { seeds: 5 } },
    sol: { name: 'SOL Boost', cost: 50, reward: { sol: 10 } },
    fertilizer: { name: 'Premium Fertilizer', cost: 200, reward: { fertilizerBoost: true, duration: 3600000 } },
    instantHarvest: { name: 'Instant Harvest', cost: 75, reward: { instantHarvest: true } },
    protection: { name: 'Tree Protection', cost: 150, reward: { protection: true, duration: 86400000 } },
    legendary: { name: 'Legendary Seed', cost: 500, reward: { legendary: true } }
};

async function buyWithOlv(itemId) {
    const item = olvShopItems[itemId];
    if (!item) return;
    if (!currentUser) {
        showToast("Connect wallet first!", true);
        return;
    }
    const success = await spendOlvTokens(item.cost, item.name);
    if (!success) return;
    
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
    if (currentUser) saveGameToCloud();
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function getRarity() {
    if (state.nextTreeLegendary) {
        state.nextTreeLegendary = false;
        return 'legendary';
    }
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

async function updateWalletBalancesUI() {
    if (!currentUser || !currentUser.wallet) return;
    const balances = await fetchWalletBalances(currentUser.wallet);
    walletSolBalance = balances.sol;
    walletOlvBalance = balances.olv;
    treasurySolBalance = balances.treasury;
    
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
// CONNECT/DISCONNECT FUNCTIONS
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
        const loaded = await loadGameFromCloud();
        
        if (!loaded) {
            log("🌿 No existing save found. Starting a new estate!");
            if (state.trees.length === 0) {
                for (let i = 0; i < 3; i++) {
                    state.trees.push({
                        id: '#' + (state.treesPlanted + i + 1),
                        age: 0, health: 100, water: 85, pests: 0,
                        stage: 'seed', rarity: 'common', protected: false
                    });
                }
                state.treesPlanted += 3;
            }
            render();
            await saveGameToCloud();
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
    const loaded = await loadGameFromCloud();
    
    if (!loaded) {
        log("🌿 No existing save found. Starting a new estate!");
        if (state.trees.length === 0) {
            for (let i = 0; i < 3; i++) {
                state.trees.push({
                    id: '#' + (state.treesPlanted + i + 1),
                    age: 0, health: 100, water: 85, pests: 0,
                    stage: 'seed', rarity: 'common', protected: false
                });
            }
            state.treesPlanted += 3;
        }
        render();
        await saveGameToCloud();
    }
    render();
}

// ============================================================
// GAME ACTIONS
// ============================================================

function buyTree() {
    if (state.sol < 5) { showToast("Need 5 SOL!", true); return; }
    state.sol -= 5;
    const rarity = getRarity();
    if (rarity === 'rare' || rarity === 'legendary') state.rareCount++;
    state.trees.push({
        id: '#' + (state.treesPlanted + 1),
        age: 0, health: 100, water: 85, pests: 0,
        stage: 'seed', rarity: rarity,
        protected: state.protectionActive || false
    });
    state.treesPlanted++;
    log(`🌱 Planted ${rarityIcons[rarity]?.name || rarity} tree`);
    render();
    checkAchievements();
    if (currentUser) saveGameToCloud();
}

function interactTree(index) {
    const tree = state.trees[index];
    if (!tree || tree.health <= 0) return;
    
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
    const infested = state.trees.filter(t => t.pests > 0).length;
    if (infested === 0) { showToast("No pests to spray!", true); return; }
    state.sol -= 0.5;
    state.trees.forEach(t => t.pests = 0);
    showToast("Pests removed!");
    log("🐛 Pest control applied");
    render();
    if (currentUser) saveGameToCloud();
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
    if (currentUser) saveGameToCloud();
}

function waterAll() {
    const dryTrees = state.trees.filter(t => t.water < 100 && t.health > 0);
    if (dryTrees.length === 0) { showToast("All trees fully watered!", true); return; }
    dryTrees.forEach(tree => {
        tree.water = Math.min(100, tree.water + 30);
    });
    showToast(`💧 Watered ${dryTrees.length} trees`);
    log(`💧 Bulk watered ${dryTrees.length} trees`);
    render();
    if (currentUser) saveGameToCloud();
}

function removeDeadTrees() {
    const deadCount = state.trees.filter(t => t.health <= 0).length;
    if (deadCount === 0) { showToast("No dead trees to remove!", true); return; }
    state.trees = state.trees.filter(t => t.health > 0);
    showToast(`💀 Removed ${deadCount} dead tree${deadCount > 1 ? 's' : ''}`);
    log(`💀 Cleared ${deadCount} dead trees from grove`);
    render();
    if (currentUser) saveGameToCloud();
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
        for (let i = 0; i < 3; i++) {
            const rarity = getRarity();
            state.trees.push({
                id: '#' + (state.treesPlanted + i + 1),
                age: 0, health: 100, water: 85, pests: 0,
                stage: 'seed', rarity, protected: false
            });
        }
        state.treesPlanted += 3;
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
    if (state.fertilizerBoost && Date.now() > state.fertilizerBoostEnd) {
        state.fertilizerBoost = false;
        log("Fertilizer boost expired");
    }
    if (state.protectionActive && Date.now() > state.protectionEnd) {
        state.protectionActive = false;
        log("Tree protection expired");
    }
    
    state.trees.forEach(tree => {
        if (tree.health <= 0) return;
        if (tree.protected) {
            tree.pests = Math.max(0, tree.pests - 5);
        }
        let waterLoss = state.world.weather === 'Heatwave' ? 12 : (state.world.weather === 'Rainy' ? -8 : 3);
        if (state.upgrades.irrigation && tree.water < 70) waterLoss = -5;
        
        tree.water = Math.max(0, Math.min(100, tree.water - waterLoss));
        let growthRate = 0.05 * state.skillMultipliers.speed;
        if (state.fertilizerBoost) growthRate *= 1.5;
        
        if (tree.water > 40 && tree.health > 30 && tree.stage !== 'mature') tree.age += growthRate;
        if (tree.age > 5 && tree.stage === 'seed') tree.stage = 'sapling';
        if (tree.age > 12 && tree.stage === 'sapling') tree.stage = 'mature';
        
        if (!tree.protected && state.world.season === 'Summer' && Math.random() < 0.03) {
            tree.pests = Math.min(100, tree.pests + 5);
        }
        if (state.upgrades.misting && tree.pests > 0) {
            tree.pests = Math.max(0, tree.pests - 2);
        }
        if (state.upgrades.flyTraps && tree.pests > 0) {
            tree.pests = Math.max(0, tree.pests - 3);
        }
        if (tree.water <= 0 || tree.pests >= 100) {
            tree.health = Math.max(0, tree.health - 4);
        } else if (tree.water > 50 && tree.pests === 0) {
            tree.health = Math.min(100, tree.health + 2);
        }
    });
    render();
}

function weatherCycle() {
    const conditions = ['Clear', 'Rainy', 'Heatwave', 'Overcast'];
    state.world.weather = conditions[Math.floor(Math.random() * conditions.length)];
    if (state.world.weather === 'Heatwave') state.world.temp = Math.floor(Math.random() * 10) + 32;
    else if (state.world.weather === 'Rainy') state.world.temp = Math.floor(Math.random() * 8) + 15;
    else state.world.temp = Math.floor(Math.random() * 12) + 20;
    log(`🌤️ Weather shifted to ${state.world.weather} (${state.world.temp}°C)`);
    render();
}

function marketCycle() {
    const demands = ['Low', 'Normal', 'High', 'Surging'];
    state.world.demand = demands[Math.floor(Math.random() * demands.length)];
    let modifier = 1.0;
    if (state.world.demand === 'Low') modifier = 0.6;
    if (state.world.demand === 'High') modifier = 1.4;
    if (state.world.demand === 'Surging') modifier = 2.1;
    state.world.price = parseFloat(( (Math.random() * 1.2 + 1.8) * modifier ).toFixed(2));
    render();
}

// ============================================================
// CORE RENDERING SYSTEM
// ============================================================

function render() {
    // Top Stats Bar
    const uiTime = document.getElementById('ui-time');
    if (uiTime) uiTime.innerText = `${String(state.world.time).padStart(2, '0')}:00`;
    const uiTemp = document.getElementById('ui-temp');
    if (uiTemp) uiTemp.innerText = `${state.world.temp}°C`;
    const uiWeather = document.getElementById('ui-weather');
    if (uiWeather) uiWeather.innerText = state.world.weather;
    const uiSeason = document.getElementById('ui-season');
    if (uiSeason) uiSeason.innerText = state.world.season;
    
    document.getElementById('ui-sol').innerText = state.sol.toFixed(2);
    document.getElementById('ui-olv').innerText = Math.floor(walletOlvBalance);
    document.getElementById('ui-oil').innerText = state.oil.toFixed(2);
    document.getElementById('ui-seeds').innerText = state.seeds;
    document.getElementById('tree-count').innerText = state.trees.length;
    document.getElementById('ui-price').innerText = state.world.price.toFixed(2);
    document.getElementById('ui-demand').innerText = state.world.demand;
    document.getElementById('ui-hopper').innerText = `${state.hopper.toFixed(1)} kg`;
    
    // Mill Progress Components
    document.getElementById('mash-pct').innerText = `${Math.floor(state.mill.mash)}%`;
    document.getElementById('mash-bar').style.width = `${state.mill.mash}%`;
    document.getElementById('gunk-pct').innerText = `${Math.floor(state.mill.gunk)}%`;
    document.getElementById('gunk-bar').style.width = `${state.mill.gunk}%`;
    
    // Daily Quest Target Nodes
    document.getElementById('quest-current').innerText = Math.floor(state.quest.current);
    document.getElementById('quest-target').innerText = state.quest.target;
    document.getElementById('quest-progress').style.width = `${Math.min(100, (state.quest.current / state.quest.target) * 100)}%`;
    
    // Grid Generation
    const container = document.getElementById('grove-container');
    if (container) {
        container.innerHTML = '';
        state.trees.forEach((tree, idx) => {
            const el = document.createElement('div');
            el.className = `p-3 rounded-xl border relative text-center cursor-pointer select-none transition-all ${
                tree.health <= 0 ? 'bg-red-950/20 border-red-900/50' : 'bg-stone-900/40 border-white/5 hover:border-gold/30'
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
                    ${tree.pests > 0 ? `<div class="text-red-400 text-[8px]">🐛 ${tree.pests}%</div>` : ''}
                </div>
            `;
            container.appendChild(el);
        });
    }
    
    // Dead counts badge visibility
    const deadCount = state.trees.filter(t => t.health <= 0).length;
    const badgeEl = document.getElementById('dead-tree-badge');
    if (badgeEl) {
        if (deadCount > 0) {
            badgeEl.style.display = 'inline-flex';
            document.getElementById('dead-count').innerText = deadCount;
        } else {
            badgeEl.style.display = 'none';
        }
    }
}

// ============================================================
// INITIALIZATION
// ============================================================

window.addEventListener('DOMContentLoaded', () => {
    // Action Event Attachments
    document.getElementById('connectBtn').onclick = showConnectModal;
    document.getElementById('connectWalletBtn').onclick = connectWallet;
    document.getElementById('emailLoginBtn').onclick = emailLogin;
    document.getElementById('closeModalBtn').onclick = hideConnectModal;
    
    document.getElementById('plant-btn').onclick = buyTree;
    document.getElementById('spray-btn').onclick = sprayGrove;
    document.getElementById('harvest-all-btn').onclick = harvestAll;
    document.getElementById('water-all-btn').onclick = waterAll;
    document.getElementById('sell-btn').onclick = sellOil;
    document.getElementById('sell-half-btn').onclick = sellHalfOil;
    document.getElementById('refreshBalanceBtn').onclick = refreshBalances;
    document.getElementById('fab-mill').onclick = pressMill;
    
    // Try restoring implicit browser session profiles
    const cachedUser = localStorage.getItem('currentUser');
    if (cachedUser) {
        try {
            currentUser = JSON.parse(cachedUser);
            if (currentUser.type === 'wallet') connectWallet();
            else emailLogin();
        } catch(e) {
            console.error("Failed to restore session profile", e);
        }
    } else {
        // Fallback default setup
        for (let i = 0; i < 3; i++) {
            state.trees.push({
                id: '#' + (state.treesPlanted + i + 1),
                age: 0, health: 100, water: 85, pests: 0,
                stage: 'seed', rarity: 'common', protected: false
            });
        }
    }
    
    // Launch Intermittent Loop Timers
    setInterval(gameLoop, 2000);
    setInterval(weatherCycle, 20000);
    setInterval(marketCycle, 15000);
    setInterval(() => { 
        state.world.time = (state.world.time + 1) % 24; 
        const seasons = ['Spring', 'Summer', 'Autumn', 'Winter'];
        if (state.world.time === 0) {
            if (Math.random() < 0.15) state.world.season = seasons[(seasons.indexOf(state.world.season) + 1) % 4];
        }
        render(); 
    }, 30000);
    
    render();
    log("🌿 Tap trees to water/harvest. Press the gold button for the mill!");
});
