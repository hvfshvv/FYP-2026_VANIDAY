const db = require('../config/db');

// Higher tiers require higher lifetime spending.
const TIER_DEFINITIONS = [
  { name: 'Platinum', minSpend: 2000, icon: 'bi-gem' },
  { name: 'Gold', minSpend: 1000, icon: 'bi-trophy' },
  { name: 'Silver', minSpend: 500, icon: 'bi-award' },
  { name: 'Bronze', minSpend: 0, icon: 'bi-shield-check' },
];

// Rewards are kept here as a simple in-code catalogue.
const REWARD_CATALOG = [
  {
    id: 'BRONZE5',
    title: 'S$5 Beauty Voucher',
    description: 'Use this on your next paid booking.',
    pointsCost: 50,
    minTier: 'Bronze',
    valueLabel: 'S$5 off',
  },
  {
    id: 'BRONZE10PCT',
    title: '10% Self-care Voucher',
    description: 'A starter reward for regular members.',
    pointsCost: 80,
    minTier: 'Bronze',
    valueLabel: '10% off',
  },
  {
    id: 'SILVER12',
    title: 'S$12 Silver Treat',
    description: 'A stronger voucher unlocked at Silver tier.',
    pointsCost: 110,
    minTier: 'Silver',
    valueLabel: 'S$12 off',
  },
  {
    id: 'GOLD25',
    title: 'S$25 Gold Glow Voucher',
    description: 'A premium voucher for Gold members and above.',
    pointsCost: 220,
    minTier: 'Gold',
    valueLabel: 'S$25 off',
  },
  {
    id: 'PLATINUM40',
    title: 'S$40 Platinum Privilege',
    description: 'The top loyalty voucher for the biggest fans.',
    pointsCost: 350,
    minTier: 'Platinum',
    valueLabel: 'S$40 off',
  },
];

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
function decorateRewards(tierName, pointsBalance) {
  const tierRank = getTierRank(tierName);
  const balance = Number(pointsBalance || 0);

  return REWARD_CATALOG.map(reward => {
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

// Creates a wallet row if the customer does not have one yet.
async function ensureWallet(customerId, connection = db) {
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
    rewards: decorateRewards(tier.name, wallet.points_balance),
    transactions,
  };
}

// Redeems a reward in a transaction so points cannot be double-spent.
async function redeemReward(customerId, rewardId) {
  const reward = REWARD_CATALOG.find(item => item.id === rewardId);
  if (!reward) {
    throw new Error('Reward not found.');
  }

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
    `SELECT booking_id, customer_id,
            COALESCE(total_amount, 0) - COALESCE(discount_amount, 0) AS payable_amount
     FROM booking
     WHERE booking_id = ?`,
    [bookingId]
  );

  if (!booking || !booking.customer_id) {
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

module.exports = {
  calculatePoints,
  awardBookingPoints,
  getWalletSummary,
  redeemReward,
  getEarnedPointsForBooking,
};
