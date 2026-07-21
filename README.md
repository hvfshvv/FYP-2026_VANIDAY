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
