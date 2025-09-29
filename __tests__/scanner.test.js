const request = require('supertest');
const { app } = require('../server');
const { db, initDb } = require('../database');
const { WebClient } = require('@slack/web-api');

// --- Mock the Slack API Client ---
// We tell Jest to replace the entire @slack/web-api module with our mock version.
jest.mock('@slack/web-api');

describe('Mention Scanning and Retrieval Flow', () => {
    const MOCK_USER_ID = 'U_TEST_USER';
    const MOCK_WORKSPACE_ID = 'T_TEST_WORKSPACE';
    const MOCK_ACCESS_TOKEN = 'xoxp-test-token';

    // Before any tests run, initialize a clean database
    beforeAll(async () => {
        // To ensure a clean slate, we can use an in-memory database for this test suite
        await initDb(); 
    });

    // Before each test, clear and seed the database with a test authorization
    beforeEach(async () => {
        // Clear previous test data
        await new Promise(resolve => db.run("DELETE FROM authorizations", resolve));
        await new Promise(resolve => db.run("DELETE FROM mentions", resolve));

        // Insert a fresh authorization for our test user
        await new Promise(resolve => {
            db.run('INSERT INTO authorizations (slack_user_id, slack_workspace_id, access_token) VALUES (?, ?, ?)',
                [MOCK_USER_ID, MOCK_WORKSPACE_ID, MOCK_ACCESS_TOKEN], resolve);
        });
    });

    it('should scan Slack, store mentions, and return them via the API', async () => {
        // --- 1. Configure the Mock API ---
        const mockMessages = [
            { ts: '1.0', text: `Hello <@${MOCK_USER_ID}>`, user: 'U_OTHER' },
            { ts: '2.0', text: 'No mention here', user: 'U_OTHER' },
            { ts: '3.0', text: 'A mention for <!channel>!', user: 'U_OTHER' },
        ];
        
        const mockChannels = [
            { id: 'C_CHANNEL_1', name: 'general' }
        ];

        // This is where we define the behavior of the mocked WebClient.
        WebClient.mockImplementation(() => {
            return {
                paginate: jest.fn().mockReturnValueOnce([ // conversations.list
                    { channels: mockChannels }
                ]),
                conversations: {
                    history: jest.fn().mockResolvedValue({ // conversations.history
                        messages: mockMessages
                    })
                }
            };
        });

        // --- 2. Run the Scan and API Call ---
        // We call our endpoint, which will trigger the scanForUserMentions function internally.
        const response = await request(app).get(`/my-mentions/${MOCK_USER_ID}`);

        // --- 3. Assert the Results ---
        expect(response.statusCode).toBe(200);
        expect(response.body.data).toHaveLength(2); // Should have found the two mentions

        // Check that the correct mentions were saved and returned
        const returnedMessages = response.body.data.map(m => m.message_content);
        expect(returnedMessages).toContain(`Hello <@${MOCK_USER_ID}>`);
        expect(returnedMessages).toContain('A mention for <!channel>!');
        expect(returnedMessages).not.toContain('No mention here');
    });
});
