const MY_SLACK_USER_ID = 'U09HBKXFU75';

// --- Client-Side Cache ---
let mentionsCache = null;

// --- UI Creation ---
const button = document.createElement('button');
button.className = 'overlay-button';
button.innerHTML = '@';
document.body.appendChild(button);

const overlay = document.createElement('div');
overlay.className = 'overlay';
overlay.innerHTML = `
    <div class="overlay-header">
        <h3>Your Mentions</h3>
        <button id="refresh-btn">Refresh</button>
    </div>
    <div id="overlay-content"></div>
    <button class="close-button">X</button>
`;
overlay.style.display = 'none';
document.body.appendChild(overlay);

// --- Functions ---

function renderMentions(mentions) {
    const contentArea = document.getElementById('overlay-content');
    if (!mentions || mentions.length === 0) {
        contentArea.innerHTML = `
            <p>No visible mentions found.</p>
            <p>Click "Refresh" to scan, or install the app in a new workspace:</p>
            <a href="https://localhost:3000/install" target="_blank" class="install-link">Add to Slack</a>
        `;
        return;
    }

    // Group mentions by workspace, then by channel
    const groupedByWorkspace = mentions.reduce((acc, mention) => {
        const wsName = mention.slack_workspace_name || 'Unknown Workspace';
        const chName = mention.channel_name || 'Unknown Channel';
        if (!acc[wsName]) {
            acc[wsName] = {};
        }
        if (!acc[wsName][chName]) {
            acc[wsName][chName] = [];
        }
        acc[wsName][chName].push(mention);
        return acc;
    }, {});

    let html = '<div class="workspace-list">';
    for (const workspaceName in groupedByWorkspace) {
        html += `<div class="workspace-group">
                    <h4>${workspaceName}</h4>
                    <ul class="channel-list">`;
        for (const channelName in groupedByWorkspace[workspaceName]) {
            html += `<li>
                        <strong>#${channelName}</strong>
                        <ul class="mention-list">`;
            for (const message of groupedByWorkspace[workspaceName][channelName]) {
                html += `<li data-message-ts="${message.message_ts}">
                            <em>"${message.message_content}"</em>
                            <button class="hide-btn">Hide</button>
                         </li>`;
            }
            html += `</ul></li>`;
        }
        html += `</ul></div>`;
    }
    html += `</div>`;
    contentArea.innerHTML = html;
}

async function fetchAndRenderMentions() {
    const contentArea = document.getElementById('overlay-content');
    contentArea.innerHTML = 'Loading your mentions...';

    try {
        const response = await fetch(`https://localhost:3000/my-mentions/${MY_SLACK_USER_ID}`);
        const result = await response.json();

        if (result.error) {
            contentArea.innerHTML = `Error: ${result.error}`;
            mentionsCache = null;
            return;
        }
        
        mentionsCache = result.data;
        renderMentions(mentionsCache);

    } catch (error) {
        contentArea.innerHTML = 'Error: Could not connect to the server.';
        mentionsCache = null;
    }
}

function showOverlay() {
    overlay.style.display = 'block';
    if (mentionsCache) {
        renderMentions(mentionsCache);
    } else {
        fetchAndRenderMentions();
    }
}

function hideOverlay() {
    overlay.style.display = 'none';
}

function hideMention(event) {
    if (event.target.classList.contains('hide-btn')) {
        const mentionListItem = event.target.closest('li[data-message-ts]');
        const messageTs = mentionListItem.dataset.messageTs;
        if (!messageTs || !mentionsCache) return;

        mentionsCache = mentionsCache.filter(m => m.message_ts !== messageTs);
        renderMentions(mentionsCache);

        fetch(`https://localhost:3000/mentions/${messageTs}/hide`, { method: 'POST' })
            .catch(error => console.error('Failed to hide mention on server:', error));
    }
}

// --- Event Listeners ---
button.addEventListener('click', showOverlay);
overlay.querySelector('.close-button').addEventListener('click', hideOverlay);
document.getElementById('refresh-btn').addEventListener('click', fetchAndRenderMentions);
document.getElementById('overlay-content').addEventListener('click', hideMention);
