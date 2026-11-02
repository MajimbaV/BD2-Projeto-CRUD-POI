// ============================================================================
// script.js: Controle da Aplicação Web Espacial (PostGIS + Leaflet + Nominatim)
// ============================================================================

const apiBase = "http://localhost:3000/api";
const poiApiUrl = `${apiBase}/poiuser`;
const escolasApiUrl = `${apiBase}/escolas`;

// Coordenadas padrão da Paraíba (João Pessoa, PB)
const defaultLocation = { lat: -7.11532, lng: -34.861 };
const favoritesKey = "pontos-por-perto-favorites";

// Estado da Aplicação
let currentView = "poi"; // "poi" (CRUD) ou "schools" (Escolas PostGIS)
let points = [];
let schools = [];
let userLocation = { ...defaultLocation };
let hasUserLocation = false;
let activeFilter = "all";
let selectedItemId = null;
let editingPointId = null;
let map = null;
let tempFormMarker = null;

const markers = new Map();
const schoolMarkers = new Map();
let favorites = loadFavorites();

// Elementos do DOM
const list = document.getElementById("poi-list");
const count = document.getElementById("result-count");
const searchInput = document.getElementById("search");
const categorySelect = document.getElementById("category");
const radiusSelect = document.getElementById("radius");
const sortSelect = document.getElementById("sort");
const statusMessage = document.getElementById("status-message");
const pointForm = document.getElementById("point-form");
const savePointButton = document.getElementById("save-point-button");
const resultsTitle = document.getElementById("results-title");
const tabPoi = document.getElementById("tab-poi");
const tabSchools = document.getElementById("tab-schools");
const crudSection = document.getElementById("crud-section");
const categoryFilterWrap = document.getElementById("category-filter-wrap");
const searchAddressButton = document.getElementById("search-address-button");
const pointAddressInput = document.getElementById("point-address");

// ============================================================================
// 1. Funções de Apoio e Armazenamento Local
// ============================================================================

function loadFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem(favoritesKey) || "[]");
    return new Set(Array.isArray(saved) ? saved.map(String) : []);
  } catch (error) {
    console.warn("Não foi possível carregar os favoritos.", error);
    return new Set();
  }
}

function escapeHtml(value) {
  if (value == null) return "";
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function formatDistance(distance) {
  if (distance == null || Number.isNaN(distance)) return "";
  if (distance < 1000) return `${Math.round(distance)} m`;
  return `${(distance / 1000).toFixed(1).replace(".", ",")} km`;
}

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", isError);
}

// ============================================================================
// 2. Geocodificação com Nominatim (OpenStreetMap)
// ============================================================================

async function buscarEnderecoNominatim(query) {
  if (!query || query.trim().length < 3) {
    setStatus("Digite um endereço mais completo para buscar.", true);
    return;
  }

  setStatus("Buscando coordenadas no Nominatim...");
  searchAddressButton.disabled = true;

  try {
    // Foca a busca prioritariamente na Paraíba
    const consulta = `${query.trim()}, Paraíba, Brasil`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(consulta)}&limit=1`;

    const response = await fetch(url, {
      headers: { "Accept-Language": "pt-BR" }
    });

    if (!response.ok) throw new Error("Erro na resposta do serviço de geocodificação.");

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      // Tenta uma busca sem o sufixo restritivo
      const fallbackUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
      const fallbackResp = await fetch(fallbackUrl);
      const fallbackData = await fallbackResp.json();
      if (!Array.isArray(fallbackData) || fallbackData.length === 0) {
        throw new Error("Endereço não localizado pelo Nominatim.");
      }
      data.push(fallbackData[0]);
    }

    const { lat, lon, display_name } = data[0];
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);

    document.getElementById("point-latitude").value = latitude.toFixed(6);
    document.getElementById("point-longitude").value = longitude.toFixed(6);
    if (!pointAddressInput.value) pointAddressInput.value = display_name;

    posicionarMarcadorFormulario(latitude, longitude, "Localização encontrada pelo Nominatim");
    map.setView([latitude, longitude], 16);
    setStatus("Coordenadas obtidas com sucesso pelo Nominatim!");
  } catch (error) {
    console.error("Erro no Nominatim:", error);
    setStatus(`Falha na geocodificação: ${error.message}`, true);
  } finally {
    searchAddressButton.disabled = false;
  }
}

function posicionarMarcadorFormulario(lat, lng, popupText = "Local do cadastro") {
  if (!map) return;
  if (tempFormMarker) {
    tempFormMarker.setLatLng([lat, lng]);
  } else {
    tempFormMarker = L.marker([lat, lng], { draggable: true }).addTo(map);
    tempFormMarker.on("dragend", () => {
      const pos = tempFormMarker.getLatLng();
      document.getElementById("point-latitude").value = pos.lat.toFixed(6);
      document.getElementById("point-longitude").value = pos.lng.toFixed(6);
    });
  }
  tempFormMarker.bindPopup(popupText).openPopup();
}

// ============================================================================
// 3. Integração com a API Backend (POIs e Escolas PostGIS)
// ============================================================================

function normalizePoint(point) {
  const coordinates = point.localizacao?.coordinates;
  const id = point.id == null ? "" : String(point.id);
  const lat = Number(coordinates?.[1]);
  const lng = Number(coordinates?.[0]);

  if (!id || !point.nome || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("Ponto com dados inválidos.");
  }

  return {
    id,
    name: String(point.nome),
    description: point.descricao ? String(point.descricao) : "",
    category: point.categoria ? String(point.categoria) : "Outro",
    address: point.endereco ? String(point.endereco) : "Endereço não informado",
    lat,
    lng
  };
}

async function loadPoints() {
  setStatus("Carregando pontos de interesse...");
  try {
    const response = await fetch(poiApiUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    points = data.map(normalizePoint);
    document.getElementById("map-note").textContent = `${points.length} pontos cadastrados`;
    setStatus(`${points.length} pontos de interesse carregados.`);
    if (currentView === "poi") render();
    return true;
  } catch (error) {
    console.error("Erro ao carregar pontos:", error);
    points = [];
    setStatus(`Falha ao conectar na API: ${error.message}`, true);
    if (currentView === "poi") render();
    return false;
  }
}

async function loadSchoolsProximas(lat, lng, raioKm = 2) {
  const raioMetros = Number(raioKm) * 1000;
  setStatus(`Consultando PostGIS num raio de ${raioKm} km...`);

  try {
    const url = `${escolasApiUrl}/proximas?latitude=${lat}&longitude=${lng}&raio=${raioMetros}&limite=50`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    schools = await response.json();

    document.getElementById("map-note").textContent = `${schools.length} escolas num raio de ${raioKm} km`;
    setStatus(`${schools.length} escolas encontradas no raio selecionado.`);
    render();
  } catch (error) {
    console.error("Erro ao carregar escolas próximas:", error);
    schools = [];
    setStatus(`Erro ao buscar escolas: ${error.message}`, true);
    render();
  }
}

async function loadSchoolsBbox() {
  if (currentView !== "schools" || !map) return;
  const bounds = map.getBounds();

  try {
    const url = `${escolasApiUrl}/bbox?minLon=${bounds.getWest()}&minLat=${bounds.getSouth()}&maxLon=${bounds.getEast()}&maxLat=${bounds.getNorth()}&limite=80`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    schools = await response.json();

    document.getElementById("map-note").textContent = `${schools.length} escolas na área visível`;
    render();
  } catch (error) {
    console.error("Erro ao carregar escolas por BBOX:", error);
  }
}

// ============================================================================
// 4. Renderização da Interface e do Mapa
// ============================================================================

function render() {
  if (currentView === "poi") {
    renderPoiList();
  } else {
    renderSchoolsList();
  }
}

function renderPoiList() {
  resultsTitle.textContent = "Meus Pontos de Interesse";
  categoryFilterWrap.hidden = false;

  const query = searchInput.value.trim().toLocaleLowerCase("pt-BR");
  const category = categorySelect.value;

  const visiblePoints = points.filter((point) => {
    const searchable = `${point.name} ${point.description} ${point.address} ${point.category}`.toLocaleLowerCase("pt-BR");
    const matchesQuery = !query || searchable.includes(query);
    const matchesCategory = category === "all" || point.category === category;
    const matchesFilter = activeFilter === "all" || favorites.has(point.id);
    return matchesQuery && matchesCategory && matchesFilter;
  });

  count.textContent = `${visiblePoints.length} ${visiblePoints.length === 1 ? "local" : "locais"}`;

  if (visiblePoints.length === 0) {
    list.innerHTML = '<div class="empty-state"><strong>Nenhum ponto encontrado</strong>Clique em "+ Novo ponto" para cadastrar um local.</div>';
  } else {
    list.innerHTML = visiblePoints.map((point) => {
      const isFavorite = favorites.has(point.id);
      return `
        <article class="school-card${selectedItemId === point.id ? " selected" : ""}" data-point-id="${escapeHtml(point.id)}">
          <div class="school-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12Z"/><circle cx="12" cy="9" r="2.4"/></svg>
          </div>
          <div class="school-main">
            <h3 class="school-name">${escapeHtml(point.name)}</h3>
            <p class="school-address">${escapeHtml(point.address)}${point.description ? ` · ${escapeHtml(point.description)}` : ""}</p>
            <div class="school-meta">
              <span class="tag">${escapeHtml(point.category)}</span>
            </div>
            <button class="find-schools-button" type="button" data-find-schools-lat="${point.lat}" data-find-schools-lng="${point.lng}" data-find-schools-name="${escapeHtml(point.name)}">
              🏫 Ver melhores escolas perto daqui
            </button>
          </div>
          <div class="card-actions">
            <button class="card-action-button favorite${isFavorite ? " active" : ""}" type="button" data-favorite-id="${escapeHtml(point.id)}" title="${isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}">
              <svg viewBox="0 0 24 24" fill="${isFavorite ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg>
            </button>
            <button class="card-action-button edit-action" type="button" data-edit-id="${escapeHtml(point.id)}" title="Editar ponto">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
            </button>
            <button class="card-action-button delete-action" type="button" data-delete-id="${escapeHtml(point.id)}" title="Excluir ponto">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>
            </button>
          </div>
        </article>
      `;
    }).join("");
  }

  renderPoiMarkers(visiblePoints);
}

function renderSchoolsList() {
  resultsTitle.textContent = "Melhores Escolas (Ranking PostGIS)";
  categoryFilterWrap.hidden = true;

  const query = searchInput.value.trim().toLocaleLowerCase("pt-BR");

  let filtered = schools.filter((school) => {
    const searchable = `${school.no_escola} ${school.municipio} ${school.bairro || ""}`.toLocaleLowerCase("pt-BR");
    return !query || searchable.includes(query);
  });

  if (sortSelect.value === "score") {
    filtered.sort((a, b) => b.score_infraestrutura - a.score_infraestrutura);
  } else if (sortSelect.value === "name") {
    filtered.sort((a, b) => a.no_escola.localeCompare(b.no_escola, "pt-BR"));
  }

  count.textContent = `${filtered.length} ${filtered.length === 1 ? "escola" : "escolas"}`;

  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty-state"><strong>Nenhuma escola na área selecionada</strong>Mova o mapa ou amplie a distância máxima na busca.</div>';
  } else {
    list.innerHTML = filtered.map((school) => {
      const score = Number(school.score_infraestrutura || 0);
      const scoreClass = score >= 14 ? "high" : (score >= 8 ? "medium" : "low");
      const distancia = school.distancia_metros ? formatDistance(Number(school.distancia_metros)) : null;

      const infra = [];
      if (school.in_laboratorio_informatica) infra.push("💻 Lab Info");
      if (school.in_biblioteca) infra.push("📚 Biblioteca");
      if (school.in_banheiro_pne) infra.push("♿ PNE");
      if (school.in_banda_larga || school.in_internet) infra.push("🌐 Internet");
      if (school.in_quadra_esportes) infra.push("⚽ Quadra");

      return `
        <article class="school-card${selectedItemId === school.co_escola ? " selected" : ""}" data-school-id="${school.co_escola}">
          <div class="school-icon" style="background: #2563eb;" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
          </div>
          <div class="school-main">
            <h3 class="school-name">${escapeHtml(school.no_escola)}</h3>
            <p class="school-address">${escapeHtml(school.municipio)}${school.bairro ? ` · ${escapeHtml(school.bairro)}` : ""}</p>
            <div class="school-meta">
              <span class="score-badge ${scoreClass}">★ ${score}/18 pts</span>
              ${distancia ? `<span class="distance">📍 ${distancia}</span>` : ""}
            </div>
            <div class="infra-chips">
              ${infra.map(item => `<span class="infra-chip">${item}</span>`).join("")}
            </div>
          </div>
        </article>
      `;
    }).join("");
  }

  renderSchoolMarkers(filtered);
}

function renderPoiMarkers(visiblePoints) {
  if (!map) return;
  markers.forEach((m) => m.remove());
  markers.clear();
  schoolMarkers.forEach((m) => m.remove());
  schoolMarkers.clear();

  visiblePoints.forEach((point) => {
    const popup = `
      <strong>${escapeHtml(point.name)}</strong><br>
      <small>${escapeHtml(point.category)} · ${escapeHtml(point.address)}</small><br><br>
      <button class="find-schools-button" onclick="window.buscarEscolasPertoDe(${point.lat}, ${point.lng}, '${escapeHtml(point.name)}')">
        🏫 Ver escolas perto daqui
      </button>
    `;
    const marker = L.marker([point.lat, point.lng]).addTo(map).bindPopup(popup);
    marker.on("click", () => selectPoint(point.id, false));
    markers.set(point.id, marker);
  });
}

function renderSchoolMarkers(visibleSchools) {
  if (!map) return;
  markers.forEach((m) => m.remove());
  markers.clear();
  schoolMarkers.forEach((m) => m.remove());
  schoolMarkers.clear();

  visibleSchools.forEach((school) => {
    const lat = Number(school.latitude);
    const lng = Number(school.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const popup = `
      <strong>${escapeHtml(school.no_escola)}</strong><br>
      <span>${escapeHtml(school.municipio)} - PB</span><br>
      <strong>Score: ${school.score_infraestrutura}/18 pts</strong><br>
      ${school.distancia_metros ? `<small>Distância: ${formatDistance(Number(school.distancia_metros))}</small>` : ""}
    `;

    const marker = L.circleMarker([lat, lng], {
      radius: 8,
      fillColor: school.score_infraestrutura >= 14 ? "#10b981" : (school.score_infraestrutura >= 8 ? "#f59e0b" : "#ef4444"),
      color: "#fff",
      weight: 2,
      opacity: 1,
      fillOpacity: 0.9
    }).addTo(map).bindPopup(popup);

    marker.on("click", () => {
      selectedItemId = school.co_escola;
      render();
    });

    schoolMarkers.set(school.co_escola, marker);
  });
}

window.buscarEscolasPertoDe = function(lat, lng, nome) {
  currentView = "schools";
  tabSchools.classList.add("active");
  tabPoi.classList.remove("active");
  crudSection.hidden = true;
  userLocation = { lat, lng };
  document.getElementById("map-note").textContent = `Escolas próximas a: ${nome}`;
  map.setView([lat, lng], 14);
  loadSchoolsProximas(lat, lng, radiusSelect.value === "all" ? 5 : Number(radiusSelect.value));
};

function selectPoint(id, openPopup = true) {
  selectedItemId = id;
  render();
  const marker = markers.get(id);
  const point = points.find((item) => item.id === id);
  if (marker && point && map) {
    map.setView([point.lat, point.lng], Math.max(map.getZoom(), 15));
    if (openPopup) marker.openPopup();
  }
}

// ============================================================================
// 5. Inicialização do Mapa Leaflet
// ============================================================================

function initMap() {
  if (!window.L) return;

  map = L.map("map", { scrollWheelZoom: false }).setView([userLocation.lat, userLocation.lng], 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  // Clique no mapa para posicionar marcador no formulário de cadastro
  map.on("click", (e) => {
    if (!pointForm.hidden) {
      const { lat, lng } = e.latlng;
      document.getElementById("point-latitude").value = lat.toFixed(6);
      document.getElementById("point-longitude").value = lng.toFixed(6);
      posicionarMarcadorFormulario(lat, lng, "Ponto selecionado no mapa");
      setStatus("Coordenadas atualizadas pelo clique no mapa.");
    }
  });

  // Requisito BBOX: Carrega escolas conforme o usuário move o mapa
  map.on("moveend", () => {
    if (currentView === "schools" && radiusSelect.value === "all") {
      loadSchoolsBbox();
    }
  });
}

// ============================================================================
// 6. Formulário de CRUD de Ponto de Interesse
// ============================================================================

function openPointForm(point = null) {
  editingPointId = point ? point.id : null;
  document.getElementById("form-title").textContent = point ? "Editar ponto" : "Cadastrar ponto";
  savePointButton.textContent = point ? "Salvar alterações" : "Salvar ponto";
  document.getElementById("point-name").value = point?.name || "";
  document.getElementById("point-description").value = point?.description || "";
  document.getElementById("point-category").value = point?.category || "";
  document.getElementById("point-address").value = point?.address === "Endereço não informado" ? "" : (point?.address || "");
  
  const lat = point?.lat ?? userLocation.lat;
  const lng = point?.lng ?? userLocation.lng;
  document.getElementById("point-latitude").value = lat.toFixed(6);
  document.getElementById("point-longitude").value = lng.toFixed(6);

  pointForm.hidden = false;
  posicionarMarcadorFormulario(lat, lng, point?.name || "Local de cadastro");
  document.getElementById("point-name").focus();
  pointForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closePointForm() {
  pointForm.reset();
  pointForm.hidden = true;
  editingPointId = null;
  if (tempFormMarker) {
    tempFormMarker.remove();
    tempFormMarker = null;
  }
}

pointForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const latitude = Number(document.getElementById("point-latitude").value);
  const longitude = Number(document.getElementById("point-longitude").value);

  const payload = {
    nome: document.getElementById("point-name").value.trim(),
    descricao: document.getElementById("point-description").value.trim(),
    categoria: document.getElementById("point-category").value || null,
    endereco: document.getElementById("point-address").value.trim(),
    latitude,
    longitude
  };

  const isEditing = editingPointId !== null;
  const url = isEditing ? `${poiApiUrl}/${encodeURIComponent(editingPointId)}` : poiApiUrl;
  savePointButton.disabled = true;

  try {
    const response = await fetch(url, {
      method: isEditing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    closePointForm();
    await loadPoints();
    setStatus(isEditing ? "Ponto atualizado com sucesso!" : "Ponto cadastrado com sucesso!");
  } catch (error) {
    console.error("Erro ao salvar:", error);
    setStatus(`Erro ao salvar ponto: ${error.message}`, true);
  } finally {
    savePointButton.disabled = false;
  }
});

// Eventos de Botões e Interações
searchAddressButton.addEventListener("click", () => {
  buscarEnderecoNominatim(pointAddressInput.value);
});

pointAddressInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    buscarEnderecoNominatim(pointAddressInput.value);
  }
});

document.getElementById("new-point-button").addEventListener("click", () => openPointForm());
document.getElementById("cancel-form-button").addEventListener("click", closePointForm);

// Alternância entre Visão de POI e Escolas
tabPoi.addEventListener("click", () => {
  currentView = "poi";
  tabPoi.classList.add("active");
  tabSchools.classList.remove("active");
  crudSection.hidden = false;
  render();
});

tabSchools.addEventListener("click", () => {
  currentView = "schools";
  tabSchools.classList.add("active");
  tabPoi.classList.remove("active");
  crudSection.hidden = true;
  if (radiusSelect.value !== "all") {
    loadSchoolsProximas(userLocation.lat, userLocation.lng, Number(radiusSelect.value));
  } else {
    loadSchoolsBbox();
  }
});

radiusSelect.addEventListener("change", () => {
  if (currentView === "schools") {
    if (radiusSelect.value !== "all") {
      loadSchoolsProximas(userLocation.lat, userLocation.lng, Number(radiusSelect.value));
    } else {
      loadSchoolsBbox();
    }
  } else {
    render();
  }
});

[searchInput, categorySelect, sortSelect].forEach((el) => {
  el.addEventListener(el === searchInput ? "input" : "change", render);
});

// Deleção e Edição na Lista de POIs
list.addEventListener("click", (event) => {
  const findButton = event.target.closest("[data-find-schools-lat]");
  if (findButton) {
    const lat = Number(findButton.dataset.findSchoolsLat);
    const lng = Number(findButton.dataset.findSchoolsLng);
    const nome = findButton.dataset.findSchoolsName;
    window.buscarEscolasPertoDe(lat, lng, nome);
    return;
  }

  const editButton = event.target.closest("[data-edit-id]");
  if (editButton) {
    const point = points.find((p) => p.id === editButton.dataset.editId);
    if (point) openPointForm(point);
    return;
  }

  const deleteButton = event.target.closest("[data-delete-id]");
  if (deleteButton) {
    const point = points.find((p) => p.id === deleteButton.dataset.deleteId);
    if (!point || !confirm(`Excluir o ponto "${point.name}"?`)) return;

    fetch(`${poiApiUrl}/${encodeURIComponent(point.id)}`, { method: "DELETE" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        favorites.delete(point.id);
        await loadPoints();
        setStatus("Ponto excluído com sucesso.");
      })
      .catch((err) => setStatus(`Falha ao excluir: ${err.message}`, true));
    return;
  }

  const card = event.target.closest("[data-point-id]");
  if (card) selectPoint(card.dataset.pointId, false);
});

// Geolocalização do Navegador
document.getElementById("location-button").addEventListener("click", () => {
  if (!navigator.geolocation) {
    setStatus("Navegador sem suporte a geolocalização.", true);
    return;
  }
  setStatus("Obtendo localização do navegador...");
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      userLocation = { lat: coords.latitude, lng: coords.longitude };
      hasUserLocation = true;
      map.setView([userLocation.lat, userLocation.lng], 14);
      L.marker([userLocation.lat, userLocation.lng]).addTo(map).bindPopup("Você está aqui!").openPopup();
      setStatus("Localização do navegador obtida com sucesso!");
      if (currentView === "schools") {
        loadSchoolsProximas(userLocation.lat, userLocation.lng, radiusSelect.value === "all" ? 2 : Number(radiusSelect.value));
      } else {
        render();
      }
    },
    (err) => setStatus("Não foi possível obter sua localização.", true),
    { timeout: 10000 }
  );
});

// Inicialização
initMap();
loadPoints();
