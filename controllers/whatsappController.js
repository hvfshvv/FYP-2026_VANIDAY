const twilio = require('twilio');
const merchantModel = require('../models/merchantModel');
const bookingModel = require('../models/bookingModel');
const whatsappModel = require('../models/whatsappModel');

const userSessions = {};

const categories = {
  1: 'Hair',
  2: 'Nails',
  3: 'Skin & Facial',
  4: 'Massage'
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
  'Skin & Facial': [
    { merchant_name: 'Glow Beauty Spa' },
    { merchant_name: 'Pure Skin Studio' },
    { merchant_name: 'Radiance Facial House' }
  ],
  Massage: [
    { merchant_name: 'Calm Body Spa' },
    { merchant_name: 'Zen Wellness Studio' },
    { merchant_name: 'Relax & Restore' }
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
  'Skin & Facial': [
    { service_name: 'Hydrating Facial', price: 58, duration_mins: 60 },
    { service_name: 'Deep Cleansing Facial', price: 78, duration_mins: 75 },
    { service_name: 'Brightening Treatment', price: 88, duration_mins: 90 }
  ],
  Massage: [
    { service_name: 'Relaxing Body Massage', price: 68, duration_mins: 60 },
    { service_name: 'Deep Tissue Massage', price: 88, duration_mins: 75 },
    { service_name: 'Aromatherapy Massage', price: 98, duration_mins: 90 }
  ]
};

const demoTimeSlots = [
  { label: '10:00', start_time: '10:00:00' },
  { label: '11:30', start_time: '11:30:00' },
  { label: '14:00', start_time: '14:00:00' },
  { label: '16:30', start_time: '16:30:00' }
];

function getMainMenu() {
  return (
    'Hi, welcome to Uniday! 💖\n' +
    'What would you like to do today?\n\n' +
    '1. Book a Service\n' +
    '2. Check Reservation\n' +
    '3. Help / Support\n\n' +
    'Reply with 1, 2, or 3.'
  );
}

function getCategoryMenu() {
  return (
    'Great! Let\'s book a service. What type of service are you looking for?\n\n' +
    '1. Hair\n' +
    '2. Nails\n' +
    '3. Skin & Facial\n' +
    '4. Massage'
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

function getServicePrice(service) {
  return Number(service.price || 0).toFixed(2);
}

function getPaymentLink(bookingReference) {
  const baseUrl = process.env.APP_URL || process.env.APP_BASE_URL || 'http://localhost:3000';

  return baseUrl + '/payment/checkout/' + bookingReference;
}

function canCreateRealBooking(session) {
  return Boolean(
    session.merchant &&
    session.merchant.merchant_id &&
    session.service &&
    session.service.service_id
  );
}

async function createWhatsappBooking(sender, session, selectedSlot) {
  const customer = await whatsappModel.findOrCreateCustomerByPhone(sender);

  return bookingModel.createBooking({
    customerId: customer.customer_id,
    merchantId: session.merchant.merchant_id,
    serviceId: session.service.service_id,
    bookingDate: session.bookingDate,
    bookingTime: selectedSlot.start_time,
    source: 'whatsapp'
  });
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

async function receiveMessage(req, res) {
  const incomingMessage = req.body.Body || '';
  const message = incomingMessage.toLowerCase().trim();
  const sender = req.body.From;
  const session = userSessions[sender];

  console.log('Incoming WhatsApp message:', incomingMessage, 'Current state:', session ? session.state : 'none');

  const twiml = new twilio.twiml.MessagingResponse();

  if (message === 'reset' || message === 'menu' || message === 'hi' || message === 'hello') {
    delete userSessions[sender];
    twiml.message(getMainMenu());
  } else if (session && session.state === 'checking_reservation') {
    const bookingId = incomingMessage.trim();

    twiml.message('Thanks! I will check reservation ID: ' + bookingId);
    delete userSessions[sender];
  } else if (session && session.state === 'choosing_category') {
    const category = categories[message];

    if (category) {
      const merchants = await getMerchantsForCategory(category);

      userSessions[sender] = {
        state: 'choosing_merchant',
        category: category,
        merchants: merchants
      };

      twiml.message(
        'You selected ' + category + '.\n\n' +
        'Here are some available merchants:\n\n' +
        formatMerchants(merchants) + '\n\n' +
        'Please reply with the merchant number.'
      );
    } else {
      twiml.message('Please choose 1, 2, 3, or 4.');
    }
  } else if (session && session.state === 'choosing_merchant') {
    const merchantNumber = parseInt(message, 10);
    const selectedMerchant = session.merchants[merchantNumber - 1];

    if (selectedMerchant) {
      const services = await getServicesForMerchant(selectedMerchant, session.category);

      userSessions[sender] = {
        state: 'choosing_service',
        category: session.category,
        merchant: selectedMerchant,
        services: services
      };

      twiml.message(
        'You selected ' + selectedMerchant.merchant_name + '.\n\n' +
        'Here are the available services:\n\n' +
        formatServices(services) + '\n\n' +
        'Please reply with the service number.'
      );
    } else {
      twiml.message('Invalid merchant number. Please choose a merchant from the list.');
    }
  } else if (session && session.state === 'choosing_service') {
    const serviceNumber = parseInt(message, 10);
    const selectedService = session.services[serviceNumber - 1];

    if (selectedService) {
      userSessions[sender] = {
        state: 'choosing_date',
        category: session.category,
        merchant: session.merchant,
        service: selectedService
      };

      twiml.message(
        'You selected ' + selectedService.service_name + '.\n\n' +
        'Please enter your preferred booking date in this format:\n\n' +
        'YYYY-MM-DD\n\n' +
        'Example: 2026-05-20'
      );
    } else {
      twiml.message('Invalid service number. Please choose a service from the list.');
    }
  } else if (session && session.state === 'choosing_date') {
    const bookingDate = message;

    if (isValidDate(bookingDate)) {
      const slots = await getTimeSlotsForDate(session, bookingDate);

      userSessions[sender] = {
        state: 'choosing_time_slot',
        category: session.category,
        merchant: session.merchant,
        service: session.service,
        bookingDate: bookingDate,
        slots: slots
      };

      twiml.message(
        'Here are the available time slots for ' + bookingDate + ':\n\n' +
        formatTimeSlots(slots) + '\n\n' +
        'Please reply with the time slot number.'
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
      let bookingReference = 'WA-' + Date.now();
      let bookingNote = 'Note: This is a demo WhatsApp booking reference. Database booking creation will be connected later.';

      if (canCreateRealBooking(session)) {
        try {
          bookingReference = await createWhatsappBooking(sender, session, selectedSlot);
          bookingNote = 'Your booking has been saved with status pending_payment.';
        } catch (error) {
          console.error('Failed to create WhatsApp booking:', error.message);
          bookingNote = 'Note: I could not save this booking to the database yet, so this is a demo WhatsApp booking reference.';
        }
      }

      const paymentLink = getPaymentLink(bookingReference);

      twiml.message(
        'Perfect! Your booking is pending payment.\n\n' +
        'Booking Reference: ' + bookingReference + '\n' +
        'Merchant: ' + session.merchant.merchant_name + '\n' +
        'Service: ' + session.service.service_name + '\n' +
        'Date: ' + session.bookingDate + '\n' +
        'Time: ' + selectedSlot.label + '\n' +
        'Total: $' + getServicePrice(session.service) + '\n\n' +
        'Please complete payment using this link:\n' +
        paymentLink + '\n\n' +
        bookingNote
      );

      delete userSessions[sender];
    } else {
      twiml.message('Invalid time slot number. Please choose a time slot from the list.');
    }
  } else if (message === '1') {
    userSessions[sender] = {
      state: 'choosing_category'
    };

    twiml.message(getCategoryMenu());
  } else if (message === '2') {
    userSessions[sender] = {
      state: 'checking_reservation'
    };

    twiml.message('Please enter your booking ID to check your reservation.');
  } else if (message === '3') {
    twiml.message('Sure! I can help you with booking, checking reservations, cancellations, and rescheduling. For urgent issues, a Uniday support staff can follow up later.');
  } else {
    delete userSessions[sender];
    twiml.message(getMainMenu());
  }

  res.type('text/xml');
  res.send(twiml.toString());
}

module.exports = { receiveMessage };
