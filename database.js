const sqlite3 = require('sqlite3').verbose();
// Use a different database file when in the test environment
const DB_SOURCE = process.env.NODE_ENV === 'test' ? 'test_db.sqlite' : 'db.sqlite';

// Connect to the database
const db = new sqlite3.Database(DB_SOURCE, (err) => {
    if (err) {
        console.error(err.message);
        throw err;
    }
});

const initDb = () => {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // --- Users Table ---
            // Stores basic info about users who have installed the app.
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                slack_id TEXT UNIQUE,
                name TEXT, 
                email TEXT
            )`, (err) => {
                if (err) return reject(err);
                console.log('Users table checked/created.');
            });

            // --- Authorizations Table ---
            // The core of the multi-workspace design. Stores a token for each user/workspace combo.
            db.run(`CREATE TABLE IF NOT EXISTS authorizations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                slack_user_id TEXT NOT NULL,
                slack_workspace_id TEXT NOT NULL,
                slack_workspace_name TEXT,
                access_token TEXT NOT NULL,
                UNIQUE(slack_user_id, slack_workspace_id)
            )`, (err) => {
                if (err) return reject(err);
                console.log('Authorizations table checked/created.');
            });

            // --- Mentions Table ---
            // Updated to include workspace_id to keep data separate.
            db.run(`CREATE TABLE IF NOT EXISTS mentions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_ts TEXT NOT NULL,
                slack_workspace_id TEXT NOT NULL,
                user_slack_id TEXT NOT NULL,
                channel_name TEXT,
                message_content TEXT,
                visible INTEGER DEFAULT 1,
                UNIQUE(message_ts, slack_workspace_id)
            )`, (err) => {
                if (err) return reject(err);
                console.log('Mentions table checked/created.');
                resolve();
            });
        });
    });
};

module.exports = { db, initDb };
