# AURA — E-Commerce Retail Platform

A premium, two-sided (client + admin) e-commerce platform designed for physical-product businesses in Pakistan. Aura features own-inventory management, manual payment confirmation (Cash on Delivery + Bank Transfer), and live client order tracking.

## Technical Architecture

- **Backend**: Node.js & Express API, JWT authentication, Bcrypt password hashing, and Nodemailer email triggers (OTP & Admin alerts).
- **Database**: MongoDB (Local or Atlas cloud tier) using Mongoose ODM.
- **Frontend**: Clean, responsive Single Page Application (SPA) using vanilla HTML5, CSS3, and ES6 JavaScript, styled with an ink-black and gold luxury design system.
- **Hosting-friendly**: The Express backend serves the static frontend assets automatically out-of-the-box.

---

## Key Features & Platform Enhancements

Aura (customized for **Khan's Fashion**) has been enhanced with premium user-experience and administrative workflows:

1. **Branded Customer Notifications**:
   - **Automated Emails**: Creating a new product automatically dispatches styled HTML notification emails to all registered customers under the brand name **"Khan's Fashion"**.
   - **Deep Linking**: Links inside notification emails automatically launch the storefront and open the quick action modal for that specific product directly.
2. **Premium Responsive UI**:
   - **Mobile Hamburger Navigation**: Premium animated hamburger navigation toggles drawer routes dynamically.
   - **Table Responsiveness**: Administrative tables dynamically collapse into vertically-stacked block cards on mobile viewports, eliminating horizontal layout breaking.
   - **Table-specific Scrolling**: Enabled independent horizontal scrolling on tabular layouts to prevent outer body scrollbar leaks.
   - **Compact Dashboards**: Tightened padding, text sizes, and select dropdown constraints inside the admin operations views.
3. **Storefront Product Pagination**:
   - Catalog displays are limited to **20 products per page** with next/prev buttons and numeric index buttons.
4. **Optimized Operations**:
   - **Optional Last Name**: Customer registrations and profile edits no longer require a mandatory last name.
   - **Auto-Receipt for COD**: Marking a Cash-On-Delivery (COD) order as "delivered" automatically updates its payment status to "received".
   - **Compact Bank settings**: Stacks bank details vertically on mobile screen widths and adds clean "Delete Account" buttons.

---

## Directory Structure

```text
├── README.md              # Technical overview
├── backend/                # API backend application
│   ├── models/              # MongoDB schemas (User, Product, Order, Review, Category, etc.)
│   ├── routes/               # Route controllers (Auth, Products, Cart, Orders, Reviews, Settings, Users, Feedback, Categories)
│   ├── utils/                 # Helpers (JWT auth, Email dispatch, Cloudinary/local upload)
│   ├── uploads/                # Local media storage fallback (used when Cloudinary is not configured)
│   ├── server.js               # Backend application entry point
│   ├── package.json            # Backend dependencies
│   ├── .env.example            # Template for required/optional environment variables
│   └── .env                    # Environment credentials (ignored by git)
└── frontend/                # Single Page Application
    ├── index.html              # Client markup template
    ├── style.css                # Luxury brand design system stylesheet
    ├── package.json              # Frontend dev tooling (Vite, optional - the backend also serves this folder statically)
    └── js/
        └── app.js                 # State controller, routing, and fetch requests
```

---

## Quickstart Guide

To get the application up and running locally, follow these simple steps:

### 1. Prerequisites
- **Node.js** (v16.0 or higher) installed on your system.
- **MongoDB** running locally on default port `27017` (or a remote MongoDB Atlas URI).

### 2. Installation
Install backend dependencies:
```bash
cd backend
npm install
```

### 3. Environment Setup
Configure your environment variables. Copy `backend/.env.example` to `backend/.env` and fill in the values:
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/ecommerce
JWT_ACCESS_SECRET=your_jwt_access_secret_here
JWT_REFRESH_SECRET=your_jwt_refresh_secret_here

# Legacy secret used by the reviews route - keep in sync with JWT_ACCESS_SECRET
JWT_SECRET=your_jwt_access_secret_here

# Optional: Resend HTTP API for outbound email (preferred in production,
# since it isn't blocked by hosts like Render that restrict outbound SMTP)
RESEND_API_KEY=
EMAIL_FROM="Khan's Fashion <onboarding@resend.dev>"

# Optional: SMTP config for email alerts, used if RESEND_API_KEY is blank
# (falls back to logging emails to the console if both are empty)
EMAIL_HOST=
EMAIL_PORT=
EMAIL_USER=
EMAIL_PASS=

# Optional: Cloudinary for media uploads (falls back to local /uploads storage if blank)
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

### 4. Running the App
Start the Express server:
```bash
npm start
```
Once the console logs `Successfully connected to MongoDB`, open your web browser and navigate to:
👉 **[http://localhost:5000](http://localhost:5000)**

---

## Administrative Access Rule

For ease of setup, **the very first user registered in the system automatically receives the `admin` role**. 
- Register your admin account first via the Signup screen.
- All subsequent registrations will be assigned the standard `customer` role.
- Once signed in as admin, bank accounts, inventory, receipt confirmations, and order/payment status are all managed from the Admin dashboard in the app itself.
