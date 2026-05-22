require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const schemaRoutes = require('./routes/schemaRoutes');
const shopRoutes = require('./routes/shopRoutes');
const userPortalRoutes = require('./routes/userPortalRoutes');
const seedQuotaSchemas = require('./utils/seedQuota');
const { verifyEmailConfig } = require('./utils/sendEmail');
const User = require('./models/User');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/schema', schemaRoutes);
app.use('/api/shop', shopRoutes);
app.use('/api/user', userPortalRoutes);

const seedAdminIfNeeded = async () => {
  const admins = [
    {
      email: (process.env.ADMIN_EMAIL || 'admin@gov.in').toLowerCase(),
      password: process.env.ADMIN_PASSWORD || 'Admin@123',
      name: process.env.ADMIN_NAME || 'System Admin',
    },
    {
      email: 'dheerajk.jk@gmail.com',
      password: 'Ration',
      name: 'Dheeraj Kumar',
      department: 'Ration Distribution Department',
      permissions: ['approve', 'reject', 'view_all', 'manage_users'],
    },
  ];

  try {
    for (const admin of admins) {
      const exists = await User.findOne({ email: admin.email, role: 'admin' });
      if (!exists) {
        await User.create({
          ...admin,
          role: 'admin',
          applicationStatus: 'Approved',
        });
        console.log('✅ Admin account created:', admin.email);
      }
    }
  } catch (err) {
    console.warn('Admin seed skipped:', err.message);
  }
};
 
app.get("/",(req, res) =>{
  res.send("server is running successfully")
})
// Health check
app.get('/api/health', (req, res) => {
  const hasResend = !!(process.env.RESEND_API_KEY || '').trim();
  const hasGmail = !!(
    process.env.EMAIL_USER || ''
  ).trim() && !!(process.env.EMAIL_PASS || '').trim() && !String(process.env.EMAIL_PASS).includes('your_16_char');

  res.json({
    status: 'ok',
    message: 'Digital Ration API is running ✅',
    routes: ['auth', 'admin', 'admin/schema', 'shop', 'user'],
    email: {
      resendConfigured: hasResend,
      gmailConfigured: hasGmail,
      hint: !hasResend && !hasGmail ? 'Set RESEND_API_KEY or EMAIL_USER+EMAIL_PASS in server/.env (see EMAIL_SETUP.md)' : null,
    },
  });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
});

// ─── MongoDB Connection ────────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB Atlas');
    seedAdminIfNeeded()
      .then(() => seedQuotaSchemas())
      .then(() => verifyEmailConfig())
      .then(() => {
        app.listen(PORT, () => {
          console.log(`🚀 Server is running on http://localhost:${PORT}`);
        });
      });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });
