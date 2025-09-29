require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDb } = require('./database.js');
const routes = require('./routes');
const { fetchAndStoreMentionsJob, findUserMentions } = require('./slackService');

const app = express();
const port = 3000;

// --- HTTPS setup for development ---
let https, fs, options;
if (process.env.NODE_ENV !== 'test') {
    https = require('https');
    fs = require('fs');
    options = {
        key: fs.readFileSync('./.certs/key.pem'),
        cert: fs.readFileSync('./.certs/cert.pem')
    };
}

app.use(cors());
app.use(express.json());
app.use(routes);


// --- Server Startup ---
if (require.main === module) {
    initDb().then(() => {
        if (process.env.NODE_ENV !== 'test') {
            // Start HTTPS server for development
            https.createServer(options, app).listen(port, () => {
                console.log(`Server is running! To install, visit https://localhost:${port}/install`);
                fetchAndStoreMentionsJob(); // Run on startup
                setInterval(fetchAndStoreMentionsJob, 900000); // Run every 15 mins
            });
        } else {
            // Start standard HTTP server for testing
            app.listen(port, () => {
                console.log(`Test server running on http://localhost:${port}`);
            });
        }
    });
}

module.exports = { app, findUserMentions };
