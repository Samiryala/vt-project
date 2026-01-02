import React, { useState, useEffect } from 'react';
import api from '../services/api';
import ArticleCard from '../components/ArticleCard';
import Pagination from '../components/Pagination';
import FilterSort from '../components/FilterSort';
import NewsSection from '../components/NewsSection';
import './Home.css';

const Home = () => {
  const [articles, setArticles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Pagination and filtering state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortOrder, setSortOrder] = useState('newest');

  // Fetch categories on mount
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await api.get('/articles/categories');
        if (response.data.success) {
          setCategories(response.data.data);
        }
      } catch (err) {
        console.error('Error fetching categories:', err);
      }
    };

    fetchCategories();
  }, []);

  // Fetch articles when filters change
  useEffect(() => {
    const fetchArticles = async () => {
      setLoading(true);
      setError('');

      try {
        const params = {
          page: currentPage,
          limit: 10,
          sort: sortOrder,
        };

        if (selectedCategory !== 'all') {
          params.category = selectedCategory;
        }

        const response = await api.get('/articles', { params });

        if (response.data.success) {
          setArticles(response.data.data.articles);
          setTotalPages(response.data.data.pagination.totalPages);
        }
      } catch (err) {
        setError('Failed to load articles. Please try again.');
        console.error('Error fetching articles:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchArticles();
  }, [currentPage, selectedCategory, sortOrder]);

  const handlePageChange = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCategoryChange = (category) => {
    setSelectedCategory(category);
    setCurrentPage(1); // Reset to first page
  };

  const handleSortChange = (sort) => {
    setSortOrder(sort);
    setCurrentPage(1); // Reset to first page
  };

  if (loading) {
    return (
      <div className="home-page">
        <div className="loading">Loading articles...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="home-page">
        <div className="error">{error}</div>
      </div>
    );
  }

  return (
    <div className="home-page">
      <div className="home-header">
        <h1>Database Articles</h1>
        <p>Explore the latest insights from DB-Engines</p>
      </div>

      {/* Today's News Section - hidden if no news today */}
      <NewsSection />

      <FilterSort
        categories={categories}
        selectedCategory={selectedCategory}
        onCategoryChange={handleCategoryChange}
        sortOrder={sortOrder}
        onSortChange={handleSortChange}
      />

      <div className="articles-grid">
        {articles.length > 0 ? (
          articles.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))
        ) : (
          <div className="no-articles">No articles found</div>
        )}
      </div>

      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
        />
      )}
    </div>
  );
};

export default Home;