const IORedis = require('ioredis');
const host = process.env.REDIS_HOST || '127.0.0.1';
const port = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT,10) : 6379;

console.log(`Checking Redis at ${host}:${port} ...`);
const r = new IORedis({ host, port, connectTimeout: 2000, retryStrategy: null });

r.on('error', (err) => {
  console.error('Redis connection error:', err.message);
  process.exit(2);
});

r.ping().then(res => {
  console.log('Redis ping response:', res);
  r.quit();
}).catch(err => {
  console.error('Ping failed:', err.message);
  r.quit();
  process.exit(2);
});
