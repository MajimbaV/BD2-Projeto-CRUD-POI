const apiUrl = "http://localhost:3000/api/poiuser";
const defaultLocation = { lat: -23.5575, lng: -46.6895 };
const favoritesKey = "pontos-por-perto-favorites";

let points = [];
let userLocation = { ...defaultLocation };
let hasUserLocation = false;
let activeFilter = "all";
let selectedPointId = null;
let editingPointId = null;
let map = null;
const markers = new Map();
let favorites = loadFavorites();

const list = document.getElementById("poi-list");
const count = document.getElementById("result-count");
const searchInput = document.getElementById("search");
const categorySelect = document.getElementById("category");
const radiusSelect = document.getElementById("radius");
const sortSelect = document.getElementById("sort");
const statusMessage = document.getElementById("status-message");
const pointForm = document.getElementById("point-form");
const savePointButton = document.getElementById("save-point-button");

function loadFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem(favoritesKey) || "[]");
    return new Set(Array.isArray(saved) ? saved.map(String) : []);
  } catch (error) {
    console.warn("Não foi possível carregar os pontos favoritos.", error);
    return new Set();
  }
}

function normalizePoint(point) {
  const coordinates = point.localizacao?.coordinates;
  const id = point.id == null ? "" : String(point.id);
  const lat = Number(coordinates?.[1]);
  const lng = Number(coordinates?.[0]);

  if (!id || !point.nome || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("A API retornou um ponto com dados inválidos (id, nome ou coordenadas).");
  }

  return {
    id,
    name: String(point.nome),
    description: point.descricao ? String(point.descricao) : "",
    category: point.categoria ? String(point.categoria) : "Sem categoria",
    address: point.endereco ? String(point.endereco) : "Endereço não informado",
    lat,
    lng
  };
}

async function loadPoints() {
  setStatus("Carregando pontos de interesse...");

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`A API respondeu com HTTP ${response.status}.`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error("A API retornou um formato inesperado.");
    }

    points = data.map(normalizePoint);
    document.getElementById("map-note").textContent = "Pontos carregados da API";
    setStatus(`${points.length} ${points.length === 1 ? "ponto carregado" : "pontos carregados"} da API.`);
    render();
    return true;
  } catch (error) {
    console.error("Não foi possível carregar os pontos de interesse.", error);
    points = [];
    count.textContent = "0 resultados";
    list.innerHTML = '<div class="empty-state"><strong>Não foi possível carregar os pontos</strong>Verifique se o back-end está rodando e tente atualizar a página.</div>';
    setStatus(`Falha ao consultar ${apiUrl}: ${error.message}`, true);
    renderMarkers([]);
    return false;
  }
}

function distanceBetween(from, to) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const latDifference = radians(to.lat - from.lat);
  const lngDifference = radians(to.lng - from.lng);
  const value = Math.sin(latDifference / 2) ** 2
    + Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(lngDifference / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function getVisiblePoints() {
  const query = searchInput.value.trim().toLocaleLowerCase("pt-BR");
  const category = categorySelect.value;
  const radius = radiusSelect.value;

  const result = points
    .map((point) => ({ ...point, distance: distanceBetween(userLocation, point) }))
    .filter((point) => {
      const searchableText = `${point.name} ${point.description} ${point.address} ${point.category}`
        .toLocaleLowerCase("pt-BR");
      const matchesQuery = !query || searchableText.includes(query);
      const matchesCategory = category === "all" || point.category === category;
      const matchesFilter = activeFilter === "all" || favorites.has(point.id);
      const matchesRadius = radius === "all" || point.distance <= Number(radius);
      return matchesQuery && matchesCategory && matchesFilter && matchesRadius;
    });

  result.sort(sortSelect.value === "name"
    ? (a, b) => a.name.localeCompare(b.name, "pt-BR")
    : (a, b) => a.distance - b.distance);
  return result;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function render() {
  const visiblePoints = getVisiblePoints();
  count.textContent = `${visiblePoints.length} ${visiblePoints.length === 1 ? "resultado" : "resultados"}`;

  if (visiblePoints.length === 0) {
    list.innerHTML = '<div class="empty-state"><strong>Nenhum ponto encontrado</strong>Tente mudar a busca ou os filtros selecionados.</div>';
  } else {
    list.innerHTML = visiblePoints.map((point) => {
      const isFavorite = favorites.has(point.id);
      return `
        <article class="school-card${selectedPointId === point.id ? " selected" : ""}" data-point-id="${escapeHtml(point.id)}">
          <div class="school-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12Z"/><circle cx="12" cy="9" r="2.4"/></svg>
          </div>
          <div class="school-main">
            <h3 class="school-name">${escapeHtml(point.name)}</h3>
            <p class="school-address">${escapeHtml(point.address)}${point.description ? ` · ${escapeHtml(point.description)}` : ""}</p>
            <div class="school-meta">
              <span class="tag">${escapeHtml(point.category)}</span>
              <span class="distance">${formatDistance(point.distance)}</span>
            </div>
          </div>
          <div class="card-actions">
            <button class="card-action-button favorite${isFavorite ? " active" : ""}" type="button" data-favorite-id="${escapeHtml(point.id)}" aria-label="${isFavorite ? "Remover dos" : "Adicionar às"} favoritos" aria-pressed="${isFavorite}" title="${isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}">
              <svg viewBox="0 0 24 24" fill="${isFavorite ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg>
            </button>
            <button class="card-action-button edit-action" type="button" data-edit-id="${escapeHtml(point.id)}" aria-label="Editar ${escapeHtml(point.name)}" title="Editar ponto">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
            </button>
            <button class="card-action-button delete-action" type="button" data-delete-id="${escapeHtml(point.id)}" aria-label="Excluir ${escapeHtml(point.name)}" title="Excluir ponto">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>
            </button>
          </div>
        </article>
      `;
    }).join("");
  }

  renderMarkers(visiblePoints);
}

function formatDistance(distance) {
  if (distance < 1) return `${Math.round(distance * 1000)} m`;
  return `${distance.toFixed(1).replace(".", ",")} km`;
}

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", isError);
}

function initMap() {
  if (!window.L) {
    document.getElementById("map-empty").classList.add("visible");
    document.getElementById("map-note").hidden = true;
    return;
  }

  map = L.map("map", { scrollWheelZoom: false }).setView([userLocation.lat, userLocation.lng], 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'
  }).addTo(map);
}

function renderMarkers(visiblePoints) {
  if (!map) return;
  markers.forEach((marker) => marker.remove());
  markers.clear();

  visiblePoints.forEach((point) => {
    const popup = `<strong>${escapeHtml(point.name)}</strong><br>${escapeHtml(point.address)}<br>${formatDistance(point.distance)}`;
    const marker = L.marker([point.lat, point.lng]).addTo(map).bindPopup(popup);
    marker.on("click", () => selectPoint(point.id, false));
    markers.set(point.id, marker);
  });

  if (visiblePoints.length > 0) {
    const bounds = L.latLngBounds(visiblePoints.map((point) => [point.lat, point.lng]));
    if (hasUserLocation) bounds.extend([userLocation.lat, userLocation.lng]);
    map.fitBounds(bounds, { padding: [35, 35], maxZoom: 14 });
  } else {
    map.setView([userLocation.lat, userLocation.lng], 13);
  }
}

function selectPoint(id, openPopup = true) {
  selectedPointId = id;
  render();
  const marker = markers.get(id);
  const point = points.find((item) => item.id === id);
  if (marker && point && map) {
    map.setView([point.lat, point.lng], Math.max(map.getZoom(), 15));
    if (openPopup) marker.openPopup();
  }

  const card = [...list.querySelectorAll("[data-point-id]")].find((item) => item.dataset.pointId === id);
  if (card) card.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function openPointForm(point = null) {
  editingPointId = point ? point.id : null;
  document.getElementById("form-title").textContent = point ? "Editar ponto" : "Cadastrar ponto";
  savePointButton.textContent = point ? "Salvar alterações" : "Salvar ponto";
  document.getElementById("point-name").value = point?.name || "";
  document.getElementById("point-description").value = point?.description || "";
  document.getElementById("point-category").value = point?.category === "Sem categoria" ? "" : (point?.category || "");
  document.getElementById("point-address").value = point?.address === "Endereço não informado" ? "" : (point?.address || "");
  document.getElementById("point-latitude").value = point?.lat ?? userLocation.lat;
  document.getElementById("point-longitude").value = point?.lng ?? userLocation.lng;
  pointForm.hidden = false;
  document.getElementById("point-name").focus();
  pointForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closePointForm() {
  pointForm.reset();
  pointForm.hidden = true;
  editingPointId = null;
  document.getElementById("form-title").textContent = "Cadastrar ponto";
  savePointButton.textContent = "Salvar ponto";
}

function getApiError(response, body) {
  if (body && typeof body.message === "string") return body.message;
  if (body && typeof body.error === "string") return body.error;
  return `A API respondeu com HTTP ${response.status}.`;
}

pointForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!pointForm.reportValidity()) return;

  const latitude = Number(document.getElementById("point-latitude").value);
  const longitude = Number(document.getElementById("point-longitude").value);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    setStatus("Informe coordenadas válidas: latitude entre -90 e 90 e longitude entre -180 e 180.", true);
    return;
  }

  const payload = {
    nome: document.getElementById("point-name").value.trim(),
    descricao: document.getElementById("point-description").value.trim(),
    categoria: document.getElementById("point-category").value || null,
    endereco: document.getElementById("point-address").value.trim(),
    latitude,
    longitude
  };
  if (!payload.nome) {
    setStatus("Informe o nome do ponto.", true);
    document.getElementById("point-name").focus();
    return;
  }

  const isEditing = editingPointId !== null;
  const url = isEditing ? `${apiUrl}/${encodeURIComponent(editingPointId)}` : apiUrl;
  savePointButton.disabled = true;
  setStatus(isEditing ? "Salvando alterações..." : "Cadastrando ponto...");

  try {
    const response = await fetch(url, {
      method: isEditing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new Error(getApiError(response, body));

    closePointForm();
    const refreshed = await loadPoints();
    if (refreshed) setStatus(isEditing ? "Ponto atualizado com sucesso." : "Ponto cadastrado com sucesso.");
  } catch (error) {
    console.error("Não foi possível salvar o ponto.", error);
    setStatus(`Não foi possível salvar o ponto: ${error.message}`, true);
  } finally {
    savePointButton.disabled = false;
  }
});

document.getElementById("new-point-button").addEventListener("click", () => openPointForm());
document.getElementById("cancel-form-button").addEventListener("click", closePointForm);

document.querySelectorAll(".chip").forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll(".chip").forEach((chip) => {
      const isActive = chip === button;
      chip.classList.toggle("active", isActive);
      chip.setAttribute("aria-pressed", String(isActive));
    });
    render();
  });
});

[searchInput, categorySelect, radiusSelect, sortSelect].forEach((control) => {
  control.addEventListener(control === searchInput ? "input" : "change", render);
});

list.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;

  const favoriteButton = event.target.closest("[data-favorite-id]");
  if (favoriteButton) {
    const id = favoriteButton.dataset.favoriteId;
    if (favorites.has(id)) favorites.delete(id);
    else favorites.add(id);
    try {
      localStorage.setItem(favoritesKey, JSON.stringify([...favorites]));
    } catch (error) {
      console.error("Não foi possível salvar os pontos favoritos.", error);
      setStatus("Não foi possível salvar os favoritos neste navegador.", true);
    }
    render();
    return;
  }

  const editButton = event.target.closest("[data-edit-id]");
  if (editButton) {
    const point = points.find((item) => item.id === editButton.dataset.editId);
    if (point) openPointForm(point);
    return;
  }

  const deleteButton = event.target.closest("[data-delete-id]");
  if (deleteButton) {
    const point = points.find((item) => item.id === deleteButton.dataset.deleteId);
    if (!point || !window.confirm(`Excluir o ponto "${point.name}"? Esta ação não pode ser desfeita.`)) return;

    deleteButton.disabled = true;
    setStatus("Excluindo ponto...");
    fetch(`${apiUrl}/${encodeURIComponent(point.id)}`, { method: "DELETE" })
      .then(async (response) => {
        const body = response.status === 204 ? null : await response.json().catch(() => null);
        if (!response.ok) throw new Error(getApiError(response, body));

        favorites.delete(point.id);
        try {
          localStorage.setItem(favoritesKey, JSON.stringify([...favorites]));
        } catch (error) {
          console.error("Não foi possível atualizar os pontos favoritos.", error);
          setStatus("Ponto excluído, mas não foi possível atualizar os favoritos neste navegador.", true);
        }
        if (selectedPointId === point.id) selectedPointId = null;
        const refreshed = await loadPoints();
        if (refreshed) setStatus("Ponto excluído com sucesso.");
      })
      .catch((error) => {
        console.error("Não foi possível excluir o ponto.", error);
        deleteButton.disabled = false;
        setStatus(`Não foi possível excluir o ponto: ${error.message}`, true);
      });
    return;
  }

  const card = event.target.closest("[data-point-id]");
  if (card) selectPoint(card.dataset.pointId, false);
});

document.getElementById("location-button").addEventListener("click", () => {
  if (!navigator.geolocation) {
    setStatus("Seu navegador não oferece suporte à localização.", true);
    return;
  }

  setStatus("Obtendo sua localização...");
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      userLocation = { lat: coords.latitude, lng: coords.longitude };
      hasUserLocation = true;
      document.getElementById("map-note").textContent = "Pontos próximos da sua localização";
      setStatus("Localização atualizada. As distâncias foram recalculadas.");
      render();
    },
    (error) => {
      const messages = {
        1: "Permita o acesso à localização no navegador para buscar pontos próximos.",
        2: "Não foi possível determinar sua localização. Tente novamente.",
        3: "A localização demorou demais. Tente novamente."
      };
      setStatus(messages[error.code] || "Não foi possível obter sua localização.", true);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
});

initMap();
loadPoints();
