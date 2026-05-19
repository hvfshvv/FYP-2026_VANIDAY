const twilio = require('twilio');
const merchantModel = require('../models/merchantModel');
const bookingModel = require('../models/bookingModel');
const staffModel = require('../models/staffModel');

const userSessions = {};

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

const demoMerchantsByCategory = {
  Hair: [
    { merchant_name: 'Luxe Hair Studio' },
    { merchant_name: 'Glossy Locks' },
    { merchant_name: 'The Hair Room' }
  ],
  Nails: [
    { merchant_name: 'Nail Haven' },
    { merchant_name: 'Blush Nail Bar' },
    { merchant_name: 'Glossy Tips Studio' }
  ],
  Facial: [
    { merchant_name: 'Glow Beauty Spa' },
    { merchant_name: 'Pure Skin Studio' },
    { merchant_name: 'Radiance Facial House' }
  ],
  Massage: [
    { merchant_name: 'Calm Body Spa' },
    { merchant_name: 'Zen Wellness Studio' },
    { merchant_name: 'Relax & Restore' }
  ],
  Wellness: [
    { merchant_name: 'Zen Wellness Studio' },
    { merchant_name: 'Balance Wellness Loft' },
    { merchant_name: 'Mindful Movement Studio' }
  ],
  Body: [
    { merchant_name: 'Goddess Beauty Bar' },
    { merchant_name: 'Smooth Body Studio' },
    { merchant_name: 'Contour & Glow' }
  ],
  Aesthetics: [
    { merchant_name: 'Pretty Lash Studio' },
    { merchant_name: 'Brow & Lash Atelier' },
    { merchant_name: 'Aesthetic Glow Lab' }
  ],
  Spa: [
    { merchant_name: 'The Spa Sanctuary' },
    { merchant_name: 'Urban Bliss Spa' },
    { merchant_name: 'Serenity Spa House' }
  ]
};

const demoServicesByCategory = {
  Hair: [
    { service_name: 'Haircut & Styling', price: 35, duration_mins: 45 },
    { service_name: 'Hair Colouring', price: 88, duration_mins: 120 },
    { service_name: 'Scalp Treatment', price: 68, duration_mins: 60 }
  ],
  Nails: [
    { service_name: 'Classic Manicure', price: 28, duration_mins: 45 },
    { service_name: 'Gel Manicure', price: 48, duration_mins: 60 },
    { service_name: 'Nail Art Set', price: 68, duration_mins: 90 }
  ],
  Facial: [
    { service_name: 'Hydrating Facial', price: 58, duration_mins: 60 },
    { service_name: 'Deep Cleansing Facial', price: 78, duration_mins: 75 },
    { service_name: 'Brightening Treatment', price: 88, duration_mins: 90 }
  ],
  Massage: [
    { service_name: 'Relaxing Body Massage', price: 68, duration_mins: 60 },
    { service_name: 'Deep Tissue Massage', price: 88, duration_mins: 75 },
    { service_name: 'Aromatherapy Massage', price: 98, duration_mins: 90 }
  ],
  Wellness: [
    { service_name: 'Yoga Class', price: 28, duration_mins: 60 },
    { service_name: 'Pilates Session', price: 38, duration_mins: 60 },
    { service_name: 'Reflexology', price: 45, duration_mins: 45 }
  ],
  Body: [
    { service_name: 'Body Waxing', price: 40, duration_mins: 30 },
    { service_name: 'Body Scrub', price: 65, duration_mins: 60 },
    { service_name: 'Toning Treatment', price: 88, duration_mins: 75 }
  ],
  Aesthetics: [
    { service_name: 'Lash Extensions', price: 88, duration_mins: 90 },
    { service_name: 'Brow Shaping', price: 28, duration_mins: 30 },
    { service_name: 'Lash Lift', price: 68, duration_mins: 60 }
  ],
  Spa: [
    { service_name: 'Aromatherapy Facial', price: 85, duration_mins: 60 },
    { service_name: 'Body Scrub & Wrap', price: 120, duration_mins: 90 },
    { service_name: 'Luxury Spa Package', price: 158, duration_mins: 120 }
  ]
};

const demoTimeSlots = [
  { label: '10:00', start_time: '10:00:00' },
  { label: '11:30', start_time: '11:30:00' },
  { label: '14:00', start_time: '14:00:00' },
  { label: '16:30', start_time: '16:30:00' }
];

const demoStaff = [
  { full_name: 'Alex Tan', role: 'Senior Specialist' },
  { full_name: 'Jamie Lee', role: 'Service Specialist' }
];

function getMainMenu() {
  return (
    'Hi, welcome to Uniday! 💖\n' +
    'What would you like to do today?\n\n' +
    '1. Book a Service\n' +
    '2. Check Reservation\n' +
    '3. Help / Support\n\n' +
    'Reply with 1, 2, or 3.\n' +
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

function formatBookingDate(value) {
  if (!value) {
    return 'Not available';
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
}

function formatBookingTime(value) {
  if (!value) {
    return 'Not available';
  }

  return String(value).slice(0, 5);
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

async function checkReservation(bookingId) {
  try {
    const booking = await bookingModel.getBookingById(bookingId);
    return { booking: booking, error: null };
  } catch (error) {
    console.error('Failed to check reservation:', error.message);
    return { booking: null, error: error };
  }
}

function sendTwiml(res, twiml) {
  res.writeHead(200, { 'Content-Type': 'text/xml' });
  res.end(twiml.toString());
}

function saveSession(sender, nextSession) {
  nextSession.previous = userSessions[sender] || null;
  userSessions[sender] = nextSession;
}

function goBack(sender, twiml) {
  const session = userSessions[sender];

  if (!session || !session.previous) {
    delete userSessions[sender];
    twiml.message(getMainMenu());
    return;
  }

  const previous = session.previous;
  userSessions[sender] = previous;

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
    delete userSessions[sender];
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

async function getMerchantsForCategory(category) {
  try {
    const merchants = await merchantModel.getAllActiveMerchants(category);

    if (merchants.length > 0) {
      return merchants;
    }
  } catch (error) {
    console.error('Failed to load merchants from database:', error.message);
  }

  return demoMerchantsByCategory[category];
}

async function getServicesForMerchant(merchant, category) {
  try {
    if (merchant.merchant_id) {
      const services = await merchantModel.getMerchantServices(merchant.merchant_id);

      if (services.length > 0) {
        return services;
      }
    }
  } catch (error) {
    console.error('Failed to load services from database:', error.message);
  }

  return demoServicesByCategory[category];
}

async function getTimeSlotsForDate(session, bookingDate) {
  try {
    if (session.merchant.merchant_id && session.service.service_id) {
      const slots = await bookingModel.getAvailableSlots({
        merchantId: session.merchant.merchant_id,
        serviceId: session.service.service_id,
        bookingDate: bookingDate
      });

      if (slots.length > 0) {
        return slots;
      }
    }
  } catch (error) {
    console.error('Failed to load time slots from database:', error.message);
  }

  return demoTimeSlots;
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
        const slots = await bookingModel.getAvailableSlots({
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

      if (availableStaff.length > 0) {
        return availableStaff;
      }
    }
  } catch (error) {
    console.error('Failed to load staff from database:', error.message);
  }

  return demoStaff;
}

async function receiveMessage(req, res) {
  const twiml = new twilio.twiml.MessagingResponse();

  try {
    const incomingMessage = req.body.Body || '';
    const message = incomingMessage.toLowerCase().trim();
    const sender = req.body.From || 'unknown';
    const session = userSessions[sender];

    console.log('Incoming WhatsApp message:', incomingMessage);

    if (message === 'reset' || message === 'menu' || message === 'hi' || message === 'hello') {
      delete userSessions[sender];
      twiml.message(getMainMenu());
    } else if (message === '0' || message === 'back') {
      goBack(sender, twiml);
    } else if (session && session.state === 'checking_reservation') {
      const bookingId = incomingMessage.trim();
      const result = await checkReservation(bookingId);

      if (result.booking) {
        twiml.message(getReservationSummary(result.booking));
        delete userSessions[sender];
      } else if (result.error) {
        twiml.message(
          'Sorry, I could not check reservations right now.\n\n' +
          'Please try again later, or reply menu to start over.'
        );
      } else {
        twiml.message(
          'Sorry, I could not find a reservation with booking ID: ' + bookingId + '.\n\n' +
          'Please enter another booking ID, or reply menu to start over.'
        );
      }
    } else if (session && session.state === 'choosing_category') {
      const category = categories[message];

      if (category) {
        const merchants = await getMerchantsForCategory(category);

        saveSession(sender, {
          state: 'choosing_merchant',
          category: category,
          merchants: merchants
        });

        twiml.message(getMerchantMenu(category, merchants));
      } else {
        twiml.message('Please choose a category from 1 to 8.');
      }
    } else if (session && session.state === 'choosing_merchant') {
      const merchantNumber = parseInt(message, 10);
      const selectedMerchant = session.merchants[merchantNumber - 1];

      if (selectedMerchant) {
        const services = await getServicesForMerchant(selectedMerchant, session.category);

        saveSession(sender, {
          state: 'choosing_service',
          category: session.category,
          merchant: selectedMerchant,
          services: services
        });

        twiml.message(getServiceMenu(selectedMerchant, services));
      } else {
        twiml.message('Invalid merchant number. Please choose a merchant from the list.');
      }
    } else if (session && session.state === 'choosing_service') {
      const serviceNumber = parseInt(message, 10);
      const selectedService = session.services[serviceNumber - 1];

      if (selectedService) {
        saveSession(sender, {
          state: 'choosing_date',
          category: session.category,
          merchant: session.merchant,
          service: selectedService
        });

        twiml.message(getDatePrompt(selectedService));
      } else {
        twiml.message('Invalid service number. Please choose a service from the list.');
      }
    } else if (session && session.state === 'choosing_date') {
      const bookingDate = message;

      if (isValidDate(bookingDate)) {
        const slots = await getTimeSlotsForDate(session, bookingDate);

        saveSession(sender, {
          state: 'choosing_time_slot',
          category: session.category,
          merchant: session.merchant,
          service: session.service,
          bookingDate: bookingDate,
          slots: slots
        });

        twiml.message(getTimeSlotMenu(bookingDate, slots));
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

        saveSession(sender, {
          state: 'choosing_staff',
          category: session.category,
          merchant: session.merchant,
          service: session.service,
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
        const bookingReference = 'WA-' + Date.now();
        const paymentLink = getPaymentLink(bookingReference);
        const staffName = selectedStaff ? selectedStaff.full_name : 'No Preference';

        twiml.message(
          'Perfect! Your booking is pending payment.\n\n' +
          'Booking Reference: ' + bookingReference + '\n' +
          'Merchant: ' + session.merchant.merchant_name + '\n' +
          'Service: ' + session.service.service_name + '\n' +
          'Date: ' + session.bookingDate + '\n' +
          'Time: ' + session.selectedSlot.label + '\n' +
          'Staff: ' + staffName + '\n' +
          'Total: $' + getServicePrice(session.service) + '\n\n' +
          'Please complete payment using this link:\n' +
          paymentLink + '\n\n' +
          'Note: This is a demo WhatsApp booking reference. Database booking creation will be connected later.'
        );

        delete userSessions[sender];
      } else {
        twiml.message('Invalid staff number. Please choose a staff option from the list.');
      }
    } else if (message === '1') {
      saveSession(sender, {
        state: 'choosing_category'
      });

      twiml.message(getCategoryMenu());
    } else if (message === '2') {
      saveSession(sender, {
        state: 'checking_reservation'
      });

      twiml.message('Please enter your booking ID to check your reservation.');
    } else if (message === '3') {
      twiml.message('Sure! I can help you with booking, checking reservations, cancellations, and rescheduling. For urgent issues, a Uniday support staff can follow up later.');
    } else {
      delete userSessions[sender];
      twiml.message(getMainMenu());
    }
  } catch (error) {
    console.error('WhatsApp webhook error:', error.message);
    twiml.message('Sorry, something went wrong. Please reply menu to start again.');
  }

  return sendTwiml(res, twiml);
}

module.exports = { receiveMessage };
