const MY_SLACK_USER_ID = 'U09HBKXFU75'; // This ID has mentions in the logs.

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
        const response = await fetch(`https://localhost:3000/my-mentions/${MY_SLACK_USER_ID}`);
        const result = await response.json();

        if (result.error) {
            contentArea.innerHTML = `Error: ${result.error}`;
            return;
        }

        if (!result.data || result.data.length === 0) {
            contentArea.innerHTML = `
                <h3>No Mentions Found</h3>
                <p>We haven't found any recent mentions for you in the workspaces you've connected.</p>
                <p>If you haven't installed the app yet, or want to add it to another workspace, please do so here:</p>
                <a href="https://localhost:3000/install" target="_blank" class="install-link">Add to Slack</a>
            `;
            return;
        }

        let html = '<h3>Your Visible Mentions</h3><ul>';
        for (const message of result.data) {
            html += `<li data-message-ts="${message.message_ts}">
                        <strong>#${message.channel_name}:</strong><br>
                        <em>"${message.message_content}"</em>
                        <button class="hide-btn">Hide</button>
                     </li><br>`;
        }
        html += '</ul>';
        contentArea.innerHTML = html;

    } catch (error) {
        contentArea.innerHTML = 'Error: Could not connect to the server.';
    }
}

function hideOverlay() {
    overlay.style.display = 'none';
}

function hideMention(event) {
    // Check if a hide button was clicked
    if (event.target.classList.contains('hide-btn')) {
        const listItem = event.target.closest('li');
        const messageTs = listItem.dataset.messageTs;
        if (!messageTs) return;

        // --- Optimistic UI Update ---
        // 1. Hide the item immediately from the view.
        listItem.style.display = 'none';

        // 2. Send the update to the server in the background.
        // We don't wait (`await`) for this to finish before the UI updates.
        fetch(`https://localhost:3000/mentions/${messageTs}/hide`, { method: 'POST' })
            .catch(error => {
                // If the server update fails, log the error and maybe show the item again.
                console.error('Failed to hide mention on server:', error);
                listItem.style.display = ''; // Re-show the item on error
            });
    }
}

// --- Event Listeners ---

button.addEventListener('click', showOverlay);
overlay.querySelector('.close-button').addEventListener('click', hideOverlay);
// Add a single event listener to the content area for delegation
document.getElementById('overlay-content').addEventListener('click', hideMention);
