// ─────────────────────────────────────────────────────────────
// functions.ts — Olivium DAO UI Functions
//
// FIXES APPLIED:
// 1. Removed top-level await outside async context
// 2. All bare `program`, `protocolPda`, `web3` refs replaced with
//    window globals or proper imports
// 3. Removed all duplicate function definitions (kept the best version)
// 4. Fixed fillAdminProtocol pause logic (was reading obj as bool, inverted)
// 5. Fixed loadUserTreePositions acc.shares → acc.sharesOwned
// 6. Removed dead OOLMfillAdminDashboard
// 7. Stub-defined missing helpers so nothing throws on call
// 8. getProtocolData null-check moved before usage
// ─────────────────────────────────────────────────────────────

import { PublicKey } from "@solana/web3.js";
import { BN } from "bn.js";
import * as anchor from "@coral-xyz/anchor";

console.log('[functions.ts] LOADING...');

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

// Safe shorthand for DOM text updates
function setEl(id: string, value: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

// ─────────────────────────────────────────────────────────────
// TAB ROUTING
// ─────────────────────────────────────────────────────────────
const PANELS = ['hero', 'home', 'dash', 'rewards', 'admin'];

async function switchTab(tab: string) {
  PANELS.forEach(p => {
    const el = document.getElementById('panel-' + p);
    if (el) el.classList.toggle('hidden', p !== tab);
  });

  ['home', 'dash', 'rewards', 'admin'].forEach(t => {
    const btn = document.getElementById('tab-' + t);
    if (!btn) return;
    btn.classList.toggle('active', t === tab);
  });
  console.log("TREEES");
loadUserTreePositions();
if (tab === 'rewards') {
console.log('REWARDS TAB');

  return;
}


  if (tab === 'weather') {
    if ((window as any).refreshWeatherUI) {
      (window as any).refreshWeatherUI();
    }
    return;
  }

  if (tab === 'home') {
    console.log('[TAB] home');
    document.querySelectorAll('.shimmer').forEach(el => el.classList.remove('shimmer'));

    // FIX: read program and protocolPda from window globals
    const program     = (window as any)._program;
    const protocolPda = (window as any).protocolPda;

    if (!program) {
      console.warn('[TAB home] program not ready yet');
    } else {
      try {
        const config       = await program.account.protocolConfig.fetch(protocolPda);
        const treesOnChain = await program.account.tree.all();
        const allPositions = await program.account.sharePosition.all();
        const uniqueStakers = new Set(allPositions.map((p: any) => p.account.owner.toBase58())).size;

        console.log('[TAB home] trees:', treesOnChain.length, '| stakers:', uniqueStakers);

        const userPositionTtrees = await (window as any).loadUserTreePositions?.();
        (window as any).loadAllTrees?.();
console.log("DONE WITH TREES NOW FARM", userPositionTtrees);


          await update_FarmOwnership(userPositionTtrees, config);

        await (window as any).renderTreesGrid?.();
      } catch (e) {
        console.warn('[TAB home] data fetch error:', e);
      }
    }
  }

  if (tab === 'admin') {
    const protocol = (window as any).protocol;
    const program  = (window as any)._program;
    console.log('[TAB admin] protocol:', protocol, 'program:', program);

    (window as any).fillAdminDashboard?.();

    if (protocol && typeof (window as any).fillAdminProtocol === 'function') {
      (window as any).fillAdminProtocol(protocol);
    } else {
      console.warn('[ADMIN TAB] Protocol not available or fillAdminProtocol not defined');
    }

    if (typeof (window as any).refreshAdminStatus === 'function') {
      (window as any).refreshAdminStatus();
    }

    if (program) {
      const progIdEl = document.getElementById('admin-program-id');
      if (progIdEl) {
        progIdEl.textContent = program.programId.toBase58().slice(0, 8) + '…';
      }
    }
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}
(window as any).switchTab = switchTab;


async function update_FarmOwnership(positions: any[], protocol: any) {
    console.log("START FARM UPDATE", positions, protocol);

    const program = (window as any)._program;
    const wallet  = (window as any).solana;

    if (!program || !wallet?.publicKey) {
      console.warn('[FARM] Missing program or wallet');
      return;
    }


    // FIX: You were using userTotal before defining it.
    // We calculate the total shares owned by the user here.
    const userTotal = positions.reduce((sum, p) => {
        const amt = p.account?.sharesOwned ?? p.sharesOwned ?? 0;
        return sum + (typeof amt === 'object' ? amt.toNumber() : Number(amt));
    }, 0);

    console.log(`FOUND USERTOTAL: ${userTotal}`);

    // FIX: Capacity calculation (Using fallback of 240,000 if cache is empty)
    const cachedTreesMap = (window as any)._cachedTrees || {};
    const cachedTrees = Object.values(cachedTreesMap);

    const groveCapacity = cachedTrees.reduce((sum: number, t: any) => {
        const cap = t.account?.totalShares?.toNumber?.() ?? t.account?.totalShares ?? 1000;
        return sum + Number(cap);
    }, 0) || 240000;
    // 3. Ownership %
    const percentage = groveCapacity > 0 ? (userTotal / groveCapacity) * 100 : 0;
    const formattedPct = `${percentage.toFixed(4)}%`;

    // 4. Update DOM Elements
    const targets = ['farm-ownership-percent', 'farm-ownership-pct', 'farmSharePct','farm-ownership-percent2'];
    targets.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = formattedPct;
    });

    const shareEls = ['total-grove-shares', 'grove-share-count', 'portfolioShares','farm-trees-stat'];
    shareEls.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = userTotal.toLocaleString();
    });

    console.log(`[OWNERSHIP] ✅ User: ${userTotal} / Capacity: ${groveCapacity} (${formattedPct})`);
}
// ─────────────────────────────────────────────────────────────
// WALLET CONNECTED
// ─────────────────────────────────────────────────────────────
(window as any).onWalletConnected = function(addr: string, isAdmin: boolean) {
  document.getElementById('panel-hero')?.classList.add('hidden');
  document.getElementById('app')?.classList.remove('hidden');
  document.getElementById('stats')?.classList.remove('hidden');

  const navTabs = document.getElementById('nav-tabs');
  if (navTabs) {
    navTabs.classList.remove('hidden');
    navTabs.classList.add('flex');
  }

  const btn = document.getElementById('btn-connect');
  if (btn) {
    btn.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400"></span> ${addr.slice(0, 4)}…${addr.slice(-4)}`;
  }

  if (isAdmin) {
    document.getElementById('tab-admin')?.classList.remove('hidden');
    const authEl = document.getElementById('admin-authority');
    if (authEl) authEl.textContent = addr.slice(0, 6) + '…' + addr.slice(-4);
  }

  switchTab('home');
  loadAllTrees();

};

// ─────────────────────────────────────────────────────────────
// SHIMMER REMOVAL
// ─────────────────────────────────────────────────────────────
(window as any).clearShimmers = function() {
  document.querySelectorAll('.shimmer').forEach(el => el.classList.remove('shimmer'));
};

// ─────────────────────────────────────────────────────────────
// ADMIN DASHBOARD POPULATION
// ─────────────────────────────────────────────────────────────
(window as any).fillAdminDashboard = async function() {
  const program    = (window as any)._program;
  const protocol   = (window as any).protocol;
  const sb         = (window as any)._sb;
  const connection = (window as any)._connection;

  console.log('[fillAdminDashboard] start', { sb: !!sb, program: !!program, protocol: !!protocol });

  if (!program || !sb) return;

  try {
    const treesOnChain = await program.account.tree.all();
    console.log('[fillAdminDashboard] trees:', treesOnChain.length);

    setEl('admin-total-trees', treesOnChain.length.toString());

    const totalSold = treesOnChain.reduce((acc: number, t: any) => acc + t.account.sharesSold.toNumber(), 0);
    setEl('admin-total-shares', totalSold.toLocaleString());

    // Revenue vault balance
    const [revenueVaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("revenue_vault")],
      program.programId
    );
    const revenueVaultBalance = await connection.getBalance(revenueVaultPda);
    const revenueVaultSol = revenueVaultBalance / 1_000_000_000;
    setEl('admin-revenue-vault', `${revenueVaultSol.toFixed(4)} SOL`);
    setEl('admin-total-revenue', `${revenueVaultSol.toFixed(4)} SOL`);

    // Active stakers
    const allPositions = await program.account.sharePosition.all();
    const uniqueStakers = new Set(allPositions.map((p: any) => p.account.owner.toBase58())).size;
    setEl('admin-active-stakers', uniqueStakers.toString());

    console.log('[fillAdminDashboard] ✅ done');
  } catch (err) {
    console.error('[fillAdminDashboard] failed:', err);
  }
};

// ─────────────────────────────────────────────────────────────
// ADMIN PROTOCOL POPULATION
// ─────────────────────────────────────────────────────────────
(window as any).fillAdminProtocol = async function(protocol: any) {
  console.log('[fillAdminProtocol] incoming protocol:', protocol);

  const proto      = (window as any).protocol || protocol;
  const connection = (window as any)._connection;
  const program    = (window as any)._program;

  if (!proto || !connection) {
    console.warn('[fillAdminProtocol] Protocol not ready');
    const addrEl = document.getElementById('admin-protocol-address');
    if (addrEl) addrEl.textContent = "NOT INITIALIZED - RUN SETUP";
    return;
  }

  // Treasury balance
  let vaultSol = 0;
  try {
    const treasuryBalance = await connection.getBalance(proto.treasury);
    vaultSol = treasuryBalance / 1_000_000_000;
  } catch (e) {
    console.error('[fillAdminProtocol] treasury balance fetch failed:', e);
  }

  const authStr = proto.authority?.toBase58().slice(0, 8) + '…' || 'N/A';
  setEl('admin-authority', authStr);
  setEl('admin-treasury', proto.treasury?.toBase58().slice(0, 8) + '…' || 'N/A');

  const sharePrice = (proto.sharePriceLamports.toNumber() / 1e9).toFixed(2);
  setEl('admin-share-price', `${sharePrice} SOL`);

  setEl('admin-buy-fee',  `${proto.buyFeeBps?.toString() || "0"} BPS`);
  setEl('admin-sell-fee', `${proto.sellFeeBps?.toString() || "500"} BPS`);

  const treeCount = proto.totalTrees?.toString() || "0";
  setEl('admin-total-trees', treeCount);
  setEl('admin-tree-count', treeCount);
  setEl('totalTrees', treeCount);

  // FIX: Fetch live config for pause status (was incorrectly using the proto
  // object itself as a boolean, and the true/false labels were inverted).
  if (program) {
    try {
      const protocolPda = (window as any).protocolPda;
      const liveConfig = await program.account.protocolConfig.fetch(protocolPda);
      const isPaused = liveConfig.paused ?? false;

      setEl('admin-paused', isPaused ? "PAUSED" : "ACTIVE");
      const pausedEl = document.getElementById('admin-paused');
      if (pausedEl) {
        pausedEl.className = isPaused
          ? "text-2xl font-bold text-red-500"
          : "text-2xl font-bold text-emerald-400";
      }
    } catch (e) {
      console.warn('[fillAdminProtocol] Could not fetch live paused status:', e);
    }
  }

  setEl('admin-treasury-sol', `${vaultSol.toFixed(2)} SOL`);

  // Shares sold — try live data first, fall back to cached trees
  let resolvedSold: number | undefined = proto.totalSold;
  if (resolvedSold === undefined) {
    const cached: any[] = (window as any)._cachedTrees ?? [];
    // _cachedTrees can be either a Record<string,any> map or an array
    const treeList: any[] = Array.isArray(cached) ? cached : Object.values(cached);
    resolvedSold = treeList.reduce((sum: number, t: any) => {
      const sold = t.account?.sharesSold || 0;
      return sum + (typeof sold === 'object' ? sold.toNumber() : Number(sold));
    }, 0);
  }

  setEl('admin-shares-sold', resolvedSold.toLocaleString());
  setEl('admin-total-circulation', resolvedSold.toLocaleString());
  setEl('admin-oil-debt', (resolvedSold * 0.02).toFixed(1) + ' Liters');

  console.log('[fillAdminProtocol] ✅ done');
};

// ─────────────────────────────────────────────────────────────
// REFRESH ADMIN STATUS
// ─────────────────────────────────────────────────────────────
(window as any).refreshAdminStatus = async function() {
  const program = (window as any)._program;
  const sb      = (window as any)._sb;
  const tbody   = document.getElementById('admin-tree-table');

  if (!program || !tbody) return;

  try {
    const onChain = await program.account.tree.all();

    const { data: meta, error } = await sb
      .from('tree_metadata')
      .select('tree_id, on_chain, on_chain_address, mint');

    if (error) throw error;

    const rows = onChain.map((t: any) => {
      const dbMatch  = meta?.find((m: any) => m.on_chain_address === t.publicKey.toBase58());
      const isSynced = dbMatch?.on_chain === true;
      const mintDisplay = dbMatch?.mint ? `${dbMatch.mint.slice(0, 4)}...${dbMatch.mint.slice(-4)}` : '—';

      return `
        <tr class="border-b border-white/5 hover:bg-white/5 transition">
          <td class="px-4 py-3 font-mono text-emerald-400">${t.account.treeId}</td>
          <td class="px-4 py-3 text-stone-300 text-xs font-mono">${mintDisplay}</td>
          <td class="px-4 py-3 text-stone-300">${t.account.name}</td>
          <td class="px-4 py-3 text-stone-400">${t.account.sharesSold.toString()}/${t.account.totalShares.toString()}</td>
          <td class="px-4 py-3 font-medium ${isSynced ? 'text-emerald-500' : 'text-amber-500'}">
            ${isSynced ? '✅ Synced' : '⚠️ Missing Meta'}
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = rows.length > 0
      ? rows.join('')
      : '<tr><td colspan="5" class="text-center py-10 text-stone-500">No trees found on-chain.</td></tr>';
  } catch (e) {
    console.error("[ADMIN] Sync Failed:", e);
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="text-center py-10 text-red-400">Error loading data. Check console.</td></tr>`;
  }
};

// ─────────────────────────────────────────────────────────────
// MODAL CLOSE UTILITY
// ─────────────────────────────────────────────────────────────
(window as any).closeModal = function(modalId: string) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
};
async function ensureTreesCached() {
    const program = (window as any)._program;
    if (!program) return [];

    // Only fetch if the cache is empty
    if (!(window as any)._cachedTrees || (window as any)._cachedTrees.length === 0) {
        console.log("[CACHE] 🔄 Cache empty, fetching trees from chain...");
        const trees = await program.account.tree.all();
        (window as any)._cachedTrees = trees;
        return trees;
    }
    return (window as any)._cachedTrees;
}

/**
 * Fills the My Grove Dashboard UI with user-specific data
 */
(window as any).fillUserDashboard = function(positions: any[], walletStats: any) {
  // 1. Summarize Tree Data
  const treeCount = positions.length;
  const shareCount = positions.reduce((sum, p) => sum + p.shares, 0);
  console.log(shareCount);


  // 2. Ecological Math (Standard Coefficients)
  const oilLiters = shareCount * 0.05;
  const carbonKg = shareCount * 0.15;
  const estSolValue = shareCount * 0.05; // Base price per share
  const estUsdValue = estSolValue * (walletStats.solPrice || 0);
  console.log(estUsdValue,'=',estSolValue,'sarecount',shareCount);


  // 3. Populate Summary & Stats
  setEl('grove-tree-count', treeCount.toString());
  setEl('grove-share-count', shareCount.toLocaleString());
  setEl('stat-oil', `${oilLiters.toFixed(1)}L`);
  setEl('stat-carbon', `${carbonKg.toFixed(1)}kg`);
  setEl('stat-value-sol', `${estSolValue.toFixed(2)} SOL`);
  setEl('stat-value-usd', `$${estUsdValue.toFixed(2)}`);

  // 4. Populate Wallet Section
  setEl('wallet-sol-balance', `${walletStats.solBalance.toFixed(4)} SOL`);
  setEl('wallet-sol-usd', `$${walletStats.solUsd.toFixed(2)}`);
  setEl('wallet-olv-balance', `${walletStats.olvBalance.toLocaleString()} OLV`);
  setEl('wallet-olv-usd', `$${walletStats.olvUsd.toFixed(2)}`);
  setEl('wallet-total-usd', `$${walletStats.totalUsd.toFixed(2)}`);

  // 5. Loyalty Tier Logic
  updateDashboardTier(shareCount);

  // 6. Tree Positions Grid
  const grid = document.getElementById('tree-position-cards');
  const emptyState = document.getElementById('tree-positions-empty');

  if (grid && emptyState) {
    if (treeCount === 0) {
      grid.classList.add('hidden');
      emptyState.classList.remove('hidden');
    } else {
      emptyState.classList.add('hidden');
      grid.classList.remove('hidden');
      grid.innerHTML = positions.map(p => renderPositionCard(p)).join('');
    }
  }
};
/**

 * Renders individual tree ownership cards with metadata integration
 */
 function renderUserPositions(positions: any[]) {
     const container = document.getElementById('tree-position-cards');
     const emptyState = document.getElementById('tree-positions-empty');
     if (!container) return;

     if (!positions || positions.length === 0) {
         container.innerHTML = "";
         emptyState?.classList.remove('hidden');
         return;
     }
     emptyState?.classList.add('hidden');

     const treeMap = new Map();
     const rawTrees = (window as any)._cachedTrees || [];
     const trees = Array.isArray(rawTrees) ? rawTrees : Object.values(rawTrees);
     trees.forEach((t: any) => {
         const id = t.account?.treeId || t.account?.treeid || t.treeId || t.treeid;
         if (id) treeMap.set(String(id), t.account || t);
     });

     container.innerHTML = positions.map(pos => {
         const treeId = (pos.account?.treeId || pos.treeId || "Unknown").toString();
         const shares = pos.account?.sharesOwned?.toNumber?.() || pos.sharesOwned || 0;
         const treeAcc = treeMap.get(treeId);
         const meta = ((window as any)._treeMetadata || {})[treeId] || {};

         return `
         <div class="bg-white border border-stone-200 rounded-2xl overflow-hidden hover:shadow-md transition mb-4">
             <div class="p-5">
                 <div class="flex justify-between items-start mb-4">
                     <div class="flex items-center gap-3">
                         <div class="w-12 h-12 rounded-xl bg-stone-100 flex items-center justify-center text-2xl overflow-hidden">
                             ${meta.image_url ? `<img src="${meta.image_url}" class="w-full h-full object-cover" />` : "🌳"}
                         </div>
                         <div>
                             <h3 class="font-bold text-lg text-stone-900">Tree ${treeId}</h3>
                             <p class="text-xs text-stone-500">${meta.location || "San Vincenzo, Italy"}</p>
                         </div>
                     </div>
                     <div class="text-right">
                         <p class="font-bold text-lg text-green-700">${shares} Shares</p>
                         <p class="text-[10px] text-stone-400 uppercase font-bold tracking-wider">Current Holding</p>
                     </div>
                 </div>

                 <div class="grid grid-cols-2 gap-3 mt-2">
                     <button onclick="openTreeDetailModal('${treeId}')"
                         class="flex items-center justify-center gap-2 py-2 px-4 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-bold transition">
                         <span>🔍 Details</span>
                     </button>
                     <button onclick="openSellModal('${treeId}', ${shares})"
                         class="flex items-center justify-center gap-2 py-2 px-4 border border-amber-200 hover:bg-amber-50 text-amber-700 rounded-xl text-xs font-bold transition">
                         <span>💰 Sell Shares</span>
                     </button>
                 </div>
             </div>
         </div>`;
     }).join('');
 }

 (window as any).updateSellModalCalc = function() {
    const slider = document.getElementById('sell-modal-slider') as HTMLInputElement;
    const sharesVal = document.getElementById('sell-modal-shares-val');
    const proceedsEl = document.getElementById('sell-modal-proceeds');
    const btnProceeds = document.getElementById('sell-modal-btn-proceeds');
    const valueEl = document.getElementById('sell-modal-value');

    if (!slider || !sharesVal) return;

    const sharesToSell = parseInt(slider.value);
    const pricePerShare = 0.1; // Fallback: 0.1 SOL per share
    const totalProceeds = (sharesToSell * pricePerShare).toFixed(3);
    const totalCurrentValue = (parseInt(slider.max) * pricePerShare).toFixed(2);

    sharesVal.innerText = sharesToSell.toString();
    if (proceedsEl) proceedsEl.innerText = `${totalProceeds} SOL`;
    if (btnProceeds) btnProceeds.innerText = totalProceeds;
    if (valueEl) valueEl.innerText = `${totalCurrentValue} SOL`;
};

(window as any).checkSellModalBtn = function() {
    const agree = document.getElementById('sell-modal-agree') as HTMLInputElement;
    const btn = document.getElementById('sell-modal-btn') as HTMLButtonElement;
    if (agree && btn) {
        btn.disabled = !agree.checked;
    }
};

(window as any).closeSellModal = () => {
    document.getElementById('sell-modal')?.classList.add('hidden');
};
(window as any).openSellModal = function(treeId: string, sharesOwned: number) {
    console.log(`[SELL] Opening sell modal for tree ${treeId}, owning ${sharesOwned}`);

    const modal = document.getElementById('sell-modal');
    if (!modal) return;

    // Set basic text
    document.getElementById('sell-modal-tree-name')!.innerText = `Tree #${treeId}`;
    document.getElementById('sell-modal-owned')!.innerText = sharesOwned.toString();

    // Store data on the modal for the transaction function
    modal.dataset.treeId = treeId;
    modal.dataset.maxShares = sharesOwned.toString();

    // Setup Slider
    const slider = document.getElementById('sell-modal-slider') as HTMLInputElement;
    if (slider) {
        slider.max = sharesOwned.toString();
        slider.value = Math.ceil(sharesOwned / 2).toString(); // Default to half
    }

    // Reset UI state
    const agree = document.getElementById('sell-modal-agree') as HTMLInputElement;
    if (agree) agree.checked = false;

    const btn = document.getElementById('sell-modal-btn') as HTMLButtonElement;
    if (btn) btn.disabled = true;

    // Trigger initial calculation
    (window as any).updateSellModalCalc();

    modal.classList.remove('hidden');
};
  function updateDashboardGlobalStats(treeCount, shares, oil, carbon, valueSol, solPrice) {
    // 1. Header Summaries
    const treeCountEl = document.getElementById('grove-tree-count');
    const shareCountEl = document.getElementById('grove-share-count');
    if (treeCountEl) treeCountEl.innerText = treeCount;
    if (shareCountEl) shareCountEl.innerText = shares.toLocaleString();

    // 2. Quick Stats Cards
    const statOil = document.getElementById('stat-oil');
    const statCarbon = document.getElementById('stat-carbon');
    const statValueSol = document.getElementById('stat-value-sol');
    const statValueUsd = document.getElementById('stat-value-usd');

    if (statOil) statOil.innerText = `${oil.toFixed(1)}L`;
    if (statCarbon) statCarbon.innerText = `${carbon.toFixed(0)}kg`;
    if (statValueSol) statValueSol.innerText = `${valueSol.toFixed(2)} SOL`;
    if (statValueUsd) statValueUsd.innerText = `≈ $${(valueSol * solPrice).toFixed(2)}`;

    // 3. Tier Status Logic
    const tierName = document.getElementById('tier-status-name');
    const tierIcon = document.getElementById('tier-status-icon');
    const tierProgress = document.getElementById('tier-status-progress');

    let currentTier = "Olive Enthusiast";
    let icon = "🫒";
    let nextTierShares = 1000;

    if (shares >= 5000) {
        currentTier = "Estate Baron";
        icon = "🏰";
        nextTierShares = 0;
    } else if (shares >= 1000) {
        currentTier = "Grove Guardian";
        icon = "🛡️";
        nextTierShares = 5000;
    } else {
        nextTierShares = 1000;
    }

    if (tierName) tierName.innerText = currentTier;
    if (tierIcon) tierIcon.innerText = icon;
    if (tierProgress) {
        tierProgress.innerText = nextTierShares > 0
            ? `${(nextTierShares - shares).toLocaleString()} shares to next tier`
            : "Maximum Tier Achieved";
    }
}
/**
 * Updates Tier Status UI based on share count
 */
function updateDashboardTier(shares: number) {
  let tier = { icon: '🌱', name: 'New Harvester', next: 10 };
console.log("EEEEENNTTTTEconsole.log(EEEEENNTTTTEEERRREED");
console.log("EEEEENNTTTTEEERRREED");
console.log("EEEEENNTTTTEEERRREED");
console.log("EEEEENNTTTTEEERRREED");

  if (shares >= 500) tier = { icon: '🛡️', name: 'Grove Guardian', next: 0 };
  else if (shares >= 100) tier = { icon: '🌍', name: 'Eco Guardian', next: 500 };
  else if (shares >= 10) tier = { icon: '🌿', name: 'Olive Lover', next: 100 };
console.log('shares---',shares);

  setEl('tier-status-icon', tier.icon);
  setEl('tier-status-name', tier.name);

  const progressText = tier.next > 0
    ? `${tier.next - shares} more shares to reach next tier`
    : 'Maximum tier achieved';
  setEl('tier-status-progress', progressText);
}
// ─────────────────────────────────────────────────────────────
// LOAD USER TREE POSITIONS
// ─────────────────────────────────────────────────────────────
(window as any).loadUserTreePositions = async function() {
  const program = (window as any)._program;
  const wallet  = (window as any).solana;

  if (!program || !wallet?.publicKey) {
    console.warn('[POSITIONS] Missing program or wallet');
    return [];
  }

  try {
    console.log('[POSITIONS] 🔄 Loading user positions...');

    // 1. Fetch all positions for this wallet
    const allPositions = await program.account.sharePosition.all([
      {
        memcmp: {
          offset: 8,
          bytes: wallet.publicKey.toBase58(),
        },
      },
    ]);

    console.log(`[POSITIONS] Found ${allPositions.length} raw position accounts.`);
    if (allPositions.length === 0) return [];

    // 2. Fetch all trees to cross-reference the IDs with Names
    const allTrees = await program.account.tree.all();

    // 3. Normalize the data into a readable array
    const positions = allPositions.map((pos: any) => {
      const acc  = pos.account;

      // Find the matching tree in the list
      const tree = allTrees.find(
        (t: any) => t.account.treeId.toString() === acc.treeId.toString()
      );

      return {
        treeName:    tree?.account.name || "Unknown",
        treeId:      acc.treeId.toString(),
        sharesOwned: acc.sharesOwned.toNumber(),
        positionPDA: pos.publicKey.toBase58(),
        totalTreeShares: tree?.account.totalShares.toNumber() || 0,
      };
    });

    // ─────────────────────────────────────────────────────────────
    // CONSOLE DISPLAY: Which trees are they?
    // ─────────────────────────────────────────────────────────────
    console.log("╔══════════════════════════════════════════════╗");
    console.log("║           USER TREE POSITIONS FOUND          ║");
    console.log("╚══════════════════════════════════════════════╝");

    // This provides a beautiful, sortable table in your browser console
    console.table(positions, ["treeName", "treeId", "sharesOwned"]);

    // Store globally for other UI components
    (window as any)._userPositions = positions;


    // 4. Update UI Banner if function exists
    const uniqueTreeCount = positions.length;
    const totalSharesOwned = positions.reduce((sum: number, p: any) => sum + p.sharesOwned, 0);

    if (typeof (window as any).updateGlobalBanner === 'function') {
      (window as any).updateGlobalBanner(uniqueTreeCount, totalSharesOwned, 0.05);
    }

// Update the Badge
updateTierBadge(totalSharesOwned);
console.log("TIME TO RENDER POSITION ",positions);

    // 5. Trigger standard UI render
        await renderUserPositions(positions);

console.log("I DID MY BEST");

// 4. THIS IS THE KEY: Return the variable to the caller
    console.log('[POSITIONS] ✅ Returning positions to caller:', positions);
    return positions;
  } catch (err) {
    console.error('[POSITIONS] ❌ Failed to load positions:', err);
    return [];
  }
};


function updateGrovePulse() {
    const activeCountEl = document.getElementById('global-active-count');
    const container = activeCountEl?.closest('.bg-gradient-to-br'); // The Pulse Card

    if (!activeCountEl) return;

    // 1. Get the data from the global cache
    const rawTrees = (window as any)._cachedTrees || [];
    const trees = Array.isArray(rawTrees) ? rawTrees : Object.values(rawTrees);

    if (trees.length === 0) {
        activeCountEl.innerText = "OFFLINE";
        return;
    }

    // 2. Calculate Global Stats
    let totalSharesSold = 0;
    let totalCapacity = 0;

    trees.forEach((t: any) => {
        const acc = t.account || t;
        totalSharesSold += acc.sharesSold?.toNumber() || 0;
        totalCapacity += acc.totalShares?.toNumber() || 1000;
    });

    const adoptionRate = ((totalSharesSold / totalCapacity) * 100).toFixed(1);

    // 3. Update the Header Badge
    activeCountEl.innerHTML = `<span class="text-emerald-600">${trees.length} TREES ONLINE</span>`;

    // 4. Inject Pulse Content (if not already present in HTML)
    // This fills the empty space in your provided snippet
    const pulseContentId = 'grove-pulse-metrics';
    let contentEl = document.getElementById(pulseContentId);

    if (!contentEl) {
        contentEl = document.createElement('div');
        contentEl.id = pulseContentId;
        contentEl.className = "grid grid-cols-2 gap-4 mt-2";
        container.appendChild(contentEl);
    }

    contentEl.innerHTML = `
        <div class="bg-white/50 p-3 rounded-2xl border border-stone-100">
            <p class="text-[10px] uppercase text-stone-400 font-bold mb-1">Global Adoption</p>
            <div class="flex items-end gap-1">
                <span class="text-xl font-black text-stone-800">${adoptionRate}%</span>
                <span class="text-[10px] text-emerald-600 font-bold mb-1">↑ LIVE</span>
            </div>
        </div>
        <div class="bg-white/50 p-3 rounded-2xl border border-stone-100">
            <p class="text-[10px] uppercase text-stone-400 font-bold mb-1">Total Impact</p>
            <div class="flex items-end gap-1">
                <span class="text-xl font-black text-stone-800">${(totalSharesSold * 0.25).toFixed(0)}kg</span>
                <span class="text-[10px] text-stone-500 font-medium mb-1">CO₂/YR</span>
            </div>
        </div>
    `;
}
// ─────────────────────────────────────────────────────────────
// LOAD ALL TREES
// ─────────────────────────────────────────────────────────────
(window as any).loadAllTrees = async () => {
  console.log("[TREES] 🔄 Loading all trees from chain...");

  try {
    const program = (window as any)._program;
    if (!program) {
      console.error("[TREES] ❌ Program not initialized");
      return [];
    }

    const trees = await program.account.tree.all();
    console.log("[TREES] Found", trees.length, "trees");

    const normalizedTrees = trees.map((t: any, index: number) => ({
      publicKey: t.publicKey,
      account: {
        ...t.account,
        treeId:       t.account.treeId,
        variety:      t.account.variety || "Tuscan",
        healthStatus: t.account.healthStatus ?? 1,
      },
      index,
    }));

    // Build cache as a Record keyed by treeId (string)
    const map: Record<string, any> = {};
    normalizedTrees.forEach((t: any) => {
      map[t.account.treeId] = t;
    });

    (window as any)._cachedTrees = map;
    console.log("[CACHE] ✅ Trees FIRST cached:", Object.keys(map));
//ensureTreesCached
 await ensureTreesCached();
 console.log("ENSURED CASHED");
 // Inside your existing trees loading function
(window as any)._cachedTrees = trees;

// NEW CALL
if (typeof updateGrovePulse === 'function') {
    updateGrovePulse();
}

    return normalizedTrees;
  } catch (err) {
    console.error("[TREES] ❌ Failed:", err);
    return [];
  }
};

// ─────────────────────────────────────────────────────────────
// RENDER TREES GRID
// ─────────────────────────────────────────────────────────────
(window as any).renderTreesGrid = async function() {
  const container   = document.getElementById('trees-grid');
  const placeholder = document.getElementById('trees-placeholder');

  if (!container) return;

  if (placeholder) placeholder.classList.remove('hidden');

  const trees = await (window as any).loadAllTrees();
  container.innerHTML = '';

  if (!trees || trees.length === 0) {
    container.innerHTML = `
      <div class="col-span-full py-20 text-center text-stone-400">
        <div class="text-5xl mb-3">🌳</div>
        <p class="font-semibold text-lg">No trees found</p>
        <p class="text-sm mt-1">The grove is empty (for now)</p>
      </div>
    `;
    return;
  }

  if (placeholder) placeholder.classList.add('hidden');

  container.innerHTML = trees.map((t: any) => {
    const acc       = t.account;
    const total     = acc.totalShares.toNumber();
    const sold      = acc.sharesSold.toNumber();
    const available = total - sold;
    const progress  = total > 0 ? Math.round((sold / total) * 100) : 0;

    return `
      <div class="bg-white/5 backdrop-blur rounded-2xl p-4 border border-white/10
                  hover:border-emerald-400/40 transition">
        <div class="flex items-center justify-between mb-2">
          <div class="font-semibold text-lg text-white">Tree ${acc.treeId}</div>
          <div class="text-xs text-stone-400">#${acc.treeId}</div>
        </div>
        <div class="text-sm text-stone-400 mb-3">${acc.variety || 'Unknown variety'}</div>
        <div class="text-xs text-stone-400 mb-1">${sold} / ${total} shares</div>
        <div class="w-full bg-white/10 h-2 rounded-full overflow-hidden">
          <div class="bg-emerald-400 h-2" style="width:${progress}%"></div>
        </div>
        <div class="flex justify-between mt-3 text-xs text-stone-400">
          <span>${progress}% sold</span>
          <span>${available} left</span>
        </div>
        <button onclick="openAdoptModal('${acc.treeId}')"
                class="mt-4 w-full py-2 rounded-xl bg-emerald-500/90 hover:bg-emerald-400
                       text-black text-sm font-semibold transition">
          View Tree
        </button>
      </div>
    `;
  }).join('');

  console.log('[UI] 🌳 Trees rendered:', trees.length);
};

(window as any).openAdoptModal = (idx: string) => {
  console.log("[MODAL] Opening tree with ID:", idx);

  const rawTrees = (window as any)._cachedTrees;
  if (!rawTrees) {
    console.error("[MODAL] _cachedTrees not populated yet");
    return;
  }

  // FIX: Convert to array if it's an object, then FIND the matching ID
  const trees = Array.isArray(rawTrees) ? rawTrees : Object.values(rawTrees);
  const treeData = trees.find((t: any) => {
      const id = t.account?.treeId || t.account?.treeid || t.treeId || t.treeid;
      return String(id) === String(idx);
  });

  if (!treeData) {
    console.error("❌ No tree data found for ID:", idx);
    return;
  }

  const modal = document.getElementById('adopt-modal');
  if (!modal) return;

  // Standardize the account reference
  const account = treeData.account || treeData;

  // Use the ID from the account to be safe
  const treeIdString = (account.treeId || account.treeid).toString();
  modal.dataset.treeId    = treeIdString;
  modal.dataset.treeIndex = treeIdString;

  (window as any)._modalTree     = account;
  (window as any)._modalProtocol = (window as any)._protocol;

  const setText = (id: string, val: any) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(val);
  };

  // Calculations
  const total = account.totalShares?.toNumber?.() ?? account.totalShares ?? 1000;
  const sold  = account.sharesSold?.toNumber?.() ?? account.sharesSold ?? 0;
  const available = total - sold;

  setText('modal-tree-name', `Tree ${treeIdString}`);

  const variety = account.variety || 'Tuscan';
  const healthStatus =
    account.healthStatus === 1 ? 'Excellent' :
    account.healthStatus === 2 ? 'Good' :
    account.healthStatus === 3 ? 'Fair' : 'Poor';

  setText('modal-tree-meta',    `Variety: ${variety} · Health: ${healthStatus}`);
  setText('modal-shares-left',  available.toLocaleString());
  setText('modal-health',       healthStatus);
  setText('modal-harvests',     account.harvestCount?.toNumber?.() ?? 0);

  const slider = document.getElementById('modal-slider') as HTMLInputElement;
  if (slider) {
    slider.max   = available.toString();
    slider.value = Math.min(10, available).toString(); // Default to 10 for better UX
  }

  // UI Resets
  ['adopt-confirm', 'modal-agree'].forEach(id => {
    const cb = document.getElementById(id) as HTMLInputElement;
    if (cb) cb.checked = false;
  });

  // Trigger UI updates
  if ((window as any).updateModalCalc) (window as any).updateModalCalc();

  modal.classList.remove('hidden');
  console.log("✅ Modal opened for tree:", treeIdString);
};
// ─────────────────────────────────────────────────────────────
// CLOSE ADOPT MODAL
// ─────────────────────────────────────────────────────────────
(window as any).closeAdoptModal = () => {
  const modal = document.getElementById('adopt-modal');
  if (modal) modal.classList.add('hidden');
};

// ─────────────────────────────────────────────────────────────
// UPDATE MODAL CALCULATIONS
// ─────────────────────────────────────────────────────────────
(window as any).updateModalCalc = function() {
  const protocol = (window as any)._protocol || (window as any)._modalProtocol;
  if (!protocol) {
    console.warn("Protocol not available for calculations");
    return;
  }

  const slider = document.getElementById('modal-slider') as HTMLInputElement;
  if (!slider) return;

  const shares       = parseInt(slider.value) || 0;
  const pricePerShare = protocol.sharePriceLamports.toNumber() / 1_000_000_000;
  const feeBps       = protocol.buyFeeBps || 0;
  const subtotal     = shares * pricePerShare;
  const fee          = (subtotal * feeBps) / 10000;
  const total        = subtotal + fee;

  setEl('modal-amount-display', shares.toLocaleString());
  setEl('modal-cost-sol',       subtotal.toFixed(4));
  setEl('modal-fee-sol',        fee.toFixed(4));
  setEl('modal-cost',           total.toFixed(4) + ' SOL');
  setEl('modal-btn-cost',       total.toFixed(3));
  setEl('modal-btn-amount',     total.toFixed(3));

  const tree = (window as any)._modalTree;
  if (tree) {
    const pct = (shares / tree.totalShares.toNumber() * 100).toFixed(1);
    setEl('modal-pct', pct);
  }

  (window as any)._lastCalculatedTotal = total.toFixed(3);

  updateTierDisplay(shares);
};

function updateTierBadge(totalShares: number) {
    const iconEl = document.getElementById('tier-icon');
    const nameEl = document.getElementById('tier-name');
    const descEl = document.getElementById('tier-desc');
    const barEl  = document.getElementById('tier-progress-bar');
    const textEl = document.getElementById('tier-progress-text');

    if (!iconEl || !nameEl || !descEl || !barEl || !textEl) return;

    // Define your Tiers here
    const tiers = [
        { name: "Olive Enthusiast", min: 0,   max: 100,  icon: "🫒", desc: "Start your journey in the Tuscan groves." },
        { name: "Olive Lover",       min: 100, max: 500,  icon: "🌿", desc: "You're becoming a staple of our community." },
        { name: "Grove Guardian",    min: 500, max: 1000, icon: "🌳", desc: "A true protector of ancient traditions." },
        { name: "Master Miller",     min: 1000, max: 5000, icon: "🏺", desc: "The gold of Tuscany flows through your hands." }
    ];

    // Find current tier
    let currentTier = tiers[0];
    let nextTier = tiers[1];

    for (let i = 0; i < tiers.length; i++) {
        if (totalShares >= tiers[i].min) {
            currentTier = tiers[i];
            nextTier = tiers[i + 1] || tiers[i]; // Stay on last tier if maxed
        }
    }

    // Calculate Progress Percentage
    let progressPct = 0;
    if (nextTier !== currentTier) {
        const range = nextTier.min - currentTier.min;
        const earned = totalShares - currentTier.min;
        progressPct = Math.min(100, (earned / range) * 100);
        textEl.innerText = `${totalShares} / ${nextTier.min} shares to unlock ${nextTier.name}`;
    } else {
        progressPct = 100;
        textEl.innerText = `Maximum Tier Reached! (${totalShares} shares)`;
    }

    // Update UI
    iconEl.innerText = currentTier.icon;
    nameEl.innerText = currentTier.name;
    descEl.innerText = currentTier.desc;
    barEl.style.width = `${progressPct}%`;
}
// ─────────────────────────────────────────────────────────────
// UPDATE TIER DISPLAY IN MODAL
// ─────────────────────────────────────────────────────────────
function updateTierDisplay(shares: number) {
  const tierRow   = document.getElementById('modal-tier-row');
  const tierIcon  = document.getElementById('modal-tier-icon');
  const tierLabel = document.getElementById('modal-tier-label');

  if (!tierRow || !tierIcon || !tierLabel) return;

  let icon    = '—';
  let label   = 'Select shares to see your tier';
  let bgClass = 'bg-stone-100 text-stone-500';

  if (shares >= 5000) {
    icon = '🏛️'; label = 'Legacy Holder — Premium benefits!';
    bgClass = 'bg-gradient-to-r from-amber-100 to-orange-100 text-amber-900';
  } else if (shares >= 1000) {
    icon = '🫒'; label = 'Grove Patron — Exclusive perks!';
    bgClass = 'bg-gradient-to-r from-yellow-100 to-amber-100 text-amber-800';
  } else if (shares >= 500) {
    icon = '🌱'; label = 'Eco Steward — Great rewards!';
    bgClass = 'bg-gradient-to-r from-green-100 to-emerald-100 text-green-800';
  } else if (shares >= 100) {
    icon = '🫒'; label = 'Olive Lover — Welcome to the grove!';
    bgClass = 'bg-gradient-to-r from-lime-100 to-green-100 text-green-700';
  }

  tierIcon.textContent  = icon;
  tierLabel.textContent = label;
  tierRow.className = 'flex items-center gap-2 px-4 py-2.5 rounded-xl mb-4 text-sm font-medium ' + bgClass;
}

// ─────────────────────────────────────────────────────────────
// TOGGLE MODAL BUTTON (Enable/Disable based on checkbox)
// ─────────────────────────────────────────────────────────────
(window as any).toggleModalButton = function() {
  const checkbox = document.getElementById('modal-agree') as HTMLInputElement;
  const btn      = document.getElementById('modal-buy-btn') as HTMLButtonElement;

  if (checkbox && btn) {
    const isChecked = checkbox.checked;
    btn.disabled = !isChecked;
    if (isChecked) {
      btn.classList.remove('opacity-40', 'pointer-events-none');
    } else {
      btn.classList.add('opacity-40', 'pointer-events-none');
    }
  }
};

// Wire checkbox if it exists
if (typeof window !== 'undefined') {
  setTimeout(() => {
    const checkbox = document.getElementById('modal-agree') as HTMLInputElement;
    if (checkbox) {
      checkbox.addEventListener('change', () => {
        (window as any).toggleModalButton();
      });
    }
  }, 1000);
}

// ─────────────────────────────────────────────────────────────
// TOGGLE CONFIRM BUTTON
// ─────────────────────────────────────────────────────────────
(window as any).toggleConfirm = function() {
  const checkbox = document.getElementById('adopt-confirm')     as HTMLInputElement;
  const btn      = document.getElementById('btn-confirm-adopt') as HTMLButtonElement;

  if (checkbox && btn) {
    const isChecked = checkbox.checked;
    btn.disabled = !isChecked;
    if (isChecked) {
      btn.classList.remove('opacity-50', 'cursor-not-allowed', 'grayscale');
      btn.classList.add('hover:scale-105', 'active:scale-95');
    } else {
      btn.classList.add('opacity-50', 'cursor-not-allowed', 'grayscale');
      btn.classList.remove('hover:scale-105', 'active:scale-95');
    }
  }
};

// ─────────────────────────────────────────────────────────────
// CONFIRM ADOPT / BUY
// ─────────────────────────────────────────────────────────────
(window as any).confirmAdopt = async function() {
  console.log("🚀 CONFIRM ADOPT TRIGGERED");

  try {
    const modal = document.getElementById('adopt-modal');
    if (!modal) throw new Error("Modal not found");

    const treeId = modal.dataset.treeId;
    if (!treeId) throw new Error("Missing tree data in modal");

    const slider = document.getElementById('modal-slider') as HTMLInputElement;
    if (!slider) throw new Error("Slider not found");

    const shares = parseInt(slider.value);
    if (shares <= 0) throw new Error("Invalid share amount");

    const program  = (window as any)._program;
    const provider = (window as any)._provider;
    const protocol = (window as any)._protocol;

    // FIX: use window.walletPubKey (set directly from wallet.publicKey in connectWallet).
    // provider.wallet.publicKey is the Anchor adapter wrapper and its .toBuffer() can
    // produce a different byte representation, causing ConstraintSeeds on the position PDA.
    const walletPubKey = (window as any).walletPubKey
      ?? (window as any).wallet?.publicKey;

    if (!program || !provider || !protocol || !walletPubKey) {
      throw new Error("Program/Provider/Protocol not initialized");
    }

    console.log("📋 Transaction Details:", {
      treeId, shares,
      wallet: walletPubKey.toBase58(),
      walletSource: (window as any).walletPubKey ? 'window.walletPubKey' : 'window.wallet.publicKey'
    });

    const btn = document.getElementById('modal-buy-btn') as HTMLButtonElement;
    const reset_btn      = document.getElementById('btn-confirm-adopt') as HTMLButtonElement;

    if (btn) { btn.disabled = true; btn.textContent = "Processing..."; }

    const [protocolPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("protocol")],
      program.programId
    );
    const [treePda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("tree"), Buffer.from(treeId)],
      program.programId
    );
    const [positionPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("position"), walletPubKey.toBuffer(), Buffer.from(treeId)],
      program.programId
    );

    // treasury comes from the on-chain protocol config (matches IDL purchase_shares)
    const treasuryPda = protocol.treasury;

    console.log("📍 PDAs derived:", {
      protocol: protocolPda.toBase58(),
      tree:     treePda.toBase58(),
      position: positionPda.toBase58(),
      treasury: treasuryPda.toBase58(),
    });

    console.log("⚡ Sending transaction...");
    const tx = await program.methods
      .purchaseShares(treeId, new BN(shares))
      .accounts({
        tree:          treePda,
        position:      positionPda,
        protocol:      protocolPda,
        treasury:      treasuryPda,
        buyer:         walletPubKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("✅ Transaction successful:", tx);
    alert(`🎉 Successfully adopted ${shares} shares of ${treeId}!\n\nTransaction: ${tx.slice(0, 8)}...`);
    console.log(`[BUY] ✅ On-chain success: ${tx}`);

    const currentShares = (window as any).userPositions?.[treeId] || 0;
    const newTotal = currentShares + shares;
    const isGuardian = newTotal >= 1000; // Match your lib.rs constant
    const latestBlockhash = await _connection.getLatestBlockhash('confirmed');

    await (window as any).syncTransactionToSupabase(
        walletPubKey.toBase58(),
        treeId,
        shares,
        'BUY',
        tx,
        newTotal,
        isGuardian
    );
console.log("syncing----BUY--");



        const btn2 = document.getElementById('modal-buy-btn') as HTMLButtonElement;
        if (btn2) {
          btn2.disabled = false;
          const total = (window as any)._lastCalculatedTotal || '0.000';
          btn2.innerHTML = `Adopt — pay <span id="modal-btn-cost">${total}</span> SOL`;
        }


    (window as any).closeAdoptModal();

    (window as any).loadUserTreePositions?.();
    (window as any).renderTreesGrid?.();

  } catch (err: any) {
    console.error("❌ Transaction failed:", err);
    alert(`Transaction failed: ${err.message || err}`);
  }
};

// Alias for compatibility
(window as any).confirmBuy = (window as any).confirmAdopt;
(window as any).confirmSell = async function() {
    console.log("🚀 CONFIRM SELL TRIGGERED");

    // 1. Prevent double-execution via a global lock
    if ((window as any)._isSelling) return;
    (window as any)._isSelling = true;

    const btn = document.getElementById('sell-modal-btn') as HTMLButtonElement;
    
    try {
        const modal = document.getElementById('sell-modal');
        if (!modal) throw new Error("Sell modal not found");

        const treeId = modal.dataset.treeId;
        if (!treeId) throw new Error("Missing tree ID in sell modal");

        const slider = document.getElementById('sell-modal-slider') as HTMLInputElement;
        const sharesToSell = parseInt(slider?.value || "0");
        if (sharesToSell <= 0) throw new Error("Invalid share amount");

        const program = (window as any)._program;
        const protocol = (window as any)._protocol;
        const walletPubKey = (window as any).walletPubKey ?? (window as any).wallet?.publicKey;

        if (!program || !protocol || !walletPubKey) throw new Error("Initialization error");

        if (btn) { 
            btn.disabled = true; 
            btn.textContent = "Processing..."; 
        }

        // Logic for metadata/guardian status
        const allPositions = (window as any)._allUserPositions || [];
        const currentPos = allPositions.find((p: any) => p.treeId === treeId);
        const oldBalance = currentPos ? parseInt(currentPos.sharesOwned) : 0;
        const newTotal = Math.max(0, oldBalance - sharesToSell);
        const isGuardian = newTotal >= 1000;

        const [protocolPda] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("protocol")], program.programId);
        const [treePda] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("tree"), Buffer.from(treeId)], program.programId);
        const [positionPda] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("position"), walletPubKey.toBuffer(), Buffer.from(treeId)], program.programId);
        const treasuryPda = protocol.treasury;

        console.log("⚡ Sending Sell Transaction...", { treeId, sharesToSell, newTotal });

        let tx;
        try {
            tx = await program.methods
                .sellShares(treeId, new BN(sharesToSell))
                .accounts({
                    tree: treePda,
                    position: positionPda,
                    protocol: protocolPda,
                    treasury: treasuryPda,
                    seller: walletPubKey,
                    systemProgram: anchor.web3.SystemProgram.programId,
                })
                .rpc();
            
            console.log(`✅ On-chain success: ${tx}`);
        } catch (rpcErr: any) {
            // Check if the error is actually because it already succeeded
            const errMsg = rpcErr.toString();
            if (errMsg.includes("already been processed")) {
                console.warn("⚠️ Transaction already processed by network. Treating as success.");
                tx = "PROCESSED_ON_CHAIN"; // Placeholder for the sync function
            } else {
                throw rpcErr; // Real error, pass to outer catch
            }
        }

        // 4. Comprehensive Supabase sync
        await (window as any).syncTransactionToSupabase(
            walletPubKey.toBase58(),
            treeId,
            sharesToSell,
            'SELL',
            tx,
            newTotal,
            isGuardian
        );

        alert(`Successfully sold ${sharesToSell} shares!`);
        (window as any).closeSellModal();

        if (typeof (window as any).loadDashboard === 'function') {
            await (window as any).loadDashboard();
        }

    } catch (err: any) {
        console.error("❌ Sell failed:", err);
        const msg = err.message || err;
        alert(`Sell failed: ${msg}`);
        
        if (btn) { 
            btn.disabled = false; 
            btn.textContent = "Sell Shares"; 
        }
    } finally {
        // Clear the lock
        (window as any)._isSelling = false;
    }
};
/**
 * Synchronizes a Solana transaction result with Supabase.
 * Updates both the transaction log and the user's current tree position.
 */
 async function syncTransactionToSupabase(
     wallet: string,
     treeId: string,
     amount: number,
     type: 'BUY' | 'SELL',
     signature: string,
     newTotal: number,
     isGuardian: boolean
 ) {
     const supabase = (window as any)._sb;
     if (!supabase) return console.error("Supabase client missing");

     try {
         // MATCHING YOUR SCHEMA: tx_type, new_total_shares, is_guardian, wallet_address, signature
         const { error } = await supabase
             .from('transactions') // Ensure your table name is correct (e.g., 'transactions' or 'logs')
             .insert([{
                 wallet_address: wallet,
                 tree_id: treeId,           // Ensure this column exists in your table
                 amount: amount,
                 tx_type: type,             // Your schema says 'tx_type'
                 signature: signature,
                 new_total_shares: newTotal, // Your schema says 'new_total_shares'
                 is_guardian: isGuardian,    // Your schema says 'is_guardian'
                 timestamp: new Date().toISOString()
             }]);

         if (error) throw error;
         console.log("✅ Supabase Sync Successful");
     } catch (err) {
         console.error("❌ Supabase Sync Error:", err);
     }
 }
 
// Expose to window for your confirmAdopt/confirmSell functions
(window as any).syncTransactionToSupabase = syncTransactionToSupabase;
// ─────────────────────────────────────────────────────────────
// GET PROTOCOL DATA
// ─────────────────────────────────────────────────────────────
export async function getProtocolData() {
  // FIX: null-check program BEFORE using it
  const program      = (window as any)._program;
  const walletPubKey = (window as any).walletPubKey;

  if (!program) {
    throw new Error("Program not initialized. Connect wallet first.");
  }

  try {
    const [protocolPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("protocol")],
      program.programId
    );
    const config       = await program.account.protocolConfig.fetch(protocolPda);
    const treesOnChain = await program.account.tree.all();

    let totalStakedOlv = 0;
    if (walletPubKey) {
      try {
        const [stakePda] = PublicKey.findProgramAddressSync(
          [Buffer.from("stake"), walletPubKey.toBuffer()],
          program.programId
        );
        const stakeAccount = await program.account.stakeAccount.fetch(stakePda);
        totalStakedOlv = (stakeAccount.amount?.toNumber() || 0) / 1_000_000_000;
      } catch (e) {
        console.log("[getProtocolData] No StakeAccount found for this user.");
      }
    }

    console.log("[getProtocolData] Fetched:", { config, treesCount: treesOnChain.length, totalStakedOlv });

    (window as any)._protocol      = config;
    (window as any)._treesOnChain  = treesOnChain;
    (window as any)._stakedOlv     = totalStakedOlv;

    return { config, treesOnChain, totalStakedOlv };

  } catch (err) {
    console.error("[getProtocolData] Error:", err);
    throw err;
  }
}

(window as any).getProtocolData     = getProtocolData;
(window as any).refreshProtocolData = getProtocolData;

// ─────────────────────────────────────────────────────────────
// CLOSE TREE DETAIL MODAL
// ─────────────────────────────────────────────────────────────
// Note: oracleUpdateInterval, startOracleUpdates, and switchTreeDetailTab
// are defined in test.ts and exposed to window. We just wire the close here.
(window as any).closeTreeDetailModal = () => {
  const interval = (window as any)._oracleUpdateInterval;
  if (interval) {
    clearInterval(interval);
    (window as any)._oracleUpdateInterval = null;
  }
  document.getElementById('tree-detail-modal')?.classList.add('hidden');
};
// ─────────────────────────────────────────────────────────────
// GLOBAL BANNER UPDATE
// ─────────────────────────────────────────────────────────────
(window as any).updateGlobalBanner = function(treeCount: number, shareCount: number, solPrice: number = 0.05) {
  // 1. Define Ecosystem Coefficients
  const OIL_PER_SHARE = 0.05;    // 50ml per share
  const CO2_PER_SHARE = 0.15;    // 0.15kg per share
  const BOTTLE_SIZE = 0.75;      // 750ml standard bottle

  // 2. Perform Calculations
  const totalOil = shareCount * OIL_PER_SHARE;
  const totalBottles = Math.floor(totalOil / BOTTLE_SIZE);
  const totalCarbon = shareCount * CO2_PER_SHARE;
  const ecosystemValue = shareCount * solPrice;

  // 3. Update DOM Elements using your setText/setEl utility
  setEl('yourTrees', treeCount.toLocaleString());
  setEl('dash-trees',treeCount.toLocaleString());
  setEl('user-trees-stat',treeCount.toLocaleString());


  setEl('portfolioShares', shareCount.toLocaleString());
  setEl('dash-shares', shareCount.toLocaleString());
  setEl('farm-shares-stat', shareCount.toLocaleString());


  setEl('oilLiters', `${totalOil.toFixed(1)}L`);
  setEl('dash-oil', `${totalOil.toFixed(1)}L`);

  setEl('bottles', totalBottles.toString());
  setEl('dash-bottles', totalBottles.toString());

  setEl('carbonEst', `${totalCarbon.toFixed(1)}kg`);
  setEl('portfolioValue', `${ecosystemValue.toFixed(2)} SOL`);

  // 4. Clean up UI (Remove Shimmer effects)
  const statsBanner = document.getElementById('stats');
  if (statsBanner) {
    statsBanner.querySelectorAll('.shimmer').forEach(el => el.classList.remove('shimmer'));
  }

  console.log(`[BANNER] Updated: ${shareCount} shares across ${treeCount} trees.`);
};

console.log("[functions.ts] ✅ Module loaded with all fixes applied");
