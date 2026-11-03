// ============================================================================
// script.js: Aplicação Web Espacial Inteligente (PostGIS + Leaflet + Nominatim)
// ============================================================================

const apiBase = "http://localhost:3000/api";
const poiApiUrl = `${apiBase}/poiuser`;
const escolasApiUrl = `${apiBase}/escolas`;

// Coordenadas padrão da Paraíba (João Pessoa, PB)
const defaultLocation = { lat: -7.11532, lng: -34.861 };
const favoritesKey = "pontos-por-perto-favorites";

// Estado da Aplicação
let currentView = "poi"; // Inicia mostrando os pontos de interesse
let points = [];
let schools = [];
let centerLocation = { ...defaultLocation }; // Centro atual de busca
let radiusCircle = null; // Círculo visual do Leaflet
let centerMarker = null; // Marcador do centro da busca
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
const filterChipsWrap = document.getElementById("filter-chips");
const sortSelect = document.getElementById("sort");
const sortWrap = document.getElementById("sort-label");
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

// Elementos do Modal de Detalhes da Escola
const schoolModalOverlay = document.getElementById("school-modal-overlay");
const modalCloseButton = document.getElementById("modal-close-button");
const modalSchoolName = document.getElementById("modal-school-name");
const modalSchoolMunicipio = document.getElementById("modal-school-municipio");
const modalSchoolBairro = document.getElementById("modal-school-bairro");
const modalScoreNumber = document.getElementById("modal-score-number");
const modalScoreBadge = document.getElementById("modal-score-badge");
const modalScoreBar = document.getElementById("modal-score-bar");
const modalDistanceValue = document.getElementById("modal-distance-value");
const modalDistanceWrap = document.getElementById("modal-distance-wrap");
const modalIndicatorsGrid = document.getElementById("modal-indicators-grid");
const modalSchoolInep = document.getElementById("modal-school-inep");

// ============================================================================
// 1. Funções de Apoio e Formatação
// ============================================================================

function loadFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem(favoritesKey) || "[]");
    return new Set(Array.isArray(saved) ? saved.map(String) : []);
  } catch (error) {
    return new Set();
  }
}

function toggleFavorite(id) {
  if (favorites.has(id)) {
    favorites.delete(id);
  } else {
    favorites.add(id);
  }
  localStorage.setItem(favoritesKey, JSON.stringify(Array.from(favorites)));
  render();
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

function getUserLocation() {  
  if (!navigator.geolocation) {
    setStatus("Navegador sem suporte a geolocalização.", true);
    return;
  }
  setStatus("Obtendo localização do navegador...");
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      definirCentroDeBusca(coords.latitude, coords.longitude, "Sua localização atual");
      setStatus("Localização obtida com sucesso! Escolas ao redor carregadas.");
    },
    (err) => setStatus("Não foi possível obter sua localização.", true),
    { timeout: 10000 }
  );
};

// ============================================================================
// 2. Modal de Detalhes da Escola (Critérios Ponderados)
// ============================================================================

const criteriosAlgoritmo = [
  { key: "in_banheiro_pne", label: "Banheiro PNE (Acessível)", peso: 3, icon: "♿" },
  { key: "in_laboratorio_informatica", label: "Laboratório de Informática", peso: 3, icon: "💻" },
  { key: "in_biblioteca", label: "Biblioteca", peso: 2, icon: "📚" },
  { key: "in_laboratorio_ciencias", label: "Laboratório de Ciências", peso: 2, icon: "🔬" },
  { key: "in_banda_larga", label: "Internet Banda Larga", peso: 2, icon: "🚀" },
  { key: "in_computador", label: "Computadores para Alunos", peso: 2, icon: "🖥️" },
  { key: "in_internet", label: "Acesso à Internet", peso: 1, icon: "🌐" },
  { key: "in_sala_leitura", label: "Sala de Leitura", peso: 1, icon: "📖" },
  { key: "in_quadra_esportes", label: "Quadra de Esportes", peso: 1, icon: "⚽" },
  { key: "in_parque_infantil", label: "Parque Infantil", peso: 1, icon: "🛝" }
];

function openSchoolModal(school) {
  if (!school) return;

  const score = Number(school.score_infraestrutura || 0);
  const percentage = Math.round((score / 18) * 100);

  modalSchoolName.textContent = school.no_escola;
  modalSchoolMunicipio.textContent = `${school.municipio || "Paraíba"} - PB`;
  modalSchoolBairro.textContent = `${school.bairro ? `Bairro ${school.bairro}` : "Zona Urbana/Rural"}${school.rua ? ` · ${school.rua}${school.numero ? `, ${school.numero}` : ""}` : ""}`;
  modalSchoolInep.textContent = school.co_escola || school.objectid || "--";

  modalScoreNumber.textContent = score;

  if (score >= 14) {
    modalScoreBadge.className = "score-badge high";
    modalScoreBadge.textContent = "Excelente";
  } else if (score >= 8) {
    modalScoreBadge.className = "score-badge medium";
    modalScoreBadge.textContent = "Intermediário";
  } else {
    modalScoreBadge.className = "score-badge low";
    modalScoreBadge.textContent = "Básico";
  }

  modalScoreBar.style.width = `${percentage}%`;

  if (school.distancia_metros != null) {
    modalDistanceWrap.hidden = false;
    modalDistanceValue.textContent = formatDistance(Number(school.distancia_metros));
  } else {
    modalDistanceWrap.hidden = true;
  }

  // Preenche a lista com os 10 indicadores e os pesos
  modalIndicatorsGrid.innerHTML = criteriosAlgoritmo.map((crit) => {
    const present = Boolean(Number(school[crit.key]) === 1);
    return `
      <div class="indicator-card ${present ? "present" : "absent"}">
        <div class="indicator-info">
          <span class="indicator-icon">${crit.icon}</span>
          <div>
            <div class="indicator-name">${escapeHtml(crit.label)}</div>
            <span class="indicator-weight">Peso ${crit.peso} (${crit.peso} pts)</span>
          </div>
        </div>
        <span class="indicator-status-badge ${present ? "yes" : "no"}">
          ${present ? "✔ Possui" : "✖ Não possui"}
        </span>
      </div>
    `;
  }).join("");

  schoolModalOverlay.hidden = false;
}

function closeSchoolModal() {
  schoolModalOverlay.hidden = true;
}

modalCloseButton.addEventListener("click", closeSchoolModal);
schoolModalOverlay.addEventListener("click", (e) => {
  if (e.target === schoolModalOverlay) closeSchoolModal();
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !schoolModalOverlay.hidden) {
    closeSchoolModal();
  }
});

// ============================================================================
// 3. Geocodificação com Nominatim (Busca Inteligente)
// ============================================================================

async function buscarLocalidadeGlobal(query) {
  if (!query || query.trim().length < 3) return;

  setStatus(`Buscando "${query}" no OpenStreetMap (Nominatim)...`);
  try {
    const consulta = `${query.trim()}, Paraíba, Brasil`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(consulta)}&limit=1`;
    const res = await fetch(url, { headers: { "Accept-Language": "pt-BR" } });
    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      const fallbackUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
      const fallbackResp = await fetch(fallbackUrl);
      const fallbackData = await fallbackResp.json();
      if (!Array.isArray(fallbackData) || fallbackData.length === 0) {
        setStatus(`Localidade "${query}" não encontrada no mapa.`, true);
        return;
      }
      data.push(fallbackData[0]);
    }

    const { lat, lon, display_name } = data[0];
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);

    definirCentroDeBusca(latitude, longitude, `Buscando em: ${display_name.split(",")[0]}`);
    setStatus(`Mapa centralizado em: ${display_name.split(",")[0]}`);
  } catch (err) {
    console.error("Erro no Nominatim:", err);
    setStatus("Erro ao buscar localidade no Nominatim.", true);
  }
}

async function buscarEnderecoCadastro(query) {
  if (!query || query.trim().length < 3) return;
  setStatus("Buscando endereço no Nominatim para o cadastro...");
  searchAddressButton.disabled = true;

  try {
    const consulta = `${query.trim()}, Paraíba, Brasil`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(consulta)}&limit=1`;
    const res = await fetch(url);
    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("Endereço não localizado.");
    }

    const { lat, lon, display_name } = data[0];
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);

    document.getElementById("point-latitude").value = latitude.toFixed(6);
    document.getElementById("point-longitude").value = longitude.toFixed(6);
    if (!pointAddressInput.value) pointAddressInput.value = display_name;

    posicionarMarcadorFormulario(latitude, longitude, "Local encontrado no Nominatim");
    map.flyTo([latitude, longitude], 16);
    setStatus("Coordenadas preenchidas via Nominatim!");
  } catch (err) {
    setStatus(`Nominatim: ${err.message}`, true);
  } finally {
    searchAddressButton.disabled = false;
  }
}

// ============================================================================
// 4. Controle Espacial do Centro de Busca e do Círculo de Raio
// ============================================================================

function definirCentroDeBusca(lat, lng, label = "Centro da busca") {
  centerLocation = { lat, lng };

  if (!map) return;

  if (centerMarker) {
    centerMarker.setLatLng([lat, lng]);
  } else {
    const centerIcon = L.divIcon({
      className: "center-search-icon",
      html: `<div style="background:#2563eb;color:#fff;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;border:3px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,0.3);font-size:14px;">📍</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
    centerMarker = L.marker([lat, lng], { icon: centerIcon, zIndexOffset: 1000 }).addTo(map);
  }
  centerMarker.bindPopup(`<strong>${escapeHtml(label)}</strong><br><small>Clique no mapa para mudar o centro</small>`);

  atualizarCirculoDeRaio();
  map.flyTo([lat, lng], Math.max(map.getZoom(), 13), { duration: 1 });

  if (currentView === "schools") {
    loadSchoolsProximas(lat, lng, radiusSelect.value === "all" ? 5 : Number(radiusSelect.value));
  }
}

function atualizarCirculoDeRaio() {
  if (!map) return;
  const raioKm = radiusSelect.value === "all" ? null : Number(radiusSelect.value);

  if (!raioKm) {
    if (radiusCircle) {
      radiusCircle.remove();
      radiusCircle = null;
    }
    return;
  }

  const raioMetros = raioKm * 1000;

  if (radiusCircle) {
    radiusCircle.setLatLng([centerLocation.lat, centerLocation.lng]);
    radiusCircle.setRadius(raioMetros);
  } else {
    radiusCircle = L.circle([centerLocation.lat, centerLocation.lng], {
      radius: raioMetros,
      color: "#2563eb",
      fillColor: "#3b82f6",
      fillOpacity: 0.12,
      weight: 1.5,
      dashArray: "6, 6"
    }).addTo(map);
  }
}

// ============================================================================
// 5. Integração com API Backend (PostGIS Escolas & CRUD POIs)
// ============================================================================

function normalizePoint(point) {
  const coordinates = point.localizacao?.coordinates;
  const id = point.id == null ? "" : String(point.id);
  const lat = Number(coordinates?.[1]);
  const lng = Number(coordinates?.[0]);

  return {
    id,
    name: String(point.nome || "Sem nome"),
    description: point.descricao ? String(point.descricao) : "",
    category: point.categoria ? String(point.categoria) : "Outro",
    address: point.endereco ? String(point.endereco) : "Endereço não informado",
    lat,
    lng
  };
}

async function loadPoints() {
  try {
    const response = await fetch(poiApiUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    points = data.map(normalizePoint);
    if (currentView === "poi") render();
  } catch (error) {
    console.error("Erro ao carregar POIs:", error);
    points = [];
  }
}

async function loadSchoolsProximas(lat, lng, raioKm = 2) {
  const raioMetros = Number(raioKm) * 1000;
  setStatus(`Consultando pontos num raio de ${raioKm} km...`);

  try {
    const url = `${escolasApiUrl}/proximas?latitude=${lat}&longitude=${lng}&raio=${raioMetros}&limite=50`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    schools = await response.json();

    document.getElementById("map-note").textContent = `${schools.length} melhores escolas em um raio de ${raioKm} km`;
    setStatus(`${schools.length} escolas encontradas ordenadas pelo ranking de infraestrutura.`);
    render();
  } catch (error) {
    console.error("Erro ao carregar escolas:", error);
    schools = [];
    setStatus(`Erro ao consultar escolas: ${error.message}`, true);
    render();
  }
}

async function loadSchoolsBbox() {
  if (currentView !== "schools" || !map) return;
  const bounds = map.getBounds();

  try {
    const url = `${escolasApiUrl}/bbox?minLon=${bounds.getWest()}&minLat=${bounds.getSouth()}&maxLon=${bounds.getEast()}&maxLat=${bounds.getNorth()}&limite=60`;
    const response = await fetch(url);
    if (!response.ok) return;
    schools = await response.json();

    document.getElementById("map-note").textContent = `${schools.length} escolas carregadas na área visível`;
    render();
  } catch (error) {
    console.error("Erro BBOX:", error);
  }
}

// ============================================================================
// 6. Renderização dos Resultados e do Mapa
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
  filterChipsWrap.hidden = false; 
  sortWrap.hidden = true;         

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
    list.innerHTML = '<div class="empty-state"><strong>Nenhum ponto de interesse cadastrado</strong>Clique em "+ Novo ponto" para adicionar seu primeiro local.</div>';
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
              🏫 Buscar escolas próximas deste local
            </button>
          </div>
          <div class="card-actions">
            <button class="card-action-button favorite${isFavorite ? " active" : ""}" type="button" data-favorite-id="${escapeHtml(point.id)}" title="Favoritar">
              <svg viewBox="0 0 24 24" fill="${isFavorite ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg>
            </button>
            <button class="card-action-button edit-action" type="button" data-edit-id="${escapeHtml(point.id)}" title="Editar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
            </button>
            <button class="card-action-button delete-action" type="button" data-delete-id="${escapeHtml(point.id)}" title="Excluir">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>
            </button>
          </div>
        </article>
      `;
    }).join("");
  }

  renderPoiMarkers(visiblePoints);
}

function renderSchoolsList() {
  resultsTitle.textContent = "Melhores Escolas (Ranking de Infraestrutura)";
  categoryFilterWrap.hidden = true;
  filterChipsWrap.hidden = true; 
  sortWrap.hidden = false;       

  const query = searchInput.value.trim().toLocaleLowerCase("pt-BR");

  let filtered = schools.filter((school) => {
    const searchable = `${school.no_escola} ${school.municipio} ${school.bairro || ""}`.toLocaleLowerCase("pt-BR");
    return !query || searchable.includes(query);
  });

  if (sortSelect.value === "score") {
    filtered.sort((a, b) => b.score_infraestrutura - a.score_infraestrutura);
  } else if (sortSelect.value === "name") {
    filtered.sort((a, b) => a.no_escola.localeCompare(b.no_escola, "pt-BR"));
  } else if (sortSelect.value === "distance"){
    filtered.sort((a, b) => a.distancia_metros - b.distancia_metros);
  }

  count.textContent = `${filtered.length} ${filtered.length === 1 ? "escola" : "escolas"}`;

  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty-state"><strong>Nenhuma escola encontrada nesta área</strong>Dica: clique em qualquer lugar do mapa para mudar o centro da busca.</div>';
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
        <article class="school-card${selectedItemId === school.co_escola ? " selected" : ""}" data-school-id="${school.co_escola}" style="cursor: pointer;">
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

    const score = Number(school.score_infraestrutura || 0);
    const color = score >= 14 ? "#10b981" : (score >= 8 ? "#f59e0b" : "#ef4444");

    const popup = `
      <div style="min-width: 190px;">
        <strong style="font-size: 14px;">${escapeHtml(school.no_escola)}</strong><br>
        <span style="color:#666;">${escapeHtml(school.municipio)}${school.bairro ? ` (${escapeHtml(school.bairro)})` : ""}</span><br><br>
        <div style="display:flex; justify-content:space-between; align-items:center; background:#f4f4f5; padding:6px 8px; border-radius:6px; margin-bottom:8px;">
          <span>Nota:</span>
          <strong style="color:${color}; font-size:14px;">${score}/18 pts</strong>
        </div>
        <button class="primary-button" style="width:100%; padding:6px 10px; font-size:12px;" onclick="window.abrirModalEscolaPorId(${school.co_escola})">
          🔍 Ver detalhes completos
        </button>
      </div>
    `;

    const marker = L.circleMarker([lat, lng], {
      radius: 9,
      fillColor: color,
      color: "#ffffff",
      weight: 2.5,
      opacity: 1,
      fillOpacity: 0.95
    }).addTo(map).bindPopup(popup);

    // Ao clicar no círculo da escola, abre o modal detalhado!
    marker.on("click", () => {
      selectedItemId = school.co_escola;
      openSchoolModal(school);
    });

    schoolMarkers.set(school.co_escola, marker);
  });
}

window.abrirModalEscolaPorId = function(coEscola) {
  const school = schools.find((s) => s.co_escola === coEscola);
  if (school) openSchoolModal(school);
};

window.buscarEscolasPertoDe = function(lat, lng, nome) {
  currentView = "schools";
  tabSchools.classList.add("active");
  tabPoi.classList.remove("active");
  crudSection.hidden = true;
  definirCentroDeBusca(lat, lng, `Ponto: ${nome}`);
};

function selectPoint(id, openPopup = true) {
  selectedItemId = id;
  render();
  const marker = markers.get(id);
  const point = points.find((item) => item.id === id);
  if (marker && point && map) {
    map.flyTo([point.lat, point.lng], Math.max(map.getZoom(), 15));
    if (openPopup) marker.openPopup();
  }
}

function selectSchool(coEscola) {
  selectedItemId = coEscola;
  const school = schools.find((s) => s.co_escola === coEscola);
  if (school) {
    map.flyTo([Number(school.latitude), Number(school.longitude)], Math.max(map.getZoom(), 15));
    openSchoolModal(school);
  }
}

// ============================================================================
// 7. Inicialização do Mapa Leaflet
// ============================================================================

function initMap() {
  if (!window.L) return;

  map = L.map("map", { scrollWheelZoom: true }).setView([centerLocation.lat, centerLocation.lng], 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  map.on("click", (e) => {
    const { lat, lng } = e.latlng;

    if (!pointForm.hidden) {
      document.getElementById("point-latitude").value = lat.toFixed(6);
      document.getElementById("point-longitude").value = lng.toFixed(6);
      posicionarMarcadorFormulario(lat, lng, "Coordenadas marcadas pelo clique");
      setStatus("Coordenadas atualizadas pelo clique no mapa.");
    } else {
      definirCentroDeBusca(lat, lng, "Ponto clicado no mapa");
      setStatus("Centro da busca movido para o ponto clicado!");
    }
  });

  map.on("moveend", () => {
    if (currentView === "schools" && radiusSelect.value === "all") {
      loadSchoolsBbox();
    }
  });

  definirCentroDeBusca(centerLocation.lat, centerLocation.lng, "João Pessoa, PB");
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
// 8. Formulário de CRUD de Ponto de Interesse
// ============================================================================

function openPointForm(point = null) {
  editingPointId = point ? point.id : null;
  document.getElementById("form-title").textContent = point ? "Editar ponto" : "Cadastrar ponto";
  savePointButton.textContent = point ? "Salvar alterações" : "Salvar ponto";
  document.getElementById("point-name").value = point?.name || "";
  document.getElementById("point-description").value = point?.description || "";
  document.getElementById("point-category").value = point?.category || "";
  document.getElementById("point-address").value = point?.address === "Endereço não informado" ? "" : (point?.address || "");
  
  const lat = point?.lat ?? centerLocation.lat;
  const lng = point?.lng ?? centerLocation.lng;
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
    setStatus(isEditing ? "Ponto atualizado com sucesso!" : "Ponto cadastrado com sucesso no Supabase!");
  } catch (error) {
    console.error("Erro ao salvar:", error);
    setStatus(`Erro ao salvar ponto: ${error.message}`, true);
  } finally {
    savePointButton.disabled = false;
  }
});

searchAddressButton.addEventListener("click", () => {
  buscarEnderecoCadastro(pointAddressInput.value);
});

pointAddressInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    buscarEnderecoCadastro(pointAddressInput.value);
  }
});

searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    buscarLocalidadeGlobal(searchInput.value);
  }
});

document.getElementById("new-point-button").addEventListener("click", () => openPointForm());
document.getElementById("cancel-form-button").addEventListener("click", closePointForm);

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
    loadSchoolsProximas(centerLocation.lat, centerLocation.lng, Number(radiusSelect.value));
  } else {
    loadSchoolsBbox();
  }
});

radiusSelect.addEventListener("change", () => {
  atualizarCirculoDeRaio();
  if (currentView === "schools") {
    if (radiusSelect.value !== "all") {
      loadSchoolsProximas(centerLocation.lat, centerLocation.lng, Number(radiusSelect.value));
    } else {
      loadSchoolsBbox();
    }
  } else {
    render();
  }
});

[categorySelect, sortSelect].forEach((el) => {
  el.addEventListener("change", render);
});

list.addEventListener("click", (event) => {
  const favoriteButton = event.target.closest("[data-favorite-id]");
  if (favoriteButton) {
    event.stopPropagation();
    const id = favoriteButton.dataset.favoriteId;
    toggleFavorite(id);
    return;
  }


  const findButton = event.target.closest("[data-find-schools-lat]");
  if (findButton) {
    const lat = Number(findButton.dataset.findSchoolsLat);
    const lng = Number(findButton.dataset.findSchoolsLng);
    const nome = findButton.dataset.findSchoolsName;
    window.buscarEscolasPertoDe(lat, lng, nome);
    return;
  }

  const schoolCard = event.target.closest("[data-school-id]");
  if (schoolCard) {
    selectSchool(Number(schoolCard.dataset.schoolId));
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

document.getElementById("location-button").addEventListener("click", () => {
  getUserLocation();
});

filterChipsWrap.addEventListener("click", (event) => {
  const chip = event.target.closest(".chip");
  if (!chip) return;

  // Remove a classe "active" de todos os botões e adiciona no clicado
  filterChipsWrap.querySelectorAll(".chip").forEach(btn => btn.classList.remove("active"));
  chip.classList.add("active");

  // Atualiza a variável de filtro (all ou favorites) e re-renderiza a tela
  activeFilter = chip.dataset.filter;
  render();
});

// Inicialização
initMap();
getUserLocation();
loadPoints();
