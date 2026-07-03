// ============================================================
// OLIVIUM DASHBOARD
// ============================================================

import { createClient } from "@supabase/supabase-js";
import { Connection, PublicKey } from "@solana/web3.js";

import {
    initProgram,
    getAllTrees,
    getProtocol
} from "./anchor";

import {
    connectWallet,
    getWalletAddress,
    getOLVBalance
} from "./wallet";

import {
    getAllPositions,
    getPortfolioSummary
} from "./portfolio";

// ============================================================
// CONFIG
// ============================================================

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL!;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY!;

export const sb = createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

export const connection = new Connection(
    import.meta.env.VITE_RPC_URL,
    "confirmed"
);

export const PROGRAM_ID = new PublicKey(
    import.meta.env.VITE_PROGRAM_ID
);

// ============================================================
// STATE
// ============================================================

let metadataTrees: any[] = [];

let chainTrees: any[] = [];

let positions: any[] = [];

let protocol: any = null;

let wallet: string | null = null;

// ============================================================
// DOM
// ============================================================

const $ = (id: string) =>
    document.getElementById(id)!;
// ============================================================
// BOOT
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    boot
);

async function boot() {

    console.log("🌳 Dashboard booting...");

    await initProgram();

    await loadMetadata();

    await loadChainTrees();

    await connect();

    renderDashboard();

    subscribeRealtime();

    console.log("✅ Dashboard Ready");
}
async function connect() {

    try {

        await connectWallet();

        wallet = getWalletAddress();

        if (!wallet)
            return;

        $("wallet-address").innerText =
            wallet.substring(0,4)
            + "..."
            + wallet.substring(wallet.length-4);

        const balance =
            await getOLVBalance();

        $("olv-balance").innerText =
            balance.toLocaleString()
            + " OLV";

        positions =
            await getAllPositions();

        await updatePortfolio();

    }

    catch(err){

        console.warn(err);

    }

}
async function loadMetadata() {

    console.log("Loading Supabase metadata...");

    const { data, error } =
        await sb
            .from("tree_metadata")
            .select("*")
            .order("tree_id");

    if(error){

        console.error(error);

        return;

    }

    metadataTrees = data ?? [];

    console.log(
        metadataTrees.length,
        "metadata trees"
    );

}

async function loadChainTrees() {

    console.log("Loading on-chain trees...");

    chainTrees =
        await getAllTrees();

    protocol =
        await getProtocol();

    console.log(
        chainTrees.length,
        "on-chain trees"
    );

}
function mergedTrees(){

    return metadataTrees.map(meta=>{

        const chain =
            chainTrees.find(

                t=>

                String(t.account.treeId)
                ===
                String(meta.tree_id)

            );

        return{

            ...meta,

            chain

        };

    });

}

function renderDashboard(){

    const trees =
        mergedTrees();

    if(!trees.length)
        return;

    renderHero(trees[0]);

    renderTreeList(trees);

}

function renderHero(tree:any){

    $("hero-name").innerText =
        tree.variety;

    $("hero-tree-id").innerText =
        "#" + tree.tree_id;

    $("hero-age").innerText =
        tree.age_years + " yrs";

    $("hero-variety").innerText =
        tree.variety;

    $("hero-location").innerText =
        tree.latitude
        + ", "
        + tree.longitude;

    $("hero-health").innerText =
        Math.round(
            tree.health_score*100
        )+"%";

    $("health-fill").style.width =
        (tree.health_score*100)
        +"%";

    if(tree.photo_url){

        (
            $("hero-photo") as HTMLDivElement
        ).style.backgroundImage=
            `url(${tree.photo_url})`;

    }

}
function renderTreeList(
    trees:any[]
){

    const div =
        $("tree-list");

    div.innerHTML="";

    trees.forEach(tree=>{

        const row =
            document.createElement("div");

        row.className="tree-row";

        const sold =
            tree.chain
            ?
            tree.chain.account.sharesSold.toNumber()
            :
            0;

        const total =
            tree.chain
            ?
            tree.chain.account.totalShares.toNumber()
            :
            0;

        row.innerHTML=`

        <strong>${tree.variety}</strong>

        <br>

        #${tree.tree_id}

        <br>

        ${sold}/${total} shares

        `;

        div.appendChild(row);

    });

}

async function updatePortfolio() {

    if (!wallet) return;

    const portfolio = await getPortfolioSummary(wallet);

    $("portfolio-olv").innerText =
        portfolio.olv.toLocaleString();

    $("portfolio-positions").innerText =
        portfolio.positions.toString();

    $("portfolio-guardians").innerText =
        portfolio.guardians.toString();

}
async function loadWeather(tree:any){

    if(
        tree.latitude==null ||
        tree.longitude==null
    ) return;

    const url =
`https://api.open-meteo.com/v1/forecast?latitude=${tree.latitude}&longitude=${tree.longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m`;

    const r=await fetch(url);

    const j=await r.json();

    $("weather-temp").innerText =
        `${j.current.temperature_2m}°C`;

    $("weather-humidity").innerText =
        `${j.current.relative_humidity_2m}%`;

    $("weather-wind").innerText =
        `${j.current.wind_speed_10m} km/h`;

}
