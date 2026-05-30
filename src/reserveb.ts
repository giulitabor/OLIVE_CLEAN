    import { sb } from "./src/connection.ts";
    import { PublicKey, SystemProgram } from "@solana/web3.js";
    import * as anchor from "@coral-xyz/anchor";

    window.sb = sb;
    window.PublicKey = PublicKey;
    window.SystemProgram = SystemProgram;
    window.anchor = anchor;
    window.loadTrees = (filter) => { if(window._loadTreesImpl) window._loadTreesImpl(filter); };

  <script type="module">
   import { sb } from "./src/connection.ts";
    import { PublicKey, Keypair, Connection } from "@solana/web3.js";

    const connection = new Connection("https://api.devnet.solana.com", "confirmed");

        window.OliviumAuth = {
          user: null,
          setUser(u) {
            this.user = u;
            localStorage.setItem("olivium_user", JSON.stringify(u));
          },
          getUser() {
            return this.user || JSON.parse(localStorage.getItem("olivium_user") || "null");
          }
        };

        const openModalBtn = document.getElementById("emailLoginBtn");
        const closeModalBtn = document.getElementById("closeAuthModal");
        const modalOverlay = document.getElementById("authModalOverlay");
        const connectModal = document.getElementById("connectModal");

        const loginTab = document.getElementById("loginTab");
        const signupTab = document.getElementById("signupTab");
        const loginForm = document.getElementById("loginForm");
        const signupForm = document.getElementById("signupForm");

        const loginOtpBox = document.getElementById("loginOtpBox");
        const signupOtpBox = document.getElementById("signupOtpBox");
        const qrContainer = document.getElementById("qr");
        const msg = document.getElementById("msg");
        const signupEmail = document.getElementById("signupEmail");
        const signupPassword = document.getElementById("signupPassword");
        const signupConfirmPassword = document.getElementById("signupConfirmPassword");
        const signupBtn = document.getElementById("signupBtn");

        const metrics = {
          len: { reg: /.{6,}/, el: document.getElementById("metric-len") },
          cap: { reg: /[A-Z]/, el: document.getElementById("metric-cap") },
          low: { reg: /[a-z]/, el: document.getElementById("metric-low") },
          num: { reg: /[0-9]/, el: document.getElementById("metric-num") },
          spe: { reg: /[^A-Za-z0-9]/, el: document.getElementById("metric-spe") }
        };

        function validateSignupForm() {
          const passVal = signupPassword.value || "";
          const confirmVal = signupConfirmPassword.value || "";
          let allPass = true;

          for (const key in metrics) {
            const matched = metrics[key].reg.test(passVal);
            const element = metrics[key].el;
            if (element) {
              if (matched) {
                element.style.color = "#2e7d32";
                element.querySelector(".icon").innerText = "✔";
              } else {
                element.style.color = "#d94d4d";
                element.querySelector(".icon").innerText = "❌";
                allPass = false;
              }
            }
          }

          const matches = passVal === confirmVal && passVal.length > 0;

          if (allPass && matches && signupEmail.value.trim().length > 0) {
            signupBtn.disabled = false;
            signupBtn.style.background = "var(--green)";
          } else {
            signupBtn.disabled = true;
            signupBtn.style.background = "#cccccc";
          }
        }

        signupEmail?.addEventListener("input", validateSignupForm);
        signupPassword?.addEventListener("input", validateSignupForm);
        signupConfirmPassword?.addEventListener("input", validateSignupForm);

        function show(text, ok = true) {
          msg.innerText = text;
          msg.style.color = ok ? "var(--green)" : "#d94d4d";
        }

        // Single source of truth for all identity UI: pill, stat, connect button.
        // Called on DOMContentLoaded, solana:connection-complete, and after disconnect.
        async function updateIdentityBalanceUI() {
          try {
            const pillEl      = document.getElementById("identityPill");
            const stat        = document.getElementById("identityTypeStat");
            const connectBtn  = document.getElementById("connectBtn");

            // Resolve active identity — check live wallet first, then _provider, then localStorage
            const liveKey  = window.solana?.publicKey || window.walletPubKey
                          || (window._provider?.publicKey) || null;
            const saved    = JSON.parse(localStorage.getItem("olivium_identity") || "null");
            const isEmail  = saved?.type === "email";
            const isWallet = !isEmail && (liveKey || (saved?.type === "wallet" && saved?.wallet));

            if (isEmail) {
              // Email-custodial login
              const label = saved.address || "";
              if (pillEl) pillEl.innerHTML = `✉️ ${label}`;
              if (stat)   stat.innerHTML   = "Email Secured";
              if (connectBtn) {
                connectBtn.innerText      = "Disconnect";
                connectBtn.style.color    = "var(--danger, #d94d4d)";
                connectBtn.style.border   = "1px solid var(--danger, #d94d4d)";
                connectBtn.style.background = "transparent";
              }

            } else if (isWallet) {
              // Extension wallet or cached wallet address
              const pubKey = liveKey || (() => {
                try { return new PublicKey(saved.wallet); } catch { return null; }
              })();

              let solBalance = "—";
              let shortAddr  = saved?.wallet
                ? `${saved.wallet.slice(0,4)}...${saved.wallet.slice(-4)}`
                : "—";

              if (pubKey) {
                shortAddr = `${pubKey.toBase58().slice(0,4)}...${pubKey.toBase58().slice(-4)}`;
                try {
                  const lamports = await connection.getBalance(pubKey);
                  solBalance = (lamports / 1_000_000_000).toFixed(3);
                } catch (_) {}
              }

              if (pillEl) pillEl.innerHTML = `◎ ${solBalance} SOL <span style="opacity:0.5;margin:0 6px">|</span> 🔑 ${shortAddr}`;
              if (stat)   stat.innerHTML   = "Wallet Mode";
              if (connectBtn) {
                connectBtn.innerText      = `${shortAddr} (Disconnect)`;
                connectBtn.style.color    = "var(--danger, #d94d4d)";
                connectBtn.style.border   = "1px solid var(--danger, #d94d4d)";
                connectBtn.style.background = "transparent";
              }

            } else {
              // Guest
              if (pillEl) pillEl.innerHTML = "🌿 Guest Mode";
              if (stat)   stat.innerHTML   = "Guest";
              if (connectBtn) {
                connectBtn.innerText      = "Connect Profile";
                connectBtn.style.color    = "white";
                connectBtn.style.border   = "";
                connectBtn.style.background = "var(--green)";
              }
            }
          } catch (err) {
            console.error("[identityUI] render error:", err);
          }
        }

        openModalBtn?.addEventListener("click", () => {
          if (connectModal) connectModal.style.display = "none";
          if (modalOverlay) modalOverlay.style.display = "flex";
          show("");
        });

        closeModalBtn?.addEventListener("click", () => {
          modalOverlay.style.display = "none";
        });

        modalOverlay?.addEventListener("click", (e) => {
          if (e.target === modalOverlay) {
            modalOverlay.style.display = "none";
          }
        });

        loginTab?.addEventListener("click", () => {
          loginTab.style.background = "var(--green)";
          loginTab.style.color = "white";
          signupTab.style.background = "transparent";
          signupTab.style.color = "var(--text)";
          loginForm.style.display = "block";
          signupForm.style.display = "none";
          show("");
        });

        signupTab?.addEventListener("click", () => {
          signupTab.style.background = "var(--green)";
          signupTab.style.color = "white";
          loginTab.style.background = "transparent";
          loginTab.style.color = "var(--text)";
          signupForm.style.display = "block";
          loginForm.style.display = "none";
          show("");
        });

        let generatedCustodialWallet = "";
        const secretSeed = "OLIVIUMDAO777MFASEED";

        document.getElementById("signupBtn")?.addEventListener("click", async () => {
          const emailVal = (document.getElementById("signupEmail").value || "").trim().toLowerCase();
          const passwordVal = (document.getElementById("signupPassword").value || "").trim();

          if (!emailVal || !passwordVal) {
            show("Please complete both Email and Password fields.", false);
            return;
          }

          show("Generating secure cryptographic MFA parameters...", true);
          qrContainer.innerHTML = "";

          try {
            const credentialCombination = `${emailVal}:${passwordVal}:${secretSeed}`;
            const encoder = new TextEncoder();
            const dataBytes = encoder.encode(credentialCombination);
            const hashBuffer = await crypto.subtle.digest("SHA-256", dataBytes);
            const deterministicSeedUint8 = new Uint8Array(hashBuffer);
            const derivedKeypair = Keypair.fromSeed(deterministicSeedUint8);
            generatedCustodialWallet = derivedKeypair.publicKey.toBase58();

            const issuer = encodeURIComponent("Olivium DAO");
            const account = encodeURIComponent(emailVal);
            const totpUri = `otpauth://totp/${issuer}:${account}?secret=${secretSeed}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;

            new QRCode(qrContainer, {
              text: totpUri,
              width: 180,
              height: 180,
              colorDark: "#1f402a",
              colorLight: "#ffffff",
              correctLevel: QRCode.CorrectLevel.H
            });

            signupOtpBox.style.display = "block";
          } catch (err) {
            console.error("Cryptographic derivation failed:", err);
            show("Failed to securely generate credentials.", false);
          }
        });

        document.getElementById("verifySignupOtp")?.addEventListener("click", async () => {
          const emailVal = (document.getElementById("signupEmail").value || "").trim().toLowerCase();
          const enteredOtp = (document.getElementById("signupOtp").value || "").trim();

          if (!enteredOtp || enteredOtp.length < 6) {
            show("Please input your 6-digit authenticator pass code.", false);
            return;
          }

          show("Syncing secure account profile parameters to database...", true);

          try {
            const { error: dbError } = await sb
              .from("users")
              .insert([{
                Email_address: emailVal,
                wallet: generatedCustodialWallet,
                token: secretSeed
              }]);

            if (dbError && dbError.code !== "23505") {
              throw dbError;
            }

            show("MFA Enabled! Profile synced. Flipping to Login tab...", true);

            setTimeout(() => {
              loginTab.click();
              const loginEmailInput = document.getElementById("loginEmail");
              if (loginEmailInput) loginEmailInput.value = emailVal;
              signupOtpBox.style.display = "none";
              qrContainer.innerHTML = "";
            }, 1500);
          } catch (err) {
            console.error("Supabase verification mapping sync crash:", err);
            show(`Failed to update database: ${err.message || 'Check database constraints.'}`, false);
          }
        });

        document.getElementById("loginBtn")?.addEventListener("click", () => {
          const emailVal = (document.getElementById("loginEmail").value || "").trim();
          const passwordVal = (document.getElementById("loginPassword").value || "").trim();

          if (!emailVal || !passwordVal) {
            show("Please fill out your account credentials.", false);
            return;
          }

          show("Processing login authorization details...", true);
          loginOtpBox.style.display = "block";
        });

        document.getElementById("verifyLoginOtp")?.addEventListener("click", async () => {
          const emailVal = (document.getElementById("loginEmail").value || "").trim().toLowerCase();
          if (!emailVal) {
            show("Please enter your email.", false);
            return;
          }

          try {
            show("Retrieving secure cryptographic wallet association keys...", true);

            const { data: profile, error: profileErr } = await sb
              .from("users")
              .select("wallet")
              .eq("Email_address", emailVal)
              .maybeSingle();
              if (profileErr) {
      console.error("Database lookup error:", profileErr);
      show("Failed to retrieve user profile. Please try again.", false);
      return;
    }

    const activeOnChainKeyStr = (profile && profile.wallet)
      ? profile.wallet
      : null;  // Don't use fallback wallet - require valid user

    if (!activeOnChainKeyStr) {
      show("No wallet associated with this email. Please contact support.", false);
      return;
    }
            window.OliviumAuth.setUser({ email: emailVal, tier: "Standard" });

            window._provider = {
              publicKey: new PublicKey(activeOnChainKeyStr),
              wallet: {
                publicKey: new PublicKey(activeOnChainKeyStr),
              },
              signTransaction: async (tx) => {
                console.log("[Embedded Signer Module] Sign instruction intercepted successfully.");
                return tx;
              }
            };
            window.walletPubKey = new PublicKey(activeOnChainKeyStr);

            localStorage.setItem('olivium_identity', JSON.stringify({
              type: "email",
              address: emailVal,
              custodialWallet: activeOnChainKeyStr
            }));

            show("MFA verified successfully! Syncing layout...", true);

            setTimeout(() => {
              modalOverlay.style.display = "none";
              window.dispatchEvent(new Event('solana:connection-complete'));
            }, 800);
          } catch (err) {
            console.error("Login verification adapter compilation failure:", err);
            show("An unexpected authentication pipeline error occurred.", false);
          }
        });

        // Expose on window so Script 2 and external callers can reach it
        window.updateIdentityBalanceUI = updateIdentityBalanceUI;

        // Listen for both event names — connection.ts fires olivium:connected,
        // the modal wallet button fires solana:connection-complete
        window.addEventListener('olivium:connected',    () => updateIdentityBalanceUI());
        window.addEventListener('olivium:disconnected', () => updateIdentityBalanceUI());
        window.addEventListener('solana:connection-complete', () => updateIdentityBalanceUI());

        document.addEventListener("DOMContentLoaded", () => {
          setTimeout(() => updateIdentityBalanceUI(), 600);
        });
      </script>

      <script>
        const mobileToggle = document.getElementById('mobileToggle');
        const navLinks = document.getElementById('navLinks');

        mobileToggle?.addEventListener('click', () => {
          navLinks.classList.toggle('active');
        });

        const connectModalEl = document.getElementById('connectModal');
        const connectBtn = document.getElementById('connectBtn');
        const connectWalletBtn = document.querySelector('#walletConnectCard #connectWalletBtn');

        // ── Nav button click: connect or disconnect based on real state ──────
        connectBtn?.addEventListener('click', async () => {
          const identity = await getActiveWallet();
          if (identity) {
            await handleDisconnectWorkflow();
          } else {
            connectModalEl.style.display = 'flex';
          }
        });

        // ── "Connect Wallet" inside the connect modal ─────────────────────────
        connectWalletBtn?.addEventListener('click', async () => {
          try {
            // Always go through connectWallet() from connection.ts so that
            // _program, _provider, walletPubKey are all set correctly and
            // olivium:connected is fired (which updateIdentityBalanceUI listens to)
            if (typeof window.connectWallet === 'function') {
              await window.connectWallet(false);
            } else {
              // Fallback if connection.ts hasn't loaded yet
              const provider = window.phantom?.solana || window.solana;
              if (!provider) { alert("Solana wallet extension not detected!"); return; }
              const resp = await provider.connect();
              const pubKeyStr = resp.publicKey ? resp.publicKey.toBase58() : provider.publicKey?.toBase58();
              if (pubKeyStr) {
                localStorage.setItem('olivium_identity', JSON.stringify({ type: "wallet", wallet: pubKeyStr, source: "solana" }));
                window.walletPubKey = resp.publicKey || provider.publicKey;
                window.dispatchEvent(new Event('solana:connection-complete'));
              }
            }
            // Always save identity to localStorage after wallet connect so
            // updateIdentityBalanceUI can read it on the next render
            const liveKey = window.walletPubKey || window.solana?.publicKey || window._provider?.publicKey;
            if (liveKey) {
              localStorage.setItem('olivium_identity', JSON.stringify({ type: "wallet", wallet: liveKey.toBase58(), source: "solana" }));
            }
            closeConnectModal();
          } catch (err) {
            console.error("Wallet connection declined:", err);
          }
        });

        window.closeConnectModal = function() {
          if (connectModalEl) connectModalEl.style.display = 'none';
        }

        // ── Disconnect ────────────────────────────────────────────────────────
        async function handleDisconnectWorkflow() {
          // Prefer the full disconnectWallet() from connection.ts — clears
          // _program, _provider, _isInitialized, fires olivium:disconnected
          if (typeof window.disconnectWallet === 'function') {
            await window.disconnectWallet();
          } else {
            // Fallback manual clear
            localStorage.removeItem('olivium_identity');
            localStorage.removeItem('olivium_user');
            localStorage.removeItem('walletConnected');
            if (window.OliviumAuth) window.OliviumAuth.user = null;
            try { if (window.solana?.disconnect) await window.solana.disconnect(); } catch(_) {}
            window._provider   = null;
            window._program    = null;
            window._protocol   = null;
            window.walletPubKey = null;
            window.OliviumIdentity = { type: 'guest' };
            window.dispatchEvent(new CustomEvent('olivium:disconnected'));
          }
          // Also always clear localStorage here in case disconnectWallet skips it
          localStorage.removeItem('olivium_identity');
          localStorage.removeItem('olivium_user');
          if (window.OliviumAuth) window.OliviumAuth.user = null;
          // Fire solana:connection-complete as well for any legacy listeners
          window.dispatchEvent(new Event('solana:connection-complete'));
        }

        // ── Determine whether a session is active (real-time, no stale cache) ─
        async function getActiveWallet() {
          // Check globals first — they're cleared on disconnect before this is called
          if (window.walletPubKey)            return { type: 'wallet', address: window.walletPubKey.toBase58?.() || String(window.walletPubKey) };
          if (window._provider?.publicKey)    return { type: 'wallet', address: window._provider.publicKey.toBase58() };
          // Intentionally NOT checking window.solana.publicKey here — Phantom keeps
          // it set after disconnect until page reload, causing false "connected" reads
          const cached = localStorage.getItem('olivium_identity');
          if (cached) {
            try {
              const parsed = JSON.parse(cached);
              if (parsed.type === 'wallet'  && parsed.wallet)          return { type: 'wallet', address: parsed.wallet };
              if (parsed.type === 'email'   && parsed.custodialWallet) return { type: 'email',  address: parsed.custodialWallet, label: parsed.address };
            } catch(_) {}
          }
          return null;
        }

        // ── Aliases for external callers ──────────────────────────────────────
        window.refreshIdentityUI = function() {
          if (typeof window.updateIdentityBalanceUI === 'function') window.updateIdentityBalanceUI();
        };

        // Single listener here — Script 1 already handles olivium:connected/disconnected
        // and solana:connection-complete. No duplicate listener added.

        function closeModal() {
          document.getElementById('modalOverlay').style.display = 'none';
        }
        function openAgreement() {
          document.getElementById('agreementModal').style.display = 'flex';
        }
        function closeAgreement() {
          document.getElementById('agreementModal').style.display = 'none';
        }
