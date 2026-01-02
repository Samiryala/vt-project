import express from 'express';
import { login, verifyToken, register } from '../controllers/authController.js';
import { verifyToken as authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * POST /api/auth/login
 * Login endpoint
 */
router.post('/login', login);

/**
 * POST /api/auth/register
 * Register (signup) endpoint
 */
router.post('/register', register);

/**
 * GET /api/auth/verify
 * Verify token endpoint (protected)
 */
router.get('/verify', authMiddleware, verifyToken);

export default router;