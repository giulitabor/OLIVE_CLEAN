/**
 * tour.ts — Olivium Adoption Dashboard Onboarding Tour
 *
 * Part 1: Welcome → Connect Profile (wallet / email real-time guidance)
 * Part 2: Adoption Dashboard stats → Filters → Tree Cards → Details / Adopt / Release
 *
 * Usage:
 *   import { startTour } from './tour';
 *   startTour();          // start from beginning
 *   // or add the floating "?" button which is injected automatically on DOMContentLoaded
 */

// ─── Types ────────────────────────────────────────────────────────────────────

interface TourStep {
  /** CSS selector of the element to spotlight (null = center modal) */
  target: string | null;
  /** Tooltip title */
  title: string;
  /** Tooltip body HTML */
  body: string;
  /** Where to place the tooltip relative to the target */
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  /** Label for the primary button */
  next?: string;
  /** If true, show a "Skip" button that ends the tour */
  showSkip?: boolean;
  /** Optional callback fired when this step becomes active */
  onEnter?: () => void;
  /** Optional callback fired when leaving this step */
  onLeave?: () => void;
}

// ─── Styles (injected once) ───────────────────────────────────────────────────

const TOUR_CSS = `
/* ── Tour root ─────────────────────────────────────────────────── */
#olivium-tour-overlay {
  position: fixed; inset: 0; z-index: 99000;
  pointer-events: none;
}

/* Dark backdrop via SVG cutout technique — LIGHTER so you can see behind */
#olivium-tour-backdrop {
  position: fixed; inset: 0; z-index: 99001;
  background: rgba(5, 10, 5, 0.45);  /* CHANGED: from 0.82 to 0.45 - much lighter */
  transition: opacity 0.4s ease;
  pointer-events: all;
}

/* Spotlight hole punched with clip-path - ENHANCED highlight */
#olivium-tour-spotlight {
  position: fixed; z-index: 99002;
  border-radius: 14px;
  box-shadow:
    0 0 0 4px rgba(197,160,89,0.9),      /* CHANGED: brighter highlight */
    0 0 0 8px rgba(197,160,89,0.3),
    0 0 0 9999px rgba(5,10,5,0.45);      /* CHANGED: matches lighter backdrop */
  pointer-events: none;
  transition: all 0.45s cubic-bezier(0.4,0,0.2,1);
}

/* Tooltip card */
#olivium-tour-tooltip {
  position: fixed; z-index: 99010;
  width: clamp(280px, 35vw, 420px);
  background: #0d1a0d;
  border: 1px solid rgba(197,160,89,0.3);
  border-radius: 18px;
  padding: 24px 26px 20px;
  box-shadow:
    0 32px 80px rgba(0,0,0,0.7),
    0 0 0 1px rgba(197,160,89,0.08);
  font-family: 'Inter', system-ui, sans-serif;
  color: #e8e0d0;
  transition: all 0.38s cubic-bezier(0.4,0,0.2,1);
  pointer-events: all;
}

/* Tooltip arrow */
#olivium-tour-tooltip::before {
  content: '';
  position: absolute;
  width: 14px; height: 14px;
  background: #0d1a0d;
  border-left: 1px solid rgba(197,160,89,0.3);
  border-top: 1px solid rgba(197,160,89,0.3);
  transform: rotate(45deg);
}
#olivium-tour-tooltip.arrow-bottom::before { bottom: -7px; left: 28px; transform: rotate(225deg); border-left: none; border-top: none; border-right: 1px solid rgba(197,160,89,0.3); border-bottom: 1px solid rgba(197,160,89,0.3); }
#olivium-tour-tooltip.arrow-top::before    { top: -7px;    left: 28px; transform: rotate(45deg); }
#olivium-tour-tooltip.arrow-right::before  { right: -7px;  top: 24px;  transform: rotate(135deg); border-left: none; border-top: none; border-right: 1px solid rgba(197,160,89,0.3); border-bottom: 1px solid rgba(197,160,89,0.3); }
#olivium-tour-tooltip.arrow-left::before   { left: -7px;   top: 24px;  transform: rotate(-45deg); border-left: 1px solid rgba(197,160,89,0.3); border-bottom: 1px solid rgba(197,160,89,0.3); border-right: none; border-top: none; }
#olivium-tour-tooltip.arrow-none::before   { display: none; }

.tour-step-badge {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 10px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase;
  color: #C5A059; margin-bottom: 8px;
}
.tour-step-badge .badge-dot {
  width: 6px; height: 6px; border-radius: 50%; background: #C5A059;
  animation: tourPulse 1.4s ease-in-out infinite;
}
@keyframes tourPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.4)} }

.tour-title {
  font-family: 'Playfair Display', 'Georgia', serif;
  font-size: 1.25rem; font-weight: 700;
  color: #f5ead5; margin: 0 0 10px; line-height: 1.3;
}

.tour-body {
  font-size: 0.875rem; line-height: 1.65;
  color: rgba(232,224,208,0.8); margin: 0 0 18px;
}
.tour-body strong { color: #C5A059; font-weight: 600; }
.tour-body .mignole-link {
  color: #7ab87a; text-decoration: underline dotted; cursor: pointer;
  font-weight: 600;
}

.tour-actions {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
}
.tour-btn-next {
  background: linear-gradient(135deg, #5a7a2b, #6b8e36);
  color: #fff; border: none; border-radius: 10px;
  padding: 10px 22px; font-size: 13px; font-weight: 700;
  letter-spacing: 0.06em; cursor: pointer;
  transition: transform 0.15s, background 0.2s;
  box-shadow: 0 4px 14px rgba(90,122,43,0.4);
}
.tour-btn-next:hover { transform: translateY(-1px); background: linear-gradient(135deg,#6b8e36,#7aa040); }

.tour-btn-skip {
  background: none; border: 1px solid rgba(232,224,208,0.15);
  color: rgba(232,224,208,0.45); border-radius: 8px;
  padding: 9px 16px; font-size: 12px; font-weight: 600; cursor: pointer;
  transition: color 0.2s, border-color 0.2s;
}
.tour-btn-skip:hover { color: rgba(232,224,208,0.75); border-color: rgba(232,224,208,0.3); }

/* Progress dots */
.tour-progress {
  display: flex; gap: 5px; align-items: center;
}
.tour-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: rgba(197,160,89,0.2);
  transition: background 0.3s, transform 0.3s;
}
.tour-dot.active { background: #C5A059; transform: scale(1.4); }
.tour-dot.done   { background: rgba(197,160,89,0.5); }

/* ── Mignole popup ──────────────────────────────────────────────── */
#olivium-mignole-popup {
  position: fixed; z-index: 99020;
  background: #0d1a0d;
  border: 1px solid rgba(122,184,122,0.35);
  border-radius: 16px;
  padding: 20px 22px;
  width: clamp(240px, 28vw, 340px);
  box-shadow: 0 24px 60px rgba(0,0,0,0.65);
  color: #e8e0d0;
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 0.85rem; line-height: 1.6;
  display: none;
  animation: mignoleFadeIn 0.25s ease;
}
@keyframes mignoleFadeIn { from{opacity:0;transform:scale(0.94)} to{opacity:1;transform:scale(1)} }
#olivium-mignole-popup .mp-title {
  font-family: 'Playfair Display','Georgia',serif;
  font-size: 1rem; font-weight: 700; color: #7ab87a;
  margin: 0 0 8px;
}
#olivium-mignole-popup .mp-close {
  position: absolute; top: 10px; right: 14px;
  background: none; border: none; color: rgba(232,224,208,0.4);
  font-size: 1.1rem; cursor: pointer; line-height: 1;
}
#olivium-mignole-popup .mp-close:hover { color: #fff; }

/* ── Restart FAB ────────────────────────────────────────────────── */
#olivium-tour-restart-fab {
  position: fixed; bottom: 24px; right: 24px; z-index: 9000;
  width: 48px; height: 48px; border-radius: 50%;
  background: #0d1a0d;
  border: 1.5px solid rgba(197,160,89,0.4);
  color: #C5A059;
  font-size: 1.1rem; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  transition: transform 0.2s, background 0.2s;
  font-family: serif;
}
#olivium-tour-restart-fab:hover { transform: scale(1.1); background: #162216; }
#olivium-tour-restart-fab title { display: none; }

/* ── Live login guidance panel ──────────────────────────────────── */
#olivium-tour-login-guide {
  position: fixed; bottom: 80px; right: 24px; z-index: 99015;
  width: clamp(240px, 28vw, 320px);
  background: #0d1a0d;
  border: 1px solid rgba(197,160,89,0.25);
  border-radius: 14px;
  padding: 16px 18px;
  color: #e8e0d0;
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 0.8rem; line-height: 1.55;
  box-shadow: 0 16px 40px rgba(0,0,0,0.5);
  display: none;
}
#olivium-tour-login-guide .lg-title {
  font-size: 0.75rem; font-weight: 700; letter-spacing: 0.12em;
  text-transform: uppercase; color: #C5A059; margin-bottom: 6px;
}
#olivium-tour-login-guide ul {
  list-style: none; margin: 0; padding: 0;
}
#olivium-tour-login-guide li {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.05);
}
#olivium-tour-login-guide li:last-child { border-bottom: none; }
#olivium-tour-login-guide .lg-icon { font-size: 0.95rem; flex-shrink: 0; margin-top: 1px; }
#olivium-tour-login-guide .lg-step { color: rgba(232,224,208,0.7); }
#olivium-tour-login-guide .lg-step.active { color: #7ab87a; font-weight: 600; }
#olivium-tour-login-guide .lg-step.done   { color: rgba(232,224,208,0.35); text-decoration: line-through; }
`;

// ─── Tour step definitions ─────────────────────────────────────────────────────


// Helpers 
// Fix 3: Add this new helper function to bring modal forward
function bringModalForwardAndOpen(): void {
  const modal = document.querySelector('#connectModal') as HTMLElement;
  if (modal) {
    // Bring to front with highest z-index
    modal.style.zIndex = '999999';
    modal.style.position = 'fixed';
    modal.style.top = '50%';
    modal.style.left = '50%';
    modal.style.transform = 'translate(-50%, -50%)';
    
    // Open the modal if it has an active class or display property
    if (modal.classList) {
      modal.classList.add('active');
    }
    if (modal.style.display === 'none' || !modal.style.display) {
      modal.style.display = 'flex';
    }
    
    // Ensure it's interactive
    modal.style.pointerEvents = 'all';
    
    // Add a one-time click listener to detect when modal is closed
    const closeHandler = () => {
      // After modal is closed, wait a moment then continue tour
      setTimeout(() => {
        if (tourActive && currentStep === 2) {
          // User closed modal, move to next step
          goToStep(3);
        }
      }, 300);
      modal.removeEventListener('modalClosed', closeHandler);
    };
    
    // Watch for modal being closed
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === 'class' || mutation.attributeName === 'style') {
          const isNowHidden = !modal.classList?.contains('active') && 
                              (modal.style.display === 'none' || getComputedStyle(modal).display === 'none');
          if (isNowHidden) {
            observer.disconnect();
            closeHandler();
          }
        }
      }
    });
    observer.observe(modal, { attributes: true });
  }
}

// Fix 4: Update openConnectModalIfClosed function to actually open the modal
function openConnectModalIfClosed(): void {
  const modal = document.querySelector('#connectModal') as HTMLElement;
  const btn = document.querySelector('#connectBtn') as HTMLElement;
  
  // Check if modal is actually visible
  const isModalVisible = modal && 
    (modal.classList?.contains('active') || 
     modal.style.display === 'flex' || 
     getComputedStyle(modal).display === 'flex');
  
  if (!isModalVisible) {
    // Try to click the connect button first (most apps handle this)
    if (btn && typeof btn.click === 'function') {
      btn.click();
    }
    // Also directly show modal if possible
    if (modal) {
      if (modal.classList) modal.classList.add('active');
      modal.style.display = 'flex';
    }
  }
}

// Fix 5: Update startLoginObserver to properly track authentication
function startLoginObserver(): void {
  stopLoginObserver();
  
  const identityEl = document.querySelector('#nav-identity-display');
  const connectModal = document.querySelector('#connectModal');
  
  // Track authentication state
  let authCompleted = false;
  
  const checkState = () => {
    if (authCompleted) return;
    
    const isAuthenticated = identityEl && 
      identityEl.textContent !== 'NOT CONNECTED' && 
      identityEl.textContent?.trim() !== '' &&
      !identityEl.textContent?.includes('NOT CONNECTED');
    
    if (isAuthenticated) {
      authCompleted = true;
      renderLoginSteps(4);
      // Auto-advance tour after connection
      setTimeout(() => { 
        if (tourActive && currentStep === 2) {
          goToStep(3);
        }
      }, 1200);
    } else {
      // Check if modal is visible
      const isModalVisible = connectModal &&
        (connectModal.classList?.contains('active') || 
         getComputedStyle(connectModal).display === 'flex');
      
      if (isModalVisible) {
        renderLoginSteps(2);
      } else if (!isModalVisible && currentStep === 2) {
        // Modal was closed but not authenticated - reopen it
        bringModalForwardAndOpen();
      }
    }
  };
  
  loginObserver = new MutationObserver(checkState);
  if (identityEl) loginObserver.observe(identityEl, { 
    childList: true, 
    characterData: true, 
    subtree: true 
  });
  if (connectModal) loginObserver.observe(connectModal, { 
    attributes: true, 
    attributeFilter: ['class', 'style'] 
  });
  
  // Initial check
  checkState();
}

// Fix 6: Update closeConnectModalIfOpen to be optional (don't force close)
function closeConnectModalIfOpen(): void {
  // Only close if we're ending the tour completely
  if (!tourActive) {
    if (typeof (window as any).closeConnectModal === 'function') {
      (window as any).closeConnectModal();
    } else {
      const modal = document.querySelector('#connectModal') as HTMLElement;
      if (modal) {
        if (modal.classList) modal.classList.remove('active');
        modal.style.display = 'none';
      }
    }
  }
}

// Fix 7: Update endTour to properly clean up without forcing modal close prematurely
export function endTour(): void {
  tourActive = false;
  stopLoginObserver();
  hideLoginGuide();
  hideMignolePopup();

  const backdrop = document.querySelector('#olivium-tour-backdrop') as HTMLElement;
  if (backdrop) { 
    backdrop.style.opacity = '0'; 
    setTimeout(() => backdrop.remove(), 400); 
  }

  const spot = document.querySelector('#olivium-tour-spotlight') as HTMLElement;
  if (spot) spot.remove();

  const tooltip = document.querySelector('#olivium-tour-tooltip') as HTMLElement;
  if (tooltip) { tooltip.style.display = 'none'; }

  window.removeEventListener('resize', handleResize);

  // Only close modal if tour is ending completely
  if (typeof (window as any).closeConnectModal === 'function') {
    (window as any).closeConnectModal();
  }
}

function buildSteps(): TourStep[] {
  return [
    // ── PART 1 ─────────────────────────────────────────────────────────────────

    // Step 0 — Welcome splash (center)
    {
      target: null,
      placement: 'center',
      title: 'Welcome to Olivium 🌿',
      body: `<strong>Olivium</strong> lets you adopt real olive trees, track your ownership on-chain,
             and participate in the annual harvest — all from this dashboard.<br><br>
             This quick tour will show you the essentials in under two minutes.
             You can restart it anytime with the <strong>?</strong> button in the corner.`,
      next: "Let's go →",
      showSkip: true,
    },

    // Step 1 — Point at Connect Profile button
    {
      target: '#connectBtn',
      placement: 'bottom',
      title: 'Connect Your Profile',
      body: `Hit <strong>Connect Profile</strong> to identify yourself to the grove.<br><br>
             You can sign in with a <strong>Solana wallet</strong> for direct on-chain ownership,
             or use your <strong>email</strong> — we'll create a custodial wallet for you automatically.`,
      next: 'Show me how',
      showSkip: true,
      onEnter: () => highlightLoginGuide(false),
    },

    // Step 2 — Connect modal is open, real-time guidance
    {
      target: '#connectModal',
      placement: 'left',
      title: 'Choose Your Login Method',
      body: `<strong>Wallet Login</strong> — connect any Solana wallet (Phantom, Backpack…) for direct on-chain positions.<br><br>
             <strong>Email Login</strong> — enter your email & password with MFA for a managed grove account.`,
      next: "I'm connected / Skip",
      showSkip: false,
      onEnter: () => {
        bringModalForwardAndOpen();
        startLoginObserver();
        highlightLoginGuide(true);
      },

      onLeave: () => {
        stopLoginObserver();
        hideLoginGuide();
      //  closeConnectModalIfOpen();
      },
    },

    // ── PART 2 ─────────────────────────────────────────────────────────────────

    // Step 3 — Dashboard welcome
    {
      target: '.hero-card',
      placement: 'bottom',
      title: 'The Adoption Dashboard',
      body: `These four stats summarise the live state of the Olivium grove:<br><br>
             🌳 <strong>Trees On-Chain</strong> — how many real olive trees are registered on Solana.<br>
             🫒 <strong>Total <span class="mignole-link" id="tour-mignole-trigger-1">Mignole</span></strong> — the fractional units of tree ownership.<br>
             🆔 <strong>Connected Identity</strong> — your current login mode.<br>
             🌿 <strong>Grove Positions</strong> — how many trees you personally hold shares in.`,
      next: 'Next →',
      showSkip: true,
      onEnter: () => attachMignoleTriggers(),
    },

    // Step 4 — Filters
    {
      target: '.filters-wrap',
      placement: 'bottom',
      title: 'Filter the Grove',
      body: `Use these tabs to navigate the grove:<br><br>
             <strong>All Trees</strong> — see every registered olive tree.<br>
             <strong>Available</strong> — trees with <span class="mignole-link" id="tour-mignole-trigger-2">Mignole</span> still open for adoption.<br>
             <strong>My Trees</strong> — your personal grove positions.<br>
             <strong>Fully Adopted</strong> — trees whose shares are completely taken.`,
      next: 'Next →',
      showSkip: true,
      onEnter: () => attachMignoleTriggers(),
    },

    // Step 5 — Tree cards
    {
      target: '#treeGrid',
      placement: 'top',
      title: 'Tree Cards',
      body: `Each card represents a real, GPS-tagged olive tree in the Sicilian grove.<br><br>
             You'll see its name, variety, adoption progress and current availability —
             all synced live from the Solana on-chain contract.`,
      next: 'Next →',
      showSkip: true,
    },

    // Step 6 — Action buttons (we target a sample card or fall back to grid)
    {
      target: '.tree-card',
      placement: 'top',
      title: 'Card Actions',
      body: `Each tree card has three actions:<br><br>
             🟡 <strong>Details</strong> — deep-dive: physical specs, live IoT sensors, weather, on-chain metadata & gallery.<br>
             🟢 <strong>Adopt</strong> — choose how many <span class="mignole-link" id="tour-mignole-trigger-3">Mignole</span> to acquire and complete the purchase.<br>
             🔴 <strong>Release</strong> — relinquish your Mignole back into the grove treasury.`,
      next: 'Finish tour ✓',
      showSkip: false,
      onEnter: () => attachMignoleTriggers(),
    },
  ];
}

// ─── State ────────────────────────────────────────────────────────────────────

let currentStep = 0;
let steps: TourStep[] = [];
let loginObserver: MutationObserver | null = null;
let tourActive = false;

// ─── DOM helpers ──────────────────────────────────────────────────────────────

function injectStyles(): void {
  if (document.getElementById('olivium-tour-styles')) return;
  const style = document.createElement('style');
  style.id = 'olivium-tour-styles';
  style.textContent = TOUR_CSS;
  document.head.appendChild(style);
}

function getOrCreate<T extends HTMLElement>(id: string, tag = 'div'): T {
  return (document.getElementById(id) as T) ||
    (() => { const el = document.createElement(tag) as T; el.id = id; document.body.appendChild(el); return el; })();
}

function el<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

// ─── Mignole popup ────────────────────────────────────────────────────────────

function buildMignolePopup(): void {
  if (document.getElementById('olivium-mignole-popup')) return;
  const popup = document.createElement('div');
  popup.id = 'olivium-mignole-popup';
  popup.innerHTML = `
    <button class="mp-close" id="olivium-mignole-close">✕</button>
    <p class="mp-title">🫒 What is a Mignole?</p>
    <p>A <strong style="color:#7ab87a;">Mignole</strong> (plural: <em>Mignoli</em>) is a fractional share of a single olive tree.
    Each tree is divided into up to 1 000 Mignoli — you can own as few as one.<br><br>
    Mignoli are minted as tokens on <strong style="color:#7ab87a;">Solana</strong>, giving you verifiable,
    transferable on-chain ownership of a real tree's productive capacity,
    harvest participation rights, and grove rewards.</p>
  `;
  document.body.appendChild(popup);
  document.getElementById('olivium-mignole-close')!.addEventListener('click', hideMignolePopup);
}

function showMignolePopup(anchor: HTMLElement): void {
  const popup = el<HTMLDivElement>('olivium-mignole-popup')!;
  popup.style.display = 'block';
  const rect = anchor.getBoundingClientRect();
  const pw = popup.offsetWidth || 320;
  const ph = popup.offsetHeight || 180;
  let left = rect.left;
  let top  = rect.bottom + 10;
  if (left + pw > window.innerWidth - 16) left = window.innerWidth - pw - 16;
  if (top  + ph > window.innerHeight - 16) top  = rect.top - ph - 10;
  popup.style.left = `${Math.max(8, left)}px`;
  popup.style.top  = `${Math.max(8, top)}px`;
}

function hideMignolePopup(): void {
  const popup = el<HTMLDivElement>('olivium-mignole-popup');
  if (popup) popup.style.display = 'none';
}

function attachMignoleTriggers(): void {
  // Re-query each render cycle
  setTimeout(() => {
    document.querySelectorAll<HTMLElement>('.mignole-link').forEach(link => {
      link.onclick = (e) => { e.stopPropagation(); showMignolePopup(link); };
    });
  }, 80);
}

// ─── Login observer (real-time guidance) ─────────────────────────────────────

const LOGIN_STEPS = [
  { icon: '🔗', label: 'Open Connect modal' },
  { icon: '◎', label: 'Choose Wallet or Email' },
  { icon: '✅', label: 'Authenticate & confirm' },
  { icon: '🌿', label: 'Profile connected!' },
];

function buildLoginGuide(): void {
  if (document.getElementById('olivium-tour-login-guide')) return;
  const guide = document.createElement('div');
  guide.id = 'olivium-tour-login-guide';
  guide.innerHTML = `
    <div class="lg-title">🔑 Login Progress</div>
    <ul id="olivium-lg-list"></ul>
  `;
  document.body.appendChild(guide);
}

function highlightLoginGuide(show: boolean): void {
  const guide = el<HTMLDivElement>('olivium-tour-login-guide');
  if (!guide) return;
  guide.style.display = show ? 'block' : 'none';
  if (show) renderLoginSteps(0);
}

function hideLoginGuide(): void { highlightLoginGuide(false); }

function renderLoginSteps(activeIdx: number): void {
  const list = el<HTMLUListElement>('olivium-lg-list');
  if (!list) return;
  list.innerHTML = LOGIN_STEPS.map((s, i) => `
    <li>
      <span class="lg-icon">${s.icon}</span>
      <span class="lg-step ${i < activeIdx ? 'done' : i === activeIdx ? 'active' : ''}">${s.label}</span>
    </li>
  `).join('');
}

function openConnectModalIfClosed(): void {
  const modal = el<HTMLDivElement>('connectModal');
  if (modal && !modal.classList.contains('active') && modal.style.display !== 'flex') {
    // Try triggering the connect button
    const btn = el<HTMLButtonElement>('connectBtn');
    if (btn) btn.click();
  }
}

function closeConnectModalIfOpen(): void {
  // Use app's own close function if available
  if (typeof (window as any).closeConnectModal === 'function') {
    (window as any).closeConnectModal();
  }
}

function startLoginObserver(): void {
  stopLoginObserver();
  // Watch for modal class / display changes and identity label changes to advance guidance
  const identityEl = el('nav-identity-display');
  const connectModal = el('connectModal');
  renderLoginSteps(1); // step 0 done (modal opened)

  const checkState = () => {
    const isModalVisible = connectModal &&
      (connectModal.classList.contains('active') || connectModal.style.display === 'flex' || connectModal.style.display === '');
    const isAuthenticated = identityEl && identityEl.textContent !== 'NOT CONNECTED' && identityEl.textContent!.trim() !== '';

    if (isAuthenticated) {
      renderLoginSteps(4);
      // Auto-advance tour after brief pause
      setTimeout(() => { if (tourActive) goToStep(3); }, 1200);
    } else if (isModalVisible) {
      renderLoginSteps(2);
    }
  };

  loginObserver = new MutationObserver(checkState);
  if (identityEl) loginObserver.observe(identityEl, { childList: true, characterData: true, subtree: true });
  if (connectModal) loginObserver.observe(connectModal, { attributes: true, attributeFilter: ['class', 'style'] });

  // Also watch auth modal
  const authModal = el('authModalOverlay');
  if (authModal) loginObserver.observe(authModal, { attributes: true, attributeFilter: ['style'] });
}

function stopLoginObserver(): void {
  if (loginObserver) { loginObserver.disconnect(); loginObserver = null; }
}

// ─── Spotlight + tooltip positioning ─────────────────────────────────────────

function spotlightElement(target: Element | null, padding = 10): void {
  const spot = getOrCreate('olivium-tour-spotlight');
  if (!target) {
    Object.assign(spot.style, { display: 'none' });
    return;
  }
  const r = target.getBoundingClientRect();
  Object.assign(spot.style, {
    display: 'block',
    top:    `${r.top    - padding}px`,
    left:   `${r.left   - padding}px`,
    width:  `${r.width  + padding * 2}px`,
    height: `${r.height + padding * 2}px`,
  });
}

type Placement = 'top' | 'bottom' | 'left' | 'right' | 'center';

function positionTooltip(target: Element | null, placement: Placement): void {
  const tooltip = getOrCreate('olivium-tour-tooltip');
  const TW = tooltip.offsetWidth || 380;
  const TH = tooltip.offsetHeight || 200;
  const pad = 16;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Remove old arrow class
  tooltip.className = tooltip.className.replace(/arrow-\w+/g, '').trim();

  if (!target || placement === 'center') {
    Object.assign(tooltip.style, {
      top:  `${(vh - TH) / 2}px`,
      left: `${(vw - TW) / 2}px`,
    });
    tooltip.classList.add('arrow-none');
    return;
  }

  const r = target.getBoundingClientRect();
  let top = 0, left = 0, arrowClass = 'arrow-none';

  switch (placement) {
    case 'bottom':
      top  = r.bottom + 14;
      left = Math.min(r.left, vw - TW - pad);
      arrowClass = 'arrow-top';
      break;
    case 'top':
      top  = r.top - TH - 14;
      left = Math.min(r.left, vw - TW - pad);
      arrowClass = 'arrow-bottom';
      break;
    case 'left':
      top  = r.top;
      left = r.left - TW - 14;
      arrowClass = 'arrow-right';
      break;
    case 'right':
      top  = r.top;
      left = r.right + 14;
      arrowClass = 'arrow-left';
      break;
  }

  // Clamp to viewport
  top  = Math.max(pad, Math.min(top,  vh - TH - pad));
  left = Math.max(pad, Math.min(left, vw - TW - pad));

  Object.assign(tooltip.style, { top: `${top}px`, left: `${left}px` });
  tooltip.classList.add(arrowClass);
}

// ─── Render step ──────────────────────────────────────────────────────────────

function renderStep(index: number): void {
  const step = steps[index];
  if (!step) { endTour(); return; }

  // Scroll target into view
  const targetEl = step.target ? document.querySelector<HTMLElement>(step.target) : null;
  if (targetEl) {
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  setTimeout(() => {
    spotlightElement(targetEl);
    buildTooltipContent(step, index);
    positionTooltip(targetEl, (step.placement as Placement) || 'bottom');
    step.onEnter?.();
  }, 200);
}

function buildTooltipContent(step: TourStep, index: number): void {
  const tooltip = getOrCreate('olivium-tour-tooltip');

  const totalVisible = steps.length;
  const dots = Array.from({ length: totalVisible }, (_, i) =>
    `<span class="tour-dot ${i < index ? 'done' : i === index ? 'active' : ''}"></span>`
  ).join('');

  const partLabel = index === 0 ? 'Welcome' : index <= 2 ? 'Part 1 — Connect' : 'Part 2 — Dashboard';

  tooltip.innerHTML = `
    <div class="tour-step-badge"><span class="badge-dot"></span>${partLabel} · ${index + 1}/${totalVisible}</div>
    <h2 class="tour-title">${step.title}</h2>
    <p class="tour-body">${step.body}</p>
    <div class="tour-actions">
      <div class="tour-progress">${dots}</div>
      <div style="display:flex;gap:8px;align-items:center;">
        ${step.showSkip ? `<button class="tour-btn-skip" id="tour-skip-btn">Skip tour</button>` : ''}
        <button class="tour-btn-next" id="tour-next-btn">${step.next || 'Next →'}</button>
      </div>
    </div>
  `;
  tooltip.style.display = 'block';

  document.getElementById('tour-next-btn')!.onclick = () => {
    step.onLeave?.();
    goToStep(index + 1);
  };

  const skipBtn = document.getElementById('tour-skip-btn');
  if (skipBtn) skipBtn.onclick = endTour;

  attachMignoleTriggers();
}

// ─── Navigation ───────────────────────────────────────────────────────────────

function goToStep(index: number): void {
  if (index >= steps.length) { endTour(); return; }
  currentStep = index;
  renderStep(index);
}

// ─── Start / End ──────────────────────────────────────────────────────────────

export function startTour(): void {
  injectStyles();
  buildMignolePopup();
  buildLoginGuide();

  steps = buildSteps();
  currentStep = 0;
  tourActive = true;

  // Backdrop
  const backdrop = getOrCreate('olivium-tour-backdrop');
  backdrop.style.opacity = '1';
  backdrop.onclick = () => { /* prevent accidental close */ };

  // Spotlight placeholder
  getOrCreate('olivium-tour-spotlight');

  // Tooltip
  const tooltip = getOrCreate('olivium-tour-tooltip');
  tooltip.style.display = 'block';

  renderStep(0);

  // Reposition on resize
  window.addEventListener('resize', handleResize);
}

function handleResize(): void {
  if (!tourActive) return;
  const step = steps[currentStep];
  if (!step) return;
  const targetEl = step.target ? document.querySelector<HTMLElement>(step.target) : null;
  spotlightElement(targetEl);
  positionTooltip(targetEl, (step.placement as Placement) || 'bottom');
}

export function endTour(): void {
  tourActive = false;
  stopLoginObserver();
  hideLoginGuide();
  hideMignolePopup();

  const backdrop = el('olivium-tour-backdrop');
  if (backdrop) { backdrop.style.opacity = '0'; setTimeout(() => backdrop.remove(), 400); }

  const spot = el('olivium-tour-spotlight');
  if (spot) spot.remove();

  const tooltip = el('olivium-tour-tooltip');
  if (tooltip) { tooltip.style.display = 'none'; }

  window.removeEventListener('resize', handleResize);

  // Close any modals we may have opened
  closeConnectModalIfOpen();
}

// ─── Restart FAB ──────────────────────────────────────────────────────────────

function injectRestartFAB(): void {
  if (document.getElementById('olivium-tour-restart-fab')) return;
  const fab = document.createElement('button');
  fab.id = 'olivium-tour-restart-fab';
  fab.setAttribute('aria-label', 'Restart tour');
  fab.title = 'Restart Olivium tour';
  fab.innerHTML = '?';
  fab.onclick = startTour;
  document.body.appendChild(fab);
}

// ─── Auto-init ────────────────────────────────────────────────────────────────

function init(): void {
  injectStyles();
  buildMignolePopup();
  buildLoginGuide();
  injectRestartFAB();

  const hasSeenTour = localStorage.getItem('olivium_tour_done');
  if (!hasSeenTour) {
    // Small delay to let page assets settle
    setTimeout(() => {
      startTour();
      localStorage.setItem('olivium_tour_done', '1');
    }, 900);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
