const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const Store = require('./services/store');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret';
const IS_PROD = process.env.NODE_ENV === 'production';

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });

const store = new Store(DATA_DIR);
const app = express();

// Railway (and most PaaS) sit behind a reverse proxy — without this,
// express-session's `cookie.secure` check sees http internally and
// silently drops the session cookie.
app.set('trust proxy', 1);

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    secure: IS_PROD,
    sameSite: 'lax'
  }
}));

// static assets
app.use('/', express.static(path.join(__dirname, 'public')));

// file upload
const upload = multer({ dest: path.join(DATA_DIR, 'uploads') });

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  res.status(401).json({ error: 'unauthorized' });
}

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email/password required' });
  const user = store.findUserByEmail(email);
  if (!user) return res.status(401).json({ error: 'invalid' });
  const ok = await bcrypt.compare(password, user.passwordHash || '');
  if (!ok) return res.status(401).json({ error: 'invalid' });
  req.session.userId = user.id;
  res.json({ ok: true, user: { id: user.id, email: user.email, role: user.role } });
});

app.post('/api/register', async (req, res) => {
  if (process.env.ALLOW_DEMO_LOGIN !== 'true') return res.status(403).json({ error: 'registration disabled' });
  const { email, password, role } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email/password required' });
  try {
    const u = store.addUser(email, password, role || 'user');
    req.session.userId = u.id;
    res.json({ ok: true, user: { id: u.id, email: u.email } });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    res.json({ ok: true });
  });
});

// Generic collection endpoints expected by frontend (json-server style)
const ALLOWED_COLLECTIONS = ['users','pengurus','periode','jabatan','anggota','dokumen_surat','kegiatan_agenda'];

function getCollection(name) {
  if (!ALLOWED_COLLECTIONS.includes(name)) return null;
  // ensure array exists
  store.data[name] = store.data[name] || [];
  return store.data[name];
}

// Never let passwordHash (or a leftover plaintext password) leave the server.
function sanitize(c, item) {
  if (c !== 'users' || !item) return item;
  const { passwordHash, password, ...safe } = item;
  return safe;
}

// List
app.get('/:collection', (req, res, next) => {
  const c = req.params.collection;
  if (!ALLOWED_COLLECTIONS.includes(c)) return next();
  res.json(getCollection(c).map(item => sanitize(c, item)));
});

// Get by id
app.get('/:collection/:id', (req, res, next) => {
  const c = req.params.collection;
  if (!ALLOWED_COLLECTIONS.includes(c)) return next();
  const item = getCollection(c).find(x => String(x.id) === String(req.params.id));
  if (!item) return res.status(404).json({});
  res.json(sanitize(c, item));
});

// Create
app.post('/:collection', (req, res, next) => {
  const c = req.params.collection;
  if (!ALLOWED_COLLECTIONS.includes(c)) return next();
  // Allow if demo mode enabled or session exists
  if (process.env.ALLOW_DEMO_LOGIN !== 'true' && !(req.session && req.session.userId)) return res.status(401).json({ error: 'unauthorized' });
  const payload = req.body || {};
  // special handling for users: require password
  if (c === 'users') {
    if (!payload.email || !payload.password) return res.status(400).json({ error: 'email/password required' });
    // create via store.addUser to handle hashing and uniqueness
    try {
      const u = store.addUser(payload.email, payload.password, payload.role || 'user');
      return res.status(201).json(u);
    } catch (err) { return res.status(400).json({ error: err.message }); }
  }
  // generic
  const item = Object.assign({}, payload);
  if (!item.id) item.id = uuidv4();
  item.createdAt = item.createdAt || new Date().toISOString();
  getCollection(c).push(item);
  store.save();
  res.status(201).json(sanitize(c, item));
});

// Update
app.put('/:collection/:id', (req, res, next) => {
  const c = req.params.collection;
  if (!ALLOWED_COLLECTIONS.includes(c)) return next();
  if (process.env.ALLOW_DEMO_LOGIN !== 'true' && !(req.session && req.session.userId)) return res.status(401).json({ error: 'unauthorized' });
  const id = req.params.id;
  const payload = req.body || {};
  const col = getCollection(c);
  const idx = col.findIndex(x => String(x.id) === String(id));
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  // prevent overwriting id
  payload.id = col[idx].id;
  payload.createdAt = col[idx].createdAt || payload.createdAt || new Date().toISOString();
  col[idx] = Object.assign({}, col[idx], payload);
  // handle password reset for users
  if (c === 'users' && payload.password) {
    col[idx].passwordHash = bcrypt.hashSync(payload.password, 10);
    delete col[idx].password;
  }
  store.save();
  res.json(sanitize(c, col[idx]));
});

// Delete
app.delete('/:collection/:id', (req, res, next) => {
  const c = req.params.collection;
  if (!ALLOWED_COLLECTIONS.includes(c)) return next();
  if (process.env.ALLOW_DEMO_LOGIN !== 'true' && !(req.session && req.session.userId)) return res.status(401).json({ error: 'unauthorized' });
  const id = req.params.id;
  const col = getCollection(c);
  const idx = col.findIndex(x => String(x.id) === String(id));
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  col.splice(idx,1);
  store.save();
  res.json({});
});

app.get('/api/users', requireAuth, (req, res) => {
  res.json({ users: store.getUsers() });
});

app.post('/api/users/:id/reset-password', requireAuth, (req, res) => {
  const id = req.params.id;
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'password required' });
  try {
    store.resetPassword(id, password);
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.get('/api/jobs', requireAuth, (req, res) => {
  res.json({ jobs: store.getJobs() });
});

app.post('/api/jobs/:id/retry', requireAuth, (req, res) => {
  const id = req.params.id;
  const j = store.findJob(id);
  if (!j) return res.status(404).json({ error: 'not found' });
  // naive: set state back to waiting
  j.state = 'retrying';
  store.save();
  res.json({ ok: true });
});

app.post('/api/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file required' });
  const id = uuidv4();
  const job = {
    id,
    name: req.file.originalname,
    data: { path: req.file.path },
    state: 'completed',
    createdAt: new Date().toISOString()
  };
  store.addJob(job);
  res.json({ ok: true, job });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Fallback to index.html
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('Server listening on', PORT);
});