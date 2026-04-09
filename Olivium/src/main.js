var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// main.ts
let treesData = [];
let ownershipData = [];
let lastSnapshot = null;
const log = (msg, color = "#0f0") => {
    const consoleEl = document.getElementById('adminConsole');
    if (!consoleEl)
        return;
    const entry = document.createElement('div');
    entry.style.color = color;
    entry.innerHTML = `[${new Date().toLocaleTimeString()}] ${msg}`;
    consoleEl.appendChild(entry);
    consoleEl.scrollTop = consoleEl.scrollHeight;
};
function setupDatabase() {
    return __awaiter(this, void 0, void 0, function* () {
        log("Initializing Database...", "#0cf");
        try {
            const res = yield fetch('/admin/setup-db', { method: 'POST' });
            const data = yield res.json();
            if (data.success) {
                log("DB SUCCESS: System Online.", "#0f0");
                const indicator = document.getElementById('db-indicator');
                if (indicator) {
                    indicator.style.color = "#0f0";
                    indicator.innerText = "● System Online";
                }
            }
        }
        catch (e) {
            log("DB ERROR", "#f44");
        }
    });
}
function loadData() {
    return __awaiter(this, void 0, void 0, function* () {
        log("Fetching JSON files...", "#0cf");
        try {
            const [tRes, oRes] = yield Promise.all([fetch('/mock/trees.json'), fetch('/mock/ownership.json')]);
            treesData = yield tRes.json();
            ownershipData = yield oRes.json();
            const treeBody = document.querySelector("#treeTable tbody");
            if (treeBody) {
                treeBody.innerHTML = treesData.slice(0, 10).map(t => `<tr><td>${t.tree_id}</td><td>${t.status}</td><td>${t.health_score}</td></tr>`).join('');
            }
            log(`Loaded ${treesData.length} records.`, "#0f0");
        }
        catch (e) {
            log("Fetch failed. Check mock folder.", "#f44");
        }
    });
}
function runSimulation() {
    if (!treesData.length)
        return log("Load data first!", "#f44");
    // Simplified calculation for the snapshot
    lastSnapshot = {
        field_id: "F1",
        period: "2025-H1",
        totals: { oil_revenue: 136875, carbon_revenue: 3290, field_revenue: 140165 },
        wallets: {} // In a real scenario, map your ownershipData here
    };
    log("Simulation complete. Snapshot ready.", "#c2a83e");
    document.getElementById('commitBtn').disabled = false;
}
function commitSnapshot() {
    return __awaiter(this, void 0, void 0, function* () {
        log("Committing...", "#0cf");
        const res = yield fetch('/admin/commit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(lastSnapshot)
        });
        const result = yield res.json();
        if (result.success)
            log(`Saved! Hash: ${result.hash.substring(0, 10)}`, "#0f0");
    });
}
// CRITICAL: Attach to window so HTML buttons can find them
window.setupDatabase = setupDatabase;
window.loadData = loadData;
window.runSimulation = runSimulation;
window.commitSnapshot = commitSnapshot;
