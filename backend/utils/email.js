const sendEmail = async ({ to, subject, text, html }) => {
  // If Resend HTTP API is configured, use it (never blocked by Render's firewall!)
  if (process.env.RESEND_API_KEY) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || "Khan's Fashion <onboarding@resend.dev>",
          to: [to],
          subject: subject,
          html: html || text,
          text: text
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || `HTTP ${response.status}`);
      }
      return await response.json();
    } catch (err) {
      console.error('Resend API email dispatch failed, falling back to mock mode:', err.message);
      // Fall through to mock logging below
    }
  }

  console.log('==================================================');
  console.log(`[MOCK EMAIL SENT TO: ${to}]`);
  console.log(`Subject: ${subject}`);
  console.log(`Body: ${text}`);
  console.log('==================================================');
  return { mock: true };
};

const verifyEmailConfig = async () => {
  if (process.env.RESEND_API_KEY) {
    console.log('Email Client: Resend API (HTTPS/443) configured and active.');
    return;
  }

  console.log('RESEND_API_KEY is not set. Running in MOCK mode (emails will be logged to the console).');
};

module.exports = { sendEmail, verifyEmailConfig };
