"use strict";
/* Visto — tracker di film e serie. Dati: TMDB. Stato: localStorage del tuo dispositivo. */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const IMG = "https://image.tmdb.org/t/p/";
const REGION = "IT";

/* ---------- storage ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem("visto." + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("visto." + k, JSON.stringify(v)); } catch {} }
};
let state = {
  key: store.get("key", ""),
  items: store.get("items", {}),   // "movie:123" -> {type,id,title,poster,status:'watchlist'|'watched', eps:{ "s1e2":true }, added}
  links: store.get("links", [])    // [{name,url}]
};
const save = () => { store.set("key", state.key); store.set("items", state.items); store.set("links", state.links); };

/* ---------- TMDB ---------- */
const cache = new Map();
async function tmdb(path, params = {}) {
  if (!state.key) throw new Error("nokey");
  const q = new URLSearchParams({ language: "it-IT", ...params });
  const hdr = {};
  if (state.key.length > 40) hdr.Authorization = "Bearer " + state.key; else q.set("api_key", state.key);
  const url = "https://api.themoviedb.org/3" + path + "?" + q;
  if (cache.has(url)) return cache.get(url);
  const r = await fetch(url, { headers: hdr });
  if (r.status === 401) throw new Error("badkey");
  if (!r.ok) throw new Error("http" + r.status);
  const j = await r.json();
  cache.set(url, j);
  return j;
}
const poster = (p, w = "w342") => p ? IMG + w + p : "";
const kind = x => x.media_type || (x.first_air_date !== undefined || x.name ? "tv" : "movie");

/* ---------- UI helpers ---------- */
function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2200); }
function card(x) {
  const type = kind(x), title = x.title || x.name || "";
  return `<a class="poster" href="#/${type}/${x.id}">${x.poster_path ? `<img loading="lazy" src="${poster(x.poster_path)}" alt="">` : `<div class="ph"></div>`}<div class="t">${esc(title)}</div></a>`;
}
function setTab(name) { document.querySelectorAll(".tabbar a").forEach(a => a.classList.toggle("on", a.dataset.tab === name)); }
function errorView(e) {
  if (e.message === "nokey" || e.message === "badkey") {
    return `<h1>Benvenuto</h1><div class="card"><p>Per mostrare film e serie serve una chiave gratuita di TMDB.</p>
      <p class="muted">Registrati su themoviedb.org, poi in Impostazioni → API copia la chiave e incollala qui.</p>
      ${e.message === "badkey" ? `<p style="color:var(--red)">La chiave non è valida.</p>` : ""}
      <input id="k" placeholder="Chiave API o token" autocapitalize="off" autocorrect="off"><button class="btn" id="ksave" style="width:100%;margin-top:8px">Salva</button></div>`;
  }
  return `<div class="empty">Qualcosa non va (${esc(e.message)}).<br>Controlla la connessione e riprova.</div>`;
}
function bindKey() {
  const b = $("#ksave"); if (!b) return;
  b.onclick = () => { state.key = $("#k").value.trim(); save(); route(); };
}

/* ---------- views ---------- */
async function home() {
  setTab("home");
  $("#view").innerHTML = `<h1>Home</h1><div class="spin">Carico…</div>`;
  try {
    const [tr, pm, pt] = await Promise.all([
      tmdb("/trending/all/week"), tmdb("/movie/popular"), tmdb("/tv/popular")
    ]);
    const cont = Object.values(state.items).filter(i => i.type === "tv" && i.status !== "watched" && Object.keys(i.eps || {}).length);
    let recs = "";
    const seen = Object.values(state.items).filter(i => i.status === "watched" || Object.keys(i.eps || {}).length);
    if (seen.length) {
      const pick = seen[Math.floor(Math.random() * seen.length)];
      try { const r = await tmdb(`/${pick.type}/${pick.id}/recommendations`);
        if (r.results.length) recs = `<h2>Perché hai visto ${esc(pick.title)}</h2><div class="row">${r.results.slice(0, 15).map(x => card({ ...x, media_type: pick.type })).join("")}</div>`; } catch {}
    }
    $("#view").innerHTML = `<h1>Home</h1>
      ${cont.length ? `<h2>Continua a guardare</h2><div class="row">${cont.map(i => card({ id: i.id, media_type: i.type, title: i.title, poster_path: i.poster })).join("")}</div>` : ""}
      ${recs}
      <h2>Di tendenza</h2><div class="row">${tr.results.filter(x => x.media_type !== "person").map(card).join("")}</div>
      <h2>Film popolari</h2><div class="row">${pm.results.map(x => card({ ...x, media_type: "movie" })).join("")}</div>
      <h2>Serie popolari</h2><div class="row">${pt.results.map(x => card({ ...x, media_type: "tv" })).join("")}</div>`;
  } catch (e) { $("#view").innerHTML = errorView(e); bindKey(); }
}

let searchTimer;
function search(q = "") {
  setTab("search");
  $("#view").innerHTML = `<h1>Cerca</h1><div class="search"><input id="q" type="search" placeholder="Film, serie TV" value="${esc(q)}" autofocus></div><div id="res"></div>`;
  const run = async () => {
    const v = $("#q").value.trim(); const res = $("#res");
    if (v.length < 2) { res.innerHTML = ""; return; }
    try {
      const r = await tmdb("/search/multi", { query: v });
      const list = r.results.filter(x => x.media_type !== "person");
      res.innerHTML = list.length ? `<div class="grid">${list.map(card).join("")}</div>` : `<div class="empty">Nessun risultato</div>`;
    } catch (e) { res.innerHTML = errorView(e); bindKey(); }
  };
  $("#q").oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(run, 350); };
  if (q) run();
}

async function detail(type, id) {
  setTab("");
  $("#view").innerHTML = `<div class="spin">Carico…</div>`;
  try {
    const d = await tmdb(`/${type}/${id}`, { append_to_response: "credits,watch/providers,videos" });
    const key = type + ":" + id, it = state.items[key];
    const title = d.title || d.name, year = (d.release_date || d.first_air_date || "").slice(0, 4);
    const prov = d["watch/providers"]?.results?.[REGION];
    const provHtml = prov ? [["flatrate", "In abbonamento"], ["rent", "Noleggio"], ["buy", "Acquisto"]].filter(([k]) => prov[k]?.length)
      .map(([k, l]) => `<h2 style="font-size:16px">${l}</h2>` + prov[k].map(p => `<span class="prov"><img src="${IMG}w92${p.logo_path}" alt=""><span>${esc(p.provider_name)}</span></span>`).join("")).join("")
      + (prov.link ? `<p class="muted" style="font-size:12px"><a href="${esc(prov.link)}" target="_blank" rel="noopener">Dettagli su TMDB/JustWatch</a></p>` : "") : `<p class="muted">Nessuna piattaforma trovata per l'Italia.</p>`;
    const trailer = (d.videos?.results || []).find(v => v.site === "YouTube" && v.type === "Trailer");
    const cast = (d.credits?.cast || []).slice(0, 12);
    $("#view").innerHTML = `
      <a class="back" href="javascript:history.back()" aria-label="Indietro">‹</a>
      <div class="hero" style="background-image:url(${d.backdrop_path ? IMG + "w780" + d.backdrop_path : poster(d.poster_path, "w500")})"></div>
      <div class="detail">
        <h1>${esc(title)}</h1>
        <div class="muted">${year}${d.runtime ? " · " + d.runtime + " min" : ""}${d.number_of_seasons ? " · " + d.number_of_seasons + " stagioni" : ""}${d.vote_average ? " · ★ " + d.vote_average.toFixed(1) : ""}</div>
        <div style="margin-top:8px">${(d.genres || []).map(g => `<span class="chip">${esc(g.name)}</span>`).join("")}</div>
        <div class="btns">
          <button class="btn ${it?.status === "watchlist" ? "on" : "alt"}" id="bw">${it?.status === "watchlist" ? "✓ In watchlist" : "+ Watchlist"}</button>
          ${type === "movie" ? `<button class="btn ${it?.status === "watched" ? "on" : ""}" id="bs">${it?.status === "watched" ? "✓ Visto" : "Segna visto"}</button>` : ""}
        </div>
        <p>${esc(d.overview || "Trama non disponibile.")}</p>
        ${trailer ? `<p><a href="https://www.youtube.com/watch?v=${esc(trailer.key)}" target="_blank" rel="noopener">▶ Guarda il trailer</a></p>` : ""}
        <h2>Dove guardarlo</h2>${provHtml}
        ${type === "tv" ? `<h2>Episodi</h2><div id="seasons"></div>` : ""}
        ${cast.length ? `<h2>Cast</h2><div>${cast.map(c => `<span class="chip">${esc(c.name)}</span>`).join("")}</div>` : ""}
        ${state.links.length ? `<h2>I tuoi link</h2><div class="list">${state.links.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener"><span class="grow">${esc(l.name)}</span><span class="muted">↗</span></a>`).join("")}</div>` : ""}
      </div>`;
    const ensure = () => (state.items[key] ||= { type, id: +id, title, poster: d.poster_path, status: "", eps: {}, added: Date.now() });
    $("#bw").onclick = () => { const i = ensure(); i.status = i.status === "watchlist" ? "" : "watchlist"; clean(key); save(); detail(type, id); };
    if ($("#bs")) $("#bs").onclick = () => { const i = ensure(); i.status = i.status === "watched" ? "" : "watched"; clean(key); save(); detail(type, id); };
    if (type === "tv") seasons(d, key, ensure);
  } catch (e) { $("#view").innerHTML = errorView(e); bindKey(); }
}
function clean(key) { const i = state.items[key]; if (i && !i.status && !Object.keys(i.eps || {}).length) delete state.items[key]; }

function seasons(d, key, ensure) {
  const box = $("#seasons");
  const list = (d.seasons || []).filter(s => s.season_number > 0);
  box.innerHTML = `<div class="list">${list.map(s => {
    const seen = Object.keys(state.items[key]?.eps || {}).filter(k => k.startsWith("s" + s.season_number + "e")).length;
    return `<button data-s="${s.season_number}"><span class="grow">${esc(s.name)}<div class="sub">${seen}/${s.episode_count} visti</div><div class="bar"><i style="width:${s.episode_count ? seen / s.episode_count * 100 : 0}%"></i></div></span><span class="muted">›</span></button>`;
  }).join("")}</div>`;
  box.querySelectorAll("button").forEach(b => b.onclick = () => openSeason(d, key, ensure, +b.dataset.s));
}
async function openSeason(d, key, ensure, n) {
  const sh = $("#sheet"); sh.hidden = false;
  sh.innerHTML = `<div><div class="spin">Carico…</div></div>`;
  sh.onclick = e => { if (e.target === sh) closeSheet(d, key, ensure); };
  try {
    const s = await tmdb(`/tv/${d.id}/season/${n}`);
    const render = () => {
      const eps = state.items[key]?.eps || {};
      sh.innerHTML = `<div><h2 style="margin-top:0">${esc(s.name || "Stagione " + n)}</h2>
        <div class="btns"><button class="btn alt" id="all">Segna tutta come vista</button></div>
        <div class="list">${s.episodes.map(e => { const k = `s${n}e${e.episode_number}`; return `<button data-k="${k}">
          <span class="check ${eps[k] ? "on" : ""}">${eps[k] ? "✓" : ""}</span>
          <span class="grow">${e.episode_number}. ${esc(e.name)}<div class="sub">${esc(e.air_date || "")}</div></span></button>`; }).join("")}</div>
        <button class="btn alt" id="close" style="width:100%;margin-top:12px">Chiudi</button></div>`;
      sh.querySelectorAll("[data-k]").forEach(b => b.onclick = () => {
        const i = ensure(); if (i.eps[b.dataset.k]) delete i.eps[b.dataset.k]; else i.eps[b.dataset.k] = 1; save(); render();
      });
      $("#all").onclick = () => { const i = ensure(); s.episodes.forEach(e => i.eps[`s${n}e${e.episode_number}`] = 1); save(); render(); };
      $("#close").onclick = () => closeSheet(d, key, ensure);
    };
    render();
  } catch (e) { sh.innerHTML = `<div>${errorView(e)}</div>`; }
}
function closeSheet(d, key, ensure) { $("#sheet").hidden = true; clean(key); save(); seasons(d, key, ensure); }

let libTab = "watchlist";
function library() {
  setTab("library");
  const all = Object.values(state.items);
  const watchedMovies = all.filter(i => i.type === "movie" && i.status === "watched").length;
  const eps = all.reduce((n, i) => n + Object.keys(i.eps || {}).length, 0);
  const shown = all.filter(i => libTab === "watchlist" ? i.status === "watchlist"
    : libTab === "watched" ? (i.status === "watched" || (i.type === "tv" && Object.keys(i.eps || {}).length)) : true)
    .sort((a, b) => b.added - a.added);
  $("#view").innerHTML = `<h1>Libreria</h1>
    <div class="stats"><div><b>${watchedMovies}</b><span>Film visti</span></div><div><b>${eps}</b><span>Episodi visti</span></div><div><b>${all.filter(i => i.status === "watchlist").length}</b><span>Da vedere</span></div></div>
    <div class="seg">${[["watchlist", "Da vedere"], ["watched", "Visti"], ["all", "Tutti"]].map(([k, l]) => `<button data-t="${k}" class="${libTab === k ? "on" : ""}">${l}</button>`).join("")}</div>
    ${shown.length ? `<div class="grid">${shown.map(i => card({ id: i.id, media_type: i.type, title: i.title, poster_path: i.poster })).join("")}</div>` : `<div class="empty">Qui non c'è ancora niente.<br>Aggiungi titoli dalla ricerca.</div>`}`;
  document.querySelectorAll(".seg button").forEach(b => b.onclick = () => { libTab = b.dataset.t; library(); });
}

function settings() {
  setTab("settings");
  $("#view").innerHTML = `<h1>Impostazioni</h1>
    <div class="card"><b>Chiave TMDB</b><input id="k" value="${esc(state.key)}" placeholder="Chiave API o token" autocapitalize="off" autocorrect="off">
      <button class="btn" id="ksave" style="width:100%">Salva</button></div>
    <h2>Link esterni</h2>
    <p class="muted" style="margin-top:-4px">I tuoi segnalibri (il tuo NAS, Jellyfin, Plex, i siti dei servizi che usi). Si aprono in una nuova scheda e compaiono nelle schede dei titoli.</p>
    <div class="card"><input id="ln" placeholder="Nome"><input id="lu" placeholder="https://…" inputmode="url" autocapitalize="off">
      <button class="btn" id="ladd" style="width:100%">Aggiungi link</button></div>
    ${state.links.length ? `<div class="list">${state.links.map((l, i) => `<div><span class="grow">${esc(l.name)}<div class="sub">${esc(l.url)}</div></span><button data-d="${i}" style="color:var(--red)">Elimina</button></div>`).join("")}</div>` : ""}
    <h2>Dati</h2>
    <div class="list"><button id="exp">Esporta backup (JSON)</button><button id="imp">Importa backup</button></div>
    <p class="muted" style="font-size:13px">I tuoi dati restano su questo dispositivo. Questo prodotto usa l'API TMDB ma non è approvato né certificato da TMDB. Non contiene né estrae contenuti video.</p>`;
  bindKey();
  $("#ladd").onclick = () => {
    const name = $("#ln").value.trim(); let url = $("#lu").value.trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    try { new URL(url); } catch { return toast("Indirizzo non valido"); }
    state.links.push({ name: name || new URL(url).hostname, url }); save(); settings();
  };
  document.querySelectorAll("[data-d]").forEach(b => b.onclick = () => { state.links.splice(+b.dataset.d, 1); save(); settings(); });
  $("#exp").onclick = () => {
    const blob = new Blob([JSON.stringify({ items: state.items, links: state.links }, null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "visto-backup.json"; a.click();
  };
  $("#imp").onclick = () => $("#importfile").click();
}
$("#importfile").onchange = async e => {
  try {
    const j = JSON.parse(await e.target.files[0].text());
    if (j.items && typeof j.items === "object") state.items = j.items;
    if (Array.isArray(j.links)) state.links = j.links.filter(l => l && typeof l.url === "string" && /^https?:\/\//i.test(l.url));
    save(); toast("Backup importato"); settings();
  } catch { toast("File non valido"); }
  e.target.value = "";
};

/* ---------- router ---------- */
function route() {
  $("#sheet").hidden = true;
  const h = location.hash.slice(1) || "/", p = h.split("/").filter(Boolean);
  window.scrollTo(0, 0);
  if (!p.length) return home();
  if (p[0] === "search") return search();
  if (p[0] === "library") return library();
  if (p[0] === "settings") return settings();
  if ((p[0] === "movie" || p[0] === "tv") && /^\d+$/.test(p[1] || "")) return detail(p[0], p[1]);
  home();
}
window.addEventListener("hashchange", route);
route();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
