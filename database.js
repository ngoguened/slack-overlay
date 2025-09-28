const sqlite3 = require('sqlite3').verbose();

// The name of our database file.
const DB_SOURCE = 'db.sqlite';

// Connect to the database.
const db = new sqlite3.Database(DB_SOURCE, (err) => {
    if (err) {
      // Cannot open database
      console.error(err.message);
      throw err;
    } else {
        console.log('Connected to the SQLite database.');
        // Create the users table if it doesn't exist.
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slack_id TEXT UNIQUE,
            name TEXT, 
            email TEXT
        )`, (err) => {
            if (err) {
                // Table already created
            } else {
                console.log('Users table created.');
            }
        });

        // Create the first_messages table
        db.run(`CREATE TABLE IF NOT EXISTS first_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_id TEXT UNIQUE,
            message_ts TEXT,
            user_slack_id TEXT,
            message_content TEXT
        )`, (err) => {
            if (err) {
                // Table already created
            } else {
                console.log('First messages table created.');
            }
        });
    }
});

module.exports = db;