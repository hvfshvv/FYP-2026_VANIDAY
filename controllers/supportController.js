const supportModel = require('../models/supportModel');

const ISSUE_CATEGORIES = [
  'booking',
  'payment',
  'refund',
  'voucher_promotion',
  'whatsapp',
  'account',
  'merchant',
  'technical',
  'other'
];

const FAQS = [
  {
    question: 'How do I cancel a booking?',
    answer: 'Open My Bookings, choose the booking, and use the cancel option if the appointment is still eligible for cancellation.'
  },
  {
    question: 'How do I reschedule a booking?',
    answer: 'Open My Bookings and choose reschedule on an eligible booking. Available slots depend on the merchant and service.'
  },
  {
    question: 'When will I receive my refund?',
    answer: 'Refund timing depends on the payment method and cancellation policy. Card refunds may take several working days after processing.'
  },
  {
    question: 'Why is my booking pending payment?',
    answer: 'A pending payment booking means the slot is reserved temporarily while payment is incomplete. Complete payment from My Bookings before the hold expires.'
  },
  {
    question: 'How do vouchers and promotions work?',
    answer: 'Promotions are applied from merchant offers, while vouchers are claimed into your wallet and applied during checkout when eligible.'
  },
  {
    question: 'How do I contact support through WhatsApp?',
    answer: 'Use the WhatsApp support button on this page, or reply Help / Support from the Uniday WhatsApp menu.'
  }
];

function categoryLabel(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, character => character.toUpperCase());
}

function getCustomerSession(req) {
  const user = req.session && req.session.user;
  return user && user.role === 'customer' ? user : null;
}

function getDefaultFormData(req) {
  const customer = getCustomerSession(req);

  return {
    name: customer ? customer.full_name || '' : '',
    email: customer ? customer.email || '' : '',
    phone: customer ? customer.phone || '' : '',
    category: '',
    message: ''
  };
}

function getWhatsAppSupportUrl() {
  const digits = String(process.env.TWILIO_WHATSAPP_NUMBER || '')
    .replace('whatsapp:', '')
    .replace(/\D/g, '');

  if (!digits) return null;

  const text = encodeURIComponent('support');
  return `https://wa.me/${digits}?text=${text}`;
}

function renderSupportPage(req, res, options = {}) {
  res.render('support', {
    title: 'Help & Customer Support',
    faqs: FAQS,
    categories: ISSUE_CATEGORIES.map(value => ({
      value,
      label: categoryLabel(value)
    })),
    formData: options.formData || getDefaultFormData(req),
    errors: options.errors || {},
    successMessage: options.successMessage || null,
    reference: options.reference || null,
    whatsappSupportUrl: getWhatsAppSupportUrl()
  });
}

function normalizeForm(body) {
  return {
    name: String(body.name || '').trim(),
    email: String(body.email || '').trim().toLowerCase(),
    phone: String(body.phone || '').trim(),
    category: String(body.category || '').trim(),
    message: String(body.message || '').trim(),
    website: String(body.website || '').trim()
  };
}

function validateForm(data) {
  const errors = {};
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phonePattern = /^[+()\-\s\d]{7,30}$/;

  if (data.name.length < 2 || data.name.length > 100) {
    errors.name = 'Please enter a name between 2 and 100 characters.';
  }

  if (!data.email || data.email.length > 254 || !emailPattern.test(data.email)) {
    errors.email = 'Please enter a valid email address.';
  }

  if (data.phone && (data.phone.length > 30 || !phonePattern.test(data.phone))) {
    errors.phone = 'Please enter a valid phone number, or leave it blank.';
  }

  if (!ISSUE_CATEGORIES.includes(data.category)) {
    errors.category = 'Please choose a valid issue category.';
  }

  if (data.message.length < 10 || data.message.length > 2000) {
    errors.message = 'Please describe the issue in 10 to 2000 characters.';
  }

  return errors;
}

function showSupport(req, res) {
  renderSupportPage(req, res);
}

async function submitSupport(req, res) {
  const data = normalizeForm(req.body || {});

  if (data.website) {
    return renderSupportPage(req, res, {
      successMessage: 'Your support request has been submitted successfully. Our support team will review it as soon as possible.'
    });
  }

  const errors = validateForm(data);
  const formData = {
    name: data.name,
    email: data.email,
    phone: data.phone,
    category: data.category,
    message: data.message
  };

  if (Object.keys(errors).length) {
    return renderSupportPage(req, res, { formData, errors });
  }

  const customer = getCustomerSession(req);
  const userId = customer ? customer.user_id : null;

  try {
    const logId = await supportModel.createWebSupportRequest({
      userId,
      submittedBy: customer ? 'Logged-in customer' : 'Guest',
      name: data.name,
      email: data.email,
      phone: data.phone,
      category: data.category,
      message: data.message
    });

    renderSupportPage(req, res, {
      formData: getDefaultFormData(req),
      successMessage: 'Your support request has been submitted successfully. Our support team will review it as soon as possible.',
      reference: logId ? `SUP-${logId}` : null
    });
  } catch (err) {
    console.error('[support] Failed to create web support request:', err.message);
    renderSupportPage(req, res, {
      formData,
      errors: {
        form: 'We could not submit your request right now. Please try again.'
      }
    });
  }
}

module.exports = {
  showSupport,
  submitSupport,
  ISSUE_CATEGORIES
};
