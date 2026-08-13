This repo now has a simple POC for file upload. To enqueue a job programmatically, the server should push to BullMQ 'ingest' queue. Example (Node.js):

const { Queue } = require('bullmq');
const IORedis = require('ioredis');
const connection = new IORedis({ host: process.env.REDIS_HOST || 'redis' });
const queue = new Queue('ingest', { connection });
queue.add('job-name', { filePath: '/app/uploads/xxxx.csv', filename: 'xxxx.csv' });

