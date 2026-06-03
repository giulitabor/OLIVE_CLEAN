// ============================================================
// OLIVIUM GAME - With REAL Wallet Balances
// ============================================================

import { sb, getIdentity, isConnected, connection, program } from "./src/connection.ts";

let currentUser = null;
let walletSolBalance = 0;
let walletOlvBalance = 0;

// ============================================================
// FETCH WALLET BALANCES
// ============================================================

async function fetchWalletBalances(walletAddress) {
    if (!walletAddress || !connection) return { sol: 0, olv: 0 };
    
    try {
        // Fetch SOL balance
        const solBalance = await connection.getBalance(new PublicKey(walletAddress));
        const solInSol = solBalance / 1_000_000_000;
        
        // Fetch OLV token balance (assuming OLV is a token mint)
        // You'll need your OLV token mint address here
        let olvBalance = 0;
        try {
            // Try to get OLV balance from your program or token account
            // This is a placeholder - replace with your actual OLV token logic
            const olvMintAddress = new PublicKey("DYmefEbHQXyQfGQDCKQfVwuR4ZvjXSkVv3N76NEJHaKa");

             const tokenAccounts = await connection.getTokenAccountsByOwner(walletAddress, { mint: new PublicKey(olvMintAddress) });
            olvBalance = tokenAccounts.value.reduce((sum, acc) => sum + acc.account.data.parsed.info.tokenAmount.uiAmount, 0);
            
        } catch (e) {
            console.log("OLV fetch error:", e);
            olvBalance = 0;
        }
        
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
    
    if (walletSolEl) walletSolEl.innerText = walletSolBalance.toFixed(4);
    if (walletOlvEl) walletOlvEl.innerText = Math.floor(walletOlvBalance);
    
    // Use wallet SOL as starting balance for game
    if (uiSolEl && walletSolBalance > 0) {
        state.sol = walletSolBalance;
        uiSolEl.innerText = state.sol.toFixed(4);
    }
    
    // Calculate estate value
    const estateValue = state.oil * state.world.price + state.hopper * 0.5;
    const estateValueEl = document.getElementById('estate-value');
    if (estateValueEl) estateValueEl.innerText = `Estate Value: ${estateValue.toFixed(2)} SOL`;
    
    render();
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
// WALLET CONNECTION (Real Phantom Wallet)
// ============================================================

async function connectWallet() {
    try {
        // Check if Phantom is installed
        const provider = window.phantom?.solana || window.solana;
        
        if (!provider) {
            showToast("Please install Phantom wallet!", true);
            window.open("https://phantom.app/", "_blank");
            return;
        }
        
        // Connect to wallet
        const response = await provider.connect();
        const walletAddress = response.publicKey.toBase58();
        
        currentUser = {
            wallet: walletAddress,
            type: 'wallet',
            display: walletAddress.slice(0, 8) + '...'
        };
        
        // Store in localStorage
        localStorage.setItem('walletAddress', walletAddress);
        
        // Update UI
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
        
        // Fetch wallet balances
        await updateWalletBalancesUI();
        
        // Load saved game
        await loadGameFromCloud();
        
    } catch (err) {
        console.error("Wallet connection error:", err);
        showToast("Failed to connect wallet", true);
    }
}

// ============================================================
// REFRESH BALANCES
// ============================================================

async function refreshBalances() {
    if (!currentUser) {
        showToast("Connect wallet first!", true);
        return;
    }
    
    showToast("Refreshing balances...");
    await updateWalletBalancesUI();
    showToast("Balances updated!");
    
    // Sync with cloud
    if (currentUser) await saveGameToCloud();
}

// ============================================================
// DISCONNECT FUNCTION
// ============================================================

function handleDisconnect() {
    currentUser = null;
    
    // Update UI
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
    
    // Reset game to default SOL but keep progress
    if (uiSolEl && state.sol === walletSolBalance) {
        state.sol = 25;
        uiSolEl.innerText = state.sol.toFixed(2);
    }
    
    showToast('🔒 Disconnected.');
    log('Disconnected from profile.');
    render();
}

// ============================================================
// EMAIL LOGIN (Mock - integrate with your auth)
// ============================================================

async function emailLogin() {
    // This should integrate with your existing email auth
    const mockEmail = 'steward@olivium.io';
    currentUser = {
        email: mockEmail,
        wallet: 'email_' + Date.now(),
        type: 'email',
        display: mockEmail.slice(0, 10) + '...'
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
// REST OF YOUR GAME STATE AND FUNCTIONS
// (Keep all your existing game functions - buyTree, interactTree, pressMill, etc.)
// ============================================================

// [All your existing game functions go here - they remain the same]
// Including: state object, getRarity, showToast, log, addCombo, 
// buyTree, interactTree, pressMill, cleanMill, upgrade, unlockSkill, 
// sellOil, sprayGrove, prestige, checkAchievements, checkQuest, 
// gameLoop, weatherCycle, marketCycle, render, openPanel, closePanel

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
        cleanMill, prestige, buyTree, sprayGrove, sellOil, pressMill 
    };
    window.closePanel = closePanel;
    
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
