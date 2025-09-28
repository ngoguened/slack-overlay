// A hardcoded placeholder for the current user's Slack ID.
// In a real app, this would be fetched after authentication.
const MY_SLACK_USER_ID = 'U09HBKXFU75'; // <-- This ID has mentions in the logs.

// --- UI Creation ---

const button = document.createElement('button');
button.className = 'overlay-button';
button.innerHTML = '@';
document.body.appendChild(button);

const overlay = document.createElement('div');
overlay.className = 'overlay';
overlay.innerHTML = `
    <div id="overlay-content">Click the button to fetch your mentions.</div>
    <button class="close-button">X</button>
`;
overlay.style.display = 'none';
document.body.appendChild(overlay);

// --- Functions ---

async function showOverlay() {
    overlay.style.display = 'block';
    const contentArea = document.getElementById('overlay-content');
    contentArea.innerHTML = 'Loading your mentions...';

    try {
        console.log('Fetching mentions for user:', MY_SLACK_USER_ID);
        const response = await fetch(`http://localhost:3000/my-mentions/${MY_SLACK_USER_ID}`);
        const result = await response.json();

        // --- CRITICAL DEBUGGING STEP ---
        console.log('Received data from server:', result);
        // --------------------------------

        if (result.error) {
            contentArea.innerHTML = `Error: ${result.error}`;
            return;
        }

        if (!result.data || result.data.length === 0) {
            contentArea.innerHTML = 'No recent mentions found for you.';
            return;
        }

        let html = '<h3>Your Stored Mentions</h3><ul>';
        for (const message of result.data) {
            html += `<li><strong>#${message.channel_name}:</strong><br><em>"${message.message_content}"</em></li><br>`;
        }
        html += '</ul>';
        contentArea.innerHTML = html;

    } catch (error) {
        contentArea.innerHTML = 'Error: Could not connect to the server.';
        console.error('Fetch error:', error);
    }
}

function hideOverlay() {
    overlay.style.display = 'none';
}

// --- Event Listeners ---

button.addEventListener('click', showOverlay);
overlay.querySelector('.close-button').addEventListener('click', hideOverlay);