import { query } from '../config/database.js';

/**
 * Get paginated articles with filtering and sorting
 */
export const getArticles = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      category, 
      sort = 'newest' 
    } = req.query;

    // Calculate offset
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build WHERE clause for filtering
    let whereClause = '';
    const queryParams = [];
    
    if (category && category !== 'all') {
      whereClause = 'WHERE category = $1';
      queryParams.push(category);
    }

    // Build ORDER BY clause
    const orderBy = sort === 'oldest' 
      ? 'ORDER BY pubdate ASC' 
      : 'ORDER BY pubdate DESC';

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) 
      FROM articles 
      ${whereClause}
    `;
    const countResult = await query(countQuery, queryParams);
    const totalArticles = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalArticles / parseInt(limit));

    // Get articles with pagination
    const articlesQuery = `
      SELECT 
        id,
        title,
        url,
        author,
        pubdate,
        category,
        tags
      FROM articles
      ${whereClause}
      ${orderBy}
      LIMIT $${queryParams.length + 1} 
      OFFSET $${queryParams.length + 2}
    `;
    
    queryParams.push(parseInt(limit), offset);
    const articlesResult = await query(articlesQuery, queryParams);

    res.json({
      success: true,
      data: {
        articles: articlesResult.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalArticles,
          articlesPerPage: parseInt(limit),
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    console.error('Error fetching articles:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching articles'
    });
  }
};

/**
 * Get single article by ID
 */
export const getArticleById = async (req, res) => {
  try {
    const { id } = req.params;

    const articleQuery = `
      SELECT 
        id,
        title,
        url,
        author,
        pubdate,
        content_text,
        category,
        tags,
        created_at
      FROM articles
      WHERE id = $1
    `;

    const result = await query(articleQuery, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Article not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error fetching article:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching article'
    });
  }
};

/**
 * Get single article by URL
 */
export const getArticleByUrl = async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({
        success: false,
        message: 'URL parameter is required'
      });
    }

    const articleQuery = `
      SELECT 
        id,
        title,
        url,
        author,
        pubdate,
        content_text,
        category,
        tags,
        created_at
      FROM articles
      WHERE url = $1
    `;

    const result = await query(articleQuery, [url]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Article not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error fetching article by URL:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching article'
    });
  }
};

/**
 * Get available categories
 */
export const getCategories = async (req, res) => {
  try {
    const categoriesQuery = `
      SELECT DISTINCT category 
      FROM articles 
      WHERE category IS NOT NULL
      ORDER BY category
    `;

    const result = await query(categoriesQuery);

    res.json({
      success: true,
      data: result.rows.map(row => row.category)
    });

  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching categories'
    });
  }
};