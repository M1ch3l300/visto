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
const poster = (p, w = "w342") => !p ? "" : /^https?:/.test(p) ? p : IMG + w + p;
/* TVmaze: fonte senza chiave, usata per le serie quando non c'è una chiave TMDB */
async function tvm(path) {
  const url = "https://api.tvmaze.com" + path;
  if (cache.has(url)) return cache.get(url);
  const r = await fetch(url);
  if (!r.ok) throw new Error("http" + r.status);
  const j = await r.json(); cache.set(url, j); return j;
}
const tvmImg = (s, k = "medium") => (s?.image?.[k] || "").replace(/^http:/, "https:");
const tvmCard = s => ({ id: s.id, media_type: "tvm", name: s.name, poster_path: tvmImg(s) });
const strip = h => String(h || "").replace(/<[^>]*>/g, "");
async function loadTvm(id) {
  const s = await tvm(`/shows/${id}?embed[]=episodes&embed[]=cast`);
  const eps = (s._embedded?.episodes || []).filter(e => e.number != null);
  const nums = [...new Set(eps.map(e => e.season))].sort((a, b) => a - b);
  const net = [s.webChannel, s.network].filter(Boolean).map(n => n.name);
  return { id: s.id, name: s.name, first_air_date: s.premiered || "", runtime: s.averageRuntime || s.runtime,
    vote_average: s.rating?.average || 0, poster_path: tvmImg(s, "original"), backdrop_path: "",
    genres: (s.genres || []).map(name => ({ name })), overview: strip(s.summary),
    credits: { cast: (s._embedded?.cast || []).map(c => ({ name: c.person.name })) }, videos: { results: [] },
    number_of_seasons: nums.length, _eps: eps, _net: net, _site: s.officialSite || s.url,
    seasons: nums.map(n => ({ season_number: n, name: "Stagione " + n, episode_count: eps.filter(e => e.season === n).length })) };
}
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

/* ---------- Internet Archive: video gratuiti e liberi da diritti ---------- */
const IA = "https://archive.org";
const SAFE = " AND mediatype:movies AND NOT title:(sex OR nude OR erotic OR porn) AND NOT collection:(adult OR nsfw)";
async function iaSearch(q, rows = 20) {
  const p = new URLSearchParams({ q: q + SAFE, rows, output: "json" });
  p.append("fl[]", "identifier"); p.append("fl[]", "title"); p.append("sort[]", "downloads desc");
  const url = IA + "/advancedsearch.php?" + p;
  if (cache.has(url)) return cache.get(url);
  const r = await fetch(url); if (!r.ok) throw new Error("http" + r.status);
  const j = (await r.json()).response.docs; cache.set(url, j); return j;
}
const one = v => Array.isArray(v) ? v[0] : v;
const iaCard = d => ({ id: d.identifier, media_type: "ia", title: one(d.title), poster_path: IA + "/services/img/" + d.identifier });

/* ---------- Fonti aggiunte dall'utente (come i link di Veezie) ---------- */
const httpOnly = u => /^https?:\/\//i.test(u || "") ? u : "";
async function detectSource(url) {
  const m = url.match(/^https?:\/\/(?:www\.)?archive\.org\/(?:details|download)\/([\w.\-]+)\/?$/i);
  if (m) {
    try { const j = await (await fetch(IA + "/metadata/" + m[1])).json();
      return { kind: j.metadata?.mediatype === "collection" ? "iacol" : "iaitem", id: m[1] }; } catch { return null; }
  }
  try {
    const t = await (await fetch(url)).text();
    if (/^\s*#EXTM3U/.test(t) && /#EXTINF/.test(t) && !/#EXT-X-/.test(t)) return { kind: "m3u" };
    try { const j = JSON.parse(t), a = Array.isArray(j) ? j : j.items;
      if (Array.isArray(a) && a.length && a[0].title && httpOnly(a[0].url)) return { kind: "json" }; } catch {}
  } catch {}
  return null;
}
const srcCache = new Map();
async function loadEntries(l) {
  if (srcCache.has(l.url)) return srcCache.get(l.url);
  let out = [];
  if (l.kind === "iacol") out = (await iaSearch("collection:" + l.id, 30)).map(d => ({ ia: d.identifier, title: one(d.title), poster: IA + "/services/img/" + d.identifier }));
  else if (l.kind === "iaitem") { const j = await (await fetch(IA + "/metadata/" + l.id)).json(); out = [{ ia: l.id, title: one(j.metadata?.title) || l.id, poster: IA + "/services/img/" + l.id }]; }
  else if (l.kind === "m3u") {
    const lines = (await (await fetch(l.url)).text()).split(/\r?\n/); let cur = null;
    for (const ln of lines) {
      if (ln.startsWith("#EXTINF")) cur = { title: (ln.split(",").slice(1).join(",") || "Senza titolo").trim(), poster: httpOnly((ln.match(/tvg-logo="([^"]*)"/) || [])[1]) };
      else if (cur && ln.trim() && !ln.startsWith("#")) { const u = httpOnly(ln.trim()); if (u) out.push({ ...cur, url: u }); cur = null; }
    }
  } else if (l.kind === "json") {
    const j = JSON.parse(await (await fetch(l.url)).text());
    out = (Array.isArray(j) ? j : j.items).filter(x => x && x.title && httpOnly(x.url)).map(x => ({ title: String(x.title), url: x.url, poster: httpOnly(x.poster || x.image), desc: x.description ? String(x.description) : "" }));
  }
  srcCache.set(l.url, out); return out;
}
const srcCards = (i, list) => list.map((e, n) => e.ia ? card(iaCard({ identifier: e.ia, title: e.title }))
  : card({ id: i + "/" + n, media_type: "play", title: e.title, poster_path: e.poster }));

async function playView(i, n) {
  setTab("free");
  $("#view").innerHTML = `<div class="spin">Carico…</div>`;
  try {
    const l = state.links[i]; if (!l?.kind) throw new Error("fonte non trovata");
    const e = (await loadEntries(l))[n]; if (!e || !e.url) throw new Error("video non trovato");
    $("#view").innerHTML = `<a class="back" href="javascript:history.back()" aria-label="Indietro">‹</a><div style="padding-top:44px">
      <video id="pl" controls playsinline preload="metadata" ${e.poster ? `poster="${esc(e.poster)}"` : ""} style="width:100%;border-radius:12px;background:#000;aspect-ratio:16/9"></video>
      <h1 style="font-size:26px;margin-top:14px">${esc(e.title)}</h1>
      ${e.desc ? `<p>${esc(e.desc.slice(0, 700))}</p>` : ""}
      <p class="muted" style="font-size:12px">Fonte: ${esc(l.name)}</p></div>`;
    const v = $("#pl");
    if (/\.m3u8(\?|$)/i.test(e.url) && !v.canPlayType("application/vnd.apple.mpegurl")) {
      await new Promise((ok, no) => { const sc = document.createElement("script"); sc.src = "https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.17/hls.min.js"; sc.onload = ok; sc.onerror = no; document.head.append(sc); });
      if (window.Hls && Hls.isSupported()) { const h = new Hls(); h.loadSource(e.url); h.attachMedia(v); } else v.src = e.url;
    } else v.src = e.url;
  } catch (e) { $("#view").innerHTML = `<div class="empty">Non riesco a riprodurre questo video (${esc(e.message)}).</div>`; }
}

function free(q = "") {
  setTab("free");
  $("#view").innerHTML = `<h1>Gratis</h1><p class="muted" style="margin-top:-8px">Film e cartoni liberi da diritti, da Internet Archive.</p>
    <div class="search"><input id="q" type="search" placeholder="Cerca film e cartoni gratuiti" value="${esc(q)}"></div><div id="res"></div>`;
  const res = $("#res");
  const rows = [["Classici del cinema", "collection:feature_films"], ["Cartoni animati", "collection:animationandcartoons"], ["Film in italiano", "collection:feature_films AND language:(Italian OR ita)"]];
  const run = async () => {
    const v = $("#q").value.trim().replace(/["\\()]/g, " ");
    if (v.length >= 2) {
      res.innerHTML = `<div class="spin">Cerco…</div>`;
      try { const l = await iaSearch(`title:(${v})`, 30);
        res.innerHTML = l.length ? `<div class="grid">${l.map(d => card(iaCard(d))).join("")}</div>` : `<div class="empty">Nessun risultato</div>`;
      } catch (e) { res.innerHTML = errorView(e); }
      return;
    }
    const srcs = state.links.map((l, i) => [l, i]).filter(([l]) => l.kind);
    res.innerHTML = srcs.map(([l, i]) => `<h2>${esc(l.name)}</h2><div class="row" id="s${i}"><div class="spin">Carico…</div></div>`).join("") + rows.map(([t], i) => `<h2>${t}</h2><div class="row" id="r${i}"><div class="spin">Carico…</div></div>`).join("");
    srcs.forEach(async ([l, i]) => {
      const el = () => $("#s" + i);
      try { const list = await loadEntries(l); if (el()) el().innerHTML = list.length ? srcCards(i, list).join("") : `<div class="muted">Nessun video in questa fonte.</div>`; }
      catch { if (el()) el().innerHTML = `<div class="muted">Non riesco a leggere questa fonte (il sito potrebbe non consentire l'accesso dal browser).</div>`; }
    });
    rows.forEach(async ([, q], i) => {
      try { const l = await iaSearch(q, 20); const el = $("#r" + i); if (el) el.innerHTML = l.map(d => card(iaCard(d))).join(""); }
      catch { const el = $("#r" + i); if (el) el.innerHTML = `<div class="muted">Non riesco a caricare questa sezione.</div>`; }
    });
  };
  $("#q").oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(run, 400); };
  run();
}

async function iaDetail(id) {
  setTab("free");
  $("#view").innerHTML = `<div class="spin">Carico…</div>`;
  try {
    const m = await (await fetch(IA + "/metadata/" + encodeURIComponent(id))).json();
    const meta = m.metadata || {};
    const title = one(meta.title) || id, key = "ia:" + id, it = state.items[key];
    const mp4 = (m.files || []).filter(f => /\.mp4$/i.test(f.name));
    const byBig = [...mp4].sort((x, y) => (+y.size || 0) - (+x.size || 0));
    const f = byBig.find(x => (+x.size || 0) < 400e6 && !/sample|trailer/i.test(x.name)) || byBig[byBig.length - 1];
    const src = f ? `${IA}/download/${encodeURIComponent(id)}/${f.name.split("/").map(encodeURIComponent).join("/")}` : "";
    const posterUrl = IA + "/services/img/" + encodeURIComponent(id);
    const desc = strip(one(meta.description)).slice(0, 700);
    $("#view").innerHTML = `
      <a class="back" href="javascript:history.back()" aria-label="Indietro">‹</a>
      <div style="padding-top:44px">
      ${src ? `<video id="pl" controls playsinline preload="metadata" poster="${posterUrl}" src="${esc(src)}" style="width:100%;border-radius:12px;background:#000;aspect-ratio:16/9"></video>`
        : `<div class="card">Qui non c'è un video riproducibile.<br><a href="${IA}/details/${encodeURIComponent(id)}" target="_blank" rel="noopener">Apri su Internet Archive ↗</a></div>`}
      <h1 style="font-size:26px;margin-top:14px">${esc(title)}</h1>
      <div class="muted">${esc(one(meta.year) || (one(meta.date) || "").slice(0, 4))}${meta.language ? " · " + esc(one(meta.language)) : ""}</div>
      <div class="btns"><button class="btn ${it?.status === "watchlist" ? "on" : "alt"}" id="bw">${it?.status === "watchlist" ? "✓ In watchlist" : "+ Watchlist"}</button></div>
      <p>${esc(desc) || "<span class='muted'>Descrizione non disponibile.</span>"}</p>
      <p class="muted" style="font-size:12px">Fonte: <a href="${IA}/details/${encodeURIComponent(id)}" target="_blank" rel="noopener">Internet Archive</a>${meta.licenseurl ? ` · <a href="${esc(meta.licenseurl)}" target="_blank" rel="noopener">licenza</a>` : ""}</p></div>`;
    const ensure = () => (state.items[key] ||= { type: "ia", id, title, poster: posterUrl, status: "", eps: {}, added: Date.now() });
    $("#bw").onclick = () => { const i = ensure(); i.status = i.status === "watchlist" ? "" : "watchlist"; clean(key); save(); iaDetail(id); };
    const v = $("#pl");
    if (v) {
      let last = 0; const pos = store.get("pos." + id, 0);
      v.addEventListener("loadedmetadata", () => { if (pos > 5 && pos < v.duration - 10) v.currentTime = pos; });
      v.addEventListener("timeupdate", () => { if (Date.now() - last > 4000) { last = Date.now(); store.set("pos." + id, v.currentTime); } });
      v.addEventListener("ended", () => { store.set("pos." + id, 0); const i = ensure(); i.status = "watched"; save(); });
    }
  } catch (e) { $("#view").innerHTML = errorView(e); }
}

/* ---------- views ---------- */
async function homeTvm() {
  const day = new Date().toISOString().slice(0, 10);
  const [web, us] = await Promise.all([tvm("/schedule/web?date=" + day), tvm("/schedule?country=US&date=" + day)]);
  const uniq = arr => { const m = new Map(); arr.forEach(s => s && s.image && !m.has(s.id) && m.set(s.id, s)); return [...m.values()].sort((a, b) => (b.weight || 0) - (a.weight || 0)).slice(0, 24); };
  const w = uniq(web.map(e => e._embedded?.show)), t = uniq(us.map(e => e.show || e._embedded?.show));
  const cont = Object.values(state.items).filter(i => i.type === "tvm" && i.status !== "watched" && Object.keys(i.eps || {}).length);
  $("#view").innerHTML = `<h1>Home</h1>
    ${cont.length ? `<h2>Continua a guardare</h2><div class="row">${cont.map(i => card({ id: i.id, media_type: i.type, title: i.title, poster_path: i.poster })).join("")}</div>` : ""}
    <h2>Nuovi episodi in streaming</h2><div class="row">${w.map(s => card(tvmCard(s))).join("")}</div>
    <h2>In TV oggi</h2><div class="row">${t.map(s => card(tvmCard(s))).join("")}</div>
    <p class="muted" style="font-size:12px">Serie TV da TVmaze. Per film e dati in italiano aggiungi una chiave TMDB nelle Impostazioni.</p>`;
}
async function home() {
  setTab("home");
  $("#view").innerHTML = `<h1>Home</h1><div class="spin">Carico…</div>`;
  try {
    if (!state.key) return await homeTvm();
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
      const list = state.key ? (await tmdb("/search/multi", { query: v })).results.filter(x => x.media_type !== "person")
        : (await tvm("/search/shows?q=" + encodeURIComponent(v))).map(r => tvmCard(r.show));
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
    const d = type === "tvm" ? await loadTvm(id) : await tmdb(`/${type}/${id}`, { append_to_response: "credits,watch/providers,videos" });
    const key = type + ":" + id, it = state.items[key];
    const title = d.title || d.name, year = (d.release_date || d.first_air_date || "").slice(0, 4);
    const prov = d["watch/providers"]?.results?.[REGION];
    const provHtml = type === "tvm" ? (d._net.length ? `<p>${d._net.map(n => `<span class="chip">${esc(n)}</span>`).join("")}</p>` : `<p class="muted">Piattaforma non indicata.</p>`)
      + (d._site ? `<p style="font-size:14px"><a href="${esc(d._site)}" target="_blank" rel="noopener">Sito ufficiale ↗</a></p>` : "")
      : prov ? [["flatrate", "In abbonamento"], ["rent", "Noleggio"], ["buy", "Acquisto"]].filter(([k]) => prov[k]?.length)
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
        ${type !== "movie" ? `<h2>Episodi</h2><div id="seasons"></div>` : ""}
        ${cast.length ? `<h2>Cast</h2><div>${cast.map(c => `<span class="chip">${esc(c.name)}</span>`).join("")}</div>` : ""}
        ${state.links.length ? `<h2>I tuoi link</h2><div class="list">${state.links.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener"><span class="grow">${esc(l.name)}</span><span class="muted">↗</span></a>`).join("")}</div>` : ""}
      </div>`;
    const ensure = () => (state.items[key] ||= { type, id: +id, title, poster: d.poster_path, status: "", eps: {}, added: Date.now() });
    $("#bw").onclick = () => { const i = ensure(); i.status = i.status === "watchlist" ? "" : "watchlist"; clean(key); save(); detail(type, id); };
    if ($("#bs")) $("#bs").onclick = () => { const i = ensure(); i.status = i.status === "watched" ? "" : "watched"; clean(key); save(); detail(type, id); };
    if (type !== "movie") seasons(d, key, ensure);
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
    const s = d._eps ? { name: "Stagione " + n, episodes: d._eps.filter(e => e.season === n).map(e => ({ episode_number: e.number, name: e.name, air_date: e.airdate })) }
      : await tmdb(`/tv/${d.id}/season/${n}`);
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
    : libTab === "watched" ? (i.status === "watched" || ((i.type === "tv" || i.type === "tvm") && Object.keys(i.eps || {}).length)) : true)
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
    <div class="card"><b>Chiave TMDB (facoltativa)</b><p class="muted" style="margin:4px 0;font-size:13px">Senza chiave l'app usa TVmaze per le serie. Con la chiave aggiungi anche i film, le trame in italiano e le piattaforme in Italia.</p><input id="k" value="${esc(state.key)}" placeholder="Chiave API o token" autocapitalize="off" autocorrect="off">
      <button class="btn" id="ksave" style="width:100%">Salva</button></div>
    <h2>Link esterni</h2>
    <p class="muted" style="margin-top:-4px">I tuoi segnalibri (il tuo NAS, Jellyfin, Plex, i siti dei servizi che usi). Se è una collezione di Internet Archive, una lista M3U o un catalogo JSON, i suoi video compaiono da soli in Gratis. Gli altri link restano segnalibri.</p>
    <div class="card"><input id="ln" placeholder="Nome"><input id="lu" placeholder="https://…" inputmode="url" autocapitalize="off">
      <button class="btn" id="ladd" style="width:100%">Aggiungi link</button></div>
    ${state.links.length ? `<div class="list">${state.links.map((l, i) => `<div><span class="grow">${esc(l.name)}<div class="sub">${l.kind ? "Fonte video · " : ""}${esc(l.url)}</div></span><button data-d="${i}" style="color:var(--red)">Elimina</button></div>`).join("")}</div>` : ""}
    <h2>Dati</h2>
    <div class="list"><button id="exp">Esporta backup (JSON)</button><button id="imp">Importa backup</button></div>
    <p class="muted" style="font-size:13px">I tuoi dati restano su questo dispositivo. Questo prodotto usa l'API TMDB ma non è approvato né certificato da TMDB. Non contiene né estrae contenuti video.</p>`;
  bindKey();
  $("#ladd").onclick = async () => {
    const name = $("#ln").value.trim(); let url = $("#lu").value.trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    try { new URL(url); } catch { return toast("Indirizzo non valido"); }
    $("#ladd").textContent = "Controllo…";
    const src = await detectSource(url);
    state.links.push({ name: name || new URL(url).hostname, url, ...(src || {}) }); save();
    toast(src ? "Fonte aggiunta: i video sono in Gratis" : "Salvato come segnalibro (non è un catalogo che so leggere)");
    settings();
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
  if (p[0] === "free") return free();
  if (p[0] === "play" && /^\d+$/.test(p[1] || "") && /^\d+$/.test(p[2] || "")) return playView(+p[1], +p[2]);
  if (p[0] === "ia" && /^[\w.\-]+$/.test(p[1] || "")) return iaDetail(p[1]);
  if (p[0] === "library") return library();
  if (p[0] === "settings") return settings();
  if ((p[0] === "movie" || p[0] === "tv" || p[0] === "tvm") && /^\d+$/.test(p[1] || "")) return detail(p[0], p[1]);
  home();
}
window.addEventListener("hashchange", route);
route();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
