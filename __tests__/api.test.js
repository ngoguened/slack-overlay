// It's common to import the app and the database for testing purposes
const app = require('../server'); // We'll need to export our app from server.js
const request = require('supertest');
const { db, initDb } = require('../database');

describe('API Endpoints', () => {
    // Before any tests run, initialize the database
    beforeAll(async () => {
        await initDb();
    });

    let testUserId = 'testuser123';
    let testUserName = 'Test User';
    let testUserEmail = 'test@example.com';

    // Before running the tests, let's insert a test user
    beforeAll((done) => {
        db.run(`INSERT INTO users (slack_id, name, email) VALUES (?, ?, ?)`, 
               [testUserId, testUserName, testUserEmail], 
               function(err) {
            if (err) return done(err);
            done();
        });
    });

    // After all tests are done, clean up the test user
    afterAll((done) => {
        db.run(`DELETE FROM users WHERE slack_id = ?`, [testUserId], function(err) {
            if (err) return done(err);
            done();
        });
    });

    // Test for the GET /user/:slack_id endpoint
    it('should fetch a specific user', async () => {
        const response = await request(app).get(`/user/${testUserId}`);
        
        expect(response.statusCode).toBe(200);
        expect(response.body).toBeInstanceOf(Object);
        expect(response.body.message).toBe('success');
        expect(response.body.data).toBeInstanceOf(Object);
        expect(response.body.data.slack_id).toBe(testUserId);
        expect(response.body.data.name).toBe(testUserName);
        expect(response.body.data.email).toBe(testUserEmail);
    });
});

// We need to handle the server lifecycle for tests.
// A common pattern is to listen on a port only when not in a test environment.
// And export the app for testing.
// This requires a small change in server.js
