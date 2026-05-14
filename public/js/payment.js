/* Uniday Payment Page */
(function () {
  'use strict';

  const dataEl = document.getElementById('payment-data');
  const errorEl = document.getElementById('payment-error');
  const cardErrorEl = document.getElementById('card-errors');
  const stripeButton = document.getElementById('stripe-pay-btn');
  const paynowButton = document.getElementById('paynow-pay-btn');

  if (!dataEl || !window.Stripe) {
    showError('Stripe could not load. Please refresh and try again.');
    return;
  }

  const BOOKING_ID = dataEl.dataset.bookingId;
  const STRIPE_KEY = dataEl.dataset.stripeKey;
  let stripe;
  let elements;

  window.switchTab = function (tab) {
    ['stripe', 'paynow'].forEach(t => {
      document.getElementById(`tab-${t}`).classList.toggle('active', t === tab);
      document.getElementById(`panel-${t}`).classList.toggle('d-none', t !== tab);
    });
    hideError();
  };

  initStripe();

  async function initStripe() {
    if (!STRIPE_KEY) {
      showError('Stripe publishable key is missing. Add STRIPE_PUBLISHABLE_KEY to .env.');
      if (stripeButton) stripeButton.disabled = true;
      return;
    }

    try {
      stripe = Stripe(STRIPE_KEY);

      const intentRes = await fetch('/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: BOOKING_ID }),
      });
      const intentData = await intentRes.json();
      if (!intentRes.ok) throw new Error(intentData.error || 'Could not initialise payment.');

      elements = stripe.elements({
        clientSecret: intentData.clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#e11d48',
            colorText: '#1a1a2e',
            colorDanger: '#e11d48',
            borderRadius: '12px',
            fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
          },
        },
      });

      const paymentElement = elements.create('payment', {
        layout: 'tabs',
        defaultValues: {
          billingDetails: {
            address: { country: 'SG' },
          },
        },
      });

      paymentElement.mount('#payment-element');
      paymentElement.on('focus', () => document.getElementById('card-element-wrap').classList.add('focused'));
      paymentElement.on('blur', () => document.getElementById('card-element-wrap').classList.remove('focused'));
      paymentElement.on('change', event => {
        cardErrorEl.textContent = event.error ? event.error.message : '';
      });
    } catch (err) {
      showError(err.message);
      if (stripeButton) stripeButton.disabled = true;
    }
  }

  function showError(message) {
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.classList.remove('d-none');
    errorEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hideError() {
    if (errorEl) errorEl.classList.add('d-none');
    if (cardErrorEl) cardErrorEl.textContent = '';
  }

  function setLoading(prefix, loading) {
    const btn = document.getElementById(`${prefix}-pay-btn`);
    const label = document.getElementById(`${prefix}-lbl`);
    const spinner = document.getElementById(`${prefix}-spin`);
    if (btn) btn.disabled = loading;
    if (label) label.classList.toggle('d-none', loading);
    if (spinner) spinner.classList.toggle('d-none', !loading);
  }

  function showSuccessThenRedirect(url) {
    const modalEl = document.getElementById('payment-success-modal');
    if (window.bootstrap && modalEl) {
      const modal = new bootstrap.Modal(modalEl, {
        backdrop: 'static',
        keyboard: false,
      });
      modal.show();
      setTimeout(() => { window.location.href = url; }, 1200);
      return;
    }
    window.location.href = url;
  }

  async function saveStripeResult(paymentIntentId) {
    const confirmRes = await fetch(`/payment/confirm-stripe/${BOOKING_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentIntentId }),
    });
    const confirmData = await confirmRes.json();
    if (!confirmRes.ok) throw new Error(confirmData.error || 'Failed to save payment result.');
    return confirmData;
  }

  async function saveStripeFailure(paymentIntentId) {
    if (!paymentIntentId) return;
    await fetch(`/payment/fail-stripe/${BOOKING_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentIntentId }),
    });
  }

  if (stripeButton) {
    stripeButton.addEventListener('click', async () => {
      setLoading('stripe', true);
      hideError();

      try {
        if (!stripe || !elements) throw new Error('Payment form is still loading. Please try again.');

        const submitResult = await elements.submit();
        if (submitResult.error) throw new Error(submitResult.error.message);

        const { error, paymentIntent } = await stripe.confirmPayment({
          elements,
          confirmParams: {
            return_url: `${window.location.origin}/payment/success?booking_id=${BOOKING_ID}`,
          },
          redirect: 'if_required',
        });

        if (error) {
          await saveStripeFailure(error.payment_intent && error.payment_intent.id);
          throw new Error(error.message);
        }
        if (!paymentIntent || paymentIntent.status !== 'succeeded') {
          throw new Error(`Payment status: ${paymentIntent ? paymentIntent.status : 'unknown'}`);
        }

        console.log('[stripe] confirmed PaymentIntent', {
          id: paymentIntent.id,
          status: paymentIntent.status,
        });

        const confirmData = await saveStripeResult(paymentIntent.id);
        showSuccessThenRedirect(confirmData.redirectUrl);
      } catch (err) {
        showError(err.message);
        setLoading('stripe', false);
      }
    });
  }

  if (paynowButton) {
    paynowButton.addEventListener('click', async () => {
      setLoading('paynow', true);
      hideError();

      try {
        console.log('[stripe] selected payment method', { selectedPaymentMethod: 'paynow' });
        const res = await fetch(`/payment/paynow-session/${BOOKING_ID}`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to initialise PayNow payment.');
        if (!data.url) throw new Error('Stripe did not return a PayNow checkout URL.');
        console.log('[stripe] redirecting to PayNow Checkout Session', { checkoutSessionId: data.sessionId });
        window.location.href = data.url;
      } catch (err) {
        showError(err.message);
        setLoading('paynow', false);
      }
    });
  }
})();
