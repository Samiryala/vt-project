import React from 'react';
import './Footer.css';

const Footer = () => {
  return (
    <footer className="footer">
      <div className="footer-container">
        <p>&copy; {new Date().getFullYear()} DB-Engines Articles. All rights reserved.</p>
        <p>Powered by PostgreSQL, Express, React, and Node.js</p>
      </div>
    </footer>
  );
};

export default Footer;