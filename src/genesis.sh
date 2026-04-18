#!/bin/bash

# --- CONFIGURATION ---
MINT_KEYPAIR="olv-mint-keypair.json"
MINT_FILE="olv.mint"
ADMIN_PUBKEY="8xkNHk2VpWBM6Nk3enitFCs7vwh2inCveTNintcXHc54"
FEE_PAYER="$HOME/.config/solana/id.json"

# List of test wallets to fund
RECIPIENTS=(
    "8xkNHk2VpWBM6Nk3enitFCs7vwh2inCveTNintcXHc54"
    "FrNP32Hxhuu4pS8yguHhtTEdU9QpU7odRYi5zKNps15N"
    "HamTYmFcmw5qzBFFKiuBECw6CKaJ8j3Xm3TPp3U8Vdou"
"3F5twRseis3rmth3mEkyvHMtgTtHds52zCppqo5BBPUv"
)

echo "--- 🛡️ GENESIS PROTOCOL STARTING ---"

# 1. MANAGE MINT KEYPAIR (Ensures the Mint address NEVER changes)
if [ ! -f "$MINT_KEYPAIR" ]; then
    echo "🆕 Creating permanent Mint Keypair..."
    solana-keygen new --no-passphrase -o "$MINT_KEYPAIR"
fi

# Extract the address for the script to use
OLV_MINT=$(solana-keygen pubkey "$MINT_KEYPAIR")
echo "$OLV_MINT" > "$MINT_FILE"
echo "🪙 Target OLV_MINT: $OLV_MINT"

# 2. VALIDATOR CHECK
if ! solana ping -ul > /dev/null 2>&1; then
    echo "❌ ERROR: Local validator is not running! Run 'solana-test-validator --reset' first."
    exit 1
fi

# 3. INITIALIZE MINT ON-CHAIN
echo "🛠️  Initializing Mint on-chain..."
spl-token create-token "$MINT_KEYPAIR" --decimals 9 -ul

# 4. SETUP ADMIN TOKEN ACCOUNT & MINT INITIAL SUPPLY
echo "🏗️  Creating Admin Token Account..."
spl-token create-account "$OLV_MINT" -ul --fee-payer "$FEE_PAYER"

echo "🪙  Minting 1,000,000 OLV to Admin..."
spl-token mint "$OLV_MINT" 25000000 -ul --fee-payer "$FEE_PAYER"

# 5. DISTRIBUTION LOOP
for WALLET in "${RECIPIENTS[@]}"
do
    echo "--------------------------------------"
    echo "✈️  Processing: $WALLET"
    
    # Send 700 SOL for gas/testing
    solana transfer "$WALLET" 70000 --allow-unfunded-recipient -ul
    
    # Send 100,000 OLV (excluding admin who already has the bulk)
    if [ "$WALLET" != "$ADMIN_PUBKEY" ]; then
        spl-token transfer "$OLV_MINT" 1 "$WALLET" --fund-recipient -ul --fee-payer "$FEE_PAYER"
    fi
done

echo ""
echo "--- ✅ GENESIS COMPLETE ---"
echo "Mint Address: $OLV_MINT"
echo "done..now GOV.TS"
spl-token accounts -ul
