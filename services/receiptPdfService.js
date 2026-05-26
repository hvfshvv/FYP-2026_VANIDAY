const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function escapePdfText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function fmtDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('en-SG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function fmtTime(value) {
  return String(value || '-').slice(0, 5);
}

function money(value) {
  return `S$${Number(value || 0).toFixed(2)}`;
}

function shortText(value, maxLength = 58) {
  const text = String(value || '').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255,
  ];
}

function textWidth(value, size) {
  return String(value ?? '').length * size * 0.52;
}

function readPngChunks(buffer) {
  const signature = buffer.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') return null;

  const chunks = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    chunks.push({ type, data });
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  return chunks;
}

function unfilterPngScanlines(raw, width, height, bytesPerPixel) {
  const stride = width * bytesPerPixel;
  const result = Buffer.alloc(stride * height);
  let inputOffset = 0;
  let outputOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = raw[inputOffset];
    inputOffset += 1;

    for (let x = 0; x < stride; x += 1) {
      const current = raw[inputOffset + x];
      const left = x >= bytesPerPixel ? result[outputOffset + x - bytesPerPixel] : 0;
      const up = y > 0 ? result[outputOffset + x - stride] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? result[outputOffset + x - stride - bytesPerPixel] : 0;
      let value;

      if (filter === 0) value = current;
      else if (filter === 1) value = current + left;
      else if (filter === 2) value = current + up;
      else if (filter === 3) value = current + Math.floor((left + up) / 2);
      else {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        const predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        value = current + predictor;
      }

      result[outputOffset + x] = value & 255;
    }

    inputOffset += stride;
    outputOffset += stride;
  }

  return result;
}

function buildLogoImageObject() {
  const logoPath = path.join(__dirname, '..', 'public', 'images', 'uniday-logo.png');
  if (!fs.existsSync(logoPath)) return null;
  const png = fs.readFileSync(logoPath);
  const chunks = readPngChunks(png);
  if (!chunks) return null;

  const ihdr = chunks.find(chunk => chunk.type === 'IHDR')?.data;
  const idat = Buffer.concat(chunks.filter(chunk => chunk.type === 'IDAT').map(chunk => chunk.data));
  if (!ihdr || !idat.length) return null;

  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8];
  const colorType = ihdr[9];
  if (bitDepth !== 8 || ![2, 6].includes(colorType)) return null;

  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(idat);
  const pixels = unfilterPngScanlines(raw, width, height, bytesPerPixel);
  const rgb = Buffer.alloc(width * height * 3);
  const bg = [255, 241, 242];

  for (let i = 0, j = 0; i < pixels.length; i += bytesPerPixel, j += 3) {
    const alpha = colorType === 6 ? pixels[i + 3] / 255 : 1;
    rgb[j] = Math.round(pixels[i] * alpha + bg[0] * (1 - alpha));
    rgb[j + 1] = Math.round(pixels[i + 1] * alpha + bg[1] * (1 - alpha));
    rgb[j + 2] = Math.round(pixels[i + 2] * alpha + bg[2] * (1 - alpha));
  }

  const compressed = zlib.deflateSync(rgb);
  return `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n${compressed.toString('binary')}\nendstream`;
}

function buildReceiptPdf({ booking, payment }) {
  const reference = payment?.payment_ref || payment?.transaction_ref || `BK-${booking.booking_id}`;
  const receiptNo = `UNI-${String(booking.booking_id).padStart(6, '0')}`;
  const subtotal = Number(booking.total_amount || booking.price || 0);
  const promoDiscount = Number(booking.discount_amount || 0);
  const voucherDiscount = Number(booking.voucher_discount_amount || 0);
  const totalPaid = Number(payment?.amount || booking.payable_amount || Math.max(subtotal - promoDiscount - voucherDiscount, 0));
  const promoLabel = booking.promo_title || 'Promotion';
  const voucherLabel = booking.voucher_name || 'Voucher';
  const paymentMethod = String(payment?.payment_method || '-').toUpperCase();
  const paidAt = payment?.paid_at ? fmtDate(payment.paid_at) : fmtDate(new Date());
  const accent = hexToRgb('#e11d48');
  const ink = hexToRgb('#1f2937');
  const muted = hexToRgb('#6b7280');
  const border = hexToRgb('#d1d5db');
  const soft = hexToRgb('#fff1f2');

  const commands = [];
  const setColor = rgb => commands.push(`${rgb.map(v => v.toFixed(3)).join(' ')} rg`);
  const setStroke = rgb => commands.push(`${rgb.map(v => v.toFixed(3)).join(' ')} RG`);
  const rect = (x, y, w, h, fill = false) => commands.push(`${x} ${y} ${w} ${h} re ${fill ? 'f' : 'S'}`);
  const line = (x1, y1, x2, y2) => commands.push(`${x1} ${y1} m ${x2} ${y2} l S`);
  const txt = (value, x, y, size = 10, font = 'F1', color = ink) => {
    setColor(color);
    commands.push('BT', `/${font} ${size} Tf`, `${x} ${y} Td`, `(${escapePdfText(value)}) Tj`, 'ET');
  };
  const txtRight = (value, rightX, y, size = 10, font = 'F1', color = ink) => {
    txt(value, rightX - textWidth(value, size), y, size, font, color);
  };

  commands.push('1 w');

  setColor(soft);
  rect(0, 742, 595, 100, true);
  setColor(accent);
  rect(0, 742, 595, 6, true);

  const logoObject = buildLogoImageObject();
  if (logoObject) {
    commands.push('q', '46 0 0 46 72 772 cm', '/Logo Do', 'Q');
  } else {
    setColor(accent);
    commands.push('72 771 46 46 re f');
    txt('U', 88, 786, 18, 'F2', [1, 1, 1]);
  }

  txt('uniday', 128, 796, 25, 'F2', accent);
  txt('Beauty & wellness booking receipt', 130, 779, 10, 'F1', muted);
  txtRight('RECEIPT', 523, 798, 23, 'F2', ink);
  txtRight(receiptNo, 523, 779, 9, 'F1', muted);

  txt('Billed To', 72, 710, 10, 'F2', accent);
  setStroke(border);
  line(72, 704, 238, 704);
  txt(booking.customer_name || '-', 72, 686, 11, 'F1', ink);
  txt(booking.customer_phone || '', 72, 670, 9, 'F1', muted);

  txt('Appointment', 312, 710, 10, 'F2', accent);
  line(312, 704, 523, 704);
  txt(booking.merchant_name || '-', 312, 686, 11, 'F1', ink);
  txt(`${fmtDate(booking.booking_date)} at ${fmtTime(booking.booking_time)}`, 312, 670, 9, 'F1', muted);
  txt(`Staff: ${booking.staff_name || 'Any Available Staff'}`, 312, 654, 9, 'F1', muted);

  txt('Receipt No', 72, 626, 9, 'F2', muted);
  txt(receiptNo, 180, 626, 9, 'F1', ink);
  txt('Payment Date', 72, 608, 9, 'F2', muted);
  txt(paidAt, 180, 608, 9, 'F1', ink);
  txt('Payment Method', 312, 626, 9, 'F2', muted);
  txt(paymentMethod, 430, 626, 9, 'F1', ink);
  txt('Booking ID', 312, 608, 9, 'F2', muted);
  txt(`#${booking.booking_id}`, 430, 608, 9, 'F1', ink);
  txt('Stripe Reference', 72, 586, 8, 'F2', muted);
  txt(reference, 180, 586, 7.5, 'F1', muted);

  setColor(accent);
  rect(72, 555, 451, 26, true);
  txt('DESCRIPTION', 88, 564, 9, 'F2', [1, 1, 1]);
  txtRight('QTY', 378, 564, 9, 'F2', [1, 1, 1]);
  txtRight('UNIT PRICE', 464, 564, 9, 'F2', [1, 1, 1]);
  txtRight('TOTAL', 512, 564, 9, 'F2', [1, 1, 1]);

  setStroke(border);
  rect(72, 515, 451, 40);
  line(360, 515, 360, 555);
  line(408, 515, 408, 555);
  line(472, 515, 472, 555);
  txt(booking.service_name || 'Booking service', 88, 535, 10, 'F1', ink);
  txt(`${booking.duration_mins || 60} min`, 88, 521, 8, 'F1', muted);
  txtRight('1', 382, 531, 10, 'F1', ink);
  txtRight(money(subtotal), 462, 531, 10, 'F1', ink);
  txtRight(money(subtotal), 515, 531, 10, 'F1', ink);

  const totalsLabelX = 360;
  const totalsAmountX = 523;
  txt('Subtotal', totalsLabelX, 475, 10, 'F2', ink);
  txtRight(money(subtotal), totalsAmountX, 475, 10, 'F1', ink);
  let totalsY = 453;
  if (promoDiscount > 0) {
    txt('Promotion discount:', totalsLabelX, totalsY, 9, 'F2', ink);
    txtRight(`-${money(promoDiscount)}`, totalsAmountX, totalsY, 9, 'F1', accent);
    txt(shortText(promoLabel, 40), totalsLabelX, totalsY - 14, 8, 'F1', muted);
    totalsY -= 34;
  }
  if (voucherDiscount > 0) {
    txt('Voucher discount:', totalsLabelX, totalsY, 9, 'F2', ink);
    txtRight(`-${money(voucherDiscount)}`, totalsAmountX, totalsY, 9, 'F1', accent);
    txt(shortText(voucherLabel, 40), totalsLabelX, totalsY - 14, 8, 'F1', muted);
    totalsY -= 34;
  }
  const totalLineY = totalsY - 4;
  const totalY = totalLineY - 22;
  setStroke(ink);
  line(360, totalLineY, 523, totalLineY);
  txt('Total Paid', totalsLabelX, totalY, 13, 'F2', ink);
  txtRight(money(totalPaid), totalsAmountX, totalY, 13, 'F2', accent);

  setColor(soft);
  rect(72, 340, 451, 54, true);
  txt('Notes', 92, 371, 10, 'F2', accent);
  txt('Thank you for booking with Uniday. Please show this receipt if needed during your visit.', 92, 354, 9, 'F1', ink);

  txt('This receipt confirms payment received for your Uniday booking.', 72, 96, 8, 'F1', muted);

  const stream = commands.join('\n');
  const resources = logoObject
    ? '/Resources << /Font << /F1 4 0 R /F2 5 0 R >> /XObject << /Logo 7 0 R >> >>'
    : '/Resources << /Font << /F1 4 0 R /F2 5 0 R >> >>';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ${resources} /Contents 6 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    `<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream`,
  ];
  if (logoObject) objects.push(logoObject);

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'binary'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, 'binary');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'binary');
}

module.exports = { buildReceiptPdf };
