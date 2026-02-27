const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { JsonDb, seedDefaults } = require('../src/db');
const { createHandler } = require('../src/app');

async function withServer(run) {
  const db = new JsonDb(':memory:');
  seedDefaults(db);
  const server = http.createServer(createHandler(db));
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function api(path, method = 'GET', body) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    return { status: res.status, body: await res.json() };
  }

  try {
    await run(api);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('open case adds item to inventory and allows withdrawal request', async () => {
  await withServer(async (api) => {
    await api('/api/auth/telegram', 'POST', { telegramId: '111', username: 'alice' });
    await api('/api/topup', 'POST', { telegramId: '111', amount: 1000 });

    const cases = await api('/api/cases');
    const open = await api('/api/open-case', 'POST', {
      telegramId: '111',
      caseId: cases.body.cases[0].id
    });
    assert.equal(open.status, 200);
    assert.ok(open.body.inventoryItem.id);

    const user = await api('/api/users/111');
    assert.ok(user.body.inventory.length >= 1);

    const wd = await api('/api/withdraw', 'POST', {
      telegramId: '111',
      inventoryItemId: user.body.inventory[0].id,
      steamTradeUrl: 'https://steamcommunity.com/tradeoffer/new/?partner=1&token=abc'
    });
    assert.equal(wd.status, 200);
  });
});

test('admin can create case and adjust coin balances', async () => {
  await withServer(async (api) => {
    await api('/api/auth/telegram', 'POST', { telegramId: '222', username: 'bob' });

    const createCase = await api('/api/admin/cases', 'POST', {
      name: 'Admin Case',
      description: 'desc',
      imageUrl: 'https://example.com/case.jpg',
      priceCoins: 500,
      items: [{ skinName: 'P250 | Sand Dune', imageUrl: 'https://example.com/skin.jpg', rarity: 'common', dropWeight: 100, steamValue: 0.5 }]
    });
    assert.equal(createCase.status, 200);

    const adj = await api('/api/admin/balance', 'POST', { telegramId: '222', coinsDelta: 100 });
    assert.equal(adj.status, 200);

    const userRes = await api('/api/users/222');
    assert.equal(userRes.body.user.balance_coins, 100);
  });
});
