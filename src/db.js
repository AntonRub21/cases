const fs = require('node:fs');

function now() {
  return new Date().toISOString();
}

function randomId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

class JsonDb {
  constructor(filePath = 'app.db.json') {
    this.filePath = filePath;
    this.state = {
      users: [],
      cases: [],
      openings: [],
      withdrawals: [],
      inventory: []
    };
    this.load();
  }

  migrate() {
    this.state.users = this.state.users.map((u) => {
      const coinsFromLegacy = Number(u.balance_coins ?? (u.balance_stars || 0) + Number(u.balance_ton || 0) * 300);
      return {
        ...u,
        balance_coins: Number.isFinite(coinsFromLegacy) ? Math.floor(coinsFromLegacy) : 0
      };
    });

    this.state.cases = this.state.cases.map((c) => ({
      ...c,
      price_coins: Number(c.price_coins ?? c.price_stars ?? 0),
      image_url: c.image_url || 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=800&q=80',
      items: (c.items || []).map((i) => ({
        ...i,
        image_url:
          i.image_url ||
          'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=500&q=80'
      }))
    }));
  }

  load() {
    if (this.filePath === ':memory:') return;
    if (!fs.existsSync(this.filePath)) return;

    this.state = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    if (!Array.isArray(this.state.users)) this.state.users = [];
    if (!Array.isArray(this.state.cases)) this.state.cases = [];
    if (!Array.isArray(this.state.openings)) this.state.openings = [];
    if (!Array.isArray(this.state.withdrawals)) this.state.withdrawals = [];
    if (!Array.isArray(this.state.inventory)) this.state.inventory = [];
    this.migrate();
    this.save();
  }

  save() {
    if (this.filePath === ':memory:') return;
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2));
  }

  getOrCreateUser(telegramId, username) {
    let user = this.state.users.find((u) => u.telegram_id === String(telegramId));
    if (!user) {
      user = {
        id: randomId('usr'),
        telegram_id: String(telegramId),
        username: username || null,
        steam_trade_url: null,
        balance_coins: 0,
        is_admin: 0,
        created_at: now()
      };
      this.state.users.push(user);
    } else {
      user.username = username || user.username;
      if (typeof user.balance_coins !== 'number') user.balance_coins = 0;
    }
    this.save();
    return user;
  }

  getUserByTelegramId(telegramId) {
    return this.state.users.find((u) => u.telegram_id === String(telegramId));
  }
}

function seedDefaults(db) {
  if (db.state.cases.length > 0) return;
  db.state.cases = [
    {
      id: 1,
      name: 'Dust II Starter',
      description: 'Fast budget case with clean starter skins',
      price_coins: 250,
      image_url: 'https://images.unsplash.com/photo-1579373903781-fd5c0c30c4cd?auto=format&fit=crop&w=900&q=80',
      active: 1,
      items: [
        { skin_name: 'Glock-18 | Candy Apple', image_url: 'https://images.unsplash.com/photo-1612287230202-1ff1d85d1bdf?auto=format&fit=crop&w=600&q=80', rarity: 'common', drop_weight: 45, steam_value: 1.8 },
        { skin_name: 'MP9 | Dart', image_url: 'https://images.unsplash.com/photo-1560253023-3ec5d502959f?auto=format&fit=crop&w=600&q=80', rarity: 'common', drop_weight: 35, steam_value: 2.2 },
        { skin_name: 'AK-47 | Slate', image_url: 'https://images.unsplash.com/photo-1548686304-89d188a80029?auto=format&fit=crop&w=600&q=80', rarity: 'uncommon', drop_weight: 15, steam_value: 6.5 },
        { skin_name: 'M4A1-S | Nightmare', image_url: 'https://images.unsplash.com/photo-1514924013411-cbf25faa35bb?auto=format&fit=crop&w=600&q=80', rarity: 'rare', drop_weight: 5, steam_value: 24 }
      ]
    },
    {
      id: 2,
      name: 'Dragon Fire Elite',
      description: 'Premium flame collection with epic drop potential',
      price_coins: 850,
      image_url: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=900&q=80',
      active: 1,
      items: [
        { skin_name: 'AWP | Neo-Noir', image_url: 'https://images.unsplash.com/photo-1552820728-8b83bb6b773f?auto=format&fit=crop&w=600&q=80', rarity: 'uncommon', drop_weight: 40, steam_value: 20 },
        { skin_name: 'USP-S | Kill Confirmed', image_url: 'https://images.unsplash.com/photo-1556438064-2d7646166914?auto=format&fit=crop&w=600&q=80', rarity: 'rare', drop_weight: 28, steam_value: 45 },
        { skin_name: 'AK-47 | Neon Rider', image_url: 'https://images.unsplash.com/photo-1586183189334-2703f1b6db6d?auto=format&fit=crop&w=600&q=80', rarity: 'epic', drop_weight: 20, steam_value: 80 },
        { skin_name: 'M4A4 | Howl (Replica)', image_url: 'https://images.unsplash.com/photo-1593305841991-05c297ba4575?auto=format&fit=crop&w=600&q=80', rarity: 'legendary', drop_weight: 12, steam_value: 180 }
      ]
    },
    {
      id: 3,
      name: 'Night Market',
      description: 'Balanced case with stylish purple and pink finishes',
      price_coins: 500,
      image_url: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=900&q=80',
      active: 1,
      items: [
        { skin_name: 'Desert Eagle | Trigger Discipline', image_url: 'https://images.unsplash.com/photo-1603481588273-2f908a9a7a1b?auto=format&fit=crop&w=600&q=80', rarity: 'uncommon', drop_weight: 40, steam_value: 11 },
        { skin_name: 'MAC-10 | Neon Rider', image_url: 'https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=600&q=80', rarity: 'rare', drop_weight: 30, steam_value: 18 },
        { skin_name: 'P90 | Asiimov', image_url: 'https://images.unsplash.com/photo-1511882150382-421056c89033?auto=format&fit=crop&w=600&q=80', rarity: 'epic', drop_weight: 20, steam_value: 35 },
        { skin_name: 'AK-47 | Bloodsport', image_url: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=600&q=80', rarity: 'legendary', drop_weight: 10, steam_value: 95 }
      ]
    }
  ];
  db.save();
}

module.exports = { JsonDb, seedDefaults, randomId, now };
