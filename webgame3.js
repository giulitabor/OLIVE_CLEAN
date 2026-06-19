// ============================================================
// OLIVIUM GAME - Complete with OLV Token Purchases & Protocol PDA
// ============================================================

import { sb, getIdentity, isConnected, connection } from "./src/connection.ts";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { Transaction, TransactionInstruction } from "@solana/web3.js";
import BN from 'bn.js';
import * as anchor from "@project-serum/anchor";

// OLV Token Mint Address - REPLACE WITH YOUR ACTUAL OLV MINT
const OLV_MINT_ADDRESS = new PublicKey("6C3xwo24Tvkw6fxSK1PNLCcQsWJt7Y9seH95xMtTP8V9");

// Program ID - Will be auto-detected from window._program
let PROGRAM_ID = null;
let protocolPDA = null;
let protocolTokenAccount = null;

let currentUser = null;
let walletSolBalance = 0;
let walletOlvBalance = 0;
let protocolSolBalance = 0;
let protocolOlvBalance = 0;
let balanceCheckInterval = null;

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
    mill: { mash: 0, gunk: 0, heat: 0, failureRisk: 0 },
    combo: 1.0, comboRef: null,
    quest: { target: 50, current: 0, reward: 10, seedReward: 1 },
    achievements: { firstHarvest: false, groveMaster: false, tycoon: false, comboKing: false, rareCollector: false },
    fertilizerBoost: false,
    fertilizerBoostEnd: 0,
    protectionActive: false,
    protectionEnd: 0,
    nextTreeLegendary: false,
    archetype: null,
    archetypeLocked: false,
    groveDensity: 0,
    futures: [],
    marketPool: 2.50,
    marketVolume: 0,
    millPressCooldown: 0,
    blightActive: false,
    useSprites: true,
};

const rarityIcons = {
    common: { icon: '🌳', bonus: 1.0, name: 'Common', sprite: 'common' },
    rare: { icon: '💎', bonus: 2.0, name: 'Rare', sprite: 'rare' },
    legendary: { icon: '👑', bonus: 5.0, name: 'Legendary', sprite: 'legendary' }
};

// ============================================================
// OLV PRICES FOR UPGRADES AND TREES
// ============================================================

const OLV_PRICES = {
    tree: 50,           // 50 OLV per tree
    irrigation: 150,    // 150 OLV
    misting: 100,       // 100 OLV
    fertilizer: 80,     // 80 OLV
    flyTraps: 30,       // 30 OLV
    cleanMill: 20,      // 20 OLV
    resetGame: 300,     // 300 OLV
};

// ============================================================
// SPRITE SYSTEM
// ============================================================

const SPRITES = {
    seed: {
        common: `<svg viewBox="0 0 48 48" width="48" height="48"><circle cx="24" cy="24" r="16" fill="#4a7c3f"/><circle cx="24" cy="18" r="10" fill="#6abf4a"/><ellipse cx="24" cy="30" rx="6" ry="4" fill="#8a6520"/></svg>`,
        rare: `<svg viewBox="0 0 48 48" width="48" height="48"><circle cx="24" cy="24" r="16" fill="#4a7c3f"/><circle cx="24" cy="18" r="10" fill="#6abf4a"/><ellipse cx="24" cy="30" rx="6" ry="4" fill="#8a6520"/><circle cx="24" cy="24" r="6" fill="none" stroke="#c5a059" stroke-width="2" stroke-dasharray="4,4"/></svg>`,
        legendary: `<svg viewBox="0 0 48 48" width="48" height="48"><circle cx="24" cy="24" r="16" fill="#4a7c3f"/><circle cx="24" cy="18" r="10" fill="#6abf4a"/><ellipse cx="24" cy="30" rx="6" ry="4" fill="#8a6520"/><circle cx="24" cy="24" r="8" fill="none" stroke="#ffd700" stroke-width="2"/><circle cx="24" cy="24" r="3" fill="#ffd700"/></svg>`
    },
    sapling: {
        common: `<svg viewBox="0 0 48 48" width="48" height="48"><rect x="22" y="28" width="4" height="12" fill="#6d4c2a"/><circle cx="24" cy="22" r="12" fill="#3a7a2a"/><circle cx="18" cy="20" r="6" fill="#4ade80"/><circle cx="30" cy="20" r="5" fill="#4ade80"/></svg>`,
        rare: `<svg viewBox="0 0 48 48" width="48" height="48"><rect x="22" y="28" width="4" height="12" fill="#6d4c2a"/><circle cx="24" cy="22" r="12" fill="#3a7a2a"/><circle cx="18" cy="20" r="6" fill="#4ade80"/><circle cx="30" cy="20" r="5" fill="#4ade80"/><circle cx="24" cy="22" r="6" fill="none" stroke="#c5a059" stroke-width="1.5" stroke-dasharray="3,3"/></svg>`,
        legendary: `<svg viewBox="0 0 48 48" width="48" height="48"><rect x="22" y="28" width="4" height="12" fill="#6d4c2a"/><circle cx="24" cy="22" r="12" fill="#3a7a2a"/><circle cx="18" cy="20" r="6" fill="#4ade80"/><circle cx="30" cy="20" r="5" fill="#4ade80"/><circle cx="24" cy="22" r="7" fill="none" stroke="#ffd700" stroke-width="2"/><text x="24" y="26" font-size="10" text-anchor="middle" fill="#ffd700">★</text></svg>`
    },
    mature: {
        common: `<svg viewBox="0 0 48 48" width="48" height="48"><rect x="22" y="28" width="4" height="12" fill="#6d4c2a"/><circle cx="24" cy="20" r="14" fill="#2a6a2a"/><circle cx="16" cy="18" r="6" fill="#4ade80"/><circle cx="32" cy="18" r="5" fill="#4ade80"/><circle cx="24" cy="14" r="5" fill="#4ade80"/><ellipse cx="18" cy="28" rx="4" ry="3" fill="#8a6520"/><ellipse cx="30" cy="28" rx="4" ry="3" fill="#8a6520"/></svg>`,
        rare: `<svg viewBox="0 0 48 48" width="48" height="48"><rect x="22" y="28" width="4" height="12" fill="#6d4c2a"/><circle cx="24" cy="20" r="14" fill="#2a6a2a"/><circle cx="16" cy="18" r="6" fill="#4ade80"/><circle cx="32" cy="18" r="5" fill="#4ade80"/><circle cx="24" cy="14" r="5" fill="#4ade80"/><ellipse cx="18" cy="28" rx="4" ry="3" fill="#8a6520"/><ellipse cx="30" cy="28" rx="4" ry="3" fill="#8a6520"/><circle cx="24" cy="22" r="8" fill="none" stroke="#c5a059" stroke-width="2" stroke-dasharray="4,4"/></svg>`,
        legendary: `<svg viewBox="0 0 48 48" width="48" height="48"><rect x="22" y="28" width="4" height="12" fill="#6d4c2a"/><circle cx="24" cy="20" r="14" fill="#2a6a2a"/><circle cx="16" cy="18" r="6" fill="#4ade80"/><circle cx="32" cy="18" r="5" fill="#4ade80"/><circle cx="24" cy="14" r="5" fill="#4ade80"/><ellipse cx="18" cy="28" rx="4" ry="3" fill="#8a6520"/><ellipse cx="30" cy="28" rx="4" ry="3" fill="#8a6520"/><circle cx="24" cy="22" r="10" fill="none" stroke="#ffd700" stroke-width="2"/><text x="24" y="26" font-size="12" text-anchor="middle" fill="#ffd700">★</text></svg>`
    },
    dead: `<svg viewBox="0 0 48 48" width="48" height="48"><rect x="22" y="28" width="4" height="12" fill="#5a4a3a"/><line x1="16" y1="14" x2="32" y2="26" stroke="#5a4a3a" stroke-width="2"/><line x1="32" y1="14" x2="16" y2="26" stroke="#5a4a3a" stroke-width="2"/><circle cx="24" cy="20" r="12" fill="#4a3a2a" opacity="0.3"/></svg>`
};

function getSpriteSVG(stage, rarity) {
    if (stage === 'dead') return SPRITES.dead;
    const stageMap = SPRITES[stage] || SPRITES.seed;
    return stageMap[rarity] || stageMap.common;
}

// ============================================================
// PROTOCOL PDA FUNCTIONS
// ============================================================

/**
 * Find the protocol PDA using the same method as your Anchor program
 * Uses the program from window._program or window.program
 */
function findProtocolPDA() {
    try {
        // Try to get the program from window
        const program = window._program || window.program;
        if (!program) {
            console.warn("No program found in window._program or window.program");
            // Fallback: try to use the PROGRAM_ID constant
            if (PROGRAM_ID) {
                const [pda, bump] = PublicKey.findProgramAddressSync(
                    [Buffer.from("protocol")],
                    PROGRAM_ID
                );
                return { pda, bump, programId: PROGRAM_ID };
            }
            return null;
        }
        
        const [pda, bump] = PublicKey.findProgramAddressSync(
            [Buffer.from("protocol")],
            program.programId
        );
        
        // Store the program ID for later use
        PROGRAM_ID = program.programId;
        
        return { pda, bump, programId: program.programId };
    } catch (err) {
        console.error("Failed to find protocol PDA:", err);
        return null;
    }
}

/**
 * Get the protocol token account (associated token account for OLV)
 */
async function getProtocolTokenAccount(protocolPda, olvMint = OLV_MINT_ADDRESS) {
    try {
        const tokenAccount = await getAssociatedTokenAddress(
            olvMint,
            protocolPda,
            true // allow owner off-curve (PDA)
        );
        return tokenAccount;
    } catch (err) {
        console.error("Failed to get protocol token account:", err);
        return null;
    }
}

/**
 * Check if a token account exists and get its balance
 */
async function getTokenAccountBalance(tokenAccount) {
    try {
        const accountInfo = await connection.getAccountInfo(tokenAccount);
        if (!accountInfo) return { exists: false, balance: 0 };
        
        const balance = await connection.getTokenAccountBalance(tokenAccount);
        return { exists: true, balance: balance.value.uiAmount || 0 };
    } catch (err) {
        console.error("Failed to get token balance:", err);
        return { exists: false, balance: 0 };
    }
}

/**
 * Initialize the protocol PDA and token account
 * Call this once at startup
 */
async function initializeProtocolPDA() {
    const result = findProtocolPDA();
    if (!result) {
        console.error("❌ Failed to find protocol PDA");
        return false;
    }
    
    protocolPDA = result.pda;
    console.log(`🏦 Protocol PDA: ${protocolPDA.toBase58()}`);
    console.log(`🔢 Protocol Bump: ${result.bump}`);
    console.log(`📋 Program ID: ${result.programId.toBase58()}`);
    
    // Get the protocol token account
    protocolTokenAccount = await getProtocolTokenAccount(protocolPDA);
    if (protocolTokenAccount) {
        console.log(`📦 Protocol Token Account: ${protocolTokenAccount.toBase58()}`);
        
        // Check if it exists
        const info = await getTokenAccountBalance(protocolTokenAccount);
        if (info.exists) {
            console.log(`💰 Protocol OLV Balance: ${info.balance}`);
            protocolOlvBalance = info.balance;
        } else {
            console.log(`⚠️ Protocol token account not initialized yet`);
            protocolOlvBalance = 0;
        }
    }
    
    return true;
}

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

async function fetchProtocolOlvBalance() {
    try {
        if (!protocolPDA) {
            await initializeProtocolPDA();
        }
        if (!protocolPDA || !protocolTokenAccount) {
            return 0;
        }
        
        const result = await getTokenAccountBalance(protocolTokenAccount);
        protocolOlvBalance = result.balance;
        
        console.log(`🏦 Protocol OLV: ${protocolOlvBalance}`);
        return result.balance;
        
    } catch (err) {
        console.error("Protocol OLV balance fetch error:", err);
        return 0;
    }
}

async function getProtocolSolBalance() {
    try {
        if (!protocolPDA) {
            await initializeProtocolPDA();
        }
        if (!protocolPDA) return 0;
        
        const solBalance = await connection.getBalance(protocolPDA);
        protocolSolBalance = solBalance / 1_000_000_000;
        return protocolSolBalance;
    } catch (err) {
        console.error("Protocol SOL balance error:", err);
        return 0;
    }
}

async function fetchWalletBalances(walletAddress) {
    if (!walletAddress || !connection) return { sol: 0, olv: 0, protocolSol: 0, protocolOlv: 0 };
    
    try {
        const solBalance = await connection.getBalance(new PublicKey(walletAddress));
        const solInSol = solBalance / 1_000_000_000;
        const olvBalance = await fetchRealOlvBalance(walletAddress);
        
        await fetchProtocolOlvBalance();
        await getProtocolSolBalance();
        
        console.log(`💰 Wallet: ${solInSol.toFixed(4)} SOL, ${olvBalance.toFixed(2)} OLV`);
        console.log(`🏦 Protocol: ${protocolSolBalance.toFixed(4)} SOL, ${protocolOlvBalance.toFixed(2)} OLV`);
        
        return { 
            sol: solInSol, 
            olv: olvBalance, 
            protocolSol: protocolSolBalance,
            protocolOlv: protocolOlvBalance 
        };
    } catch (err) {
        console.error("Balance fetch error:", err);
        return { sol: 0, olv: 0, protocolSol: 0, protocolOlv: 0 };
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

// ============================================================
// CORE OLV SPEND FUNCTION - SENDS TOKENS TO PROTOCOL PDA
// ============================================================

async function spendOlvTokens(amount, reason) {
    if (!currentUser || !currentUser.wallet) {
        showToast("Connect wallet first!", true);
        return false;
    }
    
    if (walletOlvBalance < amount) {
        showToast(`Insufficient OLV! Need ${amount}, have ${Math.floor(walletOlvBalance)}`, true);
        return false;
    }
    
    try {
        if (!protocolPDA) {
            await initializeProtocolPDA();
        }
        if (!protocolPDA || !protocolTokenAccount) {
            showToast("Failed to find protocol account", true);
            return false;
        }
        
        if (currentUser.type === 'wallet' && window.solana) {
            try {
                const provider = window.solana;
                const walletPubKey = new PublicKey(currentUser.wallet);
                const olvMint = new PublicKey(OLV_MINT_ADDRESS);
                
                const sourceTokenAccount = await getAssociatedTokenAddress(olvMint, walletPubKey);
                
                const sourceInfo = await connection.getAccountInfo(sourceTokenAccount);
                if (!sourceInfo) {
                    showToast("No OLV token account found. Please get some OLV first.", true);
                    return false;
                }
                
                const destInfo = await connection.getAccountInfo(protocolTokenAccount);
                if (!destInfo) {
                    showToast("Protocol token account not initialized. Contact admin.", true);
                    return false;
                }
                
                const amountWithDecimals = new BN(amount * 1_000_000_000);
                
                const transferIx = createTransferInstruction(
                    sourceTokenAccount,
                    protocolTokenAccount,
                    walletPubKey,
                    amountWithDecimals.toNumber()
                );
                
                const transaction = new Transaction().add(transferIx);
                const { blockhash } = await connection.getRecentBlockhash();
                transaction.recentBlockhash = blockhash;
                transaction.feePayer = walletPubKey;
                
                const signed = await provider.signTransaction(transaction);
                const signature = await connection.sendRawTransaction(signed.serialize());
                await connection.confirmTransaction(signature);
                
                console.log(`✅ Sent ${amount} OLV to protocol PDA: ${signature}`);
                console.log(`🏦 Protocol PDA: ${protocolPDA.toBase58()}`);
                console.log(`📦 Protocol Token Account: ${protocolTokenAccount.toBase58()}`);
                
                walletOlvBalance -= amount;
                protocolOlvBalance += amount;
                
                showToast(`✅ ${amount} OLV sent to protocol for ${reason}`);
                return true;
                
            } catch (txErr) {
                console.error("Transaction error:", txErr);
                showToast("Transaction failed: " + txErr.message, true);
                return false;
            }
        } else {
            walletOlvBalance -= amount;
            protocolOlvBalance += amount;
            console.log(`💸 Simulated: Spent ${amount} OLV on ${reason}`);
            showToast(`💸 Spent ${amount} OLV on ${reason} (simulated)`);
            return true;
        }
        
    } catch (err) {
        console.error("OLV spend error:", err);
        showToast("Failed to spend OLV: " + err.message, true);
        return false;
    }
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
// BUY FUNCTIONS WITH OLV
// ============================================================

async function buyTreeWithOlv() {
    const cost = OLV_PRICES.tree;
    
    if (!currentUser) {
        showToast("Connect wallet first!", true);
        return;
    }
    
    if (walletOlvBalance < cost) {
        showToast(`Need ${cost} OLV! You have ${Math.floor(walletOlvBalance)}`, true);
        return;
    }
    
    const success = await spendOlvTokens(cost, "Tree Purchase");
    if (!success) return;
    
    const rarity = getRarity();
    if (rarity === 'rare') state.rareCount++;
    if (rarity === 'legendary') state.rareCount++;
    state.trees.push({
        id: '#' + (state.treesPlanted + 1),
        age: 0, health: 100, water: 85, pests: 0,
        stage: 'seed', rarity: rarity,
        protected: state.protectionActive || false
    });
    state.treesPlanted++;
    log(`🌱 Planted ${rarityIcons[rarity]?.name || rarity} tree with OLV`);
    createSparkle(window.innerWidth * 0.3 + Math.random() * 100, window.innerHeight * 0.4 + Math.random() * 100, '🌱');
    render();
    checkAchievements();
    if (currentUser) saveGameToCloud();
}

async function buyUpgradeWithOlv(type) {
    const costs = {
        irrigation: OLV_PRICES.irrigation,
        misting: OLV_PRICES.misting,
        fertilizer: OLV_PRICES.fertilizer,
        flyTraps: OLV_PRICES.flyTraps
    };
    
    const cost = costs[type];
    if (!cost) { showToast("Invalid upgrade type!", true); return; }
    
    if (!currentUser) {
        showToast("Connect wallet first!", true);
        return;
    }
    
    if (state.upgrades[type]) {
        showToast(`${type} already purchased!`, true);
        return;
    }
    
    if (walletOlvBalance < cost) {
        showToast(`Need ${cost} OLV! You have ${Math.floor(walletOlvBalance)}`, true);
        return;
    }
    
    const success = await spendOlvTokens(cost, `${type} Upgrade`);
    if (!success) return;
    
    state.upgrades[type] = true;
    log(`✅ ${type} installed with OLV!`);
    showToast(`✅ ${type} upgrade installed!`);
    render();
    if (currentUser) saveGameToCloud();
}

async function cleanMillWithOlv() {
    const cost = OLV_PRICES.cleanMill;
    
    if (!currentUser) {
        showToast("Connect wallet first!", true);
        return;
    }
    
    if (state.mill.gunk === 0) {
        showToast("Mill is already clean!", true);
        return;
    }
    
    if (walletOlvBalance < cost) {
        showToast(`Need ${cost} OLV! You have ${Math.floor(walletOlvBalance)}`, true);
        return;
    }
    
    const success = await spendOlvTokens(cost, "Mill Cleaning");
    if (!success) return;
    
    state.mill.gunk = 0;
    showToast("🧼 Mill cleaned with OLV!");
    log("🧼 Mill cleaned with OLV");
    render();
    if (currentUser) saveGameToCloud();
}

async function resetGameWithOlv() {
    const cost = OLV_PRICES.resetGame;
    
    if (!currentUser) {
        showToast("Connect wallet first!", true);
        return;
    }
    
    if (walletOlvBalance < cost) {
        showToast(`Need ${cost} OLV! You have ${Math.floor(walletOlvBalance)}`, true);
        return;
    }
    
    if (!confirm(`Reset your estate for ${cost} OLV? This will keep your Seeds & Skills.`)) {
        return;
    }
    
    const success = await spendOlvTokens(cost, "Estate Reset");
    if (!success) return;
    
    performReset();
    showToast("✅ Estate reset! Paid " + cost + " OLV");
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
            stage: 'seed', rarity: 'common',
            protected: false
        });
    }
    state.treesPlanted += 3;
    
    log("🔄 Estate reset! Ancient knowledge preserved.");
    log(`✨ Preserved ${preservedSeeds} Ancient Seeds and ${preservedSkills.length} skills`);
    render();
    if (currentUser) saveGameToCloud();
}

function upgradeFlyTraps() {
    const cost = 0.003;
    if (state.sol < cost) {
        if (walletOlvBalance >= OLV_PRICES.flyTraps) {
            if (confirm(`Not enough SOL! Would you like to buy Fly Traps with ${OLV_PRICES.flyTraps} OLV instead?`)) {
                buyUpgradeWithOlv('flyTraps');
                return;
            }
        }
        showToast(`Need ${cost} SOL (or ${OLV_PRICES.flyTraps} OLV)`, true);
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

let toastTimeout = null;

function showToast(msg, isError = false) {
    document.querySelectorAll('.toast-message').forEach(el => el.remove());
    if (toastTimeout) clearTimeout(toastTimeout);
    
    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.innerText = msg;
    Object.assign(toast.style, {
        position: 'fixed',
        bottom: '100px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: isError ? 'linear-gradient(135deg, #dc2626, #b91c1c)' : 'linear-gradient(135deg, #c9903e, #b8860b)',
        color: isError ? 'white' : '#1a120a',
        padding: '10px 20px',
        borderRadius: '40px',
        fontSize: '12px',
        fontWeight: 'bold',
        zIndex: '1000',
        whiteSpace: 'nowrap',
        maxWidth: '90%',
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        border: isError ? '1px solid #ef4444' : '1px solid var(--gold)',
        fontFamily: 'JetBrains Mono, monospace',
        pointerEvents: 'none',
        opacity: '1'
    });
    document.body.appendChild(toast);
    
    toastTimeout = setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
        toastTimeout = null;
    }, 2500);
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

function createSparkle(x, y, text = '✨') {
    const el = document.createElement('div');
    el.className = 'sparkle';
    el.textContent = text;
    el.style.cssText = `
        position: fixed;
        left: ${x}px;
        top: ${y}px;
        font-size: ${16 + Math.random() * 20}px;
        pointer-events: none;
        z-index: 999;
        animation: sparkleFade 0.8s ease-out forwards;
    `;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 800);
}

function triggerHarvestSparkles() {
    for (let i = 0; i < 8; i++) {
        setTimeout(() => {
            createSparkle(
                20 + Math.random() * window.innerWidth * 0.6,
                20 + Math.random() * window.innerHeight * 0.4,
                ['✨', '🌟', '💫', '⭐'][Math.floor(Math.random() * 4)]
            );
        }, i * 100);
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
    protocolSolBalance = balances.protocolSol;
    protocolOlvBalance = balances.protocolOlv;
    
    await fetchProtocolOlvBalance();
    await getProtocolSolBalance();
    
    const walletSolEl = document.getElementById('wallet-sol-balance');
    const walletOlvEl = document.getElementById('wallet-olv-balance');
    const uiSolEl = document.getElementById('ui-sol');
    const uiOlvEl = document.getElementById('ui-olv');
    
    if (walletSolEl) walletSolEl.innerText = walletSolBalance.toFixed(4);
    if (walletOlvEl) walletOlvEl.innerText = Math.floor(walletOlvBalance);
    if (uiOlvEl) uiOlvEl.innerText = Math.floor(walletOlvBalance);
    
    const protocolOlvEl = document.getElementById('protocol-olv-balance');
    if (protocolOlvEl) protocolOlvEl.innerText = Math.floor(protocolOlvBalance);
    
    const protocolSolEl = document.getElementById('protocol-sol-balance');
    if (protocolSolEl) protocolSolEl.innerText = protocolSolBalance.toFixed(4);
    
    const protocolPdaEl = document.getElementById('protocol-pda');
    if (protocolPdaEl && protocolPDA) {
        protocolPdaEl.innerText = protocolPDA.toBase58().slice(0, 8) + '...';
        protocolPdaEl.title = protocolPDA.toBase58();
    }
    
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
    showToast("🔄 Refreshing balances...");
    await initializeProtocolPDA();
    await updateWalletBalancesUI();
    showToast("✅ Balances updated!");
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
    
    if (balanceCheckInterval) {
        clearInterval(balanceCheckInterval);
        balanceCheckInterval = null;
    }
    
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
        
        await initializeProtocolPDA();
        await updateWalletBalancesUI();
        
        if (balanceCheckInterval) clearInterval(balanceCheckInterval);
        balanceCheckInterval = setInterval(() => {
            if (currentUser) updateWalletBalancesUI();
        }, 30000);
        
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
        
    } catch (err) {
        console.error("Wallet connection error:", err);
        showToast("Failed to connect wallet: " + err.message, true);
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
    
    walletSolBalance = 25.0;
    walletOlvBalance = 100;
    protocolOlvBalance = 0;
    await initializeProtocolPDA();
    updateWalletBalancesUI();
    
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

function buyTree() {
    if (state.sol < 5) {
        if (walletOlvBalance >= OLV_PRICES.tree) {
            if (confirm(`Not enough SOL! Would you like to buy a tree with ${OLV_PRICES.tree} OLV instead?`)) {
                buyTreeWithOlv();
                return;
            }
        }
        showToast("Need 5 SOL! (or " + OLV_PRICES.tree + " OLV)", true);
        return;
    }
    state.sol -= 5;
    const rarity = getRarity();
    if (rarity === 'rare') state.rareCount++;
    if (rarity === 'legendary') state.rareCount++;
    state.trees.push({
        id: '#' + (state.treesPlanted + 1),
        age: 0, health: 100, water: 85, pests: 0,
        stage: 'seed', rarity: rarity,
        protected: state.protectionActive || false
    });
    state.treesPlanted++;
    log(`🌱 Planted ${rarityIcons[rarity]?.name || rarity} tree`);
    createSparkle(window.innerWidth * 0.3 + Math.random() * 100, window.innerHeight * 0.4 + Math.random() * 100, '🌱');
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
        triggerHarvestSparkles();
        showToast(`+${finalYield.toFixed(1)}kg 🫒`);
        log(`🫒 Harvested ${finalYield.toFixed(1)}kg`);
        checkQuest();
        checkAchievements();
    } else {
        tree.water = Math.min(100, tree.water + 30);
        showToast('💧 +30% Water');
        createSparkle(window.innerWidth * 0.3 + Math.random() * 100, window.innerHeight * 0.4 + Math.random() * 100, '💧');
    }
    render();
    if (currentUser) saveGameToCloud();
}

function pressMill() {
    if (state.hopper <= 0) { showToast("No fruit in hopper!", true); return; }
    if (state.mill.gunk >= 100) {
        if (walletOlvBalance >= OLV_PRICES.cleanMill) {
            if (confirm(`Mill is clogged! Clean it with ${OLV_PRICES.cleanMill} OLV?`)) {
                cleanMillWithOlv();
                return;
            }
        }
        showToast("💥 Mill clogged! Clean it with SOL or OLV!", true);
        return;
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
        log("💥 Critical Failure: Mill overheated and ruptured.");
        render();
        if (currentUser) saveGameToCloud();
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
        showToast(`+${oilYield.toFixed(1)}L Oil 🏺`);
        for (let i = 0; i < 5; i++) {
            setTimeout(() => createSparkle(window.innerWidth * 0.4 + Math.random() * 100, window.innerHeight * 0.3 + Math.random() * 100, '🟡'), i * 80);
        }
    }
    render();
    if (currentUser) saveGameToCloud();
}

function cleanMill() {
    if (state.sol < 0.2) {
        if (walletOlvBalance >= OLV_PRICES.cleanMill) {
            if (confirm(`Not enough SOL! Would you like to clean the mill with ${OLV_PRICES.cleanMill} OLV instead?`)) {
                cleanMillWithOlv();
                return;
            }
        }
        showToast(`Need 0.2 SOL (or ${OLV_PRICES.cleanMill} OLV)`, true);
        return;
    }
    state.sol -= 0.2;
    state.mill.gunk = 0;
    showToast("🧼 Mill cleaned!");
    log("🧼 Mill cleaned");
    render();
    if (currentUser) saveGameToCloud();
}

function upgrade(type) {
    const costs = { irrigation: 15, misting: 10, fertilizer: 8 };
    const olvCosts = {
        irrigation: OLV_PRICES.irrigation,
        misting: OLV_PRICES.misting,
        fertilizer: OLV_PRICES.fertilizer
    };
    
    if (state.sol < costs[type]) {
        if (walletOlvBalance >= olvCosts[type]) {
            if (confirm(`Not enough SOL! Would you like to buy ${type} with ${olvCosts[type]} OLV instead?`)) {
                buyUpgradeWithOlv(type);
                return;
            }
        }
        showToast(`Need ${costs[type]} SOL (or ${olvCosts[type]} OLV)`, true);
        return;
    }
    if (state.upgrades[type]) { showToast("Already purchased!", true); return; }
    state.sol -= costs[type];
    state.upgrades[type] = true;
    log(`✅ ${type} installed!`);
    showToast(`✅ ${type} upgrade installed!`);
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
    showToast(`🧬 ${skill.toUpperCase()} unlocked!`);
    render();
    if (currentUser) saveGameToCloud();
}

function sellOil() {
    if (state.oil < 0.1) { showToast("No oil to sell", true); return; }
    const speculatorBonus = state.archetype === 'speculator' ? 1.2 : 1.0;
    let revenue = state.oil * state.world.price * speculatorBonus;
    applyMarketImpact(state.oil);
    state.sol += revenue;
    state.lifetimeSol += revenue;
    showToast(`💰 +${revenue.toFixed(2)} SOL`);
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
    showToast("🐛 Pests removed!");
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
    triggerHarvestSparkles();
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
    if (type === 'agrarian') {
        state.skillMultipliers.yield *= 1.3;
    }
    if (type === 'industrialist') {
        state.mill.gunkDecayRate = 2;
    }
    render();
    if (currentUser) saveGameToCloud();
}

function buyFuture(amountOil) {
    if (state.archetype !== 'speculator') { showToast("Only Speculators can trade futures!", true); return; }
    if (!currentUser) { showToast("Connect wallet to trade!", true); return; }
    const olvCost = Math.ceil(amountOil * 5);
    if (walletOlvBalance < olvCost) { showToast(`Need ${olvCost} OLV!`, true); return; }
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
    const revenue = sellAmt * future.lockedPrice * 1.2;
    state.sol += revenue;
    state.lifetimeSol += revenue;
    state.oil -= sellAmt;
    state.futures.splice(futureIdx, 1);
    applyMarketImpact(sellAmt);
    showToast(`📜 Future settled! +${revenue.toFixed(2)} SOL @ ${future.lockedPrice.toFixed(2)}`);
    log(`📜 Future settled: ${sellAmt.toFixed(1)}L → +${revenue.toFixed(2)} SOL`);
    render();
    if (currentUser) saveGameToCloud();
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

function openArchetypePanel() {
    const overlay = document.getElementById('archetype-overlay');
    if (overlay) { overlay.remove(); return; }
    
    const newOverlay = document.createElement('div');
    newOverlay.id = 'archetype-overlay';
    newOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px;';
    const locked = state.archetypeLocked;
    newOverlay.innerHTML = `
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
    document.body.appendChild(newOverlay);
}

function openFuturesPanel() {
    if (state.archetype !== 'speculator') { showToast("Speculator path only!", true); return; }
    settleFutures();
    const overlay = document.getElementById('futures-overlay');
    if (overlay) { overlay.remove(); return; }
    
    const newOverlay = document.createElement('div');
    newOverlay.id = 'futures-overlay';
    newOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px;';
    const futureOptions = [10, 25, 50];
    newOverlay.innerHTML = `
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
    document.body.appendChild(newOverlay);
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

    settleFutures();
    state.marketPool = Math.min(6.0, state.marketPool + 0.01);
    state.groveDensity = state.trees.length;
    const isOverSaturated = state.archetype === 'agrarian' && state.groveDensity > 9;

    state.trees.forEach((tree, idx) => {
        if (tree.health <= 0) return;
        
        if (tree.protected) {
            tree.pests = Math.max(0, tree.pests - 5);
        }
        
        let waterLoss = state.world.weather === 'Heatwave' ? 12 : (state.world.weather === 'Rainy' ? -8 : 3);
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
                    if (Math.random() < 0.3) {
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

    if (state.blightActive && state.trees.every(t => t.pests < 50)) {
        state.blightActive = false;
    }

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
                console.warn("New columns missing — falling back to base schema.");
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
        state.upgrades = data.upgrades ? JSON.parse(data.upgrades) : { irrigation: false, misting: false, fertilizer: false, flyTraps: false };
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
    
    const seasons = ['Spring', 'Summer', 'Autumn', 'Winter'];
    const seasonIndex = Math.floor(Date.now() / 600000) % 4;
    state.world.season = seasons[seasonIndex];
    const seasonEmoji = state.world.season === 'Spring' ? '🌸' : state.world.season === 'Summer' ? '☀️' : state.world.season === 'Autumn' ? '🍂' : '❄️';
    const uiSeasonEmoji = document.getElementById('ui-season-emoji');
    if (uiSeasonEmoji) uiSeasonEmoji.innerText = seasonEmoji;
    const uiSeason = document.getElementById('ui-season');
    if (uiSeason) uiSeason.innerText = state.world.season;
    
    const uiOlvEl = document.getElementById('ui-olv');
    if (uiOlvEl) uiOlvEl.innerText = Math.floor(walletOlvBalance);
    const shopBalance = document.getElementById('shop-olv-balance');
    if (shopBalance) shopBalance.innerText = Math.floor(walletOlvBalance);
    
    // Update OLV price displays
    document.querySelectorAll('.olv-price-tree').forEach(el => el.innerText = OLV_PRICES.tree);
    document.querySelectorAll('.olv-price-irrigation').forEach(el => el.innerText = OLV_PRICES.irrigation);
    document.querySelectorAll('.olv-price-misting').forEach(el => el.innerText = OLV_PRICES.misting);
    document.querySelectorAll('.olv-price-fertilizer').forEach(el => el.innerText = OLV_PRICES.fertilizer);
    document.querySelectorAll('.olv-price-flytraps').forEach(el => el.innerText = OLV_PRICES.flyTraps);
    document.querySelectorAll('.olv-price-cleanmill').forEach(el => el.innerText = OLV_PRICES.cleanMill);
    
    const estateValue = state.oil * state.world.price + state.hopper * 0.5;
    const estateValueEl = document.getElementById('estate-value');
    if (estateValueEl) estateValueEl.innerText = `Estate Value: ${estateValue.toFixed(2)} SOL`;
    const syncBar = document.getElementById('estate-sync-bar');
    if (syncBar) {
        const syncPct = Math.min(100, (estateValue / Math.max(1, state.sol + estateValue)) * 100);
        syncBar.style.width = syncPct + '%';
    }
    
    const boostsContainer = document.getElementById('active-boosts');
    if (boostsContainer) {
        let boostsHtml = '';
        if (state.fertilizerBoost) {
            const remaining = Math.max(0, Math.ceil((state.fertilizerBoostEnd - Date.now()) / 60000));
            boostsHtml += `<span class="text-[8px] bg-green-900/40 px-2 py-1 rounded">🌿 Fertilizer: ${remaining}min</span>`;
        }
        if (state.protectionActive) {
            const remaining = Math.max(0, Math.ceil((state.protectionEnd - Date.now()) / 3600000));
            boostsHtml += `<span class="text-[8px] bg-blue-900/40 px-2 py-1 rounded">🛡️ Protection: ${remaining}h</span>`;
        }
        if (!boostsHtml) boostsHtml = '<span class="text-[8px] opacity-40">No active boosts</span>';
        boostsContainer.innerHTML = boostsHtml;
    }
    
    const mashBar = document.getElementById('mash-bar');
    if (mashBar) mashBar.style.width = state.mill.mash + '%';
    const gunkBar = document.getElementById('gunk-bar');
    if (gunkBar) gunkBar.style.width = state.mill.gunk + '%';
    document.getElementById('mash-pct').innerHTML = state.mill.mash + '%';
    document.getElementById('gunk-pct').innerHTML = Math.floor(state.mill.gunk) + '%';
    const heatBar = document.getElementById('heat-bar');
    if (heatBar) {
        const heat = state.mill.heat || 0;
        heatBar.style.width = heat + '%';
        heatBar.style.background = heat > 75 ? '#ef4444' : heat > 50 ? '#f97316' : '#facc15';
    }
    const heatPct = document.getElementById('heat-pct');
    if (heatPct) {
        const heat = state.mill.heat || 0;
        heatPct.innerHTML = Math.floor(heat) + '%';
        heatPct.style.color = heat > 75 ? '#ef4444' : 'inherit';
    }
    if (gunkBar) gunkBar.style.background = state.mill.gunk > 85 ? '#ef4444' : state.mill.gunk > 60 ? '#f97316' : '#7c3aed';

    const archetypeBadge = document.getElementById('archetype-badge');
    if (archetypeBadge) {
        if (state.archetype) {
            const a = ARCHETYPES[state.archetype];
            archetypeBadge.innerHTML = `${a.icon} ${a.name}`;
            archetypeBadge.style.display = 'inline-block';
        } else {
            archetypeBadge.innerHTML = '🏛️ Choose Path';
            archetypeBadge.style.display = 'inline-block';
            archetypeBadge.style.opacity = '0.5';
        }
    }

    const futuresBtn = document.getElementById('futures-btn');
    if (futuresBtn) {
        futuresBtn.style.display = state.archetype === 'speculator' ? 'inline-block' : 'none';
        if (state.futures.length > 0) futuresBtn.innerText = `📜 Futures (${state.futures.length})`;
        else futuresBtn.innerText = '📜 Futures';
    }

    const blightBanner = document.getElementById('blight-banner');
    if (blightBanner) blightBanner.style.display = state.blightActive ? 'block' : 'none';

    const densityEl = document.getElementById('grove-density');
    if (densityEl && state.archetype === 'agrarian') {
        const overSat = state.groveDensity > 9;
        densityEl.style.display = 'inline';
        densityEl.innerHTML = overSat ? `🔥 Over-saturated (${state.groveDensity})` : `🌿 Density: ${state.groveDensity}`;
        densityEl.style.color = overSat ? '#f97316' : '#4ade80';
    } else if (densityEl) {
        densityEl.style.display = 'none';
    }
    
    document.getElementById('quest-current').innerHTML = state.quest.current.toFixed(0);
    document.getElementById('quest-target').innerHTML = state.quest.target;
    const questSeedRewardEl = document.getElementById('quest-seed-reward');
    if (questSeedRewardEl) questSeedRewardEl.innerHTML = state.quest.seedReward || 1;
    const questProgress = document.getElementById('quest-progress');
    if (questProgress) questProgress.style.width = Math.min(100, (state.quest.current / state.quest.target) * 100) + '%';
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
    
    ['irrigation', 'misting', 'fertilizer'].forEach(key => {
        const costEl = document.getElementById(`upg-${key}-cost`);
        const btnEl = document.getElementById(`upg-${key}-mobile`);
        if (state.upgrades[key]) {
            if (costEl) costEl.innerHTML = '✅ Installed';
            if (btnEl) { btnEl.style.opacity = '0.5'; btnEl.style.pointerEvents = 'none'; }
        }
    });
    const flyTrapsCostEl = document.getElementById('upg-flytraps-cost');
    const flyTrapsBtnEl = document.getElementById('upg-flytraps-mobile');
    if (state.upgrades.flyTraps) {
        if (flyTrapsCostEl) flyTrapsCostEl.innerHTML = '✅ Installed';
        if (flyTrapsBtnEl) { flyTrapsBtnEl.style.opacity = '0.5'; flyTrapsBtnEl.style.pointerEvents = 'none'; }
    }
    
    ['yield', 'speed', 'cold', 'rare'].forEach(skill => {
        const costEl = document.getElementById(`skill-${skill}-cost`);
        const btnEl = document.getElementById(`skill-${skill}-btn`);
        if (state.skills.includes(skill)) {
            if (costEl) costEl.innerHTML = '✅ Active';
            if (btnEl) { btnEl.style.opacity = '0.5'; btnEl.style.pointerEvents = 'none'; }
        }
    });
    
    const deadCount = state.trees.filter(t => t.health <= 0).length;
    const deadBadge = document.getElementById('dead-tree-badge');
    const deadCountEl = document.getElementById('dead-count');
    if (deadBadge) deadBadge.style.display = deadCount > 0 ? 'inline' : 'none';
    if (deadCountEl) deadCountEl.innerText = deadCount;
    
    const harvestAllBtn = document.getElementById('harvest-all-btn');
    if (harvestAllBtn) {
        const readyCount = state.trees.filter(t => t.stage === 'mature' && t.health > 0).length;
        harvestAllBtn.innerText = readyCount > 0 ? `🫒 HARVEST ALL (${readyCount})` : '🫒 HARVEST ALL';
        harvestAllBtn.style.opacity = readyCount > 0 ? '1' : '0.4';
    }
    
    const sellHalfBtn = document.getElementById('sell-half-btn');
    if (sellHalfBtn) sellHalfBtn.style.display = state.oil >= 0.1 ? 'inline-block' : 'none';
    
    const container = document.getElementById('grove-container');
    if (!container) return;
    
    container.innerHTML = '';
    state.trees.forEach((tree, idx) => {
        const isReady = tree.stage === 'mature';
        const isDead = tree.health <= 0;
        const emoji = isDead ? '🍂' : tree.stage === 'seed' ? '🌱' : tree.stage === 'sapling' ? '🌿' : '🫒';
        
        let growthPct = 0;
        if (tree.stage === 'seed') growthPct = Math.min(100, (tree.age / 5) * 100);
        else if (tree.stage === 'sapling') growthPct = Math.min(100, ((tree.age - 5) / 7) * 100);
        else if (tree.stage === 'mature') growthPct = 100;
        
        const card = document.createElement('div');
        card.className = `tree-card ${isReady ? 'ready' : ''} ${tree.pests > 30 ? 'infested' : ''} ${isDead ? 'dead' : ''}`;
        if (!isDead) card.onclick = () => interactTree(idx);
        
        const spriteHTML = state.useSprites ? 
            `<div class="sprite-container">${getSpriteSVG(tree.stage, tree.rarity)}</div>` :
            `<div class="tree-emoji">${emoji}</div>`;
        
        card.innerHTML = `
            ${spriteHTML}
            <div class="tree-id">${tree.id}</div>
            ${!isDead ? `
            <div class="progress-bar" title="Water"><div class="progress-fill fill-water" style="width:${tree.water}%"></div></div>
            <div class="progress-bar" title="Health"><div class="progress-fill fill-health" style="width:${tree.health}%"></div></div>
            ${!isReady ? `<div class="progress-bar" title="Growth" style="opacity:0.5"><div class="progress-fill" style="width:${growthPct}%; background:linear-gradient(90deg,#a3e635,#84cc16);"></div></div>` : ''}
            ${tree.pests > 0 ? `<div class="progress-bar"><div class="progress-fill fill-pest" style="width:${tree.pests}%"></div></div>` : ''}
            ${isReady ? '<div class="text-center text-gold text-[9px] mt-1">⬤ READY</div>' : ''}
            ` : '<div class="text-center text-[9px] mt-1" style="color:#ef4444;">DEAD</div>'}
            ${tree.rarity === 'rare' ? '<div class="rarity-badge">💎</div>' : tree.rarity === 'legendary' ? '<div class="rarity-badge legendary">👑</div>' : ''}
            ${tree.protected ? '<div class="text-center text-[8px] text-blue-400 mt-1">🛡️</div>' : ''}
        `;
        container.appendChild(card);
    });
    if (state.trees.length === 0) {
        container.innerHTML = '<div class="text-center py-10 opacity-50 col-span-full">🌱 Tap PLANT to start</div>';
    }
}

// ============================================================
// PANEL NAVIGATION
// ============================================================

function openPanel(panelId) {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('open'));
    const panel = document.getElementById(`panel-${panelId}`);
    if (panel) {
        panel.classList.add('open');
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.panel === panelId);
        });
        const overlay = document.getElementById('panel-overlay');
        if (overlay) overlay.classList.add('active');
    }
}

function closePanel() {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('open'));
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    const overlay = document.getElementById('panel-overlay');
    if (overlay) overlay.classList.remove('active');
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
        shopNav.innerHTML = '<span class="nav-icon">🛒</span>SHOP';
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
        <div class="text-center text-sm mb-2">💰 Your OLV: <span id="shop-olv-balance" class="text-gold font-bold">0</span></div>
        <div class="text-center text-xs text-dim mb-3">
            🏦 Protocol: <span id="protocol-olv-balance" class="text-gold font-bold">0</span> OLV
            <div class="text-[8px] opacity-50 mt-1">
                <span id="protocol-pda">PDA: ...</span>
                <span class="ml-2">SOL: <span id="protocol-sol-balance">0.00</span></span>
            </div>
        </div>
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
        <div class="mt-3 pt-3 border-t border-border">
            <div class="text-sm font-bold text-gold mb-2">🏷️ OLV UPGRADES</div>
            <div class="space-y-2">
                <div class="card" style="cursor:pointer" onclick="game.buyTreeWithOlv()">
                    <div class="flex-between"><div><span class="text-lg">🌳</span> Plant Tree</div><div class="text-gold"><span class="olv-price-tree">50</span> OLV</div></div>
                    <div class="text-[9px] opacity-50">Buy a tree directly with OLV</div>
                </div>
                <div class="card" style="cursor:pointer" onclick="game.buyUpgradeWithOlv('irrigation')">
                    <div class="flex-between"><div><span class="text-lg">💧</span> Auto-Irrigation</div><div class="text-gold"><span class="olv-price-irrigation">150</span> OLV</div></div>
                    <div class="text-[9px] opacity-50">Maintains water at 70%</div>
                </div>
                <div class="card" style="cursor:pointer" onclick="game.buyUpgradeWithOlv('misting')">
                    <div class="flex-between"><div><span class="text-lg">🌫️</span> Misting System</div><div class="text-gold"><span class="olv-price-misting">100</span> OLV</div></div>
                    <div class="text-[9px] opacity-50">Reduces pest spread</div>
                </div>
                <div class="card" style="cursor:pointer" onclick="game.buyUpgradeWithOlv('fertilizer')">
                    <div class="flex-between"><div><span class="text-lg">🌿</span> Organic Fertilizer</div><div class="text-gold"><span class="olv-price-fertilizer">80</span> OLV</div></div>
                    <div class="text-[9px] opacity-50">Boosts growth rate</div>
                </div>
                <div class="card" style="cursor:pointer" onclick="game.buyUpgradeWithOlv('flyTraps')">
                    <div class="flex-between"><div><span class="text-lg">🪰</span> Venus Fly Traps</div><div class="text-gold"><span class="olv-price-flytraps">30</span> OLV</div></div>
                    <div class="text-[9px] opacity-50">Pests die 50% faster</div>
                </div>
                <div class="card" style="cursor:pointer" onclick="game.cleanMillWithOlv()">
                    <div class="flex-between"><div><span class="text-lg">🧼</span> Steam Clean Mill</div><div class="text-gold"><span class="olv-price-cleanmill">20</span> OLV</div></div>
                    <div class="text-[9px] opacity-50">Remove all gunk from mill</div>
                </div>
            </div>
        </div>
        <div class="card" style="border-color:#ef4444; cursor:pointer; margin-top: 8px;" onclick="game.resetGameWithOlv()">
            <div class="flex-between">
                <div><span class="text-lg">⚠️</span> Reset Estate (OLV)</div>
                <div class="text-red-400">300 OLV</div>
            </div>
            <div class="text-[9px] opacity-50">Reset your estate (Keeps Seeds & Skills)</div>
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

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🎮 OLIVIUM Estate loading...');
    
    // Initialize protocol PDA first
    await initializeProtocolPDA();
    
    addOlvShopPanel();
    addBoostsDisplay();
    
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
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.onclick = () => openPanel(item.dataset.panel);
    });
    
    window.game = { 
        upgrade: (t) => { upgrade(t); closePanel(); }, 
        upgradeFlyTraps: () => { upgradeFlyTraps(); closePanel(); },
        unlockSkill: (s) => { unlockSkill(s); closePanel(); }, 
        buyWithOlv,
        buyTreeWithOlv,
        buyUpgradeWithOlv,
        cleanMillWithOlv,
        resetGameWithOlv,
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
        refreshBalances,
    };
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
            
            if (currentUser.type === 'wallet') {
                if (balanceCheckInterval) clearInterval(balanceCheckInterval);
                balanceCheckInterval = setInterval(() => {
                    if (currentUser) updateWalletBalancesUI();
                }, 30000);
                updateWalletBalancesUI();
            } else {
                walletSolBalance = 25.0;
                walletOlvBalance = 100;
                protocolOlvBalance = 0;
                updateWalletBalancesUI();
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
    log("🛒 Use OLV tokens in the SHOP for boosts, upgrades, and trees!");
});

setInterval(() => {
    if (currentUser) saveGameToCloud();
}, 30000);

// Add sparkle animation CSS if not present
if (!document.getElementById('sparkle-styles')) {
    const style = document.createElement('style');
    style.id = 'sparkle-styles';
    style.textContent = `
        @keyframes sparkleFade {
            0% { opacity: 1; transform: translateY(0) scale(1); }
            100% { opacity: 0; transform: translateY(-40px) scale(0.5); }
        }
    `;
    document.head.appendChild(style);
}
