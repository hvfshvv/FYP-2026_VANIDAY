require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const galleryModel = require('../models/galleryModel');

function detectedImageMime(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

async function migrateGalleryImages() {
  await galleryModel.ensureGallerySchema();
  const [posts] = await db.query(
    `SELECT post_id, image_path
     FROM gallery_post
     WHERE image_data IS NULL
       AND image_path LIKE '/images/gallery/%'`
  );

  let migrated = 0;
  for (const post of posts) {
    const localPath = path.join(__dirname, '..', 'public', post.image_path.replace(/^\//, ''));
    if (!fs.existsSync(localPath)) {
      console.warn(`Skipped post ${post.post_id}: local image not found.`);
      continue;
    }

    const imageData = fs.readFileSync(localPath);
    const imageMime = detectedImageMime(imageData);
    if (!imageMime) {
      console.warn(`Skipped post ${post.post_id}: invalid image file.`);
      continue;
    }

    await db.query(
      'UPDATE gallery_post SET image_data = ?, image_mime = ? WHERE post_id = ?',
      [imageData, imageMime, post.post_id]
    );
    migrated += 1;
  }

  console.log(`Migrated ${migrated} gallery image(s) into shared database storage.`);
}

migrateGalleryImages()
  .catch(err => {
    console.error('Gallery image migration failed:', err);
    process.exitCode = 1;
  })
  .finally(() => db.end());
