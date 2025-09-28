require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { WebClient } = require('@slack/web-api');
const { db, initDb } = require('./database.js');
const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);

const findUserMentions = (messages, userId) => {
    if (!messages || messages.length === 0) return [];
    const userMention = `<@${userId}>`;
    const specialMentions = ['<!channel>', '<!here>', '<!everyone>'];
    return messages.filter(message => {
        const text = message.text || '';
        return text.includes(userMention) || specialMentions.some(mention => text.includes(mention));
    });
};

// --- Reusable Scan Function ---
const scanForUserMentions = async (userId) => {
    console.log(`[SCAN] Starting live scan for user: ${userId}`);
    try {
        let channelCount = 0;
        // Use the paginated iterator to get ALL channels, no matter how many.
        for await (const page of slackClient.paginate('conversations.list', { types: 'public_channel', limit: 50 })) {
            for (const channel of page.channels) {
                channelCount++;
                await slackClient.conversations.join({ channel: channel.id }).catch(e => {});

                console.log(`[SCAN] --- Scanning Channel #${channelCount}: ${channel.name} ---`);
            const historyResponse = await slackClient.conversations.history({ 
                channel: channel.id, 
                limit: 100 
            });

            if (historyResponse.messages && historyResponse.messages.length > 0) {
                console.log(`[SCAN] Fetched ${historyResponse.messages.length} messages from #${channel.name}.`);
                // --- CRITICAL DEBUGGING STEP ---
                // Log the raw text of every message fetched from this channel.
                console.log(`[RAW MESSAGES from #${channel.name}]:`, JSON.stringify(historyResponse.messages.map(m => m.text), null, 2));
                // --------------------------------

                const userMentions = findUserMentions(historyResponse.messages, userId);
                
                if (userMentions.length > 0) {
                    console.log(`[SUCCESS] Found ${userMentions.length} mention(s) for ${userId} in #${channel.name}. Storing now...`);

                    // Use Promise.all to wait for all database writes to complete
                    const insertPromises = userMentions.map(mention => {
                        return new Promise((resolve, reject) => {
                            const sql = 'INSERT OR IGNORE INTO mentions (message_ts, user_slack_id, channel_name, message_content, visible) VALUES (?,?,?,?,?)';
                            const params = [mention.ts, userId, channel.name, mention.text, 1]; // Default visible to 1
                            db.run(sql, params, function(err) {
                                if (err) {
                                    console.error('[DB ERROR] Failed to insert mention:', err);
                                    return reject(err);
                                }
                                resolve();
                            });
                        });
                    });
                    await Promise.all(insertPromises);
                    console.log(`[SUCCESS] Stored ${userMentions.length} mention(s) for ${userId} from #${channel.name}.`);

                } else {
                    console.log(`[INFO] No mentions for ${userId} found in the latest messages from #${channel.name}.`);
                }
            } else {
                 console.log(`[INFO] No messages found in #${channel.name}.`);
            }
        }
        }
        console.log(`[SCAN] Finished live scan for user: ${userId}. Scanned a total of ${channelCount} channels.`);
    } catch (error) {
        console.error(`[ERROR] Failed to fetch mentions for user ${userId}:`, error);
    }
};

// --- API Endpoints ---

// Triggers a live scan, then reads from the DB
app.get('/my-mentions/:userId', async (req, res) => {
    const { userId } = req.params;
    
    // First, perform a fresh scan for this user.
    await scanForUserMentions(userId);

    // Then, query the database to get all VISIBLE stored mentions.
    const sql = "SELECT * FROM mentions WHERE user_slack_id = ? AND visible = 1 ORDER BY message_ts DESC";
    db.all(sql, [userId], (err, rows) => {
        if (err) {
            res.status(500).json({ "error": err.message });
            return;
        }
        console.log(`[DB READ] For user ${userId}, found ${rows.length} visible mentions in database to send to frontend.`);
        res.json({ "message": "success", "data": rows });
    });
});

// Endpoint to mark a mention as invisible
app.post('/mentions/:message_ts/hide', (req, res) => {
    const { message_ts } = req.params;
    const sql = "UPDATE mentions SET visible = 0 WHERE message_ts = ?";
    
    db.run(sql, [message_ts], function(err) {
        if (err) {
            res.status(400).json({ "error": err.message });
            return;
        }
        res.json({ "message": "success", "changes": this.changes });
    });
});

// Endpoint to create a user (RESTORED)
app.post('/user', (req, res) => {
    const { slack_id, name, email } = req.body;
    const sql = 'INSERT OR IGNORE INTO users (slack_id, name, email) VALUES (?,?,?)';
    db.run(sql, [slack_id, name, email], function(err) {
        if (err) {
            res.status(400).json({ "error": err.message });
            return;
        }
        res.json({ "message": "success", "data": { id: this.lastID } });
    });
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

// --- Background Job ---
const fetchAndStoreMentionsJob = async () => {
    console.log('--- Running scheduled job: Fetching mentions for all users ---');
    db.all("SELECT slack_id FROM users", [], async (err, users) => {
        if (err || !users) return;
        console.log(`Found ${users.length} user(s) to scan for in background.`);
        for (const user of users) {
            await scanForUserMentions(user.slack_id);
        }
        console.log('--- Scheduled job finished ---');
    });
};

// --- Server Startup ---
if (require.main === module) {
    initDb().then(() => {
        app.listen(port, () => {
            console.log(`Server listening at http://localhost:${port}`);
            fetchAndStoreMentionsJob(); // Run once on startup
            setInterval(fetchAndStoreMentionsJob, 900000); // Run every 15 mins
        });
    }).catch(err => {
        console.error("Failed to initialize database:", err);
        process.exit(1);
    });
}

module.exports = { app, findUserMentions };