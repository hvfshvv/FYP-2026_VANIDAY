# FYP-2026_UNIDAY

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy the example environment file and fill in your local database settings:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

3. Start the app:

```bash
npm run dev
```

## Email Notifications

Email sending is optional in development. By default, `.env.example` uses:

```env
EMAIL_PROVIDER=noop
EMAIL_VERIFICATION_REQUIRED=auto
```

With the no-op provider, the app logs email previews to the terminal and continues normally. Users can register, log in, and use the system without SMTP credentials.

Real inbox delivery requires credentials from an email provider. Set:

```env
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_smtp_username
SMTP_PASS=your_smtp_password_or_app_password
SMTP_FROM="Uniday <no-reply@example.com>"
```

Do not commit `.env` or personal SMTP credentials. The repository should only contain `.env.example`.

## Gemini API Setup

Create a Gemini API key from Google AI Studio and add it to your local `.env` if you need the AI campaign helper:

```env
GEMINI_API_KEY=your_api_key_here
```

## WhatsApp Merchant Disruption Notifications

Merchant cancellations, emergency closures, and staff replacement proposals use
the Twilio WhatsApp sender. Configure the standard Twilio credentials and sender:

```env
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_WHATSAPP_NUMBER=whatsapp:+your_sender_number
```

For proactive messages outside WhatsApp's customer-service window, configure
approved Twilio Content Template SIDs:

```env
TWILIO_WHATSAPP_CANCELLATION_CONTENT_SID=HX_your_cancellation_template
TWILIO_WHATSAPP_REMINDER_CONTENT_SID=HX_your_reminder_template
TWILIO_WHATSAPP_STAFF_REPLACEMENT_CONTENT_SID=HX_your_staff_replacement_template
TWILIO_WHATSAPP_STAFF_REPLACEMENT_ACCEPTED_CONTENT_SID=HX_your_acceptance_template
```

The reminder template receives booking ID, merchant, service, date, time, and
staff as variables 1-6. The cancellation template receives booking ID, merchant,
service, date, time, reason, and refund amount as variables 1-7. The replacement
template receives booking ID, merchant, service, date, time, proposed staff,
reason, and the numbered reply instructions as variables 1-8.
The accepted-replacement template receives booking ID, merchant, service, date,
time, and confirmed replacement staff as variables 1-6.
