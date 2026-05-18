const db = require('../config/db');

function calculatePoints(amount) {
  return Math.max(0, Math.floor(Number(amount || 0)));
}

async function awardBookingPoints(bookingId) {
  const [[booking]] = await db.query(
    `SELECT booking_id, customer_id, total_amount
     FROM booking
     WHERE booking_id = ?`,
    [bookingId]
  );

  if (!booking || !booking.customer_id) {
    return { awarded: false, reason: 'guest_booking' };
  }

  const points = calculatePoints(booking.total_amount);
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
  awardBookingPoints,
};
