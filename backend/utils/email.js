const nodemailer = require('nodemailer');

const sendEmail = async ({ to, subject, text, html }) => {
  // 1. If Resend HTTP API is configured, use it (never blocked by Render's firewall!)
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
      console.error('Resend API email dispatch failed, falling back to SMTP:', err.message);
      // Fall through to standard SMTP if Resend fails
    }
  }

  const isSmtpConfigured = process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS;

  if (!isSmtpConfigured) {
    console.log('==================================================');
    console.log(`[MOCK EMAIL SENT TO: ${to}]`);
    console.log(`Subject: ${subject}`);
    console.log(`Body: ${text}`);
    console.log('==================================================');
    return { mock: true };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: parseInt(process.env.EMAIL_PORT) === 465, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  const mailOptions = {
    from: `"Khan's Fashion" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text,
    html
  };

  const info = await transporter.sendMail(mailOptions);
  return info;
};

const verifyEmailConfig = async () => {
  if (process.env.RESEND_API_KEY) {
    console.log('Email Client: Resend API (HTTPS/443) configured and active.');
    return;
  }

  const isSmtpConfigured = process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS;
  if (!isSmtpConfigured) {
    console.log('SMTP is not fully configured (missing host, user, or pass). Running in MOCK mode.');
    return;
  }
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: parseInt(process.env.EMAIL_PORT) === 465,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  try {
    await transporter.verify();
    console.log('SMTP connection established and verified successfully!');
  } catch (error) {
    console.error('SMTP verification failed on startup:', error.message);
  }
};

module.exports = { sendEmail, verifyEmailConfig };
