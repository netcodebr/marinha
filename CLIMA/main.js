const DEFAULT_CITY = { name: "São Paulo", lat: -23.55052, lon: -46.633308, tz: "America/Sao_Paulo" };
const GEO_URL = n => `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(n)}&count=5&language=pt&format=json`;
const SUN_URL = (lat, lon, iso) => `https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lon}&date=${iso}&formatted=0`;

const LS_CACHE = "sunMultiCache", LS_RECENT = "sunRecentCities", LS_THEME = "sunTheme";
const AUTO_UPDATE_ON_LOAD = true;

const statusBox = document.getElementById("statusBox"),
      tempoCache = document.getElementById("tempoCache"),
      temaBtn = document.getElementById("temaBtn"),
      info = document.getElementById("info"),
      saida = document.getElementById("saida"),
      graficoCtx = document.getElementById("grafico").getContext("2d"),
      atualizarBtn = document.getElementById("atualizar"),
      citySearch = document.getElementById("citySearch"),
      suggestions = document.getElementById("suggestions"),
      recentChips = document.getElementById("recentChips"),
      localInfo = document.getElementById("localInfo");

let currentCity = DEFAULT_CITY;

/* ------------------ UTILITÁRIOS ------------------ */
const horaNoTZ = (iso, tz) => new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz }).format(new Date(iso));
const toLabelDate = iso => new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
const duracaoH = seg => (seg / 3600).toFixed(2);
const tempoDecorrido = ms => {
    const d = Math.floor((Date.now() - ms) / 60000);
    if (d < 1) return "há segundos";
    if (d < 60) return `há ${d} min`;
    if (d < 1440) return `há ${(d / 60).toFixed(1)} h`;
    return `há ${(d / 1440).toFixed(1)} dias`;
};

/* ------------------ STATUS ONLINE/OFFLINE ------------------ */
function atualizarStatus() {
    if (navigator.onLine) {
        statusBox.textContent = "🟢 Online + cache ativo";
        statusBox.className = "online";
    } else {
        statusBox.textContent = "🔴 Offline (usando cache)";
        statusBox.className = "offline";
    }
}
window.addEventListener("online", atualizarStatus);
window.addEventListener("offline", atualizarStatus);

/* ------------------ TEMA ------------------ */
function aplicarTema(t) {
    document.documentElement.dataset.tema = t;
    temaBtn.textContent = t === "dark" ? "☀️" : "🌙";
    localStorage.setItem(LS_THEME, t);
}
temaBtn.onclick = () => aplicarTema(document.documentElement.dataset.tema === "dark" ? "light" : "dark");
aplicarTema(localStorage.getItem(LS_THEME) || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));

/* ------------------ CACHE LOCAL ------------------ */
const loadCache = () => JSON.parse(localStorage.getItem(LS_CACHE) || "{}");
const saveCache = o => localStorage.setItem(LS_CACHE, JSON.stringify(o));
const loadRecent = () => JSON.parse(localStorage.getItem(LS_RECENT) || "[]");
const saveRecent = l => localStorage.setItem(LS_RECENT, JSON.stringify(l.slice(0, 5)));

function pushRecent(c) {
    const r = loadRecent().filter(x => x.name !== c.name);
    r.unshift(c);
    saveRecent(r);
    renderRecentChips(r);
}

function renderRecentChips(l) {
    recentChips.innerHTML = "";
    l.forEach(it => {
        const b = document.createElement("button");
        b.className = "chip";
        b.textContent = it.name;
        b.onclick = () => selectCity(it);
        recentChips.appendChild(b);
    });
}

/* ------------------ SUGESTÕES ------------------ */
let debounce = null;
citySearch.addEventListener("input", () => {
    const q = citySearch.value.trim();
    if (debounce) clearTimeout(debounce);
    if (!q) {
        suggestions.innerHTML = "";
        suggestions.classList.remove("show");
        return;
    }
    debounce = setTimeout(async () => {
        try {
            const j = await (await fetch(GEO_URL(q))).json();
            const br = (j.results || []).filter(it => (it.country_code || "").toUpperCase() === "BR");
            suggestions.innerHTML = br.map(it => `<li data-name="${it.name}" data-lat="${it.latitude}" data-lon="${it.longitude}">${it.name}${it.admin1 ? ", " + it.admin1 : ""} — ${it.country}</li>`).join("");
            suggestions.classList.toggle("show", br.length > 0);
        } catch { suggestions.classList.remove("show"); }
    }, 300);
});

suggestions.onclick = e => {
    const li = e.target.closest("li"); if (!li) return;
    suggestions.classList.remove("show");
    selectCity({ name: li.dataset.name, lat: +li.dataset.lat, lon: +li.dataset.lon, tz: "America/Sao_Paulo" }, true);
};

/* ------------------ SELECIONAR CIDADE ------------------ */
function selectCity(c, toast = false) {
    currentCity = c;
    localInfo.textContent = `Local: ${c.name} (lat ${c.lat.toFixed(3)}, lon ${c.lon.toFixed(3)})`;
    pushRecent(c);
    const cache = loadCache(), entry = cache[c.name];
    if (entry) render(entry.dados, "📦 Cache local", entry.ts, c.tz);
    if (navigator.onLine) atualizar();
    else if (!entry) Swal.fire({ icon: "warning", title: "Sem internet", text: "Nenhum cache salvo para esta cidade.", timer: 1800, showConfirmButton: false });
    if (toast) Swal.fire({ icon: "success", title: "Cidade definida", text: `Exibindo ${c.name}`, timer: 1000, showConfirmButton: false });
}

/* ------------------ API ------------------ */
async function fetchSunData(lat, lon) {
    const arr = [];
    for (let i = 0; i < 14; i++) { // 14 dias
        const d = new Date(); d.setDate(d.getDate() + i);
        const iso = d.toISOString().split("T")[0];
        const j = await (await fetch(SUN_URL(lat, lon, iso))).json();
        if (j.status === "OK") arr.push({ date: iso, results: j.results });
    }
    return arr;
}

/* ------------------ RENDER ------------------ */
function render(data, src, ts, tz) {
    const zone = tz || "America/Sao_Paulo";
    let html = "<table><tr><th>Data</th><th>Nascer 🌅</th><th>Pôr 🌇</th><th>Duração</th></tr>";
    data.forEach(o => {
        html += `<tr><td>${toLabelDate(o.date)}</td><td>${horaNoTZ(o.results.sunrise, zone)}</td><td>${horaNoTZ(o.results.sunset, zone)}</td><td>${duracaoH(o.results.day_length)} h</td></tr>`;
    });
    html += "</table>";
    saida.innerHTML = html;
    info.textContent = src;
    tempoCache.textContent = ts ? `🕒 Última atualização ${tempoDecorrido(ts)}` : "";
    drawChart(data);
}

/* ------------------ GRÁFICO ------------------ */
function drawChart(data) {
    const labels = data.map(o => toLabelDate(o.date));
    const values = data.map(o => parseFloat(duracaoH(o.results.day_length)));
    const w = graficoCtx.canvas.width, h = graficoCtx.canvas.height;
    const max = Math.max(...values), min = Math.min(...values);
    const step = w / (values.length - 1 || 1);
    const scale = v => h - (v - min) * (h / (max - min || 1));

    graficoCtx.clearRect(0, 0, w, h);
    graficoCtx.beginPath();
    graficoCtx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent');
    graficoCtx.lineWidth = 2;

    values.forEach((v, i) => {
        const x = i * step, y = scale(v);
        i ? graficoCtx.lineTo(x, y) : graficoCtx.moveTo(x, y);
    });
    graficoCtx.stroke();

    graficoCtx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent-2');
    graficoCtx.font = "12px system-ui";
    labels.forEach((lab, i) => graficoCtx.fillText(lab, i * step + 4, h - 4));
}

/* ------------------ ATUALIZAR ------------------ */
async function atualizar() {
    try {
        info.textContent = "🔄 Atualizando online…";
        const dados = await fetchSunData(currentCity.lat, currentCity.lon);
        const ts = Date.now();
        const cache = loadCache();
        cache[currentCity.name] = { coords: { lat: currentCity.lat, lon: currentCity.lon }, tz: currentCity.tz, dados, ts };
        saveCache(cache);
        render(dados, "✅ Dados atualizados", ts, currentCity.tz);
    } catch (e) { Swal.fire({ icon: "error", title: "Falha na atualização", text: String(e) }); }
}

/* ------------------ INICIALIZAÇÃO ------------------ */
function carregar() {
    atualizarStatus();
    renderRecentChips(loadRecent());
    selectCity(DEFAULT_CITY);
    if (AUTO_UPDATE_ON_LOAD && navigator.onLine) atualizar();
}
document.addEventListener("DOMContentLoaded", carregar);
atualizarBtn.onclick = atualizar;

/* ------------------ SERVICE WORKER ------------------ */
if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js", { scope: "./" }).then(() => console.log("SW ativo"));
}
