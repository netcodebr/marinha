const DEFAULT_CITY = {
  name: "São Paulo",
  lat: -23.55052,
  lon: -46.633308,
  tz: "America/Sao_Paulo"
};

const GEO_URL = n =>
  `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(n)}&count=5&language=pt&format=json`;

const SUN_URL = (lat, lon, iso) =>
  `https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lon}&date=${iso}&formatted=0`;

const LS_CACHE = "sunCache";
const LS_RECENT = "sunRecent";
const LS_THEME = "sunTheme";

const statusBox = document.getElementById("statusBox");
const tempoCache = document.getElementById("tempoCache");
const temaBtn = document.getElementById("temaBtn");
const info = document.getElementById("info");
const saida = document.getElementById("saida");
const atualizarBtn = document.getElementById("atualizar");
const citySearch = document.getElementById("citySearch");
const suggestions = document.getElementById("suggestions");
const recentChips = document.getElementById("recentChips");
const localInfo = document.getElementById("localInfo");

let currentCity = DEFAULT_CITY;

/* ================= UTIL ================= */

const hora = (iso, tz) =>
  new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz
  }).format(new Date(iso));

const labelData = iso =>
  new Date(iso + "T12:00:00").toLocaleDateString("pt-BR",
    { weekday:"short", day:"2-digit", month:"2-digit" });

const duracao = s => (s/3600).toFixed(2)+" h";

const ajustarMin = (iso, m) => {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes()+m);
  return d.toISOString();
};

/* ================= STATUS ================= */

function atualizarStatus(){
  if(navigator.onLine){
    statusBox.textContent="🟢 Online";
    statusBox.className="online";
  }else{
    statusBox.textContent="🔴 Offline";
    statusBox.className="offline";
  }
}
window.addEventListener("online", atualizarStatus);
window.addEventListener("offline", atualizarStatus);

/* ================= TEMA ================= */

function aplicarTema(t){
  document.documentElement.dataset.tema=t;
  temaBtn.textContent = t==="dark"?"☀️":"🌙";
  localStorage.setItem(LS_THEME,t);
}

temaBtn.onclick=()=>aplicarTema(
  document.documentElement.dataset.tema==="dark"?"light":"dark"
);

aplicarTema(localStorage.getItem(LS_THEME)||"light");

/* ================= CACHE ================= */

const loadCache=()=>JSON.parse(localStorage.getItem(LS_CACHE)||"{}");
const saveCache=o=>localStorage.setItem(LS_CACHE,JSON.stringify(o));

const loadRecent=()=>JSON.parse(localStorage.getItem(LS_RECENT)||"[]");
const saveRecent=l=>localStorage.setItem(LS_RECENT,JSON.stringify(l.slice(0,5)));

function pushRecent(c){
  const r=loadRecent().filter(x=>x.name!==c.name);
  r.unshift(c);
  saveRecent(r);
  renderRecent(r);
}

function renderRecent(l){
  recentChips.innerHTML="";
  l.forEach(c=>{
    const b=document.createElement("button");
    b.className="chip";
    b.textContent=c.name;
    b.onclick=()=>selectCity(c);
    recentChips.appendChild(b);
  });
}

/* ================= BUSCA ================= */

let debounce=null;

citySearch.oninput=()=>{
  const q=citySearch.value.trim();
  if(debounce)clearTimeout(debounce);
  if(!q){suggestions.innerHTML="";return;}

  debounce=setTimeout(async()=>{
    const j=await (await fetch(GEO_URL(q))).json();
    const br=(j.results||[]).filter(x=>x.country_code==="BR");

    suggestions.innerHTML=br.map(c=>
      `<li data-name="${c.name}"
           data-lat="${c.latitude}"
           data-lon="${c.longitude}">
        ${c.name}${c.admin1?", "+c.admin1:""}
      </li>`
    ).join("");
  },300);
};

suggestions.onclick=e=>{
  const li=e.target.closest("li");
  if(!li)return;

  selectCity({
    name:li.dataset.name,
    lat:+li.dataset.lat,
    lon:+li.dataset.lon,
    tz:"America/Sao_Paulo"
  });

  suggestions.innerHTML="";
};

/* ================= CIDADE ================= */

function selectCity(c){
  currentCity=c;
  localInfo.textContent="Local: "+c.name;
  pushRecent(c);

  const cache=loadCache()[c.name];
  if(cache) render(cache.data,"📦 Cache",cache.ts,c.tz);

  if(navigator.onLine) atualizar();
}

/* ================= API ================= */

async function fetchSun(lat,lon){
  const arr=[];
  for(let i=0;i<14;i++){
    const d=new Date();
    d.setDate(d.getDate()+i);
    const iso=d.toISOString().split("T")[0];

    const j=await (await fetch(SUN_URL(lat,lon,iso))).json();
    if(j.status==="OK") arr.push({date:iso,results:j.results});
  }
  return arr;
}

/* ================= RENDER ================= */

function render(data,src,ts,tz){
  let html=`
<table>
<tr>
<th>Data</th>
<th>Nascer</th>
<th>5 min antes do pôr</th>
<th>1 min antes do pôr</th>
<th>Pôr</th>
<th>Duração</th>
</tr>`;

  data.forEach(o=>{
    const s=o.results.sunset;
    html+=`
<tr>
<td>${labelData(o.date)}</td>
<td>${hora(o.results.sunrise,tz)}</td>
<td>${hora(ajustarMin(s,-5),tz)}</td>
<td>${hora(ajustarMin(s,-1),tz)}</td>
<td>${hora(s,tz)}</td>
<td>${duracao(o.results.day_length)}</td>
</tr>`;
  });

  html+="</table>";
  saida.innerHTML=html;
  info.textContent=src;
  tempoCache.textContent=ts
    ? `Atualizado há ${Math.floor((Date.now()-ts)/60000)} min`
    : "";
}

/* ================= ATUALIZAR ================= */

async function atualizar(){
  info.textContent="Atualizando...";
  const data=await fetchSun(currentCity.lat,currentCity.lon);
  const ts=Date.now();

  const cache=loadCache();
  cache[currentCity.name]={data,ts};
  saveCache(cache);

  render(data,"✅ Online",ts,currentCity.tz);
}

/* ================= INIT ================= */

document.addEventListener("DOMContentLoaded",()=>{
  atualizarStatus();
  renderRecent(loadRecent());
  selectCity(DEFAULT_CITY);
});

atualizarBtn.onclick=atualizar;

/* ================= SW ================= */

if("serviceWorker" in navigator){
  navigator.serviceWorker.register("sw.js");
}
