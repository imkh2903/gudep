const { Worker, Queue } = require('bullmq');
const IORedis = require('ioredis');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');
const storage = require('./services/storage');

const connection = new IORedis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379
});

const ingestionQueue = new Queue('ingest', { connection });

const worker = new Worker('ingest', async job => {
  const { filePath, filename } = job.data;
  console.log('Worker: processing', filePath);
  const rowsProcessed = await processCsv(filePath);
  // upload original file to storage for audit
  const storeInfo = await storage.uploadFile(filePath, filename);
  console.log('Worker: stored file ->', storeInfo.url);
  return { rowsProcessed, storeInfo };
}, { connection });

worker.on('completed', (job, result) => {
  console.log('Job completed', job.id, result);
});
worker.on('failed', (job, err) => {
  console.error('Job failed', job.id, err);
});

async function processCsv(localPath) {
  return new Promise((resolve, reject) => {
    let count = 0;
    const parser = fs.createReadStream(localPath).pipe(parse({ columns: true, skip_empty_lines: true }));
    parser.on('data', () => { count++; });
    parser.on('end', () => resolve(count));
    parser.on('error', (err) => reject(err));
  });
}

console.log('Worker started');

// graceful shutdown
process.on('SIGINT', async () => { await worker.close(); await connection.quit(); process.exit(0); });
