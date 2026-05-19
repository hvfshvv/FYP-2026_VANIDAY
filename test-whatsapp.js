const { receiveMessage } = require('./controllers/whatsappController');

const sender = 'whatsapp:+6589483241';
const messages = [
  'menu',
  '1',
  '2',
  '3',
  'invalid text'
];

function createMockRequest(message) {
  return {
    body: {
      Body: message,
      From: sender
    }
  };
}

function createMockResponse(done) {
  return {
    writeHead: function (statusCode, headers) {
      console.log('Status:', statusCode);
      console.log('Headers:', headers);
    },
    end: function (body) {
      console.log(body);
      console.log('----------------------------------------');
      done();
    }
  };
}

async function testMessage(message) {
  console.log('Message:', message);

  return new Promise(function (resolve, reject) {
    const req = createMockRequest(message);
    const res = createMockResponse(resolve);

    Promise.resolve(receiveMessage(req, res)).catch(reject);
  });
}

async function runTests() {
  for (const message of messages) {
    await testMessage(message);
  }
}

runTests().catch(function (error) {
  console.error('Test failed:', error);
});
