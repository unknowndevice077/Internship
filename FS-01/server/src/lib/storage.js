import fs from 'node:fs/promises';
import path from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import config from '../config.js';

export const LOCAL_UPLOAD_DIR = path.resolve('uploads');

let s3;
function getS3() {
  if (!s3) s3 = new S3Client({ region: config.s3.region });
  return s3;
}

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const ALLOWED_TYPES = Object.keys(EXT);

// no S3_BUCKET = save to ./uploads so local dev works offline
export async function uploadImage(file, folder = 'products') {
  const key = `${folder}/${Date.now()}-${crypto.randomUUID()}.${EXT[file.mimetype]}`;

  if (!config.s3.bucket) {
    const dest = path.join(LOCAL_UPLOAD_DIR, key);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, file.buffer);
    return `/uploads/${key}`;
  }

  await getS3().send(
    new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      CacheControl: 'public, max-age=31536000',
    }),
  );
  const base = config.s3.publicUrl || `https://${config.s3.bucket}.s3.${config.s3.region}.amazonaws.com`;
  return `${base}/${key}`;
}
