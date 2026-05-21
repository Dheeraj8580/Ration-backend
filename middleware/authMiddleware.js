const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Protect middleware to verify JWT token and attach user to request
 */
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from the token
      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
        return res.status(401).json({ success: false, message: 'User not found.' });
      }

      next();
    } catch (error) {
      console.error('Auth error:', error);
      return res.status(401).json({ success: false, message: 'Not authorized, token failed.' });
    }
    return;
  }

  return res.status(401).json({ success: false, message: 'Not authorized, no token.' });
};

/**
 * Admin only middleware
 */
const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ success: false, message: 'Access denied. Admin only.' });
  }
};

const shopOwnerOnly = (req, res, next) => {
  if (req.user && req.user.role === 'shop_owner' && req.user.shopOwnerStatus === 'Approved') {
    return next();
  }
  if (req.user?.role === 'shop_owner' && req.user.shopOwnerStatus !== 'Approved') {
    return res.status(403).json({
      success: false,
      message: 'Your shop account is pending admin approval.',
    });
  }
  return res.status(403).json({ success: false, message: 'Access denied. Shop owner only.' });
};

module.exports = { protect, adminOnly, shopOwnerOnly };
