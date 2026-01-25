import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import './ScrapingButton.css';

const ScrapingButton = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [remainingExecutions, setRemainingExecutions] = useState(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState(''); // 'success', 'error', 'info'
  const pollingRef = useRef(null);

  // Fetch remaining executions and check if scraping is already running
  useEffect(() => {
    fetchRemainingExecutions();
    checkCurrentJobStatus();
    
    // Cleanup polling on unmount
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  const fetchRemainingExecutions = async () => {
    try {
      const response = await api.get('/scraper/remaining-executions');
      if (response.data.success) {
        setRemainingExecutions(response.data.data.remaining);
      }
    } catch (error) {
      console.error('Error fetching remaining executions:', error);
    }
  };

  const checkCurrentJobStatus = async () => {
    try {
      const response = await api.get('/scraper/job-status');
      if (response.data.success && response.data.isRunning) {
        // Scraping is already running, start polling
        setIsLoading(true);
        setMessage(response.data.message || 'Scraping en cours...');
        setMessageType('info');
        startPolling();
      }
    } catch (error) {
      console.error('Error checking job status:', error);
    }
  };

  const startPolling = () => {
    // Poll every 3 seconds
    pollingRef.current = setInterval(async () => {
      try {
        const response = await api.get('/scraper/job-status');
        const jobData = response.data;
        
        if (jobData.status === 'completed') {
          // Scraping finished
          stopPolling();
          setIsLoading(false);
          
          // Build success message
          let msg = 'Scraping terminé';
          if (jobData.result?.news?.newArticles) {
            msg += ` - ${jobData.result.news.newArticles} nouveaux articles`;
          }
          if (jobData.result?.releases?.newReleasesCount) {
            msg += ` - ${jobData.result.releases.newReleasesCount} nouvelles releases`;
          }
          setMessage(msg);
          setMessageType('success');
          
          // Refresh remaining executions
          fetchRemainingExecutions();
          
          // Clear message after 5 seconds
          setTimeout(() => setMessage(''), 5000);
          
        } else if (jobData.status === 'error') {
          // Scraping failed
          stopPolling();
          setIsLoading(false);
          setMessage(jobData.message || 'Erreur lors du scraping');
          setMessageType('error');
          fetchRemainingExecutions();
          setTimeout(() => setMessage(''), 5000);
          
        } else if (jobData.isRunning) {
          // Still running, update message
          setMessage(jobData.message || 'Scraping en cours...');
        }
      } catch (error) {
        console.error('Error polling job status:', error);
      }
    }, 3000);
  };

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const handleScrape = async () => {
    if (remainingExecutions !== null && remainingExecutions <= 0) {
      setMessage('Limite quotidienne atteinte (5/jour)');
      setMessageType('error');
      setTimeout(() => setMessage(''), 5000);
      return;
    }

    setIsLoading(true);
    setMessage('Démarrage du scraping...');
    setMessageType('info');

    try {
      // Use non-blocking endpoint
      const response = await api.post('/scraper/start');
      
      if (response.data.success) {
        // Update remaining immediately
        if (response.data.remaining !== undefined) {
          setRemainingExecutions(response.data.remaining);
        }
        setMessage('Scraping en cours...');
        // Start polling for status
        startPolling();
      } else {
        setMessage(response.data.message || 'Erreur lors du scraping');
        setMessageType('error');
        setIsLoading(false);
        setTimeout(() => setMessage(''), 5000);
      }
    } catch (error) {
      const errorMsg = error.response?.data?.message || 'Erreur de connexion';
      setMessage(errorMsg);
      setMessageType('error');
      setIsLoading(false);
      setTimeout(() => setMessage(''), 5000);
    }
  };

  return (
    <div className="scraping-button-container">
      <button 
        className={`scraping-button ${isLoading ? 'loading' : ''}`}
        onClick={handleScrape}
        disabled={isLoading || (remainingExecutions !== null && remainingExecutions <= 0)}
        title={`Scraping manuel - ${remainingExecutions ?? '?'} exécutions restantes aujourd'hui`}
      >
        {isLoading && <span className="spinner"></span>}
        <span className="button-text">{isLoading ? 'Scraper' : 'Scraper'}</span>
        {remainingExecutions !== null && (
          <span className="remaining-badge">{remainingExecutions}/5</span>
        )}
      </button>
      
      {message && (
        <div className={`scraping-message ${messageType}`}>
          {message}
        </div>
      )}
    </div>
  );
};

export default ScrapingButton;
