import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import './ArticleDetail.css';

const ArticleDetail = () => {
  const { id } = useParams();
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchArticle = async () => {
      setLoading(true);
      setError('');

      try {
        const response = await api.get(`/articles/${id}`);
        
        if (response.data.success) {
          setArticle(response.data.data);
        }
      } catch (err) {
        setError('Failed to load article. Please try again.');
        console.error('Error fetching article:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchArticle();
  }, [id]);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="article-detail-page">
        <div className="loading">Loading article...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="article-detail-page">
        <div className="error">{error}</div>
        <Link to="/" className="back-link">← Back to Home</Link>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="article-detail-page">
        <div className="error">Article not found</div>
        <Link to="/" className="back-link">← Back to Home</Link>
      </div>
    );
  }

  return (
    <div className="article-detail-page">
      <Link to="/" className="back-link">← Back to Home</Link>
      
      <article className="article-detail">
        <header className="article-header">
          <h1>{article.title}</h1>
          
          <div className="article-metadata">
            <div className="metadata-item">
              <strong>Author:</strong> {article.author || 'Unknown'}
            </div>
            <div className="metadata-item">
              <strong>Published:</strong> {formatDate(article.pubdate)}
            </div>
            {article.category && (
              <div className="metadata-item">
                <strong>Category:</strong> 
                <span className={`category-badge category-${article.category.toLowerCase().replace(/\s+/g, '-')}`}>
                  {article.category}
                </span>
              </div>
            )}
          </div>
          
          {article.tags && article.tags.length > 0 && (
            <div className="article-tags-detail">
              <strong>Tags:</strong>
              <div className="tags-list">
                {article.tags.map((tag, index) => (
                  <span key={index} className="tag">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </header>
        
        <div className="article-content">
          {article.content_text ? (
            article.content_text.split('\n\n').map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))
          ) : (
            <p>No content available.</p>
          )}
        </div>
        
        {article.url && (
          <div className="article-source">
            <strong>Source:</strong> 
            <a href={article.url} target="_blank" rel="noopener noreferrer">
              View original article →
            </a>
          </div>
        )}
      </article>
    </div>
  );
};

export default ArticleDetail;