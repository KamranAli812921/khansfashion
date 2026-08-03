const nodemailer = require('nodemailer');

const sendEmail = async ({ to, subject, text, html }) => {
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
