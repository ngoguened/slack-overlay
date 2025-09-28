const sqlite3 = require('sqlite3').verbose();
const DB_SOURCE = 'db.sqlite';

const db = new sqlite3.Database(DB_SOURCE, (err) => {
    if (err) {
        console.error(err.message);
        throw err;
    }
});

const initDb = () => {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                slack_id TEXT UNIQUE,
                name TEXT, 
                email TEXT
            )`, (err) => {
                if (err) return reject(err);
                console.log('Users table checked/created.');
            });

            db.run(`CREATE TABLE IF NOT EXISTS first_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                channel_id TEXT UNIQUE,
                channel_name TEXT,
                message_ts TEXT,
                user_slack_id TEXT,
                message_content TEXT
            )`, (err) => {
                if (err) return reject(err);
                console.log('First messages table checked/created.');
                resolve();
            });
        });
    });
};

module.exports = { db, initDb };