"use strict";

const DEFAULT_CENTER = { lat: -25.7479, lng: 28.2293 }; // Pretoria
const RADIUS_M = 2500;
const OVERPASS = "https://overpass-api.de/api/interpreter";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";

const $ = (id) => document.getElementById(id);
const els = {
  form: $("searchForm"), q: $("q"), locate: $("locateBtn"), status: $("status"),
  results: $("results"), wifi: $("wifi"), outdoor: $("outdoor"),
  savedOnly: $("savedOnly"), sortBy: $("sortBy"), searchArea: $("searchAreaBtn"),
};

const state = {
  map: null, layer: null, center: DEFAULT_CENTER,
  cafes: [], markers: new Map(), activeId: null, saved: loadSaved(),
};

/* ---------- storage ---------- */
function loadSaved() {
  try { return new Set(JSON.parse(localStorage.getItem("cafe-finder-free:saved") || "[]")); }
  catch { return new Set(); }
}
function persistSaved() {
  try { localStorage.setItem("cafe-finder-free:saved", JSON.stringify([...state.saved])); } catch {}
}

/* ---------- setup ---------- */
function init() {
  state.map = L.map("map").setView([state.center.lat, state.center.lng], 15);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(state.map);
  state.layer = L.layerGroup().addTo(state.map);
  state.map.on("dragend", () => { els.searchArea.hidden = false; });
  loadCafes(state.center);
}

/* ---------- data ---------- */
async function loadCafes(center, fit = false) {
  setStatus("Finding cafes…");
  state.center = center;
  const query = `[out:json][timeout:25];
    (node["amenity"="cafe"](around:${RADIUS_M},${center.lat},${center.lng});
     way["amenity"="cafe"](around:${RADIUS_M},${center.lat},${center.lng}););
    out center tags 80;`;
  try {
    const res = await fetch(OVERPASS, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "data=" + encodeURIComponent(query),
    });
    if (!res.ok) throw new Error(`Overpass returned ${res.status}`);
    const data = await res.json();
    state.cafes = data.elements.map(toCafe).filter((c) => c.name);
    els.searchArea.hidden = true;
    render(fit);
  } catch (err) {
    console.error(err);
    setStatus("Couldn't load cafes. The free server may be busy, so wait a few seconds and try again.");
  }
}

function toCafe(el) {
  const t = el.tags || {};
  const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;
  const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
  const address = [street, t["addr:suburb"], t["addr:city"]].filter(Boolean).join(", ");
  return {
    id: `${el.type}/${el.id}`, name: t.name, loc: { lat, lng }, address,
    hours: t.opening_hours || "",
    wifi: ["wlan", "yes", "wifi"].includes((t.internet_access || "").toLowerCase()),
    outdoor: t.outdoor_seating === "yes",
    wheelchair: t.wheelchair === "yes",
    vegan: t["diet:vegan"] === "yes" || t["diet:vegan"] === "only",
    website: safeUrl(t.website || t["contact:website"]),
    phone: t.phone || t["contact:phone"] || "",
    distance: haversine(state.center, { lat, lng }),
  };
}

function safeUrl(u) {
  if (!u) return "";
  try { const url = new URL(/^https?:\/\//i.test(u) ? u : "https://" + u); return url.protocol.startsWith("http") ? url.href : ""; }
  catch { return ""; }
}

async function geocode(q) {
  setStatus(`Looking up ${q}…`);
  try {
    const res = await fetch(`${NOMINATIM}?format=json&limit=1&q=${encodeURIComponent(q)}`);
    const data = await res.json();
    if (!data.length) { setStatus(`Couldn't find "${q}". Try a nearby suburb or a more specific name.`); return; }
    const c = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    state.map.setView([c.lat, c.lng], 15);
    await loadCafes(c);
  } catch (err) {
    console.error(err);
    setStatus("Search failed. Check your connection and try again.");
  }
}

/* ---------- rendering ---------- */
function visibleCafes() {
  let list = state.cafes.slice();
  if (els.wifi.checked) list = list.filter((c) => c.wifi);
  if (els.outdoor.checked) list = list.filter((c) => c.outdoor);
  if (els.savedOnly.checked) list = list.filter((c) => state.saved.has(c.id));
  list.sort(els.sortBy.value === "name"
    ? (a, b) => a.name.localeCompare(b.name)
    : (a, b) => a.distance - b.distance);
  return list;
}

function render() {
  const list = visibleCafes();
  els.results.replaceChildren(...list.map(cardFor));
  drawMarkers(list);
  setStatus(list.length
    ? `${list.length} cafe${list.length === 1 ? "" : "s"} found`
    : "No cafes match these filters. Turn a filter off or search another area.");
}

function cardFor(c) {
  const li = document.createElement("li");
  li.className = "cafe" + (c.id === state.activeId ? " is-active" : "");
  li.dataset.id = c.id;

  const body = document.createElement("div");
  body.append(el("h2", "name", c.name),
              el("p", "meta", `${(c.distance / 1000).toFixed(1)} km away`));
  if (c.address) body.append(el("p", "addr", c.address));
  if (c.hours) body.append(el("p", "hours", "Hours: " + c.hours));

  const tags = document.createElement("div");
  tags.className = "tags";
  if (c.wifi) tags.append(el("span", "tag", "Wi-Fi"));
  if (c.outdoor) tags.append(el("span", "tag", "Outdoor seating"));
  if (c.wheelchair) tags.append(el("span", "tag", "Wheelchair accessible"));
  if (c.vegan) tags.append(el("span", "tag", "Vegan options"));
  if (tags.children.length) body.append(tags);

  const links = document.createElement("div");
  links.className = "links";
  links.append(linkTo("Directions", `https://www.google.com/maps/search/?api=1&query=${c.loc.lat},${c.loc.lng}`));
  if (c.website) links.append(linkTo("Website", c.website));
  body.append(links);

  const save = document.createElement("button");
  save.className = "save"; save.type = "button";
  save.setAttribute("aria-pressed", String(state.saved.has(c.id)));
  save.setAttribute("aria-label", `Save ${c.name}`);
  save.textContent = state.saved.has(c.id) ? "♥" : "♡";
  save.addEventListener("click", (e) => { e.stopPropagation(); toggleSaved(c.id); });

  li.append(body, save);
  li.addEventListener("click", () => select(c.id, false));
  return li;
}

function linkTo(label, href) {
  const a = document.createElement("a");
  a.className = "link"; a.href = href; a.target = "_blank"; a.rel = "noopener";
  a.textContent = label;
  a.addEventListener("click", (e) => e.stopPropagation());
  return a;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  n.className = cls; n.textContent = text;
  return n;
}

function drawMarkers(list) {
  state.layer.clearLayers();
  state.markers.clear();
  list.forEach((c) => {
    const icon = L.divIcon({
      className: "", html: `<div class="pin${c.id === state.activeId ? " is-active" : ""}"></div>`,
      iconSize: [24, 24], iconAnchor: [12, 24],
    });
    const m = L.marker([c.loc.lat, c.loc.lng], { icon, title: c.name, keyboard: true });
    m.on("click", () => select(c.id, true));
    m.addTo(state.layer);
    state.markers.set(c.id, m);
  });
}

function select(id, scroll) {
  state.activeId = id;
  document.querySelectorAll(".cafe").forEach((n) => n.classList.toggle("is-active", n.dataset.id === id));
  state.markers.forEach((m, key) => {
    m.getElement()?.querySelector(".pin")?.classList.toggle("is-active", key === id);
  });
  const c = state.cafes.find((x) => x.id === id);
  if (c) state.map.panTo([c.loc.lat, c.loc.lng]);
  if (scroll) document.querySelector(`.cafe[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function toggleSaved(id) {
  state.saved.has(id) ? state.saved.delete(id) : state.saved.add(id);
  persistSaved();
  render();
}

/* ---------- helpers ---------- */
function setStatus(msg) { els.status.textContent = msg; }

function haversine(a, b) {
  const R = 6371000, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* ---------- events ---------- */
els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = els.q.value.trim();
  if (q) geocode(q);
});

els.locate.addEventListener("click", () => {
  if (!navigator.geolocation) { setStatus("Your browser doesn't support location."); return; }
  setStatus("Getting your location…");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      state.map.setView([c.lat, c.lng], 16);
      loadCafes(c);
    },
    () => setStatus("Location blocked. Allow location access or search an area instead."),
    { enableHighAccuracy: true, timeout: 10000 },
  );
});

els.searchArea.addEventListener("click", () => {
  const c = state.map.getCenter();
  loadCafes({ lat: c.lat, lng: c.lng });
});

[els.wifi, els.outdoor, els.savedOnly, els.sortBy].forEach((n) => n.addEventListener("change", () => render()));

init();
