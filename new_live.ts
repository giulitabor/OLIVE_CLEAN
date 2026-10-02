/* ============================================================

   OLIVIUM LIVE DASHBOARD

   ------------------------------------------------------------

   AUTH ARCHITECTURE



   Supabase Auth = PRIMARY MEMBER IDENTITY

   Solana Wallet = OPTIONAL



   Supabase:

     auth.users.id

          ↓

     public.users.auth_user_id



   Wallet:

     optional wallet connected separately

     wallet disconnect NEVER logs member out

   ============================================================ */



import {

  sb,

  connectWallet,

  disconnectWallet,

  getIdentity,

} from "./src/connection";



import {

  updateIdentityBalanceUI,

} from "./src/reserveb";



/* ============================================================

   TYPES

   ============================================================ */



type AuthUser = {

  id: string;

  email?: string | null;

  user_metadata?: Record<string, any>;

};



type Profile = {

  wallet: string | null;

  OLV_tokens: number | null;

  Email_address: string | null;

  credits: number | null;

  token: string | null;

  auth_user_id: string | null;

};



type LiveState = {

  user: AuthUser | null;

  profile: Profile | null;

  loading: boolean;

};



const state: LiveState = {

  user: null,

  profile: null,

  loading: false,

};





/* ============================================================

   HELPERS

   ============================================================ */



function $(id: string): HTMLElement | null {

  return document.getElementById(id);

}



function htmlEscape(value: string): string {

  return value

    .replaceAll("&", "&amp;")

    .replaceAll("<", "&lt;")

    .replaceAll(">", "&gt;")

    .replaceAll('"', "&quot;")

    .replaceAll("'", "&#039;");

}



function showToast(message: string) {

  const region = $("toast-region");



  if (region) {

    const toast = document.createElement("div");



    toast.className = "toast";

    toast.textContent = message;



    region.appendChild(toast);



    setTimeout(() => {

      toast.style.opacity = "0";

      toast.style.transform = "translateY(8px)";



      setTimeout(() => toast.remove(), 250);

    }, 2800);



    return;

  }



  console.log("[OLIVIUM]", message);

}





/* ============================================================

   AUTH UI

   ------------------------------------------------------------

   The supplied dashboard HTML contains no login/signup UI.

   We create it here so the HTML itself does not need to be

   rewritten.

   ============================================================ */



function injectAuthStyles() {



  if ($("olivium-auth-styles")) {

    return;

  }



  const style = document.createElement("style");



  style.id = "olivium-auth-styles";



  style.textContent = `

    /* ========================================================

       OLIVIUM AUTH BUTTON

       ======================================================== */



    #olivium-auth-button {

      appearance:none;

      border:1px solid rgba(201,168,76,.55);

      background:rgba(255,255,255,.035);

      color:var(--text,#f4f0e5);

      padding:10px 15px;

      border-radius:4px;

      cursor:pointer;

      font-family:inherit;

      font-size:11px;

      letter-spacing:.08em;

      text-transform:uppercase;

      transition:.2s ease;

      white-space:nowrap;

    }



    #olivium-auth-button:hover {

      background:rgba(201,168,76,.12);

      border-color:rgba(201,168,76,.9);

    }



    #olivium-auth-button.logged-in {

      border-color:rgba(126,168,108,.65);

    }





    /* ========================================================

       AUTH OVERLAY

       ======================================================== */



    #olivium-auth-overlay {

      position:fixed;

      inset:0;

      z-index:99999;

      display:none;

      align-items:center;

      justify-content:center;

      padding:20px;

      background:rgba(8,13,9,.78);

      backdrop-filter:blur(12px);

    }



    #olivium-auth-overlay.open {

      display:flex;

    }





    /* ========================================================

       AUTH CARD

       ======================================================== */



    .olivium-auth-card {

      width:min(440px,100%);

      max-height:calc(100vh - 40px);

      overflow:auto;

      background:

        linear-gradient(

          145deg,

          rgba(31,45,31,.98),

          rgba(15,24,17,.99)

        );

      border:1px solid rgba(201,168,76,.35);

      border-radius:14px;

      box-shadow:

        0 30px 100px rgba(0,0,0,.55),

        inset 0 1px 0 rgba(255,255,255,.04);

      padding:30px;

      position:relative;

    }



    .olivium-auth-close {

      position:absolute;

      top:12px;

      right:14px;

      width:34px;

      height:34px;

      border:0;

      border-radius:50%;

      background:rgba(255,255,255,.06);

      color:#fff;

      cursor:pointer;

      font-size:20px;

      line-height:1;

    }



    .olivium-auth-close:hover {

      background:rgba(255,255,255,.12);

    }



    .olivium-auth-logo {

      width:48px;

      height:48px;

      display:flex;

      align-items:center;

      justify-content:center;

      border:1px solid rgba(201,168,76,.65);

      color:#d7b969;

      font-family:Georgia,serif;

      font-size:25px;

      border-radius:50%;

      margin-bottom:18px;

    }



    .olivium-auth-card h2 {

      margin:0 0 7px;

      font-family:Georgia,serif;

      font-size:29px;

      font-weight:400;

      color:#f4f0e5;

    }



    .olivium-auth-subtitle {

      margin:0 0 22px;

      color:rgba(244,240,229,.62);

      font-size:13px;

      line-height:1.6;

    }





    /* ========================================================

       AUTH TABS

       ======================================================== */



    .olivium-auth-tabs {

      display:grid;

      grid-template-columns:1fr 1fr;

      gap:5px;

      margin-bottom:20px;

      padding:4px;

      background:rgba(255,255,255,.045);

      border-radius:6px;

    }



    .olivium-auth-tab {

      border:0;

      padding:11px;

      border-radius:4px;

      background:transparent;

      color:rgba(244,240,229,.55);

      cursor:pointer;

      font-family:inherit;

      font-size:11px;

      letter-spacing:.08em;

      text-transform:uppercase;

    }



    .olivium-auth-tab.active {

      background:rgba(201,168,76,.18);

      color:#e0c36f;

    }





    /* ========================================================

       FORM

       ======================================================== */



    .olivium-auth-field {

      margin-bottom:14px;

    }



    .olivium-auth-field label {

      display:block;

      margin-bottom:6px;

      color:rgba(244,240,229,.62);

      font-size:10px;

      letter-spacing:.1em;

      text-transform:uppercase;

    }



    .olivium-auth-field input {

      width:100%;

      box-sizing:border-box;

      border:1px solid rgba(255,255,255,.12);

      background:rgba(0,0,0,.18);

      color:#fff;

      padding:13px 14px;

      border-radius:5px;

      outline:none;

      font-family:inherit;

      font-size:14px;

    }



    .olivium-auth-field input:focus {

      border-color:rgba(201,168,76,.75);

      box-shadow:0 0 0 2px rgba(201,168,76,.08);

    }





    /* ========================================================

       PRIMARY AUTH ACTION

       ======================================================== */



    #olivium-auth-submit {

      width:100%;

      border:1px solid rgba(201,168,76,.75);

      background:linear-gradient(

        135deg,

        #b9953e,

        #d5b55e

      );

      color:#171b12;

      padding:13px 15px;

      border-radius:5px;

      cursor:pointer;

      font-family:inherit;

      font-weight:700;

      font-size:11px;

      letter-spacing:.1em;

      text-transform:uppercase;

      margin-top:5px;

    }



    #olivium-auth-submit:hover {

      filter:brightness(1.08);

    }



    #olivium-auth-submit:disabled {

      opacity:.55;

      cursor:wait;

    }





    /* ========================================================

       AUTH MESSAGE

       ======================================================== */



    #olivium-auth-message {

      min-height:20px;

      margin-top:14px;

      font-size:12px;

      line-height:1.5;

      color:rgba(244,240,229,.68);

    }



    #olivium-auth-message.error {

      color:#e99a8f;

    }



    #olivium-auth-message.success {

      color:#a8d39b;

    }





    /* ========================================================

       LOGGED-IN ACCOUNT PANEL

       ======================================================== */



    #olivium-account-panel {

      display:none;

    }



    .olivium-account-email {

      padding:13px 14px;

      border-radius:5px;

      background:rgba(255,255,255,.045);

      border:1px solid rgba(255,255,255,.08);

      margin-bottom:18px;

      color:#f4f0e5;

      font-size:13px;

      word-break:break-word;

    }



    .olivium-account-email small {

      display:block;

      margin-bottom:5px;

      color:rgba(244,240,229,.45);

      font-size:9px;

      text-transform:uppercase;

      letter-spacing:.1em;

    }



    .olivium-account-row {

      display:grid;

      grid-template-columns:1fr 1fr;

      gap:8px;

    }



    .olivium-account-action {

      padding:12px;

      border-radius:5px;

      border:1px solid rgba(255,255,255,.12);

      background:rgba(255,255,255,.045);

      color:#f4f0e5;

      cursor:pointer;

      font-family:inherit;

      font-size:10px;

      text-transform:uppercase;

      letter-spacing:.07em;

    }



    .olivium-account-action:hover {

      background:rgba(255,255,255,.08);

    }



    .olivium-account-action.danger {

      color:#e9a49a;

      border-color:rgba(233,164,154,.25);

    }



    .olivium-wallet-status {

      margin:15px 0;

      padding:12px;

      border-radius:5px;

      background:rgba(126,168,108,.07);

      border:1px solid rgba(126,168,108,.18);

      color:rgba(244,240,229,.7);

      font-size:11px;

      line-height:1.5;

    }





    /* ========================================================

       MEMBER AUTH BADGE

       ======================================================== */



    .olivium-member-auth-badge {

      display:inline-flex;

      align-items:center;

      gap:7px;

      margin-top:8px;

      color:#a8d39b;

      font-size:10px;

      letter-spacing:.07em;

      text-transform:uppercase;

    }



    .olivium-member-auth-dot {

      width:7px;

      height:7px;

      border-radius:50%;

      background:#8fbd7f;

      box-shadow:0 0 8px rgba(143,189,127,.5);

    }





    @media(max-width:700px) {



      #olivium-auth-button {

        padding:8px 10px;

        font-size:9px;

      }



      .olivium-auth-card {

        padding:24px 20px;

      }



    }

  `;



  document.head.appendChild(style);

}





/* ============================================================

   CREATE AUTH BUTTON

   ============================================================ */



function injectAuthButton() {



  if ($("olivium-auth-button")) {

    return;

  }



  const navRight = document.querySelector(".nav-right");



  if (!navRight) {

    console.warn("[OLIVIUM AUTH] .nav-right not found");

    return;

  }



  const button = document.createElement("button");



  button.id = "olivium-auth-button";

  button.type = "button";

  button.textContent = "Log in / Sign up";



  button.addEventListener("click", () => {

    openAuthModal();

  });



  const walletButton = $("btn-wallet");



  if (walletButton) {

    navRight.insertBefore(button, walletButton);

  } else {

    navRight.appendChild(button);

  }

}





/* ============================================================

   CREATE AUTH MODAL

   ============================================================ */



function injectAuthModal() {



  if ($("olivium-auth-overlay")) {

    return;

  }



  const overlay = document.createElement("div");



  overlay.id = "olivium-auth-overlay";



  overlay.innerHTML = `

    <div class="olivium-auth-card" role="dialog" aria-modal="true">



      <button

        type="button"

        class="olivium-auth-close"

        id="olivium-auth-close"

        aria-label="Close"

      >

        ×

      </button>



      <div class="olivium-auth-logo">

        O

      </div>



      <h2 id="olivium-auth-title">

        Welcome to Olivium

      </h2>



      <p

        id="olivium-auth-subtitle"

        class="olivium-auth-subtitle"

      >

        Sign in with your email to enter your Olivium member dashboard.

        Your Solana wallet is optional.

      </p>





      <!-- ==================================================

           AUTH FORM

           ================================================== -->



      <div id="olivium-auth-form">



        <div class="olivium-auth-tabs">



          <button

            type="button"

            class="olivium-auth-tab active"

            id="olivium-login-tab"

          >

            Log in

          </button>



          <button

            type="button"

            class="olivium-auth-tab"

            id="olivium-signup-tab"

          >

            Sign up

          </button>



        </div>





        <div class="olivium-auth-field">



          <label for="olivium-auth-email">

            Email

          </label>



          <input

            id="olivium-auth-email"

            type="email"

            autocomplete="email"

            placeholder="you@example.com"

          >



        </div>





        <div class="olivium-auth-field">



          <label for="olivium-auth-password">

            Password

          </label>



          <input

            id="olivium-auth-password"

            type="password"

            autocomplete="current-password"

            placeholder="Your password"

          >



        </div>





        <div

          class="olivium-auth-field"

          id="olivium-confirm-field"

          style="display:none;"

        >



          <label for="olivium-auth-confirm">

            Confirm password

          </label>



          <input

            id="olivium-auth-confirm"

            type="password"

            autocomplete="new-password"

            placeholder="Repeat your password"

          >



        </div>





        <button

          type="button"

          id="olivium-auth-submit"

        >

          Log in

        </button>





        <div id="olivium-auth-message"></div>



      </div>





      <!-- ==================================================

           ACCOUNT PANEL

           ================================================== -->



      <div id="olivium-account-panel">



        <div class="olivium-account-email">



          <small>

            Signed in as

          </small>



          <span id="olivium-account-email">

            —

          </span>



        </div>





        <div class="olivium-member-auth-badge">



          <span class="olivium-member-auth-dot"></span>



          Olivium member session active



        </div>





        <div class="olivium-wallet-status">



          <strong>Solana wallet</strong><br>



          <span id="olivium-account-wallet">

            Not connected — wallet is optional.

          </span>



        </div>





        <div class="olivium-account-row">



          <button

            type="button"

            class="olivium-account-action"

            id="olivium-account-wallet-button"

          >

            Connect wallet

          </button>



          <button

            type="button"

            class="olivium-account-action danger"

            id="olivium-logout-button"

          >

            Log out

          </button>



        </div>



        <div id="olivium-account-message"></div>



      </div>



    </div>

  `;



  document.body.appendChild(overlay);





  /* ==========================================================

     CLOSE

     ========================================================== */



  $("olivium-auth-close")?.addEventListener(

    "click",

    closeAuthModal

  );



  overlay.addEventListener("click", (event) => {



    if (event.target === overlay) {

      closeAuthModal();

    }



  });





  /* ==========================================================

     TABS

     ========================================================== */



  $("olivium-login-tab")?.addEventListener(

    "click",

    () => setAuthMode("login")

  );



  $("olivium-signup-tab")?.addEventListener(

    "click",

    () => setAuthMode("signup")

  );





  /* ==========================================================

     SUBMIT

     ========================================================== */



  $("olivium-auth-submit")?.addEventListener(

    "click",

    submitAuth

  );





  /* ENTER KEY

     ========================================================== */



  ["olivium-auth-email", "olivium-auth-password", "olivium-auth-confirm"]

    .forEach((id) => {



      $(id)?.addEventListener("keydown", (event) => {



        if (event.key === "Enter") {

          event.preventDefault();

          submitAuth();

        }



      });



    });





  /* ==========================================================

     ACCOUNT ACTIONS

     ========================================================== */



  $("olivium-logout-button")?.addEventListener(

    "click",

    logout

  );



  $("olivium-account-wallet-button")?.addEventListener(

    "click",

    connectOptionalWallet

  );

}





/* ============================================================

   AUTH MODE

   ============================================================ */



let authMode: "login" | "signup" = "login";



function setAuthMode(mode: "login" | "signup") {



  authMode = mode;



  const loginTab = $("olivium-login-tab");

  const signupTab = $("olivium-signup-tab");

  const confirmField = $("olivium-confirm-field");

  const submit = $("olivium-auth-submit");

  const password = $("olivium-auth-password");



  loginTab?.classList.toggle(

    "active",

    mode === "login"

  );



  signupTab?.classList.toggle(

    "active",

    mode === "signup"

  );



  if (confirmField) {

    confirmField.style.display =

      mode === "signup"

        ? "block"

        : "none";

  }



  if (submit) {

    submit.textContent =

      mode === "signup"

        ? "Create account"

        : "Log in";

  }



  if (password) {

    password.autocomplete =

      mode === "signup"

        ? "new-password"

        : "current-password";

  }



  clearAuthMessage();

}





/* ============================================================

   AUTH MODAL

   ============================================================ */



function openAuthModal() {



  const overlay = $("olivium-auth-overlay");



  if (!overlay) {

    return;

  }



  overlay.classList.add("open");



  renderAuthModal();



  setTimeout(() => {

    if (state.user) {

      return;

    }



    ($("olivium-auth-email") as HTMLInputElement | null)?.focus();



  }, 50);

}



function closeAuthModal() {



  $("olivium-auth-overlay")?.classList.remove("open");

}





/* ============================================================

   AUTH MESSAGE

   ============================================================ */



function clearAuthMessage() {



  const el = $("olivium-auth-message");



  if (!el) {

    return;

  }



  el.textContent = "";

  el.className = "";

}



function setAuthMessage(

  message: string,

  type: "error" | "success" | ""

) {



  const el = $("olivium-auth-message");



  if (!el) {

    return;

  }



  el.textContent = message;

  el.className = type;

}





/* ============================================================

   SUBMIT LOGIN / SIGNUP

   ============================================================ */



async function submitAuth() {



  if (state.loading) {

    return;

  }



  const emailEl =

    $("olivium-auth-email") as HTMLInputElement | null;



  const passwordEl =

    $("olivium-auth-password") as HTMLInputElement | null;



  const confirmEl =

    $("olivium-auth-confirm") as HTMLInputElement | null;



  const submit =

    $("olivium-auth-submit") as HTMLButtonElement | null;



  const email =

    emailEl?.value.trim().toLowerCase() || "";



  const password =

    passwordEl?.value || "";



  const confirm =

    confirmEl?.value || "";





  clearAuthMessage();





  /* ==========================================================

     VALIDATION

     ========================================================== */



  if (!email) {



    setAuthMessage(

      "Please enter your email address.",

      "error"

    );



    emailEl?.focus();



    return;

  }



  if (!email.includes("@")) {



    setAuthMessage(

      "Please enter a valid email address.",

      "error"

    );



    emailEl?.focus();



    return;

  }



  if (!password) {



    setAuthMessage(

      "Please enter your password.",

      "error"

    );



    passwordEl?.focus();



    return;

  }



  if (password.length < 6) {



    setAuthMessage(

      "Your password must be at least 6 characters.",

      "error"

    );



    passwordEl?.focus();



    return;

  }



  if (

    authMode === "signup" &&

    password !== confirm

  ) {



    setAuthMessage(

      "The passwords do not match.",

      "error"

    );



    confirmEl?.focus();



    return;

  }





  /* ==========================================================

     SUPABASE AUTH

     ========================================================== */



  state.loading = true;



  if (submit) {

    submit.disabled = true;

    submit.textContent =

      authMode === "signup"

        ? "Creating account…"

        : "Signing in…";

  }





  try {



    if (authMode === "signup") {



      const { data, error } =

        await sb.auth.signUp({

          email,

          password,

          options: {

            data: {

              email,

            },

          },

        });





      if (error) {

        throw error;

      }





      /* ------------------------------------------------------

         Supabase may require email confirmation.

         ------------------------------------------------------ */



      if (!data.session) {



        setAuthMessage(

          "Account created. Please check your email and confirm your account, then return here to log in.",

          "success"

        );



        if (passwordEl) {

          passwordEl.value = "";

        }



        if (confirmEl) {

          confirmEl.value = "";

        }



        return;

      }





      /* ------------------------------------------------------

         If email confirmation is disabled, Supabase logs

         the user in immediately.

         ------------------------------------------------------ */



      state.user =

        data.user as AuthUser | null;



      await loadOrCreateProfile();



      scheduleRender();



      setAuthMessage(

        "Your Olivium account is ready.",

        "success"

      );



      showToast(

        "Welcome to Olivium."

      );



      setTimeout(

        closeAuthModal,

        700

      );



      return;

    }





    /* ========================================================

       LOGIN

       ======================================================== */



    const { data, error } =

      await sb.auth.signInWithPassword({

        email,

        password,

      });





    if (error) {

      throw error;

    }





    state.user =

      data.user as AuthUser | null;





    await loadOrCreateProfile();



    scheduleRender();



    setAuthMessage(

      "Signed in successfully.",

      "success"

    );



    showToast(

      "Welcome back to Olivium."

    );



    setTimeout(

      closeAuthModal,

      500

    );



  } catch (error: any) {



    console.error(

      "[OLIVIUM AUTH]",

      error

    );



    let message =

      error?.message ||

      "Authentication failed.";



    const lower =

      message.toLowerCase();





    if (

      lower.includes("invalid login") ||

      lower.includes("invalid credentials")

    ) {



      message =

        "Incorrect email or password.";



    } else if (

      lower.includes("email not confirmed")

    ) {



      message =

        "Please confirm your email address before logging in.";



    } else if (

      lower.includes("already registered") ||

      lower.includes("already exists")

    ) {



      message =

        "That email already has an account. Please log in.";



    }





    setAuthMessage(

      message,

      "error"

    );



  } finally {



    state.loading = false;



    if (submit) {



      submit.disabled = false;



      submit.textContent =

        authMode === "signup"

          ? "Create account"

          : "Log in";



    }



  }

}





/* ============================================================

   LOAD / CREATE MEMBER PROFILE

   ------------------------------------------------------------

   Existing schema:



     public.users.auth_user_id

     public.users.wallet

     public.users.Email_address

     public.users.OLV_tokens

     public.users.credits

     public.users.token



   wallet is now nullable.

   ============================================================ */



async function loadOrCreateProfile() {



  if (!state.user?.id) {

    return null;

  }



  const userId =

    state.user.id;



  const email =

    state.user.email?.trim().toLowerCase() || null;





  /* ==========================================================

     1. FIRST LOOK FOR AUTH USER ID

     ========================================================== */



  try {



    const { data, error } =

      await sb

        .from("users")

        .select(

          "wallet, OLV_tokens, Email_address, credits, token, auth_user_id"

        )

        .eq("auth_user_id", userId)

        .limit(1);



    if (!error && data && data.length > 0) {



      state.profile =

        data[0] as Profile;



      return state.profile;

    }



  } catch (error) {



    console.warn(

      "[OLIVIUM PROFILE] auth_user_id lookup failed",

      error

    );



  }





  /* ==========================================================

     2. LOOK FOR LEGACY EMAIL PROFILE

     ----------------------------------------------------------

     This is important because you already have users such as:



       kyngrick@protonmail.com

       rob@gmail.com

       we@test.net



     and some legacy rows did not yet have auth_user_id.

     ========================================================== */



  if (email) {



    try {



      const { data, error } =

        await sb

          .from("users")

          .select(

            "wallet, OLV_tokens, Email_address, credits, token, auth_user_id"

          )

          .eq("Email_address", email)

          .is("auth_user_id", null)

          .limit(1);



      if (

        !error &&

        data &&

        data.length > 0

      ) {



        const legacy =

          data[0] as Profile;





        /* ----------------------------------------------------

           Link existing member row to Supabase Auth.

           ---------------------------------------------------- */



        if (legacy.wallet) {



          const { data: updated, error: updateError } =

            await sb

              .from("users")

              .update({

                auth_user_id: userId,

              })

              .eq("wallet", legacy.wallet)

              .is("auth_user_id", null)

              .select(

                "wallet, OLV_tokens, Email_address, credits, token, auth_user_id"

              )

              .limit(1);



          if (

            !updateError &&

            updated &&

            updated.length > 0

          ) {



            state.profile =

              updated[0] as Profile;



            console.log(

              "[OLIVIUM PROFILE] Legacy member linked to Auth:",

              userId

            );



            return state.profile;

          }



        }



      }



    } catch (error) {



      console.warn(

        "[OLIVIUM PROFILE] Legacy email lookup failed",

        error

      );



    }



  }





  /* ==========================================================

     3. CREATE NEW AUTH-ONLY MEMBER

     ----------------------------------------------------------

     Wallet deliberately remains NULL.

     ========================================================== */



  try {



    const { data, error } =

      await sb

        .from("users")

        .insert({

          auth_user_id: userId,

          Email_address: email,

          wallet: null,

          OLV_tokens: 0,

          credits: 0,

        })

        .select(

          "wallet, OLV_tokens, Email_address, credits, token, auth_user_id"

        )

        .limit(1);



    if (error) {



      console.warn(

        "[OLIVIUM PROFILE] Could not create profile:",

        error

      );



      /*

       * Authentication itself is still valid.

       * This normally means the users table RLS policy needs

       * to allow an authenticated user to insert their own row.

       */



      state.profile = {

        wallet: null,

        OLV_tokens: 0,

        Email_address: email,

        credits: 0,

        token: null,

        auth_user_id: userId,

      };



      return state.profile;

    }



    if (data && data.length > 0) {



      state.profile =

        data[0] as Profile;



      console.log(

        "[OLIVIUM PROFILE] New member profile created:",

        userId

      );



      return state.profile;

    }



  } catch (error) {



    console.warn(

      "[OLIVIUM PROFILE] Profile creation failed:",

      error

    );



  }





  /* ==========================================================

     FALLBACK IN-MEMORY PROFILE

     ========================================================== */



  state.profile = {

    wallet: null,

    OLV_tokens: 0,

    Email_address: email,

    credits: 0,

    token: null,

    auth_user_id: userId,

  };



  return state.profile;

}





/* ============================================================

   SESSION RESTORE

   ============================================================ */



async function restoreSupabaseSession() {



  state.loading = true;



  try {



    const {

      data,

      error,

    } = await sb.auth.getSession();



    if (error) {

      throw error;

    }



    if (data.session?.user) {



      state.user =

        data.session.user as AuthUser;



      await loadOrCreateProfile();



    } else {



      state.user = null;

      state.profile = null;



    }



    scheduleRender();



  } catch (error) {



    console.error(

      "[OLIVIUM AUTH] Session restore failed:",

      error

    );



  } finally {



    state.loading = false;



  }

}





/* ============================================================

   AUTH STATE CHANGES

   ============================================================ */



function installAuthListener() {



  sb.auth.onAuthStateChange(

    (event, session) => {



      console.log(

        "[OLIVIUM AUTH]",

        event

      );





      /*

       * Do not make additional Supabase requests directly

       * inside the auth callback. Schedule them after the

       * callback has returned.

       */



      setTimeout(

        async () => {



          if (session?.user) {



            state.user =

              session.user as AuthUser;



            await loadOrCreateProfile();



          } else {



            state.user = null;

            state.profile = null;



          }



          scheduleRender();



        },

        0

      );



    }

  );

}





/* ============================================================

   LOGOUT

   ------------------------------------------------------------

   IMPORTANT:

   Supabase logout is MEMBER logout.



   It does NOT disconnect the Solana wallet.

   ============================================================ */



async function logout() {



  try {



    const { error } =

      await sb.auth.signOut();



    if (error) {

      throw error;

    }



    state.user = null;

    state.profile = null;



    scheduleRender();



    closeAuthModal();



    showToast(

      "You have been logged out."

    );



  } catch (error: any) {



    console.error(

      "[OLIVIUM LOGOUT]",

      error

    );



    setAccountMessage(

      error?.message ||

      "Could not log out."

    );



  }

}





/* ============================================================

   OPTIONAL SOLANA WALLET

   ============================================================ */



let cachedWallet: { value: string | null; at: number } | null = null;
const WALLET_CACHE_MS = 5_000;

function getConnectedWallet(): string | null {
  const now = Date.now();

  if (cachedWallet && now - cachedWallet.at < WALLET_CACHE_MS) {
    return cachedWallet.value;
  }

  let value: string | null = null;

  try {
    const identity = getIdentity();

    if (
      identity &&
      identity.type === "wallet" &&
      identity.wallet
    ) {
      value = identity.wallet;
    }
  } catch (error) {
    console.warn("[OLIVIUM WALLET]", error);
  }

  cachedWallet = { value, at: now };
  return value;
}

/** Force the next getConnectedWallet() call to re-read the provider. */
function invalidateWalletCache(): void {
  cachedWallet = null;
}


async function connectOptionalWallet() {



  if (!state.user) {



    openAuthModal();



    setAuthMode("login");



    setAuthMessage(

      "Log in first. Your wallet is optional.",

      ""

    );



    return;

  }





  const existing =

    getConnectedWallet();



  if (existing) {



    updateAccountWallet();



    return;

  }





  try {



    await connectWallet();
     invalidateWalletCache();



    /*

     * Allow connection.ts time to update its identity state.

     */



    setTimeout(

      async () => {



        await refreshWalletProfile();



        scheduleRender();



        updateAccountWallet();



        showToast(

          "Solana wallet connected."

        );



      },

      150

    );



  } catch (error: any) {



    console.error(

      "[OLIVIUM WALLET]",

      error

    );



    setAccountMessage(

      error?.message ||

      "Wallet connection was cancelled."

    );



  }

}





/* ============================================================

   LINK OPTIONAL WALLET TO EXISTING AUTH PROFILE

   ============================================================ */



async function refreshWalletProfile() {



  if (!state.user) {

    return;

  }



  const wallet =

    getConnectedWallet();



  if (!wallet) {

    return;

  }



  try {



    const { data, error } =

      await sb

        .from("users")

        .update({

          wallet,

          auth_user_id: state.user.id,

          Email_address:

            state.user.email ||

            state.profile?.Email_address ||

            null,

        })

        .eq(

          "auth_user_id",

          state.user.id

        )

        .select(

          "wallet, OLV_tokens, Email_address, credits, token, auth_user_id"

        )

        .limit(1);



    if (!error && data && data.length > 0) {



      state.profile =

        data[0] as Profile;



      console.log(

        "[OLIVIUM PROFILE] Wallet linked:",

        wallet

      );



    } else if (error) {



      console.warn(

        "[OLIVIUM PROFILE] Wallet link failed:",

        error

      );



    }



  } catch (error) {



    console.warn(

      "[OLIVIUM PROFILE] Wallet link exception:",

      error

    );



  }

}





/* ============================================================

   WALLET DISCONNECT

   ------------------------------------------------------------

   Disconnecting wallet must NOT log out Supabase member.

   ============================================================ */



async function disconnectOptionalWallet() {



  try {



    await disconnectWallet();
     invalidateWalletCache();



  } catch (error) {



    console.warn(

      "[OLIVIUM WALLET] disconnect:",

      error

    );



  }





  /*

   * Keep the authenticated member.

   * Only remove the wallet from the profile if desired.

   *

   * We deliberately do NOT clear auth_user_id.

   */



  if (state.user) {



    try {



      const { data, error } =

        await sb

          .from("users")

          .update({

            wallet: null,

          })

          .eq(

            "auth_user_id",

            state.user.id

          )

          .select(

            "wallet, OLV_tokens, Email_address, credits, token, auth_user_id"

          )

          .limit(1);



      if (

        !error &&

        data &&

        data.length > 0

      ) {



        state.profile =

          data[0] as Profile;



      }



    } catch (error) {



      console.warn(

        "[OLIVIUM PROFILE] Wallet removal failed:",

        error

      );



    }



  }





  scheduleRender();



  showToast(

    "Wallet disconnected. Your Olivium account remains signed in."

  );

}





/* ============================================================

   ACCOUNT MESSAGE

   ============================================================ */



function setAccountMessage(message: string) {



  const el =

    $("olivium-account-message");



  if (!el) {

    return;

  }



  el.textContent = message;



  el.style.marginTop = "12px";

  el.style.color = "#e9a49a";

  el.style.fontSize = "11px";

  el.style.lineHeight = "1.5";

}





/* ============================================================

   RENDER AUTH MODAL

   ============================================================ */



function renderAuthModal() {



  const form =

    $("olivium-auth-form");



  const account =

    $("olivium-account-panel");



  const title =

    $("olivium-auth-title");



  const subtitle =

    $("olivium-auth-subtitle");





  if (state.user) {



    if (form) {

      form.style.display = "none";

    }



    if (account) {

      account.style.display = "block";

    }



    if (title) {

      title.textContent =

        "Your Olivium account";

    }



    if (subtitle) {

      subtitle.textContent =

        "Your Supabase account is your Olivium membership identity. Your Solana wallet remains optional.";

    }



    const emailEl =

      $("olivium-account-email");



    if (emailEl) {



      emailEl.textContent =

        state.user.email ||

        "Authenticated member";



    }



    updateAccountWallet();



  } else {



    if (form) {

      form.style.display = "block";

    }



    if (account) {

      account.style.display = "none";

    }



    if (title) {

      title.textContent =

        "Welcome to Olivium";

    }



    if (subtitle) {

      subtitle.textContent =

        "Sign in with your email to enter your Olivium member dashboard. Your Solana wallet is optional.";

    }



  }

}





/* ============================================================

   UPDATE ACCOUNT WALLET DISPLAY

   ============================================================ */



function updateAccountWallet() {



  const el =

    $("olivium-account-wallet");



  const button =

    $("olivium-account-wallet-button") as HTMLButtonElement | null;



  if (!el || !button) {

    return;

  }





  const wallet =

    getConnectedWallet();





  if (wallet) {



    el.textContent =

      `${wallet.slice(0, 6)}…${wallet.slice(-6)}`;



    button.textContent =

      "Disconnect wallet";



    button.onclick =

      () => {

        disconnectOptionalWallet();

      };



  } else {



    el.textContent =

      "Not connected — wallet is optional.";



    button.textContent =

      "Connect wallet";



    button.onclick =

      () => {

        connectOptionalWallet();

      };



  }

}





/* ============================================================

   UPDATE MAIN DASHBOARD UI

   ============================================================ */



function renderDashboardState() {



  const loggedIn =

    !!state.user;





  /* ==========================================================

     PUBLIC / MEMBER VIEWS

     ========================================================== */



  const publicView =

    $("publicView");



  const memberView =

    $("memberView");





  if (publicView) {



    publicView.classList.toggle(

      "hidden",

      loggedIn

    );



    /*

     * Some CSS versions do not have .hidden.

     * Force display as a fallback.

     */



    if (loggedIn) {

      publicView.style.display = "none";

    } else {

      publicView.style.display = "";

    }



  }





  if (memberView) {



    memberView.classList.toggle(

      "hidden",

      !loggedIn

    );



    if (loggedIn) {

      memberView.style.display = "";

    } else {

      memberView.style.display = "none";

    }



  }





  /* ==========================================================

     AUTH BUTTON

     ========================================================== */



  const authButton =

    $("olivium-auth-button");



  if (authButton) {



    if (loggedIn) {



      const email =

        state.user?.email || "Account";



      authButton.textContent =

        `Account · ${email}`;



      authButton.classList.add(

        "logged-in"

      );



    } else {



      authButton.textContent =

        "Log in / Sign up";



      authButton.classList.remove(

        "logged-in"

      );



    }



  }





  /* ==========================================================

     CONNECTION BAR

     ========================================================== */



  const statusText =

    $("statusText");



  const walletDisplay =

    $("walletDisplay");



  const wallet =

    getConnectedWallet();





  if (loggedIn) {



    if (statusText) {



      statusText.textContent =

        wallet

          ? "Olivium member · Wallet connected"

          : "Olivium member · Email account";



    }



    if (walletDisplay) {



      walletDisplay.textContent =

        wallet

          ? `${state.user?.email || "Member"} · ${wallet.slice(0, 6)}…${wallet.slice(-6)}`

          : `${state.user?.email || "Member"} · Wallet optional`;



    }



  } else {



    if (statusText) {

      statusText.textContent =

        "Public Grove View";

    }



    if (walletDisplay) {

      walletDisplay.textContent =

        "Log in or sign up to enter your Olivium member dashboard";

    }



  }





  /* ==========================================================

     MEMBER EMAIL

     ========================================================== */



  const memberWalletLine =

    $("memberWalletLine");



  if (memberWalletLine && loggedIn) {



    const email =

      state.user?.email ||

      "Authenticated member";



    memberWalletLine.innerHTML = `

      <span class="olivium-member-auth-badge">

        <span class="olivium-member-auth-dot"></span>

        ${htmlEscape(email)}

      </span>

    `;



    if (wallet) {



      memberWalletLine.innerHTML += `

        <div style="

          margin-top:7px;

          font-size:10px;

          opacity:.65;

        ">

          Wallet · ${htmlEscape(

            wallet.slice(0, 6) +

            "…" +

            wallet.slice(-6)

          )}

        </div>

      `;



    }



  }





  /* ==========================================================

     MEMBERSHIP LINE

     ========================================================== */



  const tierLine =

    $("memberTierLine");



  if (tierLine && loggedIn) {



    const credits =

      Number(

        state.profile?.credits || 0

      );



    const tokens =

      Number(

        state.profile?.OLV_tokens || 0

      );



    tierLine.textContent =

      `Email membership active · ${credits} credits · ${tokens.toLocaleString()} OLV`;



  }





  /* ==========================================================

     VILLA EMAIL

     ========================================================== */



  const villaEmail =

    $("villa-email") as HTMLInputElement | null;



  if (

    villaEmail &&

    loggedIn &&

    state.user?.email &&

    !villaEmail.value

  ) {



    villaEmail.value =

      state.user.email;



  }





  /* ==========================================================

     AUTH MODAL

     ========================================================== */



  renderAuthModal();

}





/* ============================================================

   RENDER EVERYTHING

   ============================================================ */



/* ============================================================
   RENDER EVERYTHING
   ============================================================ */

/* ---- SOLANA RPC THROTTLE ----------------------------------
   updateIdentityBalanceUI() hits Solana RPC. Throttled to at
   most one call per RPC_MIN_INTERVAL_MS, coalesced so
   concurrent callers share one in-flight promise, and with a
   single trailing call if requests arrive during cooldown.
   ---------------------------------------------------------- */

const RPC_MIN_INTERVAL_MS = 30_000;

let lastBalanceRefreshAt = 0;
let balanceRefreshInFlight: Promise<void> | null = null;
let balanceRefreshTimer: ReturnType<typeof setTimeout> | null = null;

function refreshBalanceThrottled(): void {
  if (!getConnectedWallet()) return;
  if (balanceRefreshInFlight) return;

  const now = Date.now();
  const since = now - lastBalanceRefreshAt;

  if (since < RPC_MIN_INTERVAL_MS) {
    if (balanceRefreshTimer) return;
    balanceRefreshTimer = setTimeout(() => {
      balanceRefreshTimer = null;
      refreshBalanceThrottled();
    }, RPC_MIN_INTERVAL_MS - since);
    return;
  }

  lastBalanceRefreshAt = now;

  balanceRefreshInFlight = (async () => {
    try {
      await updateIdentityBalanceUI();
    } catch (error) {
      console.warn("[OLIVIUM BALANCE]", error);
    } finally {
      balanceRefreshInFlight = null;
    }
  })();
}

function renderAll() {
  renderDashboardState();
  refreshBalanceThrottled();
}





/* ============================================================

   EXPOSE GLOBAL AUTH API

   ------------------------------------------------------------

   Existing reserve_board.ts already checks:



     window.OliviumAuth?.getUser?.()



   so provide that interface.

   ============================================================ */



function exposeAuthAPI() {



  const win =

    window as any;





  win.OliviumAuth = {



    getUser: () =>

      state.user,



    getSession: async () => {



      const {

        data,

      } = await sb.auth.getSession();



      return data.session;



    },



    getProfile: () =>

      state.profile,



    isLoggedIn: () =>

      !!state.user,



    getUserId: () =>

      state.user?.id || null,



    getEmail: () =>

      state.user?.email || null,



    getWallet: () =>

      getConnectedWallet(),



    login: async (

      email: string,

      password: string

    ) => {



      const result =

        await sb.auth.signInWithPassword({

          email,

          password,

        });



      return result;



    },



    signup: async (

      email: string,

      password: string

    ) => {



      const result =

        await sb.auth.signUp({

          email,

          password,

        });



      return result;



    },



    logout,



    openLogin: () => {



      openAuthModal();

      setAuthMode("login");



    },



    openSignup: () => {



      openAuthModal();

      setAuthMode("signup");



    },



    connectWallet:

      connectOptionalWallet,



    disconnectWallet:

      disconnectOptionalWallet,



  };





  /*

   * Additional compatibility bridge.

   */



  win.oliviumMember = {



    get user() {

      return state.user;

    },



    get profile() {

      return state.profile;

    },



    get wallet() {

      return getConnectedWallet();

    },



    isLoggedIn() {

      return !!state.user;

    },



  };





  /*

   * Useful for other existing dashboard scripts.

   */



  win.oliviumLive = {



    getState: () => ({

      user: state.user,

      profile: state.profile,

      wallet: getConnectedWallet(),

      loggedIn: !!state.user,

    }),



    openAuth: openAuthModal,



    login: () => {



      openAuthModal();

      setAuthMode("login");



    },



    signup: () => {



      openAuthModal();

      setAuthMode("signup");



    },



    logout,



    connectWallet:

      connectOptionalWallet,



    disconnectWallet:

      disconnectOptionalWallet,



  };



}





/* ============================================================

   EXISTING WALLET BUTTON

   ------------------------------------------------------------

   IMPORTANT:

   This changes the old "Connect Wallet" behavior:



   NOT LOGGED IN

       → opens Login / Sign Up



   LOGGED IN + NO WALLET

       → connects Solana wallet



   LOGGED IN + WALLET

       → disconnects Solana wallet only

          and DOES NOT log out.

   ============================================================ */



function bindWalletButton() {
  const button = $("btn-wallet") as HTMLButtonElement | null;

  if (!button) {
    console.warn("[OLIVIUM] #btn-wallet not found");
    return;
  }

  /* Remove previously attached handlers by cloning the node. */
  const replacement = button.cloneNode(true) as HTMLButtonElement;
  replacement.id = "btn-wallet";
  button.parentNode?.replaceChild(replacement, button);

  replacement.addEventListener("click", async () => {
    if (!state.user) {
      openAuthModal();
      setAuthMode("login");
      return;
    }

    if (getConnectedWallet()) {
      await disconnectOptionalWallet();
    } else {
      await connectOptionalWallet();
    }
  });

  updateWalletButtonText(replacement);
}




  /*

   * Clone to remove any previous click handlers installed by

   * another dashboard script.

   */



  const replacement =

    button.cloneNode(true) as HTMLButtonElement;



  button.parentNode?.replaceChild(

    replacement,

    button

  );





  replacement.addEventListener(

    "click",

    async () => {



      if (!state.user) {



        openAuthModal();



        setAuthMode("login");



        return;

      }





      if (getConnectedWallet()) {



        await disconnectOptionalWallet();



      } else {



        await connectOptionalWallet();



      }



    }

  );





  updateWalletButtonText(

    replacement

  );

}





/* ============================================================

   WALLET BUTTON LABEL

   ============================================================ */



function updateWalletButtonText(

  button?: HTMLButtonElement

) {



  const btn =

    button ||

    $("btn-wallet") as HTMLButtonElement | null;



  if (!btn) {

    return;

  }





  if (!state.user) {



    btn.textContent =

      "Log in / Sign up";



    return;



  }





  if (getConnectedWallet()) {



    btn.textContent =

      "Disconnect Wallet";



  } else {



    btn.textContent =

      "Connect Wallet";



  }



}





/* ============================================================

   KEYBOARD ESCAPE

   ============================================================ */



function installEscapeHandler() {



  document.addEventListener(

    "keydown",

    (event) => {



      if (

        event.key === "Escape" &&

        $("olivium-auth-overlay")

          ?.classList.contains("open")

      ) {



        closeAuthModal();



      }



    }

  );



}



/* ============================================================
   RENDER COALESCING (debounced)
   ------------------------------------------------------------
   Collapses bursts of renderAll() calls into one, ~50 ms
   after the last request. Prevents the auth lifecycle
   (onAuthStateChange + restoreSupabaseSession + wallet
   connect/disconnect) from triggering a render storm that
   floods Solana RPC.
   ============================================================ */

const RENDER_DEBOUNCE_MS = 50;

let renderScheduled = false;
let renderTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRender(): void {
  if (renderScheduled) return;
  renderScheduled = true;

  if (renderTimer) clearTimeout(renderTimer);

  renderTimer = setTimeout(() => {
    renderTimer = null;
    renderScheduled = false;
    try {
      renderAll();
    } catch (error) {
      console.warn("[OLIVIUM RENDER]", error);
    }
  }, RENDER_DEBOUNCE_MS);
}

/* ============================================================

   AUTH-RELATED HERO BUTTONS

   ------------------------------------------------------------

   The supplied HTML's inline script currently makes

   heroConnectBtn click btn-wallet.



   We explicitly make both public entry points open auth.

   ============================================================ */



function bindPublicAuthButtons() {



  const hero =

    $("heroConnectBtn");



  const publicBook =

    $("btn-book-public");





  hero?.addEventListener(

    "click",

    (event) => {



      /*

       * Prevent the old wallet-only behavior from becoming

       * the primary member entry point.

       */



      event.preventDefault();



      if (state.user) {



        $("member")?.scrollIntoView({

          behavior: "smooth",

        });



        return;

      }



      openAuthModal();

      setAuthMode("signup");



    }

  );





  publicBook?.addEventListener(

    "click",

    (event) => {



      event.preventDefault();



      if (!state.user) {



        openAuthModal();

        setAuthMode("login");



        setAuthMessage(

          "Log in first to access member stays.",

          ""

        );



        return;

      }





      $("villa")?.scrollIntoView({

        behavior: "smooth",

      });



    }

  );



}





/* ============================================================

   INIT

   ============================================================ */



async function initLiveAuth() {



  console.log(

    "[OLIVIUM AUTH] Initialising Supabase member authentication..."

  );





  /* ----------------------------------------------------------

     Inject our missing frontend

     ---------------------------------------------------------- */



  injectAuthStyles();

  injectAuthButton();

  injectAuthModal();





  /* ----------------------------------------------------------

     Global bridges must exist before other scripts interact

     ---------------------------------------------------------- */



  exposeAuthAPI();





  /* ----------------------------------------------------------

     Existing dashboard controls

     ---------------------------------------------------------- */



  bindWalletButton();

  bindPublicAuthButtons();

  installEscapeHandler();





  /* ----------------------------------------------------------

     Supabase authentication

     ---------------------------------------------------------- */



  installAuthListener();



  await restoreSupabaseSession();





  /* ----------------------------------------------------------

     Final render

     ---------------------------------------------------------- */



  scheduleRender();



  updateWalletButtonText();





  console.log(

    "[OLIVIUM AUTH] Ready.",

    {

      loggedIn: !!state.user,

      userId: state.user?.id || null,

      email: state.user?.email || null,

      wallet: getConnectedWallet(),

    }

  );

}





/* ============================================================

   START

   ============================================================ */



if (

  document.readyState === "loading"

) {



  document.addEventListener(

    "DOMContentLoaded",

    () => {

      void initLiveAuth();

    },

    { once: true }

  );



} else {



  void initLiveAuth();



}
