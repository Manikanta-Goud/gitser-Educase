document.addEventListener('DOMContentLoaded', () => {

    // ===== DOM REFS =====
    const form        = document.getElementById('analyze-form');
    const input       = document.getElementById('username-input');
    const analyzeBtn  = document.getElementById('analyze-btn');
    const btnLabel    = analyzeBtn.querySelector('.btn-label');
    const btnSpinner  = analyzeBtn.querySelector('.btn-spinner');
    const errorMsg    = document.getElementById('error-msg');
    const resultSec   = document.getElementById('result-section');
    const historyGrid = document.getElementById('history-grid');
    const countBadge  = document.getElementById('count-badge');

    // ===== INIT =====
    loadHistory();

    // ===== FORM SUBMIT =====
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = input.value.trim();
        if (!username) return;

        setLoading(true);
        clearError();

        try {
            const res = await fetch('/api/profiles/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username })
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Something went wrong');

            renderResultCard(json.data);
            loadHistory();
            input.value = '';

        } catch (err) {
            showError(err.message);
        } finally {
            setLoading(false);
        }
    });

    // ===== RENDER MAIN RESULT CARD =====
    function renderResultCard(profile) {
        const name = profile.name || profile.username;
        const bio  = profile.bio  || 'No bio provided.';
        const joinYear = profile.created_at
            ? new Date(profile.created_at).getFullYear()
            : '—';

        resultSec.innerHTML = `
            <div class="glass-card profile-card">
                <div class="profile-avatar-ring">
                    <img src="${profile.avatar_url}" alt="${name}" class="profile-avatar">
                </div>
                <div class="profile-info">
                    <h2 class="profile-name">${name}</h2>
                    <a href="https://github.com/${profile.username}" target="_blank" class="profile-login">@${profile.username}</a>
                    <p class="profile-bio">${bio}</p>
                    <div class="profile-meta">
                        <span class="meta-tag">📅 Joined ${joinYear}</span>
                        <span class="meta-tag">📦 ${profile.public_repos} Public Repos</span>
                    </div>
                    <div class="stats-row">
                        <div class="stat-chip">
                            <span class="stat-val">${profile.public_repos}</span>
                            <span class="stat-lbl">Repos</span>
                        </div>
                        <div class="stat-chip">
                            <span class="stat-val">${profile.followers}</span>
                            <span class="stat-lbl">Followers</span>
                        </div>
                        <div class="stat-chip">
                            <span class="stat-val">${profile.following}</span>
                            <span class="stat-lbl">Following</span>
                        </div>
                    </div>
                    <a href="profile.html?u=${profile.username}" class="view-details-btn" style="text-decoration:none; text-align:center;">
                        View Full Details →
                    </a>
                </div>
            </div>
        `;

        resultSec.classList.remove('hidden');
        resultSec.classList.remove('fade-in');
        void resultSec.offsetWidth;
        resultSec.classList.add('fade-in');
    }

    // ===== LOAD & RENDER HISTORY =====
    async function loadHistory() {
        try {
            const res = await fetch('/api/profiles');
            if (!res.ok) throw new Error();
            const profiles = await res.json();
            countBadge.textContent = profiles.length;
            renderHistory(profiles.slice(0, 5)); // Only show top 5
        } catch {
            historyGrid.innerHTML = '<p class="empty-state">Could not load history.</p>';
        }
    }

    function renderHistory(profiles) {
        if (profiles.length === 0) {
            historyGrid.innerHTML = '<p class="empty-state">No profiles yet. Start by searching a GitHub username above!</p>';
            return;
        }
        historyGrid.innerHTML = profiles.map(p => {
            const name = p.name || p.username;
            return `
                <a href="profile.html?u=${p.username}" class="history-card" style="text-decoration:none; display:block;">
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
            `;
        }).join('');
    }

    // ===== UTILS =====
    function setLoading(on) {
        analyzeBtn.disabled = on;
        btnLabel.classList.toggle('hidden', on);
        btnSpinner.classList.toggle('hidden', !on);
    }

    function showError(msg) {
        errorMsg.textContent = msg;
        errorMsg.classList.remove('hidden');
        setTimeout(clearError, 5000);
    }

    function clearError() {
        errorMsg.classList.add('hidden');
        errorMsg.textContent = '';
    }
});
