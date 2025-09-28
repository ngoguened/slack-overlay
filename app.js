// Create the button element
const button = document.createElement('button');
button.className = 'overlay-button';
button.innerHTML = 'M'; // 'M' for Message
document.body.appendChild(button);

// Create the overlay panel, but keep it hidden initially
const overlay = document.createElement('div');
overlay.className = 'overlay';
overlay.innerHTML = `
    <div id="overlay-content"></div>
    <button id="assign-btn">Assign First Messages</button>
    <div id="status-area"></div>
    <button class="close-button">X</button>
`;
overlay.style.display = 'none'; // Initially hidden
document.body.appendChild(overlay);

async function showOverlay() {
    overlay.style.display = 'block';
    const contentArea = document.getElementById('overlay-content');
    contentArea.innerHTML = 'Loading first messages...';

    try {
        const response = await fetch('http://localhost:3000/first-messages');
        const result = await response.json();

        if (result.error) {
            contentArea.innerHTML = `Error: ${result.error}`;
            return;
        }

        if (!result.data || result.data.length === 0) {
            contentArea.innerHTML = 'No first messages have been assigned yet.';
            return;
        }

        // Build the HTML to display the messages
        let html = '<h3>First Messages</h3><ul>';
        for (const message of result.data) {
            html += `<strong>#${message.channel_name}:</strong><br><em>"${message.message_content}"</em><br>- User: ${message.user_slack_id}<br>`;
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

// Show the overlay when the main button is clicked
button.addEventListener('click', showOverlay);

// Event listener for the close button
overlay.querySelector('.close-button').addEventListener('click', hideOverlay);


// Event listener for the "Assign First Messages" button
document.getElementById('assign-btn').addEventListener('click', async () => {
    const statusArea = document.getElementById('status-area');
    statusArea.textContent = 'Assigning messages, please wait...';

    try {
        const response = await fetch('http://localhost:3000/assign-first-messages', { method: 'POST' });
        const data = await response.json();

        if (data.error) {
            statusArea.textContent = `Error: ${data.error}`;
        } else {
            statusArea.textContent = `Success: ${data.detail}`;
        }
    } catch (error) {
        statusArea.textContent = 'Error: Could not connect to the server.';
    }
});