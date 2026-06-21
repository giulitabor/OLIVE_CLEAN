// ===================================================================
// San Carlo Local Market — app.js
// ===================================================================
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  document.body.innerHTML = `
    <div style="font-family:sans-serif;max-width:520px;margin:60px auto;padding:24px;
                border:1px solid #e3a;border-radius:10px;background:#fff5f5;">
      <h2 style="margin-top:0;">Missing Supabase credentials</h2>
      <p>Create a <code>.env</code> file in the project root (copy <code>.env.example</code>)
      and set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>,
      then restart <code>npm run dev</code>.</p>
    </div>`;
  throw new Error("Missing Supabase credentials in .env");
}

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------------------------------------------------------------
// Global state
// ---------------------------------------------------------------
let currentUser = null;
let currentProfile = null;
let listingsCache = [];
let cart = []; // [{listing_id, title, price, unit, qty, grower_id}]
let authMode = "signin"; // or "signup"
let activeDashTab = "listings";

// ---------------------------------------------------------------
// Element refs
// ---------------------------------------------------------------
const el = (id) => document.getElementById(id);

const authModal = el("authModal");
const authModalTitle = el("authModalTitle");
const authModalSub = el("authModalSub");
const authFormMsg = el("authFormMsg");
const fullNameField = el("fullNameField");
const growerCheckRow = el("growerCheckRow");
const authSubmitBtn = el("authSubmitBtn");
const authSwitchRow = el("authSwitchRow");

const authArea = el("authArea");
const growerTabBtn = el("growerTabBtn");

const cartFab = el("cartFab");
const cartPanel = el("cartPanel");
const cartOverlay = el("cartOverlay");
const cartItemsEl = el("cartItems");
const cartTotalEl = el("cartTotal");
const cartCountEl = el("cartCount");

// Added Notification Selectors safely at the top
const farmerNotificationArea = el("farmerNotificationArea");
const farmerNotificationCount = el("farmerNotificationCount");
const farmerNotificationBtn = el("farmerNotificationBtn");

// ===================================================================
// FARMER LIVE NOTIFICATION PIPELINE
// ===================================================================
async function updateFarmerNotificationCount() {
  if (!currentUser || !currentProfile || !currentProfile.is_grower) return;

  try {
    const badge = el("farmerNotificationCount");
    if (!badge) return;

    // Count items assigned to this grower that are still 'pending'
    const { count, error } = await db
      .from("order_items")
      .select("*", { count: "exact", head: true })
      .eq("grower_id", currentUser.id)
      .eq("item_status", "pending");

    if (!error) {
      badge.textContent = count || 0;
      badge.style.display = count > 0 ? "block" : "none";
    }
  } catch (err) {
    console.error("Failed to sync farmer notification counts:", err);
  }
}

// ===================================================================
// AUTH MODAL
// ===================================================================
function openAuthModal(mode) {
  authMode = mode;
  authFormMsg.innerHTML = "";
  el("auth_email").value = "";
  el("auth_password").value = "";
  el("auth_fullname").value = "";
  el("auth_isgrower").checked = false;
  updateAuthModalUI();
  authModal.classList.remove("hidden");
}

function updateAuthModalUI() {
  if (authMode === "signin") {
    authModalTitle.textContent = "Sign In";
    authModalSub.textContent = "Welcome back to San Carlo Local Market.";
    fullNameField.classList.add("hidden");
    growerCheckRow.classList.add("hidden");
    authSubmitBtn.textContent = "Sign In";
    authSwitchRow.innerHTML = `Don't have an account? <button id="switchToSignUp">Sign up</button>`;
    el("switchToSignUp").onclick = () => { authMode = "signup"; updateAuthModalUI(); };
  } else {
    authModalTitle.textContent = "Sign Up";
    authModalSub.textContent = "Join your local San Carlo market.";
    fullNameField.classList.remove("hidden");
    growerCheckRow.classList.remove("hidden");
    authSubmitBtn.textContent = "Create Account";
    authSwitchRow.innerHTML = `Already have an account? <button id="switchToSignIn">Sign in</button>`;
    el("switchToSignIn").onclick = () => { authMode = "signin"; updateAuthModalUI(); };
  }
}

function closeAuthModal() {
  authModal.classList.add("hidden");
}

if (el("signInBtn")) el("signInBtn").onclick = () => openAuthModal("signin");
if (el("signUpBtn")) el("signUpBtn").onclick = () => openAuthModal("signup");
if (el("closeAuthModal")) el("closeAuthModal").onclick = closeAuthModal;
if (authModal) authModal.addEventListener("click", (e) => { if (e.target === authModal) closeAuthModal(); });

if (authSubmitBtn) {
  authSubmitBtn.onclick = async () => {
    const email = el("auth_email").value.trim();
    const password = el("auth_password").value;
    authFormMsg.innerHTML = "";

    if (!email || !password) {
      showFormMsg(authFormMsg, "Please enter an email and password.", "error");
      return;
    }

    authSubmitBtn.disabled = true;
    authSubmitBtn.textContent = "Please wait...";

    try {
      if (authMode === "signup") {
        const fullName = el("auth_fullname").value.trim();
        const isGrower = el("auth_isgrower").checked;
        const { data, error } = await db.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;

        if (data.user) {
          await db
            .from("profiles")
            .update({ full_name: fullName, is_grower: isGrower })
            .eq("id", data.user.id);
        }

        if (!data.session) {
          showFormMsg(authFormMsg, "Account created! Check your email to confirm, then sign in.", "success");
          authSubmitBtn.disabled = false;
          authSubmitBtn.textContent = "Create Account";
          return;
        }
      } else {
        const { error } = await db.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      closeAuthModal();
      await refreshSession();
    } catch (err) {
      showFormMsg(authFormMsg, err.message || "Something went wrong.", "error");
    } : null {
      authSubmitBtn.disabled = false;
      updateAuthModalUI();
    }
  };
}

function showFormMsg(container, msg, type) {
  container.innerHTML = `<div class="form-msg ${type}">${escapeHtml(msg)}</div>`;
}

async function signOut() {
  await db.auth.signOut();
  currentUser = null;
  currentProfile = null;
  cart = [];
  updateCartUI();
  renderAuthArea();
  setView("browse");
}

// ===================================================================
// SESSION HANDLING
// ===================================================================
async function refreshSession() {
  const { data: { session } } = await db.auth.getSession();
  currentUser = session ? session.user : null;

  if (currentUser) {
    const { data: profile, error } = await db
      .from("profiles")
      .select("*")
      .eq("id", currentUser.id)
      .single();
    currentProfile = error ? null : profile;
  } else {
    currentProfile = null;
  }

  renderAuthArea();
  loadListings();
  if (currentUser) {
    loadMyOrders();
    if (currentProfile && currentProfile.is_grower) {
      loadMyListings();
      loadIncomingOrders();
    }
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
    
    // Toggle notification badge
    if (farmerNotificationArea) {
      if (currentProfile.is_grower) {
        farmerNotificationArea.classList.remove("hidden");
        updateFarmerNotificationCount();
      } else {
        farmerNotificationArea.classList.add("hidden");
      }
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

// ===================================================================
// NAVIGATION
// ===================================================================
if (el("mainNav")) {
  document.getElementById("mainNav").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-view]");
    if (!btn) return;
    if (btn.dataset.view === "growerDash" && !currentUser) {
      openAuthModal("signin");
      return;
    }
    setView(btn.dataset.view);
  });
}

function setView(view) {
  document.querySelectorAll(".section").forEach((s) => s.classList.remove("active"));
  document.getElementById("view-" + view).classList.add("active");
  document.querySelectorAll("#mainNav button").forEach((b) => b.classList.remove("active"));
  const navBtn = document.querySelector(`#mainNav button[data-view="${view}"]`);
  if (navBtn) navBtn.classList.add("active");

  if (view === "myOrders" && currentUser) loadMyOrders();
  if (view === "growerDash" && currentUser) {
    loadMyListings();
    loadIncomingOrders();
  }
}

if (el("dashTabs")) {
  document.getElementById("dashTabs").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-dash]");
    if (!btn) return;
    activeDashTab = btn.dataset.dash;
    document.querySelectorAll("#dashTabs button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    el("dash-listings").classList.toggle("hidden", activeDashTab !== "listings");
    el("dash-incoming").classList.toggle("hidden", activeDashTab !== "incoming");
    if (activeDashTab === "incoming") loadIncomingOrders();
  });
}

// ===================================================================
// UTILS
// ===================================================================
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMoney(n) {
  return "$" + Number(n).toFixed(2);
}

function timeAgo(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function categoryEmoji(cat) {
  return { vegetable: "🥕", fruit: "🍓", herb: "🌿", other: "🧺" }[cat] || "🧺";
}

// ===================================================================
// BROWSE LISTINGS
// ===================================================================
async function loadListings() {
  const grid = el("listingsGrid");
  if (!grid) return;
  grid.innerHTML = `<div class="loading-spinner">Loading fresh produce...</div>`;

  const { data, error } = await db
    .from("listings")
    .select("*, profiles:grower_id(full_name, farm_name)")
    .eq("is_active", true)
    .gt("quantity_available", 0)
    .order("created_at", { ascending: false });

  if (error) {
    grid.innerHTML = `<div class="empty-state">Couldn't load listings: ${escapeHtml(error.message)}</div>`;
    return;
  }

  listingsCache = data || [];
  renderListings();
}

function renderListings() {
  const grid = el("listingsGrid");
  if (!grid) return;
  const search = el("searchInput") ? el("searchInput").value.trim().toLowerCase() : "";
  const cat = el("categoryFilter") ? el("categoryFilter").value : "all";

  let items = listingsCache.filter((l) => {
    const matchesSearch = !search || l.title.toLowerCase().includes(search) || (l.description || "").toLowerCase().includes(search);
    const matchesCat = cat === "all" || l.category === cat;
    return matchesSearch && matchesCat;
  });

  if (items.length === 0) {
    grid.innerHTML = `<div class="empty-state"><div class="big">🌱</div>No produce matches right now. Check back soon!</div>`;
    return;
  }

  grid.innerHTML = items.map((l) => {
    const growerName = l.profiles ? (l.profiles.farm_name || l.profiles.full_name || "Local grower") : "Local grower";
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

  grid.querySelectorAll("[data-add-to-cart]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!currentUser) {
        openAuthModal("signin");
        return;
      }
      const id = btn.dataset.addToCart;
      const qtyInput = grid.querySelector(`[data-qty-for="${id}"]`);
      const qty = parseFloat(qtyInput.value);
      if (!qty || qty <= 0) return;
      addToCart(id, qty);
    });
  });
}

if (el("searchInput")) el("searchInput").addEventListener("input", renderListings);
if (el("categoryFilter")) el("categoryFilter").addEventListener("change", renderListings);

// ===================================================================
// CART
// ===================================================================
function addToCart(listingId, qty) {
  const listing = listingsCache.find((l) => l.id === listingId);
  if (!listing) return;

  const existing = cart.find((c) => c.listing_id === listingId);
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
      max: listing.quantity_available,
    });
  }
  updateCartUI();
  openCart();
}

function removeFromCart(listingId) {
  cart = cart.filter((c) => c.listing_id !== listingId);
  updateCartUI();
}

function updateCartUI() {
  if (cartCountEl) cartCountEl.textContent = cart.reduce((sum, c) => sum + 1, 0);

  if (cart.length === 0) {
    if (cartItemsEl) cartItemsEl.innerHTML = `<div class="empty-state">Your cart is empty.</div>`;
    if (cartTotalEl) cartTotalEl.textContent = formatMoney(0);
    return;
  }

  if (cartItemsEl) {
    cartItemsEl.innerHTML = cart.map((c) => `
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

    cartItemsEl.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", () => removeFromCart(btn.dataset.remove));
    });
  }

  const total = cart.reduce((sum, c) => sum + c.qty * c.price, 0);
  if (cartTotalEl) cartTotalEl.textContent = formatMoney(total);
}

function openCart() {
  if (cartPanel) cartPanel.classList.add("open");
  if (cartOverlay) cartOverlay.classList.add("open");
}
function closeCart() {
  if (cartPanel) cartPanel.classList.remove("open");
  if (cartOverlay) cartOverlay.classList.remove("open");
}

if (cartFab) cartFab.addEventListener("click", openCart);
if (el("closeCartBtn")) el("closeCartBtn").addEventListener("click", closeCart);
if (cartOverlay) cartOverlay.addEventListener("click", closeCart);
if (el("checkoutBtn")) el("checkoutBtn").addEventListener("click", placeOrder);

// ===================================================================
// PLACE ORDER & AUTOMATED WHATSAPP ROUTING
// ===================================================================
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
  checkoutBtn.textContent = "Placing order...";

  try {
    const pickupNote = el("pickupNote") ? el("pickupNote").value.trim() : "";

    const { data: order, error: orderErr } = await db
      .from("orders")
      .insert({ buyer_id: currentUser.id, pickup_note: pickupNote })
      .select()
      .single();
    if (orderErr) throw orderErr;

    const itemsPayload = cart.map((c) => ({
      order_id: order.id,
      listing_id: c.listing_id,
      grower_id: c.grower_id,
      quantity: c.qty,
      price_at_order: c.price,
    }));

    const { error: itemsErr } = await db.from("order_items").insert(itemsPayload);
    if (itemsErr) throw itemsErr;

    // Decrement stock for each item
    for (const c of cart) {
      await db.rpc("decrement_listing_quantity", {
        p_listing_id: c.listing_id,
        p_quantity: c.qty,
      });
    }

    // WHATSAPP COMMUNICATOR PIPELINE
    const uniqueGrowerIds = [...new Set(cart.map((c) => c.grower_id))];
    const { data: profiles, error: profileErr } = await db
      .from("profiles")
      .select("id, full_name, farm_name, phone")
      .in("id", [currentUser.id, ...uniqueGrowerIds]);

    if (!profileErr && profiles) {
      const buyerProfile = profiles.find((p) => p.id === currentUser.id);
      const buyerPhone = buyerProfile?.phone ? buyerProfile.phone.replace(/\D/g, "") : "";
      const buyerName = buyerProfile?.full_name || "Valued Customer";

      // 1. Notify Customer
      let customerTxt = `*San Carlo Local Market*%0A`;
      customerTxt += `Hi ${buyerName}, thank you for your order! 🛒%0A%0A`;
      customerTxt += `*Order Summary:*%0A`;
      let grandTotal = 0;
      cart.forEach((item) => {
        const cost = item.qty * item.price;
        grandTotal += cost;
        customerTxt += `• ${item.qty} ${item.unit} x ${item.title} ($${cost.toFixed(2)})%0A`;
      });
      customerTxt += `%0A*Grand Total: $${grandTotal.toFixed(2)}*%0A`;
      if (pickupNote) customerTxt += `_Note: ${pickupNote}_%0A`;

      if (buyerPhone) {
        window.open(`https://wa.me/${buyerPhone}?text=${customerTxt}`, "_blank");
      }

      // 2. Notify Individual Farmers
      uniqueGrowerIds.forEach((growerId) => {
        const farmer = profiles.find((p) => p.id === growerId);
        const farmerPhone = farmer?.phone ? farmer.phone.replace(/\D/g, "") : "";
        const farmerName = farmer?.farm_name || farmer?.full_name || "Farmer";

        if (farmerPhone) {
          const matchingItems = cart.filter((c) => c.grower_id === growerId);
          let farmerTxt = `*New Order Alert - San Carlo Market* 🌾%0A`;
          farmerTxt += `Hello ${farmerName}, you have a new order from *${buyerName}*!%0A%0A`;
          farmerTxt += `*Items to Prepare:*%0A`;
          matchingItems.forEach((mi) => {
            farmerTxt += `• ${mi.qty} ${mi.unit} x ${mi.title}%0A`;
          });
          if (pickupNote) farmerTxt += `%0A_Pickup Note: "${pickupNote}"_%0A`;

          setTimeout(() => {
            window.open(`https://wa.me/${farmerPhone}?text=${farmerTxt}`, "_blank");
          }, 800);
        }
      });
    }

    cart = [];
    if (el("pickupNote")) el("pickupNote").value = "";
    updateCartUI();
    closeCart();
    loadListings();
    loadMyOrders();
    setView("myOrders");
  } catch (err) {
    showFormMsg(msgEl, err.message || "Couldn't place order.", "error");
  } finally {
    checkoutBtn.disabled = false;
    checkoutBtn.textContent = "Place Order";
  }
}

// ===================================================================
// MY ORDERS (buyer view)
// ===================================================================
async function loadMyOrders() {
  const container = el("myOrdersList");
  if (!container) return;
  if (!currentUser) {
    container.innerHTML = `<div class="empty-state">Sign in to see your orders.</div>`;
    return;
  }
  container.innerHTML = `<div class="loading-spinner">Loading your orders...</div>`;

  const { data: orders, error } = await db
    .from("orders")
    .select("*, order_items(*, listings(title, unit), profiles:grower_id(full_name, farm_name))")
    .eq("buyer_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (error) {
    container.innerHTML = `<div class="empty-state">Couldn't load orders: ${escapeHtml(error.message)}</div>`;
    return;
  }

  if (!orders || orders.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="big">📦</div>No orders yet. Go browse the market!</div>`;
    return;
  }

  container.innerHTML = orders.map((o) => {
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
        ${items.map((it) => `
          <div class="order-item-row">
            <div class="left">
              <strong>${escapeHtml(it.listings ? it.listings.title : "Item")}</strong>
              <span>${it.quantity} ${escapeHtml(it.listings ? it.listings.unit : "")} — grown by ${escapeHtml(it.profiles ? (it.profiles.farm_name || it.profiles.full_name) : "a local grower")}</span>
            </div>
            <span class="status-badge status-${it.item_status}">${escapeHtml(it.item_status)}</span>
          </div>
        `).join("")}
        <div style="display:flex;justify-content:space-between;margin-top:10px;font-weight:700;color:var(--green-900);">
          <span>Total (pay at pickup)</span><span>${formatMoney(total)}</span>
        </div>
        ${o.pickup_note ? `<div class="card-meta" style="margin-top:6px;">Note: ${escapeHtml(o.pickup_note)}</div>` : ""}
      </div>
    `;
  }).join("");
}

// ===================================================================
// GROWER DASHBOARD — MY LISTINGS
// ===================================================================
async function loadMyListings() {
  const container = el("myListings");
  if (!container || !currentUser) return;
  container.innerHTML = `<div class="loading-spinner">Loading your listings...</div>`;

  const { data, error } = await db
    .from("listings")
    .select("*")
    .eq("grower_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (error) {
    container.innerHTML = `<div class="empty-state">Couldn't load listings: ${escapeHtml(error.message)}</div>`;
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML = `<div class="empty-state">You haven't listed anything yet. Add your first item above!</div>`;
    return;
  }

  container.innerHTML = data.map((l) => `
    <div class="my-listing-row">
      ${l.image_url
        ? `<img src="${escapeHtml(l.image_url)}" alt="${escapeHtml(l.title)}" />`
        : `<div class="img-placeholder">${categoryEmoji(l.category)}</div>`
      }
      <div class="info">
        <strong>${escapeHtml(l.title)}</strong>
        <span>${formatMoney(l.price)} / ${escapeHtml(l.unit)} · ${l.quantity_available} ${escapeHtml(l.unit)} left ${l.is_active ? "" : "· (hidden)"}</span>
      </div>
      <div class="actions">
        <button class="btn btn-outline btn-small" data-edit="${l.id}">Edit</button>
        <button class="btn btn-outline btn-small" data-toggle="${l.id}" data-active="${l.is_active}">${l.is_active ? "Hide" : "Show"}</button>
        <button class="btn btn-danger btn-small" data-delete="${l.id}">Delete</button>
      </div>
    </div>
  `).join("");

  container.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const listing = data.find((l) => l.id === btn.dataset.edit);
      if (listing) startEditListing(listing);
    });
  });
  container.querySelectorAll("[data-toggle]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const isActive = btn.dataset.active === "true";
      await db.from("listings").update({ is_active: !isActive }).eq("id", btn.dataset.toggle);
      loadMyListings();
    });
  });
  container.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this listing? This cannot be undone.")) return;
      await db.from("listings").delete().eq("id", btn.dataset.delete);
      loadMyListings();
    });
  });
}

function startEditListing(listing) {
  if (!el("listingFormTitle")) return;
  el("listingFormTitle").textContent = "Edit listing";
  el("editingListingId").value = listing.id;
  el("lf_title").value = listing.title;
  el("lf_category").value = listing.category;
  el("lf_price").value = listing.price;
  el("lf_unit").value = listing.unit;
  el("lf_qty").value = listing.quantity_available;
  el("lf_desc").value = listing.description || "";
  el("saveListingBtn").textContent = "Save Changes";
  if (el("cancelEditBtn")) el("cancelEditBtn").classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetListingForm() {
  if (!el("listingFormTitle")) return;
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
  if (el("cancelEditBtn")) el("cancelEditBtn").classList.add("hidden");
  if (el("listingFormMsg")) el("listingFormMsg").innerHTML = "";
}

if (el("cancelEditBtn")) el("cancelEditBtn").addEventListener("click", resetListingForm);

if (el("saveListingBtn")) {
  el("saveListingBtn").addEventListener("click", async () => {
    const msgEl = el("listingFormMsg");
    if (!msgEl) return;
    msgEl.innerHTML = "";

    const title = el("lf_title").value.trim();
    const category = el("lf_category").value;
    const price = parseFloat(el("lf_price").value);
    const unit = el("lf_unit").value;
    const qty = parseFloat(el("lf_qty").value);
    const desc = el("lf_desc").value.trim();
    const editingId = el("editingListingId").value;
    const imageFile = el("lf_image").files[0];

    if (!title || isNaN(price) || price < 0 || isNaN(qty) || qty < 0) {
      showFormMsg(msgEl, "Please fill in item name, a valid price, and quantity.", "error");
      return;
    }

    const saveBtn = el("saveListingBtn");
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";

    try {
      let imageUrl = null;

      if (imageFile) {
        const ext = imageFile.name.split(".").pop();
        const path = `${currentUser.id}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await db.storage
          .from("produce-images")
          .upload(path, imageFile);
        if (uploadErr) throw uploadErr;
        const { data: publicUrlData } = db.storage.from("produce-images").getPublicUrl(path);
        imageUrl = publicUrlData.publicUrl;
      }

      const payload = {
        title,
        category,
        price,
        unit,
        quantity_available: qty,
        description: desc,
      };
      if (imageUrl) payload.image_url = imageUrl;

      if (editingId) {
        const { error } = await db.from("listings").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        payload.grower_id = currentUser.id;
        const { error } = await db.from("listings").insert(payload);
        if (error) throw error;
      }

      resetListingForm();
      loadMyListings();
      loadListings();
    } catch (err) {
      showFormMsg(msgEl, err.message || "Couldn't save listing.", "error");
    } finally {
      saveBtn.disabled = false;
    }
  });
}

// ===================================================================
// GROWER DASHBOARD — INCOMING ORDERS
// ===================================================================
async function loadIncomingOrders() {
  const container = el("incomingOrders");
  if (!container) return;
  if (!currentUser) return;
  container.innerHTML = `<div class="loading-spinner">Loading incoming orders...</div>`;

  const { data, error } = await db
    .from("order_items")
    .select("*, listings(title, unit), orders(created_at, pickup_note, profiles:buyer_id(full_name))")
    .eq("grower_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (error) {
    container.innerHTML = `<div class="empty-state">Couldn't load orders: ${escapeHtml(error.message)}</div>`;
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="big">🧺</div>No orders yet for your listings.</div>`;
    updateFarmerNotificationCount();
    return;
  }

  const statuses = ["pending", "confirmed", "ready", "completed", "cancelled"];

  container.innerHTML = data.map((it) => `
    <div class="order-card">
      <div class="order-card-head">
        <div>
          <h3>${escapeHtml(it.listings ? it.listings.title : "Item")}</h3>
          <div class="when">${it.orders ? timeAgo(it.orders.created_at) : ""} · buyer: ${escapeHtml(it.orders && it.orders.profiles ? it.orders.profiles.full_name : "Unknown")}</div>
        </div>
        <select data-item-status="${it.id}">
          ${statuses.map((s) => `<option value="${s}" ${s === it.item_status ? "selected" : ""}>${s}</option>`).join("")}
        </select>
      </div>
      <div class="order-item-row">
        <div class="left">
          <strong>${it.quantity} ${escapeHtml(it.listings ? it.listings.unit : "")}</strong>
          <span>${formatMoney(it.price_at_order)} each · ${formatMoney(it.quantity * it.price_at_order)} total</span>
        </div>
      </div>
      ${it.orders && it.orders.pickup_note ? `<div class="card-meta" style="margin-top:6px;">Note: ${escapeHtml(it.orders.pickup_note)}</div>` : ""}
    </div>
  `).join("");

  container.querySelectorAll("[data-item-status]").forEach((sel) => {
    sel.addEventListener("change", async () => {
      await db
        .from("order_items")
        .update({ item_status: sel.value })
        .eq("id", sel.dataset.itemStatus);
        
      // Update badge reactively when a farmer changes order states
      updateFarmerNotificationCount();
    });
  });

  // Keep badge initialized with live values
  updateFarmerNotificationCount();
}

// Wire up structural jumps directly when badge notification button receives clicks
if (farmerNotificationBtn) {
  farmerNotificationBtn.onclick = () => {
    setView("growerDash");
    activeDashTab = "incoming";
    
    document.querySelectorAll("#dashTabs button").forEach((b) => b.classList.remove("active"));
    const incomingTabBtn = document.querySelector('#dashTabs button[data-dash="incoming"]');
    if (incomingTabBtn) incomingTabBtn.classList.add("active");

    if (el("dash-listings")) el("dash-listings").classList.add("hidden");
    if (el("dash-incoming")) el("dash-incoming").classList.remove("hidden");

    loadIncomingOrders();
  };
}

// ===================================================================
// INIT
// ===================================================================
db.auth.onAuthStateChange((_event, _session) => {
  refreshSession();
});

refreshSession();
