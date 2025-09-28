require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { WebClient } = require('@slack/web-api');
const db = require('./database.js'); // Import the database connection
const app = express();
const port = 3000;

app.use(cors());
app.use(express.json()); // Middleware to parse JSON bodies

const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);

app.get('/latest-message', async (req, res) => {
    try {
        const channelsResponse = await slackClient.conversations.list({
            types: 'public_channel',
            limit: 1
        });

        if (channelsResponse.channels.length === 0) {
            return res.status(404).json({ error: 'No public channels found.' });
        }

        const firstChannel = channelsResponse.channels[0];

        await slackClient.conversations.join({
            channel: firstChannel.id
        });

        const historyResponse = await slackClient.conversations.history({
            channel: firstChannel.id,
            limit: 1
        });

        if (historyResponse.messages.length === 0) {
            return res.status(404).json({ error: 'No messages found in the channel.' });
        }

        const latestMessage = historyResponse.messages[0];
        res.json({ message: latestMessage.text });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Something went wrong.' });
    }
});

// New endpoint to create a user
app.post('/user', (req, res) => {
    const { slack_id, name, email } = req.body;
    const sql = 'INSERT INTO users (slack_id, name, email) VALUES (?,?,?)';
    const params = [slack_id, name, email];

    db.run(sql, params, function(err, result) {
        if (err) {
            res.status(400).json({ "error": err.message });
            return;
        }
        res.json({
            "message": "success",
            "data": { id: this.lastID, slack_id, name, email }
        });
    });
});

// New endpoint to get a user
app.get('/user/:slack_id', (req, res) => {
    const sql = "select * from users where slack_id = ?";
    const params = [req.params.slack_id];
    db.get(sql, params, (err, row) => {
        if (err) {
          res.status(400).json({"error":err.message});
          return;
        }
        res.json({
            "message":"success",
            "data": row
        });
      });
});

// New endpoint to find and assign the first message of each channel
app.post('/assign-first-messages', async (req, res) => {
    try {
        console.log('Fetching all public channels...');
        const channelsResponse = await slackClient.conversations.list({
            types: 'public_channel'
        });

        for (const channel of channelsResponse.channels) {
            console.log(`Processing channel: ${channel.name}`);

            // First, join the channel
            await slackClient.conversations.join({
                channel: channel.id
            });
            console.log(`Joined channel: ${channel.name}`);

            const historyResponse = await slackClient.conversations.history({
                channel: channel.id,
                oldest: '0', // From the beginning of time
                limit: 1, // We only need the first one
                inclusive: true
            });

            if (historyResponse.messages && historyResponse.messages.length > 0) {
                const firstMessage = historyResponse.messages[0];
                console.log(`Found first message in ${channel.name}: "${firstMessage.text}" by user ${firstMessage.user}`);
                
                const sql = 'INSERT OR IGNORE INTO first_messages (channel_id, channel_name, message_ts, user_slack_id, message_content) VALUES (?,?,?,?,?)';
                const params = [channel.id, channel.name, firstMessage.ts, firstMessage.user, firstMessage.text];
                
                db.run(sql, params, function(err) {
                    if (err) {
                        console.error(`Error saving to database for channel ${channel.name}:`, err.message);
                    } else if (this.changes > 0) {
                        console.log(`Stored first message for channel ${channel.name}`);
                    } else {
                        console.log(`First message for channel ${channel.name} already stored.`);
                    }
                });
            }
        }
        res.json({ "message": "success", "detail": "Assignment process completed." });
    } catch (error) {
        console.error('Error in /assign-first-messages:', error);
        res.status(500).json({ "error": "Failed to assign first messages." });
    }
});

// Endpoint to get all records from the first_messages table
app.get('/first-messages', (req, res) => {
    const sql = "SELECT * FROM first_messages ORDER BY channel_id";
    db.all(sql, [], (err, rows) => {
        if (err) {
            res.status(400).json({"error": err.message});
            return;
        }
        res.json({
            "message": "success",
            "data": rows
        });
    });
});


// --- Background Job ---

// Function to perform the 'assign first messages' task
const assignFirstMessagesJob = async () => {
    console.log('--- Running scheduled job: Assigning first messages ---');
    try {
        const channelsResponse = await slackClient.conversations.list({
            types: 'public_channel'
        });

        for (const channel of channelsResponse.channels) {
            await slackClient.conversations.join({ channel: channel.id });
            const historyResponse = await slackClient.conversations.history({
                channel: channel.id,
                oldest: '0',
                limit: 1,
                inclusive: true
            });

            if (historyResponse.messages && historyResponse.messages.length > 0) {
                const firstMessage = historyResponse.messages[0];
                const sql = 'INSERT OR IGNORE INTO first_messages (channel_id, channel_name, message_ts, user_slack_id, message_content) VALUES (?,?,?,?,?)';
                const params = [channel.id, channel.name, firstMessage.ts, firstMessage.user, firstMessage.text];
                db.run(sql, params);
            }
        }
        console.log('--- Scheduled job finished ---');
    } catch (error) {
        console.error('Error during scheduled job:', error);
    }
};

// Set the job to run every 15 minutes (900,000 milliseconds)
const JOB_INTERVAL_MS = 900000;

// Start the server only if this file is run directly
if (require.main === module) {
    app.listen(port, () => {
        console.log(`Server listening at http://localhost:${port}`);
        // Run the job immediately on server start, then set the interval
        assignFirstMessagesJob();
        setInterval(assignFirstMessagesJob, JOB_INTERVAL_MS);
    });
}

// Export the app for testing
module.exports = app;