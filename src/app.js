// ===================================================================
// San Carlo Local Market — Complete Working App
// ===================================================================

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  document.body.innerHTML = `
    <div style="font-family:sans-serif;max-width:520px;margin:60px auto;padding:24px;
                border:1px solid #e3a;border-radius:10px;background:#fff5f5;">
      <h2 style="margin-top:0;">Missing Supabase credentials</h2>
      <p>Create a <code>.env</code> file with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY</p>
    </div>`;
  throw new Error("Missing Supabase credentials");
}

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// GLOBAL STATE
// ============================================================
let currentUser = null;
let currentProfile = null;
let listingsCache = [];
let cart = [];
let authMode = "signin";
let activeDashTab = "listings";

// ============================================================
// DOM HELPERS
// ============================================================
const el = (id) => document.getElementById(id);
const show = (el) => el?.classList.remove("hidden");
const hide = (el) => el?.classList.add("hidden");

// ============================================================
// AUTH
// ============================================================
async function refreshSession() {
  try {
    const { data: { session } } = await db.auth.getSession();
    currentUser = session?.user || null;

    if (currentUser) {
      try {
        // First try to get the profile
        const { data: profile, error } = await db
          .from("profiles")
          .select("*")
          .eq("id", currentUser.id)
          .single();

        if (error || !profile) {
          console.log("Profile not found, creating one...");

          // Create profile if it doesn't exist
          const { data: newProfile, error: createError } = await db
            .from("profiles")
            .insert({
              id: currentUser.id,
              full_name: currentUser.user_metadata?.full_name || currentUser.email || 'User',
              role: 'customer',
              is_grower: false
            })
            .select()
            .single();

          if (createError) {
            console.error("Error creating profile:", createError);
            currentProfile = null;
          } else {
            currentProfile = newProfile;
            console.log("✅ Profile created:", currentProfile);
          }
        } else {
          currentProfile = profile;
          console.log("✅ Profile loaded:", currentProfile);
        }
      } catch (e) {
        console.error("Profile error:", e);
        currentProfile = null;
      }
    } else {
      currentProfile = null;
    }

    updateUI();
    await loadListings();

    if (currentUser && currentProfile) {
      await loadMyOrders();
      if (currentProfile.is_grower) {
        await loadMyListings();
        await loadIncomingOrders();
      }
      if (currentProfile.role === "admin") {
        await loadAdminPanel();
      }
    }
  } catch (e) {
    console.error("Refresh session error:", e);
  }
}

// ============================================================
// ADMIN DASHBOARD - Enhanced
// ============================================================
async function loadAdminPanel() {
  const container = el("adminPanel");
  if (!container || !currentUser) return;

  // Check if user is admin
  if (currentProfile?.role !== "admin") {
    container.innerHTML = `<div class="empty-state"><div class="big">🔒</div><h3>Access Denied</h3><p>You don't have admin permissions.</p></div>`;
    return;
  }

  container.innerHTML = `<div class="loading-spinner">Loading admin data...</div>`;

  try {
    // Get all stats
    const [
      { count: totalUsers },
      { count: totalListings },
      { count: activeListings },
      { count: totalOrders },
      { count: pendingOrders },
      { count: totalFarmers }
    ] = await Promise.all([
      db.from("profiles").select("count", { count: "exact", head: true }),
      db.from("listings").select("count", { count: "exact", head: true }),
      db.from("listings").select("count", { count: "exact", head: true }).eq("is_active", true),
      db.from("orders").select("count", { count: "exact", head: true }),
      db.from("orders").select("count", { count: "exact", head: true }).eq("status", "pending"),
      db.from("profiles").select("count", { count: "exact", head: true }).eq("is_grower", true),
    ]);

    container.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <span class="icon">👤</span>
          <div class="number">${totalUsers || 0}</div>
          <div class="label">Total Users</div>
        </div>
        <div class="stat-card">
          <span class="icon">🌱</span>
          <div class="number">${totalListings || 0}</div>
          <div class="label">Total Listings</div>
          <div style="font-size:12px;color:var(--muted);">${activeListings || 0} active</div>
        </div>
        <div class="stat-card">
          <span class="icon">📦</span>
          <div class="number">${totalOrders || 0}</div>
          <div class="label">Total Orders</div>
          <div style="font-size:12px;color:var(--muted);">${pendingOrders || 0} pending</div>
        </div>
        <div class="stat-card">
          <span class="icon">🧑‍🌾</span>
          <div class="number">${totalFarmers || 0}</div>
          <div class="label">Farmers</div>
        </div>
      </div>

      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px;">
        <button class="btn btn-secondary" id="adminRefresh">🔄 Refresh Data</button>
        <button class="btn btn-outline" id="adminClean">🧹 Hide Inactive Listings</button>
        <button class="btn btn-danger" id="adminDeleteAll">⚠️ Delete All Listings</button>
      </div>

      <div id="adminMsg" style="margin-bottom:16px;"></div>

      <div style="background:white;border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-top:16px;">
        <h4 style="margin:0 0 12px;color:var(--green-900);">📋 Recent Activity</h4>
        <div id="adminActivity">
          <div class="loading-spinner" style="padding:20px;">Loading activity...</div>
        </div>
      </div>
    `;

    // Load recent activity
    await loadAdminActivity();

    // Bind buttons
    el("adminRefresh")?.addEventListener("click", () => loadAdminPanel());

    el("adminClean")?.addEventListener("click", async () => {
      if (confirm("Hide all inactive listings? This marks them as unavailable.")) {
        const { error } = await db
          .from("listings")
          .update({ is_active: false })
          .eq("is_active", true);
        const msg = el("adminMsg");
        if (msg) msg.innerHTML = error
          ? `<div class="form-msg error">❌ ${error.message}</div>`
          : `<div class="form-msg success">✅ All active listings have been hidden!</div>`;
        loadAdminPanel();
      }
    });

    el("adminDeleteAll")?.addEventListener("click", async () => {
      if (confirm("⚠️ DELETE ALL LISTINGS? This cannot be undone!")) {
        if (confirm("Are you absolutely sure?")) {
          const { error } = await db
            .from("listings")
            .delete()
            .neq("id", "00000000-0000-0000-0000-000000000000");
          const msg = el("adminMsg");
          if (msg) msg.innerHTML = error
            ? `<div class="form-msg error">❌ ${error.message}</div>`
            : `<div class="form-msg success">✅ All listings have been deleted!</div>`;
          loadAdminPanel();
        }
      }
    });

  } catch (e) {
    container.innerHTML = `<div class="empty-state">Error: ${escapeHtml(e.message)}</div>`;
  }
}

async function L_loadAdminActivity() {
  const container = el("adminActivity");
  if (!container) return;

  try {
    const { data: orders, error } = await db
      .from("orders")
      .select("*, profiles:buyer_id(full_name), order_items(count)")
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) throw error;

    if (!orders || orders.length === 0) {
      container.innerHTML = `<div class="empty-state" style="padding:20px;">No recent activity</div>`;
      return;
    }

    container.innerHTML = orders.map(o => `
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;">
        <div>
          <strong>Order #${o.id.slice(0,8)}</strong>
          <span style="color:var(--muted);">by ${escapeHtml(o.profiles?.full_name || 'Unknown')}</span>
        </div>
        <div>
          <span class="status-badge status-${o.status}">${escapeHtml(o.status)}</span>
          <span style="color:var(--muted);font-size:12px;margin-left:8px;">${timeAgo(o.created_at)}</span>
        </div>
      </div>
    `).join("");
  } catch (e) {
    container.innerHTML = `<div class="empty-state" style="padding:20px;">Error loading activity</div>`;
  }
}

// ============================================================
// ADMIN - ALL LISTINGS
// ============================================================
async function loadAdminListings() {
  const container = el("adminListings");
  if (!container) return;

  container.innerHTML = `<div class="loading-spinner">Loading all listings...</div>`;

  try {
    const { data, error } = await db
      .from("listings")
      .select("*, profiles:grower_id(full_name, farm_name)")
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      container.innerHTML = `<div class="empty-state">No listings found</div>`;
      return;
    }

    container.innerHTML = `
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;background:white;border-radius:var(--radius);overflow:hidden;">
          <thead style="background:var(--green-900);color:white;">
            <tr>
              <th style="padding:12px;text-align:left;">Item</th>
              <th style="padding:12px;text-align:left;">Grower</th>
              <th style="padding:12px;text-align:right;">Price</th>
              <th style="padding:12px;text-align:center;">Stock</th>
              <th style="padding:12px;text-align:center;">Status</th>
              <th style="padding:12px;text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${data.map(l => `
              <tr style="border-bottom:1px solid var(--border);">
                <td style="padding:10px 12px;">
                  <div style="display:flex;align-items:center;gap:10px;">
                    ${l.image_url
                      ? `<img src="${escapeHtml(l.image_url)}" style="width:40px;height:40px;border-radius:6px;object-fit:cover;" />`
                      : `<div style="width:40px;height:40px;border-radius:6px;background:var(--green-100);display:flex;align-items:center;justify-content:center;font-size:20px;">${categoryEmoji(l.category)}</div>`
                    }
                    <div>
                      <strong>${escapeHtml(l.title)}</strong>
                      <div style="font-size:12px;color:var(--muted);">${escapeHtml(l.category)}</div>
                    </div>
                  </div>
                </td>
                <td style="padding:10px 12px;">${escapeHtml(l.profiles?.farm_name || l.profiles?.full_name || 'Unknown')}</td>
                <td style="padding:10px 12px;text-align:right;font-weight:600;">${formatMoney(l.price)}</td>
                <td style="padding:10px 12px;text-align:center;">${l.quantity_available}</td>
                <td style="padding:10px 12px;text-align:center;">
                  <span class="status-badge ${l.is_active ? 'status-ready' : 'status-cancelled'}">${l.is_active ? 'Active' : 'Hidden'}</span>
                </td>
                <td style="padding:10px 12px;text-align:right;">
                  <button class="btn btn-small btn-outline" onclick="window.toggleListing('${l.id}', ${l.is_active})">${l.is_active ? 'Hide' : 'Show'}</button>
                  <button class="btn btn-small btn-danger" onclick="window.deleteListing('${l.id}')">Delete</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Add global functions for admin actions
    window.toggleListing = async (id, isActive) => {
      await db.from("listings").update({ is_active: !isActive }).eq("id", id);
      loadAdminListings();
    };

    window.deleteListing = async (id) => {
      if (confirm("Delete this listing?")) {
        await db.from("listings").delete().eq("id", id);
        loadAdminListings();
      }
    };

  } catch (e) {
    container.innerHTML = `<div class="empty-state">Error: ${escapeHtml(e.message)}</div>`;
  }
}

// ============================================================
// ADMIN - ALL ORDERS
// ============================================================
async function loadAdminOrders() {
  const container = el("adminOrders");
  if (!container) return;

  container.innerHTML = `<div class="loading-spinner">Loading all orders...</div>`;

  try {
    const { data, error } = await db
      .from("orders")
      .select("*, profiles:buyer_id(full_name), order_items(*, listings(title))")
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      container.innerHTML = `<div class="empty-state">No orders found</div>`;
      return;
    }

    container.innerHTML = data.map(o => {
      const items = o.order_items || [];
      const total = items.reduce((sum, it) => sum + it.quantity * it.price_at_order, 0);
      return `
        <div class="order-card">
          <div class="order-card-head">
            <div>
              <h3>Order #${o.id.slice(0,8)}</h3>
              <div class="when">${timeAgo(o.created_at)} · ${escapeHtml(o.profiles?.full_name || 'Unknown')}</div>
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
              <span class="status-badge status-${o.status}">${escapeHtml(o.status)}</span>
              <select onchange="window.updateOrderStatus('${o.id}', this.value)" style="padding:4px 8px;border-radius:6px;border:2px solid var(--border);font-size:12px;">
                <option value="pending" ${o.status === 'pending' ? 'selected' : ''}>pending</option>
                <option value="confirmed" ${o.status === 'confirmed' ? 'selected' : ''}>confirmed</option>
                <option value="ready" ${o.status === 'ready' ? 'selected' : ''}>ready</option>
                <option value="completed" ${o.status === 'completed' ? 'selected' : ''}>completed</option>
                <option value="cancelled" ${o.status === 'cancelled' ? 'selected' : ''}>cancelled</option>
              </select>
            </div>
          </div>
          ${items.map(it => `
            <div class="order-item-row">
              <div class="left">
                <strong>${escapeHtml(it.listings?.title || 'Item')}</strong>
                <span>${it.quantity} × ${formatMoney(it.price_at_order)}</span>
              </div>
              <span>${formatMoney(it.quantity * it.price_at_order)}</span>
            </div>
          `).join('')}
          <div style="display:flex;justify-content:space-between;margin-top:12px;font-weight:700;border-top:1px solid var(--border);padding-top:12px;">
            <span>Total</span>
            <span style="color:var(--tomato);">${formatMoney(total)}</span>
          </div>
          ${o.pickup_note ? `<div class="card-meta" style="margin-top:8px;">📝 ${escapeHtml(o.pickup_note)}</div>` : ''}
        </div>
      `;
    }).join('');

    window.updateOrderStatus = async (id, status) => {
      await db.from("orders").update({ status }).eq("id", id);
      loadAdminOrders();
    };

  } catch (e) {
    container.innerHTML = `<div class="empty-state">Error: ${escapeHtml(e.message)}</div>`;
  }
}
function updateUI() {
  const authArea = el("authArea");
const growerTabBtn = el("growerTabBtn");
// Added Notification Selectors
const farmerNotificationArea = el("farmerNotificationArea");
const farmerNotificationCount = el("farmerNotificationCount");
const farmerNotificationBtn = el("farmerNotificationBtn");
  const adminTab = el("adminTabBtn");
  const cartFab = el("cartFab");

  if (currentUser && currentProfile) {
    const name = currentProfile.full_name || currentUser.email;
    authArea.innerHTML = `
      <div class="user-pill">👤 ${escapeHtml(name)}</div>
      <button class="btn btn-ghost btn-small" id="signOutBtn">Sign Out</button>
    `;
    el("signOutBtn").onclick = signOut;

    // Show/hide tabs based on role
    if (growerTab) growerTab.classList.toggle("hidden", !currentProfile.is_grower);
    if (adminTab) adminTab.classList.toggle("hidden", currentProfile.role !== "admin");
    if (cartFab) cartFab.classList.remove("hidden");
  } else {
    authArea.innerHTML = `
      <button class="btn btn-ghost" id="signInBtn">Sign In</button>
      <button class="btn btn-primary" id="signUpBtn">Sign Up</button>
    `;
    el("signInBtn").onclick = () => openAuthModal("signin");
    el("signUpBtn").onclick = () => openAuthModal("signup");
    if (growerTab) growerTab.classList.add("hidden");
    if (adminTab) adminTab.classList.add("hidden");
    if (cartFab) cartFab.classList.add("hidden");
    setView("browse");
  }
}

async function signOut() {
  await db.auth.signOut();
  currentUser = null;
  currentProfile = null;
  cart = [];
  updateCartUI();
  updateUI();
  setView("browse");
}

// ============================================================
// AUTH MODAL
// ============================================================
function openAuthModal(mode) {
  authMode = mode;
  const modal = el("authModal");
  const msg = el("authFormMsg");
  if (msg) msg.innerHTML = "";

  // Clear fields
  ["auth_email", "auth_password", "auth_fullname", "auth_farmname"].forEach(id => {
    const field = el(id);
    if (field) field.value = "";
  });
  const isGrower = el("auth_isgrower");
  if (isGrower) isGrower.checked = false;

  updateAuthModalUI();
  if (modal) modal.classList.remove("hidden");
}

function updateAuthModalUI() {
  const isSignin = authMode === "signin";
  const title = el("authModalTitle");
  const sub = el("authModalSub");
  const fullNameField = el("fullNameField");
  const farmNameField = el("farmNameField");
  const growerCheck = el("growerCheckRow");
  const submitBtn = el("authSubmitBtn");
  const switchRow = el("authSwitchRow");

  if (title) title.textContent = isSignin ? "Sign In" : "Sign Up";
  if (sub) sub.textContent = isSignin ? "Welcome back!" : "Join San Carlo Market";
  if (fullNameField) fullNameField.classList.toggle("hidden", isSignin);
  if (farmNameField) farmNameField.classList.toggle("hidden", isSignin);
  if (growerCheck) growerCheck.classList.toggle("hidden", isSignin);
  if (submitBtn) submitBtn.textContent = isSignin ? "Sign In" : "Create Account";

  if (switchRow) {
    switchRow.innerHTML = isSignin
      ? `Don't have an account? <button id="switchToSignUp">Sign up</button>`
      : `Already have an account? <button id="switchToSignIn">Sign in</button>`;

    const switchBtn = el(isSignin ? "switchToSignUp" : "switchToSignIn");
    if (switchBtn) switchBtn.onclick = () => {
      authMode = isSignin ? "signup" : "signin";
      updateAuthModalUI();
    };
  }
}

function closeAuthModal() {
  const modal = el("authModal");
  if (modal) modal.classList.add("hidden");
}

// Auth event listeners
document.addEventListener("DOMContentLoaded", () => {
  const closeBtn = el("closeAuthModal");
  const modal = el("authModal");
  const submitBtn = el("authSubmitBtn");

  if (closeBtn) closeBtn.onclick = closeAuthModal;
  if (modal) modal.addEventListener("click", (e) => { if (e.target === modal) closeAuthModal(); });
  if (submitBtn) submitBtn.onclick = handleAuthSubmit;
});

async function handleAuthSubmit() {
  const email = el("auth_email")?.value.trim() || "";
  const password = el("auth_password")?.value || "";
  const msg = el("authFormMsg");
  if (msg) msg.innerHTML = "";

  if (!email || !password) {
    if (msg) showFormMsg(msg, "Please enter email and password", "error");
    return;
  }

  const submitBtn = el("authSubmitBtn");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Please wait...";
  }

  try {
    if (authMode === "signup") {
      const fullName = el("auth_fullname")?.value.trim() || "";
      const farmName = el("auth_farmname")?.value.trim() || "";
      const isGrower = el("auth_isgrower")?.checked || false;

      const { data, error } = await db.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) throw error;

      if (data.user) {
        // Create profile
        const role = isGrower ? "farmer" : "customer";
        await db.from("profiles").insert({
          id: data.user.id,
          full_name: fullName,
          farm_name: isGrower ? farmName : null,
          is_grower: isGrower,
          role: role
        });
      }

      if (!data.session) {
        if (msg) showFormMsg(msg, "Account created! Check your email to confirm.", "success");
        return;
      }
    } else {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }

    closeAuthModal();
    await refreshSession();
  } catch (err) {
    if (msg) showFormMsg(msg, err.message || "Something went wrong", "error");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = authMode === "signin" ? "Sign In" : "Create Account";
    }
  }
}

// ============================================================
// NAVIGATION
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  const mainNav = el("mainNav");
  if (mainNav) {
    mainNav.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-view]");
      if (!btn) return;
      const view = btn.dataset.view;
      if ((view === "growerDash" || view === "adminDash") && !currentUser) {
        openAuthModal("signin");
        return;
      }
      setView(view);
    });
  }

  const dashTabs = el("dashTabs");
  if (dashTabs) {
    dashTabs.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-dash]");
      if (!btn) return;
      activeDashTab = btn.dataset.dash;
      document.querySelectorAll("#dashTabs button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      const listings = el("dash-listings");
      const incoming = el("dash-incoming");
      const adminPanel = el("dash-admin");

      if (listings) listings.classList.toggle("hidden", activeDashTab !== "listings");
      if (incoming) incoming.classList.toggle("hidden", activeDashTab !== "incoming");
      if (adminPanel) adminPanel.classList.toggle("hidden", activeDashTab !== "admin");

      if (activeDashTab === "incoming") loadIncomingOrders();
      if (activeDashTab === "admin") loadAdminPanel();
    });
  }
});

function setView(view) {
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  const target = el("view-" + view);
  if (target) target.classList.add("active");

  document.querySelectorAll("#mainNav button").forEach(b => b.classList.remove("active"));
  const navBtn = document.querySelector(`#mainNav button[data-view="${view}"]`);
  if (navBtn) navBtn.classList.add("active");

  if (view === "myOrders" && currentUser) loadMyOrders();
  if (view === "growerDash" && currentUser) {
    loadMyListings();
    loadIncomingOrders();
  }
  if (view === "adminDash" && currentUser) {
    loadAdminPanel();
    // Also load admin tabs
    const adminTabs = el("adminDashTabs");
    if (adminTabs) {
      adminTabs.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-dash]");
        if (!btn) return;
        const tab = btn.dataset.dash;
        document.querySelectorAll("#adminDashTabs button").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        const overview = el("dash-admin");
        const listings = el("dash-listings");
        const orders = el("dash-incoming");

        if (overview) overview.classList.toggle("hidden", tab !== "admin");
        if (listings) listings.classList.toggle("hidden", tab !== "listings");
        if (orders) orders.classList.toggle("hidden", tab !== "incoming");

        if (tab === "listings") loadAdminListings();
        if (tab === "incoming") loadAdminOrders();
      });
    }
  }
}
// ============================================================
// UTILITY FUNCTIONS
// ============================================================
function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatMoney(n) {
  return "$" + (Number(n) || 0).toFixed(2);
}

function timeAgo(dateStr) {
  if (!dateStr) return "recently";
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function categoryEmoji(cat) {
  return { vegetable: "🥕", fruit: "🍓", herb: "🌿", other: "🧺" }[cat] || "🧺";
}

function showFormMsg(container, msg, type) {
  if (!container) return;
  container.innerHTML = `<div class="form-msg ${type}">${escapeHtml(msg)}</div>`;
}

// ============================================================
// BROWSE LISTINGS
// ============================================================
async function loadListings() {
  const grid = el("listingsGrid");
  if (!grid) return;
  grid.innerHTML = `<div class="loading-spinner">Loading fresh produce...</div>`;

  try {
    const { data, error } = await db
      .from("listings")
      .select("*, profiles:grower_id(full_name, farm_name)")
      .eq("is_active", true)
      .gt("quantity_available", 0)
      .order("created_at", { ascending: false });

    if (error) throw error;
    listingsCache = data || [];
    renderListings();
  } catch (e) {
    grid.innerHTML = `<div class="empty-state">Error: ${escapeHtml(e.message)}</div>`;
  }
}

function renderAuthArea() {
  if (currentUser && currentProfile) {
    const name = currentProfile.full_name || currentUser.email;
    authArea.innerHTML = `
      <div class="user-pill">👤 ${escapeHtml(name)}</div>
      <button class="btn btn-ghost btn-small" id="signOutBtn">Sign Out</button>
    `;
    el("signOutBtn").onclick = signOut;
    growerTabBtn.classList.toggle("hidden", !currentProfile.is_grower);

    // Show/Hide notification bell based on grower flag
    if (farmerNotificationArea) {
      farmerNotificationArea.classList.toggle("hidden", !currentProfile.is_grower);
      if (currentProfile.is_grower) updateFarmerNotificationCount();
    }

    cartFab.classList.remove("hidden");
  } else {
    authArea.innerHTML = `
      <button class="btn btn-ghost" id="signInBtn">Sign In</button>
      <button class="btn btn-primary" id="signUpBtn">Sign Up</button>
    `;
    el("signInBtn").onclick = () => openAuthModal("signin");
    el("signUpBtn").onclick = () => openAuthModal("signup");
    growerTabBtn.classList.add("hidden");

    if (farmerNotificationArea) farmerNotificationArea.classList.add("hidden");
    cartFab.classList.add("hidden");
    if (document.getElementById("view-growerDash").classList.contains("active")) {
      setView("browse");
    }
  }
}

async function updateFarmerNotificationCount() {
  if (!currentUser || !currentProfile || !currentProfile.is_grower) return;

  // Count items assigned to this grower that are still 'pending'
  const { count, error } = await db
    .from("order_items")
    .select("*", { count: "exact", head: true })
    .eq("grower_id", currentUser.id)
    .eq("item_status", "pending");

  if (!error && farmerNotificationCount) {
    farmerNotificationCount.textContent = count;
    // Visually dim the badge if there are zero pending alerts
    farmerNotificationCount.style.display = count > 0 ? "block" : "none";
  }
}

// Hook it into the incoming order tab tracking loop so it auto-decrements when they change status
const originalLoadIncomingOrders = loadIncomingOrders;
loadIncomingOrders = async function() {
  await originalLoadIncomingOrders();
  updateFarmerNotificationCount();
};
function renderListings() {
  const grid = el("listingsGrid");
  if (!grid) return;

  const search = el("searchInput")?.value.trim().toLowerCase() || "";
  const cat = el("categoryFilter")?.value || "all";

  let items = listingsCache.filter(l => {
    const matchesSearch = !search || l.title.toLowerCase().includes(search) || (l.description || "").toLowerCase().includes(search);
    const matchesCat = cat === "all" || l.category === cat;
    return matchesSearch && matchesCat;
  });

  if (items.length === 0) {
    grid.innerHTML = `<div class="empty-state"><div class="big">🌱</div>No produce matches right now.</div>`;
    return;
  }

  grid.innerHTML = items.map(l => {
    const growerName = l.profiles?.farm_name || l.profiles?.full_name || "Local grower";
    const low = l.quantity_available <= 3;
    return `
      <div class="card">
        ${l.image_url
          ? `<img class="card-img" src="${escapeHtml(l.image_url)}" alt="${escapeHtml(l.title)}" />`
          : `<div class="card-img placeholder">${categoryEmoji(l.category)}</div>`
        }
        <div class="card-body">
          <span class="tag">${escapeHtml(l.category)}</span>
          <h3>${escapeHtml(l.title)}</h3>
          <div class="card-meta">by ${escapeHtml(growerName)}</div>
          ${l.description ? `<div class="card-desc">${escapeHtml(l.description)}</div>` : ""}
          <div class="card-price-row">
            <div class="price">${formatMoney(l.price)} <span>/ ${escapeHtml(l.unit)}</span></div>
            <div class="stock ${low ? "low" : ""}">${l.quantity_available} ${escapeHtml(l.unit)} left</div>
          </div>
        </div>
        <div class="card-footer">
          <input type="number" min="0.5" step="0.5" value="1" class="qty-input" data-qty-for="${l.id}" />
          <button class="btn btn-secondary btn-small" data-add-to-cart="${l.id}" style="flex:1;">Add to Cart</button>
        </div>
      </div>
    `;
  }).join("");

  grid.querySelectorAll("[data-add-to-cart]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (!currentUser) { openAuthModal("signin"); return; }
      const id = btn.dataset.addToCart;
      const qtyInput = grid.querySelector(`[data-qty-for="${id}"]`);
      const qty = parseFloat(qtyInput?.value || 1);
      if (qty > 0) addToCart(id, qty);
    });
  });
}

// Search listeners
document.addEventListener("DOMContentLoaded", () => {
  const search = el("searchInput");
  const filter = el("categoryFilter");
  if (search) search.addEventListener("input", renderListings);
  if (filter) filter.addEventListener("change", renderListings);
});

// ============================================================
// CART
// ============================================================
function addToCart(listingId, qty) {
  const listing = listingsCache.find(l => l.id === listingId);
  if (!listing) return;

  const existing = cart.find(c => c.listing_id === listingId);
  const newQty = (existing ? existing.qty : 0) + qty;

  if (newQty > listing.quantity_available) {
    alert(`Only ${listing.quantity_available} ${listing.unit} available.`);
    return;
  }

  if (existing) {
    existing.qty = newQty;
  } else {
    cart.push({
      listing_id: listing.id,
      title: listing.title,
      price: listing.price,
      unit: listing.unit,
      qty: qty,
      grower_id: listing.grower_id,
    });
  }
  updateCartUI();
  openCart();
}

function removeFromCart(listingId) {
  cart = cart.filter(c => c.listing_id !== listingId);
  updateCartUI();
}

function updateCartUI() {
  const count = el("cartCount");
  const items = el("cartItems");
  const total = el("cartTotal");

  if (count) count.textContent = cart.length;

  if (cart.length === 0) {
    if (items) items.innerHTML = `<div class="empty-state">Your cart is empty.</div>`;
    if (total) total.textContent = formatMoney(0);
    return;
  }

  if (items) {
    items.innerHTML = cart.map(c => `
      <div class="cart-line">
        <div class="info">
          <strong>${escapeHtml(c.title)}</strong>
          <span>${c.qty} ${escapeHtml(c.unit)} × ${formatMoney(c.price)}</span>
        </div>
        <div style="text-align:right;">
          <div>${formatMoney(c.qty * c.price)}</div>
          <button class="remove" data-remove="${c.listing_id}">Remove</button>
        </div>
      </div>
    `).join("");

    items.querySelectorAll("[data-remove]").forEach(btn => {
      btn.addEventListener("click", () => removeFromCart(btn.dataset.remove));
    });
  }

  const sum = cart.reduce((s, c) => s + c.qty * c.price, 0);
  if (total) total.textContent = formatMoney(sum);
}

function openCart() {
  const panel = el("cartPanel");
  const overlay = el("cartOverlay");
  if (panel) panel.classList.add("open");
  if (overlay) overlay.classList.add("open");
}

function closeCart() {
  const panel = el("cartPanel");
  const overlay = el("cartOverlay");
  if (panel) panel.classList.remove("open");
  if (overlay) overlay.classList.remove("open");
}

// Cart event listeners
document.addEventListener("DOMContentLoaded", () => {
  const fab = el("cartFab");
  const close = el("closeCartBtn");
  const overlay = el("cartOverlay");
  const checkout = el("checkoutBtn");

  if (fab) fab.addEventListener("click", openCart);
  if (close) close.addEventListener("click", closeCart);
  if (overlay) overlay.addEventListener("click", closeCart);
  if (checkout) checkout.addEventListener("click", placeOrder);
});

// ============================================================
// PLACE ORDER
// ============================================================
async function placeOrder() {
  const msgEl = el("checkoutMsg");
  if (!msgEl) return;
  msgEl.innerHTML = "";

  if (!currentUser) {
    openAuthModal("signin");
    return;
  }

  if (cart.length === 0) {
    showFormMsg(msgEl, "Your cart is empty.", "error");
    return;
  }

  const checkoutBtn = el("checkoutBtn");
  checkoutBtn.disabled = true;
  const originalBtnText = checkoutBtn.textContent;
  checkoutBtn.textContent = "Processing Order...";

  try {
    const pickupNote = el("pickupNote") ? el("pickupNote").value.trim() : "";

    // 1. Write the base order transaction anchor record
    const { data: orderData, error: orderError } = await db
      .from("orders")
      .insert({
        buyer_id: currentUser.id,
        pickup_note: pickupNote,
        status: "pending"
      })
      .select()
      .single();

    if (orderError) throw orderError;

    // 2. Prepare structured sub-line insertions matching current database state
    const orderItemsToInsert = cart.map((item) => ({
      order_id: orderData.id,
      listing_id: item.listing_id,
      quantity: item.qty,
      price_at_order: item.price,
      item_status: "pending"
    }));

    const { error: itemsError } = await db
      .from("order_items")
      .insert(orderItemsToInsert);

    if (itemsError) throw itemsError;

    // 3. Subtract inventory items dynamically to lock down allocated stock updates
    for (const item of cart) {
      const remainingStock = item.max - item.qty;
      await db
        .from("listings")
        .update({ quantity_available: Math.max(0, remainingStock) })
        .eq("id", item.listing_id);
    }

    // ===================================================================
    // WHATSAPP COMMUNICATOR INTEGRATION ROUTINE
    // ===================================================================

    // Fetch detailed profiles of everyone in this transaction to extract phone numbers
    const uniqueGrowerIds = [...new Set(cart.map(c => c.grower_id))];

    const { data: profiles, error: profileErr } = await db
      .from("profiles")
      .select("id, full_name, farm_name, phone")
      .in("id", [currentUser.id, ...uniqueGrowerIds]);

    if (!profileErr && profiles) {
      const buyerProfile = profiles.find(p => p.id === currentUser.id);
      const buyerPhone = buyerProfile?.phone ? buyerProfile.phone.replace(/\D/g, '') : '';
      const buyerName = buyerProfile?.full_name || "Valued Customer";

      // --- TEXT BLOCK 1: NOTIFY CUSTOMER ---
      let customerTxt = `*San Carlo Local Market*%0A`;
      customerTxt += `Hi ${buyerName}, thank you for your order! 🛒%0A%0A`;
      customerTxt += `*Order Summary:*%0A`;

      let grandTotal = 0;
      cart.forEach(item => {
        const itemCost = item.qty * item.price;
        grandTotal += itemCost;
        customerTxt += `• ${item.qty} ${item.unit} x ${item.title} ($${itemCost.toFixed(2)})%0A`;
      });
      customerTxt += `%0A*Grand Total: $${grandTotal.toFixed(2)}*%0A`;
      if(pickupNote) customerTxt += `_Note: ${pickupNote}_%0A`;

      // Fire customer text automatically via fallback link
      if (buyerPhone) {
        window.open(`https://wa.me/${buyerPhone}?text=${customerTxt}`, '_blank');
      }

      // --- TEXT BLOCK 2: NOTIFY FARMERS (SEGREGATED DISPATCH) ---
      uniqueGrowerIds.forEach(growerId => {
        const currentFarmer = profiles.find(p => p.id === growerId);
        const farmerPhone = currentFarmer?.phone ? currentFarmer.phone.replace(/\D/g, '') : '';
        const farmerName = currentFarmer?.farm_name || currentFarmer?.full_name || "Farmer";

        if (farmerPhone) {
          const matchingItems = cart.filter(c => c.grower_id === growerId);
          let farmerTxt = `*New Order Alert - San Carlo Market* 🌾%0A`;
          farmerTxt += `Hello ${farmerName}, you have received a new order from *${buyerName}*!%0A%0A`;
          farmerTxt += `*Items to Prepare:*%0A`;

          matchingItems.forEach(mi => {
            farmerTxt += `• ${mi.qty} ${mi.unit} x ${mi.title}%0A`;
          });

          if(pickupNote) farmerTxt += `%0A_Pickup Note from Buyer: "${pickupNote}"_%0A`;

          // Trigger dynamic programmatic pop-up per farmer matching array signature
          setTimeout(() => {
            window.open(`https://wa.me/${farmerPhone}?text=${farmerTxt}`, '_blank');
          }, 800);
        }
      });
    }

    // Clean cart tracking caches upon checkout success
    cart = [];
    updateCartUI();
    closeCart();

    // Redirect view tracking immediately to historical records log
    setView("myOrders");
    alert("Order successfully placed! Opening WhatsApp confirmation sheets...");

  } catch (err) {
    console.error(err);
    showFormMsg(msgEl, err.message || "An unexpected error occurred during database allocation.", "error");
  } finally {
    checkoutBtn.disabled = false;
    checkoutBtn.textContent = originalBtnText;
  }
}

// ============================================================
// MY ORDERS
// ============================================================
async function loadMyOrders() {
  const container = el("myOrdersList");
  if (!container) return;

  if (!currentUser) {
    container.innerHTML = `<div class="empty-state">Sign in to see your orders.</div>`;
    return;
  }

  container.innerHTML = `<div class="loading-spinner">Loading your orders...</div>`;

  try {
    const { data: orders, error } = await db
      .from("orders")
      .select("*, order_items(*, listings(title, unit), profiles:grower_id(full_name, farm_name))")
      .eq("buyer_id", currentUser.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (!orders || orders.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="big">📦</div>No orders yet.</div>`;
      return;
    }

    container.innerHTML = orders.map(o => {
      const items = o.order_items || [];
      const total = items.reduce((sum, it) => sum + it.quantity * it.price_at_order, 0);
      return `
        <div class="order-card">
          <div class="order-card-head">
            <div>
              <h3>Order #${o.id.slice(0, 8)}</h3>
              <div class="when">${timeAgo(o.created_at)}</div>
            </div>
            <span class="status-badge status-${o.status}">${escapeHtml(o.status)}</span>
          </div>
          ${items.map(it => `
            <div class="order-item-row">
              <div class="left">
                <strong>${escapeHtml(it.listings?.title || "Item")}</strong>
                <span>${it.quantity} ${escapeHtml(it.listings?.unit || "")} — ${escapeHtml(it.profiles?.farm_name || it.profiles?.full_name || "Local grower")}</span>
              </div>
              <span class="status-badge status-${it.item_status}">${escapeHtml(it.item_status)}</span>
            </div>
          `).join("")}
          <div style="display:flex;justify-content:space-between;margin-top:10px;font-weight:700;">
            <span>Total (pay at pickup)</span><span>${formatMoney(total)}</span>
          </div>
          ${o.pickup_note ? `<div class="card-meta">Note: ${escapeHtml(o.pickup_note)}</div>` : ""}
        </div>
      `;
    }).join("");
  } catch (e) {
    container.innerHTML = `<div class="empty-state">Error: ${escapeHtml(e.message)}</div>`;
  }
}

// ============================================================
// GROWER DASHBOARD
// ============================================================
async function loadMyListings() {
  const container = el("myListings");
  if (!container || !currentUser) return;
  container.innerHTML = `<div class="loading-spinner">Loading your listings...</div>`;

  try {
    const { data, error } = await db
      .from("listings")
      .select("*")
      .eq("grower_id", currentUser.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      container.innerHTML = `<div class="empty-state">You haven't listed anything yet. Add your first item above!</div>`;
      return;
    }

    container.innerHTML = data.map(l => `
      <div class="my-listing-row">
        ${l.image_url
          ? `<img src="${escapeHtml(l.image_url)}" alt="${escapeHtml(l.title)}" />`
          : `<div class="img-placeholder">${categoryEmoji(l.category)}</div>`
        }
        <div class="info">
          <strong>${escapeHtml(l.title)}</strong>
          <span>${formatMoney(l.price)} / ${escapeHtml(l.unit)} · ${l.quantity_available} left ${l.is_active ? "" : "· (hidden)"}</span>
        </div>
        <div class="actions">
          <button class="btn btn-outline btn-small" data-edit="${l.id}">Edit</button>
          <button class="btn btn-outline btn-small" data-toggle="${l.id}" data-active="${l.is_active}">${l.is_active ? "Hide" : "Show"}</button>
          <button class="btn btn-danger btn-small" data-delete="${l.id}">Delete</button>
        </div>
      </div>
    `).join("");

    container.querySelectorAll("[data-edit]").forEach(btn => {
      btn.addEventListener("click", () => {
        const listing = data.find(l => l.id === btn.dataset.edit);
        if (listing) startEditListing(listing);
      });
    });

    container.querySelectorAll("[data-toggle]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const isActive = btn.dataset.active === "true";
        await db.from("listings").update({ is_active: !isActive }).eq("id", btn.dataset.toggle);
        loadMyListings();
      });
    });

    container.querySelectorAll("[data-delete]").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("Delete this listing?")) return;
        await db.from("listings").delete().eq("id", btn.dataset.delete);
        loadMyListings();
      });
    });
  } catch (e) {
    container.innerHTML = `<div class="empty-state">Error: ${escapeHtml(e.message)}</div>`;
  }
}

function startEditListing(listing) {
  el("listingFormTitle").textContent = "Edit listing";
  el("editingListingId").value = listing.id;
  el("lf_title").value = listing.title;
  el("lf_category").value = listing.category;
  el("lf_price").value = listing.price;
  el("lf_unit").value = listing.unit;
  el("lf_qty").value = listing.quantity_available;
  el("lf_desc").value = listing.description || "";
  el("saveListingBtn").textContent = "Save Changes";
  el("cancelEditBtn").classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetListingForm() {
  el("listingFormTitle").textContent = "Add a new listing";
  el("editingListingId").value = "";
  el("lf_title").value = "";
  el("lf_category").value = "vegetable";
  el("lf_price").value = "";
  el("lf_unit").value = "lb";
  el("lf_qty").value = "";
  el("lf_desc").value = "";
  el("lf_image").value = "";
  el("saveListingBtn").textContent = "Add Listing";
  el("cancelEditBtn").classList.add("hidden");
  el("listingFormMsg").innerHTML = "";
}

// Listing form
document.addEventListener("DOMContentLoaded", () => {
  const cancel = el("cancelEditBtn");
  if (cancel) cancel.addEventListener("click", resetListingForm);

  const save = el("saveListingBtn");
  if (save) save.addEventListener("click", handleSaveListing);
});

async function handleSaveListing() {
  const msg = el("listingFormMsg");
  if (msg) msg.innerHTML = "";

  const title = el("lf_title")?.value.trim() || "";
  const category = el("lf_category")?.value || "vegetable";
  const price = parseFloat(el("lf_price")?.value);
  const unit = el("lf_unit")?.value || "lb";
  const qty = parseFloat(el("lf_qty")?.value);
  const desc = el("lf_desc")?.value.trim() || "";
  const editingId = el("editingListingId")?.value || "";
  const imageFile = el("lf_image")?.files[0];

  if (!title || isNaN(price) || price < 0 || isNaN(qty) || qty < 0) {
    if (msg) showFormMsg(msg, "Please fill in all required fields.", "error");
    return;
  }

  const saveBtn = el("saveListingBtn");
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving..."; }

  try {
    let imageUrl = null;
    if (imageFile) {
      const ext = imageFile.name.split(".").pop();
      const path = `${currentUser.id}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await db.storage.from("produce-images").upload(path, imageFile);
      if (uploadErr) throw uploadErr;
      const { data: publicUrlData } = db.storage.from("produce-images").getPublicUrl(path);
      imageUrl = publicUrlData.publicUrl;
    }

    const payload = { title, category, price, unit, quantity_available: qty, description: desc };
    if (imageUrl) payload.image_url = imageUrl;

    if (editingId) {
      await db.from("listings").update(payload).eq("id", editingId);
    } else {
      payload.grower_id = currentUser.id;
      await db.from("listings").insert(payload);
    }

    resetListingForm();
    loadMyListings();
    loadListings();
    if (msg) showFormMsg(msg, "✅ Saved successfully!", "success");
  } catch (err) {
    if (msg) showFormMsg(msg, err.message || "Couldn't save.", "error");
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = editingId ? "Save Changes" : "Add Listing"; }
  }
}

// ============================================================
// INCOMING ORDERS (Grower view)
// ============================================================
async function loadIncomingOrders() {
  const container = el("incomingOrders");
  if (!container || !currentUser) return;
  container.innerHTML = `<div class="loading-spinner">Loading incoming orders...</div>`;

  try {
    const { data, error } = await db
      .from("order_items")
      .select("*, listings(title, unit), orders(created_at, pickup_note, buyer:buyer_id(full_name))")
      .eq("grower_id", currentUser.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="big">🧺</div>No orders yet.</div>`;
      return;
    }

    const statuses = ["pending", "confirmed", "ready", "completed", "cancelled"];

    container.innerHTML = data.map(it => `
      <div class="order-card">
        <div class="order-card-head">
          <div>
            <h3>${escapeHtml(it.listings?.title || "Item")}</h3>
            <div class="when">${timeAgo(it.orders?.created_at)} · buyer: ${escapeHtml(it.orders?.buyer?.full_name || "Unknown")}</div>
          </div>
          <select data-item-status="${it.id}">
            ${statuses.map(s => `<option value="${s}" ${s === it.item_status ? "selected" : ""}>${s}</option>`).join("")}
          </select>
        </div>
        <div class="order-item-row">
          <div class="left">
            <strong>${it.quantity} ${escapeHtml(it.listings?.unit || "")}</strong>
            <span>${formatMoney(it.price_at_order)} each · ${formatMoney(it.quantity * it.price_at_order)} total</span>
          </div>
        </div>
        ${it.orders?.pickup_note ? `<div class="card-meta">Note: ${escapeHtml(it.orders.pickup_note)}</div>` : ""}
      </div>
    `).join("");

    container.querySelectorAll("[data-item-status]").forEach(sel => {
      sel.addEventListener("change", async () => {
        await db.from("order_items").update({ item_status: sel.value }).eq("id", sel.dataset.itemStatus);
      });
    });
  } catch (e) {
    container.innerHTML = `<div class="empty-state">Error: ${escapeHtml(e.message)}</div>`;
  }
}

// ============================================================
// ADMIN DASHBOARD
// ============================================================
async function yloadAdminPanel() {
  const container = el("adminPanel");
  if (!container || !currentUser) return;
  container.innerHTML = `<div class="loading-spinner">Loading admin data...</div>`;

  try {
    // Get stats
    const [users, products, orders, farmers] = await Promise.all([
      db.from("profiles").select("count", { count: "exact", head: true }),
      db.from("listings").select("count", { count: "exact", head: true }),
      db.from("orders").select("count", { count: "exact", head: true }),
      db.from("profiles").select("count", { count: "exact", head: true }).eq("is_grower", true),
    ]);

    container.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:16px;margin-bottom:20px;">
        <div class="stat-card"><h3>👤 ${users.count || 0}</h3><p>Total Users</p></div>
        <div class="stat-card"><h3>🌱 ${products.count || 0}</h3><p>Listings</p></div>
        <div class="stat-card"><h3>📦 ${orders.count || 0}</h3><p>Orders</p></div>
        <div class="stat-card"><h3>🧑‍🌾 ${farmers.count || 0}</h3><p>Farmers</p></div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="btn btn-primary" id="adminRefresh">🔄 Refresh</button>
        <button class="btn btn-secondary" id="adminClean">🧹 Clean Products</button>
        <button class="btn btn-danger" id="adminDeleteAll">⚠️ Delete All Listings</button>
      </div>
      <div id="adminMsg" style="margin-top:12px;"></div>
    `;

    el("adminRefresh")?.addEventListener("click", loadAdminPanel);
    el("adminClean")?.addEventListener("click", async () => {
      if (confirm("Set all inactive listings to unavailable?")) {
        const { error } = await db.from("listings").update({ is_active: false }).eq("is_active", true);
        const msg = el("adminMsg");
        if (msg) msg.innerHTML = error ? `❌ Error: ${error.message}` : "✅ Cleaned successfully!";
        loadAdminPanel();
      }
    });
    el("adminDeleteAll")?.addEventListener("click", async () => {
      if (confirm("⚠️ Delete ALL listings? This cannot be undone!")) {
        const { error } = await db.from("listings").delete().neq("id", "00000000-0000-0000-0000-000000000000");
        const msg = el("adminMsg");
        if (msg) msg.innerHTML = error ? `❌ Error: ${error.message}` : "✅ All listings deleted!";
        loadAdminPanel();
      }
    });
  } catch (e) {
    container.innerHTML = `<div class="empty-state">Error: ${escapeHtml(e.message)}</div>`;
  }
}


// ============================================================
// MOBILE NAVIGATION
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  // Menu toggle
  const menuToggle = el("menuToggle");
  const drawer = el("navDrawer");
  const drawerOverlay = el("drawerOverlay");
  const drawerClose = el("drawerClose");

  if (menuToggle) {
    menuToggle.addEventListener("click", () => {
      menuToggle.classList.toggle("active");
      drawer.classList.toggle("open");
      drawerOverlay.classList.toggle("open");
    });
  }

  if (drawerClose) {
    drawerClose.addEventListener("click", () => {
      menuToggle?.classList.remove("active");
      drawer.classList.remove("open");
      drawerOverlay.classList.remove("open");
    });
  }

  if (drawerOverlay) {
    drawerOverlay.addEventListener("click", () => {
      menuToggle?.classList.remove("active");
      drawer.classList.remove("open");
      drawerOverlay.classList.remove("open");
    });
  }

  // Bottom nav clicks
  const bottomNav = el("bottomNav");
  if (bottomNav) {
    bottomNav.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-view]");
      if (!btn) return;
      handleNavigation(btn.dataset.view);
    });
  }

  // Drawer nav clicks
  const drawerNav = el("drawerNav");
  if (drawerNav) {
    drawerNav.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-view]");
      if (!btn) return;
      handleNavigation(btn.dataset.view);
      // Close drawer
      menuToggle?.classList.remove("active");
      drawer.classList.remove("open");
      drawerOverlay.classList.remove("open");
    });
  }
});

function handleNavigation(view) {
  if ((view === "growerDash" || view === "adminDash") && !currentUser) {
    openAuthModal("signin");
    return;
  }
  setView(view);
}

// Update bottom nav and drawer active states
function updateNavActive(view) {
  // Bottom nav
  document.querySelectorAll("#bottomNav button").forEach(b => b.classList.remove("active"));
  const bottomBtn = document.querySelector(`#bottomNav button[data-view="${view}"]`);
  if (bottomBtn) bottomBtn.classList.add("active");

  // Drawer nav
  document.querySelectorAll("#drawerNav button").forEach(b => b.classList.remove("active"));
  const drawerBtn = document.querySelector(`#drawerNav button[data-view="${view}"]`);
  if (drawerBtn) drawerBtn.classList.add("active");

  // Desktop nav
  document.querySelectorAll("#mainNav button").forEach(b => b.classList.remove("active"));
  const navBtn = document.querySelector(`#mainNav button[data-view="${view}"]`);
  if (navBtn) navBtn.classList.add("active");
}
// ============================================================
// INIT
// ============================================================
db.auth.onAuthStateChange(() => refreshSession());
document.addEventListener("DOMContentLoaded", refreshSession);
// Add with your other element refs at the top
const farmerNotificationArea = el("farmerNotificationArea");
const farmerNotificationCount = el("farmerNotificationCount");
const farmerNotificationBtn = el("farmerNotificationBtn");

// Click handler to route straight to pending orders
if (farmerNotificationBtn) {
  farmerNotificationBtn.onclick = () => {
    // 1. Switch main view to grower dash
    setView("growerDash");

    // 2. Programmatically click the "Incoming Orders" tab inside the dashboard
    activeDashTab = "incoming";
    document.querySelectorAll("#dashTabs button").forEach((b) => b.classList.remove("active"));
    const incomingTabBtn = document.querySelector('#dashTabs button[data-dash="incoming"]');
    if (incomingTabBtn) incomingTabBtn.classList.add("active");

    el("dash-listings").classList.add("hidden");
    el("dash-incoming").classList.remove("hidden");

    // 3. Refresh the incoming orders list
    loadIncomingOrders();
  };
}

console.log("🚀 San Carlo Local Market loaded!");
console.log("📝 Roles: customer, farmer, admin");
