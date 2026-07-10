// pro.js — Tier display, now sourced from connection.ts's identity state
// instead of its own wallet connect/disconnect logic.
//
// Removed entirely (now lives only in connection.ts):
//  - connectWallet() / disconnectWallet() / restoreSession()
//  - localStorage keys: olivium_wallet_connected, olivium_wallet_address
//  - the connectBtn click handler that called them directly
//
// This file now only:
//  1. Reads identity via getIdentity() / getActiveWallet()
//  2. Reacts to olivium:connected / olivium:disconnected events
//  3. Fetches the OLV balance and renders tiers

import { getActiveWallet, getIdentity, connection } from "./connection.js";
import { PublicKey } from "@solana/web3.js";

const OLV_TOKEN_MINT = new PublicKey("6C3xwo24Tvkw6fxSK1PNLCcQsWJt7Y9seH95xMtTP8V9");

let currentOlvBalance = 0;

// DOM Elements
const connectBtn = document.getElementById('connectWalletBtn');
const walletShortEl = document.getElementById('walletShort');
const olvBalanceEl = document.getElementById('olvBalance');
const walletDisplay = document.getElementById('walletDisplay');
const balanceDisplay = document.getElementById('balanceDisplay');
const tiersContainer = document.getElementById('tiersContainer');

// Tier configuration (unchanged)
const TIERS = [
    { id: 1, name: "Seedling", minOlv: 0, maxOlv: 99, color: "#8B9D6B",
      benefits: ["🌱 Basic tree adoption (1 tree)", "📊 Monthly growth reports", "🎫 1 entry to monthly raffle"] },
    { id: 2, name: "Sapling", minOlv: 100, maxOlv: 499, color: "#6B8E4E",
      benefits: ["🌳 Adopt 5 trees", "📈 Weekly growth reports", "🎟️ 5 entries to monthly raffle", "🏷️ 10% discount on merchandise"] },
    { id: 3, name: "Evergreen", minOlv: 500, maxOlv: 1999, color: "#4A7A3A",
      benefits: ["🌲 Adopt 25 trees", "📊 Real-time carbon offset tracking", "🎫 25 raffle entries", "🏷️ 20% discount", "🔑 Early access to new features"] },
    { id: 4, name: "Ancient Oak", minOlv: 2000, maxOlv: 9999, color: "#2D5A27",
      benefits: ["🌳🌳 Adopt 100 trees", "👑 Priority support", "🎟️ 100 raffle entries", "🏷️ 30% discount", "🌟 Exclusive NFT badge", "🏝️ Villa booking priority"] },
    { id: 5, name: "Elder Grove", minOlv: 10000, maxOlv: Infinity, color: "#1A3A15",
      benefits: ["🌲🌲🌲 Adopt 500+ trees", "🎖️ Custom recognition", "🎫 500 raffle entries", "🏷️ 50% discount", "👑 VIP status", "🏝️ Free villa weekend (annual)", "🤝 Governance voting rights"] },
];

function showToast(msg, isError = false) {
    const toast = document.getElementById('toastMsg');
    if (!toast) return;
    toast.innerHTML = msg;
    toast.style.opacity = '1';
    toast.style.borderLeftColor = isError ? '#d94d4d' : '#C5A059';
    setTimeout(() => { toast.style.opacity = '0'; }, 3000);
}

async function fetchOlvBalance(pubkey) {
    try {
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(pubkey, {
            mint: OLV_TOKEN_MINT
        });
        return tokenAccounts.value[0]?.account.data.parsed.info.tokenAmount.uiAmount ?? 0;
    } catch (e) {
        console.error("Error fetching OLV balance:", e);
        return 0;
    }
}

function getCurrentTier(olvBalance) {
    for (let i = TIERS.length - 1; i >= 0; i--) {
        if (olvBalance >= TIERS[i].minOlv) return TIERS[i];
    }
    return TIERS[0];
}

function loadTiers(olvBalance = 0) {
    if (!tiersContainer) return;
    tiersContainer.innerHTML = '';

    TIERS.forEach(tier => {
        const isAchieved = olvBalance >= tier.minOlv;
        const isCurrent = isAchieved && (tier.maxOlv === Infinity || olvBalance <= tier.maxOlv);
        const progressPercent = Math.min(100, (olvBalance / tier.maxOlv) * 100);

        const tierCard = document.createElement('div');
        tierCard.className = `tier-card ${isAchieved ? 'achieved' : 'locked'} ${isCurrent ? 'current' : ''}`;
        tierCard.style.borderColor = tier.color;

        tierCard.innerHTML = `
            <div class="tier-header" style="background: ${tier.color}20">
                <h3 style="color: ${tier.color}">${tier.name}</h3>
                <span class="tier-badge">${tier.minOlv.toLocaleString()} - ${tier.maxOlv === Infinity ? '∞' : tier.maxOlv.toLocaleString()} OLVs</span>
            </div>
            <div class="tier-benefits">
                <ul>${tier.benefits.map(b => `<li>${b}</li>`).join('')}</ul>
            </div>
            ${!isAchieved && tier.minOlv > 0 ? `
                <div class="tier-progress">
                    <div class="progress-bar" style="width: ${progressPercent}%; background: ${tier.color}"></div>
                    <span>${olvBalance.toLocaleString()} / ${tier.minOlv.toLocaleString()} OLVs needed</span>
                </div>
            ` : `
                <div class="tier-status ${isAchieved ? 'achieved' : ''}">${isAchieved ? '✓ Achieved' : '🔒 Locked'}</div>
            `}
            ${isCurrent ? `<div class="current-tier-badge" style="background: ${tier.color}">Current Tier</div>` : ''}
        `;

        tiersContainer.appendChild(tierCard);
    });
}

// Re-renders everything from connection.ts's current identity — this is
// the single place UI state gets derived, called on load and on every
// connect/disconnect event.
async function renderFromIdentity() {
    const identity = getIdentity();
    const walletStr = getActiveWallet();

    if (identity.type === 'guest' || !walletStr) {
        if (walletShortEl) walletShortEl.innerText = "Not connected";
        if (olvBalanceEl) olvBalanceEl.innerText = "0.00";
        if (walletDisplay) walletDisplay.classList.add('hidden');
        if (balanceDisplay) balanceDisplay.classList.add('hidden');
        if (connectBtn) {
            connectBtn.innerText = "CONNECT WALLET";
            connectBtn.style.background = "linear-gradient(135deg, var(--olive), var(--olive-light))";
            connectBtn.style.border = "none";
            connectBtn.style.color = "white";
        }
        loadTiers(0);
        return;
    }

    if (walletShortEl) walletShortEl.innerText = identity.label;

    currentOlvBalance = await fetchOlvBalance(new PublicKey(walletStr));
    const formattedOlv = currentOlvBalance.toLocaleString(undefined, {
        minimumFractionDigits: 2, maximumFractionDigits: 2
    });

    if (olvBalanceEl) olvBalanceEl.innerText = formattedOlv;
    if (balanceDisplay) {
        balanceDisplay.classList.remove('hidden');
        balanceDisplay.innerHTML = `🌿 ${formattedOlv} OLV`;
    }
    if (walletDisplay) walletDisplay.classList.remove('hidden');
    if (connectBtn) {
        connectBtn.innerText = "DISCONNECT";
        connectBtn.style.background = "transparent";
        connectBtn.style.border = "1px solid #d94d4d";
        connectBtn.style.color = "#d94d4d";
    }

    loadTiers(currentOlvBalance);

    const currentTier = getCurrentTier(currentOlvBalance);
    showToast(`Connected: ${identity.label} | ${formattedOlv} OLV — Tier: ${currentTier.name}`);
}

function showTreeDashboard() {
    const walletStr = getActiveWallet();
    if (walletStr) {
        const currentTier = getCurrentTier(currentOlvBalance);
        alert(`🌳 Tree Dashboard\n\nConnected: ${walletStr.slice(0,8)}...\nTier: ${currentTier.name}\nOLV Balance: ${currentOlvBalance.toFixed(2)}\n\nYour benefits:\n${currentTier.benefits.map(b => `• ${b}`).join('\n')}`);
    } else {
        alert("🌳 Connect your wallet to access your personal tree dashboard.");
    }
}

// connectBtn now just calls connection.ts's connect/disconnect (exposed on
// window by initReadOnly()) — no duplicate logic here.
if (connectBtn) {
    connectBtn.addEventListener('click', async () => {
        try {
            if (getActiveWallet()) {
                await window.disconnectWallet();
            } else {
                await window.connectWallet();
            }
        } catch (err) {
            showToast(err.message || "Connection failed", true);
        }
    });
}

window.addEventListener('olivium:connected', renderFromIdentity);
window.addEventListener('olivium:disconnected', renderFromIdentity);

// Render whatever identity connection.ts has already restored by the time
// this script runs (it boots itself via an IIFE on import).
renderFromIdentity();

window.showTreeDashboard = showTreeDashboard;
