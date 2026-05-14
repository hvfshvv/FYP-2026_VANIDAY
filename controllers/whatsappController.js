const twilio = require('twilio');

function receiveMessage(req, res) {
  const incomingMessage = req.body.Body;

  console.log('Incoming WhatsApp message:', incomingMessage);

  const twiml = new twilio.twiml.MessagingResponse();
  twiml.message('Hello from Uniday WhatsApp Booking System 💖');

  res.type('text/xml');
  res.send(twiml.toString());
}

module.exports = { receiveMessage };
