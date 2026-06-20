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
    upgrades: { irrigation: false, misting: false, fertilizer: false, flyTraps: false,
                greenhouse: false, coldpress: false, guardian: false, oracle: false },
    upgradeCurrency: 'sol', // 'sol' | 'olv'
    skills: [],
    skillMultipliers: { yield: 1.0, speed: 1.0, extraction: 1.0, rare: 0.1 },
    world: { time: 8, temp: 24, weather: 'Clear', season: 'Spring', price: 2.50, demand: 'Normal' },
    mill: { mash: 0, gunk: 0, heat: 0, failureRisk: 0 },
    combo: 1.0, comboRef: null,
    quest: { target: 50, current: 0, reward: 10, seedReward: 1 },
    achievements: { firstHarvest: false, groveMaster: false, tycoon: false, comboKing: false, rareCollector: false },
    fertilizerBoost: false,
    fertilizerBoostEnd: 0,
    protectionActive: false,
    protectionEnd: 0,
    nextTreeLegendary: false,
    // Kintara Archetype System
    archetype: null,           // 'agrarian' | 'industrialist' | 'speculator' | null
    archetypeLocked: false,
    groveDensity: 0,           // Agrarian: over-saturation counter
    // Cartel Speculator
    futures: [],               // Array of { lockedPrice, expiresAt, amount }
    marketPool: 2.50,          // Simulated global pool price
    marketVolume: 0,           // Total oil sold this cycle (affects pool)
    // Mill thermal
    millPressCooldown: 0,      // Timestamp: prevents instant spam spam
    blightActive: false,        // Agrarian risk flag
    _hasWalletSynced: false,    // Internal: tracks one-time wallet SOL sync on connect
};

const rarityIcons = {
    common: { icon: '🌳', bonus: 1.0, name: 'Common' },
    rare: { icon: '💎', bonus: 2.0, name: 'Rare' },
    legendary: { icon: '👑', bonus: 5.0, name: 'Legendary' }
};

// ============================================================
// OLV TOKEN FUNCTIONS
// ============================================================

// ============================================================
// BALANCE FETCHING — with full fallback chain
// ============================================================

// Attempt to read SOL balance from the connected Phantom provider directly
// (avoids needing the connection import to work)
async function fetchSolBalanceViaProvider(walletAddress) {
    try {
        // Method 1: use imported connection if available
        if (connection && walletAddress && !walletAddress.startsWith('email_')) {
            const lamports = await Promise.race([
                connection.getBalance(new PublicKey(walletAddress)),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
            ]);
            return lamports / 1_000_000_000;
        }
    } catch (e) {
        console.warn('connection.getBalance failed:', e.message);
    }
    try {
        // Method 2: ask the Phantom provider directly via getAccountInfo
        const provider = window.phantom?.solana || window.solana;
        if (provider && provider.publicKey) {
            const rpcUrl = 'https://api.mainnet-beta.solana.com';
            const body = JSON.stringify({
                jsonrpc: '2.0', id: 1, method: 'getBalance',
                params: [provider.publicKey.toBase58(), { commitment: 'confirmed' }]
            });
            const resp = await fetch(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
                signal: AbortSignal.timeout(6000)
            });
            const data = await resp.json();
            if (data.result?.value !== undefined) {
                return data.result.value / 1_000_000_000;
            }
        }
    } catch (e) {
        console.warn('RPC fallback failed:', e.message);
    }
    return null; // null = "could not determine"
}

async function fetchRealOlvBalance(walletAddress) {
    if (!walletAddress || walletAddress.startsWith('email_')) return 0;
    try {
        if (connection) {
            const walletPubKey = new PublicKey(walletAddress);
            const olvMint     = new PublicKey(OLV_MINT_ADDRESS);
            const tokenAccount = await getAssociatedTokenAddress(olvMint, walletPubKey);
            const accountInfo  = await connection.getAccountInfo(tokenAccount);
            if (!accountInfo) return 0;
            const balance = await connection.getTokenAccountBalance(tokenAccount);
            return balance.value.uiAmount || 0;
        }
    } catch (err) {
        console.warn('OLV balance fetch error:', err.message);
    }
    // Fallback: direct RPC call for token accounts
    try {
        const rpcUrl = 'https://api.mainnet-beta.solana.com';
        const body = JSON.stringify({
            jsonrpc: '2.0', id: 1,
            method: 'getTokenAccountsByOwner',
            params: [
                walletAddress,
                { mint: OLV_MINT_ADDRESS.toBase58?.() || OLV_MINT_ADDRESS.toString() },
                { encoding: 'jsonParsed', commitment: 'confirmed' }
            ]
        });
        const resp = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            signal: AbortSignal.timeout(6000)
        });
        const data = await resp.json();
        const accounts = data.result?.value || [];
        if (accounts.length > 0) {
            return accounts[0].account.data.parsed.info.tokenAmount.uiAmount || 0;
        }
    } catch (e) {
        console.warn('OLV RPC fallback failed:', e.message);
    }
    return 0;
}

async function getTreasurySolBalance() {
    try {
        const activeProgram = window._program;
        if (!activeProgram || !connection) return 0;
        const [treasuryPDA] = PublicKey.findProgramAddressSync(
            [Buffer.from('treasury')],
            activeProgram.programId
        );
        const treasuryBal = await connection.getBalance(treasuryPDA);
        return treasuryBal / 1_000_000_000;
    } catch (err) {
        return 0;
    }
}

async function fetchWalletBalances(walletAddress) {
    if (!walletAddress) return { sol: 0, olv: 0, treasury: 0 };
    const isEmailUser = walletAddress.startsWith('email_');

    const [solResult, olvResult, treasuryResult] = await Promise.allSettled([
        isEmailUser ? Promise.resolve(null) : fetchSolBalanceViaProvider(walletAddress),
        isEmailUser ? Promise.resolve(0)    : fetchRealOlvBalance(walletAddress),
        getTreasurySolBalance()
    ]);

    const sol      = solResult.status === 'fulfilled'     ? (solResult.value ?? 0)      : 0;
    const olv      = olvResult.status === 'fulfilled'     ? (olvResult.value ?? 0)       : 0;
    const treasury = treasuryResult.status === 'fulfilled' ? (treasuryResult.value ?? 0)  : 0;

    console.log(`💰 Wallet balances — SOL: ${sol}, OLV: ${olv}`);
    return { sol, olv, treasury };
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


// ============================================================
// RESET FUNCTION
// ============================================================

async function resetGame() {
    // Show confirmation dialog with options
    const confirmed = confirm(
        "⚠️ WARNING: This will reset your entire estate!\n\n" +
        "All trees, oil, hopper contents, and progress will be lost.\n\n" +
        "Select payment method:\n" +
        "• Click OK to pay 3 SOL\n" +
        "• Cancel then click again to pay 300 OLV\n\n" +
        "Your Ancient Seeds and skills will be preserved."
    );
    
    if (!confirmed) {
        // Check for OLV payment option if they cancelled
        const olvConfirm = confirm(
            "Reset with 300 OLV instead?\n\n" +
            "This will deduct 300 OLV from your wallet and reset your estate."
        );
        
        if (!olvConfirm) {
            showToast("Reset cancelled.");
            return false;
        }
        
        // OLV payment
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
    
    // SOL payment
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
    // Save current seeds and skills before reset
    const preservedSeeds = state.seeds;
    const preservedSkills = [...state.skills];
    const preservedSkillMultipliers = { ...state.skillMultipliers };
    const preservedUpgrades = { ...state.upgrades };
    
    // Reset all game state
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
    
    // Restore preserved items
    state.seeds = preservedSeeds;
    state.skills = preservedSkills;
    state.skillMultipliers = preservedSkillMultipliers;
    state.upgrades = preservedUpgrades;
    
    // Plant starting trees
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

let _balancesLoading = false;

function _setBalanceLoadingUI(isLoading) {
    const walletSolEl = document.getElementById('wallet-sol-balance');
    const walletOlvEl = document.getElementById('wallet-olv-balance');
    const refreshBtn  = document.getElementById('refreshBalanceBtn');
    if (isLoading) {
        if (walletSolEl) walletSolEl.innerText = '···';
        if (walletOlvEl) walletOlvEl.innerText = '···';
        if (refreshBtn) { refreshBtn.innerText = '⟳ Loading...'; refreshBtn.style.opacity = '0.5'; refreshBtn.disabled = true; }
    } else {
        if (refreshBtn) { refreshBtn.innerText = '⟳ Refresh'; refreshBtn.style.opacity = '1'; refreshBtn.disabled = false; }
    }
}

async function updateWalletBalancesUI() {
    if (!currentUser || !currentUser.wallet) {
        console.warn('updateWalletBalancesUI: no currentUser, skipping');
        return false;
    }

    if (_balancesLoading) return false; // avoid overlapping calls
    _balancesLoading = true;
    _setBalanceLoadingUI(true);

    const isEmailUser = currentUser.wallet.startsWith('email_');

    try {
        const balances = await fetchWalletBalances(currentUser.wallet);
        walletSolBalance = balances.sol;
        walletOlvBalance = balances.olv;
        treasurySolBalance = balances.treasury;

        const walletSolEl = document.getElementById('wallet-sol-balance');
        const walletOlvEl = document.getElementById('wallet-olv-balance');
        const uiOlvEl = document.getElementById('ui-olv');

        if (walletSolEl) walletSolEl.innerText = isEmailUser ? 'N/A' : walletSolBalance.toFixed(4);
        if (walletOlvEl) walletOlvEl.innerText = isEmailUser ? 'N/A' : Math.floor(walletOlvBalance);
        if (uiOlvEl) uiOlvEl.innerText = isEmailUser ? '0' : Math.floor(walletOlvBalance);

        // First-time wallet sync: only pull in on-chain SOL once, when the in-game
        // balance is still at its untouched starting value AND we got a real number back.
        const uiSolEl = document.getElementById('ui-sol');
        if (uiSolEl && !isEmailUser && walletSolBalance > 0 && !state._hasWalletSynced) {
            state.sol = walletSolBalance;
            state._hasWalletSynced = true;
            uiSolEl.innerText = state.sol.toFixed(4);
        }

        const estateValue = state.oil * state.world.price + state.hopper * 0.5;
        const estateValueEl = document.getElementById('estate-value');
        if (estateValueEl) estateValueEl.innerText = `Estate Value: ${estateValue.toFixed(2)} SOL`;

        if (isEmailUser) {
            log('ℹ️ Email accounts don\'t have on-chain balances. Connect a wallet for SOL/OLV.');
        }

        render();
        return true;

    } catch (err) {
        console.error('updateWalletBalancesUI failed:', err);
        const walletSolEl = document.getElementById('wallet-sol-balance');
        const walletOlvEl = document.getElementById('wallet-olv-balance');
        if (walletSolEl) walletSolEl.innerText = 'Error';
        if (walletOlvEl) walletOlvEl.innerText = 'Error';
        return false;
    } finally {
        _balancesLoading = false;
        _setBalanceLoadingUI(false);
    }
}

async function refreshBalances() {
    if (!currentUser) { showToast('Connect wallet first!', true); return; }
    showToast('Refreshing balances...');
    const ok = await updateWalletBalancesUI();
    if (ok) {
        showToast('✅ Balances updated!');
        if (currentUser) await saveGameToCloud();
    } else {
        showToast('⚠️ Could not refresh balances — try again', true);
    }
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
        showToast('✅ Wallet connected!');

        // Don't block estate loading on balance fetch — run them in parallel.
        // If the RPC hangs, the grove still renders immediately.
        const balancePromise = updateWalletBalancesUI().catch(err => {
            console.error('Balance fetch failed on connect:', err);
            showToast('⚠️ Could not load wallet balances — tap Refresh to retry', true);
            return false;
        });

        const loaded = await loadGameFromCloud();
        
        if (!loaded) {
            log("🌿 No existing save found. Starting a new estate!");
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
            render();
            await saveGameToCloud();
        }

        render();

        // Let the balance fetch resolve in the background; render again once it does
        balancePromise.then(() => render());

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

    // Email users have no on-chain balance — show N/A immediately rather than spinning forever
    const walletSolEl = document.getElementById('wallet-sol-balance');
    const walletOlvEl = document.getElementById('wallet-olv-balance');
    if (walletSolEl) walletSolEl.innerText = 'N/A';
    if (walletOlvEl) walletOlvEl.innerText = 'N/A';
    log('ℹ️ Email accounts play with in-game SOL only. Connect a wallet for on-chain OLV.');

    const loaded = await loadGameFromCloud();
    
    if (!loaded) {
        log("🌿 No existing save found. Starting a new estate!");
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
        render();
        await saveGameToCloud();
    }
    
    render();
}

// ============================================================
// GAME ACTIONS
// ============================================================

// OLV cost for planting trees (cheaper than SOL equivalent)
const TREE_OLV_COST = 100;
const TREE_SOL_COST = 5;

// Which currency the plant button uses — toggled by the PLANT button's own sub-toggle
let _treeCurrency = 'sol';

function setTreeCurrency(currency) {
    _treeCurrency = currency;
    const plantCost  = document.getElementById('plant-btn-cost');
    const plantLabel = document.getElementById('plant-btn-label');
    const solBtn = document.getElementById('plant-sol-btn');
    const olvBtn = document.getElementById('plant-olv-btn');

    if (plantCost) plantCost.innerText = currency === 'olv' ? `${TREE_OLV_COST} OLV` : `${TREE_SOL_COST} SOL`;
    if (plantLabel) plantLabel.style.color = currency === 'olv' ? 'var(--purple)' : 'var(--text)';

    if (solBtn) {
        solBtn.style.background = currency === 'sol' ? 'var(--gold-bg)' : 'transparent';
        solBtn.style.color      = currency === 'sol' ? 'var(--gold)'    : 'var(--text-faint)';
    }
    if (olvBtn) {
        olvBtn.style.background = currency === 'olv' ? 'rgba(176,107,240,0.12)' : 'transparent';
        olvBtn.style.color      = currency === 'olv' ? 'var(--purple)'          : 'var(--text-faint)';
    }

    // Also update the main plant btn border colour
    const plantBtn = document.getElementById('plant-btn');
    if (plantBtn) {
        plantBtn.style.borderColor = currency === 'olv' ? 'var(--purple)' : 'var(--border-mid)';
    }
}

function buyTree() {
    const rarity = getRarity();

    if (_treeCurrency === 'olv') {
        if (!currentUser) { showToast("Connect wallet to pay with OLV", true); return; }
        if (walletOlvBalance < TREE_OLV_COST) { showToast(`Need ${TREE_OLV_COST} OLV to plant!`, true); return; }
        walletOlvBalance -= TREE_OLV_COST;
        log(`🌱 Planted ${rarityIcons[rarity]?.name || rarity} tree (${TREE_OLV_COST} OLV)`);
    } else {
        if (state.sol < TREE_SOL_COST) { showToast(`Need ${TREE_SOL_COST} SOL!`, true); return; }
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
    if (state.mill.gunk >= 100) { showToast("💥 Mill clogged! Clean it first!", true); return; }

    // Industrialist: thermal threshold risk system
    const isIndustrialist = state.archetype === 'industrialist';
    const heatGain = isIndustrialist ? 8 : 5;          // Industrialist presses harder
    const gunkGain = 2.0 + (state.mill.mash * 0.05);  // Gunk builds faster at high mash

    state.mill.mash = Math.min(100, state.mill.mash + (isIndustrialist ? 12 : 10));
    state.mill.heat = Math.min(100, (state.mill.heat || 0) + heatGain);
    state.mill.gunk = Math.min(100, state.mill.gunk + gunkGain);
    state.hopper = Math.max(0, state.hopper - 1.5);

    // Warning threshold
    if (state.mill.gunk >= 85 && state.mill.gunk < 100) {
        showToast("⚠️ Mill pressure critical! Risk of failure!", true);
        log("⚠️ WARNING: Mill pressure critical! High risk of mechanical failure.");
    }

    // EXPLOSION / mechanical failure
    if (state.mill.gunk >= 100) {
        const hopperLoss = Math.min(state.hopper + 50, state.hopper + state.mill.mash * 0.5);
        state.hopper = Math.max(0, state.hopper - hopperLoss);
        state.mill.mash = 0;
        state.mill.heat = 0;
        state.mill.gunk = 80; // Partially clogged after explosion
        showToast("💥 THE MILL BLEW UP! Lost hopper inventory!", true);
        log("💥 Critical Failure: Mill overheated and ruptured. Hopper contents lost.");
        render();
        if (currentUser) saveGameToCloud();
        return;
    }

    // Standard processing: full batch when mash reaches 100
    if (state.mill.mash >= 100) {
        const isNight = state.world.time > 20 || state.world.time < 6;
        const coldBonus = (isNight && state.skillMultipliers.extraction > 1) ? 1.5 : 1.0;
        // Industrialist gets +30% extraction when heat < 60 (precision zone)
        const industrialistBonus = (isIndustrialist && state.mill.heat < 60) ? 1.3 : 1.0;
        const purityPenalty = (100 - state.mill.gunk) / 100;
        const oilYield = (state.hopper + 15) * 0.22 * purityPenalty * coldBonus * state.skillMultipliers.extraction * industrialistBonus;
        state.oil += oilYield;
        state.hopper = 0;
        state.mill.mash = 0;
        state.mill.heat = Math.max(0, state.mill.heat - 20); // Cool down slightly after batch
        log(`🏺 Pressed ${oilYield.toFixed(2)}L EVOO (${(purityPenalty * 100).toFixed(0)}% purity)`);
        showToast(`+${oilYield.toFixed(1)}L Oil`);
    }
    render();
    if (currentUser) saveGameToCloud();
}

// ============================================================
// KINTARA ARCHETYPE SYSTEM
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
    if (state.archetypeLocked) { showToast("Archetype locked until prestige!", true); return; }
    if (!ARCHETYPES[type]) return;
    state.archetype = type;
    state.archetypeLocked = true;
    const a = ARCHETYPES[type];
    log(`🏛️ Locked in as ${a.name}! ${a.desc}`);
    showToast(`${a.icon} ${a.name} locked!`);
    // Apply archetype-specific state changes
    if (type === 'agrarian') {
        state.skillMultipliers.yield *= 1.3; // combo boost
    }
    if (type === 'industrialist') {
        state.mill.gunkDecayRate = 2; // faster gunk decay
    }
    if (type === 'speculator') {
        // 20% sell bonus applied at sellOil time
    }
    render();
    if (currentUser) saveGameToCloud();
}

// Futures contracts (Cartel Speculator)
function buyFuture(amountOil) {
    if (state.archetype !== 'speculator') { showToast("Only Speculators can trade futures!", true); return; }
    if (!currentUser) { showToast("Connect wallet to trade!", true); return; }
    const olvCost = Math.ceil(amountOil * 5); // 5 OLV per unit locked
    if (walletOlvBalance < olvCost) { showToast(`Need ${olvCost} OLV!`, true); return; }
    // Lock current market price for 3 weather cycles (~60s)
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
    if (!future || Date.now() >= future.expiresAt) { showToast("Contract expired!", true); return; }
    const sellAmt = Math.min(state.oil, future.amount);
    if (sellAmt <= 0) { showToast("No oil to sell!", true); return; }
    const revenue = sellAmt * future.lockedPrice * 1.2; // Speculator +20% bonus
    state.sol += revenue;
    state.lifetimeSol += revenue;
    state.oil -= sellAmt;
    state.futures.splice(futureIdx, 1);
    // Market impact: selling large amounts drops pool price
    applyMarketImpact(sellAmt);
    showToast(`📜 Future settled! +${revenue.toFixed(2)} SOL @ ${future.lockedPrice.toFixed(2)}`);
    log(`📜 Future settled: ${sellAmt.toFixed(1)}L → +${revenue.toFixed(2)} SOL`);
    render();
    if (currentUser) saveGameToCloud();
}

function applyMarketImpact(volumeSold) {
    // Each unit sold depresses the simulated pool price slightly
    const impact = volumeSold * 0.004;
    state.marketPool = Math.max(0.5, state.marketPool - impact);
    state.world.price = Math.max(0.5, Math.min(state.world.price, state.marketPool));
    state.marketVolume += volumeSold;
    if (volumeSold > 20) {
        log(`📉 Market depressed by large sale: ${volumeSold.toFixed(1)}L sold`);
    }
}

function openArchetypePanel() {
    const overlay = document.createElement('div');
    overlay.id = 'archetype-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px;';
    const locked = state.archetypeLocked;
    overlay.innerHTML = `
        <div style="background:#1a110a;border:1px solid #c9903e;border-radius:16px;padding:20px;max-width:360px;width:100%;">
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

function openFuturesPanel() {
    if (state.archetype !== 'speculator') { showToast("Speculator path only!", true); return; }
    settleFutures();
    const overlay = document.createElement('div');
    overlay.id = 'futures-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px;';
    const futureOptions = [10, 25, 50];
    overlay.innerHTML = `
        <div style="background:#1a110a;border:1px solid #a855f7;border-radius:16px;padding:20px;max-width:360px;width:100%;">
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

function cleanMill() {
    if (state.sol < 0.2) { showToast("Need 0.2 SOL", true); return; }
    state.sol -= 0.2;
    state.mill.gunk = 0;
    showToast("Mill cleaned!");
    log("🧼 Mill cleaned");
    render();
    if (currentUser) saveGameToCloud();
}



// ============================================================
// OLV UPGRADE SYSTEM
// ============================================================

// OLV costs for premium upgrades
const OLV_UPGRADES = {
    greenhouse: { name: 'Greenhouse Dome',   cost: 500,  desc: 'Nullifies weather damage' },
    coldpress:  { name: 'Cold Press Chamber',cost: 800,  desc: '+50% oil extraction, max purity' },
    guardian:   { name: 'Grove Guardian',    cost: 1200, desc: 'All trees permanently protected' },
    oracle:     { name: 'Market Oracle',     cost: 600,  desc: 'Highlights sell windows' },
};

// SOL costs for upgrades (used when switching currency)
const SOL_UPGRADE_COSTS = { irrigation: 15, misting: 10, fertilizer: 8, flyTraps: 0.003 };

// OLV equivalents for standard upgrades (50% discount vs SOL value)
const SOL_UPGRADES_OLV_COST = { irrigation: 300, misting: 200, fertilizer: 160, flyTraps: 50 };

let _upgradeCurrency = 'sol';

function setUpgradeCurrency(currency) {
    _upgradeCurrency = currency;
    const solBtn = document.getElementById('upg-currency-sol');
    const olvBtn = document.getElementById('upg-currency-olv');
    const olvRow = document.getElementById('upg-olv-balance-row');
    if (solBtn) {
        solBtn.style.borderColor = currency === 'sol' ? 'var(--gold)' : 'var(--border-mid)';
        solBtn.style.color       = currency === 'sol' ? 'var(--gold)' : 'var(--text-dim)';
        solBtn.style.background  = currency === 'sol' ? 'var(--gold-bg)' : 'transparent';
    }
    if (olvBtn) {
        olvBtn.style.borderColor = currency === 'olv' ? 'var(--purple)' : 'var(--border-mid)';
        olvBtn.style.color       = currency === 'olv' ? 'var(--purple)' : 'var(--text-dim)';
        olvBtn.style.background  = currency === 'olv' ? 'rgba(176,107,240,0.1)' : 'transparent';
    }
    if (olvRow) olvRow.style.display = currency === 'olv' ? 'block' : 'none';

    // Refresh cost labels on SOL upgrades
    const costMap = currency === 'sol' ? SOL_UPGRADE_COSTS : SOL_UPGRADES_OLV_COST;
    const unit    = currency === 'sol' ? 'SOL' : 'OLV';
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
        // Deduct from in-memory OLV balance (real on-chain tx would go here)
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
    if (currentUser) saveGameToCloud();
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
    if (currentUser) saveGameToCloud();
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
    if (currentUser) saveGameToCloud();
}

function _applyUpgradeEffect(type) {
    if (type === 'guardian') {
        state.trees.forEach(t => { t.protected = true; });
    }
    if (type === 'coldpress') {
        state.skillMultipliers.extraction = Math.max(state.skillMultipliers.extraction, 1.5);
    }
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
    const speculatorBonus = state.archetype === 'speculator' ? 1.2 : 1.0;
    let revenue = state.oil * state.world.price * speculatorBonus;
    applyMarketImpact(state.oil); // large sales depress pool price
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
    dryTrees.forEach(tree => { tree.water = Math.min(100, tree.water + 30); });
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
        // Plant 3 starter trees for free (prestige bonus)
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

    // Settle expired futures
    settleFutures();

    // Market pool slowly recovers
    state.marketPool = Math.min(6.0, state.marketPool + 0.01);

    // Agrarian: track grove density (over-saturation)
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
        
        // Growth: slower when over-saturated, but combo multiplier compensates at harvest
        let growthRate = 0.05 * state.skillMultipliers.speed;
        if (state.fertilizerBoost) growthRate *= 1.5;
        if (isOverSaturated) growthRate *= 0.7; // density penalty
        if (tree.water > 40 && tree.health > 30) tree.age += growthRate;
        
        if (tree.age > 5 && tree.stage === 'seed') tree.stage = 'sapling';
        if (tree.age > 12 && tree.stage === 'sapling') tree.stage = 'mature';
        
        // Pest spread — Agrarian blight: contagious between neighbors
        if (!tree.protected && state.world.season === 'Summer' && Math.random() < 0.03) {
            tree.pests = Math.min(100, tree.pests + 5);
        }

        // Blight spread: if heavily infested and unprotected
        if (tree.pests > 50 && !tree.protected) {
            const blightSpreadChance = isOverSaturated ? 0.18 : 0.08; // Agrarian: 2x spread chance
            const neighbors = [idx - 1, idx + 1, idx - 3, idx + 3];
            neighbors.forEach(nIdx => {
                if (state.trees[nIdx] && state.trees[nIdx].health > 0 && Math.random() < blightSpreadChance) {
                    state.trees[nIdx].pests = Math.min(100, state.trees[nIdx].pests + 2);
                    if (Math.random() < 0.3) { // only log occasionally
                        log(`⚠️ Blight spreading from ${tree.id} to ${state.trees[nIdx].id}!`);
                    }
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

    // Blight resets when all pests cleared
    if (state.blightActive && state.trees.every(t => t.pests < 50)) {
        state.blightActive = false;
    }

    // Mill: mash decay + heat/gunk cooling over time
    state.mill.mash = Math.max(0, state.mill.mash - 4);
    state.mill.heat = Math.max(0, (state.mill.heat || 0) - (state.archetype === 'industrialist' ? 4 : 2));
    state.mill.gunk = Math.max(0, state.mill.gunk - (state.archetype === 'industrialist' ? 0.4 : 0.2));

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
    // Market recovers toward marketPool baseline
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
// CLOUD SAVE FUNCTIONS
// ============================================================

// Columns added in the Kintara update. If the DB migration has not run yet,
// saveGameToCloud falls back to the legacy schema automatically so saves never break.
const EXTENDED_SAVE_COLUMNS = ['archetype', 'futures', 'market_pool'];

async function saveGameToCloud() {
    if (!currentUser || !sb) {
        console.log("Cannot save: no user or supabase client");
        return false;
    }

    const baseSave = {
        wallet:           currentUser.wallet,
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
        updated_at:       new Date().toISOString()
    };

    const extendedSave = {
        ...baseSave,
        archetype:   state.archetype,
        futures:     JSON.stringify(state.futures),
        market_pool: state.marketPool
    };

    const tryUpsert = async (payload) => {
        const { error } = await sb
            .from('game_saves')
            .upsert(payload, { onConflict: 'wallet' });
        return error;
    };

    try {
        let error = await tryUpsert(extendedSave);

        if (error) {
            if (error.code === 'PGRST204') {
                console.warn("New columns missing — run migration_game_saves.sql in Supabase, falling back to base schema.");
                error = await tryUpsert(baseSave);
            }
            if (error) {
                console.error("Save error:", error);
                return false;
            }
        }

        console.log("Game saved!");
        return true;

    } catch (err) {
        console.error("Cloud save exception:", err);
        return false;
    }
}

async function loadGameFromCloud() {
    if (!currentUser || !sb) {
        console.log("❌ Cannot load: no user or supabase client");
        return false;
    }
    
    console.log("📥 Loading game for:", currentUser.wallet);
    
    try {
        const { data, error } = await sb
            .from('game_saves')
            .select('*')
            .eq('wallet', currentUser.wallet)
            .maybeSingle();
        
        if (error) {
            console.error("❌ Load error:", error);
            return false;
        }
        
        if (!data) {
            console.log("📭 No saved game found");
            return false;
        }
        
        console.log("✅ Found saved game!");
        
        // Restore state
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
        state.upgrades = data.upgrades ? {
            irrigation: false, misting: false, fertilizer: false, flyTraps: false,
            greenhouse: false, coldpress: false, guardian: false, oracle: false,
            ...JSON.parse(data.upgrades)
        } : { irrigation: false, misting: false, fertilizer: false, flyTraps: false,
              greenhouse: false, coldpress: false, guardian: false, oracle: false };
        state.skills = data.skills || [];
        state.skillMultipliers = data.skillMultipliers ? JSON.parse(data.skillMultipliers) : { yield: 1.0, speed: 1.0, extraction: 1.0, rare: 0.1 };
        state.mill = data.mill ? JSON.parse(data.mill) : { mash: 0, gunk: 0 };
        state.quest = data.quest ? JSON.parse(data.quest) : { target: 50, current: 0, reward: 10, seedReward: 1 };
        state.achievements = data.achievements ? JSON.parse(data.achievements) : { firstHarvest: false, groveMaster: false, tycoon: false, comboKing: false, rareCollector: false };
        state.archetype = data.archetype || null;
        state.archetypeLocked = !!data.archetype;
        state.futures = data.futures ? JSON.parse(data.futures) : [];
        state.marketPool = data.market_pool ?? 2.50;
        if (!state.mill.heat) state.mill.heat = 0;

        // A loaded cloud save already has the player's real SOL —
        // never let updateWalletBalancesUI overwrite it with on-chain SOL.
        state._hasWalletSynced = true;

        // Apply skill multipliers
        if (state.skills.includes('yield')) state.skillMultipliers.yield = 1.8;
        if (state.skills.includes('speed')) state.skillMultipliers.speed = 2.5;
        if (state.skills.includes('cold')) state.skillMultipliers.extraction = 1.6;
        if (state.skills.includes('rare')) state.skillMultipliers.rare = 0.25;
        
        log("🌿 Game loaded from cloud! Welcome back, Steward.");
        render();
        return true;
        
    } catch (err) {
        console.error("❌ Load exception:", err);
        return false;
    }
}

// ============================================================
// RENDER FUNCTION
// ============================================================


// ============================================================
// RENDER
// ============================================================

const WEATHER_SPR = { Clear: 'spr-clear', Rainy: 'spr-rainy', Heatwave: 'spr-heatwave' };
const SEASON_SPR  = { Spring: 'spr-spring', Summer: 'spr-summer', Autumn: 'spr-autumn', Winter: 'spr-winter' };

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
    // Shift history left, append new price bar
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

    // Core currency chips
    document.getElementById('ui-sol').innerText  = state.sol.toFixed(4);
    document.getElementById('ui-oil').innerText  = state.oil.toFixed(1);
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

    // Combo display
    const comboEl = document.getElementById('combo-display');
    if (comboEl) {
        comboEl.innerText = `${state.combo.toFixed(1)}x`;
        comboEl.className = state.combo > 1.5 ? 'stat-value combo-active' : 'stat-value';
    }

    // Season sprite + label
    const season = state.world.season;
    const seasonSpr = document.getElementById('season-spr');
    if (seasonSpr) { seasonSpr.className = `spr ${SEASON_SPR[season] || 'spr-spring'}`; seasonSpr.style.cssText = 'width:18px;height:18px;'; }
    const seasonEl = document.getElementById('ui-season');
    if (seasonEl) seasonEl.innerText = season;

    // Weather widget sprite + labels
    const weatherSprEl = document.getElementById('weather-icon-spr');
    if (weatherSprEl) { weatherSprEl.className = `spr ${WEATHER_SPR[state.world.weather] || 'spr-clear'} weather-icon`; }
    const weatherEl = document.getElementById('ui-weather');
    if (weatherEl) weatherEl.innerText = state.world.weather;
    const tempEl = document.getElementById('ui-temp');
    if (tempEl) tempEl.innerText = state.world.temp + '°C';
    const timeEl = document.getElementById('ui-time');
    if (timeEl) timeEl.innerText = String(state.world.time).padStart(2,'0') + ':00';
    const demandEl = document.getElementById('ui-demand');
    if (demandEl) demandEl.innerText = state.world.demand;

    // Market price + sparkline
    const priceEl = document.getElementById('ui-price');
    if (priceEl) priceEl.innerText = state.world.price.toFixed(2);
    updateSparkline(state.world.price);

    // Market Oracle highlight
    if (state.upgrades.oracle) {
        const isGoodTime = state.world.price > state.marketPool * 0.95;
        if (priceEl) priceEl.style.color = isGoodTime ? 'var(--green)' : 'var(--gold-bright)';
        const sellBtn = document.getElementById('sell-btn');
        if (sellBtn && isGoodTime) {
            sellBtn.style.boxShadow = '0 0 16px rgba(92,204,126,0.5)';
            sellBtn.title = '🔮 Oracle: Good time to sell!';
        } else if (sellBtn) {
            sellBtn.style.boxShadow = '';
            sellBtn.title = '';
        }
    }

    // Estate sync bar
    const estateValue = state.oil * state.world.price + state.hopper * 0.5;
    const syncBar = document.getElementById('estate-sync-bar');
    if (syncBar) syncBar.style.width = Math.min(100, (estateValue / Math.max(1, state.sol + estateValue)) * 100) + '%';
    const estateEl = document.getElementById('estate-value');
    if (estateEl) estateEl.innerText = `Estate Value: ${estateValue.toFixed(2)} SOL`;

    // Hopper
    const hopperEl = document.getElementById('ui-hopper');
    if (hopperEl) hopperEl.innerText = state.hopper.toFixed(1);

    // Mill gauge rings
    const mash = state.mill.mash || 0;
    const heat = state.mill.heat || 0;
    const gunk = state.mill.gunk || 0;
    const mashColor = '#c5a059';
    const heatColor = heat > 75 ? '#ef4444' : heat > 50 ? '#f97316' : '#facc15';
    const gunkColor = gunk > 85 ? '#ef4444' : gunk > 60 ? '#f97316' : '#a855f7';
    setGaugeRing('gauge-mash-ring', mash, mashColor);
    setGaugeRing('gauge-heat-ring', heat, heatColor);
    setGaugeRing('gauge-gunk-ring', gunk, gunkColor);
    const mashPct = document.getElementById('mash-pct'); if (mashPct) mashPct.innerText = Math.floor(mash) + '%';
    const heatPct = document.getElementById('heat-pct'); if (heatPct) { heatPct.innerText = Math.floor(heat) + '%'; heatPct.style.color = heat > 75 ? '#ef4444' : ''; }
    const gunkPct = document.getElementById('gunk-pct'); if (gunkPct) { gunkPct.innerText = Math.floor(gunk) + '%'; gunkPct.style.color = gunk > 85 ? '#ef4444' : ''; }
    const mashBar = document.getElementById('mash-bar'); if (mashBar) mashBar.style.width = mash + '%';
    const heatBar = document.getElementById('heat-bar'); if (heatBar) { heatBar.style.width = heat + '%'; heatBar.style.background = `linear-gradient(90deg,${heatColor}88,${heatColor})`; }
    const gunkBar = document.getElementById('gunk-bar'); if (gunkBar) { gunkBar.style.width = gunk + '%'; gunkBar.style.background = `linear-gradient(90deg,${gunkColor}88,${gunkColor})`; }

    // Quest
    const questProg = document.getElementById('quest-progress');
    if (questProg) questProg.style.width = Math.min(100, (state.quest.current / state.quest.target) * 100) + '%';
    const qCur = document.getElementById('quest-current'); if (qCur) qCur.innerText = state.quest.current.toFixed(0);
    const qTgt = document.getElementById('quest-target'); if (qTgt) qTgt.innerText = state.quest.target;
    const qSeedR = document.getElementById('quest-reward-seed'); if (qSeedR) qSeedR.innerText = `+${state.quest.seedReward || 1} 🌱`;
    const qSolR  = document.getElementById('quest-reward-sol');  if (qSolR)  qSolR.innerText  = `+${state.quest.reward} SOL`;
    const seedsEl = document.getElementById('seeds-display'); if (seedsEl) seedsEl.innerText = state.seeds;

    // Active boosts
    const boostsEl = document.getElementById('active-boosts');
    if (boostsEl) {
        let html = '';
        if (state.fertilizerBoost) { const rem = Math.max(0,Math.ceil((state.fertilizerBoostEnd - Date.now())/60000)); html += `<span style="font-size:9px;background:rgba(92,204,126,0.1);border:1px solid var(--green);border-radius:6px;padding:3px 8px;color:var(--green);">🌿 Fertilizer ${rem}m</span>`; }
        if (state.protectionActive) { const rem = Math.max(0,Math.ceil((state.protectionEnd - Date.now())/3600000)); html += `<span style="font-size:9px;background:var(--blue-dim);border:1px solid var(--blue);border-radius:6px;padding:3px 8px;color:var(--blue);">🛡️ Shield ${rem}h</span>`; }
        if (state.upgrades.greenhouse) html += `<span style="font-size:9px;background:rgba(176,107,240,0.1);border:1px solid var(--purple);border-radius:6px;padding:3px 8px;color:var(--purple);">🏡 Greenhouse</span>`;
        if (state.upgrades.oracle)     html += `<span style="font-size:9px;background:rgba(176,107,240,0.1);border:1px solid var(--purple);border-radius:6px;padding:3px 8px;color:var(--purple);">🔮 Oracle</span>`;
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
        if (archName) { archName.innerText = a.name; archName.style.color = 'var(--gold)'; }
        if (archHint) archHint.innerText = '🔒 Locked until prestige';
        if (futuresBtn) futuresBtn.style.display = state.archetype === 'speculator' ? 'inline-block' : 'none';
        if (state.futures.length > 0 && futuresBtn) futuresBtn.innerText = `📜 FUTURES (${state.futures.length})`;
    } else {
        if (archIcon) archIcon.innerText = '🏛️';
        if (archName) { archName.innerText = 'Choose your Path'; archName.style.color = 'var(--text-dim)'; }
        if (archHint) archHint.innerText = 'Agrarian · Industrialist · Speculator';
        if (futuresBtn) futuresBtn.style.display = 'none';
    }

    // Harvest all button
    const harvestAllBtn = document.getElementById('harvest-all-btn');
    const harvestLabel  = document.getElementById('harvest-btn-label');
    const harvestCount  = document.getElementById('harvest-btn-count');
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

    // Blight + density
    const blightBanner = document.getElementById('blight-banner');
    if (blightBanner) blightBanner.style.display = state.blightActive ? 'block' : 'none';
    const densityEl = document.getElementById('grove-density');
    if (densityEl && state.archetype === 'agrarian') {
        const overSat = state.groveDensity > 9;
        densityEl.style.display = 'inline';
        densityEl.innerHTML = overSat ? `🔥 Over-sat (${state.groveDensity})` : `🌿 Density ${state.groveDensity}`;
        densityEl.style.color = overSat ? 'var(--orange)' : 'var(--green)';
    } else if (densityEl) { densityEl.style.display = 'none'; }

    // Upgrade purchased states (SOL upgrades)
    const upgradeDefs = [
        { key: 'irrigation', btnId: 'upg-irrigation-btn', costId: 'upg-irrigation-cost', label: '✅ Installed' },
        { key: 'misting',    btnId: 'upg-misting-btn',    costId: 'upg-misting-cost',    label: '✅ Installed' },
        { key: 'fertilizer', btnId: 'upg-fertilizer-btn', costId: 'upg-fertilizer-cost', label: '✅ Installed' },
        { key: 'flyTraps',   btnId: 'upg-flytraps-btn',   costId: 'upg-flytraps-cost',   label: '✅ Installed' },
        { key: 'greenhouse', btnId: 'upg-greenhouse-btn', costId: 'upg-greenhouse-cost', label: '✅ Active' },
        { key: 'coldpress',  btnId: 'upg-coldpress-btn',  costId: 'upg-coldpress-cost',  label: '✅ Active' },
        { key: 'guardian',   btnId: 'upg-guardian-btn',   costId: 'upg-guardian-cost',   label: '✅ Active' },
        { key: 'oracle',     btnId: 'upg-oracle-btn',     costId: 'upg-oracle-cost',     label: '✅ Active' },
    ];
    upgradeDefs.forEach(({ key, btnId, costId, label }) => {
        const btn  = document.getElementById(btnId);
        const cost = document.getElementById(costId);
        if (state.upgrades[key]) {
            if (btn)  { btn.classList.add('purchased'); }
            if (cost) { cost.textContent = label; cost.style.color = 'var(--green)'; }
        }
    });

    // Skill purchased states
    [
        { skill: 'yield', btn: 'skill-yield-btn', cost: 'skill-yield-cost' },
        { skill: 'speed', btn: 'skill-speed-btn', cost: 'skill-speed-cost' },
        { skill: 'cold',  btn: 'skill-cold-btn',  cost: 'skill-cold-cost'  },
        { skill: 'rare',  btn: 'skill-rare-btn',  cost: 'skill-rare-cost'  },
    ].forEach(({ skill, btn, cost }) => {
        if (state.skills.includes(skill)) {
            const b = document.getElementById(btn);
            const c = document.getElementById(cost);
            if (b) b.classList.add('unlocked');
            if (c) { c.textContent = '✅ Active'; c.style.color = 'var(--green)'; }
        }
    });

    // Stats panel
    const sLife  = document.getElementById('stats-lifetime');      if (sLife)  sLife.innerText  = state.lifetimeSol.toFixed(2);
    const sPlant = document.getElementById('stats-trees-planted'); if (sPlant) sPlant.innerText = state.treesPlanted;
    const sHarv  = document.getElementById('stats-harvests');      if (sHarv)  sHarv.innerText  = state.totalHarvests;
    const sCombo = document.getElementById('stats-combo');         if (sCombo) sCombo.innerText = `×${state.comboRecord.toFixed(1)}`;
    const sRare  = document.getElementById('stats-rare');          if (sRare)  sRare.innerText  = state.rareCount;

    // Achievements
    const achMap = { ach1:'firstHarvest', ach2:'groveMaster', ach3:'tycoon', ach4:'comboKing', ach5:'rareCollector' };
    Object.entries(achMap).forEach(([id, key]) => { const el = document.getElementById(id); if (el) el.innerText = state.achievements[key] ? '✅' : '❌'; });

    // Upgrades status panel card
    const upList = document.getElementById('upg-status-list');
    if (upList) {
        const all = [
            { key:'irrigation', label:'Auto-Irrigation' }, { key:'misting', label:'Misting System' },
            { key:'fertilizer', label:'Fertilizer' }, { key:'flyTraps', label:'Fly Traps' },
            { key:'greenhouse', label:'Greenhouse Dome' }, { key:'coldpress', label:'Cold Press' },
            { key:'guardian', label:'Grove Guardian' }, { key:'oracle', label:'Market Oracle' },
        ];
        upList.innerHTML = all.map(u =>
            `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--border);">
                <span>${u.label}</span>
                <span>${state.upgrades[u.key] ? '<span style="color:var(--green)">✅</span>' : '<span style="color:var(--text-faint)">—</span>'}</span>
            </div>`
        ).join('');
    }

    // ── GROVE GRID ──────────────────────────────────────────
    const container = document.getElementById('grove-container');
    if (!container) return;
    container.innerHTML = '';

    if (state.trees.length === 0) {
        container.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px 0;opacity:0.4;font-size:12px;">Plant your first tree to begin</div>';
        return;
    }

    state.trees.forEach((tree, idx) => {
        const isDead   = tree.health <= 0;
        const isReady  = tree.stage === 'mature' && !isDead;
        const isRare   = tree.rarity === 'rare';
        const isLeg    = tree.rarity === 'legendary';

        // Pick sprite class
        let sprClass = 'spr-seed';
        if (isDead) sprClass = 'spr-dead';
        else if (isLeg)  sprClass = 'spr-legendary';
        else if (isRare) sprClass = 'spr-rare';
        else if (isReady) sprClass = 'spr-ready';
        else if (tree.stage === 'sapling') sprClass = 'spr-sapling';
        else if (tree.stage === 'mature')  sprClass = 'spr-mature';

        // Growth progress (for seed/sapling)
        let growthPct = 0;
        if (tree.stage === 'seed')    growthPct = Math.min(100, (tree.age / 5)  * 100);
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
            ` : ''}
        `;
        container.appendChild(card);
    });
}

// ============================================================
// PANEL NAVIGATION
// ============================================================

function openPanel(panelId) {
    // Close all panels first
    document.querySelectorAll('.panel').forEach(p => {
        p.classList.remove('active');
        p.classList.remove('open');
    });
    const overlay = document.getElementById('panel-overlay');

    // Update nav active state
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
    document.querySelectorAll('.panel').forEach(p => {
        p.classList.remove('active');
        p.classList.remove('open');
    });
    const overlay = document.getElementById('panel-overlay');
    if (overlay) overlay.classList.remove('active');
    // Restore grove tab as active
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.panel === 'grove');
    });
}

// ============================================================
// ADD OLV SHOP PANEL TO UI
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

// ============================================================
// ADD BOOSTS DISPLAY TO STATS ROW
// ============================================================

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
    console.log('🎮 OLIVIUM Estate loading...');
    
    addOlvShopPanel();
    addBoostsDisplay();

    // Re-bind all nav items (including the dynamically added SHOP tab)
    function bindNavItems() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.onclick = () => openPanel(item.dataset.panel);
        });
    }
    bindNavItems();

    // Set up event listeners
    const plantBtn = document.getElementById('plant-btn');
    if (plantBtn) plantBtn.onclick = () => buyTree();
    
    const sprayBtn = document.getElementById('spray-btn');
    if (sprayBtn) sprayBtn.onclick = () => sprayGrove();
    
    const harvestAllBtn = document.getElementById('harvest-all-btn');
    if (harvestAllBtn) harvestAllBtn.onclick = () => harvestAll();
    
    const waterAllBtn = document.getElementById('water-all-btn');
    if (waterAllBtn) waterAllBtn.onclick = () => waterAll();
    
    const sellBtn = document.getElementById('sell-btn');
    if (sellBtn) sellBtn.onclick = () => sellOil();
    
    const sellHalfBtn = document.getElementById('sell-half-btn');
    if (sellHalfBtn) sellHalfBtn.onclick = () => sellHalfOil();
    
    const fabMill = document.getElementById('fab-mill');
    if (fabMill) fabMill.onclick = () => pressMill();
    
    const refreshBtn = document.getElementById('refreshBalanceBtn');
    if (refreshBtn) refreshBtn.onclick = () => refreshBalances();
    
    const connectBtn = document.getElementById('connectBtn');
    if (connectBtn) connectBtn.onclick = showConnectModal;
    
    const connectWalletBtn = document.getElementById('connectWalletBtn');
    if (connectWalletBtn) connectWalletBtn.onclick = connectWallet;
    
    const emailLoginBtn = document.getElementById('emailLoginBtn');
    if (emailLoginBtn) emailLoginBtn.onclick = emailLogin;
    
    const closeModalBtn = document.getElementById('closeConnectModalBtn');
    if (closeModalBtn) closeModalBtn.onclick = hideConnectModal;
    
    const modal = document.getElementById('connectModal');
    if (modal) modal.onclick = (e) => { if (e.target === modal) hideConnectModal(); };
    
    // nav items bound above via bindNavItems()
    
    window.game = { 
        upgrade,
        upgradeFlyTraps,
        upgradeOlv,
        unlockSkill: (s) => { unlockSkill(s); closePanel(); },
        buyWithOlv,
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
        saveGameToCloud,
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
            const navIdentity = document.getElementById('nav-identity-display');
            const navTier = document.getElementById('nav-tier-label');
            const connectBtn = document.getElementById('connectBtn');
            
            if (navIdentity) navIdentity.innerText = currentUser.display;
            if (navTier) navTier.innerText = 'Mignole Steward';
            if (connectBtn) {
                const icon = currentUser.type === 'wallet' ? '◎' : '✉';
                connectBtn.innerText = `${icon} Disconnect`;
                connectBtn.onclick = handleDisconnect;
                connectBtn.style.background = '#3a2a10';
                connectBtn.style.borderColor = '#C5A059';
            }
            
            loadGameFromCloud().then(loaded => {
                if (!loaded && state.trees.length === 0) {
                    for (let i = 0; i < 3; i++) {
                        state.trees.push({
                            id: '#' + (state.treesPlanted + i + 1),
                            age: 0, health: 100, water: 85, pests: 0,
                            stage: 'seed', rarity: 'common',
                            protected: false
                        });
                    }
                    state.treesPlanted += 3;
                    render();
                }
            });
        } catch(e) {
            console.error("Failed to restore user:", e);
        }
    } else {
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
    
    setInterval(gameLoop, 2000);
    setInterval(weatherCycle, 20000);
    setInterval(marketCycle, 15000);
    setInterval(() => { state.world.time = (state.world.time + 1) % 24; render(); }, 30000);
    
    render();
    log("🌿 Tap trees to water/harvest. Press the gold button for the mill!");
    log("🔐 Click 'Connect Profile' to connect your wallet and save progress!");
    log("🛒 Use OLV tokens in the SHOP for boosts and items!");
});

setInterval(() => {
    if (currentUser) saveGameToCloud();
}, 30000);
