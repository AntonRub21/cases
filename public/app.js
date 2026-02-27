const state = {
  telegramId: null,
  user: null,
  cases: [],
  inventory: [],
  selectedInventoryId: null
};

const el = (id) => document.getElementById(id);

function setStatus(message, isError = false) {
  const node = el('status');
  node.textContent = message;
  node.style.color = isError ? '#ff7b7b' : '#6df7ff';
}

async function api(path, method = 'GET', body) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
}

function rarityClass(rarity = '') {
  return `rarity-${rarity.toLowerCase()}`;
}

function switchTab(tab) {
  document.querySelectorAll('.section').forEach((s) => s.classList.remove('active'));
  document.getElementById(`section-${tab}`).classList.add('active');
  el('sectionsMenu').classList.add('hidden');
}

function renderBalance() {
  const coins = state.user ? state.user.balance_coins : 0;
  el('balanceLabel').textContent = `Coins: ${coins}`;
}

function renderProfile() {
  const label = el('profileInfo');
  if (!state.user) {
    label.textContent = 'Не авторизован';
    return;
  }
  label.textContent = `ID: ${state.user.telegram_id} • ${state.user.username || 'user'} • Coins: ${state.user.balance_coins}`;
}

function renderCases() {
  const wrapper = el('cases');
  wrapper.innerHTML = '';

  state.cases.forEach((caseItem) => {
    const card = document.createElement('article');
    card.className = 'case-card';
    card.innerHTML = `
      <img class="case-image" src="${caseItem.image_url}" alt="${caseItem.name}" />
      <h3>${caseItem.name}</h3>
      <div class="price">${caseItem.price_coins} G</div>
      <button data-action="open" data-id="${caseItem.id}">Открыть</button>
    `;
    wrapper.appendChild(card);
  });
}

function renderHistory(history = [], withdrawals = []) {
  const list = el('history');
  list.innerHTML = '';

  history.forEach((h) => {
    const li = document.createElement('li');
    li.innerHTML = `<img src="${h.image_url}" alt="${h.skin_name}" /><span>${h.skin_name}</span>`;
    list.appendChild(li);
  });

  withdrawals.forEach((w) => {
    const li = document.createElement('li');
    li.innerHTML = `<img src="${w.image_url}" alt="${w.skin_name}" /><span>${w.skin_name} • ${w.status}</span>`;
    list.appendChild(li);
  });
}

function renderInventory() {
  const list = el('inventory');
  list.innerHTML = '';

  if (state.inventory.length === 0) {
    list.innerHTML = '<li class="empty">Пока пусто. Откройте кейс.</li>';
    return;
  }

  state.inventory.forEach((item) => {
    const li = document.createElement('li');
    li.className = `inv-item ${rarityClass(item.rarity)} ${state.selectedInventoryId === item.id ? 'selected' : ''}`;
    li.dataset.id = item.id;
    li.innerHTML = `
      <img src="${item.image_url}" alt="${item.skin_name}" />
      <div>
        <strong>${item.skin_name}</strong>
        <small>$${item.steam_value}</small>
      </div>
    `;
    list.appendChild(li);
  });
}

function openModal() {
  el('openModal').classList.remove('hidden');
}

function closeModal() {
  setTimeout(() => el('openModal').classList.add('hidden'), 1000);
}

function buildReelItems(items, loops = 8) {
  const result = [];
  for (let i = 0; i < loops; i += 1) items.forEach((item) => result.push(item));
  return result;
}

async function playOpeningAnimation(caseId) {
  const currentCase = state.cases.find((c) => c.id === caseId);
  const reelTrack = el('reelTrack');
  const resultLabel = el('openResult');

  const reelItems = buildReelItems(currentCase.items, 8);
  reelTrack.innerHTML = reelItems
    .map((item) => `<div class="reel-item ${rarityClass(item.rarity)}"><img src="${item.image_url}" alt="${item.skin_name}" /></div>`)
    .join('');

  openModal();
  reelTrack.style.transition = 'none';
  reelTrack.style.transform = 'translateX(0px)';
  void reelTrack.offsetWidth;

  const data = await api('/api/open-case', 'POST', { telegramId: state.telegramId, caseId });

  const targetName = data.reward.skin_name;
  const itemWidth = 94;
  let targetIndex = reelItems.findIndex((i, idx) => idx > 20 && i.skin_name === targetName);
  if (targetIndex < 0) targetIndex = reelItems.length - 3;

  const finalX = -(targetIndex * itemWidth - 140);
  reelTrack.style.transition = 'transform 2.7s cubic-bezier(0.12, 0.62, 0.12, 1)';
  reelTrack.style.transform = `translateX(${finalX}px)`;

  await new Promise((resolve) => setTimeout(resolve, 2800));
  resultLabel.textContent = `Выпало: ${data.reward.skin_name}`;

  state.user = data.user;
  renderBalance();
  renderProfile();
  await refreshUser();
  closeModal();
}

async function loadCases() {
  const data = await api('/api/cases');
  state.cases = data.cases;
  renderCases();
}

async function refreshUser() {
  if (!state.telegramId) return;
  const data = await api(`/api/users/${state.telegramId}`);
  state.user = data.user;
  state.inventory = data.inventory;
  renderBalance();
  renderProfile();
  renderHistory(data.history, data.withdrawals);
  renderInventory();
}

el('loginBtn').addEventListener('click', async () => {
  try {
    state.telegramId = el('telegramId').value.trim() || state.telegramId || '1001';
    const username = el('username').value.trim();
    await api('/api/auth/telegram', 'POST', { telegramId: state.telegramId, username });
    await refreshUser();
    setStatus('Успешный вход');
  } catch (err) {
    setStatus(err.message, true);
  }
});

el('topupBtn').addEventListener('click', async () => {
  try {
    if (!state.telegramId) throw new Error('Сначала войдите');
    const amount = Number(el('topupAmount').value);
    const data = await api('/api/topup', 'POST', { telegramId: state.telegramId, amount });
    state.user = data.user;
    renderBalance();
    renderProfile();
    setStatus('Баланс пополнен');
  } catch (err) {
    setStatus(err.message, true);
  }
});

el('cases').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action="open"]');
  if (!button) return;

  try {
    if (!state.telegramId) throw new Error('Сначала войдите');
    await playOpeningAnimation(Number(button.dataset.id));
  } catch (err) {
    el('openModal').classList.add('hidden');
    setStatus(err.message, true);
  }
});

el('inventory').addEventListener('click', (event) => {
  const item = event.target.closest('li[data-id]');
  if (!item) return;
  state.selectedInventoryId = item.dataset.id;
  renderInventory();
  switchTab('profile');
});

el('withdrawBtn').addEventListener('click', async () => {
  try {
    if (!state.telegramId) throw new Error('Сначала войдите');
    if (!state.selectedInventoryId) throw new Error('Выберите скин в инвентаре');

    await api('/api/withdraw', 'POST', {
      telegramId: state.telegramId,
      inventoryItemId: state.selectedInventoryId,
      steamTradeUrl: el('steamUrl').value.trim()
    });

    state.selectedInventoryId = null;
    await refreshUser();
    setStatus('Запрос на вывод создан');
  } catch (err) {
    setStatus(err.message, true);
  }
});

el('supportBtn').addEventListener('click', () => {
  setStatus('Поддержка: @support (демо)');
});

el('sectionsBtn').addEventListener('click', () => {
  el('sectionsMenu').classList.toggle('hidden');
});

document.querySelectorAll('.section-link[data-tab]').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

window.addEventListener('click', (event) => {
  const menu = el('sectionsMenu');
  const btn = el('sectionsBtn');
  if (!menu.contains(event.target) && event.target !== btn) {
    menu.classList.add('hidden');
  }
});

loadCases().catch((err) => setStatus(err.message, true));
renderProfile();
