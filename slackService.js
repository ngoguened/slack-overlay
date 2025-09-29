const { WebClient } = require('@slack/web-api');
const { db } = require('./database.js');

const findUserMentions = (messages, userId) => {
    if (!messages || messages.length === 0) return [];
    const userMention = `<@${userId}>`;
    const specialMentions = ['<!channel>', '<!here>', '<!everyone>'];
    return messages.filter(message => {
        const text = message.text || '';
        return text.includes(userMention) || specialMentions.some(mention => text.includes(mention));
    });
};

const scanForMentionsForAuth = async (auth) => {
    const userClient = new WebClient(auth.access_token);
    try {
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
        console.error(`[SCAN ERROR] for user ${auth.slack_user_id} in workspace ${auth.slack_workspace_id}:`, error.data.error);
    }
};

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

module.exports = {
    findUserMentions,
    scanForUserMentions,
    fetchAndStoreMentionsJob,
};
