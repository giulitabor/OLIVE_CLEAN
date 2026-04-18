// ═══════════════════════════════════════════════════════════════════════════
// dashboard.ts — Complete UI Data Loading & Rendering
// ═══════════════════════════════════════════════════════════════════════════

import { PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";

// ═══════════════════════════════════════════════════════════════════════════
// GLOBAL STATS UPDATE
// ═══════════════════════════════════════════════════════════════════════════
export async function updateGlobalStats() {
  console.log("[DASHBOARD] Updating global stats...");

  const program = (window as any)._program;
  if (!program) {
    console.warn("[DASHBOARD] Program not initialized");
    return;
  }

  try {
    const trees = await program.account.tree.all();
    const positions = await program.account.sharePosition.all();

    const totalSharesSold = trees.reduce(
      (sum: number, t: any) => sum + t.account.sharesSold.toNumber(),
      0
    );

    const uniqueOwners = new Set(
      positions.map((p: any) => p.account.owner.toBase58())
    ).size;

    // Update UI elements
    const set = (id: string, value: string) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };

    set("totalTrees", trees.length.toString());
    set("totalShares", totalSharesSold.toLocaleString());
    set("activeMembers", uniqueOwners.toString());

    console.log("✅ Global stats updated:", {
      trees: trees.length,
      shares: totalSharesSold,
      members: uniqueOwners,
    });
  } catch (err) {
    console.error("[DASHBOARD] Failed to update stats:", err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LOAD & RENDER TREE GRID (Main Dashboard)
// ═══════════════════════════════════════════════════════════════════════════
export async function loadDashboardData() {
  console.log("[DASHBOARD] Loading tree data...");

  const program = (window as any)._program;
  const sb = (window as any)._sb;

  if (!program || !sb) {
    console.error("[DASHBOARD] Missing dependencies");
    return;
  }

  try {
    // Fetch in parallel
    const [treesOnChain, { data: treeMeta, error }] = await Promise.all([
      program.account.tree.all(),
      sb.from("tree_metadata").select("*"),
    ]);

    if (error) {
      console.error("[DASHBOARD] Supabase error:", error);
      throw error;
    }

    console.log(`✅ Fetched ${treesOnChain.length} trees from chain`);
    console.log(`✅ Fetched ${treeMeta?.length || 0} metadata rows`);

    // Render grid
    renderTreeGrid(treesOnChain, treeMeta || []);

    // Cache for later use
    (window as any)._cachedTrees = treesOnChain;
    (window as any)._cachedMeta = treeMeta;
  } catch (err) {
    console.error("[DASHBOARD] Failed to load tree data:", err);
    showError("Failed to load trees. Check console for details.");
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RENDER TREE CARDS
// ═══════════════════════════════════════════════════════════════════════════
function renderTreeGrid(onChainTrees: any[], supabaseMeta: any[]) {
  const grid = document.getElementById("tree-grid");
  if (!grid) {
    console.warn("[DASHBOARD] #tree-grid not found");
    return;
  }

  if (onChainTrees.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full text-center py-20">
        <p class="text-stone-400 text-lg">No trees available yet.</p>
        <p class="text-stone-500 text-sm mt-2">Check back soon!</p>
      </div>
    `;
    return;
  }

  const cards = onChainTrees
    .map((tree) => {
      const treeId = tree.account.treeId;
      const meta = supabaseMeta.find((m) => m.tree_id === treeId);

      const name = tree.account.name || "Unnamed Tree";
      const variety = meta?.variety || "Unknown Variety";
      const image = meta?.image || "https://placehold.co/400x300/5a7a2b/ffffff?text=Olive+Tree";
      const sold = tree.account.sharesSold.toString();
      const total = tree.account.totalShares.toString();
      const percentSold = ((parseInt(sold) / parseInt(total)) * 100).toFixed(0);

      return `
        <div class="tree-card bg-white rounded-2xl shadow-sm overflow-hidden border border-stone-200 hover:shadow-lg transition">
          <div class="relative">
            <img src="${image}"
                 class="w-full h-48 object-cover"
                 alt="${name}"
                 onerror="this.src='https://placehold.co/400x300/5a7a2b/ffffff?text=Olive+Tree'">
            <div class="absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-semibold">
              ${percentSold}% Adopted
            </div>
          </div>

          <div class="p-5">
            <h3 class="font-bold text-lg text-stone-900 mb-1">${name}</h3>
            <p class="text-sm text-stone-500 mb-3">${variety}</p>

            <!-- Progress Bar -->
            <div class="mb-3">
              <div class="flex justify-between text-xs text-stone-500 mb-1">
                <span>${sold} / ${total} shares</span>
                <span>${percentSold}%</span>
              </div>
              <div class="w-full bg-stone-100 rounded-full h-2 overflow-hidden">
                <div class="bg-gradient-to-r from-olive to-olive-d h-full transition-all duration-500 bar-fill"
                     style="width: ${percentSold}%"></div>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex gap-2 mt-4">
              <button onclick="openTreeDetail('${treeId}')"
                      class="flex-1 px-4 py-2 bg-white border border-stone-300 rounded-xl text-sm font-medium text-stone-700 hover:bg-stone-50 transition">
                View Details
              </button>
              <button onclick="adoptTree('${treeId}')"
                      class="flex-1 px-4 py-2 rounded-xl text-sm font-semibold text-white transition"
                      style="background: var(--olive)"
                      onmouseover="this.style.background='var(--olive-d)'"
                      onmouseout="this.style.background='var(--olive)'">
                Adopt
              </button>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  grid.innerHTML = cards;
  console.log(`✅ Rendered ${onChainTrees.length} tree cards`);
}

// ═══════════════════════════════════════════════════════════════════════════
// LOAD MY GROVE DATA (User's Positions)
// ═══════════════════════════════════════════════════════════════════════════
export async function loadMyGroveData() {
  console.log("[GROVE] Loading user positions...");

  const program = (window as any)._program;
  const wallet = (window as any).walletPubKey;
  const sb = (window as any)._sb;

  if (!program || !wallet) {
    console.warn("[GROVE] Missing program or wallet");
    return;
  }

  try {
    // Fetch user's positions
    const positions = await program.account.sharePosition.all([
      { memcmp: { offset: 8, bytes: wallet.toBase58() } },
    ]);

    console.log(`✅ Found ${positions.length} positions for user`);

    if (positions.length === 0) {
      renderEmptyGrove();
      return;
    }

    // For each position, get tree details
    const groveData = await Promise.all(
      positions.map(async (pos: any) => {
        const treeId = pos.account.treeId;

        // Get tree PDA
        const [treePda] = PublicKey.findProgramAddressSync(
          [Buffer.from("tree"), Buffer.from(treeId)],
          program.programId
        );

        const tree = await program.account.tree.fetch(treePda);

        // Get metadata from Supabase
        const { data: meta } = await sb
          .from("tree_metadata")
          .select("*")
          .eq("tree_id", treeId)
          .single();

        return {
          position: pos.account,
          tree,
          meta,
          treeId,
        };
      })
    );

    renderMyGrove(groveData);
  } catch (err) {
    console.error("[GROVE] Failed to load positions:", err);
    renderEmptyGrove();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RENDER MY GROVE
// ═══════════════════════════════════════════════════════════════════════════
function renderMyGrove(groveData: any[]) {
  const container = document.getElementById("grove-position-list");
  if (!container) {
    console.warn("[GROVE] #grove-position-list not found");
    return;
  }

  // Calculate totals
  const totalShares = groveData.reduce(
    (sum, item) => sum + item.position.sharesOwned.toNumber(),
    0
  );
  const totalTrees = groveData.length;

  // Update summary stats
  const set = (id: string, value: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  set("user-total-shares", totalShares.toLocaleString());
  set("user-tree-count", totalTrees.toString());

  // Calculate tier
  const tier =
    totalShares >= 100
      ? "Guardian"
      : totalShares >= 50
      ? "Eco-Warrior"
      : totalShares >= 10
      ? "Olive Lover"
      : "Sprout";
  set("user-tier-badge", tier);

  // Render position cards
  const cards = groveData
    .map((item) => {
      const shares = item.position.sharesOwned.toString();
      const name = item.tree.name || "Unnamed Tree";
      const variety = item.meta?.variety || "Unknown";
      const image = item.meta?.image || "https://placehold.co/200x150/5a7a2b/ffffff?text=Tree";

      return `
        <div class="bg-white border border-stone-200 rounded-xl p-4 hover:shadow-md transition">
          <div class="flex gap-4">
            <img src="${image}"
                 class="w-20 h-20 rounded-lg object-cover"
                 alt="${name}"
                 onerror="this.src='https://placehold.co/200x150/5a7a2b/ffffff?text=Tree'">
            <div class="flex-1">
              <h4 class="font-bold text-stone-900">${name}</h4>
              <p class="text-sm text-stone-500">${variety}</p>
              <p class="text-xs text-stone-400 mt-1">Tree ID: ${item.treeId}</p>
            </div>
            <div class="text-right">
              <p class="text-2xl font-bold" style="color: var(--olive)">${shares}</p>
              <p class="text-xs text-stone-400">shares</p>
            </div>
          </div>
          <div class="mt-3 flex gap-2">
            <button onclick="openTreeDetail('${item.treeId}')"
                    class="flex-1 px-3 py-1.5 border border-stone-300 rounded-lg text-xs font-medium hover:bg-stone-50">
              View Tree
            </button>
            <button onclick="claimRewards('${item.treeId}')"
                    class="flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                    style="background: var(--gold)">
              Claim Rewards
            </button>
          </div>
        </div>
      `;
    })
    .join("");

  container.innerHTML = cards;
  console.log(`✅ Rendered ${groveData.length} grove positions`);
}

// ═══════════════════════════════════════════════════════════════════════════
// RENDER EMPTY GROVE
// ═══════════════════════════════════════════════════════════════════════════
function renderEmptyGrove() {
  const container = document.getElementById("grove-position-list");
  if (!container) return;

  container.innerHTML = `
    <div class="text-center py-20">
      <div class="text-6xl mb-4">🌱</div>
      <h3 class="text-xl font-bold text-stone-700 mb-2">Your Grove is Empty</h3>
      <p class="text-stone-500 mb-6">Adopt your first olive tree to get started!</p>
      <button onclick="switchTab('home')"
              class="px-6 py-3 rounded-xl text-white font-semibold"
              style="background: var(--olive)">
        Browse Trees
      </button>
    </div>
  `;

  // Reset stats
  const set = (id: string, value: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  set("user-total-shares", "0");
  set("user-tree-count", "0");
  set("user-tier-badge", "None");
}

// ═══════════════════════════════════════════════════════════════════════════
// TREE DETAIL MODAL
// ═══════════════════════════════════════════════════════════════════════════
export async function openTreeDetail(treeId: string) {
  console.log(`[DETAIL] Opening tree ${treeId}...`);

  const program = (window as any)._program;
  const sb = (window as any)._sb;

  if (!program || !sb) return;

  try {
    // Fetch tree from chain
    const [treePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("tree"), Buffer.from(treeId)],
      program.programId
    );
    const tree = await program.account.tree.fetch(treePda);

    // Fetch metadata
    const { data: meta } = await sb
      .from("tree_metadata")
      .select("*")
      .eq("tree_id", treeId)
      .single();

    // Populate modal fields
    const set = (id: string, value: string) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };

    set("tree-detail-name", tree.name || "Unknown Tree");
    set("tree-detail-variety", meta?.variety || "Unknown");
    set("tree-detail-location", meta?.location || "Tuscany, Italy");
    set("tree-detail-meta-id", treeId);
    set("tree-detail-meta-sold", tree.sharesSold.toString());
    set("tree-detail-meta-total", tree.totalShares.toString());
    set("tree-detail-meta-date", meta?.created_at ? new Date(meta.created_at).toLocaleDateString() : "—");

    // Show modal
    const modal = document.getElementById("modal-tree-detail");
    if (modal) {
      modal.classList.remove("hidden");
      modal.classList.add("flex");
    }

    console.log(`✅ Tree detail opened for ${treeId}`);
  } catch (err) {
    console.error("[DETAIL] Failed to load tree:", err);
    showError("Failed to load tree details");
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY: SHOW ERROR TOAST
// ═══════════════════════════════════════════════════════════════════════════
function showError(message: string) {
  // You can implement a proper toast system
  console.error(message);
  alert(message); // Fallback
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPOSE TO WINDOW
// ═══════════════════════════════════════════════════════════════════════════
(window as any).updateGlobalStats = updateGlobalStats;
(window as any).loadDashboardData = loadDashboardData;
(window as any).loadMyGroveData = loadMyGroveData;
(window as any).openTreeDetail = openTreeDetail;

console.log("[dashboard.ts] ✅ Module loaded");
