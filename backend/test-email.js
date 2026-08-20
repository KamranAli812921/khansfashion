const dotenv = require('dotenv');
dotenv.config();

const { sendEmail } = require('./utils/email');

async function test() {
  console.log('Testing email dispatch. RESEND_API_KEY configured:', !!process.env.RESEND_API_KEY);
  try {
    const res = await sendEmail({
      to: 'usmank908465@gmail.com', // Send to self
      subject: 'Email Diagnostic Test',
      text: 'If you receive this, Resend is working!',
      html: '<b>If you receive this, Resend is working!</b>'
    });
    console.log('Email Send Result:', res);
  } catch (err) {
    console.error('Email Send Error:', err);
  }
}

test();
