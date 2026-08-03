const dotenv = require('dotenv');
dotenv.config();

const { sendEmail } = require('./utils/email');

async function test() {
  console.log('Testing SMTP with user:', process.env.EMAIL_USER);
  try {
    const res = await sendEmail({
      to: 'usmank908465@gmail.com', // Send to self
      subject: 'SMTP Diagnostic Test',
      text: 'If you receive this, SMTP is working!',
      html: '<b>If you receive this, SMTP is working!</b>'
    });
    console.log('SMTP Send Result:', res);
  } catch (err) {
    console.error('SMTP Send Error:', err);
  }
}

test();
