import { html, render } from 'lit-html';

const formContainer = document.getElementById('form-container');
const userProfileContainer = document.getElementById('user-profile');
const projectsContainer = document.getElementById('projects-container');

const loaderTemplate = (message) => html`<div class="loader">${message}</div>`;
const errorTemplate = (message) => html`<div class="error">${message}</div>`;

const handleUsernameSubmit = (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const username = formData.get('username').trim();
    if (username) {
        const url = new URL(window.location);
        url.searchParams.set('username', username);
        history.pushState({ username }, '', url.toString());
        loadUser(username);
    }
};

const usernameFormTemplate = (errorMsg) => html`
    <form id="username-form" @submit=${handleUsernameSubmit}>
        <h1>Explore a User's Projects</h1>
        <p>Enter a websim.com username to see their public projects and revision history.</p>
        <div class="form-input-group">
            <input type="text" name="username" placeholder="e.g. bearsoft" required>
            <button type="submit">Fetch Projects</button>
        </div>
        ${errorMsg ? errorTemplate(errorMsg) : ''}
    </form>
`;

const userProfileTemplate = (user) => html`
    <a href="https://websim.com/@${user.username}" target="_blank">
        <img src="https://images.websim.com/avatar/${user.username}" alt="${user.username}'s avatar">
    </a>
    <div>
        <h1><a href="https://websim.com/@${user.username}" target="_blank">@${user.username}</a></h1>
        <p>Exploring all public projects and revision history.</p>
    </div>
`;

const revisionTemplate = (revision) => html`
    <div class="revision-item">
        <p>
            <strong>Version ${revision.project_revision.version}</strong> -
            <a href="https://websim.com/p/${revision.project_revision.project_id}/v/${revision.project_revision.version}" target="_blank">View Revision</a>
        </p>
        <p class="date">Created: ${new Date(revision.project_revision.created_at).toLocaleString()}</p>
    </div>
`;

const projectTemplate = (project, revisions) => html`
    <div class="project-card">
        <h2><a href="https://websim.com/p/${project.project.id}" target="_blank">${project.project.title || 'Untitled Project'}</a></h2>
        <p>${project.project.description || 'No description provided.'}</p>
        <p><strong>Visibility:</strong> ${project.project.visibility}</p>
        <div class="revisions-list">
            <h3>Revisions (${revisions.length})</h3>
            ${revisions.length > 0 ? revisions.map(revisionTemplate) : html`<p>No revisions found for this project.</p>`}
        </div>
    </div>
`;

async function fetchWithPagination(url, dataType) {
    let results = [];
    let nextUrl = url;
    
    while (nextUrl) {
        try {
            const response = await fetch(nextUrl);
            if (!response.ok) {
                console.error(`HTTP error! status: ${response.status} for ${nextUrl}`);
                if (response.status === 404 && dataType === 'projects') {
                     // This can happen for users with no public projects, not necessarily an error to stop everything.
                     return [];
                }
                return results; // Return what we have so far
            }
            const body = await response.json();
            
            const data = body[dataType].data;
            const meta = body[dataType].meta;
            
            results.push(...data);
            
            if (meta && meta.has_next_page && meta.end_cursor) {
                const urlObject = new URL(nextUrl, window.location.origin);
                urlObject.searchParams.set('after', meta.end_cursor);
                nextUrl = urlObject.pathname + urlObject.search;
            } else {
                nextUrl = null;
            }
        } catch (error) {
            console.error(`Failed to fetch from ${nextUrl}:`, error);
            nextUrl = null; // Stop pagination on error
        }
    }
    return results;
}

async function loadUser(username) {
    render(html``, formContainer); // Clear form
    userProfileContainer.style.display = 'flex';
    projectsContainer.style.display = 'grid';

    render(loaderTemplate('Loading user profile...'), userProfileContainer);
    render(loaderTemplate('Loading projects...'), projectsContainer);

    try {
        const userResponse = await fetch(`/api/v1/users/${username}`);
        if (!userResponse.ok) {
            if (userResponse.status === 404) {
                throw new Error(`User "${username}" not found. Please check the username and try again.`);
            }
            throw new Error('Failed to load user profile.');
        }
        const { user } = await userResponse.json();
        render(userProfileTemplate(user), userProfileContainer);
        
        const projects = await fetchWithPagination(`/api/v1/users/${user.username}/projects?first=100`, 'projects');

        if (projects.length === 0) {
            render(html`<div class="project-card"><p>No public projects found for this user.</p></div>`, projectsContainer);
            return;
        }
        
        render(html``, projectsContainer); // Clear loader

        // Sort projects by last updated
        projects.sort((a, b) => new Date(b.project.updated_at) - new Date(a.project.updated_at));

        for (const project of projects) {
            const tempProjectContainer = document.createElement('div');
            projectsContainer.appendChild(tempProjectContainer);
            render(loaderTemplate(`Loading revisions for "${project.project.title || 'Untitled'}"...`), tempProjectContainer);

            const revisions = await fetchWithPagination(`/api/v1/projects/${project.project.id}/revisions?first=100`, 'revisions');
            // sort revisions descending by version
            revisions.sort((a,b) => b.project_revision.version - a.project_revision.version);
            render(projectTemplate(project, revisions), tempProjectContainer);
        }

    } catch (error) {
        console.error('An error occurred:', error);
        render(usernameFormTemplate(error.message), formContainer);
        userProfileContainer.style.display = 'none';
        projectsContainer.style.display = 'none';
        render(html``, userProfileContainer);
        render(html``, projectsContainer);
    }
}


function init() {
    const params = new URLSearchParams(window.location.search);
    const username = params.get('username');

    if (username) {
        loadUser(username);
    } else {
        render(usernameFormTemplate(), formContainer);
        userProfileContainer.style.display = 'none';
        projectsContainer.style.display = 'none';
    }
}

window.addEventListener('popstate', (event) => {
    const params = new URLSearchParams(window.location.search);
    const username = params.get('username');
    if (username) {
        loadUser(username);
    } else {
        render(usernameFormTemplate(), formContainer);
        userProfileContainer.style.display = 'none';
        projectsContainer.style.display = 'none';
        render(html``, userProfileContainer);
        render(html``, projectsContainer);
    }
});

init();