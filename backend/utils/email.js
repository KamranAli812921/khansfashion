const nodemailer = require('nodemailer');

const sendEmail = async ({ to, subject, text, html }) => {
  // 1. If Brevo HTTP API is configured, use it (never blocked by Render's firewall!)
  if (process.env.BREVO_API_KEY) {
    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': process.env.BREVO_API_KEY,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          sender: { name: "Khan's Fashion", email: process.env.EMAIL_USER || "khans.fashion121@gmail.com" },
          to: [{ email: to }],
          subject: subject,
          htmlContent: html || text,
          textContent: text
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || `HTTP ${response.status}`);
      }
      return await response.json();
    } catch (err) {
      console.error('Brevo API email dispatch failed, falling back to SMTP:', err.message);
      // Fall through to standard SMTP if Brevo fails
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
  if (process.env.BREVO_API_KEY) {
    console.log('Email Client: Brevo API (HTTPS/443) configured and active.');
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
