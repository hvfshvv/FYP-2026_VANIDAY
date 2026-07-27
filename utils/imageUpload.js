const fs = require('fs');
const path = require('path');

const MIME_TO_EXTENSION = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

function detectImageMime(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))) return 'image/gif';
  return null;
}

function removeUploadedFile(file) {
  if (!file?.path) return;
  try {
    fs.unlinkSync(file.path);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('[upload] Failed to remove rejected file:', err.message);
    }
  }
}

function validateUploadedImageFile(file, {
  allowedMimeTypes = Object.keys(MIME_TO_EXTENSION),
  errorMessage = 'Please upload a valid JPG, PNG, WebP, or GIF image.',
} = {}) {
  if (!file) return null;

  const buffer = fs.readFileSync(file.path);
  const detectedMime = detectImageMime(buffer);
  if (!detectedMime || !allowedMimeTypes.includes(detectedMime)) {
    removeUploadedFile(file);
    throw new Error(errorMessage);
  }

  const safeExt = MIME_TO_EXTENSION[detectedMime];
  const currentExt = path.extname(file.path).toLowerCase();
  if (safeExt && currentExt !== safeExt) {
    const nextPath = currentExt
      ? file.path.slice(0, -currentExt.length) + safeExt
      : file.path + safeExt;
    fs.renameSync(file.path, nextPath);
    file.path = nextPath;
    file.filename = path.basename(nextPath);
  }

  file.detectedMime = detectedMime;
  return file;
}

module.exports = {
  detectImageMime,
  validateUploadedImageFile,
};
