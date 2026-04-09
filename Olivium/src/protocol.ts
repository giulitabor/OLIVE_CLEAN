import './polyfill';
import { Buffer } from "buffer";
import { PublicKey, Connection } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Oracle } from './or1';

// --- CONFIG & STATE ---
const OLV_MINT = new PublicKey("DYmefEbHQXyQfGQDCKQfVwuR4ZvjXSkVv3N76NEJHaKa");
const connection = new Connection("http://127.0.0.1:8899", "confirmed");

const state = {
    totalStakedOlv: 0,
    treeSharesLocked: 0,
    olvBalance: "0",
    currentPpm: 412,
    accruedRevenue: 13.00,
    allProposals: [] as any[],
    userVoteRecords: [] as string[],
    activeTab: 'telemetry'
};
async function fetchWithDebug() {
    console.group("🚀 HEAVY DEBUG: FETCHING PROTOCOL DATA");

    const wallet = (window as any).solana?.publicKey;
    if (!wallet) {
        console.error("❌ DEBUG: No wallet found. Connect Phantom first.");
        console.groupEnd();
        return;
    }
    console.log("📍 Wallet Address:", wallet.toBase58());

    try {
        // --- 1. SOL BALANCE ---
        const sol = await program.provider.connection.getBalance(wallet);
        console.log("💰 Raw SOL (Lamports):", sol);
        console.log("💰 Formatted SOL:", sol / 1e9);

        // --- 2. LIQUID OLV (ATA) ---
        try {
            const ata = getAssociatedTokenAddressSync(OLV_MINT, wallet);
            console.log("📂 Derived ATA:", ata.toBase58());
            const bal = await program.provider.connection.getTokenAccountBalance(ata);
            console.log("🍃 OLV Token Data:", bal.value);
        } catch (e) {
            console.warn("⚠️ ATA Fetch Failed: User likely has 0 liquid OLV.");
        }

        // --- 3. STAKED OLV (StakeAccount PDA) ---
        console.group("🗳️ STAKE ACCOUNT DEBUG");
        const [stakePda] = PublicKey.findProgramAddressSync(
            [Buffer.from("stake"), wallet.toBuffer()],
            program.programId
        );
        console.log("🔗 Derived Stake PDA:", stakePda.toBase58());

        const stakeAccount = await program.account.stakeAccount.fetchNullable(stakePda);
        if (stakeAccount) {
            console.log("✅ StakeAccount Found:", stakeAccount);
            console.log("📊 Staked Amount (Raw):", stakeAccount.amount?.toString());
        } else {
            console.error("❌ No StakeAccount found on-chain for this PDA.");
        }
        console.groupEnd();

        // --- 4. TREE POSITIONS ---
        console.group("🌲 TREE POSITIONS DEBUG");
        console.log("🔍 Searching with Memcmp (Offset 8):", wallet.toBase58());

        const positions = await program.account.treePosition.all([
            { memcmp: { offset: 8, bytes: wallet.toBase58() } }
        ]);

        console.log(`🔎 Found ${positions.length} Tree Positions`);
        positions.forEach((p, i) => {
            console.log(`  Tree [${i}]:`, {
                pda: p.publicKey.toBase58(),
                shares: p.account.shares?.toString(),
                locked: p.account.lockedShares?.toString()
            });
        });
        console.groupEnd();

        // --- 5. GOVERNANCE PROPOSALS ---
        const props = await program.account.proposal.all();
        console.log(`📋 Total Proposals on Program: ${props.length}`);

    } catch (err: any) {
        console.error("⛔ CRITICAL ERROR DURING FETCH:");
        console.dir(err);
    }

    console.groupEnd();
}

// --- DATA FETCHING ---
async function refreshAllData() {
    const wallet = (window as any).solana?.publicKey;
    if (!wallet) return;

    log(`Fetching data for: ${wallet.toBase58().slice(0,8)}...`);

    try {
        // 1. SOL Balance
        const sol = await program.provider.connection.getBalance(wallet);
        const solVal = sol / 1e9;
        log(`SOL Balance: ${solVal.toFixed(4)}`);

        // 2. Stake Account [Rule 2026-03-09]
        const [stakePda] = PublicKey.findProgramAddressSync(
            [Buffer.from("stake"), wallet.toBuffer()],
            program.programId
        );
        log(`Stake PDA: ${stakePda.toBase58()}`);

        const stakeAccount = await program.account.stakeAccount.fetchNullable(stakePda);
        const stakedAmount = stakeAccount ? (stakeAccount.amount.toNumber() / 1e9) : 0;
        log(`Staked OLV: ${stakedAmount}`);

        // 3. Tree Positions [gov.ts filtering logic]
        const positions = await program.account.treePosition.all([
            { memcmp: { offset: 8, bytes: wallet.toBase58() } }
        ]);
        const treeShares = positions.reduce((acc, p) => acc + (p.account.shares?.toNumber() || 0), 0);
        log(`Tree Positions: ${positions.length} (Shares: ${treeShares})`);

        renderUI({
            sol: solVal,
            staked: stakedAmount,
            trees: positions.length,
            shares: treeShares,
            address: wallet.toBase58()
        });

    } catch (err: any) {
        log(`FETCH ERROR: ${err.message}`, true);
    }
}

// --- UI RENDERING ---
function renderUI(data: any) {
    const display = document.getElementById('data-display');
    const btn = document.getElementById('connectBtn');

    if (btn) {
        btn.innerText = `● ${data.address.slice(0,4)}...${data.address.slice(-4)}`;
        btn.className = "pill pill-g";
    }

    if (display) {
        display.innerHTML = `
            <div class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <div class="bg-white/5 p-4 rounded-2xl border border-white/5">
                        <div class="text-[9px] text-gray-500 uppercase">Solana Balance</div>
                        <div class="text-xl font-bold">${data.sol.toFixed(3)} <span class="text-[10px] opacity-30 font-normal">SOL</span></div>
                    </div>
                    <div class="bg-white/5 p-4 rounded-2xl border border-white/5">
                        <div class="text-[9px] text-gray-500 uppercase">Staked OLV</div>
                        <div class="text-xl font-bold text-teal-400">${data.staked.toLocaleString()}</div>
                    </div>
                </div>

                <div class="bg-teal-500/5 p-6 rounded-[2rem] border border-teal-500/20">
                    <div class="flex justify-between items-center mb-4">
                        <span class="text-[10px] font-bold text-teal-500 uppercase tracking-widest">Active Tree Positions</span>
                        <span class="bg-teal-500 text-black text-[9px] px-2 py-0.5 rounded font-bold">${data.trees}</span>
                    </div>
                    <div class="flex justify-between items-end">
                        <div>
                            <div class="text-2xl font-black">${data.shares.toLocaleString()}</div>
                            <div class="text-[8px] text-gray-500 uppercase mt-1">Total Locked Shares</div>
                        </div>
                        <div class="text-right">
                            <div class="text-sm font-bold text-white">x${(1 + (data.staked / 5000)).toFixed(2)}</div>
                            <div class="text-[8px] text-gray-500 uppercase">Power Multiplier</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}
// Attach to window so you can trigger it manually via console
(window as any).debugFetch = fetchWithDebug;
window.addEventListener('load', fetchWithDebug);
// --- EXPOSE TO WINDOW ---
(window as any).handleWalletConnect = async () => {
    try {
        const solana = (window as any).solana;
        if (!solana) {
            log("No wallet detected", true);
            return;
        }
        await solana.connect();
        log("Wallet connected successfully");
        await refreshAllData();
    } catch (err: any) {
        log(`Connection failed: ${err.message}`, true);
    }
};

// Auto-run on load if already connected
window.addEventListener('load', refreshAllData);
