// pro.js - Make sure this file is loaded as a module
import { PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { connection } from "./connection.js";

// Token mint address for OLV (replace with actual OLV token address)
const OLV_TOKEN_MINT  = new PublicKey("6C3xwo24Tvkw6fxSK1PNLCcQsWJt7Y9seH95xMtTP8V9");

// Solana Devnet Configuration
let wallet = null;
let walletPubKey = null;
let currentSolBalance = 0;
let currentOlvBalance = 0;

// DOM Elements
const connectBtn = document.getElementById('connectWalletBtn');
const walletShortEl = document.getElementById('walletShort');
const solBalanceEl = document.getElementById('solBalance');
const olvBalanceEl = document.getElementById('olvBalance');
const walletDisplay = document.getElementById('walletDisplay');
const balanceDisplay = document.getElementById('balanceDisplay');
const tiersContainer = document.getElementById('tiersContainer');

// Tier configuration
const TIERS = [
    {
        id: 1,
        name: "Seedling",
        minOlv: 0,
        maxOlv: 99,
        color: "#8B9D6B",
        benefits: [
            "🌱 Basic tree adoption (1 tree)",
            "📊 Monthly growth reports",
            "🎫 1 entry to monthly raffle"
        ]
    },
    {
        id: 2,
        name: "Sapling",
        minOlv: 100,
        maxOlv: 499,
        color: "#6B8E4E",
        benefits: [
            "🌳 Adopt 5 trees",
            "📈 Weekly growth reports",
            "🎟️ 5 entries to monthly raffle",
            "🏷️ 10% discount on merchandise"
        ]
    },
    {
        id: 3,
        name: "Evergreen",
        minOlv: 500,
        maxOlv: 1999,
        color: "#4A7A3A",
        benefits: [
            "🌲 Adopt 25 trees",
            "📊 Real-time carbon offset tracking",
            "🎫 25 raffle entries",
            "🏷️ 20% discount",
            "🔑 Early access to new features"
        ]
    },
    {
        id: 4,
        name: "Ancient Oak",
        minOlv: 2000,
        maxOlv: 9999,
        color: "#2D5A27",
        benefits: [
            "🌳🌳 Adopt 100 trees",
            "👑 Priority support",
            "🎟️ 100 raffle entries",
            "🏷️ 30% discount",
            "🌟 Exclusive NFT badge",
            "🏝️ Villa booking priority"
        ]
    },
    {
        id: 5,
        name: "Elder Grove",
        minOlv: 10000,
        maxOlv: Infinity,
        color: "#1A3A15",
        benefits: [
            "🌲🌲🌲 Adopt 500+ trees",
            "🎖️ Custom recognition",
            "🎫 500 raffle entries",
            "🏷️ 50% discount",
            "👑 VIP status",
            "🏝️ Free villa weekend (annual)",
            "🤝 Governance voting rights"
        ]
    }
];

function showToast(msg, isError = false) {
    const toast = document.getElementById('toastMsg');
    if (!toast) return;
    toast.innerHTML = msg;
    toast.style.opacity = '1';
    toast.style.borderLeftColor = isError ? '#d94d4d' : '#C5A059';
    setTimeout(() => { toast.style.opacity = '0'; }, 3000);
}

async function fetchSolBalance(pubkey) {
    try {
        const balance = await connection.getBalance(pubkey);
        return balance / 1e9;
    } catch(e) {
        console.error("Error fetching SOL balance:", e);
        return 0;
    }
}

async function fetchOlvBalance(pubkey) {
    try {
        // Get all token accounts for the wallet
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(pubkey, {
            mint: OLV_TOKEN_MINT
        });

        if (tokenAccounts.value.length > 0) {
            const balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
            return balance || 0;
        }
        return 0;
    } catch(e) {
        console.error("Error fetching OLV balance:", e);
        // If token not found or error, return 0
        return 0;
    }
}

function getCurrentTier(olvBalance) {
    for (let i = TIERS.length - 1; i >= 0; i--) {
        if (olvBalance >= TIERS[i].minOlv) {
            return TIERS[i];
        }
    }
    return TIERS[0];
}

function loadTiers(currentOlvBalance = 0) {
    if (!tiersContainer) return;

    tiersContainer.innerHTML = '';

    TIERS.forEach(tier => {
        const isAchieved = currentOlvBalance >= tier.minOlv;
        const isCurrent = currentOlvBalance >= tier.minOlv &&
                         (tier.maxOlv === Infinity || currentOlvBalance <= tier.maxOlv);

        const tierCard = document.createElement('div');
        tierCard.className = `tier-card ${isAchieved ? 'achieved' : 'locked'} ${isCurrent ? 'current' : ''}`;
        tierCard.style.borderColor = tier.color;

        const progressPercent = Math.min(100, (currentOlvBalance / tier.maxOlv) * 100);

        tierCard.innerHTML = `
            <div class="tier-header" style="background: ${tier.color}20">
                <h3 style="color: ${tier.color}">${tier.name}</h3>
                <span class="tier-badge">${tier.minOlv.toLocaleString()} - ${tier.maxOlv === Infinity ? '∞' : tier.maxOlv.toLocaleString()} OLVs</span>
            </div>
            <div class="tier-benefits">
                <ul>
                    ${tier.benefits.map(benefit => `<li>${benefit}</li>`).join('')}
                </ul>
            </div>
            ${!isAchieved && tier.minOlv > 0 ? `
                <div class="tier-progress">
                    <div class="progress-bar" style="width: ${progressPercent}%; background: ${tier.color}"></div>
                    <span>${currentOlvBalance.toLocaleString()} / ${tier.minOlv.toLocaleString()} OLVs needed</span>
                </div>
            ` : `
                <div class="tier-status ${isAchieved ? 'achieved' : ''}">
                    ${isAchieved ? '✓ Achieved' : '🔒 Locked'}
                </div>
            `}
            ${isCurrent ? `<div class="current-tier-badge" style="background: ${tier.color}">Current Tier</div>` : ''}
        `;

        tiersContainer.appendChild(tierCard);
    });
}

// Update the balance display in your updateWalletUI function
async function updateWalletUI() {
    if (walletPubKey) {
        const short = walletPubKey.toBase58().slice(0,4) + "..." + walletPubKey.toBase58().slice(-4);
        if (walletShortEl) walletShortEl.innerText = short;

        currentSolBalance = await fetchSolBalance(walletPubKey);
        currentOlvBalance = await fetchOlvBalance(walletPubKey);

        // Format balances with proper decimal places
        const formattedSol = currentSolBalance.toFixed(4);
        const formattedOlv = currentOlvBalance.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

        // Update both spans
        if (solBalanceEl) solBalanceEl.innerText = formattedSol;
        if (olvBalanceEl) olvBalanceEl.innerText = formattedOlv;

        // Make sure the container shows both
        if (balanceDisplay) {
            balanceDisplay.classList.remove('hidden');
            // Update the inner HTML to ensure proper formatting
            balanceDisplay.innerHTML = `◎ ${formattedSol} SOL 🌿 ${formattedOlv} OLV`;
            // Re-query the span elements
            const newSolSpan = balanceDisplay.querySelector('#solBalance');
            const newOlvSpan = balanceDisplay.querySelector('#olvBalance');
            if (newSolSpan) newSolSpan.innerText = formattedSol;
            if (newOlvSpan) newOlvSpan.innerText = formattedOlv;
        }

        if (walletDisplay) walletDisplay.classList.remove('hidden');

        // Load tiers based on OLV balance
        loadTiers(currentOlvBalance);

        const currentTier = getCurrentTier(currentOlvBalance);
        showToast(`Connected: ${short} | ${formattedSol} SOL | ${formattedOlv} OLV - Tier: ${currentTier.name}`);
    } else {
        if (walletShortEl) walletShortEl.innerText = "Not connected";
        if (solBalanceEl) solBalanceEl.innerText = "0.00";
        if (olvBalanceEl) olvBalanceEl.innerText = "0.00";
        if (walletDisplay) walletDisplay.classList.add('hidden');
        if (balanceDisplay) balanceDisplay.classList.add('hidden');
        loadTiers(0);
    }
}

// Format function for large numbers
function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(2) + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(2) + 'K';
    }
    return num.toFixed(2);
}

// Update the balance display
if (olvBalanceEl) {
    const formattedOlv = formatNumber(currentOlvBalance);
    olvBalanceEl.innerText = formattedOlv;
}

async function connectWallet() {
    if (window.solana && window.solana.isPhantom) {
        try {
            const resp = await window.solana.connect();
            wallet = window.solana;
            walletPubKey = wallet.publicKey;
            await updateWalletUI();

            localStorage.setItem('olivium_wallet_connected', 'true');
            localStorage.setItem('olivium_wallet_address', walletPubKey.toBase58());

            if (connectBtn) {
                connectBtn.innerText = "DISCONNECT";
                connectBtn.style.background = "transparent";
                connectBtn.style.border = "1px solid #d94d4d";
                connectBtn.style.color = "#d94d4d";
            }
        } catch(err) {
            showToast("Connection rejected", true);
        }
    } else {
        showToast("Please install Phantom wallet", true);
        window.open("https://phantom.app/", "_blank");
    }
}

async function disconnectWallet() {
    if (wallet && wallet.disconnect) {
        try { await wallet.disconnect(); } catch(e) {}
    }
    wallet = null;
    walletPubKey = null;
    await updateWalletUI();
    localStorage.removeItem('olivium_wallet_connected');
    localStorage.removeItem('olivium_wallet_address');
    if (connectBtn) {
        connectBtn.innerText = "CONNECT WALLET";
        connectBtn.style.background = "linear-gradient(135deg, var(--olive), var(--olive-light))";
        connectBtn.style.border = "none";
        connectBtn.style.color = "white";
    }
    showToast("Disconnected");
}

if (connectBtn) {
    connectBtn.addEventListener('click', async () => {
        if (walletPubKey) {
            await disconnectWallet();
        } else {
            await connectWallet();
        }
    });
}

async function restoreSession() {
    const wasConnected = localStorage.getItem('olivium_wallet_connected');
    const savedAddress = localStorage.getItem('olivium_wallet_address');
    if (wasConnected === 'true' && savedAddress && window.solana) {
        try {
            await window.solana.connect({ onlyIfTrusted: true });
            wallet = window.solana;
            walletPubKey = wallet.publicKey;
            await updateWalletUI();
            if (connectBtn) {
                connectBtn.innerText = "DISCONNECT";
                connectBtn.style.background = "transparent";
                connectBtn.style.border = "1px solid #d94d4d";
                connectBtn.style.color = "#d94d4d";
            }
        } catch(e) {
            localStorage.removeItem('olivium_wallet_connected');
            localStorage.removeItem('olivium_wallet_address');
        }
    } else {
        // Initial load of tiers
        loadTiers(0);
    }
}

function showTreeDashboard() {
    if (walletPubKey) {
        const currentTier = getCurrentTier(currentOlvBalance);
        alert(`🌳 Tree Dashboard\n\nConnected: ${walletPubKey.toBase58().slice(0,8)}...\nTier: ${currentTier.name}\nOLV Balance: ${currentOlvBalance.toFixed(2)}\nSOL Balance: ${currentSolBalance.toFixed(4)}\n\nYour benefits:\n${currentTier.benefits.map(b => `• ${b}`).join('\n')}`);
    } else {
        alert("🌳 Connect your wallet to access your personal tree dashboard and stewardship metrics.");
    }
}

// Intersection Observer for reveals
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('in');
            observer.unobserve(entry.target);
        }
    });
}, { threshold: 0.1, rootMargin: "0px 0px -40px 0px" });

document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        const targetId = this.getAttribute('href');
        if (targetId === "#" || targetId === "") return;
        const targetEl = document.querySelector(targetId);
        if (targetEl) {
            e.preventDefault();
            targetEl.scrollIntoView({ behavior: 'smooth' });
        }
    });
});

// Initialize
restoreSession();
window.showTreeDashboard = showTreeDashboard;
