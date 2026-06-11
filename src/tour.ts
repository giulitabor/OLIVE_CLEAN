/**
 * tour.ts — Olivium Adoption Dashboard Onboarding Tour
 * ─────────────────────────────────────────────────────────────────────────────
 * Part 1: Welcome → Connect Profile (wallet / email real-time guidance)
 * Part 2: Adoption Dashboard stats → Filters → Tree Cards → Details / Adopt / Release
 *
 * Usage:
 *   import { startTour } from './tour';
 *   startTour();   // start from step 0
 *   // The floating "?" FAB is injected automatically on DOMContentLoaded.
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type Placement = 'top' | 'bottom' | 'left' | 'right' | 'center';

interface TourStep {
  /** CSS selector of the element to spotlight (null = centred modal) */
  target:     string | null;
  title:      string;
  /** Tooltip body — HTML allowed */
  body:       string;
  placement?: Placement;
  /** Label for the primary action button */
  next?:      string;
  /** Show a secondary "Skip tour" button */
  showSkip?:  boolean;
  /** Called when this step becomes active (after the spotlight transition) */
  onEnter?:   () => void;
  /** Called immediately before leaving this step */
  onLeave?:   () => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const TOUR_CSS = `
/* ── Tour overlay ───────────────────────────────────────────────── */
#olivium-tour-overlay {
  position: fixed; inset: 0; z-index: 99000;
  pointer-events: none;
}

/* Semi-transparent backdrop */
#olivium-tour-backdrop {
  position: fixed; inset: 0; z-index: 99001;
  background: rgba(5, 10, 5, 0.45);
  transition: opacity 0.4s ease;
  pointer-events: all;
}

/* Spotlight — the box-shadow outward flood creates the dim surround */
#olivium-tour-spotlight {
  position: fixed; z-index: 99002;
  border-radius: 14px;
  box-shadow:
    0 0 0 4px rgba(197,160,89,0.9),
    0 0 0 8px rgba(197,160,89,0.3),
    0 0 0 9999px rgba(5,10,5,0.45);
  pointer-events: none;
  transition: all 0.45s cubic-bezier(0.4,0,0.2,1);
}

/* ── Tooltip card ───────────────────────────────────────────────── */
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

/* Arrow variants */
#olivium-tour-tooltip::before {
  content: '';
  position: absolute;
  width: 14px; height: 14px;
  background: #0d1a0d;
  border-left: 1px solid rgba(197,160,89,0.3);
  border-top:  1px solid rgba(197,160,89,0.3);
}
#olivium-tour-tooltip.arrow-none::before   { display: none; }
#olivium-tour-tooltip.arrow-top::before    { top: -7px;    left: 28px; transform: rotate(45deg); }
#olivium-tour-tooltip.arrow-bottom::before { bottom: -7px; left: 28px; transform: rotate(225deg);
  border-left: none; border-top: none;
  border-right: 1px solid rgba(197,160,89,0.3);
  border-bottom: 1px solid rgba(197,160,89,0.3); }
#olivium-tour-tooltip.arrow-right::before  { right: -7px; top: 24px; transform: rotate(135deg);
  border-left: none; border-top: none;
  border-right: 1px solid rgba(197,160,89,0.3);
  border-bottom: 1px solid rgba(197,160,89,0.3); }
#olivium-tour-tooltip.arrow-left::before   { left: -7px; top: 24px; transform: rotate(-45deg);
  border-left: 1px solid rgba(197,160,89,0.3);
  border-bottom: 1px solid rgba(197,160,89,0.3);
  border-right: none; border-top: none; }

/* ── Tooltip internals ──────────────────────────────────────────── */
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
  color: #7ab87a; text-decoration: underline dotted; cursor: pointer; font-weight: 600;
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
.tour-progress { display: flex; gap: 5px; align-items: center; }
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
  font-size: 1rem; font-weight: 700; color: #7ab87a; margin: 0 0 8px;
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
#olivium-tour-login-guide ul { list-style: none; margin: 0; padding: 0; }
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

// ═══════════════════════════════════════════════════════════════════════════
// MODULE STATE  (all mutable state in one place)
// ═══════════════════════════════════════════════════════════════════════════

let _steps:         TourStep[]          = [];
let _currentStep:   number              = 0;
let _tourActive:    boolean             = false;
let _loginObserver: MutationObserver | null = null;

// ═══════════════════════════════════════════════════════════════════════════
// STEP DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

function buildSteps(): TourStep[] {
  return [
    // ── PART 1 — Connect ───────────────────────────────────────────────────

    // 0 — Welcome splash (centred, no spotlight)
    {
      target:    null,
      placement: 'center',
      title:     'Welcome to Olivium 🌿',
      body: `<strong>Olivium</strong> lets you adopt real olive trees, track ownership on-chain,
             and participate in the annual harvest — all from this dashboard.<br><br>
             This quick tour covers the essentials in under two minutes.
             You can restart it any time with the <strong>?</strong> button.`,
      next:     "Let's go →",
      showSkip: true,
    },

    // 1 — Connect Profile button
    {
      target:    '#connectBtn',
      placement: 'bottom',
      title:     'Connect Your Profile',
      body: `Hit <strong>Connect Profile</strong> to identify yourself to the grove.<br><br>
             Sign in with a <strong>Solana wallet</strong> for direct on-chain ownership,
             or use your <strong>email</strong> — we'll create a custodial wallet for you automatically.`,
      next:     'Show me how',
      showSkip: true,
      onEnter:  () => _showLoginGuide(false),
    },

    // 2 — Connect modal — real-time guidance, stays open until authenticated
    {
      target:    '#connectModal',
      placement: 'left',
      title:     'Choose Your Login Method',
      body: `<strong>Wallet Login</strong> — connect any Solana wallet (Phantom, Backpack…) for
             direct on-chain positions.<br><br>
             <strong>Email Login</strong> — enter your email & password with MFA
             for a managed grove account.`,
      next:      "I'm connected →",
      showSkip:  false,
      onEnter: () => {
        _openConnectModal();
        _startLoginObserver();
        _showLoginGuide(true);
      },
      onLeave: () => {
        _stopLoginObserver();
        _showLoginGuide(false);
        // Do NOT close the connect modal here — the user may still be mid-auth.
        // It will close naturally after the auth flow completes.
      },
    },

    // ── PART 2 — Dashboard ─────────────────────────────────────────────────

    // 3 — Hero stats card
    {
      target:    '.hero-card',
      placement: 'bottom',
      title:     'The Adoption Dashboard',
      body: `These four stats show the live state of the grove:<br><br>
             🌳 <strong>Trees On-Chain</strong> — real olive trees registered on Solana.<br>
             🫒 <strong>Total <span class="mignole-link">Mignole</span></strong> — fractional units of tree ownership.<br>
             🆔 <strong>Connected Identity</strong> — your current login mode.<br>
             🌿 <strong>Grove Positions</strong> — trees you personally hold shares in.`,
      next:     'Next →',
      showSkip: true,
      onEnter:  () => _attachMignoleTriggers(),
    },

    // 4 — Filter tabs
    {
      target:    '.filters-wrap',
      placement: 'bottom',
      title:     'Filter the Grove',
      body: `Navigate the grove with these tabs:<br><br>
             <strong>All Trees</strong> — every registered olive tree.<br>
             <strong>Available</strong> — trees with <span class="mignole-link">Mignole</span> open for adoption.<br>
             <strong>My Trees</strong> — your personal grove positions.<br>
             <strong>Fully Adopted</strong> — trees whose shares are fully taken.`,
      next:     'Next →',
      showSkip: true,
      onEnter:  () => _attachMignoleTriggers(),
    },

    // 5 — Tree grid
    {
      target:    '#treeGrid',
      placement: 'top',
      title:     'Tree Cards',
      body: `Each card represents a real, GPS-tagged olive tree in the Sicilian grove.<br><br>
             You'll see its name, variety, adoption progress and current availability —
             all synced live from the Solana on-chain contract.`,
      next:     'Next →',
      showSkip: true,
    },

    // 6 — Individual card actions
    {
      target:    '.tree-card',
      placement: 'top',
      title:     'Card Actions',
      body: `Each tree card has three actions:<br><br>
             🟡 <strong>Details</strong> — physical specs, IoT sensors, weather,
               on-chain metadata &amp; gallery.<br>
             🟢 <strong>Adopt</strong> — choose how many
               <span class="mignole-link">Mignole</span> to acquire and complete the purchase.<br>
             🔴 <strong>Release</strong> — relinquish your Mignole back to the grove treasury.`,
      next:     'Finish tour ✓',
      showSkip: false,
      onEnter:  () => _attachMignoleTriggers(),
    },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// DOM UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function _injectStyles(): void {
  if (document.getElementById('olivium-tour-styles')) return;
  const style = document.createElement('style');
  style.id = 'olivium-tour-styles';
  style.textContent = TOUR_CSS;
  document.head.appendChild(style);
}

/** Get element by id, or create-and-append it. */
function _getOrCreate<T extends HTMLElement>(id: string, tag = 'div'): T {
  let el = document.getElementById(id) as T | null;
  if (!el) {
    el = document.createElement(tag) as T;
    el.id = id;
    document.body.appendChild(el);
  }
  return el;
}

function _el<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

/** Returns true if an element is visible in the DOM (has non-zero size). */
function _isVisible(el: HTMLElement | null): boolean {
  if (!el) return false;
  const s = getComputedStyle(el);
  return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
}

// ═══════════════════════════════════════════════════════════════════════════
// MIGNOLE POPUP
// ═══════════════════════════════════════════════════════════════════════════

function _buildMignolePopup(): void {
  if (document.getElementById('olivium-mignole-popup')) return;
  const popup = document.createElement('div');
  popup.id = 'olivium-mignole-popup';
  popup.innerHTML = `
    <button class="mp-close" id="olivium-mignole-close">✕</button>
    <p class="mp-title">🫒 What is a Mignole?</p>
    <p>A <strong style="color:#7ab87a;">Mignole</strong> (plural: <em>Mignoli</em>) is a fractional
    share of a single olive tree. Each tree is divided into up to 1 000 Mignoli —
    you can own as few as one.<br><br>
    Mignoli are minted as tokens on <strong style="color:#7ab87a;">Solana</strong>,
    giving you verifiable, transferable on-chain ownership of a real tree's productive
    capacity, harvest participation rights, and grove rewards.</p>
  `;
  document.body.appendChild(popup);
  document.getElementById('olivium-mignole-close')!.addEventListener('click', _hideMignolePopup);
}

function _showMignolePopup(anchor: HTMLElement): void {
  const popup = _el<HTMLDivElement>('olivium-mignole-popup');
  if (!popup) return;
  popup.style.display = 'block';
  const r  = anchor.getBoundingClientRect();
  const pw = popup.offsetWidth  || 320;
  const ph = popup.offsetHeight || 180;
  let left = r.left;
  let top  = r.bottom + 10;
  if (left + pw > window.innerWidth  - 16) left = window.innerWidth  - pw - 16;
  if (top  + ph > window.innerHeight - 16) top  = r.top - ph - 10;
  popup.style.left = `${Math.max(8, left)}px`;
  popup.style.top  = `${Math.max(8, top)}px`;
}

function _hideMignolePopup(): void {
  const popup = _el('olivium-mignole-popup');
  if (popup) popup.style.display = 'none';
}

/**
 * Wire `.mignole-link` elements inside the tooltip to open the popup.
 * Called after each tooltip render to pick up freshly injected HTML.
 */
function _attachMignoleTriggers(): void {
  // Use rAF so the tooltip HTML is guaranteed to be in the DOM
  requestAnimationFrame(() => {
    document.querySelectorAll<HTMLElement>('.mignole-link').forEach(link => {
      // Remove any existing handler then re-add (prevents accumulation)
      link.onclick = (e) => { e.stopPropagation(); _showMignolePopup(link); };
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// LOGIN GUIDE PANEL  (right-side progress checklist during step 2)
// ═══════════════════════════════════════════════════════════════════════════

const LOGIN_STEPS = [
  { icon: '🔗', label: 'Open Connect modal' },
  { icon: '◎',  label: 'Choose Wallet or Email' },
  { icon: '✅', label: 'Authenticate & confirm' },
  { icon: '🌿', label: 'Profile connected!' },
] as const;

function _buildLoginGuide(): void {
  if (document.getElementById('olivium-tour-login-guide')) return;
  const guide = document.createElement('div');
  guide.id = 'olivium-tour-login-guide';
  guide.innerHTML = `
    <div class="lg-title">🔑 Login Progress</div>
    <ul id="olivium-lg-list"></ul>
  `;
  document.body.appendChild(guide);
}

/** Show or hide the login guide panel. Pass show=true to display it. */
function _showLoginGuide(show: boolean): void {
  const guide = _el('olivium-tour-login-guide');
  if (!guide) return;
  guide.style.display = show ? 'block' : 'none';
  if (show) _renderLoginSteps(0);
}

/**
 * Render the checklist with `activeIdx` highlighted.
 * FIX: LOGIN_STEPS has 4 items (0-3); clamp to avoid out-of-bounds.
 */
function _renderLoginSteps(activeIdx: number): void {
  const list = _el('olivium-lg-list');
  if (!list) return;
  const clamped = Math.min(activeIdx, LOGIN_STEPS.length - 1);
  list.innerHTML = LOGIN_STEPS.map((s, i) => `
    <li>
      <span class="lg-icon">${s.icon}</span>
      <span class="lg-step ${i < clamped ? 'done' : i === clamped ? 'active' : ''}">
        ${s.label}
      </span>
    </li>
  `).join('');
}

// ═══════════════════════════════════════════════════════════════════════════
// CONNECT MODAL HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Open the connect modal if it isn't already visible.
 * Prefer the app's own button click so all its own event listeners fire.
 */
function _openConnectModal(): void {
  const modal = _el<HTMLElement>('connectModal');
  if (modal && _isVisible(modal)) return; // already open

  // Prefer clicking the real button so the app's own handlers run
  const btn = _el<HTMLButtonElement>('connectBtn');
  if (btn && !_isVisible(modal)) {
    btn.click();
    return;
  }

  // Fallback: force-show the modal directly
  if (modal) {
    modal.style.zIndex   = '999999';
    modal.style.display  = 'flex';
    modal.style.position = 'fixed';
    modal.style.top      = '50%';
    modal.style.left     = '50%';
    modal.style.transform = 'translate(-50%, -50%)';
    modal.style.pointerEvents = 'all';
  }
}

/**
 * Close the connect modal using the app's own helper if available.
 * Only called when the tour ends completely.
 */
function _closeConnectModal(): void {
  if (typeof (window as any).closeConnectModal === 'function') {
    (window as any).closeConnectModal();
  } else {
    const modal = _el<HTMLElement>('connectModal');
    if (modal) modal.style.display = 'none';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LOGIN OBSERVER  (step 2 — watches for successful authentication)
// ═══════════════════════════════════════════════════════════════════════════

function _startLoginObserver(): void {
  _stopLoginObserver();

  const identityEl   = _el('nav-identity-display');
  const connectModal = _el('connectModal');
  const authModal    = _el('authModalOverlay');

  _renderLoginSteps(1); // step 0 (modal opened) is already done

  const checkState = () => {
    // A user is authenticated when the identity element no longer reads "NOT CONNECTED"
    const identityText  = identityEl?.textContent?.trim() ?? '';
    const isAuthenticated =
      identityText !== '' &&
      !identityText.includes('NOT CONNECTED');

    if (isAuthenticated) {
      _renderLoginSteps(3); // all steps done
      setTimeout(() => {
        if (_tourActive && _currentStep === 2) _goToStep(3);
      }, 1200);
      return;
    }

    // FIX: only call display "visible" if it's explicitly set to flex/block,
    // not when the inline style is empty (browser default).
    const modalDisplay = connectModal?.style.display ?? '';
    const isConnectOpen = modalDisplay === 'flex' || modalDisplay === 'block'
      || connectModal?.classList.contains('active') === true;

    if (isConnectOpen) {
      _renderLoginSteps(2);
    }

    // If the auth (email) modal is visible, user is mid-flow — step 2 active
    const isAuthOpen = authModal?.style.display === 'flex';
    if (isAuthOpen) {
      _renderLoginSteps(2);
    }
  };

  _loginObserver = new MutationObserver(checkState);

  const opts = { childList: true, characterData: true, subtree: true };
  const attrOpts = { attributes: true, attributeFilter: ['class', 'style'] };

  if (identityEl)   _loginObserver.observe(identityEl,   opts);
  if (connectModal) _loginObserver.observe(connectModal,  attrOpts);
  if (authModal)    _loginObserver.observe(authModal,     attrOpts);

  // Run once immediately in case user is already logged in
  checkState();
}

function _stopLoginObserver(): void {
  if (_loginObserver) { _loginObserver.disconnect(); _loginObserver = null; }
}

// ═══════════════════════════════════════════════════════════════════════════
// SPOTLIGHT + TOOLTIP POSITIONING
// ═══════════════════════════════════════════════════════════════════════════

function _spotlightElement(target: Element | null, padding = 10): void {
  const spot = _getOrCreate('olivium-tour-spotlight');
  if (!target) {
    spot.style.display = 'none';
    return;
  }
  const r = target.getBoundingClientRect();
  Object.assign(spot.style, {
    display: 'block',
    top:     `${r.top    - padding}px`,
    left:    `${r.left   - padding}px`,
    width:   `${r.width  + padding * 2}px`,
    height:  `${r.height + padding * 2}px`,
  });
}

function _positionTooltip(target: Element | null, placement: Placement): void {
  const tooltip = _getOrCreate('olivium-tour-tooltip');
  const TW  = tooltip.offsetWidth  || 380;
  const TH  = tooltip.offsetHeight || 200;
  const pad = 16;
  const vw  = window.innerWidth;
  const vh  = window.innerHeight;

  // Strip old arrow class
  tooltip.className = tooltip.className.replace(/\barrow-\w+\b/g, '').trim();

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
    case 'bottom': top = r.bottom + 14; left = Math.min(r.left, vw - TW - pad); arrowClass = 'arrow-top';    break;
    case 'top':    top = r.top - TH - 14; left = Math.min(r.left, vw - TW - pad); arrowClass = 'arrow-bottom'; break;
    case 'left':   top = r.top; left = r.left - TW - 14; arrowClass = 'arrow-right';  break;
    case 'right':  top = r.top; left = r.right + 14;     arrowClass = 'arrow-left';   break;
  }

  top  = Math.max(pad, Math.min(top,  vh - TH - pad));
  left = Math.max(pad, Math.min(left, vw - TW - pad));

  Object.assign(tooltip.style, { top: `${top}px`, left: `${left}px` });
  tooltip.classList.add(arrowClass);
}

// ═══════════════════════════════════════════════════════════════════════════
// RENDER STEP
// ═══════════════════════════════════════════════════════════════════════════

function _renderStep(index: number): void {
  const step = _steps[index];
  if (!step) { endTour(); return; }

  const targetEl = step.target
    ? document.querySelector<HTMLElement>(step.target)
    : null;

  // Scroll target into view before spotlighting
  if (targetEl) {
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Give the scroll a moment to settle before positioning
  setTimeout(() => {
    _spotlightElement(targetEl);
    _buildTooltipContent(step, index);
    _positionTooltip(targetEl, step.placement ?? 'bottom');
    step.onEnter?.();
  }, 220);
}

function _buildTooltipContent(step: TourStep, index: number): void {
  const tooltip = _getOrCreate('olivium-tour-tooltip');
  const total   = _steps.length;

  const dots = Array.from({ length: total }, (_, i) =>
    `<span class="tour-dot ${i < index ? 'done' : i === index ? 'active' : ''}"></span>`
  ).join('');

  const partLabel =
    index === 0 ? 'Welcome' :
    index <= 2  ? 'Part 1 — Connect' :
                  'Part 2 — Dashboard';

  tooltip.innerHTML = `
    <div class="tour-step-badge">
      <span class="badge-dot"></span>${partLabel} · ${index + 1}/${total}
    </div>
    <h2 class="tour-title">${step.title}</h2>
    <p class="tour-body">${step.body}</p>
    <div class="tour-actions">
      <div class="tour-progress">${dots}</div>
      <div style="display:flex;gap:8px;align-items:center;">
        ${step.showSkip ? `<button class="tour-btn-skip" id="tour-skip-btn">Skip tour</button>` : ''}
        <button class="tour-btn-next" id="tour-next-btn">${step.next ?? 'Next →'}</button>
      </div>
    </div>
  `;
  tooltip.style.display = 'block';

  document.getElementById('tour-next-btn')!.onclick = () => {
    step.onLeave?.();
    _goToStep(index + 1);
  };

  const skipBtn = document.getElementById('tour-skip-btn');
  if (skipBtn) skipBtn.onclick = endTour;

  // Wire mignole links injected into this tooltip HTML
  _attachMignoleTriggers();
}

// ═══════════════════════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════════════════════

function _goToStep(index: number): void {
  if (index >= _steps.length) { endTour(); return; }
  _currentStep = index;
  _renderStep(index);
}

// ═══════════════════════════════════════════════════════════════════════════
// RESIZE HANDLER
// ═══════════════════════════════════════════════════════════════════════════

function _handleResize(): void {
  if (!_tourActive) return;
  const step = _steps[_currentStep];
  if (!step) return;
  const targetEl = step.target
    ? document.querySelector<HTMLElement>(step.target)
    : null;
  _spotlightElement(targetEl);
  _positionTooltip(targetEl, step.placement ?? 'bottom');
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

export function startTour(): void {
  _injectStyles();
  _buildMignolePopup();
  _buildLoginGuide();

  _steps       = buildSteps();
  _currentStep = 0;
  _tourActive  = true;

  // Backdrop (blocks accidental interaction with the page)
  const backdrop = _getOrCreate('olivium-tour-backdrop');
  backdrop.style.opacity = '1';
  // Clicking the backdrop does nothing — user must use the tooltip buttons
  backdrop.onclick = () => {};

  _getOrCreate('olivium-tour-spotlight');

  const tooltip = _getOrCreate('olivium-tour-tooltip');
  tooltip.style.display = 'block';

  _renderStep(0);

  window.addEventListener('resize', _handleResize);
}

export function endTour(): void {
  _tourActive = false;

  _stopLoginObserver();
  _showLoginGuide(false);
  _hideMignolePopup();

  const backdrop = _el('olivium-tour-backdrop');
  if (backdrop) {
    backdrop.style.opacity = '0';
    setTimeout(() => backdrop.remove(), 400);
  }

  _el('olivium-tour-spotlight')?.remove();

  const tooltip = _el('olivium-tour-tooltip');
  if (tooltip) tooltip.style.display = 'none';

  window.removeEventListener('resize', _handleResize);

  // Close the connect modal only when the whole tour is done
  _closeConnectModal();
}

// ═══════════════════════════════════════════════════════════════════════════
// RESTART FAB
// ═══════════════════════════════════════════════════════════════════════════

function _injectRestartFAB(): void {
  if (document.getElementById('olivium-tour-restart-fab')) return;
  const fab = document.createElement('button');
  fab.id = 'olivium-tour-restart-fab';
  fab.setAttribute('aria-label', 'Restart tour');
  fab.title   = 'Restart Olivium tour';
  fab.textContent = '?';
  fab.onclick = startTour;
  document.body.appendChild(fab);
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-INIT
// ═══════════════════════════════════════════════════════════════════════════

function _init(): void {
  _injectStyles();
  _buildMignolePopup();
  _buildLoginGuide();
  _injectRestartFAB();

  if (!localStorage.getItem('olivium_tour_done')) {
    setTimeout(() => {
      startTour();
      localStorage.setItem('olivium_tour_done', '1');
    }, 900);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _init);
} else {
  _init();
}
