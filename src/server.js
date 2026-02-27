const http = require('node:http');
const { JsonDb, seedDefaults } = require('./db');
const { createHandler } = require('./app');

const PORT = Number(process.env.PORT || 3000);
const db = new JsonDb(process.env.DB_PATH || 'app.db.json');
seedDefaults(db);

const server = http.createServer(createHandler(db));
server.listen(PORT, () => {
  console.log(`CS2 Telegram App Center running at http://localhost:${PORT}`);
});
