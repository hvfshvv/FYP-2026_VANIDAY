const db = require('../config/db');
const voucherModel = require('./voucherModel');

// Higher tiers require higher lifetime spending.
const TIER_DEFINITIONS = [
  { name: 'Platinum', minSpend: 2000, icon: 'bi-gem' },
  { name: 'Gold', minSpend: 1000, icon: 'bi-trophy' },
  { name: 'Silver', minSpend: 500, icon: 'bi-award' },
  { name: 'Bronze', minSpend: 0, icon: 'bi-shield-check' },
];

const REVIEW_BONUS_POINTS = 2;
const PHOTO_REVIEW_BONUS_POINTS = 3;
let loyaltyRewardSchemaReady = false;

// Customers earn 10% of the paid booking amount as points.
function calculatePoints(amount) {
  return Math.max(0, Math.floor(Number(amount || 0) * 0.1));
}

// Converts tier names into numbers so tiers can be compared.
function getTierRank(tierName) {
  return ['Bronze', 'Silver', 'Gold', 'Platinum'].indexOf(tierName);
}

// Finds the customer's current tier and the next tier target.
function resolveTier(lifetimeSpend) {
  const spend = Number(lifetimeSpend || 0);
  const current = TIER_DEFINITIONS.find(tier => spend >= tier.minSpend) || TIER_DEFINITIONS[TIER_DEFINITIONS.length - 1];
  const ascending = [...TIER_DEFINITIONS].reverse();
  const next = ascending.find(tier => tier.minSpend > spend) || null;

  return {
    ...current,
    lifetimeSpend: spend,
    nextTier: next,
    spendToNextTier: next ? Math.max(0, next.minSpend - spend) : 0,
  };
}

// Adds locked/unlocked fields so the view knows which reward buttons to enable.
async function ensureLoyaltyRewardSchema(connection = db) {
  if (loyaltyRewardSchemaReady) return;

  await connection.query(`
    CREATE TABLE IF NOT EXISTS loyalty_reward (
      reward_id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(150) NOT NULL,
      description TEXT,
      points_cost INT NOT NULL,
      min_tier ENUM('Bronze','Silver','Gold','Platinum') NOT NULL DEFAULT 'Bronze',
      value_label VARCHAR(50),
      discount_type ENUM('percent','fixed_amount') NOT NULL,
      discount_value DECIMAL(10,2) NOT NULL,
      min_spend DECIMAL(10,2) NULL,
      validity_months INT NOT NULL DEFAULT 3,
      is_active BOOLEAN DEFAULT TRUE,
      display_order INT DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  loyaltyRewardSchemaReady = true;
}

function formatRewardValueLabel(discountType, discountValue) {
  if (discountType === 'percent') return `${Number(discountValue || 0).toFixed(0)}% off`;
  return `S$${Number(discountValue || 0).toFixed(2)} off`;
}

function normalizeReward(row) {
  return {
    id: row.reward_id,
    title: row.title,
    description: row.description || '',
    pointsCost: Number(row.points_cost || 0),
    minTier: row.min_tier || 'Bronze',
    valueLabel: row.value_label || formatRewardValueLabel(row.discount_type, row.discount_value),
    discountType: row.discount_type,
    discountValue: Number(row.discount_value || 0),
    minSpend: row.min_spend === null ? null : Number(row.min_spend || 0),
    validityMonths: Number(row.validity_months || 3),
    isActive: Boolean(row.is_active),
    displayOrder: Number(row.display_order || 0),
  };
}

async function getLoyaltyRewards({ includeInactive = false } = {}) {
  await ensureLoyaltyRewardSchema();

  const [rows] = await db.query(
    `SELECT *
     FROM loyalty_reward
     ${includeInactive ? '' : 'WHERE is_active = 1'}
     ORDER BY display_order ASC, points_cost ASC, reward_id ASC`
  );

  return rows.map(normalizeReward);
}

async function getLoyaltyRewardById(rewardId) {
  await ensureLoyaltyRewardSchema();

  const [[row]] = await db.query(
    'SELECT * FROM loyalty_reward WHERE reward_id = ?',
    [rewardId]
  );

  return row ? normalizeReward(row) : null;
}

async function createLoyaltyReward({
  title,
  description,
  pointsCost,
  minTier,
  valueLabel,
  discountType,
  discountValue,
  minSpend,
  validityMonths,
  displayOrder,
}) {
  await ensureLoyaltyRewardSchema();

  const [result] = await db.query(
    `INSERT INTO loyalty_reward
       (title, description, points_cost, min_tier, value_label, discount_type,
        discount_value, min_spend, validity_months, display_order, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      title,
      description || null,
      pointsCost,
      minTier || 'Bronze',
      valueLabel || null,
      discountType,
      discountValue,
      minSpend || null,
      validityMonths || 3,
      displayOrder || 0,
    ]
  );

  return result.insertId;
}

async function toggleLoyaltyRewardStatus(rewardId) {
  await ensureLoyaltyRewardSchema();
  await db.query(
    'UPDATE loyalty_reward SET is_active = NOT is_active WHERE reward_id = ?',
    [rewardId]
  );
}

async function updateLoyaltyReward(rewardId, {
  title,
  description,
  pointsCost,
  minTier,
  valueLabel,
  discountType,
  discountValue,
  minSpend,
  validityMonths,
  displayOrder,
}) {
  await ensureLoyaltyRewardSchema();

  const [result] = await db.query(
    `UPDATE loyalty_reward
     SET title = ?,
         description = ?,
         points_cost = ?,
         min_tier = ?,
         value_label = ?,
         discount_type = ?,
         discount_value = ?,
         min_spend = ?,
         validity_months = ?,
         display_order = ?
     WHERE reward_id = ?`,
    [
      title,
      description || null,
      pointsCost,
      minTier || 'Bronze',
      valueLabel || null,
      discountType,
      discountValue,
      minSpend || null,
      validityMonths || 3,
      displayOrder || 0,
      rewardId,
    ]
  );

  return result.affectedRows;
}

async function getLoyaltyRewardSummary() {
  await ensureLoyaltyRewardSchema();

  const [[summary]] = await db.query(
    `SELECT
       COUNT(*) AS total_count,
       SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active_count,
       SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) AS paused_count
     FROM loyalty_reward`
  );

  return summary || { total_count: 0, active_count: 0, paused_count: 0 };
}

// Adds locked/unlocked fields so the view knows which reward buttons to enable.
function decorateRewards(rewards, tierName, pointsBalance) {
  const tierRank = getTierRank(tierName);
  const balance = Number(pointsBalance || 0);

  return rewards.map(reward => {
    const tierUnlocked = tierRank >= getTierRank(reward.minTier);
    const pointsUnlocked = balance >= reward.pointsCost;

    return {
      ...reward,
      tierUnlocked,
      pointsUnlocked,
      redeemable: tierUnlocked && pointsUnlocked,
      pointsShort: Math.max(0, reward.pointsCost - balance),
    };
  });
}

function generateRewardVoucherCode(customerId, rewardId) {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `LOYALTY_${rewardId}_${customerId}_${timestamp}${random}`.slice(0, 50);
}

// Creates a wallet row if the customer does not have one yet.
async function ensureWallet(customerId, connection = db) {
  const [[customer]] = await connection.query(
    `SELECT u.user_id
     FROM users u
     WHERE u.user_id = ?
       AND u.role = 'customer'
     LIMIT 1`,
    [customerId]
  );

  if (!customer) {
    throw new Error('Loyalty wallet is only available for registered customers.');
  }

  await connection.query(
    `INSERT INTO loyalty_wallet (customer_id, points_balance, lifetime_points_earned)
     VALUES (?, 0, 0)
     ON DUPLICATE KEY UPDATE customer_id = VALUES(customer_id)`,
    [customerId]
  );

  const [[wallet]] = await connection.query(
    `SELECT *
     FROM loyalty_wallet
     WHERE customer_id = ?`,
    [customerId]
  );

  return wallet;
}

async function createWalletForCustomer(customerId) {
  return ensureWallet(customerId);
}

// Tier level is based on total paid spending, not current point balance.
async function getLifetimeSpend(customerId) {
  const [[summary]] = await db.query(
    `SELECT COALESCE(SUM(p.amount), 0) AS lifetime_spend
     FROM booking b
     JOIN payment p ON p.booking_id = b.booking_id
     WHERE b.customer_id = ?
       AND p.payment_status = 'paid'`,
    [customerId]
  );

  return Number(summary?.lifetime_spend || 0);
}

// Main wallet loader for the loyalty page.
async function getWalletSummary(customerId) {
  const wallet = await ensureWallet(customerId);
  const lifetimeSpend = await getLifetimeSpend(customerId);
  const tier = resolveTier(lifetimeSpend);
  const rewards = await getLoyaltyRewards();

  const [transactions] = await db.query(
    `SELECT loyalty_transaction_id, booking_id, transaction_type, points_amount,
            cashback_amount, description, created_at
     FROM loyalty_transaction
     WHERE wallet_id = ?
     ORDER BY created_at DESC, loyalty_transaction_id DESC
     LIMIT 12`,
    [wallet.wallet_id]
  );

  return {
    wallet,
    tier,
    tiers: [...TIER_DEFINITIONS].reverse(),
    rewards: decorateRewards(rewards, tier.name, wallet.points_balance),
    transactions,
  };
}

// Redeems a reward in a transaction so points cannot be double-spent.
async function redeemReward(customerId, rewardId) {
  await ensureLoyaltyRewardSchema();

  const [[rewardRow]] = await db.query(
    'SELECT * FROM loyalty_reward WHERE reward_id = ? AND is_active = 1',
    [rewardId]
  );
  const reward = rewardRow ? normalizeReward(rewardRow) : null;
  if (!reward) {
    throw new Error('Reward not found.');
  }

  await voucherModel.ensureCustomerVoucherSchema();

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    await ensureWallet(customerId, connection);
    const [[wallet]] = await connection.query(
      `SELECT *
       FROM loyalty_wallet
       WHERE customer_id = ?
       FOR UPDATE`,
      [customerId]
    );

    const lifetimeSpend = await getLifetimeSpend(customerId);
    const tier = resolveTier(lifetimeSpend);

    if (getTierRank(tier.name) < getTierRank(reward.minTier)) {
      throw new Error(`${reward.title} is available from ${reward.minTier} tier.`);
    }

    if (Number(wallet.points_balance || 0) < reward.pointsCost) {
      throw new Error(`You need ${reward.pointsCost - Number(wallet.points_balance || 0)} more points for this voucher.`);
    }

    const voucherCode = generateRewardVoucherCode(customerId, reward.id);
    const [voucherResult] = await connection.query(
      `INSERT INTO voucher
        (merchant_id, voucher_code, voucher_type, campaign_name, discount_type,
         discount_value, min_spend, usage_limit, usage_per_customer, start_date, end_date, is_active)
       VALUES (NULL, ?, 'platform', ?, ?, ?, ?, 1, 1, CURDATE(), DATE_ADD(CURDATE(), INTERVAL ? MONTH), 1)`,
      [
        voucherCode,
        reward.title,
        reward.discountType,
        reward.discountValue,
        reward.minSpend,
        reward.validityMonths,
      ]
    );

    await connection.query(
      `INSERT INTO customer_voucher (customer_id, voucher_id)
       VALUES (?, ?)`,
      [customerId, voucherResult.insertId]
    );

    await connection.query(
      `INSERT INTO loyalty_transaction
         (wallet_id, transaction_type, points_amount, description)
       VALUES (?, 'redeem_points', ?, ?)`,
      [
        wallet.wallet_id,
        -reward.pointsCost,
        `Redeemed ${reward.title} (${reward.valueLabel})`,
      ]
    );

    await connection.query(
      `UPDATE loyalty_wallet
       SET points_balance = points_balance - ?,
           lifetime_points_redeemed = lifetime_points_redeemed + ?,
           updated_at = NOW()
       WHERE wallet_id = ?`,
      [reward.pointsCost, reward.pointsCost, wallet.wallet_id]
    );

    await connection.commit();
    return reward;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

// Finds points already awarded for one booking.
async function getEarnedPointsForBooking(bookingId) {
  const [[transaction]] = await db.query(
    `SELECT lt.points_amount
     FROM loyalty_transaction lt
     WHERE lt.booking_id = ?
       AND lt.transaction_type = 'earn_points'
     LIMIT 1`,
    [bookingId]
  );

  return transaction ? Number(transaction.points_amount || 0) : 0;
}

// Awards booking points once, after a paid booking is confirmed/completed.
async function awardBookingPoints(bookingId) {
  const [[booking]] = await db.query(
    `SELECT b.booking_id, b.customer_id,
            COALESCE(p.amount, 0) AS payable_amount
     FROM booking b
     JOIN payment p ON p.booking_id = b.booking_id
      AND p.payment_status = 'paid'
     WHERE b.booking_id = ?`,
    [bookingId]
  );

  if (!booking) {
    return { awarded: false, reason: 'not_paid' };
  }

  if (!booking.customer_id) {
    return { awarded: false, reason: 'guest_booking' };
  }

  const points = calculatePoints(booking.payable_amount);
  if (!points) {
    return { awarded: false, reason: 'no_points' };
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [[existing]] = await connection.query(
      `SELECT lt.loyalty_transaction_id
       FROM loyalty_transaction lt
       JOIN loyalty_wallet lw ON lt.wallet_id = lw.wallet_id
       WHERE lt.booking_id = ?
         AND lt.transaction_type = 'earn_points'
         AND lw.customer_id = ?
       LIMIT 1
       FOR UPDATE`,
      [booking.booking_id, booking.customer_id]
    );

    if (existing) {
      await connection.commit();
      return { awarded: false, reason: 'already_awarded' };
    }

    await connection.query(
      `INSERT INTO loyalty_wallet (customer_id, points_balance, lifetime_points_earned)
       VALUES (?, 0, 0)
       ON DUPLICATE KEY UPDATE customer_id = VALUES(customer_id)`,
      [booking.customer_id]
    );

    const [[wallet]] = await connection.query(
      `SELECT wallet_id
       FROM loyalty_wallet
       WHERE customer_id = ?
       FOR UPDATE`,
      [booking.customer_id]
    );

    await connection.query(
      `INSERT INTO loyalty_transaction
         (wallet_id, booking_id, transaction_type, points_amount, description)
       VALUES (?, ?, 'earn_points', ?, ?)`,
      [
        wallet.wallet_id,
        booking.booking_id,
        points,
        `Earned ${points} points for booking #${booking.booking_id}`,
      ]
    );

    await connection.query(
      `UPDATE loyalty_wallet
       SET points_balance = points_balance + ?,
           lifetime_points_earned = lifetime_points_earned + ?,
           updated_at = NOW()
       WHERE wallet_id = ?`,
      [points, points, wallet.wallet_id]
    );

    await connection.commit();
    return { awarded: true, points };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function syncMissingBookingPointsForCustomer(customerId) {
  const [rows] = await db.query(
    `SELECT b.booking_id
     FROM booking b
     JOIN payment p ON p.booking_id = b.booking_id
      AND p.payment_status = 'paid'
     LEFT JOIN loyalty_wallet lw ON lw.customer_id = b.customer_id
     LEFT JOIN loyalty_transaction lt
       ON lt.wallet_id = lw.wallet_id
      AND lt.booking_id = b.booking_id
      AND lt.transaction_type = 'earn_points'
     WHERE b.customer_id = ?
       AND b.status IN ('confirmed', 'completed')
       AND lt.loyalty_transaction_id IS NULL
       AND FLOOR(COALESCE(p.amount, 0) * 0.1) > 0
     ORDER BY b.booking_id ASC`,
    [customerId]
  );

  const results = [];
  for (const row of rows) {
    results.push(await awardBookingPoints(row.booking_id));
  }

  return results;
}

async function awardReviewBonusPoints(customerId, bookingId, connection = db, points = REVIEW_BONUS_POINTS) {
  if (!customerId || !bookingId) {
    return { awarded: false, reason: 'missing_customer_or_booking' };
  }

  const safePoints = Number.isInteger(Number(points)) && Number(points) > 0
    ? Number(points)
    : REVIEW_BONUS_POINTS;

  await ensureWallet(customerId, connection);

  const [[wallet]] = await connection.query(
    `SELECT wallet_id
     FROM loyalty_wallet
     WHERE customer_id = ?`,
    [customerId]
  );

  if (!wallet) {
    return { awarded: false, reason: 'wallet_not_found' };
  }

  const description = `Earned ${safePoints} points for reviewing booking #${bookingId}`;

  await connection.query(
    `INSERT INTO loyalty_transaction
       (wallet_id, transaction_type, points_amount, description)
     VALUES (?, 'earn_points', ?, ?)`,
    [wallet.wallet_id, safePoints, description]
  );

  await connection.query(
    `UPDATE loyalty_wallet
     SET points_balance = points_balance + ?,
         lifetime_points_earned = lifetime_points_earned + ?,
         updated_at = NOW()
     WHERE wallet_id = ?`,
    [safePoints, safePoints, wallet.wallet_id]
  );

  return { awarded: true, points: safePoints };
}

module.exports = {
  calculatePoints,
  awardBookingPoints,
  awardReviewBonusPoints,
  syncMissingBookingPointsForCustomer,
  getWalletSummary,
  redeemReward,
  getLoyaltyRewards,
  getLoyaltyRewardById,
  createLoyaltyReward,
  updateLoyaltyReward,
  toggleLoyaltyRewardStatus,
  getLoyaltyRewardSummary,
  ensureLoyaltyRewardSchema,
  getEarnedPointsForBooking,
  createWalletForCustomer,
  REVIEW_BONUS_POINTS,
  PHOTO_REVIEW_BONUS_POINTS,
};
