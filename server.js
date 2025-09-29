require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { WebClient } = require('@slack/web-api');
const { db, initDb } = require('./database.js');
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

// No global client anymore. We create one per-authorization.

const findUserMentions = (messages, userId) => {
    if (!messages || messages.length === 0) return [];
    const userMention = `<@${userId}>`;
    const specialMentions = ['<!channel>', '<!here>', '<!everyone>'];
    return messages.filter(message => {
        const text = message.text || '';
        return text.includes(userMention) || specialMentions.some(mention => text.includes(mention));
    });
};

// --- OAuth & Installation Routes ---

// The "Add to Slack" button page
app.get('/install', (req, res) => {
    const clientId = process.env.SLACK_CLIENT_ID;
    // We are now requesting user scopes to get a user token (xoxp-)
    const userScopes = 'channels:history,groups:history,im:history,mpim:history,users:read,channels:read,groups:read,im:read,mpim:read';
    const redirectUri = 'https://' + req.get('host') + '/oauth/redirect';
    // The parameter in the URL must be 'user_scope'
    const addToSlackUrl = `https://slack.com/oauth/v2/authorize?client_id=${clientId}&user_scope=${userScopes}&redirect_uri=${redirectUri}`;
    res.send(`<h1>Install Slack Overlay</h1><a href="${addToSlackUrl}"><img alt="Add to Slack" height="40" width="139" src="https://platform.slack-edge.com/img/add_to_slack.png" srcset="https://platform.slack-edge.com/img/add_to_slack.png 1x, https://platform.slack-edge.com/img/add_to_slack@2x.png 2x" /></a>`);
});

// The redirect handler after a user approves the app
app.get('/oauth/redirect', async (req, res) => {
    const code = req.query.code;
    if (!code) {
        return res.status(400).send('Error: No code provided.');
    }

    try {
        const tempClient = new WebClient();
        const oauthResponse = await tempClient.oauth.v2.access({
            client_id: process.env.SLACK_CLIENT_ID,
            client_secret: process.env.SLACK_CLIENT_SECRET,
            code: code,
            redirect_uri: 'https://' + req.get('host') + '/oauth/redirect'
        });

        // --- CRITICAL DEBUGGING STEP ---
        console.log('[OAUTH RESPONSE] Received from Slack:', JSON.stringify(oauthResponse, null, 2));
        // --------------------------------

        const { authed_user, team } = oauthResponse;
        
        // Save the new authorization to the database
        const authSql = 'INSERT OR REPLACE INTO authorizations (slack_user_id, slack_workspace_id, access_token) VALUES (?, ?, ?)';
        // For user tokens, the token is INSIDE the authed_user object.
        db.run(authSql, [authed_user.id, team.id, authed_user.access_token]);

        // Also save the user's info to our users table
        const userClient = new WebClient(authed_user.access_token); // <-- FIX HERE
        const userInfo = await userClient.users.info({ user: authed_user.id });
        const userSql = 'INSERT OR IGNORE INTO users (slack_id, name, email) VALUES (?, ?, ?)';
        db.run(userSql, [authed_user.id, userInfo.user.real_name, userInfo.user.profile.email]);

        console.log(`[AUTH SUCCESS] Successfully added/updated user ${authed_user.id} and workspace ${team.id}`);
        res.send('<h1>Success!</h1><p>The Slack Overlay has been installed. You can now close this window and return to Slack.</p>');

    } catch (error) {
        console.error("OAuth Error:", error);
        res.status(500).send('<h1>Error</h1><p>Something went wrong during the installation process.</p>');
    }
});

// --- API Endpoints ---

// Triggers a live scan, then reads from the DB
app.get('/my-mentions/:userId', async (req, res) => {
    const { userId } = req.params;
    
    console.log(`[API /my-mentions] Received request for user ${userId}. Starting live scan.`);
    await scanForUserMentions(userId);
    console.log(`[API /my-mentions] Live scan finished for ${userId}. Querying database.`);

    const sql = "SELECT * FROM mentions WHERE user_slack_id = ? AND visible = 1 ORDER BY message_ts DESC";
    db.all(sql, [userId], (err, rows) => {
        if (err) {
            res.status(500).json({ "error": err.message });
            return;
        }
        console.log(`[API /my-mentions] Found ${rows.length} mentions in DB for ${userId}. Sending to frontend.`);
        res.json({ "message": "success", "data": rows });
    });
});

// Endpoint to mark a mention as invisible
app.post('/mentions/:message_ts/hide', (req, res) => {
    db.run("UPDATE mentions SET visible = 0 WHERE message_ts = ?", [req.params.message_ts]);
    res.json({ "message": "success" });
});

// Endpoint to get a user (RESTORED for testing)
app.get('/user/:slack_id', (req, res) => {
    const sql = "SELECT * FROM users WHERE slack_id = ?";
    db.get(sql, [req.params.slack_id], (err, row) => {
        if (err) {
            res.status(400).json({"error": err.message});
            return;
        }
        if (row) {
            res.json({ "message":"success", "data": row });
        } else {
            res.status(404).json({ "message": "user not found" });
        }
    });
});

// A new function to handle scanning for a single user ID
const scanForUserMentions = (userId) => {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM authorizations WHERE slack_user_id = ?", [userId], async (err, auths) => {
            if (err || !auths) return reject(err);
            for (const auth of auths) {
                await scanForMentionsForAuth(auth);
            }
            resolve();
        });
    });
};

// --- Background Job ---
const scanForMentionsForAuth = async (auth) => {
    const userClient = new WebClient(auth.access_token);
    try {
        // With a user token, we can read all channels the user is in, without needing to join them.
        const conversationTypes = 'public_channel,private_channel,mpim,im';
        for await (const page of userClient.paginate('conversations.list', { types: conversationTypes })) {
            for (const channel of page.channels) {
                const historyResponse = await userClient.conversations.history({ channel: channel.id, limit: 100 });
                if (historyResponse.messages) {
                    const mentions = findUserMentions(historyResponse.messages, auth.slack_user_id);
                    for (const mention of mentions) {
                        const sql = 'INSERT OR IGNORE INTO mentions (message_ts, slack_workspace_id, user_slack_id, channel_name, message_content) VALUES (?,?,?,?,?)';
                        db.run(sql, [mention.ts, auth.slack_workspace_id, auth.slack_user_id, channel.name, mention.text]);
                    }
                }
            }
        }
    } catch (error) {
        // This often happens if a token is revoked. We can choose to remove the auth here if we want.
        console.error(`[SCAN ERROR] for user ${auth.slack_user_id} in workspace ${auth.slack_workspace_id}:`, error.data.error);
    }
};

const fetchAndStoreMentionsJob = () => {
    console.log('[JOB] Starting background scan for all authorizations...');
    db.all("SELECT * FROM authorizations", [], async (err, auths) => {
        if (err) {
            console.error('[JOB ERROR] Could not fetch authorizations from database:', err);
            return;
        }
        if (!auths || auths.length === 0) {
            console.log('[JOB] No authorizations found in database. Skipping scan.');
            return;
        }
        console.log(`[JOB] Found ${auths.length} authorization(s) to scan.`);
        for (const auth of auths) {
            await scanForMentionsForAuth(auth);
        }
        console.log('[JOB] Background scan finished.');
    });
};


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
