const fs = require('node:fs');
const path = require('node:path');
const { randomId, now } = require('./db');

function weightedPick(items) {
  const total = items.reduce((sum, item) => sum + item.drop_weight, 0);
  let random = Math.random() * total;
  for (const item of items) {
    random -= item.drop_weight;
    if (random <= 0) return item;
  }
  return items[items.length - 1];
}

function sendJson(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function serveStatic(req, res) {
  const reqPath = req.url === '/' ? '/index.html' : req.url;
  const filePath = path.join(__dirname, '..', 'public', reqPath);
  const staticRoot = path.join(__dirname, '..', 'public');

  if (!filePath.startsWith(staticRoot)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return true;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return false;

  const ext = path.extname(filePath);
  const mimeMap = {
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.html': 'text/html'
  };
  res.writeHead(200, { 'Content-Type': mimeMap[ext] || 'text/plain' });
  res.end(fs.readFileSync(filePath));
  return true;
}

function createHandler(db) {
  return async function handler(req, res) {
    try {
      if (req.url.startsWith('/api/')) {
        if (req.method === 'POST' && req.url === '/api/auth/telegram') {
          const { telegramId, username } = await parseBody(req);
          if (!telegramId) return sendJson(res, 400, { error: 'telegramId is required' });
          return sendJson(res, 200, { user: db.getOrCreateUser(telegramId, username) });
        }

        if (req.method === 'GET' && req.url === '/api/cases') {
          return sendJson(res, 200, { cases: db.state.cases.filter((c) => c.active === 1).slice().reverse() });
        }

        if (req.method === 'GET' && req.url.startsWith('/api/users/')) {
          const telegramId = decodeURIComponent(req.url.split('/').pop());
          const user = db.getUserByTelegramId(telegramId);
          if (!user) return sendJson(res, 404, { error: 'User not found' });
          const history = db.state.openings.filter((o) => o.user_id === user.id).slice(-15).reverse();
          const withdrawals = db.state.withdrawals.filter((w) => w.user_id === user.id).slice(-15).reverse();
          const inventory = db.state.inventory.filter((i) => i.user_id === user.id && i.status === 'available').reverse();
          return sendJson(res, 200, { user, history, withdrawals, inventory });
        }

        if (req.method === 'POST' && req.url === '/api/topup') {
          const { telegramId, amount } = await parseBody(req);
          const user = db.getUserByTelegramId(telegramId);
          if (!user) return sendJson(res, 404, { error: 'User not found' });
          if (typeof amount !== 'number' || amount <= 0) {
            return sendJson(res, 400, { error: 'Invalid top-up payload' });
          }

          user.balance_coins += Math.floor(amount);
          db.save();
          return sendJson(res, 200, { message: `Top-up accepted. Payment id ${randomId('pay')}.`, user });
        }

        if (req.method === 'POST' && req.url === '/api/open-case') {
          const { telegramId, caseId } = await parseBody(req);
          const user = db.getUserByTelegramId(telegramId);
          const selectedCase = db.state.cases.find((c) => c.id === Number(caseId) && c.active === 1);
          if (!user || !selectedCase) return sendJson(res, 404, { error: 'User or case not found' });

          const price = selectedCase.price_coins;
          if (user.balance_coins < price) return sendJson(res, 400, { error: 'Insufficient coins balance' });

          const reward = weightedPick(selectedCase.items);
          user.balance_coins -= price;

          db.state.openings.push({
            id: randomId('opn'),
            user_id: user.id,
            case_id: selectedCase.id,
            case_name: selectedCase.name,
            spent: price,
            skin_name: reward.skin_name,
            image_url: reward.image_url,
            rarity: reward.rarity,
            steam_value: reward.steam_value,
            opened_at: now()
          });

          const inventoryItem = {
            id: randomId('inv'),
            user_id: user.id,
            skin_name: reward.skin_name,
            image_url: reward.image_url,
            rarity: reward.rarity,
            steam_value: reward.steam_value,
            source_case_id: selectedCase.id,
            source_case_name: selectedCase.name,
            status: 'available',
            acquired_at: now()
          };
          db.state.inventory.push(inventoryItem);
          db.save();

          return sendJson(res, 200, {
            message: 'Case opened successfully',
            reward,
            inventoryItem,
            user
          });
        }

        if (req.method === 'POST' && req.url === '/api/withdraw') {
          const { telegramId, inventoryItemId, steamTradeUrl } = await parseBody(req);
          const user = db.getUserByTelegramId(telegramId);
          if (!user) return sendJson(res, 404, { error: 'User not found' });
          if (!steamTradeUrl) return sendJson(res, 400, { error: 'steamTradeUrl is required' });

          const item = db.state.inventory.find((i) => i.id === inventoryItemId && i.user_id === user.id);
          if (!item) return sendJson(res, 404, { error: 'Inventory item not found' });
          if (item.status !== 'available') return sendJson(res, 400, { error: 'Item is not available for withdrawal' });
          item.status = 'pending_withdrawal';

          user.steam_trade_url = steamTradeUrl;
          db.state.withdrawals.push({
            id: randomId('wd'),
            user_id: user.id,
            inventory_item_id: item.id,
            skin_name: item.skin_name,
            image_url: item.image_url,
            rarity: item.rarity,
            steam_value: item.steam_value,
            steam_trade_url: steamTradeUrl,
            status: 'pending',
            created_at: now()
          });
          db.save();
          return sendJson(res, 200, { message: 'Withdrawal request created. Admin will process Steam trade offer.' });
        }

        if (req.method === 'GET' && req.url === '/api/admin/overview') {
          return sendJson(res, 200, {
            users: db.state.users.slice().reverse(),
            cases: db.state.cases.slice().reverse(),
            withdrawals: db.state.withdrawals.slice().reverse().slice(0, 50)
          });
        }

        if (req.method === 'POST' && req.url === '/api/admin/cases') {
          const { name, description, priceCoins, imageUrl, items } = await parseBody(req);
          if (!name || !Array.isArray(items) || items.length === 0) {
            return sendJson(res, 400, { error: 'Case name and at least one item are required' });
          }
          const id = Math.max(0, ...db.state.cases.map((c) => c.id)) + 1;
          db.state.cases.push({
            id,
            name,
            description: description || null,
            price_coins: Number(priceCoins || 0),
            image_url:
              imageUrl ||
              'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=900&q=80',
            active: 1,
            items: items.map((i) => ({
              skin_name: i.skinName,
              image_url:
                i.imageUrl ||
                'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=500&q=80',
              rarity: i.rarity || 'common',
              drop_weight: Number(i.dropWeight || 1),
              steam_value: Number(i.steamValue || 0)
            }))
          });
          db.save();
          return sendJson(res, 200, { message: 'Case created', caseId: id });
        }

        if (req.method === 'POST' && req.url === '/api/admin/balance') {
          const { telegramId, coinsDelta = 0 } = await parseBody(req);
          const user = db.getUserByTelegramId(telegramId);
          if (!user) return sendJson(res, 404, { error: 'User not found' });
          user.balance_coins += Number(coinsDelta || 0);
          db.save();
          return sendJson(res, 200, { message: 'Balance updated', user });
        }

        if (req.method === 'POST' && req.url.startsWith('/api/admin/withdrawals/') && req.url.endsWith('/status')) {
          const id = req.url.split('/')[4];
          const { status } = await parseBody(req);
          if (!['pending', 'approved', 'sent', 'rejected'].includes(status)) {
            return sendJson(res, 400, { error: 'Invalid status' });
          }
          const item = db.state.withdrawals.find((w) => w.id === id);
          if (!item) return sendJson(res, 404, { error: 'Withdrawal not found' });
          item.status = status;

          if (item.inventory_item_id) {
            const inv = db.state.inventory.find((invItem) => invItem.id === item.inventory_item_id);
            if (inv) {
              if (status === 'rejected') inv.status = 'available';
              if (status === 'sent') inv.status = 'withdrawn';
            }
          }

          db.save();
          return sendJson(res, 200, { message: 'Withdrawal status updated' });
        }

        return sendJson(res, 404, { error: 'Not found' });
      }

      if (serveStatic(req, res)) return;
      sendJson(res, 404, { error: 'Not found' });
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  };
}

module.exports = { createHandler };
