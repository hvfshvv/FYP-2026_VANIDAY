const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildBookingReminderMessage,
  buildBookingCancellationMessage,
  buildStaffReplacementProposalMessage,
  buildStaffReplacementAcceptedMessage,
} = require('../services/whatsappNotificationService');

const booking = {
  booking_id: 42,
  merchant_name: 'Glow Studio',
  service_name: 'Facial',
  booking_date: '2026-08-10',
  booking_time: '14:30:00',
};

test('merchant cancellation WhatsApp includes reason and full-refund details', () => {
  const message = buildBookingCancellationMessage({
    ...booking,
    cancellation_reason: 'The merchant is closed unexpectedly.',
    refund_amount: 88,
    refund_percentage: 100,
  });

  assert.match(message, /Reason: The merchant is closed unexpectedly\./);
  assert.match(message, /100% refund of S\$88\.00 has been initiated/);
  assert.match(message, /Booking ID: 42/);
});

test('booking reminder WhatsApp includes booking details', () => {
  const message = buildBookingReminderMessage({
    ...booking,
    staff_name: 'Joanne Lim',
  });

  assert.match(message, /Your Uniday booking is coming up!/);
  assert.match(message, /Booking ID: 42/);
  assert.match(message, /Merchant: Glow Studio/);
  assert.match(message, /Service: Facial/);
  assert.match(message, /Date: 2026-08-10/);
  assert.match(message, /Time: 14:30/);
  assert.match(message, /Staff: Joanne Lim/);
});

test('staff replacement WhatsApp explains all customer options', () => {
  const message = buildStaffReplacementProposalMessage({
    ...booking,
    proposed_staff: { full_name: 'Jamie Tan' },
    staff_change_reason: 'Your original stylist is unavailable.',
  });

  assert.match(message, /Proposed staff: Jamie Tan/);
  assert.match(message, /1\. Accept replacement staff/);
  assert.match(message, /2\. Reschedule/);
  assert.match(message, /3\. Cancel with 100% refund/);
  assert.doesNotMatch(message, /https?:\/\//);
});

test('accepted replacement WhatsApp confirms the final staff and unchanged time', () => {
  const message = buildStaffReplacementAcceptedMessage({
    ...booking,
    proposed_staff_name: 'Jamie Tan',
  });

  assert.match(message, /Replacement staff confirmed/);
  assert.match(message, /Staff: Jamie Tan/);
  assert.match(message, /appointment date and time remain unchanged/i);
});
