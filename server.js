const express = require('express');
const cors = require('cors');
require('dotenv').config();
const profileRoutes = require('./routes/profileRoutes');
const pool = require('./config/database');

const app = express();
const PORT = process.env.PORT || 5000;

const path = require('path');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Serve frontend files

// Routes
app.use('/api/profiles', profileRoutes);

// Database initialization and Server start
const startServer = async () => {
    try {
        // Create table if it doesn't exist
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS profiles (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                name VARCHAR(255),
                avatar_url VARCHAR(255),
                bio TEXT,
                public_repos INT,
                followers INT,
                following INT,
                created_at TIMESTAMP NULL,
                analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                is_saved BOOLEAN DEFAULT FALSE
            );
        `;
        
        await pool.query(createTableQuery);
        console.log('Database table "profiles" ensured.');

        try {
            await pool.query('ALTER TABLE profiles ADD COLUMN is_saved BOOLEAN DEFAULT FALSE;');
            console.log('Added is_saved column to profiles table.');
        } catch (err) {
            // Ignore error if column already exists
        }

        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Error connecting to the database or starting server:', error);
        process.exit(1);
    }
};

startServer();
