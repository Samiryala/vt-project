# VT - Articles & Releases Tracker

A full-stack web application for tracking technology articles and database release versions. Features user authentication, article management, release notifications, and automated web scraping.

## 🚀 Features

- **User Authentication**: Secure signup/login with bcrypt password hashing and JWT tokens
- **Articles Management**: Browse, filter, sort, and search technology articles
- **Release Tracking**: Monitor new releases of popular databases (MongoDB, Redis, Neo4j, etc.)
- **Notifications**: Real-time notification bell for new release alerts with clickable links
- **Web Scraping**: Automated scripts to scrape articles and release information
- **Responsive Design**: Mobile-friendly UI

## 📁 Project Structure

```
vt/
├── backend/                 # Express.js API server
│   ├── config/             # Database configuration
│   ├── controllers/        # Route controllers
│   ├── middleware/         # Authentication middleware
│   ├── routes/             # API routes
│   ├── services/           # Business logic services
│   └── server.js           # Entry point
├── frontend/               # React application
│   ├── public/             # Static files
│   └── src/
│       ├── components/     # Reusable UI components
│       ├── context/        # React context providers
│       ├── hooks/          # Custom React hooks
│       ├── pages/          # Page components
│       └── services/       # API service functions
├── scrappingreles.js       # Release scraping script
└── scrappnews.js           # News/articles scraping script
```

## 🛠️ Tech Stack

### Backend
- **Node.js** with ES Modules
- **Express.js** - Web framework
- **PostgreSQL** - Database
- **bcryptjs** - Password hashing
- **jsonwebtoken** - JWT authentication
- **dotenv** - Environment configuration

### Frontend
- **React 18** - UI library
- **React Router v6** - Client-side routing
- **Axios** - HTTP client
- **CSS** - Custom styling

## 📋 Prerequisites

- Node.js (v18 or higher)
- PostgreSQL (v14 or higher)
- npm or yarn

## ⚙️ Installation

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/vt.git
cd vt
```

### 2. Set up the database

Create a PostgreSQL database:

```sql
CREATE DATABASE "articales-db";
```

Create the required tables:

```sql
-- Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Articles table
CREATE TABLE articles (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  url TEXT,
  author VARCHAR(200),
  pubdate DATE,
  content_text TEXT,
  category VARCHAR(100),
  tags TEXT[],
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Releases table
CREATE TABLE releases (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  version VARCHAR(50) NOT NULL,
  release_url TEXT,
  scraped_date DATE DEFAULT CURRENT_DATE
);

-- Notifications table
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT,
  data JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3. Configure environment variables

```bash
cd backend
cp .env.example .env
```

Edit `.env` with your database credentials:

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=articales-db
DB_USER=your_username
DB_PASSWORD=your_password
JWT_SECRET=your_secret_key
PORT=5000
```

### 4. Install dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 5. Run the application

```bash
# Start backend (from backend folder)
npm start
# or for development with auto-reload:
npm run dev

# Start frontend (from frontend folder, in a new terminal)
npm start
```

The app will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user

### Articles
- `GET /api/articles` - Get all articles (with pagination, filtering, sorting)
- `GET /api/articles/:id` - Get single article

### News & Releases
- `GET /api/news/today` - Get today's news articles
- `GET /api/news/releases/today` - Get today's releases

### Notifications
- `GET /api/notifications` - Get all notifications
- `PUT /api/notifications/:id/read` - Mark notification as read
- `PUT /api/notifications/read-all` - Mark all as read

## 🕷️ Web Scraping

Run the scraping scripts manually:

```bash
# Scrape release information
node scrappingreles.js

# Scrape news articles
node scrappnews.js
```

## 📝 License

MIT License

## 👤 Author

Your Name

---

⭐ Star this repo if you find it useful!
