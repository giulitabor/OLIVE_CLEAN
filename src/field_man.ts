// field_man.ts

interface TreeState {
    s: boolean; m: number; p: number; o: number;
}

let treeData: Record<number, TreeState> = {};
const levels = ["-", "S", "M", "A"];

const saveToStorage = () => localStorage.setItem('field_data_v1', JSON.stringify(treeData));

const loadFromStorage = (): Record<number, TreeState> | null => {
    const saved = localStorage.getItem('field_data_v1');
    return saved ? JSON.parse(saved) : null;
};

async function fetchWeather() {
    try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=43.05&longitude=10.54&current_weather=true&relative_humidity_2m=true`);
        const data = await res.json();
        const t = document.getElementById('w-temp');
        const h = document.getElementById('w-hum');
        if (t) t.innerText = `${data.current_weather.temperature}°C`;
        if (h) h.innerText = `${data.hourly.relative_humidity_2m[0]}%`;
    } catch (e) { console.warn("Offline"); }
}

(window as any).mark = (id: number) => {
    treeData[id].s = !treeData[id].s;
    const btn = document.getElementById(`b-${id}`);
    const card = document.getElementById(`c-${id}`);
    if (btn) btn.innerText = treeData[id].s ? "Done" : "Spray";
    if (card) card.classList.toggle('sprayed');
    saveToStorage();
    updateCounter();
};

(window as any).cyc = (id: number, k: keyof Omit<TreeState, 's'>) => {
    treeData[id][k] = (treeData[id][k] + 1) % 4;
    const val = treeData[id][k];
    const btn = document.getElementById(`${k}-${id}`);
    if (btn) {
        btn.innerText = val === 0 ? k.toUpperCase() : levels[val];
        btn.className = `btn-cycle ${val > 0 ? 'active-'+levels[val] : ''}`;
    }
    saveToStorage();
};

(window as any).toggleGPS = (cb: HTMLInputElement) => {
    const display = document.getElementById('gps-display');
    if (!display) return;
    if (cb.checked) {
        navigator.geolocation.watchPosition((pos) => {
            display.innerText = `±${Math.round(pos.coords.accuracy)}m`;
            display.style.color = "#10b981";
        }, null, { enableHighAccuracy: true });
    } else {
        display.innerText = "OFF";
        display.style.color = "#ff4444";
    }
};

function updateCounter() {
    const done = Object.values(treeData).filter(t => t.s).length;
    const el = document.getElementById('counter');
    if (el) el.innerText = `${done}/240 Done`;
}

function init() {
    const grove = document.getElementById('grove');
    if (!grove) return;
    const savedData = loadFromStorage();
    let treeID = 1;

    for (let r = 1; r <= 20; r++) {
        const count = r <= 7 ? 8 : 13;
        const rowDiv = document.createElement('div');
        rowDiv.className = "row-container";
        rowDiv.innerHTML = `<div class="row-label">Row ${r}</div><div class="tree-grid" id="g-${r}"></div>`;
        grove.appendChild(rowDiv);

        for (let t = 1; t <= count; t++) {
            if (treeID > 240) break;
            const id = treeID;
            treeData[id] = (savedData && savedData[id]) ? savedData[id] : { s: false, m: 0, p: 0, o: 0 };
            const card = document.createElement('div');
            card.id = `c-${id}`;
            card.className = "tree-card" + (treeData[id].s ? " sprayed" : "");
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span class="card-id">#${id}</span>
                    <button onclick="mark(${id})" id="b-${id}" class="spray-toggle">${treeData[id].s ? "Done" : "Spray"}</button>
                </div>
                <div class="cycle-box">
                    <button onclick="cyc(${id},'m')" id="m-${id}" class="btn-cycle ${treeData[id].m > 0 ? 'active-'+levels[treeData[id].m] : ''}">${treeData[id].m > 0 ? levels[treeData[id].m] : 'M'}</button>
                    <button onclick="cyc(${id},'p')" id="p-${id}" class="btn-cycle ${treeData[id].p > 0 ? 'active-'+levels[treeData[id].p] : ''}">${treeData[id].p > 0 ? levels[treeData[id].p] : 'P'}</button>
                    <button onclick="cyc(${id},'o')" id="o-${id}" class="btn-cycle ${treeData[id].o > 0 ? 'active-'+levels[treeData[id].o] : ''}">${treeData[id].o > 0 ? levels[treeData[id].o] : 'O'}</button>
                </div>`;
            document.getElementById(`g-${r}`)?.appendChild(card);
            treeID++;
        }
    }
    updateCounter();
    fetchWeather();
}

const ex = document.getElementById('export-btn');
if (ex) ex.onclick = () => {
    const blob = new Blob([JSON.stringify(treeData, null, 2)], {type : 'application/json'});
    const a = document.createElement('a');
    a.href = window.URL.createObjectURL(blob);
    a.download = `villa_field_report_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
};

window.onload = init;
