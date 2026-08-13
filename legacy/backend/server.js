const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { parse } = require('csv-parse');

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const session = require('express-session');
const IORedis = require('ioredis');
const { Queue } = require('bullmq');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// multer storage for uploads (disk)
const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, UPLOAD_DIR); },
  filename: function (req, file, cb) {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// session configuration: use Redis store when REDIS_HOST is provided
let redisClientForSession = null;
let sessionStoreOptions = undefined;
if (process.env.REDIS_HOST) {
  try {
    const connectRedis = require('connect-redis');
    redisClientForSession = new IORedis({ host: process.env.REDIS_HOST, port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT,10):6379 });
    const RedisStore = connectRedis(session);
    sessionStoreOptions = new RedisStore({ client: redisClientForSession });
    console.log('Using Redis session store:', process.env.REDIS_HOST);
  } catch (e) {
    console.warn('Redis session store unavailable, falling back to memory store', e.message);
  }
}

const sessSecret = process.env.SESSION_SECRET;
if (!sessSecret && process.env.NODE_ENV === 'production') {
  console.error('SESSION_SECRET is required in production. Set environment variable SESSION_SECRET to a secure value.');
  process.exit(1);
}
app.use(session({
  store: sessionStoreOptions,
  secret: sessSecret || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: process.env.NODE_ENV === 'production' }
}));

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// login/register endpoints (email + password)
const auth = require('./services/auth');

app.post('/api/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email & password required' });
  try {
    const user = await auth.createUser(email, password);
    req.session.authenticated = true;
    req.session.user = user;
    return res.json({ ok: true, user });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email & password required' });
  try {
    const user = await auth.verifyUser(email, password);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    req.session.authenticated = true;
    req.session.user = user;
    return res.json({ ok: true, user });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// job status endpoints
const redisConnection = new IORedis({ host: process.env.REDIS_HOST || '127.0.0.1', port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT,10):6379 });
const jobQueue = new Queue('ingest', { connection: redisConnection });

// user management (requires auth)
const dbHelper = require('./services/db');
const bcrypt = require('bcryptjs');

app.get('/api/users', requireAuth, async (req, res) => {
  try {
    const users = await dbHelper.all('SELECT id, email, createdAt FROM users ORDER BY createdAt DESC');
    return res.json({ users });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post('/api/users/:id/reset-password', requireAuth, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'password required' });
    const hash = await bcrypt.hash(password, 10);
    await dbHelper.run('UPDATE users SET passwordHash = ? WHERE id = ?', [hash, req.params.id]);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/jobs', requireAuth, async (req, res) => {
  try {
    const types = ['waiting','active','completed','failed','delayed'];
    const jobs = await jobQueue.getJobs(types, 0, 100);
    const mapped = jobs.map(j => ({ id: j.id, name: j.name, data: j.data, attemptsMade: j.attemptsMade, finishedOn: j.finishedOn, processedOn: j.processedOn, returnvalue: j.returnvalue, failedReason: j.failedReason, progress: j.progress, state: j.state }));
    return res.json({ jobs: mapped });
  } catch (e) {
    console.error('jobs error', e);
    return res.status(500).json({ error: e.message });
  }
});

app.post('/api/jobs/:id/retry', requireAuth, async (req, res) => {
  try {
    const job = await jobQueue.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    await jobQueue.add('ingest-file', job.data);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const filePath = req.file.path;
  const ext = path.extname(req.file.originalname).toLowerCase();

  // enqueue job to Redis/BullMQ for async processing
  try {
    const connection = new IORedis({ host: process.env.REDIS_HOST || 'redis', port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT,10):6379 });
    const queue = new Queue('ingest', { connection });
    await queue.add('ingest-file', { filePath, filename: req.file.filename });
  } catch (e) {
    console.warn('Failed to enqueue job, falling back to inline preview', e.message);
  }

  // simple CSV parse preview (first 10 rows)
  if (ext === '.csv' || req.file.mimetype === 'text/csv') {
    const rows = [];
    const parser = fs.createReadStream(filePath).pipe(parse({ columns: true, skip_empty_lines: true }));
    let count = 0;
    parser.on('data', (record) => {
      count++;
      if (count <= 10) rows.push(record);
    });
    parser.on('end', () => {
      return res.json({ status: 'ok', type: 'csv', filename: req.file.filename, preview: rows, rowsQueued: true });
    });
    parser.on('error', (err) => {
      return res.status(500).json({ error: 'Failed parsing CSV', detail: err.message });
    });
  } else {
    // For other types, return basic info and let worker handle heavy parsing in future
    return res.json({ status: 'ok', type: ext || req.file.mimetype, filename: req.file.filename, queued: true });
  }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
