// We will create this function in a new file, e.g., 'server.js' or a new 'slack-utils.js'
const { findUserMentions } = require('../server');

describe('Mention Identification Logic', () => {

    const MOCK_USER_ID = 'U123ABC';

    const mockMessages = [
        { text: 'Hello team, how are you?', user: 'U01' },
        { text: `Hi <@${MOCK_USER_ID}>, can you look at this?`, user: 'U02' },
        { text: 'This is a general announcement.', user: 'U03' },
        { text: 'Remember to submit your reports, <!channel>!', user: 'U04' },
        { text: '<!everyone>, the office is closing early today.', user: 'U05' },
        { text: 'Another message for <@U456DEF>.', user: 'U06' },
        { text: '<!here> is a message for the active people in this channel.', user: 'U07' },
        { text: 'No mentions here.', user: 'U08' }
    ];

    it('should return an empty array if no messages are provided', () => {
        const result = findUserMentions([], MOCK_USER_ID);
        expect(result).toEqual([]);
    });

    it('should return only messages that directly @mention the user', () => {
        const result = findUserMentions(mockMessages, MOCK_USER_ID);
        const directMentions = result.filter(msg => msg.text.includes(`<@${MOCK_USER_ID}>`));
        expect(directMentions.length).toBe(1);
        expect(directMentions[0].user).toBe('U02');
    });

    it('should return messages that mention @channel or @here', () => {
        const result = findUserMentions(mockMessages, MOCK_USER_ID);
        const channelMentions = result.filter(msg => msg.text.includes('<!channel>') || msg.text.includes('<!here>'));
        expect(channelMentions.length).toBe(2);
    });

    it('should return messages that mention @everyone', () => {
        const result = findUserMentions(mockMessages, MOCK_USER_ID);
        const everyoneMentions = result.filter(msg => msg.text.includes('<!everyone>'));
        expect(everyoneMentions.length).toBe(1);
    });

    it('should return a combined list of all relevant mentions', () => {
        const result = findUserMentions(mockMessages, MOCK_USER_ID);
        // Expecting 1 direct, 2 channel/here, 1 everyone = 4 total
        expect(result.length).toBe(4);
    });

    it('should not return messages that mention other users', () => {
        const result = findUserMentions(mockMessages, MOCK_USER_ID);
        const otherUserMentions = result.filter(msg => msg.text.includes('<@U456DEF>'));
        expect(otherUserMentions.length).toBe(0);
    });
});

// We will need to export `findUserMentions` from server.js for this test to run.
// For now, it will fail because the function doesn't exist.
