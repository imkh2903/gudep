const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./db');

// migrate from users.json if exists
const USERS_JSON = path.join(__dirname, '..', 'data', 'users.json');
if (fs.existsSync(USERS_JSON)) {
  try {
    const raw = fs.readFileSync(USERS_JSON, 'utf8');
    const arr = JSON.parse(raw || '[]');
    (async () => {
      const existing = await db.get('SELECT COUNT(*) as c FROM users');
      if (existing && existing.c === 0 && arr.length > 0) {
        for (const u of arr) {
          try {
            await db.run('INSERT OR IGNORE INTO users (id, email, passwordHash, createdAt) VALUES (?,?,?,?)', [u.id || Date.now().toString(), u.email, u.passwordHash, u.createdAt || new Date().toISOString()]);
          } catch (e) { /* ignore */ }
        }
        // keep file as-is for backup
      }
    })();
  } catch (e) { /* ignore */ }
}

async function createUser(email, password) {
  const existing = await db.get('SELECT * FROM users WHERE email = ?', [email]);
  if (existing) throw new Error('User exists');
  const hash = await bcrypt.hash(password, 10);
  const id = Date.now().toString();
  await db.run('INSERT INTO users (id, email, passwordHash, createdAt) VALUES (?,?,?,?)', [id, email, hash, new Date().toISOString()]);
  return { id, email };
}

async function verifyUser(email, password) {
  const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  return { id: user.id, email: user.email };
}

module.exports = { createUser, verifyUser };
