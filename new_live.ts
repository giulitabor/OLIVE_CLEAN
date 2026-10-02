/* ============================================================================
   OLIVIUM — NEW LIVE
   Complete Supabase Auth + optional Solana wallet controller

   PRIMARY IDENTITY
   ----------------
   Supabase Auth:
       auth.users.id
       auth.users.email

   OPTIONAL WALLET
   ---------------
   Phantom / Solana wallet

   DATABASE
   --------
   public.users
       wallet          text nullable
       OLV_tokens      integer
       Email_address   text
       credits         integer
       token           text
       auth_user_id    uuid

   public.villa_bookings
       id
       owner
       night
       email
       name
       notes
       created_at
       auth_user_id

   IMPORTANT
   ---------
   Login/logout and wallet connect/disconnect are separate.

============================================================================ */

import { sb } from "./src/connection";

import {
  connectWallet as lowLevelConnectWallet,
  disconnectWallet as lowLevelDisconnectWallet,
  getIdentity,
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

interface LiveMember {
  authUserId: string;
  email: string;

  wallet: string | null;

  credits: number;
  olvTokens: number;

  token: string | null;
}

interface LiveState {
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

const MEMBER_TABLE = "users";
const BOOKINGS_TABLE = "villa_bookings";

const OLVM_MINT_ADDRESS =
  import.meta.env.VITE_OLVM_MINT || "";

/* ============================================================================
   WINDOW TYPES
============================================================================ */

declare global {
  interface Window {
    OliviumLive: any;
    OliviumAuth: any;

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
   BASIC HELPERS
============================================================================ */

function byId(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function setText(
  id: string,
  value: string
): void {
  const el = byId(id);

  if (el) {
    el.textContent = value;
  }
}

function shortenWallet(
  wallet: string | null
): string {
  if (!wallet) return "";

  if (wallet.length <= 14) {
    return wallet;
  }

  return `${wallet.slice(0, 6)}…${wallet.slice(-6)}`;
}

function toast(
  message: string,
  success = true
): void {
  console.log(
    `[OLIVIUM] ${message}`
  );

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
   * Fallback notification.
   */
  let box =
    byId("new-live-toast");

  if (!box) {
    box =
      document.createElement("div");

    box.id =
      "new-live-toast";

    box.style.position =
      "fixed";

    box.style.bottom =
      "24px";

    box.style.right =
      "24px";

    box.style.zIndex =
      "99999";

    box.style.padding =
      "14px 18px";

    box.style.borderRadius =
      "12px";

    box.style.background =
      "#17351f";

    box.style.color =
      "#fff";

    box.style.fontFamily =
      "Inter, sans-serif";

    box.style.fontSize =
      "14px";

    box.style.boxShadow =
      "0 10px 30px rgba(0,0,0,.25)";

    document.body.appendChild(
      box
    );
  }

  box.textContent =
    message;

  box.style.border =
    success
      ? "1px solid rgba(150,190,120,.5)"
      : "1px solid rgba(220,90,90,.6)";

  box.style.display =
    "block";

  window.setTimeout(() => {
    if (box) {
      box.style.display =
        "none";
    }
  }, 4000);
}

function dispatch(
  eventName: string,
  detail: any = {}
): void {
  window.dispatchEvent(
    new CustomEvent(
      eventName,
      {
        detail,
      }
    )
  );
}

/* ============================================================================
   AUTH UI
============================================================================ */

function injectAuthStyles(): void {
  if (
    document.getElementById(
      "new-live-auth-styles"
    )
  ) {
    return;
  }

  const style =
    document.createElement("style");

  style.id =
    "new-live-auth-styles";

  style.textContent = `
    #newLiveAuthButton {
      display:inline-flex;
      align-items:center;
      justify-content:center;
      gap:8px;
      border:1px solid rgba(180,145,70,.45);
      background:#17351f;
      color:#fff;
      border-radius:999px;
      padding:10px 18px;
      font-weight:700;
      font-size:14px;
      cursor:pointer;
      transition:all .2s ease;
      z-index:9998;
    }

    #newLiveAuthButton:hover {
      transform:translateY(-1px);
      background:#214a2c;
    }

    #newLiveAuthButton.logged-in {
      background:#fff;
      color:#17351f;
    }

    #newLiveAuthModal {
      position:fixed;
      inset:0;
      z-index:100000;
      display:none;
      align-items:center;
      justify-content:center;
      background:rgba(10,15,10,.82);
      backdrop-filter:blur(8px);
      padding:20px;
      box-sizing:border-box;
    }

    #newLiveAuthModal.open {
      display:flex;
    }

    .new-live-auth-card {
      width:min(430px,100%);
      background:#fff;
      color:#17351f;
      border-radius:22px;
      box-shadow:0 30px 90px rgba(0,0,0,.35);
      overflow:hidden;
      position:relative;
    }

    .new-live-auth-head {
      padding:26px 26px 12px;
      text-align:center;
    }

    .new-live-auth-head h2 {
      margin:0 0 8px;
      font-family:Georgia,serif;
      font-size:28px;
    }

    .new-live-auth-head p {
      margin:0;
      color:#687066;
      font-size:14px;
      line-height:1.5;
    }

    .new-live-auth-close {
      position:absolute;
      top:14px;
      right:16px;
      border:0;
      background:transparent;
      font-size:26px;
      cursor:pointer;
      color:#687066;
    }

    .new-live-auth-tabs {
      display:flex;
      gap:5px;
      margin:18px 24px 0;
      background:#f2f3ed;
      border-radius:12px;
      padding:4px;
    }

    .new-live-auth-tabs button {
      flex:1;
      border:0;
      border-radius:9px;
      padding:11px;
      background:transparent;
      cursor:pointer;
      font-weight:700;
      color:#536057;
    }

    .new-live-auth-tabs button.active {
      background:#17351f;
      color:#fff;
    }

    .new-live-auth-form {
      padding:22px 24px 26px;
    }

    .new-live-auth-form label {
      display:block;
      margin:0 0 6px;
      font-size:13px;
      font-weight:700;
      color:#455148;
    }

    .new-live-auth-form input {
      width:100%;
      box-sizing:border-box;
      padding:13px 14px;
      border:1px solid #d4d9d1;
      border-radius:11px;
      margin-bottom:15px;
      font-size:15px;
      outline:none;
      background:#fff;
    }

    .new-live-auth-form input:focus {
      border-color:#8da76f;
      box-shadow:0 0 0 3px rgba(141,167,111,.15);
    }

    .new-live-auth-submit {
      width:100%;
      border:0;
      border-radius:12px;
      padding:14px;
      background:#17351f;
      color:#fff;
      font-weight:800;
      font-size:15px;
      cursor:pointer;
    }

    .new-live-auth-submit:disabled {
      opacity:.55;
      cursor:wait;
    }

    .new-live-auth-message {
      min-height:20px;
      margin-top:14px;
      text-align:center;
      font-size:13px;
      line-height:1.45;
    }

    .new-live-auth-footer {
      text-align:center;
      color:#788178;
      font-size:12px;
      padding:0 24px 24px;
    }

    .new-live-member-panel {
      padding:0 24px 24px;
    }

    .new-live-member-email {
      padding:12px;
      background:#f3f5ef;
      border-radius:11px;
      font-size:13px;
      margin-bottom:12px;
      word-break:break-word;
    }

    .new-live-member-actions {
      display:flex;
      gap:8px;
    }

    .new-live-member-actions button {
      flex:1;
      padding:11px;
      border-radius:10px;
      cursor:pointer;
      font-weight:700;
      border:1px solid #d4d9d1;
      background:#fff;
      color:#17351f;
    }

    .new-live-member-actions button.primary {
      background:#17351f;
      color:#fff;
      border-color:#17351f;
    }

    @media(max-width:600px) {
      #newLiveAuthButton {
        padding:9px 13px;
        font-size:13px;
      }

      .new-live-auth-card {
        border-radius:17px;
      }
    }
  `;

  document.head.appendChild(
    style
  );
}

/* ============================================================================
   CREATE AUTH UI
============================================================================ */

function createAuthUI(): void {
  injectAuthStyles();

  /*
   * If the old auth modal exists, use it instead of creating
   * another one.
   */
  const oldModal =
    byId("authModalOverlay");

  /*
   * Existing "Continue with Email" button.
   */
  const existingEmailButton =
    byId("emailLoginBtn");

  if (
    existingEmailButton &&
    !existingEmailButton.dataset.newLiveBound
  ) {
    existingEmailButton.dataset.newLiveBound =
      "true";

    existingEmailButton.addEventListener(
      "click",
      (event) => {
        event.preventDefault();

        openAuthModal();
      }
    );
  }

  /*
   * Existing auth modal can be used.
   */
  if (oldModal) {
    wireExistingAuthModal();

    return;
  }

  /*
   * No authentication UI exists.
   *
   * Create it.
   */
  const button =
    document.createElement("button");

  button.id =
    "newLiveAuthButton";

  button.type =
    "button";

  button.textContent =
    "Member Login";

  button.addEventListener(
    "click",
    () => {
      if (state.loggedIn) {
        openMemberMenu();
      } else {
        openAuthModal();
      }
    }
  );

  /*
   * Put the button into a sensible existing header.
   */
  const header =
    document.querySelector(
      "header"
    );

  if (header) {
    header.appendChild(
      button
    );
  } else {
    button.style.position =
      "fixed";

    button.style.top =
      "18px";

    button.style.right =
      "18px";

    document.body.appendChild(
      button
    );
  }

  const modal =
    document.createElement("div");

  modal.id =
    "newLiveAuthModal";

  modal.innerHTML = `
    <div class="new-live-auth-card">

      <button
        type="button"
        class="new-live-auth-close"
        id="newLiveAuthClose"
        aria-label="Close"
      >&times;</button>

      <div class="new-live-auth-head">
        <h2>Welcome to Olivium</h2>
        <p>
          Your email is your member identity.
          A Solana wallet is optional.
        </p>
      </div>

      <div class="new-live-auth-tabs">
        <button
          type="button"
          id="newLiveLoginTab"
          class="active"
        >
          Login
        </button>

        <button
          type="button"
          id="newLiveSignupTab"
        >
          Sign Up
        </button>
      </div>

      <form
        id="newLiveLoginForm"
        class="new-live-auth-form"
      >
        <label for="newLiveLoginEmail">
          Email
        </label>

        <input
          id="newLiveLoginEmail"
          type="email"
          autocomplete="email"
          placeholder="you@example.com"
          required
        >

        <label for="newLiveLoginPassword">
          Password
        </label>

        <input
          id="newLiveLoginPassword"
          type="password"
          autocomplete="current-password"
          placeholder="Your password"
          required
        >

        <button
          id="newLiveLoginSubmit"
          class="new-live-auth-submit"
          type="submit"
        >
          Login
        </button>

        <div
          id="newLiveLoginMessage"
          class="new-live-auth-message"
        ></div>
      </form>

      <form
        id="newLiveSignupForm"
        class="new-live-auth-form"
        style="display:none"
      >
        <label for="newLiveSignupEmail">
          Email
        </label>

        <input
          id="newLiveSignupEmail"
          type="email"
          autocomplete="email"
          placeholder="you@example.com"
          required
        >

        <label for="newLiveSignupPassword">
          Password
        </label>

        <input
          id="newLiveSignupPassword"
          type="password"
          autocomplete="new-password"
          placeholder="At least 6 characters"
          required
        >

        <label for="newLiveSignupConfirm">
          Confirm password
        </label>

        <input
          id="newLiveSignupConfirm"
          type="password"
          autocomplete="new-password"
          placeholder="Repeat your password"
          required
        >

        <button
          id="newLiveSignupSubmit"
          class="new-live-auth-submit"
          type="submit"
        >
          Create Member Account
        </button>

        <div
          id="newLiveSignupMessage"
          class="new-live-auth-message"
        ></div>
      </form>

      <div class="new-live-auth-footer">
        Your member account is stored securely with Supabase Auth.
      </div>

    </div>
  `;

  document.body.appendChild(
    modal
  );

  wireNewAuthUI();
}

/* ============================================================================
   OPEN AUTH MODAL
============================================================================ */

function openAuthModal(): void {
  /*
   * If our modal exists.
   */
  const modal =
    byId("newLiveAuthModal");

  if (modal) {
    modal.classList.add(
      "open"
    );

    const email =
      state.email;

    const input =
      document.querySelector<
        HTMLInputElement
      >(
        "#newLiveLoginEmail"
      );

    if (
      input &&
      email
    ) {
      input.value =
        email;
    }

    return;
  }

  /*
   * Existing legacy modal.
   */
  const old =
    byId("authModalOverlay");

  if (old) {
    old.style.display =
      "flex";
  }
}

/* ============================================================================
   CLOSE AUTH MODAL
============================================================================ */

function closeAuthModal(): void {
  const modal =
    byId("newLiveAuthModal");

  if (modal) {
    modal.classList.remove(
      "open"
    );
  }

  const old =
    byId("authModalOverlay");

  if (old) {
    old.style.display =
      "none";
  }
}

/* ============================================================================
   NEW AUTH UI WIRING
============================================================================ */

function wireNewAuthUI(): void {
  const modal =
    byId("newLiveAuthModal");

  if (!modal) {
    return;
  }

  const close =
    byId("newLiveAuthClose");

  close?.addEventListener(
    "click",
    () => {
      closeAuthModal();
    }
  );

  modal.addEventListener(
    "click",
    (event) => {
      if (
        event.target === modal
      ) {
        closeAuthModal();
      }
    }
  );

  const loginTab =
    byId("newLiveLoginTab");

  const signupTab =
    byId("newLiveSignupTab");

  const loginForm =
    document.querySelector<HTMLFormElement>(
      "#newLiveLoginForm"
    );

  const signupForm =
    document.querySelector<HTMLFormElement>(
      "#newLiveSignupForm"
    );

  function showLogin(): void {
    loginTab?.classList.add(
      "active"
    );

    signupTab?.classList.remove(
      "active"
    );

    if (loginForm) {
      loginForm.style.display =
        "block";
    }

    if (signupForm) {
      signupForm.style.display =
        "none";
    }
  }

  function showSignup(): void {
    signupTab?.classList.add(
      "active"
    );

    loginTab?.classList.remove(
      "active"
    );

    if (loginForm) {
      loginForm.style.display =
        "none";
    }

    if (signupForm) {
      signupForm.style.display =
        "block";
    }
  }

  loginTab?.addEventListener(
    "click",
    showLogin
  );

  signupTab?.addEventListener(
    "click",
    showSignup
  );

  loginForm?.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      const email =
        (
          byId(
            "newLiveLoginEmail"
          ) as HTMLInputElement
        )?.value || "";

      const password =
        (
          byId(
            "newLiveLoginPassword"
          ) as HTMLInputElement
        )?.value || "";

      const message =
        byId(
          "newLiveLoginMessage"
        );

      if (message) {
        message.textContent =
          "Signing in…";

        message.style.color =
          "#687066";
      }

      const success =
        await login(
          email,
          password
        );

      if (success) {
        if (message) {
          message.textContent =
            "Welcome back.";
          message.style.color =
            "#2e7d32";
        }

        window.setTimeout(
          closeAuthModal,
          500
        );
      }
    }
  );

  signupForm?.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      const email =
        (
          byId(
            "newLiveSignupEmail"
          ) as HTMLInputElement
        )?.value || "";

      const password =
        (
          byId(
            "newLiveSignupPassword"
          ) as HTMLInputElement
        )?.value || "";

      const confirm =
        (
          byId(
            "newLiveSignupConfirm"
          ) as HTMLInputElement
        )?.value || "";

      const message =
        byId(
          "newLiveSignupMessage"
        );

      if (
        password !==
        confirm
      ) {
        if (message) {
          message.textContent =
            "Passwords do not match.";

          message.style.color =
            "#c33";
        }

        return;
      }

      if (
        password.length <
        6
      ) {
        if (message) {
          message.textContent =
            "Password must be at least 6 characters.";

          message.style.color =
            "#c33";
        }

        return;
      }

      if (message) {
        message.textContent =
          "Creating your member account…";

        message.style.color =
          "#687066";
      }

      const success =
        await signup(
          email,
          password
        );

      if (success) {
        if (message) {
          message.textContent =
            "Account created.";
          message.style.color =
            "#2e7d32";
        }

        /*
         * If email confirmation is enabled,
         * don't close the modal immediately.
         */
        if (
          state.loggedIn
        ) {
          window.setTimeout(
            closeAuthModal,
            700
          );
        }
      }
    }
  );
}

/* ============================================================================
   EXISTING LEGACY AUTH MODAL
============================================================================ */

function wireExistingAuthModal(): void {
  const emailButton =
    byId("emailLoginBtn");

  if (
    emailButton &&
    !emailButton.dataset.newLiveBound
  ) {
    emailButton.dataset.newLiveBound =
      "true";

    emailButton.addEventListener(
      "click",
      (event) => {
        event.preventDefault();

        openAuthModal();
      }
    );
  }

  const close =
    byId("closeAuthModal");

  if (
    close &&
    !close.dataset.newLiveBound
  ) {
    close.dataset.newLiveBound =
      "true";

    close.addEventListener(
      "click",
      () => {
        closeAuthModal();
      }
    );
  }

  /*
   * The old HTML contains:
   *
   * loginEmail
   * loginPassword
   * loginBtn
   * signupEmail
   * signupPassword
   * signupConfirmPassword
   * signupBtn
   *
   * We wire these directly to Supabase.
   */

  const loginBtn =
    byId("loginBtn");

  if (
    loginBtn &&
    !loginBtn.dataset.newLiveBound
  ) {
    loginBtn.dataset.newLiveBound =
      "true";

    loginBtn.addEventListener(
      "click",
      async (event) => {
        event.preventDefault();

        const email =
          (
            byId(
              "loginEmail"
            ) as HTMLInputElement
          )?.value || "";

        const password =
          (
            byId(
              "loginPassword"
            ) as HTMLInputElement
          )?.value || "";

        await login(
          email,
          password
        );
      }
    );
  }

  const signupBtn =
    byId("signupBtn");

  if (
    signupBtn &&
    !signupBtn.dataset.newLiveBound
  ) {
    signupBtn.dataset.newLiveBound =
      "true";

    signupBtn.addEventListener(
      "click",
      async (event) => {
        event.preventDefault();

        const email =
          (
            byId(
              "signupEmail"
            ) as HTMLInputElement
          )?.value || "";

        const password =
          (
            byId(
              "signupPassword"
            ) as HTMLInputElement
          )?.value || "";

        const confirm =
          (
            byId(
              "signupConfirmPassword"
            ) as HTMLInputElement
          )?.value || "";

        if (
          password !==
          confirm
        ) {
          setLegacyMessage(
            "Passwords do not match.",
            false
          );

          return;
        }

        await signup(
          email,
          password
        );
      }
    );
  }

  /*
   * Tabs.
   */
  const loginTab =
    byId("loginTab");

  const signupTab =
    byId("signupTab");

  const loginForm =
    byId("loginForm");

  const signupForm =
    byId("signupForm");

  loginTab?.addEventListener(
    "click",
    () => {
      if (loginForm) {
        loginForm.style.display =
          "block";
      }

      if (signupForm) {
        signupForm.style.display =
          "none";
      }
    }
  );

  signupTab?.addEventListener(
    "click",
    () => {
      if (loginForm) {
        loginForm.style.display =
          "none";
      }

      if (signupForm) {
        signupForm.style.display =
          "block";
      }
    }
  );
}

function setLegacyMessage(
  message: string,
  success = true
): void {
  const el =
    byId("msg");

  if (!el) {
    return;
  }

  el.textContent =
    message;

  el.style.color =
    success
      ? "#2e7d32"
      : "#d94d4d";
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

  return data.user || null;
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
   * 1. PRIMARY LOOKUP
   *
   * New architecture:
   * auth_user_id is canonical.
   */
  let result =
    await sb
      .from(MEMBER_TABLE)
      .select(
        "wallet, OLV_tokens, Email_address, credits, token, auth_user_id"
      )
      .eq(
        "auth_user_id",
        authUserId
      )
      .maybeSingle();

  let data =
    result.data;

  let error =
    result.error;

  /*
   * 2. LEGACY EMAIL LOOKUP
   *
   * This lets existing members such as:
   *
   * kyngrick@protonmail.com
   * rob@gmail.com
   * we@test.net
   *
   * get attached to their existing public.users row.
   */
  if (
    !data &&
    authEmail
  ) {
    result =
      await sb
        .from(MEMBER_TABLE)
        .select(
          "wallet, OLV_tokens, Email_address, credits, token, auth_user_id"
        )
        .ilike(
          "Email_address",
          authEmail
        )
        .maybeSingle();

    data =
      result.data;

    error =
      result.error;

    /*
     * Attach the existing member to Supabase Auth.
     */
    if (
      data &&
      !data.auth_user_id
    ) {
      const {
        error: linkError,
      } = await sb
        .from(MEMBER_TABLE)
        .update({
          auth_user_id:
            authUserId,
        })
        .eq(
          "Email_address",
          data.Email_address
        );

      if (linkError) {
        console.warn(
          "[NEW_LIVE] Could not link member:",
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
      "[NEW_LIVE] Member lookup:",
      error.message
    );

    return null;
  }

  /*
   * 3. NO PUBLIC USERS RECORD
   *
   * Create an email-only member.
   */
  if (!data) {
    const {
      data: created,
      error: createError,
    } = await sb
      .from(MEMBER_TABLE)
      .insert({
        auth_user_id:
          authUserId,

        "Email_address":
          authEmail,

        wallet:
          null,

        credits:
          0,

        OLV_tokens:
          0,

        token:
          null,
      })
      .select(
        "wallet, OLV_tokens, Email_address, credits, token, auth_user_id"
      )
      .single();

    if (createError) {
      console.error(
        "[NEW_LIVE] Member creation:",
        createError.message
      );

      /*
       * The Supabase account itself still exists.
       */
      return null;
    }

    data =
      created;
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
      Number(
        data.credits || 0
      ),

    olvTokens:
      Number(
        data.OLV_tokens || 0
      ),

    token:
      data.token ||
      null,
  };

  state.member =
    member;

  /*
   * Stored wallet is an association.
   *
   * It does NOT mean Phantom is currently connected.
   */
  return member;
}

/* ============================================================================
   ACTIVATE AUTH SESSION
============================================================================ */

async function activateAuthenticatedUser(
  user: any
): Promise<void> {
  if (!user) {
    clearMemberState();

    return;
  }

  state.loggedIn =
    true;

  state.authUserId =
    user.id;

  state.email =
    user.email ||
    null;

  await loadMember(
    user.id,
    user.email
  );

  updateAuthUI();

  dispatch(
    "olivium:member-ready",
    {
      user,
      member:
        state.member,
    }
  );

  /*
   * Refresh dashboard after identity is established.
   */
  await refresh();
}

/* ============================================================================
   LOGIN
============================================================================ */

export async function login(
  email: string,
  password: string
): Promise<boolean> {
  email =
    email
      .trim()
      .toLowerCase();

  password =
    password.trim();

  if (
    !email ||
    !password
  ) {
    setLegacyMessage(
      "Please enter your email and password.",
      false
    );

    toast(
      "Please enter your email and password.",
      false
    );

    return false;
  }

  state.loading =
    true;

  try {
    const {
      data,
      error,
    } = await sb.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error(
        "[NEW_LIVE] Login:",
        error.message
      );

      setLegacyMessage(
        error.message,
        false
      );

      toast(
        error.message,
        false
      );

      return false;
    }

    if (!data.user) {
      setLegacyMessage(
        "No Supabase user was returned.",
        false
      );

      return false;
    }

    /*
     * Supabase has authenticated the user.
     */
    await activateAuthenticatedUser(
      data.user
    );

    setLegacyMessage(
      "Login successful.",
      true
    );

    toast(
      `Welcome back, ${data.user.email}.`
    );

    return true;
  } catch (error: any) {
    console.error(
      "[NEW_LIVE] Login exception:",
      error
    );

    setLegacyMessage(
      error?.message ||
        "Login failed.",
      false
    );

    toast(
      error?.message ||
        "Login failed.",
      false
    );

    return false;
  } finally {
    state.loading =
      false;
  }
}

/* ============================================================================
   SIGNUP
============================================================================ */

export async function signup(
  email: string,
  password: string
): Promise<boolean> {
  email =
    email
      .trim()
      .toLowerCase();

  password =
    password.trim();

  if (
    !email ||
    !password
  ) {
    setLegacyMessage(
      "Please enter an email and password.",
      false
    );

    return false;
  }

  if (
    password.length <
    6
  ) {
    setLegacyMessage(
      "Password must be at least 6 characters.",
      false
    );

    return false;
  }

  state.loading =
    true;

  try {
    /*
     * REAL SUPABASE SIGNUP.
     *
     * No custodial wallet.
     * No generated seed.
     * No fake authentication.
     */
    const {
      data,
      error,
    } = await sb.auth.signUp({
      email,
      password,
    });

    if (error) {
      console.error(
        "[NEW_LIVE] Signup:",
        error.message
      );

      setLegacyMessage(
        error.message,
        false
      );

      toast(
        error.message,
        false
      );

      return false;
    }

    /*
     * Supabase can require email confirmation.
     */
    if (
      data.user &&
      !data.session
    ) {
      setLegacyMessage(
        "Account created. Check your email to confirm your account.",
        true
      );

      toast(
        "Account created. Check your email to confirm your account."
      );

      return true;
    }

    /*
     * Email confirmation disabled:
     * session is immediately available.
     */
    if (
      data.user &&
      data.session
    ) {
      await activateAuthenticatedUser(
        data.user
      );

      setLegacyMessage(
        "Account created and logged in.",
        true
      );

      toast(
        "Welcome to Olivium."
      );

      return true;
    }

    return false;
  } catch (error: any) {
    console.error(
      "[NEW_LIVE] Signup exception:",
      error
    );

    setLegacyMessage(
      error?.message ||
        "Signup failed.",
      false
    );

    return false;
  } finally {
    state.loading =
      false;
  }
}

/* ============================================================================
   LOGOUT
============================================================================ */

export async function logout(): Promise<boolean> {
  state.loading =
    true;

  try {
    /*
     * Disconnect Phantom if currently connected.
     *
     * This is done because the user explicitly requested
     * a FULL logout.
     */
    if (
      state.walletConnected
    ) {
      try {
        await lowLevelDisconnectWallet();
      } catch (error) {
        console.warn(
          "[NEW_LIVE] Wallet cleanup:",
          error
        );
      }
    }

    /*
     * REAL SUPABASE LOGOUT.
     */
    const {
      error,
    } = await sb.auth.signOut();

    if (error) {
      console.error(
        "[NEW_LIVE] Logout:",
        error.message
      );

      return false;
    }

    clearMemberState();

    updateAuthUI();

    closeAuthModal();

    dispatch(
      "olivium:logged-out"
    );

    toast(
      "You have been logged out."
    );

    return true;
  } finally {
    state.loading =
      false;
  }
}

/* ============================================================================
   CLEAR MEMBER STATE
============================================================================ */

function clearMemberState(): void {
  state.loggedIn =
    false;

  state.authUserId =
    null;

  state.email =
    null;

  state.member =
    null;

  state.walletConnected =
    false;

  state.walletAddress =
    null;

  /*
   * Do NOT destroy the Supabase session here.
   *
   * This function only clears our local dashboard state.
   */
  updateAuthUI();
}

/* ============================================================================
   ATTACH WALLET
============================================================================ */

async function attachWalletToMember(
  wallet: string
): Promise<boolean> {
  if (!state.authUserId) {
    toast(
      "Please log in before connecting a wallet.",
      false
    );

    return false;
  }

  /*
   * Check whether another Auth member already owns
   * this wallet association.
   */
  const {
    data: existing,
    error: lookupError,
  } = await sb
    .from(MEMBER_TABLE)
    .select(
      "auth_user_id, Email_address, wallet"
    )
    .eq(
      "wallet",
      wallet
    )
    .maybeSingle();

  if (lookupError) {
    console.warn(
      "[NEW_LIVE] Wallet lookup:",
      lookupError.message
    );
  }

  if (
    existing?.auth_user_id &&
    existing.auth_user_id !==
      state.authUserId
  ) {
    toast(
      "This wallet is already associated with another Olivium member.",
      false
    );

    return false;
  }

  const {
    error,
  } = await sb
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
      "[NEW_LIVE] Wallet attach:",
      error.message
    );

    toast(
      error.message,
      false
    );

    return false;
  }

  if (state.member) {
    state.member.wallet =
      wallet;
  }

  return true;
}

/* ============================================================================
   CONNECT WALLET
============================================================================ */

export async function connectMemberWallet(): Promise<boolean> {
  if (!state.loggedIn) {
    openAuthModal();

    toast(
      "Please log in first.",
      false
    );

    return false;
  }

  state.loading =
    true;

  try {
    /*
     * Existing Phantom / Solana connector.
     */
    await lowLevelConnectWallet(
      false
    );

    const identity =
      getIdentity();

    const wallet =
      identity?.wallet ||
      null;

    if (!wallet) {
      toast(
        "Wallet connection did not return an address.",
        false
      );

      return false;
    }

    /*
     * Associate wallet with Supabase member.
     */
    const attached =
      await attachWalletToMember(
        wallet
      );

    if (!attached) {
      try {
        await lowLevelDisconnectWallet();
      } catch {
        /* ignore */
      }

      return false;
    }

    state.walletConnected =
      true;

    state.walletAddress =
      wallet;

    /*
     * Re-establish our canonical Supabase member bridge.
     */
    exposeLegacyAuthBridge();

    updateAuthUI();

    await refresh();

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
      "[NEW_LIVE] Wallet connection:",
      error
    );

    toast(
      error?.message ||
        "Wallet connection failed.",
      false
    );

    return false;
  } finally {
    state.loading =
      false;
  }
}

/* ============================================================================
   DISCONNECT WALLET
============================================================================ */

export async function disconnectMemberWallet(): Promise<boolean> {
  state.loading =
    true;

  try {
    /*
     * IMPORTANT:
     *
     * This is NOT sb.auth.signOut().
     *
     * The member remains logged in.
     */
    await lowLevelDisconnectWallet();

    state.walletConnected =
      false;

    state.walletAddress =
      null;

    /*
     * connection.ts clears OliviumAuth.
     * Put our canonical Supabase bridge back.
     */
    exposeLegacyAuthBridge();

    updateAuthUI();

    await refresh();

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
      "[NEW_LIVE] Wallet disconnect:",
      error
    );

    return false;
  } finally {
    state.loading =
      false;
  }
}

/* ============================================================================
   WALLET BALANCE
============================================================================ */

export async function fetchOLVMBalance(
  walletAddress: string
): Promise<number> {
  if (
    !walletAddress ||
    !OLVM_MINT_ADDRESS
  ) {
    return 0;
  }

  try {
    const {
      PublicKey,
    } =
      await import(
        "@solana/web3.js"
      );

    const {
      connection,
    } =
      await import(
        "./src/connection"
      );

    const owner =
      new PublicKey(
        walletAddress
      );

    const mint =
      new PublicKey(
        OLVM_MINT_ADDRESS
      );

    const result =
      await connection.getParsedTokenAccountsByOwner(
        owner,
        {
          mint,
        }
      );

    let total = 0;

    for (
      const account
      of result.value
    ) {
      const amount =
        account.account.data
          .parsed.info
          .tokenAmount;

      total +=
        Number(
          amount?.uiAmount || 0
        );
    }

    return total;
  } catch (error) {
    console.warn(
      "[NEW_LIVE] OLVM:",
      error
    );

    return 0;
  }
}

/* ============================================================================
   BOOKINGS
============================================================================ */

export async function loadBookings(): Promise<any[]> {
  if (
    !state.loggedIn ||
    !state.authUserId
  ) {
    return [];
  }

  /*
   * New canonical lookup.
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
          ascending:
            true,
        }
      );

  if (!primary.error) {
    return primary.data || [];
  }

  /*
   * Legacy compatibility.
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
            ascending:
              true,
          }
        );

    if (!legacy.error) {
      return legacy.data || [];
    }
  }

  return [];
}

/* ============================================================================
   REFRESH DASHBOARD
============================================================================ */

export async function refresh(): Promise<void> {
  if (!state.loggedIn) {
    updateAuthUI();

    return;
  }

  try {
    /*
     * Reload canonical member record.
     */
    if (
      state.authUserId
    ) {
      await loadMember(
        state.authUserId,
        state.email || undefined
      );
    }

    updateAuthUI();

    /*
     * Existing dashboard functions.
     *
     * They may still contain wallet-specific assumptions.
     * They are isolated so they cannot destroy the Supabase
     * member session.
     */
    try {
      await updateVillaStayUI();
    } catch (error) {
      console.debug(
        "[NEW_LIVE] Villa UI:",
        error
      );
    }

    try {
      await updateStatsUI();
    } catch (error) {
      console.debug(
        "[NEW_LIVE] Stats UI:",
        error
      );
    }

    if (
      state.walletConnected
    ) {
      try {
        await updateWalletUI();
      } catch (error) {
        console.debug(
          "[NEW_LIVE] Wallet UI:",
          error
        );
      }

      const olvm =
        await fetchOLVMBalance(
          state.walletAddress!
        );

      setText(
        "olvm-balance",
        olvm.toLocaleString(
          undefined,
          {
            maximumFractionDigits:
              2,
          }
        )
      );
    }

    /*
     * Public tree data.
     */
    try {
      await getTrees();
    } catch (error) {
      console.debug(
        "[NEW_LIVE] Trees:",
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
      "[NEW_LIVE] Refresh:",
      error
    );
  }
}

/* ============================================================================
   AUTH UI UPDATE
============================================================================ */

function updateAuthUI(): void {
  /*
   * Automatically-created auth button.
   */
  const button =
    byId(
      "newLiveAuthButton"
    );

  if (button) {
    if (
      state.loggedIn
    ) {
      button.classList.add(
        "logged-in"
      );

      button.textContent =
        state.email
          ? state.email
          : "Member";
    } else {
      button.classList.remove(
        "logged-in"
      );

      button.textContent =
        "Member Login";
    }
  }

  /*
   * Existing dashboard wallet button.
   */
  const walletButton =
    byId(
      "btn-wallet"
    );

  if (walletButton) {
    if (
      !state.loggedIn
    ) {
      walletButton.textContent =
        "Login";
    } else if (
      state.walletConnected
    ) {
      walletButton.textContent =
        "Disconnect Wallet";
    } else {
      walletButton.textContent =
        "Connect Wallet";
    }
  }

  /*
   * Existing compatibility elements.
   */
  setText(
    "wallet-address",
    state.walletAddress ||
      ""
  );

  setText(
    "wallet-status",
    !state.loggedIn
      ? "Not logged in"
      : state.walletConnected
      ? `Wallet connected: ${shortenWallet(
          state.walletAddress
        )}`
      : "Logged in · Wallet not connected"
  );

  setText(
    "member-email",
    state.email ||
      ""
  );

  setText(
    "memberWalletLine",
    state.walletConnected
      ? `Wallet connected · ${shortenWallet(
          state.walletAddress
        )}`
      : "Wallet not connected"
  );

  if (
    state.member
  ) {
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

    setText(
      "memberTierLine",
      state.walletConnected
        ? "Membership active · Solana wallet connected"
        : "Membership active · wallet optional"
    );
  }

  /*
   * Do not hide the entire dashboard just because a wallet
   * isn't connected.
   */
  const memberView =
    byId(
      "memberView"
    );

  if (memberView) {
    memberView.style.display =
      state.loggedIn
        ? ""
        : "none";
  }

  /*
   * Wallet-specific controls.
   */
  document
    .querySelectorAll<HTMLElement>(
      "[data-wallet-required]"
    )
    .forEach(
      (el) => {
        const enabled =
          state.loggedIn &&
          state.walletConnected;

        el.style.opacity =
          enabled
            ? "1"
            : "0.5";

        el.style.pointerEvents =
          enabled
            ? ""
            : "none";
      }
    );

  /*
   * Member-only controls.
   */
  document
    .querySelectorAll<HTMLElement>(
      "[data-member-only]"
    )
    .forEach(
      (el) => {
        el.style.display =
          state.loggedIn
            ? ""
            : "none";
      }
    );

  /*
   * Guest-only controls.
   */
  document
    .querySelectorAll<HTMLElement>(
      "[data-guest-only]"
    )
    .forEach(
      (el) => {
        el.style.display =
          state.loggedIn
            ? "none"
            : "";
      }
    );
}

/* ============================================================================
   MEMBER MENU
============================================================================ */

function openMemberMenu(): void {
  const existing =
    byId(
      "newLiveMemberMenu"
    );

  if (existing) {
    existing.remove();

    return;
  }

  const menu =
    document.createElement(
      "div"
    );

  menu.id =
    "newLiveMemberMenu";

  menu.style.position =
    "fixed";

  menu.style.top =
    "68px";

  menu.style.right =
    "18px";

  menu.style.zIndex =
    "99999";

  menu.style.background =
    "#fff";

  menu.style.color =
    "#17351f";

  menu.style.padding =
    "16px";

  menu.style.borderRadius =
    "14px";

  menu.style.boxShadow =
    "0 20px 50px rgba(0,0,0,.22)";

  menu.style.minWidth =
    "240px";

  menu.innerHTML = `
    <div style="
      font-weight:800;
      margin-bottom:8px;
      word-break:break-word;
    ">
      ${escapeHtml(
        state.email || "Member"
      )}
    </div>

    <div style="
      font-size:12px;
      color:#6c766d;
      margin-bottom:14px;
    ">
      ${
        state.walletConnected
          ? `Wallet: ${shortenWallet(
              state.walletAddress
            )}`
          : "Wallet not connected"
      }
    </div>

    <button
      id="newLiveMenuWallet"
      style="
        width:100%;
        border:1px solid #d6ddd3;
        background:#fff;
        color:#17351f;
        border-radius:9px;
        padding:10px;
        margin-bottom:8px;
        cursor:pointer;
        font-weight:700;
      "
    >
      ${
        state.walletConnected
          ? "Disconnect Wallet"
          : "Connect Wallet"
      }
    </button>

    <button
      id="newLiveMenuLogout"
      style="
        width:100%;
        border:0;
        background:#17351f;
        color:#fff;
        border-radius:9px;
        padding:10px;
        cursor:pointer;
        font-weight:700;
      "
    >
      Logout
    </button>
  `;

  document.body.appendChild(
    menu
  );

  byId(
    "newLiveMenuWallet"
  )?.addEventListener(
    "click",
    async () => {
      menu.remove();

      if (
        state.walletConnected
      ) {
        await disconnectMemberWallet();
      } else {
        await connectMemberWallet();
      }
    }
  );

  byId(
    "newLiveMenuLogout"
  )?.addEventListener(
    "click",
    async () => {
      menu.remove();

      await logout();
    }
  );
}

/* ============================================================================
   HTML ESCAPE
============================================================================ */

function escapeHtml(
  value: string
): string {
  return value
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}

/* ============================================================================
   LEGACY OLIVIUM AUTH BRIDGE
============================================================================ */

function exposeLegacyAuthBridge(): void {
  /*
   * reserve_board.ts currently asks:
   *
   * window.OliviumAuth.getUser()
   *
   * Return the REAL Supabase user identity.
   */
  window.OliviumAuth = {
    user:
      state.loggedIn
        ? {
            id:
              state.authUserId,

            email:
              state.email,

            wallet:
              state.walletAddress,

            tier:
              "Standard",
          }
        : null,

    setUser(user: any) {
      /*
       * Compatibility only.
       *
       * Supabase Auth remains authoritative.
       */
      this.user =
        user;
    },

    getUser() {
      return this.user;
    },

    isLoggedIn() {
      return state.loggedIn;
    },

    getMember() {
      return getMember();
    },

    getWallet() {
      return getWallet();
    },

    async logout() {
      return logout();
    },
  };
}

/* ============================================================================
   GETTERS
============================================================================ */

export function getMember():
  LiveMember | null {
  return state.member
    ? {
        ...state.member,
      }
    : null;
}

export function getWallet():
  string | null {
  return state.walletAddress;
}

export function isLoggedIn():
  boolean {
  return state.loggedIn;
}

export function isWalletConnected():
  boolean {
  return (
    state.walletConnected &&
    !!state.walletAddress
  );
}

export function getLiveState():
  LiveState {
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
   SUPABASE SESSION
============================================================================ */

function subscribeToAuth(): void {
  sb.auth.onAuthStateChange(
    async (
      event,
      session
    ) => {
      console.log(
        "[NEW_LIVE] Supabase Auth:",
        event
      );

      /*
       * SIGNED IN / SESSION RESTORED
       */
      if (
        session?.user
      ) {
        await activateAuthenticatedUser(
          session.user
        );

        return;
      }

      /*
       * SIGNED OUT
       */
      if (
        event ===
        "SIGNED_OUT"
      ) {
        clearMemberState();

        updateAuthUI();

        dispatch(
          "olivium:logged-out"
        );
      }
    }
  );
}

/* ============================================================================
   RESTORE SESSION
============================================================================ */

async function restoreSupabaseSession(): Promise<void> {
  try {
    const {
      data,
      error,
    } =
      await sb.auth.getSession();

    if (error) {
      console.error(
        "[NEW_LIVE] Session:",
        error.message
      );

      return;
    }

    if (
      data.session?.user
    ) {
      await activateAuthenticatedUser(
        data.session.user
      );
    } else {
      clearMemberState();
    }
  } catch (error) {
    console.error(
      "[NEW_LIVE] Session restore:",
      error
    );
  }
}

/* ============================================================================
   BIND EXISTING WALLET BUTTON
============================================================================ */

function bindWalletButton(): void {
  const button =
    byId(
      "btn-wallet"
    );

  if (
    !button ||
    button.dataset.newLiveBound
  ) {
    return;
  }

  button.dataset.newLiveBound =
    "true";

  button.addEventListener(
    "click",
    async (event) => {
      event.preventDefault();

      if (
        !state.loggedIn
      ) {
        openAuthModal();

        return;
      }

      if (
        state.walletConnected
      ) {
        await disconnectMemberWallet();
      } else {
        await connectMemberWallet();
      }
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

  openAuthModal,

  closeAuthModal,
};

/* ============================================================================
   EXPOSE GLOBALS
============================================================================ */

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
}

/* ============================================================================
   INIT
============================================================================ */

async function init(): Promise<void> {
  if (
    state.initialized
  ) {
    return;
  }

  state.initialized =
    true;

  console.log(
    "🌿 OLIVIUM new_live.ts starting..."
  );

  /*
   * Global API first.
   */
  exposeGlobals();

  /*
   * Auth compatibility bridge.
   */
  exposeLegacyAuthBridge();

  /*
   * CREATE LOGIN / SIGNUP UI.
   */
  createAuthUI();

  /*
   * Existing wallet button.
   */
  bindWalletButton();

  /*
   * Supabase Auth listener BEFORE restoring session.
   */
  subscribeToAuth();

  /*
   * Restore Supabase session.
   */
  await restoreSupabaseSession();

  /*
   * Final UI state.
   */
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
   START
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
   DEBUG
============================================================================ */

(window as any)
  .__OLIVIUM_NEW_LIVE__ = {
    state,

    init,

    login,

    signup,

    logout,

    refresh,

    getMember,

    getAuthUser,

    connectMemberWallet,

    disconnectMemberWallet,
  };
