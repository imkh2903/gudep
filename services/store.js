const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();

module.exports = class Store {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.dbPath = path.join(this.dataDir, 'db.json');
    this.seedPath = path.join(this.dataDir, 'seed.json');
    this._lock = false;
    this.data = { users: [], jobs: [], pengurus: [], periode: [] };
    this._load();
  }

  _load() {
    const seedExists = fs.existsSync(this.seedPath);
    const seed = seedExists ? JSON.parse(fs.readFileSync(this.seedPath, 'utf8')) : null;

    if (!fs.existsSync(this.dbPath)) {
      console.log(`[store] ${this.dbPath} not found — fresh start.`);
      if (seed) {
        console.log(`[store] Seeding from ${this.seedPath} (${(seed.users||[]).length} users).`);
        this.data = Object.assign(this.data, seed);
      } else {
        console.warn(`[store] WARNING: no seed.json found at ${this.seedPath} — starting empty.`);
      }
      this._ensureUsers();
      this.save();
      return;
    }

    try {
      this.data = JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));
    } catch (err) {
      console.error('[store] Failed to parse existing db.json, resetting.', err);
      this.data = { users: [], jobs: [], pengurus: [], periode: [] };
    }

    // Self-heal: an existing-but-empty db.json (e.g. left over on a Railway
    // volume from a broken earlier deploy, or a deploy where seed.json
    // wasn't picked up) should not permanently lock the app out of its
    // seed data. Backfill any collection that is empty and present in seed.
    if (seed) {
      let healed = false;
      for (const key of Object.keys(seed)) {
        const current = this.data[key];
        if (!Array.isArray(current) || current.length === 0) {
          if (Array.isArray(seed[key]) && seed[key].length > 0) {
            this.data[key] = seed[key];
            healed = true;
            console.log(`[store] "${key}" was empty — backfilled ${seed[key].length} item(s) from seed.json.`);
          }
        }
      }
      if (healed) this._save_pending = true;
    } else if (!(this.data.users || []).length) {
      console.warn(`[store] WARNING: users collection is empty and no seed.json exists at ${this.seedPath}.`);
    }

    this._ensureUsers();
    if (this._save_pending) { this.save(); this._save_pending = false; }
    console.log(`[store] Loaded ${(this.data.users||[]).length} user(s) from ${this.dbPath}.`);
  }

  _ensureUsers() {
    this.data.users = (this.data.users || []).map(u => {
      if (!u.id) u.id = uuidv4();
      if (!u.createdAt) u.createdAt = new Date().toISOString();
      if (u.password && !u.passwordHash) {
        u.passwordHash = bcrypt.hashSync(u.password, 10);
        delete u.password;
      }
      if (!u.passwordHash) u.passwordHash = u.passwordHash || '';
      return u;
    });
  }

  save() {
    if (this._lock) return;
    this._lock = true;
    try {
      fs.mkdirSync(this.dataDir, { recursive: true });
      fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), 'utf8');
    } finally { this._lock = false; }
  }

  getUsers() {
    return (this.data.users || []).map(u => ({ id: u.id, email: u.email, role: u.role, createdAt: u.createdAt }));
  }

  findUserByEmail(email) {
    return (this.data.users || []).find(u => u.email && u.email.toLowerCase() === (email||'').toLowerCase());
  }

  addUser(email, password, role) {
    if (this.findUserByEmail(email)) throw new Error('email_exists');
    const u = { id: uuidv4(), email, role: role || 'user', createdAt: new Date().toISOString() };
    u.passwordHash = bcrypt.hashSync(password, 10);
    this.data.users.push(u);
    this.save();
    return { id: u.id, email: u.email, role: u.role };
  }

  resetPassword(id, newPassword) {
    const u = (this.data.users || []).find(x => x.id === id);
    if (!u) throw new Error('not_found');
    u.passwordHash = bcrypt.hashSync(newPassword, 10);
    this.save();
  }

  addJob(job) {
    this.data.jobs = this.data.jobs || [];
    this.data.jobs.push(job);
    this.save();
  }

  getJobs() {
    return this.data.jobs || [];
  }

  findJob(id) { return (this.data.jobs||[]).find(j=>j.id===id); }
};