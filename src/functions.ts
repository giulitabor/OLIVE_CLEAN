// ─────────────────────────────────────────────────────────────
// functions.ts — UI logic extracted from index.html
// Imported as a plain <script src="functions.js"> after bundling,
// or used directly if your bundler handles .ts imports.
// ─────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────
// TAB ROUTING
// ─────────────────────────────────────────────────────────────
const PANELS = ['hero', 'home', 'dash', 'rewards', 'admin'];

function switchTab(tab: string) {
  PANELS.forEach(p => {
    const el = document.getElementById('panel-' + p);
    if (el) el.classList.toggle('hidden', p !== tab);
  });

  ['home', 'dash', 'rewards', 'admin'].forEach(t => {
    const btn = document.getElementById('tab-' + t);
    if (!btn) return;
    btn.classList.toggle('active', t === tab);
  });

  if (tab === 'weather') {
      if ((window as any).refreshWeatherUI) {
        (window as any).refreshWeatherUI();
      }
    }
  if (tab === 'admin') {
    const protocol = (window as any)._protocol;
    const program  = (window as any)._program;

    if (protocol && typeof (window as any).fillAdminProtocol === 'function') {
      (window as any).fillAdminProtocol(protocol);
    } else {
      console.warn('[ADMIN TAB] Protocol not available or fillAdminProtocol not defined');
    }

    if (typeof (window as any).refreshAdminStatus === 'function') {
      (window as any).refreshAdminStatus();
    } else {
      console.warn('[ADMIN TAB] refreshAdminStatus not defined');
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


// ─────────────────────────────────────────────────────────────
// WALLET CONNECTED — called by test.ts after wallet connects
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
};


// ─────────────────────────────────────────────────────────────
// SHIMMER REMOVAL — called by test.ts after loadDashboard
// ─────────────────────────────────────────────────────────────
(window as any).clearShimmers = function() {
  document.querySelectorAll('.shimmer').forEach(el => el.classList.remove('shimmer'));
};


// ─────────────────────────────────────────────────────────────
// FILL ADMIN PROTOCOL CARD — called by test.ts
// Bug fix: was defined twice with conflicting bodies; merged into one correct version.
// ─────────────────────────────────────────────────────────────
(window as any).fillAdminProtocol = function(protocol: any, vaultSol?: number, totalSold?: number) {
  console.log('[fillAdminProtocol] Updating Admin UI...', { protocol, vaultSol, totalSold });

  const set = (id: string, v: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  };

  // 1. FORMAT DATA
  const price = (protocol.sharePriceLamports.toNumber() / 1e9).toFixed(4);
  const totalTrees = String(protocol.totalTrees ?? '240');

  // 2. UPDATE ADMIN SECTION (Existing)
  set('admin-share-price', price + ' SOL');
  set('admin-total-trees', totalTrees);
  set('admin-tree-count',  totalTrees);
  set('admin-paused', protocol.paused ? '⏸ Paused' : '✅ Live');

  // 3. UPDATE GROVE HEADER (The Fix for the "Blank" Header)
  set('totalTrees', totalTrees);        // Matches id="totalTrees" in Grove Header
  set('sharePrice', price + ' SOL');    // Matches id="sharePrice" in Grove Header

  // Update Hero Section if applicable
  set('hero-temp-placeholder', '19°C'); // Optional: sync with your weather data

  // 4. THE REST OF YOUR LOGIC (Fees, Vault, etc.)
  const buyFee = protocol.buyFeeBps != null
    ? (protocol.buyFeeBps.toNumber?.() ?? protocol.buyFeeBps) / 100
    : null;
  const sellFee = protocol.sellFeeBps != null
    ? (protocol.sellFeeBps.toNumber?.() ?? protocol.sellFeeBps) / 100
    : null;

  set('admin-fee',
    buyFee != null && sellFee != null
      ? `Buy ${buyFee.toFixed(2)}% / Sell ${sellFee.toFixed(2)}%`
      : '—'
  );

  // IDL has guardianThreshold (u64), not guardianPerksEnabled (bool)
  const threshold = protocol.guardianThreshold != null
    ? (protocol.guardianThreshold.toNumber?.() ?? protocol.guardianThreshold)
    : null;
  set('admin-guardian-perks',
    threshold != null ? `${threshold.toLocaleString()} shares` : '—'
  );

  // ── Vault SOL ──────────────────────────────────────────────────────────────
  if (vaultSol !== undefined) {
    set('admin-vault-sol',     vaultSol.toFixed(2) + ' SOL');
    set('admin-treasury-sol',  vaultSol.toFixed(2) + ' SOL');
  }

  // ── Total sold — if not passed, derive from cached trees ──────────────────
  let resolvedSold = totalSold;
  if (resolvedSold === undefined) {
    const cached: any[] = (window as any)._cachedTrees ?? [];
    if (cached.length > 0) {
      resolvedSold = cached.reduce((sum: number, t: any) => {
        const sold = t.account?.sharesSold;
        return sum + (sold?.toNumber?.() ?? Number(sold) ?? 0);
      }, 0);
    }
  }
  if (resolvedSold !== undefined) {
    set('admin-shares-sold',       resolvedSold.toLocaleString());
    set('admin-total-shares-sold', resolvedSold.toLocaleString());
    set('admin-total-circulation', resolvedSold.toLocaleString());
    // 0.02 L per share sold = 20ml bottle per share (matches original logic)
    set('admin-oil-debt', (resolvedSold * 0.02).toFixed(1) + ' Liters');
  }

  console.log('[fillAdminProtocol] Admin panel populated');
};


// ─────────────────────────────────────────────────────────────
// ADMIN STATUS TABLE — called by test.ts / Refresh button
// ─────────────────────────────────────────────────────────────
(window as any).refreshAdminStatus = async function() {
  console.log('[refreshAdminStatus] Starting...');
  const sb      = (window as any)._sb;
  const program = (window as any)._program;

  if (!sb || !program) {
    console.warn('[refreshAdminStatus] Missing sb or program, aborting');
    return;
  }

  const tbody     = document.getElementById('admin-tree-table');
  const sbTotal   = document.getElementById('admin-sb-total');
  const sbMinted  = document.getElementById('admin-sb-minted');
  const sbPending = document.getElementById('admin-sb-pending');

  if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-4 text-center text-stone-400">Loading…</td></tr>`;

  try {
    const { data: trees, error } = await sb
      .from('trees')
      .select('tree_id,name,variety,mint,status')
      .order('tree_id', { ascending: true });

    if (error) throw error;
    if (!trees) { console.warn('[refreshAdminStatus] No trees returned'); return; }

    const minted  = trees.filter((t: any) => t.mint).length;
    const pending = trees.length - minted;

    if (sbTotal)   sbTotal.textContent   = trees.length;
    if (sbMinted)  sbMinted.textContent  = minted;
    if (sbPending) sbPending.textContent = pending;
    const countEl = document.getElementById('admin-tree-count');
    if (countEl) countEl.textContent = minted;

    const rows = trees.map((tree: any) => {
      const hasMint = !!tree.mint;
      const mintDisp = hasMint ? tree.mint.slice(0, 8) + '…' : '—';
      const [statusLabel, statusCls] = !hasMint
        ? ['Needs ad2.ts bootstrap', 'text-amber-600']
        : ['Mint OK', 'text-green-600'];

      return `<tr class="hover:bg-stone-50">
        <td class="px-4 py-2.5 font-mono font-medium text-stone-700">${tree.tree_id}</td>
        <td class="px-4 py-2.5">${tree.name ?? '—'}</td>
        <td class="px-4 py-2.5 text-stone-400">${tree.variety ?? '—'}</td>
        <td class="px-4 py-2.5 font-mono text-xs">${mintDisp}</td>
        <td class="px-4 py-2.5 font-medium ${statusCls}">${statusLabel}</td>
      </tr>`;
    });

    if (tbody) tbody.innerHTML = rows.join('');
  } catch(e: any) {
    console.error('[refreshAdminStatus] Error:', e);
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-4 text-center text-red-400">Error: ${e.message}</td></tr>`;
  }
};


// ─────────────────────────────────────────────────────────────
// TREE ID NORMALISER
// tree_id can arrive as:
//   • plain number  (Anchor-decoded u32)         → 3
//   • Anchor BN     (large-number object)         → { words:[3], ... }
//   • numeric string from Supabase               → "3"
//   • prefixed string from Supabase tree_id col  → "tree_003" / "TREE-3"
// The on-chain instruction expects a plain u32 number.
// ─────────────────────────────────────────────────────────────
function toSafeTreeId(raw: any): number {
  if (raw == null) throw new Error('[toSafeTreeId] treeId is null/undefined');
  if (typeof raw === 'object' && typeof raw.toNumber === 'function') return raw.toNumber();
  if (typeof raw === 'number') return raw;
  const match = String(raw).match(/(\d+)$/);
  if (match) return parseInt(match[1], 10);
  throw new Error(`[toSafeTreeId] Cannot parse treeId: ${raw}`);
}
(window as any).toSafeTreeId = toSafeTreeId;

// ─────────────────────────────────────────────────────────────
// ADOPT MODAL
// openAdoptModal lives in test.ts — it owns _cachedTrees and sets
// window._modalTree / window._modalProtocol then calls updateModalCalc.
// We only own: updateModalCalc, confirmAdopt, closeAdoptModal.
// ─────────────────────────────────────────────────────────────

(window as any).closeAdoptModal = function() {
  document.getElementById('adopt-modal')!.classList.add('hidden');
};

function updateModalCalc() {
  // Read from window globals — test.ts's openAdoptModal sets these
  const _modalProtocol = (window as any)._modalProtocol;
  if (!_modalProtocol) return;
  const shares   = parseInt((document.getElementById('modal-slider') as HTMLInputElement).value, 10);
  const priceSOL = _modalProtocol.sharePriceLamports.toNumber() / 1e9;
  const cost     = (shares * priceSOL).toFixed(4);
  const pct      = ((shares / 1000) * 100).toFixed(1);

  document.getElementById('modal-shares-val')!.textContent = String(shares);
  document.getElementById('modal-pct')!.textContent        = pct;
  document.getElementById('modal-cost')!.textContent       = cost + ' SOL';
  document.getElementById('modal-btn-cost')!.textContent   = cost;

  const tierIcon  = document.getElementById('modal-tier-icon')!;
  const tierLabel = document.getElementById('modal-tier-label')!;
  const tierRow   = document.getElementById('modal-tier-row')!;
  tierRow.className = 'flex items-center gap-2 px-4 py-2.5 rounded-xl mb-4 text-sm font-medium ';

  if (shares >= 1000) {
    tierIcon.textContent  = '👑';
    tierLabel.textContent = 'Full Guardian — annual Tuscany stay + 24 bottles';
    tierRow.className    += 'bg-amber-50 text-amber-800';
  } else if (shares >= 500) {
    tierIcon.textContent  = '🌿';
    tierLabel.textContent = 'Eco Guardian — carbon data + early harvest access';
    tierRow.className    += 'bg-emerald-50 text-emerald-700';
  } else if (shares >= 100) {
    tierIcon.textContent  = '🫒';
    tierLabel.textContent = 'Olive Lover — quarterly oil + harvest reports';
    tierRow.className    += 'bg-green-50 text-green-700';
  } else {
    tierIcon.textContent  = '—';
    tierLabel.textContent = 'Need at least 100 shares for Olive Lover perks';
    tierRow.className    += 'bg-stone-100 text-stone-400';
  }

  checkModalBuyBtn();
}
(window as any).updateModalCalc = updateModalCalc;

function checkModalBuyBtn() {
  const agreed = (document.getElementById('modal-agree') as HTMLInputElement).checked;
  (document.getElementById('modal-buy-btn') as HTMLButtonElement).disabled = !agreed;
}
(window as any).checkModalBuyBtn = checkModalBuyBtn;

(window as any).confirmAdopt = async () => {
    // Unify the ID check
    const modal = document.getElementById('adoption-modal') || document.getElementById('adopt-modal');
    if (!modal) return;

    const treeId = modal.dataset.treeId; // This is now correctly "F1-FR-001"
    const amount = parseInt((document.getElementById('modal-slider') as HTMLInputElement).value);

    if (!treeId || isNaN(amount)) {
        console.error("Missing treeId or amount");
        return;
    }

    try {
        // Use the global wrapper you defined
        await (window as any)._buyShares(treeId, amount);

        // Hide modal
        modal.classList.add('hidden');
        await (window as any).loadDashboard();
    } catch (e) {
        console.error("Purchase failed", e);
    }
};

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('modal-agree')?.addEventListener('change', checkModalBuyBtn);
  document.getElementById('adopt-modal')?.addEventListener('click', function(e) {
    if (e.target === this) (window as any).closeAdoptModal();
  });
});


// ─────────────────────────────────────────────────────────────
// SELL MODAL
// ─────────────────────────────────────────────────────────────
(window as any).openSellModal = (treeId: string, ownedShares: number) => {
    console.log("[SELL] Opening sell modal for Tree:", treeId);

    // 1. Find the tree in our cache (handling both string and BN IDs)
    const treeData = Object.values((window as any)._cachedTrees || {}).find((t: any) => {
        const id = t.account.treeId;
        return (typeof id === 'string' ? id : id.toString()) === treeId;
    }) as any;

    if (!treeData) {
        console.error("[SELL] Could not find cached data for treeId:", treeId);
        return;
    }

    const modal = document.getElementById('sell-modal'); // Ensure this ID matches your HTML
    if (!modal) return;

    // 2. Stash data in the modal for the confirm button
    modal.dataset.treeId = treeId;
    modal.dataset.maxShares = ownedShares.toString();

    // 3. Update UI Elements
    const acc = treeData.account;
    const setText = (id: string, val: any) => {
        const el = document.getElementById(id);
        if (el) el.textContent = String(val);
    };

    setText('sell-modal-tree-name', `Tree #${acc.treeId}`);
    setText('sell-modal-tree-meta', `${acc.variety || 'Frantoio'} · ${acc.age || 15} yrs`);
    setText('sell-modal-owned-display', ownedShares.toLocaleString());
    setText('sell-modal-value-display', (ownedShares * 0.001).toFixed(4) + " SOL");

    // 4. Configure Slider
    const slider = document.getElementById('sell-modal-slider') as HTMLInputElement;
    if (slider) {
        slider.max = ownedShares.toString();
        slider.value = Math.ceil(ownedShares / 2).toString(); // Default to half
    }

    modal.classList.remove('hidden');
    if (typeof (window as any).updateSellCalc === 'function') {
        (window as any).updateSellCalc();
    }
};

(window as any).closeSellModal = function() {
  document.getElementById('sell-modal')!.classList.add('hidden');
  (document.getElementById('sell-modal-agree') as HTMLInputElement).checked = false;
};

(window as any).updateSellCalc = () => {
    const slider = document.getElementById('sell-modal-slider') as HTMLInputElement;
    const amount = parseInt(slider?.value || "0");
    const pricePerShare = 0.001; // Ensure this matches your protocol price

    const amountDisplay = document.getElementById('sell-amount-display');
    const payoutDisplay = document.getElementById('sell-payout-display');
    const btnPayout = document.getElementById('sell-btn-payout');

    if (amountDisplay) amountDisplay.textContent = `${amount} shares`;
    if (payoutDisplay) payoutDisplay.textContent = `${(amount * pricePerShare).toFixed(3)} SOL`;
    if (btnPayout) btnPayout.textContent = `${(amount * pricePerShare).toFixed(3)}`;
};

(window as any).checkSellModalBtn = function() {
  const agreed = (document.getElementById('sell-modal-agree') as HTMLInputElement).checked;
  (document.getElementById('sell-modal-btn') as HTMLButtonElement).disabled = !agreed;
};

(window as any).confirmSell = async () => {
    const modal = document.getElementById('sell-modal');
    if (!modal) return;

    // Retrieve the stashed data from the dataset
    const treeId = modal.dataset.treeId;
    const maxShares = parseInt(modal.dataset.maxShares || "0");

    const slider = document.getElementById('sell-modal-slider') as HTMLInputElement;
    const amountToSell = parseInt(slider?.value || "0");

    if (!treeId || amountToSell <= 0) {
        console.error("[SELL] Missing treeId or invalid amount");
        return;
    }

    try {
        console.log(`[SELL] Initiating sale: ${amountToSell} shares of ${treeId}`);

        // 1. Blockchain Transaction
        const tx = await (window as any).sellShares(treeId, amountToSell);

        // 2. Supabase Sync (Using the correct 'shares' column for transactions table)
        const wallet = (window as any).solana.publicKey.toBase58();
        const newTotal = maxShares - amountToSell;

        await (window as any).syncTransactionToSupabase(
            wallet,
            treeId,
            amountToSell,
            'SELL',
            tx,
            newTotal,
            false // isGuardian
        );

        // 3. UI Cleanup
        modal.classList.add('hidden');
        alert(`Successfully sold ${amountToSell} shares!`);

        // Refresh the dashboard to show updated share counts
        if (typeof (window as any).loadDashboard === 'function') {
            await (window as any).loadDashboard();
        }
    } catch (e) {
        console.error("[SELL] Transaction failed:", e);
    }
};

// ─────────────────────────────────────────────────────────────
// TREE DETAIL MODAL
// ─────────────────────────────────────────────────────────────
(window as any).openTreeDetailModal = function(tree: any, _position?: any) {
  document.getElementById('tree-detail-name')!.textContent     = `${tree.name || 'Tree #' + tree.treeId} — ${tree.variety}`;
  document.getElementById('tree-detail-location')!.textContent = tree.location || 'San Vincenzo, Tuscany';
  document.getElementById('tree-detail-age')!.textContent      = tree.age || '—';
  document.getElementById('tree-detail-height')!.textContent   = tree.height || '4.2';
  document.getElementById('tree-detail-variety')!.textContent  = tree.variety || '—';
  document.getElementById('tree-detail-meta-id')!.textContent  = tree.treeId || '—';
  document.getElementById('tree-detail-meta-mint')!.textContent = tree.mint ? tree.mint.slice(0, 8) + '...' : '—';
  document.getElementById('tree-detail-meta-sold')!.textContent = String(tree.sharesSold?.toNumber?.() ?? tree.sharesSold ?? '—');

  document.getElementById('tree-detail-modal')!.classList.remove('hidden');
  (window as any).switchTreeDetailTab('overview');
};

(window as any).closeTreeDetailModal = function() {
  document.getElementById('tree-detail-modal')!.classList.add('hidden');
};

(window as any).switchTreeDetailTab = function(tab: string) {
  document.querySelectorAll('.tree-detail-tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll<HTMLElement>('.tree-detail-tab').forEach(btn => {
    btn.classList.remove('active', 'border-green-600', 'text-green-600');
    btn.classList.add('border-transparent', 'text-stone-500');
  });

  document.getElementById(`tree-detail-tab-${tab}`)?.classList.remove('hidden');

  // Highlight the active tab button using event delegation
  const activeBtn = document.querySelector<HTMLElement>(`.tree-detail-tab[onclick*="${tab}"]`);
  if (activeBtn) {
    activeBtn.classList.add('active', 'border-green-600', 'text-green-600');
    activeBtn.classList.remove('border-transparent', 'text-stone-500');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('tree-detail-modal')?.addEventListener('click', function(e) {
    if (e.target === this) (window as any).closeTreeDetailModal();
  });
});


// ─────────────────────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────────────────────
(window as any).showGlobalToast = function(msg: string, isError = false) {
  const t = document.createElement('div');
  t.className = `toast fixed top-20 right-4 z-[100] px-4 py-2.5 rounded-xl shadow-xl text-sm font-medium max-w-xs
    ${isError ? 'bg-red-100 text-red-800 border border-red-200' : 'bg-green-100 text-green-800 border border-green-200'}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
};


// ─────────────────────────────────────────────────────────────
// FILTER BUTTONS (tree grid)
// ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll<HTMLElement>('.filter-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll<HTMLElement>('.filter-btn').forEach(b => {
        b.style.background  = '';
        b.style.color       = '';
        b.style.borderColor = '';
        b.classList.remove('active');
      });
      this.style.background  = 'var(--olive)';
      this.style.color       = 'white';
      this.style.borderColor = 'var(--olive)';
      this.classList.add('active');

      const f = (this as HTMLElement).dataset.filter!;
      document.querySelectorAll<HTMLElement>('.tree-card-wrap').forEach(card => {
        const show = f === 'all'
          || (f === 'available' && card.dataset.available === 'true')
          || (f === 'mine'      && card.dataset.mine      === 'true')
          || (f === 'guardian'  && card.dataset.guardian  === 'true');
        card.classList.toggle('hidden', !show);
      });
    });
  });
});


// ─────────────────────────────────────────────────────────────
// USER DASHBOARD — called by test.ts after loadDashboard
// ─────────────────────────────────────────────────────────────
(window as any).updateUserDashboard = function(analytics: any, positions: any[]) {
  const set = (id: string, v: string) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const pct = ((analytics.totalShares / (240 * 1000)) * 100).toFixed(4);

  set('farmSharePct',    pct + '%');
  set('dash-trees',      positions.length);
  set('dash-shares',     analytics.totalShares);
  set('dash-oil',        analytics.totalOil.toFixed(1) + ' L');
  set('dash-bottles',    analytics.totalBottles);
  set('benefit-oil',     analytics.totalOil.toFixed(1) + ' L / yr');
  set('benefit-carbon',  analytics.carbonKg.toFixed(1) + ' kg / yr');
  set('carbon-sequestered', analytics.carbonKg.toFixed(1));
  set('carbon-trees',    positions.length);
  set('yourTrees',       positions.length);
  set('portfolioShares', analytics.totalShares);
  set('oilLiters',       analytics.totalOil.toFixed(1) + ' L');
  set('bottles',         analytics.totalBottles);
  set('carbonEst',       analytics.carbonKg.toFixed(1) + ' kg');
  set('portfolioValue',  (analytics.portfolioValue ?? 0).toFixed(4) + ' SOL');

  const visitEl = document.getElementById('benefit-visit');
  if (visitEl) {
    if (analytics.totalShares >= 20000)     visitEl.textContent = '🏡 Premium villa access';
    else if (analytics.totalShares >= 5000) visitEl.textContent = '🚶 1 night eco-stay';
    else                                     visitEl.textContent = 'Earn with 5,000+ shares';
  }

  const hasGuardian = positions.some((p: any) => p.is_guardian ?? p.account?.isGuardian ?? false);
  document.getElementById('guardian-benefit')?.classList.toggle('hidden', !hasGuardian);
};


// ─────────────────────────────────────────────────────────────
// REWARDS TAB — TIER CALCULATION
// ─────────────────────────────────────────────────────────────
(window as any).updateRewardsPanel = function(analytics: any, positions: any[]) {
  const totalShares = analytics.totalShares || 0;

  let tier = 0, tierName = 'Olive Enthusiast', tierIcon = '🌱';
  let tierDesc = 'Start your olive grove journey';
  let progress = 0;
  let progressText = `${totalShares} / 100 shares to unlock Olive Lover`;

  if (totalShares >= 5000) {
    tier = 4; tierName = 'Legacy Holder'; tierIcon = '🏛️';
    tierDesc = 'Elite 5-tree portfolio owner';
    progress = 100; progressText = 'Maximum tier achieved!';
  } else if (totalShares >= 1000) {
    tier = 3; tierName = 'Grove Patron'; tierIcon = '👑';
    tierDesc = 'Full tree guardian';
    progress = (totalShares / 5000) * 100;
    progressText = `${totalShares} / 5,000 shares to unlock Legacy Holder`;
  } else if (totalShares >= 500) {
    tier = 2; tierName = 'Eco Guardian'; tierIcon = '🌿';
    tierDesc = 'Carbon-conscious steward';
    progress = (totalShares / 1000) * 100;
    progressText = `${totalShares} / 1,000 shares to unlock Grove Patron`;
  } else if (totalShares >= 100) {
    tier = 1; tierName = 'Olive Lover'; tierIcon = '🫒';
    tierDesc = 'Quarterly oil recipient';
    progress = (totalShares / 500) * 100;
    progressText = `${totalShares} / 500 shares to unlock Eco Guardian`;
  } else {
    progress = (totalShares / 100) * 100;
  }

  document.getElementById('tier-icon')!.textContent          = tierIcon;
  document.getElementById('tier-name')!.textContent          = tierName;
  document.getElementById('tier-desc')!.textContent          = tierDesc;
  (document.getElementById('tier-progress-bar') as HTMLElement).style.width = progress + '%';
  document.getElementById('tier-progress-text')!.textContent = progressText;

  document.querySelectorAll<HTMLElement>('.tier-card-item').forEach((card, idx) => {
    card.style.borderColor = idx < tier ? 'var(--gold)'   : '';
    card.style.background  = idx < tier ? 'var(--gold-l)' : '';
  });

  const perksGrid = document.getElementById('active-perks-grid')!;
  const perks: string[] = [];

  if (tier >= 1) {
    perks.push(`<div class="bg-green-50 border border-green-200 rounded-xl p-4"><div class="text-2xl mb-2">🍾</div><h5 class="font-semibold text-green-900 mb-1">Quarterly Oil</h5><p class="text-xs text-green-700">250ml premium EVOO every 3 months</p></div>`);
    perks.push(`<div class="bg-green-50 border border-green-200 rounded-xl p-4"><div class="text-2xl mb-2">📊</div><h5 class="font-semibold text-green-900 mb-1">Harvest Reports</h5><p class="text-xs text-green-700">Detailed quarterly updates on your trees</p></div>`);
  }
  if (tier >= 2) {
    perks.push(`<div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4"><div class="text-2xl mb-2">🌿</div><h5 class="font-semibold text-emerald-900 mb-1">Carbon Credits</h5><p class="text-xs text-emerald-700">${analytics.carbonKg.toFixed(1)} kg/yr verified sequestration</p></div>`);
    perks.push(`<div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4"><div class="text-2xl mb-2">🏡</div><h5 class="font-semibold text-emerald-900 mb-1">1 Night Villa Stay</h5><p class="text-xs text-emerald-700">Complimentary eco-stay at Toscagialla</p></div>`);
  }
  if (tier >= 3) {
    perks.push(`<div class="bg-amber-50 border border-amber-200 rounded-xl p-4"><div class="text-2xl mb-2">🫒</div><h5 class="font-semibold text-amber-900 mb-1">24 Bottles/Year</h5><p class="text-xs text-amber-700">Full tree harvest allocation</p></div>`);
    perks.push(`<div class="bg-amber-50 border border-amber-200 rounded-xl p-4"><div class="text-2xl mb-2">🏡</div><h5 class="font-semibold text-amber-900 mb-1">3-Night Villa</h5><p class="text-xs text-amber-700">Premium suite at Toscagialla</p></div>`);
  }
  if (tier >= 4) {
    perks.push(`<div class="bg-amber-50 border border-amber-200 rounded-xl p-4"><div class="text-2xl mb-2">🍷</div><h5 class="font-semibold text-amber-900 mb-1">7-Night Luxury</h5><p class="text-xs text-amber-700">Annual week at villa + wine tasting</p></div>`);
    perks.push(`<div class="bg-amber-50 border border-amber-200 rounded-xl p-4"><div class="text-2xl mb-2">🗳️</div><h5 class="font-semibold text-amber-900 mb-1">Governance Rights</h5><p class="text-xs text-amber-700">Vote on farm management decisions</p></div>`);
  }

  perksGrid.innerHTML = perks.length
    ? perks.join('')
    : `<div class="text-center py-12 col-span-full text-stone-400"><p class="text-sm">Adopt 100+ shares to unlock your first perks</p></div>`;
};

async function updateGlobalTreeMetadata(treeId, sharesSold) {
    const { error } = await supabase.rpc('update_tree_shares_on_sale', {
        target_tree_id: treeId,
        shares_to_remove: sharesSold
    });

    if (error) console.error("Error updating global metadata:", error);
}

/**
 * my-grove-functions.ts
 * Helper functions for the redesigned My Grove dashboard
 * Add these to your test.ts or functions.ts file
 */

// ══════════════════════════════════════════════════════════════
// DYNAMIC PRICING FUNCTION (from your spec)
// ══════════════════════════════════════════════════════════════
function getSharePrice(filledPercent: number): number {
  if (filledPercent < 25) return 0.01;
  if (filledPercent < 60) return 0.015;
  if (filledPercent < 85) return 0.02;
  return 0.03;
}

// ══════════════════════════════════════════════════════════════
// FETCH WALLET BALANCES
// ══════════════════════════════════════════════════════════════
async function fetchWalletBalances(walletPublicKey: PublicKey) {
  try {
    // 1. Fetch SOL balance
    const solBalance = await connection.getBalance(walletPublicKey);
    const solAmount = solBalance / 1e9; // lamports to SOL

    // 2. Fetch OLV token balance (if OLV mint exists)
    const OLV_MINT = new PublicKey("DYmefEbHQXyQfGQDCKQfVwuR4ZvjXSkVv3N76NEJHaKa"); // Your OLV mint
    let olvBalance = 0;

    try {
      const olvTokenAccount = await connection.getTokenAccountsByOwner(
        walletPublicKey,
        { mint: OLV_MINT }
      );

      if (olvTokenAccount.value.length > 0) {
        const accountInfo = olvTokenAccount.value[0].account.data;
        // Parse token account data (amount is at offset 64, 8 bytes)
        const buffer = Buffer.from(accountInfo);
        const amount = buffer.readBigUInt64LE(64);
        olvBalance = Number(amount) / 1e9; // Assuming 9 decimals
      }
    } catch (err) {
      console.warn("[WALLET] OLV token account not found or error:", err);
    }

    // 3. Fetch USD prices (mock for now - in production use a price feed)
    const solPriceUSD = 140; // Mock - replace with real price feed
    const olvPriceUSD = 0.05; // Mock - replace with real price feed

    const solValueUSD = solAmount * solPriceUSD;
    const olvValueUSD = olvBalance * olvPriceUSD;
    const totalUSD = solValueUSD + olvValueUSD;

    return {
      sol: solAmount,
      solUSD: solValueUSD,
      olv: olvBalance,
      olvUSD: olvValueUSD,
      totalUSD: totalUSD
    };

  } catch (err) {
    console.error("[WALLET] Error fetching balances:", err);
    return {
      sol: 0,
      solUSD: 0,
      olv: 0,
      olvUSD: 0,
      totalUSD: 0
    };
  }
}

// ══════════════════════════════════════════════════════════════
// UPDATE WALLET BALANCE UI
// ══════════════════════════════════════════════════════════════
function updateWalletBalanceUI(balances: any) {
  const set = (id: string, value: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  set('wallet-sol-balance', balances.sol.toFixed(4));
  set('wallet-sol-usd', `$${balances.solUSD.toFixed(2)}`);
  set('wallet-olv-balance', balances.olv.toFixed(2));
  set('wallet-olv-usd', `$${balances.olvUSD.toFixed(2)}`);
  set('wallet-total-usd', `$${balances.totalUSD.toFixed(2)}`);
}

// ══════════════════════════════════════════════════════════════
// RENDER TREE POSITION CARDS (My Grove view)
// ══════════════════════════════════════════════════════════════
function renderTreePositionCards(positions: any[], trees: any[], protocol: any) {
  const container = document.getElementById('tree-position-cards');
  const emptyState = document.getElementById('tree-positions-empty');

  if (!container) return;

  // Show/hide empty state
  if (positions.length === 0) {
    if (emptyState) emptyState.classList.remove('hidden');
    container.innerHTML = '';
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');

  // Build position cards
  container.innerHTML = positions.map((pos: any) => {
    const treeId = String(pos.tree_id ?? pos.account?.treeId);
    const sharesOwned = Number(pos.shares_owned ?? pos.account?.sharesOwned ?? 0);

    // Find the tree data
    const treeData = trees.find((t: any) => String(t.account.treeId) === treeId);
    if (!treeData) return '';

    const tree = treeData.account;
    const totalShares = Number(tree.totalShares);
    const sharesSold = Number(tree.sharesSold);
    const ownershipPct = ((sharesOwned / totalShares) * 100).toFixed(1);
    const adoptionPct = ((sharesSold / totalShares) * 100).toFixed(1);
    const sharesRemaining = totalShares - sharesSold;

    // Calculate benefits
    const oilPerYear = (sharesOwned / totalShares) * 24; // 24L per tree
    const carbonPerYear = (sharesOwned / totalShares) * 85; // 85kg per tree

    // Calculate current value with dynamic pricing
    const filledPercent = (sharesSold / totalShares) * 100;
    const currentPrice = getSharePrice(filledPercent);
    const estimatedValue = sharesOwned * currentPrice;

    // Tier badge
    const isGuardian = sharesOwned >= 1000;

    return `
      <div class="bg-white border border-stone-200 rounded-2xl p-5 hover:shadow-md transition">
        <div class="flex justify-between items-start mb-3">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-green-100 to-emerald-100 flex items-center justify-center text-2xl">
              🫒
            </div>
            <div>
              <h3 class="font-bold text-lg text-stone-900">${tree.name}</h3>
              <p class="text-xs text-stone-500">${tree.variety} · ${tree.age} yrs · ${tree.location}</p>
            </div>
          </div>
          <div class="text-right">
            <p class="text-xs text-stone-400">You own</p>
            <p class="font-bold text-lg text-green-700">${sharesOwned} shares</p>
            <p class="text-xs text-stone-500">${ownershipPct}% ownership</p>
            ${isGuardian ? '<p class="text-xs font-semibold text-amber-600 mt-1">👑 Guardian</p>' : ''}
          </div>
        </div>

        <!-- Progress bar -->
        <div class="w-full bg-stone-100 h-2 rounded-full mb-3">
          <div class="bg-green-700 h-2 rounded-full transition-all" style="width:${adoptionPct}%"></div>
        </div>
        <p class="text-xs text-stone-500 mb-4">
          <span class="font-semibold text-green-700">${adoptionPct}% adopted</span> ·
          ${sharesRemaining} shares remaining
        </p>

        <!-- Benefits grid -->
        <div class="grid grid-cols-3 gap-3">
          <div class="bg-stone-50 rounded-xl p-3 text-center">
            <p class="font-bold text-lg" style="color:var(--olive)">${oilPerYear.toFixed(1)}L</p>
            <p class="text-xs text-stone-400">oil/year</p>
          </div>
          <div class="bg-stone-50 rounded-xl p-3 text-center">
            <p class="font-bold text-lg text-emerald-600">${carbonPerYear.toFixed(0)}kg</p>
            <p class="text-xs text-stone-400">CO₂/year</p>
          </div>
          <div class="bg-stone-50 rounded-xl p-3 text-center">
            <p class="font-bold text-lg text-amber-600">${estimatedValue.toFixed(2)} SOL</p>
            <p class="text-xs text-stone-400">est. value</p>
          </div>
        </div>

        <!-- Action buttons -->
        <div class="flex gap-2 mt-4 pt-4 border-t border-stone-100">
          <button onclick="openTreeDetailModal(${trees.indexOf(treeData)})"
                  class="flex-1 px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-sm font-medium rounded-lg transition">
            View Details
          </button>
          <button onclick="window.openAdoptModal(${trees.indexOf(treeData)})"
                  class="flex-1 px-3 py-2 bg-green-700 hover:bg-green-800 text-white text-sm font-medium rounded-lg transition">
            Buy More
          </button>
          <button onclick="window.openSellModal('${treeId}', ${sharesOwned})"
                  class="px-3 py-2 border border-stone-300 hover:bg-stone-50 text-stone-600 text-sm font-medium rounded-lg transition">
            Sell
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// ══════════════════════════════════════════════════════════════
// UPDATE MY GROVE DASHBOARD (Main function to call)
// ══════════════════════════════════════════════════════════════
async function updateMyGroveDashboard(positions: any[], trees: any[], protocol: any) {
  const wallet = getWallet();

  // 1. Update header stats
  const set = (id: string, value: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  const totalTrees = positions.length;
  const totalShares = positions.reduce((sum: number, p: any) =>
    sum + Number(p.shares_owned ?? p.account?.sharesOwned ?? 0), 0);

  set('grove-tree-count', totalTrees.toString());
  set('grove-share-count', totalShares.toString());

  // 2. Fetch and update wallet balances
  const balances = await fetchWalletBalances(wallet);
  updateWalletBalanceUI(balances);

  // 3. Update quick stats
  const totalOil = positions.reduce((sum: number, p: any) => {
    const shares = Number(p.shares_owned ?? p.account?.sharesOwned ?? 0);
    const tree = trees.find((t: any) =>
      String(t.account.treeId) === String(p.tree_id ?? p.account?.treeId));
    if (!tree) return sum;
    const oilPerTree = 24; // liters
    return sum + (shares / Number(tree.account.totalShares)) * oilPerTree;
  }, 0);

  const totalCarbon = totalShares * 0.085; // 85kg per 1000 shares
  const totalValueSOL = positions.reduce((sum: number, p: any) => {
    const shares = Number(p.shares_owned ?? p.account?.sharesOwned ?? 0);
    const tree = trees.find((t: any) =>
      String(t.account.treeId) === String(p.tree_id ?? p.account?.treeId));
    if (!tree) return sum;
    const filled = Number(tree.account.sharesSold) / Number(tree.account.totalShares) * 100;
    const price = getSharePrice(filled);
    return sum + (shares * price);
  }, 0);

  set('stat-oil', `${totalOil.toFixed(1)}L`);
  set('stat-carbon', `${totalCarbon.toFixed(0)}kg`);
  set('stat-value-sol', `${totalValueSOL.toFixed(2)} SOL`);
  set('stat-value-usd', `$${(totalValueSOL * 140).toFixed(2)}`); // Mock price

  // 4. Update tier status
  const getTierInfo = (shares: number) => {
    if (shares >= 5000) return { icon: '🏛️', name: 'Legacy Holder', next: 10000 };
    if (shares >= 1000) return { icon: '👑', name: 'Grove Patron', next: 5000 };
    if (shares >= 500) return { icon: '🌿', name: 'Eco Guardian', next: 1000 };
    if (shares >= 100) return { icon: '🫒', name: 'Olive Lover', next: 500 };
    return { icon: '🌱', name: 'Olive Enthusiast', next: 100 };
  };

  const tierInfo = getTierInfo(totalShares);
  set('tier-status-icon', tierInfo.icon);
  set('tier-status-name', tierInfo.name);
  set('tier-status-progress', `${tierInfo.next - totalShares} shares to ${getTierInfo(tierInfo.next).name}`);

  // 5. Update farm ownership
  const totalGroveShares = 240 * 1000; // 240 trees × 1000 shares each
  const ownershipPct = ((totalShares / totalGroveShares) * 100).toFixed(4);
console.log(ownershipPct);

  set('farm-ownership-pct', `${ownershipPct}%`);
  set('farm-trees-stat', totalTrees.toString());
  set('farm-shares-stat', totalShares.toString());

  // 6. Render position cards
  renderTreePositionCards(positions, trees, protocol);

  // 7. Update activity feed (mock data for now)
  // In production, fetch from Supabase transaction log
  renderActivityFeed([
    { icon: '🫒', text: 'Bought 50 shares', time: '2 days ago' },
    { icon: '🌿', text: 'Tree #12 reached 80% adoption', time: '5 days ago' },
    { icon: '📦', text: 'Harvest estimate updated', time: '1 week ago' }
  ]);
}


(window as any).DEBUG = {
  trees: [],
  positions: [],
  protocol: null
};

function debug(label: string, data?: any) {
  console.log(`🧠 ${label}`, data);
}


// ─────────────────────────────────────────────────────────────
// DASHBOARD & BANNER SYNC — Updates all stat IDs in index.html
// ─────────────────────────────────────────────────────────────
(window as any).updateDashboardStats = function(totalShares: number, treeCount: number) {
  // 1. Identify all Banner and Hero Elements
  const elements = {
    // Top Sticky Banner
    bannerTrees:    document.getElementById('yourTrees'),
    bannerShares:   document.getElementById('portfolioShares'),
    bannerOil:      document.getElementById('oilLiters'),
    bannerBottles:  document.getElementById('bottles'),
    bannerCarbon:   document.getElementById('carbonEst'),
    bannerValue:    document.getElementById('portfolioValue'),
    // Main Dashboard Hero
    dashPct:        document.getElementById('farmSharePct'),

    dashPct2:        document.getElementById('farm-ownership-pct'),
    dashTrees2:      document.getElementById('farm-trees-stat'),
    dashShares2:     document.getElementById('farm-shares-stat'),




    dashTrees:      document.getElementById('dash-trees'),
    dashShares:     document.getElementById('dash-shares'),

    dashOil:        document.getElementById('dash-oil'),
    dashBottles:    document.getElementById('dash-bottles'),
    // Benefits Grid
    benefitOil:     document.getElementById('benefit-oil'),
    benefitCarbon:  document.getElementById('benefit-carbon'),
    benefitVisit:   document.getElementById('benefit-visit')
  };

  // 2. Perform Calculations
  const protocol = (window as any)._protocol;
  const globalTotal = protocol?.totalShares?.toNumber?.() || 1000000;

  const ownershipPct = (totalShares / globalTotal) * 100;
  const annualLiters = totalShares * 0.024; // 24L per 1k shares
  const annualBottles = Math.floor(annualLiters / 0.75);
  const carbonKg = (totalShares / 1000) * 25; // 25kg per tree
  const estValueSol = totalShares * 0.5; // Current Share Price

  // 3. Helper to update text and kill the shimmer animation
  const render = (el: HTMLElement | null, value: string) => {
    if (el) {
      el.textContent = value;
      el.classList.remove('shimmer'); // Critical: Stops the "blank" loading look
    }
  };

  // 4. Apply Updates
  render(elements.bannerTrees,   treeCount.toString());
  render(elements.bannerShares,  totalShares.toLocaleString());
  render(elements.bannerOil,     `${annualLiters.toFixed(1)}L`);
  render(elements.bannerBottles, annualBottles.toString());
  render(elements.bannerCarbon,  `${carbonKg.toFixed(1)}kg`);
  render(elements.bannerValue,   `${estValueSol.toFixed(2)} SOL`);

  render(elements.dashPct2,       `${ownershipPct.toFixed(4)}%`);
  render(elements.dashTrees2,     treeCount.toString());
  render(elements.dashShares2,    totalShares.toLocaleString());


  render(elements.dashPct,       `${ownershipPct.toFixed(4)}%`);
  render(elements.dashTrees,     treeCount.toString());
  render(elements.dashShares,    totalShares.toLocaleString());
  render(elements.dashOil,       `${annualLiters.toFixed(1)}L`);
  render(elements.dashBottles,   annualBottles.toString());

  render(elements.benefitOil,    `${annualLiters.toFixed(1)} L`);
  render(elements.benefitCarbon, `${carbonKg.toFixed(1)} kg/yr`);

  // Update Rewards Progress Bar
  const rewardProgress = document.getElementById('reward-progress-text');
  const rewardBar = document.getElementById('reward-progress-bar');

  if (rewardProgress) {
      rewardProgress.innerHTML = `<span class="font-bold text-stone-900">${totalShares}</span> / 1000 shares to reach Grove Patron`;
  }
  if (rewardBar) {
      const progressWidth = Math.min((totalShares / 1000) * 100, 100);
      rewardBar.style.width = `${progressWidth}%`;
  }

  // Reward Logic for Farm Access
  if (elements.benefitVisit) {
    let access = "View only";
    if (totalShares >= 1000) access = "Full Villa Access";
    else if (totalShares >= 500) access = "Day Visit Unlocked";
    render(elements.benefitVisit, access);
  }

  // 5. Ensure the banner is visible
  document.getElementById('stats')?.classList.remove('hidden');
};

// 👉 THIS LINE FIXES YOUR UI
(window as any).switchTab = switchTab;

//------refreshWalletBalances

import { getAssociatedTokenAddress } from "@solana/spl-token";

async function refreshWalletBalances(walletPubKey: any) {
    if (!walletPubKey || !(window as any)._connection) return;
    const connection = (window as any)._connection;
    const program = (window as any)._program;

    // The OVL Mint Address
    const OLV_MINT = new anchor.web3.PublicKey("47qeu9Mmcn3PU77Y6h3zKv39EUfhQjsgXskaYohPJ5sd");

    try {
        // 1. Fetch SOL
        const solBalance = (await connection.getBalance(walletPubKey)) / 1_000_000_000;

        // 2. Fetch OVL from ATA
        let totalOlv = 0;
        try {
            const ataAddress = await getAssociatedTokenAddress(OLV_MINT, walletPubKey);
            const tokenAccount = await connection.getTokenAccountBalance(ataAddress);
            totalOlv = tokenAccount.value.uiAmount || 0;
        } catch (e) {
            // ATA doesn't exist, balance is 0
            totalOlv = 0;
        }

        // 3. Update the UI IDs from your index.html
        const updateUI = (id: string, val: string) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        updateUI('wallet-sol-balance', solBalance.toFixed(3));
        updateUI('wallet-sol-usd', `$${(solBalance * 150).toFixed(2)}`); // Using $150/SOL

        updateUI('wallet-olv-balance', totalOlv.toLocaleString());
        updateUI('wallet-olv-usd', `$${(totalOlv * 0.50).toFixed(2)}`); // Using $0.50/OLV

        const totalUsd = (solBalance * 150) + (totalOlv * 0.50);
        updateUI('wallet-total-usd', `$${totalUsd.toLocaleString(undefined, {minimumFractionDigits: 2})}`);

    } catch (err) {
        console.error("[BALANCES] Failed to refresh:", err);
    }
}
// ══════════════════════════════════════════════════════════════
// RENDER ACTIVITY FEED
// ══════════════════════════════════════════════════════════════
function renderActivityFeed(activities: any[]) {
  const container = document.getElementById('activity-feed');
  const emptyState = document.getElementById('activity-empty');

  if (!container) return;

  if (activities.length === 0) {
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');

  container.innerHTML = activities.map(activity => `
    <div class="flex items-start gap-3 pb-3 border-b border-stone-100 last:border-0">
      <span class="text-lg shrink-0">${activity.icon}</span>
      <div class="flex-1 min-w-0">
        <p class="text-sm text-stone-700">${activity.text}</p>
        <p class="text-xs text-stone-400">${activity.time}</p>
      </div>
    </div>
  `).join('');
}

// ══════════════════════════════════════════════════════════════
// EXPORT FUNCTIONS
// ══════════════════════════════════════════════════════════════
(window as any).updateMyGroveDashboard = updateMyGroveDashboard;
(window as any).fetchWalletBalances = fetchWalletBalances;
(window as any).getSharePrice = getSharePrice;
