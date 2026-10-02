/* ============================================================================
   OLIVIUM — NEW LIVE DASHBOARD / AUTH CONTROLLER
   File: new_live.ts

   PRIMARY IDENTITY:
     Supabase Auth user.id

   OPTIONAL:
     Solana / Phantom wallet

   IMPORTANT:
     Login/logout and wallet connect/disconnect are deliberately separate.

   Database:
     public.users
       auth_user_id uuid
       Email_address text
       wallet text nullable
       OLV_tokens integer
       credits integer
       token text

     public.villa_bookings
       id uuid
       owner text
       night date
       email text
       name text
       notes text
       created_at timestamp
       auth_user_id uuid nullable

   Existing low-level Solana functionality remains in:
     ./src/connection
     ./src/reserve_board
============================================================================ */

import { sb } from "./src/connection";

import {
  connectWallet,
  disconnectWallet,
  getIdentity,
  getProgram,
  getProvider,
} from "./src/connection";

import {
  updateVillaStayUI,
  updateStatsUI,
  updateWalletUI,
  getTrees,
} from "./src/reserve_board";

/* ============================================================================
   TYPES
============================================================================ */

export interface LiveMember {
  authUserId: string;
  email: string;

  wallet: string | null;

  credits: number;
  olvTokens: number;

  token: string | null;

  createdAt?: string | null;
}

export interface LiveState {
  initialized: boolean;

  loggedIn: boolean;

  authUserId: string | null;
  email: string | null;

  member: LiveMember | null;

  walletConnected: boolean;
  walletAddress: string | null;

  loading: boolean;
}

const state: LiveState = {
  initialized: false,

  loggedIn: false,

  authUserId: null,
  email: null,

  member: null,

  walletConnected: false,
  walletAddress: null,

  loading: false,
};

/* ============================================================================
   CONSTANTS
============================================================================ */

const OLVM_MINT_ADDRESS =
  import.meta.env.VITE_OLVM_MINT ||
  "";

const MEMBER_TABLE = "users";
const BOOKINGS_TABLE = "villa_bookings";

/* ============================================================================
   WINDOW TYPES
============================================================================ */

declare global {
  interface Window {
    OliviumLive: typeof OliviumLive;

    OliviumAuth: any;

    connectWallet?: typeof connectWallet;
    disconnectWallet?: typeof disconnectWallet;

    loginOlivium?: typeof login;
    signupOlivium?: typeof signup;
    logoutOlivium?: typeof logout;

    connectOliviumWallet?: typeof connectMemberWallet;
    disconnectOliviumWallet?: typeof disconnectMemberWallet;

    refreshOliviumLive?: typeof refresh;

    getOliviumMember?: typeof getMember;
    getOliviumAuthUser?: typeof getAuthUser;
    getOliviumWallet?: typeof getWallet;
  }
}

/* ============================================================================
   SMALL HELPERS
============================================================================ */

function $(selector: string): HTMLElement | null {
  return document.querySelector(selector);
}

function byId(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function setText(id: string, value: string): void {
  const el = byId(id);

  if (el) {
    el.textContent = value;
  }
}

function setVisible(
  selector: string,
  visible: boolean
): void {
  const elements = document.querySelectorAll<HTMLElement>(selector);

  elements.forEach((el) => {
    el.style.display = visible ? "" : "none";
  });
}

function shortenWallet(wallet: string | null): string {
  if (!wallet) return "";

  if (wallet.length <= 14) {
    return wallet;
  }

  return `${wallet.slice(0, 6)}…${wallet.slice(-6)}`;
}

function dispatch(name: string, detail: any = {}): void {
  window.dispatchEvent(
    new CustomEvent(name, {
      detail,
    })
  );
}

function toast(message: string): void {
  console.log(`[OLIVIUM] ${message}`);

  const existing =
    byId("toast") ||
    byId("toast-message") ||
    byId("notification");

  if (existing) {
    existing.textContent = message;

    existing.classList.add("show");

    window.setTimeout(() => {
      existing.classList.remove("show");
    }, 3500);

    return;
  }

  /*
   * Don't create a large new UI system if the existing dashboard
   * already provides a toast.
   */
  console.info(message);
}

/* ============================================================================
   SUPABASE AUTH USER
============================================================================ */

export async function getAuthUser() {
  const {
    data,
    error,
  } = await sb.auth.getUser();

  if (error) {
    console.warn(
      "[NEW_LIVE] getUser:",
      error.message
    );

    return null;
  }

  return data.user ?? null;
}

/* ============================================================================
   LOAD MEMBER
============================================================================ */

export async function loadMember(
  userId?: string,
  email?: string
): Promise<LiveMember | null> {
  const authUserId =
    userId ||
    state.authUserId;

  const authEmail =
    email ||
    state.email;

  if (!authUserId) {
    return null;
  }

  /*
   * PRIMARY LOOKUP:
   *
   * auth_user_id
   */
  let {
    data,
    error,
  } = await sb
    .from(MEMBER_TABLE)
    .select(
      "wallet, OLV_tokens, Email_address, credits, token, auth_user_id"
    )
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  /*
   * COMPATIBILITY FALLBACK:
   *
   * Existing member records may not yet have auth_user_id.
   *
   * We only use this to discover the old record.
   * Once discovered, we immediately attach auth_user_id.
   */
  if (!data && authEmail) {
    const fallback = await sb
      .from(MEMBER_TABLE)
      .select(
        "wallet, OLV_tokens, Email_address, credits, token, auth_user_id"
      )
      .ilike(
        "Email_address",
        authEmail
      )
      .maybeSingle();

    data = fallback.data;
    error = fallback.error;

    if (data && !data.auth_user_id) {
      const { error: linkError } =
        await sb
          .from(MEMBER_TABLE)
          .update({
            auth_user_id: authUserId,
          })
          .eq(
            "wallet",
            data.wallet
          );

      if (linkError) {
        console.warn(
          "[NEW_LIVE] Could not attach auth_user_id:",
          linkError.message
        );
      } else {
        data.auth_user_id =
          authUserId;
      }
    }
  }

  if (error) {
    console.error(
      "[NEW_LIVE] Member load failed:",
      error.message
    );

    return null;
  }

  if (!data) {
    /*
     * A valid Supabase Auth member does not necessarily
     * have a public.users record yet.
     *
     * Create one as an email-only member.
     */
    const { data: created, error: createError } =
      await sb
        .from(MEMBER_TABLE)
        .insert({
          auth_user_id: authUserId,
          "Email_address": authEmail,
          wallet: null,
          credits: 0,
          OLV_tokens: 0,
          token: null,
        })
        .select(
          "wallet, OLV_tokens, Email_address, credits, token, auth_user_id"
        )
        .single();

    if (createError) {
      console.error(
        "[NEW_LIVE] Could not create member:",
        createError.message
      );

      /*
       * The Auth account remains valid even if RLS prevents
       * creation of the public member record.
       */
      return null;
    }

    data = created;
  }

  const member: LiveMember = {
    authUserId,

    email:
      data.Email_address ||
      authEmail ||
      "",

    wallet:
      data.wallet ||
      null,

    credits:
      Number(data.credits || 0),

    olvTokens:
      Number(data.OLV_tokens || 0),

    token:
      data.token ||
      null,

    createdAt:
      null,
  };

  state.member = member;

  /*
   * Wallet state is separate from authentication state.
   */
  state.walletAddress =
    member.wallet;

  state.walletConnected =
    false;

  return member;
}

/* ============================================================================
   ATTACH WALLET TO CURRENT MEMBER
============================================================================ */

async function attachWalletToMember(
  wallet: string
): Promise<boolean> {
  if (!state.authUserId) {
    console.warn(
      "[NEW_LIVE] Cannot attach wallet without Auth user."
    );

    return false;
  }

  /*
   * First check whether this wallet already belongs to
   * another public.users member.
   */
  const { data: walletOwner, error: walletCheckError } =
    await sb
      .from(MEMBER_TABLE)
      .select(
        "auth_user_id, Email_address, wallet"
      )
      .eq(
        "wallet",
        wallet
      )
      .maybeSingle();

  if (walletCheckError) {
    console.warn(
      "[NEW_LIVE] Wallet lookup:",
      walletCheckError.message
    );
  }

  if (
    walletOwner &&
    walletOwner.auth_user_id &&
    walletOwner.auth_user_id !==
      state.authUserId
  ) {
    /*
     * Do NOT silently steal a wallet from another member.
     */
    console.error(
      "[NEW_LIVE] Wallet already belongs to another member."
    );

    toast(
      "This wallet is already associated with another Olivium member."
    );

    return false;
  }

  /*
   * Attach wallet to current authenticated member.
   */
  const { error } =
    await sb
      .from(MEMBER_TABLE)
      .update({
        wallet,
      })
      .eq(
        "auth_user_id",
        state.authUserId
      );

  if (error) {
    console.error(
      "[NEW_LIVE] Wallet attachment failed:",
      error.message
    );

    return false;
  }

  if (state.member) {
    state.member.wallet =
      wallet;
  }

  state.walletAddress =
    wallet;

  return true;
}

/* ============================================================================
   LOGIN
============================================================================ */

export async function login(
  email: string,
  password: string
): Promise<boolean> {
  email = email.trim();

  if (!email || !password) {
    toast(
      "Please enter your email and password."
    );

    return false;
  }

  state.loading = true;

  try {
    const { data, error } =
      await sb.auth.signInWithPassword({
        email,
        password,
      });

    if (error) {
      console.error(
        "[NEW_LIVE] Login failed:",
        error.message
      );

      toast(error.message);

      return false;
    }

    if (!data.user) {
      toast(
        "Login succeeded but no user was returned."
      );

      return false;
    }

    await activateAuthenticatedUser(
      data.user
    );

    return true;
  } finally {
    state.loading = false;
  }
}

/* ============================================================================
   SIGNUP
============================================================================ */

export async function signup(
  email: string,
  password: string
): Promise<boolean> {
  email = email.trim();

  if (!email || !password) {
    toast(
      "Please enter an email and password."
    );

    return false;
  }

  state.loading = true;

  try {
    const {
      data,
      error,
    } = await sb.auth.signUp({
      email,
      password,
    });

    if (error) {
      console.error(
        "[NEW_LIVE] Signup failed:",
        error.message
      );

      toast(error.message);

      return false;
    }

    /*
     * Depending on Supabase email-confirmation settings,
     * session may be null after signup.
     */
    if (data.user && data.session) {
      await activateAuthenticatedUser(
        data.user
      );

      toast(
        "Account created and signed in."
      );

      return true;
    }

    if (data.user && !data.session) {
      toast(
        "Account created. Please check your email to confirm your account."
      );

      return true;
    }

    return false;
  } finally {
    state.loading = false;
  }
}

/* ============================================================================
   LOGOUT
============================================================================ */

export async function logout(): Promise<boolean> {
  state.loading = true;

  try {
    /*
     * Logout is different from wallet disconnect.
     *
     * A full logout may disconnect the wallet as part of
     * clearing the dashboard session, but disconnecting the
     * wallet alone never signs the user out.
     */
    try {
      await disconnectWallet();
    } catch (walletError) {
      console.warn(
        "[NEW_LIVE] Wallet disconnect during logout:",
        walletError
      );
    }

    const { error } =
      await sb.auth.signOut();

    if (error) {
      console.error(
        "[NEW_LIVE] Logout failed:",
        error.message
      );

      return false;
    }

    clearMemberState();

    updateAuthUI();

    dispatch(
      "olivium:logged-out"
    );

    return true;
  } finally {
    state.loading = false;
  }
}

/* ============================================================================
   ACTIVATE AUTHENTICATED USER
============================================================================ */

async function activateAuthenticatedUser(
  user: any
): Promise<void> {
  if (!user) {
    clearMemberState();

    return;
  }

  state.loggedIn = true;

  state.authUserId =
    user.id;

  state.email =
    user.email ||
    null;

  /*
   * Load / create public.users member.
   */
  await loadMember(
    user.id,
    user.email
  );

  updateAuthUI();

  await refreshDashboard();

  dispatch(
    "olivium:member-ready",
    {
      user,
      member:
        state.member,
    }
  );
}

/* ============================================================================
   CLEAR STATE
============================================================================ */

function clearMemberState(): void {
  state.loggedIn = false;

  state.authUserId = null;
  state.email = null;

  state.member = null;

  state.walletConnected = false;
  state.walletAddress = null;

  updateAuthUI();
}

/* ============================================================================
   WALLET CONNECT
============================================================================ */

export async function connectMemberWallet(): Promise<boolean> {
  if (!state.loggedIn) {
    toast(
      "Please log in before connecting a wallet."
    );

    return false;
  }

  state.loading = true;

  try {
    /*
     * Existing low-level wallet connector.
     *
     * We deliberately do NOT use connectEmail().
     *
     * Supabase Auth is already the member identity.
     */
    await connectWallet(false);

    const identity =
      getIdentity();

    const wallet =
      identity?.wallet ||
      null;

    if (!wallet) {
      toast(
        "Wallet connection did not return an address."
      );

      return false;
    }

    const attached =
      await attachWalletToMember(
        wallet
      );

    if (!attached) {
      /*
       * Don't leave a wallet connected in the
       * low-level layer if we could not associate it.
       */
      try {
        await disconnectWallet();
      } catch {
        /* ignore */
      }

      return false;
    }

    state.walletConnected =
      true;

    state.walletAddress =
      wallet;

    updateAuthUI();

    await refreshDashboard();

    dispatch(
      "olivium:wallet-connected",
      {
        wallet,
        authUserId:
          state.authUserId,
      }
    );

    toast(
      `Wallet connected: ${shortenWallet(wallet)}`
    );

    return true;
  } catch (error: any) {
    console.error(
      "[NEW_LIVE] Wallet connection failed:",
      error
    );

    toast(
      error?.message ||
      "Could not connect wallet."
    );

    return false;
  } finally {
    state.loading = false;
  }
}

/* ============================================================================
   WALLET DISCONNECT
============================================================================ */

export async function disconnectMemberWallet(): Promise<boolean> {
  state.loading = true;

  try {
    /*
     * THIS DOES NOT CALL Supabase signOut().
     */
    await disconnectWallet();

    state.walletConnected =
      false;

    state.walletAddress =
      null;

    /*
     * We intentionally keep the member's stored wallet
     * association in public.users.
     *
     * Disconnecting Phantom means "not currently connected",
     * not "erase this member's wallet record".
     */
    updateAuthUI();

    await refreshDashboard();

    dispatch(
      "olivium:wallet-disconnected",
      {
        authUserId:
          state.authUserId,
      }
    );

    toast(
      "Wallet disconnected. You remain logged in."
    );

    return true;
  } catch (error: any) {
    console.error(
      "[NEW_LIVE] Wallet disconnect failed:",
      error
    );

    return false;
  } finally {
    state.loading = false;
  }
}

/* ============================================================================
   GETTERS
============================================================================ */

export function getMember(): LiveMember | null {
  return state.member
    ? {
        ...state.member,
      }
    : null;
}

export function getWallet(): string | null {
  return state.walletAddress;
}

export function isLoggedIn(): boolean {
  return state.loggedIn;
}

export function isWalletConnected(): boolean {
  return state.walletConnected &&
    !!state.walletAddress;
}

export function getLiveState(): LiveState {
  return {
    ...state,

    member:
      state.member
        ? {
            ...state.member,
          }
        : null,
  };
}

/* ============================================================================
   UPDATE AUTH / MEMBER UI
============================================================================ */

function updateAuthUI(): void {
  const loggedIn =
    state.loggedIn;

  const walletConnected =
    state.walletConnected &&
    !!state.walletAddress;

  /*
   * Existing dashboard areas.
   */
  setVisible(
    "#memberView",
    loggedIn
  );

  /*
   * Public hero is visible to guests.
   */
  setVisible(
    "#publicView",
    !loggedIn
  );

  /*
   * Compatibility IDs used by the existing dashboard.
   */
  const walletStatus =
    byId("wallet-status");

  if (walletStatus) {
    if (!loggedIn) {
      walletStatus.textContent =
        "Not logged in";
    } else if (walletConnected) {
      walletStatus.textContent =
        `Wallet connected: ${shortenWallet(
          state.walletAddress
        )}`;
    } else {
      walletStatus.textContent =
        "Logged in · Wallet not connected";
    }
  }

  const walletAddress =
    byId("wallet-address");

  if (walletAddress) {
    walletAddress.textContent =
      state.walletAddress ||
      "";
  }

  /*
   * Header wallet button.
   */
  const walletButton =
    byId("btn-wallet");

  if (walletButton) {
    if (!loggedIn) {
      walletButton.textContent =
        "Connect Wallet";
    } else if (walletConnected) {
      walletButton.textContent =
        "Disconnect Wallet";
    } else {
      walletButton.textContent =
        "Connect Wallet";
    }
  }

  /*
   * Connection bar.
   */
  const connectionBar =
    byId("connection-status");

  if (connectionBar) {
    if (!loggedIn) {
      connectionBar.textContent =
        "Please log in to enter your Olivium dashboard.";
    } else if (walletConnected) {
      connectionBar.textContent =
        `Wallet connected · ${shortenWallet(
          state.walletAddress
        )}`;
    } else {
      connectionBar.textContent =
        "Logged in · Connect your Solana wallet for wallet features.";
    }
  }

  /*
   * Member email.
   */
  setText(
    "member-email",
    state.email || ""
  );

  setText(
    "memberWalletLine",
    walletConnected
      ? `Wallet connected · ${shortenWallet(
          state.walletAddress
        )}`
      : "Wallet not connected"
  );

  /*
   * Membership status.
   */
  if (state.member) {
    setText(
      "memberTierLine",
      walletConnected
        ? "Your membership and wallet benefits are available."
        : "Your membership is active. Connect a wallet for Solana features."
    );
  }

  /*
   * Credits.
   */
  if (state.member) {
    setText(
      "member-credits",
      String(
        state.member.credits
      )
    );

    setText(
      "credits",
      String(
        state.member.credits
      )
    );

    setText(
      "olv-tokens",
      String(
        state.member.olvTokens
      )
    );
  }

  /*
   * Optional wallet-only UI.
   */
  document
    .querySelectorAll<HTMLElement>(
      "[data-wallet-required]"
    )
    .forEach((el) => {
      const enabled =
        loggedIn &&
        walletConnected;

      el.style.opacity =
        enabled ? "1" : "0.5";

      el.style.pointerEvents =
        enabled ? "" : "none";
    });

  /*
   * Email-only indicator.
   */
  document
    .querySelectorAll<HTMLElement>(
      "[data-member-only]"
    )
    .forEach((el) => {
      el.style.display =
        loggedIn ? "" : "none";
    });

  document
    .querySelectorAll<HTMLElement>(
      "[data-guest-only]"
    )
    .forEach((el) => {
      el.style.display =
        loggedIn ? "none" : "";
    });
}

/* ============================================================================
   OLVM BALANCE
============================================================================ */

export async function fetchOLVMBalance(
  walletAddress: string
): Promise<number> {
  if (!walletAddress) {
    return 0;
  }

  if (!OLVM_MINT_ADDRESS) {
    console.warn(
      "[NEW_LIVE] VITE_OLVM_MINT is not configured."
    );

    return 0;
  }

  try {
    const web3 =
      await import("@solana/web3.js");

    const connectionModule =
      await import("./src/connection");

    const owner =
      new web3.PublicKey(
        walletAddress
      );

    const mint =
      new web3.PublicKey(
        OLVM_MINT_ADDRESS
      );

    const result =
      await connectionModule.connection
        .getParsedTokenAccountsByOwner(
          owner,
          {
            mint,
          }
        );

    let balance = 0;

    for (const account of result.value) {
      const amount =
        account.account.data.parsed.info
          .tokenAmount;

      if (amount) {
        balance += Number(
          amount.uiAmount || 0
        );
      }
    }

    return balance;
  } catch (error) {
    console.warn(
      "[NEW_LIVE] OLVM balance:",
      error
    );

    return 0;
  }
}

/* ============================================================================
   UPDATE WALLET UI
============================================================================ */

async function updateWalletDashboard(): Promise<void> {
  if (!state.walletConnected ||
      !state.walletAddress) {
    return;
  }

  try {
    const olvm =
      await fetchOLVMBalance(
        state.walletAddress
      );

    /*
     * Existing generic wallet UI.
     */
    try {
      await updateWalletUI();
    } catch (error) {
      console.debug(
        "[NEW_LIVE] Existing wallet UI:",
        error
      );
    }

    /*
     * Update common OLVM elements if present.
     */
    const selectors = [
      "#olvm-balance",
      "#member-olvm",
      "#wallet-olvm",
    ];

    selectors.forEach((selector) => {
      const el =
        document.querySelector<HTMLElement>(
          selector
        );

      if (el) {
        el.textContent =
          olvm.toLocaleString(
            undefined,
            {
              maximumFractionDigits: 2,
            }
          );
      }
    });

    dispatch(
      "olivium:wallet-data",
      {
        wallet:
          state.walletAddress,
        olvm,
      }
    );
  } catch (error) {
    console.warn(
      "[NEW_LIVE] Wallet dashboard update:",
      error
    );
  }
}

/* ============================================================================
   BOOKINGS
============================================================================ */

export async function loadBookings(): Promise<any[]> {
  if (!state.loggedIn) {
    return [];
  }

  /*
   * PRIMARY:
   * auth_user_id
   */
  const primary =
    await sb
      .from(BOOKINGS_TABLE)
      .select(
        "id, owner, night, email, name, notes, created_at, auth_user_id"
      )
      .eq(
        "auth_user_id",
        state.authUserId
      )
      .order(
        "night",
        {
          ascending: true,
        }
      );

  if (!primary.error) {
    return primary.data || [];
  }

  console.warn(
    "[NEW_LIVE] Auth booking lookup:",
    primary.error.message
  );

  /*
   * Legacy fallback.
   */
  if (state.email) {
    const legacy =
      await sb
        .from(BOOKINGS_TABLE)
        .select(
          "id, owner, night, email, name, notes, created_at, auth_user_id"
        )
        .ilike(
          "email",
          state.email
        )
        .order(
          "night",
          {
            ascending: true,
          }
        );

    if (!legacy.error) {
      return legacy.data || [];
    }
  }

  return [];
}

/* ============================================================================
   DASHBOARD REFRESH
============================================================================ */

export async function refresh(): Promise<void> {
  if (!state.loggedIn) {
    updateAuthUI();

    return;
  }

  try {
    /*
     * Refresh member data.
     */
    if (state.authUserId) {
      await loadMember(
        state.authUserId,
        state.email || undefined
      );
    }

    updateAuthUI();

    /*
     * These existing functions may require the Anchor program.
     *
     * They are deliberately wrapped so an email-only member
     * does not become a "guest" simply because a wallet/program
     * isn't available.
     */
    try {
      await updateVillaStayUI();
    } catch (error) {
      console.debug(
        "[NEW_LIVE] Villa UI skipped:",
        error
      );
    }

    try {
      await updateStatsUI();
    } catch (error) {
      console.debug(
        "[NEW_LIVE] Stats UI skipped:",
        error
      );
    }

    if (state.walletConnected) {
      await updateWalletDashboard();
    }

    /*
     * Tree loading is public/member data and can be handled
     * independently of wallet state by reserve_board.
     */
    try {
      await getTrees();
    } catch (error) {
      console.debug(
        "[NEW_LIVE] Tree refresh:",
        error
      );
    }

    updateAuthUI();

    dispatch(
      "olivium:dashboard-refreshed",
      {
        state:
          getLiveState(),
      }
    );
  } catch (error) {
    console.error(
      "[NEW_LIVE] Dashboard refresh:",
      error
    );
  }
}

/* ============================================================================
   LEGACY COMPATIBILITY — OliviumAuth
============================================================================ */

function exposeLegacyAuthBridge(): void {
  /*
   * Existing reserve_board.ts already looks for:
   *
   * window.OliviumAuth?.getUser?.()
   *
   * Give it the actual Supabase Auth user.
   */
  window.OliviumAuth = {
    getUser: () => {
      return {
        id:
          state.authUserId,
        email:
          state.email,
        wallet:
          state.walletAddress,
      };
    },

    isLoggedIn: () =>
      state.loggedIn,

    getMember: () =>
      getMember(),

    getWallet: () =>
      getWallet(),

    logout: () =>
      logout(),
  };
}

/* ============================================================================
   EXISTING HTML WALLET BUTTON
============================================================================ */

function bindWalletButton(): void {
  const button =
    byId("btn-wallet");

  if (!button) {
    return;
  }

  /*
   * Prevent multiple listeners.
   */
  if (
    button.dataset.newLiveBound ===
    "true"
  ) {
    return;
  }

  button.dataset.newLiveBound =
    "true";

  button.addEventListener(
    "click",
    async (event) => {
      event.preventDefault();

      if (!state.loggedIn) {
        toast(
          "Please log in first."
        );

        return;
      }

      if (state.walletConnected) {
        await disconnectMemberWallet();
      } else {
        await connectMemberWallet();
      }
    }
  );
}

/* ============================================================================
   GENERIC LOGIN FORM SUPPORT
============================================================================ */

function findFirst(
  selectors: string[]
): HTMLInputElement | null {
  for (const selector of selectors) {
    const element =
      document.querySelector<
        HTMLInputElement
      >(selector);

    if (element) {
      return element;
    }
  }

  return null;
}

function bindAuthForms(): void {
  /*
   * We support common IDs without requiring a particular
   * authentication-modal implementation.
   */

  const loginForm =
    document.querySelector<HTMLFormElement>(
      "#login-form"
    );

  if (loginForm &&
      loginForm.dataset.newLiveBound !== "true") {
    loginForm.dataset.newLiveBound =
      "true";

    loginForm.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();

        const email =
          findFirst([
            "#login-email",
            "#email",
            'input[name="email"]',
          ]);

        const password =
          findFirst([
            "#login-password",
            "#password",
            'input[name="password"]',
          ]);

        if (!email || !password) {
          toast(
            "Login fields could not be found."
          );

          return;
        }

        await login(
          email.value,
          password.value
        );
      }
    );
  }

  const signupForm =
    document.querySelector<HTMLFormElement>(
      "#signup-form"
    );

  if (signupForm &&
      signupForm.dataset.newLiveBound !== "true") {
    signupForm.dataset.newLiveBound =
      "true";

    signupForm.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();

        const email =
          findFirst([
            "#signup-email",
            "#register-email",
            'input[name="signup-email"]',
          ]);

        const password =
          findFirst([
            "#signup-password",
            "#register-password",
            'input[name="signup-password"]',
          ]);

        if (!email || !password) {
          toast(
            "Signup fields could not be found."
          );

          return;
        }

        await signup(
          email.value,
          password.value
        );
      }
    );
  }

  /*
   * Logout buttons.
   */
  document
    .querySelectorAll<HTMLElement>(
      "#logout-btn, #btn-logout, [data-action='logout']"
    )
    .forEach((button) => {
      if (
        button.dataset.newLiveBound ===
        "true"
      ) {
        return;
      }

      button.dataset.newLiveBound =
        "true";

      button.addEventListener(
        "click",
        async (event) => {
          event.preventDefault();

          await logout();
        }
      );
    });
}

/* ============================================================================
   SUPABASE AUTH STATE
============================================================================ */

function subscribeToAuth(): void {
  sb.auth.onAuthStateChange(
    async (event, session) => {
      console.log(
        "[NEW_LIVE] Auth event:",
        event
      );

      /*
       * Supabase can fire INITIAL_SESSION on startup.
       */
      if (
        session?.user
      ) {
        /*
         * Avoid unnecessary duplicate loads.
         */
        if (
          state.authUserId ===
            session.user.id &&
          state.loggedIn
        ) {
          updateAuthUI();

          return;
        }

        await activateAuthenticatedUser(
          session.user
        );

        return;
      }

      /*
       * SIGNED_OUT
       */
      if (
        event ===
        "SIGNED_OUT"
      ) {
        clearMemberState();

        dispatch(
          "olivium:logged-out"
        );
      }

      updateAuthUI();
    }
  );
}

/* ============================================================================
   SESSION RESTORE
============================================================================ */

async function restoreSupabaseSession(): Promise<void> {
  try {
    const {
      data,
      error,
    } = await sb.auth.getSession();

    if (error) {
      console.error(
        "[NEW_LIVE] Session restore:",
        error.message
      );

      return;
    }

    if (data.session?.user) {
      await activateAuthenticatedUser(
        data.session.user
      );
    } else {
      clearMemberState();
    }
  } catch (error) {
    console.error(
      "[NEW_LIVE] Session restore failed:",
      error
    );
  }
}

/* ============================================================================
   BOOT
============================================================================ */

async function init(): Promise<void> {
  if (state.initialized) {
    return;
  }

  state.initialized = true;

  console.log(
    "🌿 OLIVIUM new_live.ts starting..."
  );

  /*
   * Expose public API immediately.
   */
  exposeGlobals();

  exposeLegacyAuthBridge();

  bindWalletButton();

  bindAuthForms();

  /*
   * Listen BEFORE restoring the session.
   */
  subscribeToAuth();

  /*
   * Restore Supabase session.
   *
   * This is the PRIMARY session.
   */
  await restoreSupabaseSession();

  updateAuthUI();

  console.log(
    "🌿 OLIVIUM new_live.ts ready",
    getLiveState()
  );

  dispatch(
    "olivium:new-live-ready",
    {
      state:
        getLiveState(),
    }
  );
}

/* ============================================================================
   GLOBAL API
============================================================================ */

const OliviumLive = {
  state,

  getState:
    getLiveState,

  getMember,

  getAuthUser,

  getWallet,

  isLoggedIn,

  isWalletConnected,

  login,

  signup,

  logout,

  connectWallet:
    connectMemberWallet,

  disconnectWallet:
    disconnectMemberWallet,

  loadMember,

  loadBookings,

  refresh,

  fetchOLVMBalance,
};

function exposeGlobals(): void {
  window.OliviumLive =
    OliviumLive;

  window.loginOlivium =
    login;

  window.signupOlivium =
    signup;

  window.logoutOlivium =
    logout;

  window.connectOliviumWallet =
    connectMemberWallet;

  window.disconnectOliviumWallet =
    disconnectMemberWallet;

  window.refreshOliviumLive =
    refresh;

  window.getOliviumMember =
    getMember;

  window.getOliviumAuthUser =
    getAuthUser;

  window.getOliviumWallet =
    getWallet;

  /*
   * Keep direct wallet functions available for existing HTML.
   */
  window.connectWallet =
    connectMemberWallet;

  window.disconnectWallet =
    disconnectMemberWallet;
}

/* ============================================================================
   AUTOMATIC START
============================================================================ */

if (
  document.readyState ===
  "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    () => {
      void init();
    },
    {
      once: true,
    }
  );
} else {
  void init();
}

/* ============================================================================
   DEBUG ACCESS
============================================================================ */

(window as any).__OLIVIUM_NEW_LIVE__ =
  {
    state,
    init,
    refresh,
    loadMember,
    loadBookings,
    connectMemberWallet,
    disconnectMemberWallet,
  };
