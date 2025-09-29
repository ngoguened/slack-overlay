const express = require('express');
const { WebClient } = require('@slack/web-api');
const { db } = require('./database.js');
const { scanForUserMentions } = require('./slackService.js');
const router = express.Router();

// --- OAuth & Installation Routes ---

// The "Add to Slack" button page
router.get('/install', (req, res) => {
    const clientId = process.env.SLACK_CLIENT_ID;
    const userScopes = 'channels:history,groups:history,im:history,mpim:history,users:read,channels:read,groups:read,im:read,mpim:read';
    const redirectUri = 'https://' + req.get('host') + '/oauth/redirect';
    const addToSlackUrl = `https://slack.com/oauth/v2/authorize?client_id=${clientId}&user_scope=${userScopes}&redirect_uri=${redirectUri}`;
    res.send(`<h1>Install Slack Overlay</h1><a href="${addToSlackUrl}"><img alt="Add to Slack" height="40" width="139" src="https://platform.slack-edge.com/img/add_to_slack.png" srcset="https://platform.slack-edge.com/img/add_to_slack.png 1x, https://platform.slack-edge.com/img/add_to_slack@2x.png 2x" /></a>`);
});

// The redirect handler after a user approves the app
router.get('/oauth/redirect', async (req, res) => {
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

        console.log('[OAUTH RESPONSE] Received from Slack:', JSON.stringify(oauthResponse, null, 2));

        const { authed_user, team } = oauthResponse;
        
        const authSql = 'INSERT OR REPLACE INTO authorizations (slack_user_id, slack_workspace_id, slack_workspace_name, access_token) VALUES (?, ?, ?, ?)';
        db.run(authSql, [authed_user.id, team.id, team.name, authed_user.access_token]);

        const userClient = new WebClient(authed_user.access_token);
        const userInfo = await userClient.users.info({ user: authed_user.id });
        const userSql = 'INSERT OR IGNORE INTO users (slack_id, name, email) VALUES (?, ?, ?)';
        db.run(userSql, [authed_user.id, userInfo.user.real_name, userInfo.user.profile.email]);

        console.log(`[AUTH SUCCESS] Successfully added/updated user ${authed_user.id} and workspace ${team.id}`);
        
        // Redirect the user back to the Slack app. The user ID is passed in the URL hash.
        // The content script running on app.slack.com will be able to read it.
        const redirectUrl = `https://app.slack.com/#slackOverlayUserId=${authed_user.id}`;
        res.redirect(redirectUrl);

    } catch (error) {
        console.error("OAuth Error:", error);
        res.status(500).send('<h1>Error</h1><p>Something went wrong during the installation process.</p>');
    }
});

// --- API Endpoints ---

// Triggers a live scan, then reads from the DB
router.get('/my-mentions/:userId', async (req, res) => {
    const { userId } = req.params;
    
    console.log(`[API /my-mentions] Received request for user ${userId}. Starting live scan.`);
    await scanForUserMentions(userId);
    console.log(`[API /my-mentions] Live scan finished for ${userId}. Querying database.`);

    const sql = `
        SELECT
            m.message_ts,
            m.user_slack_id,
            m.channel_name,
            m.message_content,
            a.slack_workspace_name
        FROM mentions m
        JOIN authorizations a ON m.slack_workspace_id = a.slack_workspace_id AND m.user_slack_id = a.slack_user_id
        WHERE m.user_slack_id = ? AND m.visible = 1
        ORDER BY a.slack_workspace_name, m.channel_name, m.message_ts DESC
    `;
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
router.post('/mentions/:message_ts/hide', (req, res) => {
    db.run("UPDATE mentions SET visible = 0 WHERE message_ts = ?", [req.params.message_ts]);
    res.json({ "message": "success" });
});

// Endpoint to get a user (RESTORED for testing)
router.get('/user/:slack_id', (req, res) => {
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

module.exports = router;
