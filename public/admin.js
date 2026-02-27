const el = (id) => document.getElementById(id);

function setStatus(message, isError = false) {
  const node = el('status');
  node.textContent = message;
  node.style.color = isError ? '#f87171' : '#22c55e';
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

async function loadOverview() {
  const data = await api('/api/admin/overview');

  const users = el('users');
  users.innerHTML = '';
  data.users.slice(0, 15).forEach((u) => {
    const li = document.createElement('li');
    li.textContent = `${u.telegram_id} (${u.username || 'no username'}) — ${u.balance_coins || 0} Coins`;
    users.appendChild(li);
  });

  const withdrawals = el('withdrawals');
  withdrawals.innerHTML = '';
  data.withdrawals.forEach((w) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div><strong>${w.skin_name}</strong> • ${w.status} • user ${w.user_id}</div>
      <div class="actions">
        <button data-id="${w.id}" data-status="approved">Approve</button>
        <button data-id="${w.id}" data-status="sent">Mark Sent</button>
        <button data-id="${w.id}" data-status="rejected">Reject</button>
      </div>
    `;
    withdrawals.appendChild(li);
  });
}

el('createCaseBtn').addEventListener('click', async () => {
  try {
    const items = JSON.parse(el('adminItems').value || '[]');
    await api('/api/admin/cases', 'POST', {
      name: el('adminCaseName').value,
      description: el('adminCaseDescription').value,
      imageUrl: el('adminCaseImage').value,
      priceCoins: Number(el('adminCaseCoins').value || 0),
      items
    });
    await loadOverview();
    setStatus('Case created');
  } catch (err) {
    setStatus(err.message, true);
  }
});

el('adjustBalanceBtn').addEventListener('click', async () => {
  try {
    await api('/api/admin/balance', 'POST', {
      telegramId: el('adminTargetTelegramId').value,
      coinsDelta: Number(el('adminCoinsDelta').value || 0)
    });
    await loadOverview();
    setStatus('Balance updated');
  } catch (err) {
    setStatus(err.message, true);
  }
});

el('withdrawals').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-id]');
  if (!button) return;

  try {
    await api(`/api/admin/withdrawals/${button.dataset.id}/status`, 'POST', { status: button.dataset.status });
    await loadOverview();
    setStatus(`Withdrawal #${button.dataset.id} updated`);
  } catch (err) {
    setStatus(err.message, true);
  }
});

loadOverview().catch((err) => setStatus(err.message, true));
