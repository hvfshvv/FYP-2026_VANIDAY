const twilio = require('twilio');

const userSessions = {};
const categories = {
  1: 'Hair',
  2: 'Nails',
  3: 'Skin & Facial',
  4: 'Massage'
};
const merchantsByCategory = {
  Hair: [
    'Luxe Hair Studio',
    'Glossy Locks',
    'The Hair Room'
  ],
  Nails: [
    'Nail Haven',
    'Blush Nail Bar',
    'Glossy Tips Studio'
  ],
  'Skin & Facial': [
    'Glow Beauty Spa',
    'Pure Skin Studio',
    'Radiance Facial House'
  ],
  Massage: [
    'Calm Body Spa',
    'Zen Wellness Studio',
    'Relax & Restore'
  ]
};

function receiveMessage(req, res) {
  const incomingMessage = req.body.Body;
  const message = incomingMessage.toLowerCase().trim();
  const sender = req.body.From;

  console.log('Incoming WhatsApp message:', incomingMessage);

  const twiml = new twilio.twiml.MessagingResponse();

  if (userSessions[sender] === 'checking_reservation') {
    const bookingId = incomingMessage.trim();

    twiml.message('Thanks! I will check reservation ID: ' + bookingId);
    delete userSessions[sender];
  } else if (userSessions[sender] === 'choosing_category') {
    const category = categories[message];

    if (category) {
      const merchants = merchantsByCategory[category];
      const merchantList = merchants
        .map(function (merchant, index) {
          return index + 1 + '. ' + merchant;
        })
        .join('\n');

      userSessions[sender] = 'choosing_merchant';
      twiml.message(
        'You selected ' + category + '.\n\n' +
        'Here are some available merchants:\n\n' +
        merchantList + '\n\n' +
        'Please reply with the merchant number.'
      );
    } else {
      twiml.message('Please choose 1, 2, 3, or 4.');
    }
  } else if (message === '1') {
    userSessions[sender] = 'choosing_category';
    twiml.message(
      'Great! Let\'s book a service. What type of service are you looking for?\n\n' +
      '1. Hair\n' +
      '2. Nails\n' +
      '3. Skin & Facial\n' +
      '4. Massage'
    );
  } else if (message === '2') {
    userSessions[sender] = 'checking_reservation';
    twiml.message('Please enter your booking ID to check your reservation.');
  } else if (message === '3') {
    twiml.message('Sure! I can help you with booking, checking reservations, cancellations, and rescheduling. For urgent issues, a Uniday support staff can follow up later.');
  } else {
    twiml.message(
      'Hi, welcome to Uniday! 💖\n' +
      'What would you like to do today?\n\n' +
      '1. Book a Service\n' +
      '2. Check Reservation\n' +
      '3. Contact Agent\n\n' +
      'Reply with 1, 2, or 3.'
    );
  }

  res.type('text/xml');
  res.send(twiml.toString());
}

module.exports = { receiveMessage };
