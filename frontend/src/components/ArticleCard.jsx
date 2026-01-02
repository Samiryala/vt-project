import React from 'react';
import { Link } from 'react-router-dom';
import './ArticleCard.css';

const ArticleCard = ({ article }) => {
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="article-card">
      <Link to={`/article/${article.id}`} className="article-link">
        <h2 className="article-title">{article.title}</h2>
      </Link>
      
      <div className="article-meta">
        <span className="article-author">
          <strong>Author:</strong> {article.author || 'Unknown'}
        </span>
        <span className="article-date">
          <strong>Published:</strong> {formatDate(article.pubdate)}
        </span>
      </div>
      
      {article.category && (
        <span className={`article-category category-${article.category.toLowerCase().replace(/\s+/g, '-')}`}>
          {article.category}
        </span>
      )}
      
      {article.tags && article.tags.length > 0 && (
        <div className="article-tags">
          {article.tags.slice(0, 3).map((tag, index) => (
            <span key={index} className="tag">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default ArticleCard;