import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { IDL } from "./target/idl/olive_dao"; // Your IDL

const connection = new Connection("https://api.devnet.solana.com");
const oracleKeypair = Keypair.fromSecretKey(Uint8Array.from([/* YOUR ORACLE PRIVATE KEY */]));
const wallet = new anchor.Wallet(oracleKeypair);
const provider = new anchor.AnchorProvider(connection, wallet, {});
const program = new anchor.Program(IDL, provider);

// 1. Fetch raw data from your sensors (Mocking an API call here)
async function fetchSensorData() {
    // You would replace this with your MQTT or HTTP call to your sensor network
    return { co2: 415, temp: 22 };
}

// 2. Submit Aggregated Data to Solana
async function pushToSolana(co2: number, temp: number) {
    const [envPda] = PublicKey.findProgramAddressSync([Buffer.from("env_data")], program.programId);

    try {
        const tx = await program.methods
            .updateEnvironment(new anchor.BN(co2), new anchor.BN(temp))
            .accounts({
                envData: envPda,
                authority: oracleKeypair.publicKey,
            })
            .rpc();
        console.log("Oracle Update Successful:", tx);
    } catch (err) {
        console.error("Oracle Update Failed:", err);
    }
}

// 3. Run every hour
setInterval(async () => {
    const data = await fetchSensorData();
    await pushToSolana(data.co2, data.temp);
}, 3600000);
