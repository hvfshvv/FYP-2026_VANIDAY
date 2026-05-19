require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const qrService = require('../services/qrService');

const ADMIN = {
  name: 'Uniday Admin',
  email: 'admin@uniday.com',
  phone: '60000000',
  password: 'Admin2026',
};

const MERCHANTS = [
  {
    user: { name: 'Luxe Nail Bar', email: 'luxenail@uniday.com', phone: '62345678' },
    biz: { name: 'Luxe Nail Bar', category: 'Nails', address: '391 Orchard Road, #B2-38, Ngee Ann City, Singapore 238872' },
    services: [
      { name: 'Gel Manicure', desc: 'Long-lasting gel polish with base & top coat', price: 38, dur: 45 },
      { name: 'Gel Pedicure', desc: 'Soak & gel polish with cuticle care', price: 45, dur: 60 },
      { name: 'Nail Art Extension', desc: 'Acrylic/gel extension with custom nail art', price: 90, dur: 90 },
      { name: 'Classic Manicure', desc: 'File, shape, buff & regular polish', price: 25, dur: 30 },
      { name: 'Spa Pedicure', desc: 'Foot soak, scrub, massage & polish', price: 55, dur: 75 },
    ],
    promos: [{ title: 'Mani-Pedi Bundle', desc: 'Gel mani + pedi at a bundle price!', pct: 15, start: '2026-05-01', end: '2026-06-30' }],
    featured: { title: 'Luxe Nail Bar — Nail Goals ✨', desc: 'Go-to nail studio for gel manis, nail art & pedicures at Ngee Ann City.' },
  },
  {
    user: { name: 'The Spa Sanctuary', email: 'spa@uniday.com', phone: '63456789' },
    biz: { name: 'The Spa Sanctuary', category: 'Spa', address: '1 Raffles Place, #05-01, One Raffles Place, Singapore 048616' },
    services: [
      { name: 'Swedish Massage', desc: 'Relaxing full-body Swedish massage', price: 90, dur: 60 },
      { name: 'Deep Tissue Massage', desc: 'Targeted deep-tissue relief for muscle tension', price: 110, dur: 75 },
      { name: 'Hot Stone Massage', desc: 'Warm volcanic stones + aromatherapy oils', price: 130, dur: 90 },
      { name: 'Aromatherapy Facial', desc: 'Calming essential oil facial with masque', price: 85, dur: 60 },
      { name: 'Body Scrub & Wrap', desc: 'Full-body exfoliation + nourishing body wrap', price: 120, dur: 90 },
    ],
    promos: [{ title: 'Weekday Wellness', desc: 'Book any massage Mon–Thu and save 25%', pct: 25, start: '2026-05-01', end: '2026-07-31' }],
    featured: { title: 'The Spa Sanctuary — Total Bliss 💆', desc: 'Award-winning urban spa in Raffles Place. Swedish, deep tissue & hot stone massages.' },
  },
  {
    user: { name: 'Hair Republic', email: 'hairrepublic@uniday.com', phone: '64567890' },
    biz: { name: 'Hair Republic', category: 'Hair', address: '200 Victoria Street, #03-22, Bugis Junction, Singapore 188021', image: '/images/merchants/hair-republic.jpg' },
    services: [
      { name: 'Haircut & Blowdry', desc: 'Precision cut + professional blowdry', price: 55, dur: 60 },
      { name: 'Hair Colouring', desc: 'Single-process colour with treatment', price: 120, dur: 120 },
      { name: 'Balayage & Highlights', desc: 'Hand-painted balayage or foil highlights', price: 200, dur: 150 },
      { name: 'Keratin Treatment', desc: 'Brazilian keratin smoothing treatment', price: 280, dur: 180 },
      { name: 'Scalp Treatment', desc: 'Deep scalp detox & nourishment therapy', price: 75, dur: 45 },
    ],
    promos: [{ title: 'First Visit 20% Off', desc: 'First-timers get 20% off any service!', pct: 20, start: '2026-05-01', end: '2026-08-31' }],
    featured: { title: 'Hair Republic — Expert Hair Studio ✂️', desc: 'Top hair salon at Bugis Junction. Cuts, colour, balayage & keratin treatments.' },
  },
  {
    user: { name: 'Glow Skin Clinic', email: 'glow@uniday.com', phone: '65678901' },
    biz: { name: 'Glow Skin Clinic', category: 'Facial', address: '4 Tampines Central 5, #04-09, Tampines Mall, Singapore 529510', image: '/images/merchants/glow-skin-clinic.jpg' },
    services: [
      { name: 'Hydra Facial', desc: 'HydraFacial MD — cleanse, exfoliate & hydrate', price: 158, dur: 75 },
      { name: 'LED Light Therapy', desc: 'Anti-aging & acne-fighting LED phototherapy', price: 68, dur: 30 },
      { name: 'Chemical Peel', desc: 'Superficial peel for skin renewal & radiance', price: 95, dur: 45 },
      { name: 'Acne Treatment', desc: 'Targeted extraction & calming acne therapy', price: 85, dur: 60 },
      { name: 'Anti-Aging Facial', desc: 'Peptide-powered firming & lifting facial', price: 120, dur: 75 },
    ],
    promos: [{ title: 'Hydra Facial Package', desc: 'Buy 3 Hydra Facials, save 30%!', pct: 30, start: '2026-05-01', end: '2026-06-30' }],
    featured: { title: 'Glow Skin Clinic — Glass Skin Experts ✨', desc: 'Medical-grade facials, LED therapy & chemical peels at Tampines Mall.' },
  },
  {
    user: { name: 'Zen Wellness Studio', email: 'zen@uniday.com', phone: '66789012' },
    biz: { name: 'Zen Wellness Studio', category: 'Wellness', address: '238 Thomson Road, #01-01, Novena Square, Singapore 307683', image: '/images/merchants/zen-wellness-studio.jpg' },
    services: [
      { name: 'Yoga Class (60 min)', desc: 'All-levels hatha yoga — mat provided', price: 35, dur: 60 },
      { name: 'Pilates Class', desc: 'Reformer pilates for core strength & posture', price: 45, dur: 60 },
      { name: 'Lymphatic Drainage', desc: 'Gentle manual lymphatic drainage massage', price: 95, dur: 60 },
      { name: 'Prenatal Massage', desc: 'Safe & nurturing massage for expectant mothers', price: 85, dur: 60 },
      { name: 'Reflexology', desc: 'Traditional foot reflexology for total wellbeing', price: 60, dur: 45 },
    ],
    promos: [{ title: '5-Class Wellness Pass', desc: 'Buy 5 classes and save 20%', pct: 20, start: '2026-05-01', end: '2026-07-31' }],
    featured: { title: 'Zen Wellness Studio — Mind & Body 🧘', desc: 'Yoga, pilates, lymphatic massage & reflexology at Novena Square.' },
  },
  {
    user: { name: 'Pretty Lash Studio', email: 'prettylash@uniday.com', phone: '67890123' },
    biz: { name: 'Pretty Lash Studio', category: 'Aesthetics', address: '3 Temasek Boulevard, #01-330, Suntec City Mall, Singapore 038983' },
    services: [
      { name: 'Classic Lash Set', desc: '1:1 individual lash extensions, natural look', price: 68, dur: 90 },
      { name: 'Volume Lash Set', desc: 'Russian volume fans for dramatic fullness', price: 98, dur: 120 },
      { name: 'Lash Lift & Tint', desc: 'Lifts natural lashes for a curled, tinted look', price: 58, dur: 60 },
      { name: 'Brow Shaping & Tint', desc: 'Precision brow shaping + tinting for bold brows', price: 38, dur: 45 },
      { name: 'Lash Removal', desc: 'Gentle professional removal of lash extensions', price: 25, dur: 30 },
    ],
    promos: [{ title: 'New Client Lash Promo', desc: 'First-time lash set at 15% off!', pct: 15, start: '2026-05-01', end: '2026-08-31' }],
    featured: { title: 'Pretty Lash Studio — Eye Perfection 👁️', desc: 'Classic & volume lash extensions, lifts & brow services at Suntec City.' },
  },
  {
    user: { name: 'Goddess Beauty Bar', email: 'goddess@uniday.com', phone: '68901234' },
    biz: { name: 'Goddess Beauty Bar', category: 'Body', address: '1 Harbourfront Walk, #02-113, VivoCity, Singapore 098585' },
    services: [
      { name: 'Full Face Makeup', desc: 'Glam or natural everyday makeup look', price: 80, dur: 60 },
      { name: 'Bridal Makeup', desc: 'Bridal glam with trial + day-of touch-ups', price: 250, dur: 120 },
      { name: 'Body Waxing', desc: 'Arms, legs or underarm wax — gentle hot wax', price: 40, dur: 30 },
      { name: 'Brazilian Wax', desc: 'Full Brazilian with soothing after-care', price: 58, dur: 30 },
      { name: 'Eyebrow Threading', desc: 'Precise brow shaping by thread technique', price: 15, dur: 15 },
    ],
    promos: [{ title: 'Bridal Package Deal', desc: '10% off bridal makeup + free trial!', pct: 10, start: '2026-05-01', end: '2026-12-31' }],
    featured: { title: 'Goddess Beauty Bar — Glow Up 💄', desc: 'Full makeup, waxing & brow services at VivoCity. Walk-ins welcome!' },
  },
];

async function seed() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'SOI-2026-2610-0035-mizyana',
    port: parseInt(process.env.DB_PORT || '3306'),
  });

  console.log('🌱 Seeding Uniday database...\n');
  const hash = bcrypt.hashSync('Uniday2026', 10);
  const adminHash = bcrypt.hashSync(ADMIN.password, 10);

  const [existingAdmin] = await db.execute(
    'SELECT user_id FROM users WHERE email = ?',
    [ADMIN.email]
  );

  if (existingAdmin.length) {
    await db.execute(
      'UPDATE users SET full_name = ?, password_hash = ?, phone = ?, role = ? WHERE email = ?',
      [ADMIN.name, adminHash, ADMIN.phone, 'admin', ADMIN.email]
    );
    console.log(`Admin updated: ${ADMIN.email}`);
  } else {
    await db.execute(
      'INSERT INTO users (full_name, email, password_hash, phone, role) VALUES (?, ?, ?, ?, ?)',
      [ADMIN.name, ADMIN.email, adminHash, ADMIN.phone, 'admin']
    );
    console.log(`Admin created: ${ADMIN.email}`);
  }

  for (const m of MERCHANTS) {
    const [existU] = await db.execute(
      'SELECT user_id FROM users WHERE email = ?',
      [m.user.email]
    );

    let userId;

    if (existU.length) {
      userId = existU[0].user_id;
      console.log(`↩ User already exists: ${m.user.email}`);
    } else {
      const [ur] = await db.execute(
        'INSERT INTO users (full_name, email, password_hash, phone, role) VALUES (?, ?, ?, ?, ?)',
        [m.user.name, m.user.email, hash, m.user.phone, 'merchant']
      );
      userId = ur.insertId;
    }

    const [existM] = await db.execute(
      'SELECT merchant_id FROM merchant WHERE user_id = ?',
      [userId]
    );

    let merchantId;

    if (existM.length) {
      merchantId = existM[0].merchant_id;
      await db.execute(
        `UPDATE merchant
         SET verification_status = 'approved',
             profile_image = COALESCE(profile_image, ?),
             verified_at = COALESCE(verified_at, NOW())
         WHERE merchant_id = ?`,
        [m.biz.image || null, merchantId]
      );
    } else {
      const [mr] = await db.execute(
        `INSERT INTO merchant 
          (user_id, merchant_name, email, description, category, address, business_uen, contact_no, profile_image, is_featured, is_active, verification_status, verified_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', NOW())`,
        [
          userId,
          m.biz.name,
          m.user.email,
          m.featured.desc,
          m.biz.category,
          m.biz.address,
          null,
          m.user.phone,
          m.biz.image || null,
          1,
          1,
        ]
      );

      merchantId = mr.insertId;
    }

    const [existS] = await db.execute(
      'SELECT service_id FROM service WHERE merchant_id = ?',
      [merchantId]
    );

    if (!existS.length) {
      for (const s of m.services) {
        await db.execute(
          'INSERT INTO service (merchant_id, service_name, description, price, duration_mins, is_active) VALUES (?, ?, ?, ?, ?, ?)',
          [merchantId, s.name, s.desc, s.price, s.dur, 1]
        );
      }
    }

    const [existP] = await db.execute(
      'SELECT promo_id FROM promotion WHERE merchant_id = ?',
      [merchantId]
    );

    let promoId = null;

    if (!existP.length) {
      for (const p of m.promos) {
        const [pr] = await db.execute(
          `INSERT INTO promotion
            (merchant_id, title, description, discount_pct, start_date, end_date, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [merchantId, p.title, p.desc, p.pct, p.start, p.end, 1]
        );
        promoId = pr.insertId;
      }
    } else {
      promoId = existP[0].promo_id;
    }

    const [existF] = await db.execute(
      'SELECT listing_id FROM featured_listing WHERE merchant_id = ?',
      [merchantId]
    );

    if (!existF.length) {
      await db.execute(
        `INSERT INTO featured_listing
          (merchant_id, promo_id, title, description, display_order, is_visible)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [merchantId, promoId, m.featured.title, m.featured.desc, 0, 1]
      );
    }

    await qrService.ensureMerchantQRCodes(merchantId);

    console.log(`${m.biz.name} (merchant_id: ${merchantId})`);
  }

  await db.end();
  await require('../config/db').end();
  console.log('\n🎉 Seed complete! Login with any merchant email, password: Uniday2026');
  console.log('Admin login: admin@uniday.com / Admin2026');
  console.log('Merchant login: any merchant email / Uniday2026');
}

seed().catch(err => {
  console.error(' Seed failed:', err.message);
  process.exit(1);
});
