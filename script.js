import 'https://cdn.jsdelivr.net/npm/@material/web@1.2.0/all.js';

// Configuración (reemplaza con tus URLs reales)
const GAMES_JSON_URL = 'https://raw.githubusercontent.com/TU-USUARIO/TU-REPO/main/games.json';
const API_URL = 'https://juanzerogames.pythonanywhere.com'; // sin barra final

// Variables globales
let games = [];
let favorites = new Set();
let userToken = localStorage.getItem('token') || null;
let deviceId = localStorage.getItem('deviceId') || (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).substr(2, 9) + Date.now());
localStorage.setItem('deviceId', deviceId);

// IndexedDB simple
const dbPromise = new Promise((resolve, reject) => {
  const req = indexedDB.open('JuanZERO', 1);
  req.onupgradeneeded = e => {
    const db = e.target.result;
    if (!db.objectStoreNames.contains('favorites')) db.createObjectStore('favorites', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('downloads')) db.createObjectStore('downloads', { keyPath: 'id' });
  };
  req.onsuccess = e => resolve(e.target.result);
  req.onerror = e => reject(e.target.error);
});

async function addFavorite(gameId) {
  const db = await dbPromise;
  const tx = db.transaction('favorites', 'readwrite');
  tx.objectStore('favorites').put({ id: gameId });
  return tx.done;
}

async function removeFavorite(gameId) {
  const db = await dbPromise;
  const tx = db.transaction('favorites', 'readwrite');
  tx.objectStore('favorites').delete(gameId);
  return tx.done;
}

async function getFavorites() {
  const db = await dbPromise;
  const tx = db.transaction('favorites', 'readonly');
  const store = tx.objectStore('favorites');
  return new Promise(r => {
    const req = store.getAll();
    req.onsuccess = () => r(req.result.map(i => i.id));
  });
}

async function addDownload(gameId) {
  const db = await dbPromise;
  const tx = db.transaction('downloads', 'readwrite');
  tx.objectStore('downloads').put({ id: gameId });
  return tx.done;
}

async function getDownloads() {
  const db = await dbPromise;
  const tx = db.transaction('downloads', 'readonly');
  const store = tx.objectStore('downloads');
  return new Promise(r => {
    const req = store.getAll();
    req.onsuccess = () => r(req.result.map(i => i.id));
  });
}

// API REST
async function apiCall(endpoint, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (userToken) headers['Authorization'] = 'Bearer ' + userToken;
  const res = await fetch(API_URL + endpoint, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Error desconocido' }));
    throw new Error(err.error || 'Error de red');
  }
  return res.json();
}

// Información del dispositivo
function getDeviceInfo() {
  const ua = navigator.userAgent;
  let os = 'Desconocido';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  else if (ua.includes('Mac')) os = 'macOS';
  let browser = 'Desconocido';
  if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Safari')) browser = 'Safari';
  else if (ua.includes('Edge')) browser = 'Edge';
  return os + ' ' + browser;
}

function getDeviceName() {
  return localStorage.getItem('deviceName') || getDeviceInfo();
}

// Navegación
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// Renderizado de juegos
function renderGames(filterGenre = 'all', searchTerm = '') {
  const grid = document.getElementById('gameGrid');
  const filtered = games.filter(g =>
    (filterGenre === 'all' || g.genre === filterGenre) &&
    g.title.toLowerCase().includes(searchTerm.toLowerCase())
  );
  grid.innerHTML = filtered.map(g => {
    const isFav = favorites.has(g.id);
    return '<div class="game-card" data-id="' + g.id + '">' +
      '<img src="' + (g.iconUrl || 'https://via.placeholder.com/200') + '" alt="' + g.title + '">' +
      '<div class="card-body">' +
        '<h3>' + g.title + '</h3>' +
        '<md-chip>' + g.genre + '</md-chip>' +
        '<md-icon-button class="fav-btn" data-id="' + g.id + '">' +
          '<md-icon style="color:' + (isFav ? '#bb86fc' : 'inherit') + '">' + (isFav ? 'favorite' : 'favorite_border') + '</md-icon>' +
        '</md-icon-button>' +
      '</div>' +
    '</div>';
  }).join('');

  // Eventos
  grid.querySelectorAll('.game-card').forEach(card => {
    card.addEventListener('click', e => {
      if (!e.target.closest('md-icon-button')) showDetail(Number(card.dataset.id));
    });
  });
  grid.querySelectorAll('.fav-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      toggleFavorite(Number(btn.dataset.id));
    });
  });
}

function showDetail(id) {
  const game = games.find(g => g.id === id);
  if (!game) return;
  document.getElementById('detailTitle').textContent = game.title;
  const content = document.getElementById('detailContent');
  let screenshotsHtml = '';
  if (game.screenshots && game.screenshots.length) {
    screenshotsHtml = '<div class="screenshots">' +
      game.screenshots.map(s => '<img src="' + s + '" alt="screenshot">').join('') +
    '</div>';
  }
  content.innerHTML = screenshotsHtml +
    '<p>' + game.description + '</p>' +
    '<p><strong>Desarrollador:</strong> ' + (game.developer || 'Desconocido') + '</p>' +
    '<div class="detail-actions">' +
      '<md-filled-button id="downloadBtn"><md-icon slot="icon">download</md-icon>Descargar APK</md-filled-button>' +
      '<md-icon-button id="detailFavBtn"><md-icon>' + (favorites.has(id) ? 'favorite' : 'favorite_border') + '</md-icon></md-icon-button>' +
    '</div>';

  document.getElementById('downloadBtn').addEventListener('click', () => {
    window.open(game.apkLink, '_blank');
    addDownload(id);
    syncDownload(id);
  });
  document.getElementById('detailFavBtn').addEventListener('click', () => toggleFavorite(id));
  showScreen('detail');
}

async function toggleFavorite(id) {
  if (favorites.has(id)) {
    await removeFavorite(id);
    favorites.delete(id);
  } else {
    await addFavorite(id);
    favorites.add(id);
  }
  await syncFavorites();
  if (document.getElementById('home').classList.contains('active')) {
    renderGames(currentGenre, document.getElementById('searchInput')?.value || '');
  }
  if (document.getElementById('favoritesScreen').classList.contains('active')) {
    renderFavorites();
  }
}

async function renderFavorites() {
  const favIds = await getFavorites();
  const favGames = games.filter(g => favIds.includes(g.id));
  const grid = document.getElementById('favGrid');
  grid.innerHTML = favGames.map(g =>
    '<div class="game-card" data-id="' + g.id + '">' +
      '<img src="' + (g.iconUrl || 'https://via.placeholder.com/200') + '" alt="' + g.title + '">' +
      '<div class="card-body">' +
        '<h3>' + g.title + '</h3>' +
        '<md-chip>' + g.genre + '</md-chip>' +
      '</div>' +
    '</div>'
  ).join('');
  grid.querySelectorAll('.game-card').forEach(card => {
    card.addEventListener('click', () => showDetail(Number(card.dataset.id)));
  });
}

// Sincronización con la nube
async function syncFavorites() {
  if (!userToken) return;
  const favs = await getFavorites();
  await apiCall('/api/sync', 'POST', { favorites: favs });
}

async function syncDownload(gameId) {
  if (!userToken) return;
  await apiCall('/api/sync', 'POST', {
    downloads: [{
      gameId,
      deviceId,
      deviceName: getDeviceName(),
      deviceInfo: getDeviceInfo()
    }]
  });
}

async function loadSyncFromServer() {
  if (!userToken) return;
  try {
    const data = await apiCall('/api/sync', 'GET');
    if (data.favorites) {
      for (const id of data.favorites) {
        if (!favorites.has(id)) {
          await addFavorite(id);
          favorites.add(id);
        }
      }
    }
  } catch (e) {
    console.error('Error sync:', e);
  }
}

// Registro del Service Worker (sin backticks problemáticos)
if ('serviceWorker' in navigator) {
  const swCode = [
    'const CACHE_NAME = "juanzero-v1";',
    'self.addEventListener("install", e => {',
    '  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(["/","/index.html","/styles.css","/script.js"])));',
    '});',
    'self.addEventListener("fetch", e => {',
    '  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));',
    '});'
  ].join('\n');

  const blob = new Blob([swCode], { type: 'application/javascript' });
  const swUrl = URL.createObjectURL(blob);
  navigator.serviceWorker.register(swUrl).catch(err => console.warn('SW no registrado:', err));
}

// Inicialización
let currentGenre = 'all';

document.addEventListener('DOMContentLoaded', async () => {
  // Cargar catálogo
  try {
    const res = await fetch(GAMES_JSON_URL);
    games = await res.json();
  } catch (e) {
    alert('Error al cargar el catálogo. Revisa tu conexión o la URL.');
  }

  // Cargar favoritos locales
  const localFavs = await getFavorites();
  favorites = new Set(localFavs);

  // Verificar sesión
  if (userToken) {
    try {
      await apiCall('/api/me');
      await loadSyncFromServer();
    } catch (e) {
      localStorage.removeItem('token');
      userToken = null;
    }
  }

  // Chips de género
  const genres = [...new Set(games.map(g => g.genre))];
  const chipSet = document.getElementById('genreChips').querySelector('md-chip-set');
  genres.forEach(genre => {
    const chip = document.createElement('md-filter-chip');
    chip.setAttribute('label', genre);
    chip.dataset.genre = genre;
    chip.addEventListener('click', () => {
      currentGenre = genre;
      renderGames(genre, document.getElementById('searchInput').value);
    });
    chipSet.appendChild(chip);
  });
  document.querySelector('md-filter-chip[data-genre="all"]').addEventListener('click', () => {
    currentGenre = 'all';
    renderGames('all', document.getElementById('searchInput').value);
  });

  // Búsqueda
  document.getElementById('searchInput').addEventListener('input', e => {
    renderGames(currentGenre, e.target.value);
  });

  // Splash inicial
  showScreen('splash');
  setTimeout(() => showScreen('home'), 1500);

  // Navegación
  document.getElementById('favoritesBtn').addEventListener('click', () => { renderFavorites(); showScreen('favoritesScreen'); });
  document.getElementById('favoritesNav').addEventListener('click', () => { renderFavorites(); showScreen('favoritesScreen'); });
  document.getElementById('homeNav').addEventListener('click', () => showScreen('home'));
  document.getElementById('devicesBtn').addEventListener('click', () => showDevices());
  document.getElementById('devicesNav').addEventListener('click', () => showDevices());
  document.getElementById('accountBtn').addEventListener('click', () => showScreen('login'));
  document.getElementById('backFromDetail').addEventListener('click', () => showScreen('home'));
  document.getElementById('backFromLogin').addEventListener('click', () => showScreen('home'));
  document.getElementById('backFromFav').addEventListener('click', () => showScreen('home'));
  document.getElementById('backFromDevices').addEventListener('click', () => showScreen('home'));

  // Login / Registro
  document.getElementById('authBtn').addEventListener('click', async () => {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const isLogin = document.getElementById('loginTab').active;
    try {
      const endpoint = isLogin ? '/api/login' : '/api/register';
      const res = await apiCall(endpoint, 'POST', { email, password });
      if (res.token) {
        userToken = res.token;
        localStorage.setItem('token', res.token);
        await loadSyncFromServer();
        showScreen('home');
      }
    } catch (e) {
      document.getElementById('authMessage').textContent = e.message;
    }
  });

  // Diálogo nombre dispositivo
  const dialog = document.getElementById('deviceNameDialog');
  dialog.addEventListener('close', () => {
    const form = document.getElementById('deviceNameForm');
    if (form.returnValue === 'save') {
      const newName = document.getElementById('deviceNameInput').value.trim();
      if (newName) {
        localStorage.setItem('deviceName', newName);
        alert('Nombre actualizado');
      }
    }
  });
  document.getElementById('devicesScreen').addEventListener('click', e => {
    if (e.target.id === 'editNameBtn') dialog.show();
  });

  renderGames();
});

async function showDevices() {
  showScreen('devicesScreen');
  const list = document.getElementById('deviceList');
  if (!userToken) {
    list.innerHTML = '<p style="padding:16px">Inicia sesión para ver tus dispositivos.</p>';
    return;
  }
  try {
    const data = await apiCall('/api/sync', 'GET');
    const devices = data.devices || {};
    list.innerHTML = '';
    for (const [id, info] of Object.entries(devices)) {
      const isCurrent = (id === deviceId);
      const entry = document.createElement('div');
      entry.className = 'device-entry';
      entry.innerHTML =
        '<div style="display:flex; justify-content:space-between; align-items:center;">' +
          '<h3>' + (isCurrent ? 'Este dispositivo' : (info.name || 'Sin nombre')) + '</h3>' +
          (isCurrent ? '<md-text-button id="editNameBtn">Editar nombre</md-text-button>' : '') +
        '</div>' +
        '<p>' + (info.deviceInfo || '') + (isCurrent ? ' (Actual)' : '') + '</p>' +
        '<div class="downloads">' +
          (info.downloads || []).map(d => {
            const gameTitle = games.find(g => g.id === d.gameId)?.title || ('Juego ' + d.gameId);
            return '<span class="dl-chip">' + gameTitle + '</span>';
          }).join('') +
        '</div>';
      list.appendChild(entry);
    }
    // Evento para editar nombre
    document.getElementById('editNameBtn')?.addEventListener('click', () => {
      document.getElementById('deviceNameDialog').show();
    });
  } catch (e) {
    list.innerHTML = '<p style="padding:16px">Error al cargar dispositivos.</p>';
  }
}