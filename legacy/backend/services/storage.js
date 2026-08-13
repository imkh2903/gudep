const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const Minio = require('minio');
const fs = require('fs');
const path = require('path');

// Simple wrapper: if MINIO_ENDPOINT set, use MinIO; otherwise fallback to local filesystem
const useMinio = !!process.env.MINIO_ENDPOINT;

let minioClient;
if (useMinio) {
  minioClient = new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT,
    port: parseInt(process.env.MINIO_PORT || '9000', 10),
    useSSL: (process.env.MINIO_USE_SSL || 'false') === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minio',
    secretKey: process.env.MINIO_SECRET_KEY || 'minio123'
  });
}

const uploadLocal = async (localPath, destName) => {
  const outDir = path.join(__dirname, '..', 'uploads_stored');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const dest = path.join(outDir, destName);
  await fs.promises.copyFile(localPath, dest);
  return { url: dest, storage: 'local' };
};

const uploadMinio = async (localPath, destName) => {
  const bucket = process.env.MINIO_BUCKET || 'uploads';
  // ensure bucket exists
  try { await minioClient.makeBucket(bucket); } catch (e) { /* ignore if exists */ }
  await minioClient.fPutObject(bucket, destName, localPath);
  const protocol = (process.env.MINIO_USE_SSL || 'false') === 'true' ? 'https' : 'http';
  const url = `${protocol}://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT || 9000}/${bucket}/${destName}`;
  return { url, storage: 'minio' };
};

module.exports = {
  uploadFile: async (localPath, destName) => {
    if (useMinio) return uploadMinio(localPath, destName);
    return uploadLocal(localPath, destName);
  }
};