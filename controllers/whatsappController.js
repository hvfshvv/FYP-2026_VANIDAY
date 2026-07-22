const twilio = require('twilio');
const merchantModel = require('../models/merchantModel');
const bookingModel = require('../models/bookingModel');
const slotModel = require('../models/slotModel');
const staffModel = require('../models/staffModel');
const whatsappModel = require('../models/whatsappModel');
const supportModel = require('../models/supportModel');

const userSessions = {};
const WHATSAPP_BOOKING_PAGE_SIZE = 5;

const categories = {
  1: 'Hair',
  2: 'Nails',
  3: 'Facial',
  4: 'Massage',
  5: 'Wellness',
  6: 'Body',
  7: 'Aesthetics',
  8: 'Spa'
};

function getMainMenu() {
  return (
    'Hi, welcome to Uniday!\n' +
    'What would you like to do today?\n\n' +
    '1. Book a Service\n' +
    '2. View My Bookings\n' +
    '3. Cancel Booking\n' +
    '4. Reschedule Booking\n' +
    '5. Help / Support\n\n' +
    'Reply with 1, 2, 3, 4, or 5.\n' +
    'Type menu anytime to restart.'
  );
}

function getCategoryMenu() {
  return (
    'Great! Let\'s book a service. What type of service are you looking for?\n\n' +
    '1. Hair\n' +
    '2. Nails\n' +
    '3. Facial\n' +
    '4. Massage\n' +
    '5. Wellness\n' +
    '6. Body\n' +
    '7. Aesthetics\n' +
    '8. Spa'
  );
}

function formatMerchants(merchants) {
  return merchants
    .map(function (merchant, index) {
      return index + 1 + '. ' + merchant.merchant_name;
    })
    .join('\n');
}

function formatServices(services) {
  return services
    .map(function (service, index) {
      return (
        index + 1 + '. ' +
        service.service_name +
        ' - $' + Number(service.price).toFixed(2) +
        ' (' + service.duration_mins + ' mins)'
      );
    })
    .join('\n');
}

function formatTimeSlots(slots) {
  return slots
    .map(function (slot, index) {
      return index + 1 + '. ' + slot.label;
    })
    .join('\n');
}

function formatStaff(staff) {
  const staffOptions = staff.map(function (member, index) {
    return index + 2 + '. ' + member.full_name + (member.role ? ' - ' + member.role : '');
  });

  return ['1. No Preference'].concat(staffOptions).join('\n');
}

function getMerchantMenu(category, merchants) {
  return (
    'You selected ' + category + '.\n\n' +
    'Here are some available merchants:\n\n' +
    formatMerchants(merchants) + '\n\n' +
    'Please reply with the merchant number.\n' +
    'Reply 0 or back to go back.'
  );
}

function getServiceMenu(merchant, services) {
  return (
    'You selected ' + merchant.merchant_name + '.\n\n' +
    'Here are the available services:\n\n' +
    formatServices(services) + '\n\n' +
    'Please reply with the service number.\n' +
    'Reply 0 or back to go back.'
  );
}

function getDatePrompt(service) {
  return (
    'You selected ' + service.service_name + '.\n\n' +
    'Please enter your preferred booking date in this format:\n\n' +
    'YYYY-MM-DD\n\n' +
    'Example: 2026-05-20\n\n' +
    'Reply 0 or back to go back.'
  );
}

function getLinkedDatePrompt(customer, merchant, service) {
  const greeting = customer
    ? 'Welcome back, ' + customer.full_name + '!\n\n'
    : '';

  return (
    greeting +
    'Let\'s continue your booking for ' + service.service_name +
    ' at ' + merchant.merchant_name + '.\n\n' +
    'Please enter your preferred booking date in this format:\n\n' +
    'YYYY-MM-DD\n\n' +
    'Example: 2026-05-20\n\n' +
    'Reply 0 or back to go back.'
  );
}

function getTimeSlotMenu(bookingDate, slots) {
  return (
    'Here are the available time slots for ' + bookingDate + ':\n\n' +
    formatTimeSlots(slots) + '\n\n' +
    'Please reply with the time slot number.\n' +
    'Reply 0 or back to go back.'
  );
}

function getStaffMenu(staff) {
  return (
    'Do you have a preferred staff member?\n\n' +
    formatStaff(staff) + '\n\n' +
    'Please reply with the staff number.\n' +
    'Reply 0 or back to go back.'
  );
}

function getServicePrice(service) {
  return Number(service.price || 0).toFixed(2);
}

function getPaymentLink(bookingReference) {
  const baseUrl = process.env.APP_URL || process.env.APP_BASE_URL || 'http://localhost:3000';

  return baseUrl + '/payment/checkout/' + bookingReference;
}

function getLoginLink(sender) {
  const baseUrl = process.env.APP_URL || process.env.APP_BASE_URL || 'http://localhost:3000';
  const phone = encodeURIComponent(String(sender || '').replace('whatsapp:', ''));

  return baseUrl + '/auth/login?from=whatsapp&phone=' + phone;
}

function getSingaporeTimeParts() {
  const parts = new Intl.DateTimeFormat('en-SG', {
    timeZone: 'Asia/Singapore',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(new Date());

  const values = {};
  parts.forEach(function (part) {
    values[part.type] = part.value;
  });

  return {
    weekday: values.weekday,
    hour: Number(values.hour),
    minute: Number(values.minute)
  };
}

function getSupportHoursStatus() {
  const now = getSingaporeTimeParts();
  const isWeekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(now.weekday);
  const isDuringSupportHours = isWeekday && now.hour >= 9 && now.hour < 18;

  return {
    isDuringSupportHours: isDuringSupportHours,
    label: 'Mon-Fri, 9:00 AM - 6:00 PM'
  };
}

function getSupportPrompt(status) {
  if (status.isDuringSupportHours) {
    return (
      'A Uniday support agent is available now.\n\n' +
      'Please describe your issue and we will add you to the live support queue.'
    );
  }

  return (
    'Our live agents are offline right now.\n' +
    'Support hours are ' + status.label + '.\n\n' +
    'Please describe your issue and we will follow up during the next working period.'
  );
}

function isMainMenuCommand(message) {
  return ['reset', 'restart', 'menu', 'hi', 'hello'].includes(message);
}

function isGlobalSupportCommand(message) {
  return message === 'support' || message === 'help';
}

async function startSupportSession(sender, twiml) {
  const customer = await getVerifiedCustomerForSender(sender);
  const supportStatus = getSupportHoursStatus();

  await saveSession(sender, {
    state: 'support_awaiting_issue',
    customer: customer,
    supportStatus: supportStatus
  });

  twiml.message(getSupportPrompt(supportStatus));
}

function formatBookingDate(value) {
  if (!value) {
    return 'Not available';
  }

  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  return String(value).slice(0, 10);
}

function formatBookingTime(value) {
  if (!value) {
    return 'Not available';
  }

  return String(value).slice(0, 5);
}

function isSameBookingSlot(booking, bookingDate, bookingTime) {
  if (!booking) {
    return false;
  }

  return (
    formatBookingDate(booking.booking_date) === bookingDate &&
    formatBookingTime(booking.booking_time) === String(bookingTime || '').slice(0, 5)
  );
}

function getReservationSummary(booking) {
  return (
    'Here are your reservation details:\n\n' +
    'Booking ID: ' + booking.booking_id + '\n' +
    'Merchant: ' + booking.merchant_name + '\n' +
    'Service: ' + booking.service_name + '\n' +
    'Date: ' + formatBookingDate(booking.booking_date) + '\n' +
    'Time: ' + formatBookingTime(booking.booking_time) + '\n' +
    'Status: ' + booking.status + '\n' +
    'Total: $' + Number(booking.payable_amount || booking.total_amount || 0).toFixed(2)
  );
}

function isCustomerOverlapError(error) {
  return error && error.code === 'CUSTOMER_BOOKING_OVERLAP' && error.conflict;
}

function getCustomerOverlapMessage(error) {
  const conflict = error.conflict;

  return (
    'You already have another booking that overlaps with this time:\n\n' +
    'Merchant: ' + conflict.merchantName + '\n' +
    'Service: ' + conflict.serviceName + '\n' +
    'Date: ' + formatBookingDate(conflict.bookingDate) + '\n' +
    'Time: ' + formatBookingTime(conflict.startTime) + '-' + formatBookingTime(conflict.endTime) + '\n\n' +
    'Please choose a different time.'
  );
}

function getBookingViewMenu() {
  return (
    'Which bookings would you like to view?\n\n' +
    '1. Current / Upcoming Bookings\n' +
    '2. Booking History\n' +
    '3. Find Booking by ID\n\n' +
    'Reply with 1, 2, or 3.\n' +
    'Reply 0 or back to return to the main menu.'
  );
}

function statusLabel(status) {
  return String(status || 'Unknown')
    .split('_')
    .map(function (part) {
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ');
}

function formatShortBookingDate(value) {
  const date = formatBookingDate(value);
  const parts = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  if (!parts) {
    return date;
  }

  return Number(parts[3]) + ' ' + months[Number(parts[2]) - 1] + ' ' + parts[1];
}

function formatBookingList(viewType, bookings, page, hasNext) {
  const title = viewType === 'history'
    ? 'Your booking history:'
    : 'Your upcoming bookings:';
  const lines = [title];

  bookings.forEach(function (booking, index) {
    lines.push(
      '',
      (index + 1) + '. #' + booking.booking_id + ' — ' + booking.service_name,
      '   ' + booking.merchant_name,
      '   ' + formatShortBookingDate(booking.booking_date) + ' at ' + formatBookingTime(booking.booking_time),
      '   Status: ' + statusLabel(booking.status)
    );
  });

  lines.push(
    '',
    'Reply with the list number for full details.'
  );

  if (hasNext) {
    lines.push('Reply NEXT to view more.');
  }

  if (page > 0) {
    lines.push('Reply PREVIOUS to go back.');
  }

  lines.push(
    'Reply BACK to choose another booking view.',
    'Reply MENU to restart.'
  );

  return lines.join('\n');
}

async function showBookingViewMenu(sender, twiml, customer) {
  await saveSession(sender, {
    state: 'booking_view_submenu',
    customer: customer
  });

  twiml.message(getBookingViewMenu());
}

async function showBookingListPage(sender, twiml, customer, viewType, page) {
  const safePage = Math.max(0, Number(page) || 0);
  const rows = await bookingModel.getCustomerBookingsForWhatsApp(customer.customer_id, viewType, {
    limit: WHATSAPP_BOOKING_PAGE_SIZE + 1,
    offset: safePage * WHATSAPP_BOOKING_PAGE_SIZE
  });
  const bookings = rows.slice(0, WHATSAPP_BOOKING_PAGE_SIZE);
  const hasNext = rows.length > WHATSAPP_BOOKING_PAGE_SIZE;

  if (!bookings.length) {
    await saveSession(sender, {
      state: 'booking_view_empty',
      customer: customer
    });

    twiml.message(
      (viewType === 'history'
        ? 'You do not have any past bookings yet.'
        : 'You do not have any current or upcoming bookings.') +
      '\n\nReply BACK to choose another booking view.\n' +
      'Reply MENU to restart.'
    );
    return;
  }

  await saveSession(sender, {
    state: 'booking_view_list',
    customer: customer,
    bookingViewType: viewType,
    page: safePage,
    displayedBookingIds: bookings.map(function (booking) {
      return booking.booking_id;
    }),
    hasNext: hasNext
  });

  twiml.message(formatBookingList(viewType, bookings, safePage, hasNext));
}

function getCancellationSummary(booking) {
  return (
    'I found this booking:\n\n' +
    'Booking ID: ' + booking.booking_id + '\n' +
    'Merchant: ' + booking.merchant_name + '\n' +
    'Service: ' + booking.service_name + '\n' +
    'Date: ' + formatBookingDate(booking.booking_date) + '\n' +
    'Time: ' + formatBookingTime(booking.booking_time) + '\n' +
    'Status: ' + booking.status + '\n\n' +
    'Reply YES to cancel this booking, or NO to keep it.'
  );
}

function getReschedulePrompt(booking) {
  return (
    'I found this booking:\n\n' +
    'Booking ID: ' + booking.booking_id + '\n' +
    'Merchant: ' + booking.merchant_name + '\n' +
    'Service: ' + booking.service_name + '\n' +
    'Current date: ' + formatBookingDate(booking.booking_date) + '\n' +
    'Current time: ' + formatBookingTime(booking.booking_time) + '\n' +
    'Staff: ' + (booking.staff_name || 'Any Available Staff') + '\n' +
    'Status: ' + booking.status + '\n\n' +
    'Please enter the new date in this format:\n\n' +
    'YYYY-MM-DD'
  );
}

function getRescheduleConfirmation(booking, bookingDate, slot) {
  return (
    'Please confirm your new appointment time:\n\n' +
    'Booking ID: ' + booking.booking_id + '\n' +
    'Merchant: ' + booking.merchant_name + '\n' +
    'Service: ' + booking.service_name + '\n' +
    'From: ' + formatBookingDate(booking.booking_date) + ' ' + formatBookingTime(booking.booking_time) + '\n' +
    'To: ' + bookingDate + ' ' + slot.label + '\n\n' +
    'Reply YES to reschedule, or NO to keep your current booking.'
  );
}

async function checkReservation(bookingId) {
  try {
    const booking = await bookingModel.getBookingById(bookingId);
    return { booking: booking, error: null };
  } catch (error) {
    console.error('Failed to check reservation:', error.message);
    return { booking: null, error: error };
  }
}

async function getVerifiedCustomerForSender(sender) {
  return whatsappModel.findExistingCustomerByPhone(sender);
}

function isCustomerBooking(booking, customer) {
  return booking && customer && String(booking.customer_id) === String(customer.customer_id);
}

function canStartReschedule(booking) {
  return booking && !['cancelled', 'payment_failed', 'completed', 'no_show'].includes(booking.status);
}

function parseBookingRef(message) {
  const match = String(message || '').match(/\bref:\s*M(\d+)-S(\d+)\b/i);

  if (!match) {
    return null;
  }

  return {
    merchantId: Number(match[1]),
    serviceId: Number(match[2])
  };
}

async function loadBookingRefContext(ref) {
  if (!ref || !ref.merchantId || !ref.serviceId) {
    return null;
  }

  const merchant = await merchantModel.getMerchantById(ref.merchantId);

  if (!merchant) {
    return null;
  }

  const services = await merchantModel.getMerchantServices(ref.merchantId);
  const service = services.find(function (item) {
    return Number(item.service_id) === Number(ref.serviceId);
  });

  if (!service) {
    return null;
  }

  return {
    merchant: merchant,
    service: service
  };
}

function sendTwiml(res, twiml) {
  res.writeHead(200, { 'Content-Type': 'text/xml' });
  res.end(twiml.toString());
}

function captureOutgoingMessages(twiml) {
  const outgoingMessages = [];
  const sendMessage = twiml.message.bind(twiml);

  twiml.message = function (message) {
    outgoingMessages.push(String(message || ''));
    return sendMessage(message);
  };

  return outgoingMessages;
}

function sessionFromRecord(record) {
  if (!record) {
    return null;
  }

  const data = record.temp_data && typeof record.temp_data === 'object'
    ? record.temp_data
    : {};

  if (record.session_state && !data.state) {
    data.state = record.session_state;
  }

  return data.state ? data : null;
}

async function loadSession(sender) {
  try {
    const record = await whatsappModel.getOrCreateActiveSession(sender);
    const persistedSession = sessionFromRecord(record);

    if (persistedSession) {
      userSessions[sender] = persistedSession;
    }

    return {
      record: record,
      session: persistedSession || userSessions[sender] || null
    };
  } catch (error) {
    console.error('[whatsapp] Failed to load persisted session:', error.message);
    return {
      record: null,
      session: userSessions[sender] || null
    };
  }
}

async function saveSession(sender, nextSession) {
  const previousSession = userSessions[sender] || null;

  if (previousSession && previousSession !== nextSession) {
    nextSession.previous = previousSession;
  } else if (!nextSession.previous) {
    nextSession.previous = null;
  }

  userSessions[sender] = nextSession;

  try {
    await whatsappModel.updateActiveSessionStateByPhone(sender, nextSession);
  } catch (error) {
    console.error('[whatsapp] Failed to persist session state:', error.message);
  }
}

async function clearSession(sender, status = 'completed') {
  delete userSessions[sender];

  try {
    await whatsappModel.markActiveSessionStatusByPhone(sender, status);
  } catch (error) {
    console.error('[whatsapp] Failed to mark session ' + status + ':', error.message);
  }
}

function getMessageType(session, message) {
  const state = session ? String(session.state || '') : '';
  const text = String(message || '').toLowerCase();

  if (state.includes('cancel') || text.includes('cancel')) {
    return 'cancellation';
  }

  if (state.includes('reschedule') || text.includes('reschedule')) {
    return 'reschedule';
  }

  if (state.includes('choosing') || text === '1') {
    return 'booking';
  }

  if (state === 'checking_reservation' || /^\d+$/.test(text)) {
    return 'confirmation';
  }

  return 'enquiry';
}

async function logIncomingMessage(record, message, messageType) {
  if (!record) return;

  try {
    await whatsappModel.insertMessage({
      sessionId: record.session_id,
      direction: 'inbound',
      messageType: messageType,
      messageContent: message,
      status: 'received'
    });
  } catch (error) {
    console.error('[whatsapp] Failed to log incoming message:', error.message);
  }
}

async function logOutgoingMessages(record, messages, messageType, bookingId) {
  if (!record || !messages.length) return;

  for (const message of messages) {
    try {
      await whatsappModel.insertMessage({
        sessionId: record.session_id,
        bookingId: bookingId || null,
        direction: 'outbound',
        messageType: messageType,
        messageContent: message,
        status: 'sent'
      });
    } catch (error) {
      console.error('[whatsapp] Failed to log outgoing message:', error.message);
    }
  }
}

async function finishWhatsAppResponse(res, twiml, record, outgoingMessages, messageType, bookingId) {
  await logOutgoingMessages(record, outgoingMessages, messageType, bookingId);
  return sendTwiml(res, twiml);
}

async function goBack(sender, twiml) {
  const session = userSessions[sender];

  if (!session || !session.previous) {
    await clearSession(sender, 'completed');
    twiml.message(getMainMenu());
    return;
  }

  const previous = session.previous;
  userSessions[sender] = previous;
  await saveSession(sender, previous);

  if (previous.state === 'choosing_category') {
    twiml.message(getCategoryMenu());
  } else if (previous.state === 'choosing_merchant') {
    twiml.message(getMerchantMenu(previous.category, previous.merchants));
  } else if (previous.state === 'choosing_service') {
    twiml.message(getServiceMenu(previous.merchant, previous.services));
  } else if (previous.state === 'choosing_date') {
    twiml.message(getDatePrompt(previous.service));
  } else if (previous.state === 'choosing_time_slot') {
    twiml.message(getTimeSlotMenu(previous.bookingDate, previous.slots));
  } else {
    await clearSession(sender, 'completed');
    twiml.message(getMainMenu());
  }
}

function isValidDate(message) {
  const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
  const match = message.match(datePattern);

  if (!match) {
    return false;
  }

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function getTodayDateValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

function isCurrentOrFutureDate(message) {
  return isValidDate(message) && message >= getTodayDateValue();
}

async function getMerchantsForCategory(category) {
  try {
    const merchants = await merchantModel.getAllActiveMerchants(category);

    return merchants;
  } catch (error) {
    console.error('Failed to load merchants from database:', error.message);
  }

  return [];
}

async function getServicesForMerchant(merchant) {
  try {
    if (merchant.merchant_id) {
      return await merchantModel.getMerchantServices(merchant.merchant_id);
    }
  } catch (error) {
    console.error('Failed to load services from database:', error.message);
  }

  return [];
}

async function getTimeSlotsForDate(session, bookingDate) {
  try {
    if (session.merchant.merchant_id && session.service.service_id) {
      return await slotModel.getAvailableSlots({
        merchantId: session.merchant.merchant_id,
        serviceId: session.service.service_id,
        bookingDate: bookingDate
      });
    }
  } catch (error) {
    console.error('Failed to load time slots from database:', error.message);
  }

  return [];
}

async function getStaffForTimeSlot(session, selectedSlot) {
  try {
    if (session.merchant.merchant_id && session.service.service_id) {
      const staff = await staffModel.getStaffByService(
        session.service.service_id,
        session.merchant.merchant_id
      );

      const availableStaff = [];

      for (const member of staff) {
        const slots = await slotModel.getAvailableSlots({
          merchantId: session.merchant.merchant_id,
          serviceId: session.service.service_id,
          staffId: member.staff_id,
          bookingDate: session.bookingDate
        });

        const hasSelectedSlot = slots.some(function (slot) {
          return slot.start_time === selectedSlot.start_time;
        });

        if (hasSelectedSlot) {
          availableStaff.push(member);
        }
      }

      return availableStaff;
    }
  } catch (error) {
    console.error('Failed to load staff from database:', error.message);
  }

  return [];
}

async function receiveMessage(req, res) {
  const twiml = new twilio.twiml.MessagingResponse();
  const outgoingMessages = captureOutgoingMessages(twiml);
  let sessionRecord = null;
  let latestMessageType = 'enquiry';
  let linkedBookingId = null;

  try {
    const incomingMessage = req.body.Body || '';
    const message = incomingMessage.toLowerCase().trim();
    const sender = req.body.From || 'unknown';
    const loaded = await loadSession(sender);
    sessionRecord = loaded.record;
    const session = loaded.session;
    const bookingRef = parseBookingRef(incomingMessage);
    latestMessageType = getMessageType(session, message);

    console.log('Incoming WhatsApp message:', incomingMessage);
    await logIncomingMessage(sessionRecord, incomingMessage, latestMessageType);

    if (isMainMenuCommand(message)) {
      await clearSession(sender, 'completed');
      twiml.message(getMainMenu());
    } else if (isGlobalSupportCommand(message)) {
      await startSupportSession(sender, twiml);
    } else if (bookingRef) {
      const context = await loadBookingRefContext(bookingRef);

      if (!context) {
        await clearSession(sender, 'completed');
        twiml.message('Sorry, I could not find that merchant or service. Please reply menu to start again.');
      } else {
        const customer = await whatsappModel.findExistingCustomerByPhone(sender);

        if (!customer) {
          twiml.message(
            'Please log in or create a Uniday account before booking through WhatsApp:\n' +
            getLoginLink(sender) + '\n\n' +
            'After linking your account, return to this service and tap WhatsApp again to continue booking.'
          );
          await clearSession(sender, 'completed');
          return finishWhatsAppResponse(res, twiml, sessionRecord, outgoingMessages, latestMessageType, linkedBookingId);
        }

        await saveSession(sender, {
          state: 'choosing_date',
          category: context.service.category || context.merchant.category || null,
          merchant: context.merchant,
          service: context.service,
          customer: customer
        });

        twiml.message(getLinkedDatePrompt(customer, context.merchant, context.service));
      }
    } else if (message === '0' || message === 'back') {
      if (session && session.state === 'booking_view_submenu') {
        await clearSession(sender, 'completed');
        twiml.message(getMainMenu());
      } else if (session && (session.state === 'booking_view_list' || session.state === 'booking_view_empty')) {
        const customer = session.customer || await getVerifiedCustomerForSender(sender);

        if (!customer) {
          twiml.message(
            'Please log in or create a Uniday account before viewing a booking through WhatsApp:\n' +
            getLoginLink(sender)
          );
          await clearSession(sender, 'completed');
          return finishWhatsAppResponse(res, twiml, sessionRecord, outgoingMessages, latestMessageType, linkedBookingId);
        }

        await showBookingViewMenu(sender, twiml, customer);
      } else {
        await goBack(sender, twiml);
      }
    } else if (session && session.state === 'booking_view_submenu') {
      const customer = session.customer || await getVerifiedCustomerForSender(sender);

      if (!customer) {
        twiml.message(
          'Please log in or create a Uniday account before viewing a booking through WhatsApp:\n' +
          getLoginLink(sender)
        );
        await clearSession(sender, 'completed');
        return finishWhatsAppResponse(res, twiml, sessionRecord, outgoingMessages, latestMessageType, linkedBookingId);
      }

      if (message === '1') {
        await showBookingListPage(sender, twiml, customer, 'upcoming', 0);
      } else if (message === '2') {
        await showBookingListPage(sender, twiml, customer, 'history', 0);
      } else if (message === '3') {
        await saveSession(sender, {
          state: 'checking_reservation',
          customer: customer
        });

        twiml.message('Please enter your booking ID to check your reservation.');
      } else {
        twiml.message(getBookingViewMenu());
      }
    } else if (session && session.state === 'booking_view_list') {
      const customer = session.customer || await getVerifiedCustomerForSender(sender);

      if (!customer) {
        twiml.message(
          'Please log in or create a Uniday account before viewing a booking through WhatsApp:\n' +
          getLoginLink(sender)
        );
        await clearSession(sender, 'completed');
        return finishWhatsAppResponse(res, twiml, sessionRecord, outgoingMessages, latestMessageType, linkedBookingId);
      }

      if (message === 'next') {
        if (session.hasNext) {
          await showBookingListPage(sender, twiml, customer, session.bookingViewType, Number(session.page || 0) + 1);
        } else {
          twiml.message('There are no more bookings to show.\n\nReply BACK to choose another booking view, or MENU to restart.');
        }
      } else if (message === 'previous') {
        if (Number(session.page || 0) > 0) {
          await showBookingListPage(sender, twiml, customer, session.bookingViewType, Number(session.page || 0) - 1);
        } else {
          twiml.message('You are already on the first page.\n\nReply BACK to choose another booking view, or MENU to restart.');
        }
      } else {
        const listNumber = parseInt(message, 10);
        const displayedBookingIds = Array.isArray(session.displayedBookingIds) ? session.displayedBookingIds : [];
        const bookingId = displayedBookingIds[listNumber - 1];

        if (!bookingId) {
          twiml.message('Please reply with a list number, NEXT, PREVIOUS, BACK, or MENU.');
        } else {
          const booking = await bookingModel.getBookingById(bookingId);

          if (!booking || !isCustomerBooking(booking, customer)) {
            twiml.message(
              'Sorry, I could not find that booking under your Uniday account.\n\n' +
              'Reply BACK to choose another booking view, or MENU to restart.'
            );
          } else {
            linkedBookingId = booking.booking_id;
            twiml.message(
              getReservationSummary(booking) + '\n\n' +
              'Reply BACK to choose another booking view, or MENU to restart.'
            );
          }
        }
      }
    } else if (session && session.state === 'booking_view_empty') {
      twiml.message('Reply BACK to choose another booking view, or MENU to restart.');
    } else if (session && session.state === 'checking_reservation') {
      const bookingId = incomingMessage.trim();
      const customer = session.customer || await getVerifiedCustomerForSender(sender);

      if (!customer) {
        twiml.message(
          'Please log in or create a Uniday account before viewing a booking through WhatsApp:\n' +
          getLoginLink(sender)
        );
        await clearSession(sender, 'completed');
        return finishWhatsAppResponse(res, twiml, sessionRecord, outgoingMessages, latestMessageType, linkedBookingId);
      }

      const result = await checkReservation(bookingId);

      if (result.booking && isCustomerBooking(result.booking, customer)) {
        linkedBookingId = result.booking.booking_id;
        twiml.message(getReservationSummary(result.booking));
        await clearSession(sender, 'completed');
      } else if (result.error) {
        twiml.message(
          'Sorry, I could not check reservations right now.\n\n' +
          'Please try again later, or reply menu to start over.'
        );
      } else {
        twiml.message(
          'Sorry, I could not find that booking under your Uniday account.\n\n' +
          'Please enter another booking ID, or reply menu to start over.'
        );
      }
    } else if (session && session.state === 'cancelling_awaiting_id') {
      const bookingId = incomingMessage.trim();
      const booking = await bookingModel.getBookingById(bookingId);

      if (!booking || !isCustomerBooking(booking, session.customer)) {
        twiml.message(
          'Sorry, I could not find that booking under your Uniday account.\n\n' +
          'Please enter another booking ID, or reply menu to start over.'
        );
      } else {
        linkedBookingId = booking.booking_id;
        await saveSession(sender, {
          state: 'cancelling_confirm',
          customer: session.customer,
          bookingId: booking.booking_id
        });

        twiml.message(getCancellationSummary(booking));
      }
    } else if (session && session.state === 'cancelling_confirm') {
      if (message === 'yes' || message === 'y') {
        try {
          await bookingModel.cancelCustomerBooking(session.bookingId, session.customer.customer_id);
          const booking = await bookingModel.getBookingById(session.bookingId);

          twiml.message(
            'Your booking has been cancelled.\n\n' +
            'Booking ID: ' + session.bookingId + '\n' +
            'Merchant: ' + (booking ? booking.merchant_name : '-') + '\n' +
            'Service: ' + (booking ? booking.service_name : '-') + '\n' +
            'Date: ' + (booking ? formatBookingDate(booking.booking_date) : '-') + '\n' +
            'Time: ' + (booking ? formatBookingTime(booking.booking_time) : '-')
          );

          linkedBookingId = session.bookingId;
          await clearSession(sender, 'completed');
        } catch (error) {
          twiml.message(
            'Sorry, I could not cancel this booking.\n\n' +
            (error.message || 'Please try again later, or contact Uniday support.')
          );
          await clearSession(sender, 'completed');
        }
      } else if (message === 'no' || message === 'n') {
        twiml.message('No problem. Your booking has not been changed.');
        await clearSession(sender, 'completed');
      } else {
        twiml.message('Please reply YES to cancel this booking, or NO to keep it.');
      }
    } else if (session && session.state === 'reschedule_awaiting_id') {
      const bookingId = incomingMessage.trim();
      const booking = await bookingModel.getBookingById(bookingId);

      if (!booking || !isCustomerBooking(booking, session.customer)) {
        twiml.message(
          'Sorry, I could not find that booking under your Uniday account.\n\n' +
          'Please enter another booking ID, or reply menu to start over.'
        );
      } else if (!canStartReschedule(booking)) {
        twiml.message('This booking cannot be rescheduled because its current status is ' + booking.status + '.');
        await clearSession(sender, 'completed');
      } else {
        linkedBookingId = booking.booking_id;
        await saveSession(sender, {
          state: 'reschedule_awaiting_date',
          customer: session.customer,
          booking: booking
        });

        twiml.message(getReschedulePrompt(booking));
      }
    } else if (session && session.state === 'reschedule_awaiting_date') {
      const bookingDate = message;

      if (!isValidDate(bookingDate)) {
        twiml.message(
          'Invalid date format. Please enter the new booking date as YYYY-MM-DD.\n\n' +
          'Example: 2026-05-20'
        );
      } else if (!isCurrentOrFutureDate(bookingDate)) {
        twiml.message(
          'Please choose today or a future date for your new booking.\n\n' +
          'Today is ' + getTodayDateValue() + '.'
        );
      } else {
        const booking = session.booking;
        const slots = await slotModel.getAvailableSlots({
          merchantId: booking.merchant_id,
          serviceId: booking.service_id,
          staffId: booking.staff_id || null,
          bookingDate: bookingDate
        });

        if (!slots.length) {
          twiml.message(
            'Sorry, there are no available time slots for ' + bookingDate + '.\n\n' +
            'Please enter another date as YYYY-MM-DD.'
          );
        } else {
          await saveSession(sender, {
            state: 'reschedule_awaiting_time',
            customer: session.customer,
            booking: booking,
            bookingDate: bookingDate,
            slots: slots
          });

          twiml.message(getTimeSlotMenu(bookingDate, slots));
        }
      }
    } else if (session && session.state === 'reschedule_awaiting_time') {
      const slotNumber = parseInt(message, 10);
      const selectedSlot = session.slots[slotNumber - 1];

      if (!selectedSlot) {
        twiml.message('Invalid time slot number. Please choose a time slot from the list.');
      } else if (isSameBookingSlot(session.booking, session.bookingDate, selectedSlot.start_time)) {
        twiml.message(
          'That is your current booking slot.\n\n' +
          'Please choose a different time, or reply 0/back to choose another date.'
        );
      } else {
        await saveSession(sender, {
          state: 'reschedule_confirm',
          customer: session.customer,
          booking: session.booking,
          bookingDate: session.bookingDate,
          selectedSlot: selectedSlot
        });

        twiml.message(getRescheduleConfirmation(session.booking, session.bookingDate, selectedSlot));
      }
    } else if (session && session.state === 'reschedule_confirm') {
      if (message === 'yes' || message === 'y') {
        try {
          await bookingModel.rescheduleCustomerBooking(
            session.booking.booking_id,
            session.customer.customer_id,
            session.bookingDate,
            session.selectedSlot.start_time
          );

          const booking = await bookingModel.getBookingById(session.booking.booking_id);
          linkedBookingId = booking.booking_id;

          twiml.message(
            'Your booking has been rescheduled.\n\n' +
            'Booking ID: ' + booking.booking_id + '\n' +
            'Merchant: ' + booking.merchant_name + '\n' +
            'Service: ' + booking.service_name + '\n' +
            'New date: ' + formatBookingDate(booking.booking_date) + '\n' +
            'New time: ' + formatBookingTime(booking.booking_time) + '\n' +
            'Staff: ' + (booking.staff_name || 'Any Available Staff')
          );

          await clearSession(sender, 'completed');
        } catch (error) {
          twiml.message(
            'Sorry, I could not reschedule this booking.\n\n' +
            (error.message || 'Please try again later, or contact Uniday support.')
          );
          await clearSession(sender, 'completed');
        }
      } else if (message === 'no' || message === 'n') {
        twiml.message('No problem. Your booking has not been changed.');
        await clearSession(sender, 'completed');
      } else {
        twiml.message('Please reply YES to reschedule this booking, or NO to keep your current booking.');
      }
    } else if (session && session.state === 'support_awaiting_issue') {
      const issue = incomingMessage.trim();

      if (!issue) {
        twiml.message('Please describe your issue so a Uniday support staff can follow up.');
      } else {
        const ticketId = await supportModel.createWhatsAppSupportRequest({
          customerId: session.customer ? session.customer.customer_id : null,
          phone: String(sender || '').replace('whatsapp:', ''),
          message: issue,
          isDuringSupportHours: session.supportStatus.isDuringSupportHours
        });

        if (session.supportStatus.isDuringSupportHours) {
          twiml.message(
            'Thanks. You have been added to the live support queue.\n\n' +
            'Support Request ID: ' + ticketId + '\n' +
            'A Uniday support staff will follow up shortly.'
          );
        } else {
          twiml.message(
            'Thanks. Your support request has been recorded.\n\n' +
            'Support Request ID: ' + ticketId + '\n' +
            'Our live agents are offline now, but a Uniday support staff will follow up during support hours.'
          );
        }

        await clearSession(sender, 'completed');
      }
    } else if (session && session.state === 'choosing_category') {
      const category = categories[message];

      if (category) {
        const merchants = await getMerchantsForCategory(category);

        if (!merchants.length) {
          await clearSession(sender, 'completed');
          twiml.message('Sorry, we are unable to load merchants right now. Please try again later.');
          return finishWhatsAppResponse(res, twiml, sessionRecord, outgoingMessages, latestMessageType, linkedBookingId);
        }

        await saveSession(sender, {
          state: 'choosing_merchant',
          category: category,
          merchants: merchants,
          customer: session.customer || null
        });

        twiml.message(getMerchantMenu(category, merchants));
      } else {
        twiml.message('Please choose a category from 1 to 8.');
      }
    } else if (session && session.state === 'choosing_merchant') {
      const merchantNumber = parseInt(message, 10);
      const selectedMerchant = session.merchants[merchantNumber - 1];

      if (selectedMerchant) {
        const services = await getServicesForMerchant(selectedMerchant);

        if (!services.length) {
          await clearSession(sender, 'completed');
          twiml.message('Sorry, we are unable to load services right now. Please try again later.');
          return finishWhatsAppResponse(res, twiml, sessionRecord, outgoingMessages, latestMessageType, linkedBookingId);
        }

        await saveSession(sender, {
          state: 'choosing_service',
          category: session.category,
          merchant: selectedMerchant,
          services: services,
          customer: session.customer || null
        });

        twiml.message(getServiceMenu(selectedMerchant, services));
      } else {
        twiml.message('Invalid merchant number. Please choose a merchant from the list.');
      }
    } else if (session && session.state === 'choosing_service') {
      const serviceNumber = parseInt(message, 10);
      const selectedService = session.services[serviceNumber - 1];

      if (selectedService) {
        await saveSession(sender, {
          state: 'choosing_date',
          category: session.category,
          merchant: session.merchant,
          service: selectedService,
          customer: session.customer || null
        });

        twiml.message(getDatePrompt(selectedService));
      } else {
        twiml.message('Invalid service number. Please choose a service from the list.');
      }
    } else if (session && session.state === 'choosing_date') {
      const bookingDate = message;

      if (isCurrentOrFutureDate(bookingDate)) {
        const slots = await getTimeSlotsForDate(session, bookingDate);

        if (!slots.length) {
          twiml.message(
            'Sorry, there are no available time slots for ' + bookingDate + '.\n\n' +
            'Please enter another date as YYYY-MM-DD.'
          );
          return finishWhatsAppResponse(res, twiml, sessionRecord, outgoingMessages, latestMessageType, linkedBookingId);
        }

        await saveSession(sender, {
          state: 'choosing_time_slot',
          category: session.category,
          merchant: session.merchant,
          service: session.service,
          customer: session.customer || null,
          bookingDate: bookingDate,
          slots: slots
        });

        twiml.message(getTimeSlotMenu(bookingDate, slots));
      } else if (isValidDate(bookingDate)) {
        twiml.message(
          'Please choose today or a future date for your booking.\n\n' +
          'Today is ' + getTodayDateValue() + '.'
        );
      } else {
        twiml.message(
          'Invalid date format. Please enter your preferred booking date as YYYY-MM-DD.\n\n' +
          'Example: 2026-05-20'
        );
      }
    } else if (session && session.state === 'choosing_time_slot') {
      const slotNumber = parseInt(message, 10);
      const selectedSlot = session.slots[slotNumber - 1];

      if (selectedSlot) {
        const staff = await getStaffForTimeSlot(session, selectedSlot);

        if (!staff.length) {
          await clearSession(sender, 'completed');
          twiml.message('Sorry, we are unable to load staff availability right now. Please try again later.');
          return finishWhatsAppResponse(res, twiml, sessionRecord, outgoingMessages, latestMessageType, linkedBookingId);
        }

        await saveSession(sender, {
          state: 'choosing_staff',
          category: session.category,
          merchant: session.merchant,
          service: session.service,
          customer: session.customer || null,
          bookingDate: session.bookingDate,
          selectedSlot: selectedSlot,
          staff: staff
        });

        twiml.message(getStaffMenu(staff));
      } else {
        twiml.message('Invalid time slot number. Please choose a time slot from the list.');
      }
    } else if (session && session.state === 'choosing_staff') {
      const staffNumber = parseInt(message, 10);
      const selectedStaff = staffNumber === 1 ? null : session.staff[staffNumber - 2];

      if (staffNumber === 1 || selectedStaff) {
        const staffName = selectedStaff ? selectedStaff.full_name : 'No Preference';

        if (!session.customer) {
          twiml.message(
            'Your booking details are ready.\n\n' +
            'Merchant: ' + session.merchant.merchant_name + '\n' +
            'Service: ' + session.service.service_name + '\n' +
            'Date: ' + session.bookingDate + '\n' +
            'Time: ' + session.selectedSlot.label + '\n' +
            'Staff: ' + staffName + '\n\n' +
            'Please log in or create a Uniday account to confirm this booking:\n' +
            getLoginLink(sender) + '\n\n' +
            'After your account is linked, future WhatsApp bookings can go straight to payment.'
          );

          await clearSession(sender, 'completed');
          return finishWhatsAppResponse(res, twiml, sessionRecord, outgoingMessages, latestMessageType, linkedBookingId);
        }

        let bookingId;

        try {
          bookingId = await bookingModel.createBooking({
            customerId: session.customer.customer_id,
            serviceId: session.service.service_id,
            merchantId: session.merchant.merchant_id,
            bookingDate: session.bookingDate,
            bookingTime: session.selectedSlot.start_time,
            staffId: selectedStaff ? selectedStaff.staff_id : null,
            source: 'whatsapp'
          });
        } catch (error) {
          if (!isCustomerOverlapError(error)) {
            throw error;
          }

          const slots = await getTimeSlotsForDate(session, session.bookingDate);
          await saveSession(sender, {
            state: 'choosing_time_slot',
            category: session.category,
            merchant: session.merchant,
            service: session.service,
            customer: session.customer,
            bookingDate: session.bookingDate,
            slots: slots
          });

          twiml.message(
            getCustomerOverlapMessage(error) + '\n\n' +
            getTimeSlotMenu(session.bookingDate, slots) + '\n' +
            'Reply MENU to restart.'
          );
          return finishWhatsAppResponse(res, twiml, sessionRecord, outgoingMessages, latestMessageType, linkedBookingId);
        }
        linkedBookingId = bookingId;

        try {
          await whatsappModel.linkLatestInboundMessageToBooking(
            sessionRecord ? sessionRecord.session_id : null,
            bookingId
          );
        } catch (error) {
          console.error('[whatsapp] Failed to link inbound message to booking:', error.message);
        }

        await saveSession(sender, {
          ...session,
          state: 'booking_created',
          bookingId: bookingId
        });

        const paymentLink = getPaymentLink(bookingId);

        twiml.message(
          'Perfect! Your booking is pending payment.\n\n' +
          'Booking ID: ' + bookingId + '\n' +
          'Merchant: ' + session.merchant.merchant_name + '\n' +
          'Service: ' + session.service.service_name + '\n' +
          'Date: ' + session.bookingDate + '\n' +
          'Time: ' + session.selectedSlot.label + '\n' +
          'Staff: ' + staffName + '\n' +
          'Total: $' + getServicePrice(session.service) + '\n\n' +
          'Please complete payment using this link:\n' +
          paymentLink
        );

        await clearSession(sender, 'completed');
      } else {
        twiml.message('Invalid staff number. Please choose a staff option from the list.');
      }
    } else if (message === '1') {
      const customer = await whatsappModel.findExistingCustomerByPhone(sender);

      await saveSession(sender, {
        state: 'choosing_category',
        customer: customer
      });

      twiml.message(getCategoryMenu());
    } else if (message === '2') {
      const customer = await getVerifiedCustomerForSender(sender);

      if (!customer) {
        twiml.message(
          'Please log in or create a Uniday account before viewing a booking through WhatsApp:\n' +
          getLoginLink(sender)
        );
      } else {
        await showBookingViewMenu(sender, twiml, customer);
      }
    } else if (message === '3' || message === 'cancel' || message === 'cancel booking') {
      const customer = await getVerifiedCustomerForSender(sender);

      if (!customer) {
        twiml.message(
          'Please log in or create a Uniday account before cancelling a booking through WhatsApp:\n' +
          getLoginLink(sender)
        );
      } else {
        await saveSession(sender, {
          state: 'cancelling_awaiting_id',
          customer: customer
        });

        twiml.message('Please enter the booking ID you want to cancel.');
      }
    } else if (message === '4' || message === 'reschedule' || message === 'reschedule booking') {
      const customer = await getVerifiedCustomerForSender(sender);

      if (!customer) {
        twiml.message(
          'Please log in or create a Uniday account before rescheduling a booking through WhatsApp:\n' +
          getLoginLink(sender)
        );
      } else {
        await saveSession(sender, {
          state: 'reschedule_awaiting_id',
          customer: customer
        });

        twiml.message('Please enter the booking ID you want to reschedule.');
      }
    } else if (message === '5') {
      await startSupportSession(sender, twiml);
    } else {
      await clearSession(sender, 'completed');
      twiml.message(getMainMenu());
    }
  } catch (error) {
    console.error('WhatsApp webhook error:', error.message);
    twiml.message('Sorry, something went wrong. Please reply menu to start again.');
  }

  return finishWhatsAppResponse(res, twiml, sessionRecord, outgoingMessages, latestMessageType, linkedBookingId);
}

module.exports = { receiveMessage };
