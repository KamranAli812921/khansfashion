const mongoose = require('mongoose');

const BankAccountSchema = new mongoose.Schema({
  bankName: { type: String, required: true },
  accountTitle: { type: String, required: true },
  accountNumber: { type: String, required: true },
  iban: { type: String }
}, { _id: false });

const AdminSettingsSchema = new mongoose.Schema({
  bankAccounts: [BankAccountSchema],
  whatsappNumber: { type: String, default: '' }
});

module.exports = mongoose.model('AdminSettings', AdminSettingsSchema);
