document.addEventListener('DOMContentLoaded', () => {
    const loader = document.getElementById('loader');
    const grid = document.getElementById('profiles-grid');

    loadProfiles();

    async function loadProfiles() {
        try {
            const res = await fetch('/api/profiles/saved');
            if (!res.ok) throw new Error('Failed to load saved profiles');
            const profiles = await res.json();
            renderProfiles(profiles);
        } catch (err) {
            grid.innerHTML = `<p class="empty-state">${err.message}</p>`;
        } finally {
            loader.classList.add('hidden');
            grid.classList.remove('hidden');
        }
    }

    function renderProfiles(profiles) {
        if (profiles.length === 0) {
            grid.innerHTML = '<p class="empty-state">No saved profiles found. Start by saving a profile from the search!</p>';
            return;
        }

        grid.innerHTML = profiles.map(p => {
            const name = p.name || p.username;
            return `
                <div class="history-card" style="display:block; position:relative;" id="card-${p.username}">
                    <a href="profile.html?u=${p.username}" style="text-decoration:none; color:inherit; display:block;">
                        <div class="hc-top">
                            <img src="${p.avatar_url}" alt="${name}" class="hc-avatar">
                            <div>
                                <div class="hc-name">${name}</div>
                                <div class="hc-login">@${p.username}</div>
                            </div>
                        </div>
                        <div class="hc-stats">
                            <div class="hc-stat">
                                <span class="hc-stat-val">${p.public_repos}</span>
                                <span class="hc-stat-lbl">Repos</span>
                            </div>
                            <div class="hc-stat">
                                <span class="hc-stat-val">${p.followers}</span>
                                <span class="hc-stat-lbl">Followers</span>
                            </div>
                            <div class="hc-stat">
                                <span class="hc-stat-val">${p.following}</span>
                                <span class="hc-stat-lbl">Following</span>
                            </div>
                        </div>
                    </a>
                    <div class="card-actions" style="display:flex; justify-content:flex-end; gap:0.5rem;">
                        <button class="btn-unsave btn-delete" style="border-color:var(--text-muted); color:var(--text-muted);" data-username="${p.username}">Remove from Saved</button>
                        <button class="btn-delete-hard btn-delete" data-username="${p.username}">Delete Permanently</button>
                    </div>
                </div>
            `;
        }).join('');

        // Attach unsave handlers
        document.querySelectorAll('.btn-unsave').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const uname = e.currentTarget.dataset.username;
                try {
                    const res = await fetch(`/api/profiles/${uname}/save`, { method: 'DELETE' });
                    if (!res.ok) throw new Error('Failed to unsave');
                    document.getElementById(`card-${uname}`).remove();
                    if (grid.children.length === 0) {
                        grid.innerHTML = '<p class="empty-state">No saved profiles found. Start by saving a profile from the search!</p>';
                    }
                } catch (err) {
                    console.error('Unsave error:', err);
                    alert('Error removing profile from saved.');
                }
            });
        });

        // Attach hard delete handlers
        document.querySelectorAll('.btn-delete-hard').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const uname = e.currentTarget.dataset.username;
                if (!confirm(`Are you sure you want to permanently delete the profile for @${uname}?`)) return;

                try {
                    const res = await fetch(`/api/profiles/${uname}`, { method: 'DELETE' });
                    if (!res.ok) throw new Error('Failed to delete');
                    document.getElementById(`card-${uname}`).remove();
                    if (grid.children.length === 0) {
                        grid.innerHTML = '<p class="empty-state">No saved profiles found. Start by saving a profile from the search!</p>';
                    }
                } catch (err) {
                    console.error('Delete error:', err);
                    alert('Error deleting profile.');
                }
            });
        });
    }
});
