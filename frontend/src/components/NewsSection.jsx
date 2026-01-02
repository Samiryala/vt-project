import React, { useState, useEffect } from 'react';
import newsService from '../services/scraperService';
import './NewsSection.css';

/**
 * NewsSection Component
 * 
 * Displays today's news articles.
 * Hidden by default, only visible when there are news articles published today.
 */
const NewsSection = () => {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasNews, setHasNews] = useState(false);

  useEffect(() => {
    const fetchTodaysNews = async () => {
      setLoading(true);
      try {
        const response = await newsService.getTodaysNews();
        if (response.success && response.data) {
          setArticles(response.data.articles || []);
          setHasNews(response.data.hasNews || response.data.articles?.length > 0);
        }
      } catch (error) {
        console.error('Error fetching today\'s news:', error);
        setHasNews(false);
      } finally {
        setLoading(false);
      }
    };

    fetchTodaysNews();
  }, []);

  // Don't render anything if there's no news today
  if (loading) {
    return null; // Don't show loading state for news section
  }

  if (!hasNews || articles.length === 0) {
    return null; // Hidden when no news today
  }

  return (
    <section className="news-section">
      <div className="news-header">
        <h2>📰 Today's News</h2>
        <span className="news-count">{articles.length} article{articles.length !== 1 ? 's' : ''}</span>
      </div>
      
      <div className="news-grid">
        {articles.map((article) => (
          <article key={article.id} className="news-card">
            <div className="news-card-header">
              <span className="news-category">{article.category}</span>
              <span className="news-date">
                {new Date(article.pubdate).toLocaleDateString()}
              </span>
            </div>
            
            <h3 className="news-title">
              <a href={article.url} target="_blank" rel="noopener noreferrer">
                {article.title}
              </a>
            </h3>
            
            {article.content_text && (
              <p className="news-excerpt">
                {article.content_text.length > 150 
                  ? article.content_text.substring(0, 150) + '...' 
                  : article.content_text}
              </p>
            )}
            
            <div className="news-footer">
              {article.author && (
                <span className="news-author">By {article.author}</span>
              )}
              {article.tags && article.tags.length > 0 && (
                <div className="news-tags">
                  {article.tags.slice(0, 3).map((tag, index) => (
                    <span key={index} className="news-tag">{tag}</span>
                  ))}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};

export default NewsSection;
