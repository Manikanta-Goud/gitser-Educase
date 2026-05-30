document.addEventListener('DOMContentLoaded', async () => {
    // Get username from query params
    const urlParams = new URLSearchParams(window.location.search);
    const username = urlParams.get('u');

    if (!username) {
        document.getElementById('loader').classList.add('hidden');
        const err = document.getElementById('error-msg');
        err.textContent = 'No username provided in URL.';
        err.classList.remove('hidden');
        return;
    }

    // DOM Refs
    const loader = document.getElementById('loader');
    const profileContent = document.getElementById('profile-content');
    const profileHero = document.getElementById('profile-hero');
    const tabBtns = document.querySelectorAll('.tab-btn');
    const reposList = document.getElementById('repos-list');
    const followersList = document.getElementById('followers-list');
    const followingList = document.getElementById('following-list');
    const scorePanel = document.getElementById('score-panel');
    const langsPanel = document.getElementById('languages-panel');

    // Fetch and render profile header
    try {
        const res = await fetch(`/api/profiles/${username}`);
        if (!res.ok) throw new Error('Profile not found in database.');
        const profile = await res.json();
        renderHero(profile);
        loader.classList.add('hidden');
        profileContent.classList.remove('hidden');
        
        // Fetch all other data
        loadRepos(username);
        loadFollowers(username);
        loadFollowing(username);
        loadScore(username);
        loadLanguages(username);
    } catch (err) {
        loader.classList.add('hidden');
        const errMsg = document.getElementById('error-msg');
        errMsg.textContent = err.message;
        errMsg.classList.remove('hidden');
    }

    function renderHero(p) {
        const name = p.name || p.username;
        const bio = p.bio || '';
        const isSaved = p.is_saved;
        const saveBtnText = isSaved ? '⭐ Saved' : '☆ Save Profile';
        const saveBtnClass = isSaved ? 'btn-save saved' : 'btn-save';

        profileHero.innerHTML = `
            <div class="save-btn-container">
                <button id="save-btn" class="${saveBtnClass}" data-username="${p.username}" data-saved="${isSaved}">
                    ${saveBtnText}
                </button>
            </div>
            <div class="modal-profile-top">
                <div class="modal-avatar-ring">
                    <img src="${p.avatar_url}" alt="${name}" class="modal-avatar">
                </div>
                <div>
                    <h2 class="modal-profile-name" style="margin-bottom:0.2rem">${name}</h2>
                    <a href="https://github.com/${p.username}" target="_blank" class="modal-profile-login">@${p.username}</a>
                </div>
            </div>
            ${bio ? `<p class="modal-bio">${bio}</p>` : ''}
            <div class="modal-stats" style="border-top: 1px solid var(--border); padding-top: 1rem;">
                <div class="modal-stat">
                    <span class="modal-stat-val">${p.public_repos}</span>
                    <span class="modal-stat-lbl">Repos</span>
                </div>
                <div class="modal-stat">
                    <span class="modal-stat-val">${p.followers}</span>
                    <span class="modal-stat-lbl">Followers</span>
                </div>
                <div class="modal-stat">
                    <span class="modal-stat-val">${p.following}</span>
                    <span class="modal-stat-lbl">Following</span>
                </div>
            </div>
        `;

        // Attach event listener to save button
        document.getElementById('save-btn').addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            const uname = btn.dataset.username;
            const currentlySaved = btn.dataset.saved === '1' || btn.dataset.saved === 'true';

            try {
                if (currentlySaved) {
                    await fetch(`/api/profiles/${uname}/save`, { method: 'DELETE' });
                    btn.dataset.saved = 'false';
                    btn.className = 'btn-save';
                    btn.innerHTML = '☆ Save Profile';
                } else {
                    await fetch(`/api/profiles/${uname}/save`, { method: 'POST' });
                    btn.dataset.saved = 'true';
                    btn.className = 'btn-save saved';
                    btn.innerHTML = '⭐ Saved';
                }
            } catch (err) {
                console.error('Error saving/unsaving:', err);
                alert('Failed to update save status.');
            }
        });
    }

    // ===== TABS =====
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
            document.querySelectorAll('.tab-panel').forEach(p => {
                p.classList.toggle('active', p.id === `tab-${tabName}`);
            });
        });
    });

    // ===== LOAD REPOS =====
    async function loadRepos(uname) {
        try {
            const res = await fetch(`/api/profiles/${uname}/repos`);
            const repos = await res.json();
            if (!Array.isArray(repos) || repos.length === 0) {
                reposList.innerHTML = '<p class="empty-state">No public repositories found.</p>';
                return;
            }
            reposList.innerHTML = repos.map(r => {
                const desc = r.description || 'No description provided.';
                const lang = r.language || '—';
                const updated = new Date(r.updated_at).toLocaleDateString();
                return `
                    <a href="${r.html_url}" target="_blank" class="repo-card glass-card" style="padding:1rem;">
                        <div class="repo-name">📁 ${r.name}</div>
                        <div class="repo-desc">${desc}</div>
                        <div class="repo-meta">
                            <span class="repo-badge"><span class="lang-dot"></span>${lang}</span>
                            <span class="repo-badge">⭐ ${r.stargazers_count}</span>
                            <span class="repo-badge">🍴 ${r.forks_count}</span>
                            <span class="repo-badge">🕒 ${updated}</span>
                        </div>
                    </a>
                `;
            }).join('');
        } catch {
            reposList.innerHTML = '<p class="empty-state">Failed to load repositories.</p>';
        }
    }

    // ===== LOAD FOLLOWERS =====
    async function loadFollowers(uname) {
        try {
            const res = await fetch(`/api/profiles/${uname}/followers`);
            const followers = await res.json();
            if (!Array.isArray(followers) || followers.length === 0) {
                followersList.innerHTML = '<p class="empty-state">No followers found.</p>';
                return;
            }
            followersList.innerHTML = followers.map(u => `
                <a href="${u.html_url}" target="_blank" class="user-card glass-card" style="padding:0.75rem;">
                    <img src="${u.avatar_url}" alt="${u.login}" class="user-card-avatar">
                    <span class="user-card-login">${u.login}</span>
                </a>
            `).join('');
        } catch {
            followersList.innerHTML = '<p class="empty-state">Failed to load followers.</p>';
        }
    }

    // ===== LOAD FOLLOWING =====
    async function loadFollowing(uname) {
        try {
            const res = await fetch(`/api/profiles/${uname}/following`);
            const following = await res.json();
            if (!Array.isArray(following) || following.length === 0) {
                followingList.innerHTML = '<p class="empty-state">Not following anyone.</p>';
                return;
            }
            followingList.innerHTML = following.map(u => `
                <a href="${u.html_url}" target="_blank" class="user-card glass-card" style="padding:0.75rem;">
                    <img src="${u.avatar_url}" alt="${u.login}" class="user-card-avatar">
                    <span class="user-card-login">${u.login}</span>
                </a>
            `).join('');
        } catch {
            followingList.innerHTML = '<p class="empty-state">Failed to load following.</p>';
        }
    }

    // ===== LOAD DEVELOPER SCORE =====
    async function loadScore(uname) {
        try {
            const res = await fetch(`/api/profiles/${uname}/score`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed');
            renderScore(data);
        } catch {
            scorePanel.innerHTML = '<p class="empty-state">Failed to load developer score.</p>';
        }
    }

    function renderScore(data) {
        const score = data.developerScore;
        const rank = data.rank;
        const rankColor = data.rankColor;
        const bd = data.breakdown;

        const circumference = 440;
        const offset = circumference * (1 - score / 100);

        const breakdownItems = [
            { label: '🔥 Total Commits', score: bd.commits.score, max: bd.commits.max, value: bd.commits.value + ' commits' },
            { label: '📅 Active Days', score: bd.activeDays.score, max: bd.activeDays.max, value: bd.activeDays.value + ' days' },
            { label: '📦 Repositories', score: bd.repos.score, max: bd.repos.max, value: bd.repos.value + ' repos' },
        ];

        scorePanel.innerHTML = `
            <div class="score-wrapper">
                <div style="text-align:center">
                    <div class="score-gauge-wrap">
                        <svg viewBox="0 0 180 180">
                            <circle class="score-gauge-bg" cx="90" cy="90" r="70"/>
                            <circle class="score-gauge-fill" id="gauge-fill" cx="90" cy="90" r="70"
                                stroke="url(#gaugeGrad)"
                                style="stroke-dashoffset:${circumference}"
                            />
                            <defs>
                                <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stop-color="${rankColor}"/>
                                    <stop offset="100%" stop-color="#0ea5e9"/>
                                </linearGradient>
                            </defs>
                        </svg>
                        <div class="score-center-text">
                            <span class="score-number" style="color:${rankColor}">${score}</span>
                            <span class="score-max">/ 100</span>
                        </div>
                    </div>
                    <div class="rank-badge" style="color:${rankColor}">🏆 ${rank}</div>
                </div>

                <div class="score-breakdown">
                    ${breakdownItems.map(item => `
                        <div class="breakdown-item">
                            <div class="breakdown-label-row">
                                <span class="breakdown-label">${item.label}</span>
                                <span class="breakdown-pts">${item.score}<span style="color:var(--text-muted);font-weight:400">/${item.max} pts</span> &nbsp;<span style="color:var(--text-muted);font-size:0.8rem">(${item.value})</span></span>
                            </div>
                            <div class="breakdown-bar-track">
                                <div class="breakdown-bar-fill" data-pct="${(item.score / item.max) * 100}"></div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        requestAnimationFrame(() => {
            const fill = document.getElementById('gauge-fill');
            if (fill) fill.style.strokeDashoffset = offset;

            document.querySelectorAll('.breakdown-bar-fill').forEach(bar => {
                bar.style.width = bar.dataset.pct + '%';
            });
        });
    }

    // ===== LOAD LANGUAGE STATS =====
    const LANG_COLORS = {
        'JavaScript': '#f7df1e', 'TypeScript': '#3178c6', 'Python': '#3572A5',
        'Java': '#b07219', 'C#': '#178600', 'C++': '#f34b7d',
        'C': '#555555', 'Go': '#00ADD8', 'Rust': '#dea584',
        'Ruby': '#701516', 'PHP': '#4F5D95', 'Swift': '#fa7343',
        'Kotlin': '#A97BFF', 'Dart': '#00B4AB', 'HTML': '#e34c26',
        'CSS': '#563d7c', 'Shell': '#89e051', 'Vue': '#41b883',
        'Scala': '#c22d40', 'R': '#198CE7',
    };
    const DEFAULT_COLORS = ['#6366f1','#0ea5e9','#22c55e','#f59e0b','#f43f5e',
                             '#8b5cf6','#ec4899','#14b8a6','#84cc16','#fb923c'];

    async function loadLanguages(uname) {
        try {
            const res = await fetch(`/api/profiles/${uname}/languages`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed');
            renderLanguages(data);
        } catch {
            langsPanel.innerHTML = '<p class="empty-state">Failed to load language stats.</p>';
        }
    }

    function renderLanguages(data) {
        if (!data.languages || data.languages.length === 0) {
            langsPanel.innerHTML = '<p class="empty-state">No language data found for this profile.</p>';
            return;
        }

        const rows = data.languages.map((lang, i) => {
            const color = LANG_COLORS[lang.name] || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
            return `
                <div class="lang-row">
                    <div class="lang-meta">
                        <span class="lang-name">
                            <span class="lang-color-dot" style="background:${color}"></span>
                            ${lang.name}
                            <span class="lang-count">(${lang.count} repo${lang.count > 1 ? 's' : ''})</span>
                        </span>
                        <span class="lang-pct">${lang.percentage}%</span>
                    </div>
                    <div class="lang-bar-track">
                        <div class="lang-bar-fill" data-pct="${lang.percentage}" style="background:${color}; opacity:0.85"></div>
                    </div>
                </div>
            `;
        }).join('');

        langsPanel.innerHTML = `
            <div class="lang-stats-wrap">
                ${rows}
                <p class="lang-legend-note">Based on ${data.reposWithLanguage} of ${data.totalRepos} repos with a detected language</p>
            </div>
        `;

        requestAnimationFrame(() => {
            document.querySelectorAll('.lang-bar-fill').forEach(bar => {
                bar.style.width = bar.dataset.pct + '%';
            });
        });
    }
});
