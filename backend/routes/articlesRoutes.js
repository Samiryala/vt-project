import express from 'express';
import {
  getArticles,
  getArticleById,
  getArticleByUrl,
  getCategories
} from '../controllers/articlesController.js';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * All routes are protected with JWT authentication
 */

/**
 * GET /api/articles
 * Get paginated articles with optional filtering and sorting
 * Query params: page, limit, category, sort
 */
router.get('/', verifyToken, getArticles);

/**
 * GET /api/articles/categories
 * Get all available categories
 */
router.get('/categories', verifyToken, getCategories);

/**
 * GET /api/articles/by-url
 * Get article by URL
 * Query param: url
 */
router.get('/by-url', verifyToken, getArticleByUrl);

/**
 * GET /api/articles/:id
 * Get single article by ID
 */
router.get('/:id', verifyToken, getArticleById);

export default router;