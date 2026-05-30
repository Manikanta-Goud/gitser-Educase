const axios = require('axios');
const pool = require('../config/database');
const cheerio = require('cheerio');

// Analyze and store profile
const analyzeProfile = async (req, res) => {
    const { username } = req.body;

    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }

    try {
        // Fetch from GitHub API
        const githubResponse = await axios.get(`https://api.github.com/users/${username}`);
        const data = githubResponse.data;

        const profileData = {
            username: data.login,
            name: data.name,
            avatar_url: data.avatar_url,
            bio: data.bio,
            public_repos: data.public_repos,
            followers: data.followers,
            following: data.following,
            created_at: new Date(data.created_at) // Convert string to Date for MySQL
        };

        // Insert or Update the profile in the database
        const query = `
            INSERT INTO profiles (username, name, avatar_url, bio, public_repos, followers, following, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
                name = VALUES(name),
                avatar_url = VALUES(avatar_url),
                bio = VALUES(bio),
                public_repos = VALUES(public_repos),
                followers = VALUES(followers),
                following = VALUES(following),
                created_at = VALUES(created_at),
                analyzed_at = CURRENT_TIMESTAMP
        `;

        const values = [
            profileData.username,
            profileData.name,
            profileData.avatar_url,
            profileData.bio,
            profileData.public_repos,
            profileData.followers,
            profileData.following,
            profileData.created_at
        ];

        await pool.query(query, values);

        res.status(200).json({
            message: 'Profile analyzed and saved successfully',
            data: profileData
        });

    } catch (error) {
        if (error.response && error.response.status === 404) {
            return res.status(404).json({ error: 'GitHub user not found' });
        }
        console.error('Error analyzing profile:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Fetch all profiles
const getAllProfiles = async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM profiles ORDER BY analyzed_at DESC');
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching profiles:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Fetch a single profile
const getProfile = async (req, res) => {
    const { username } = req.params;

    try {
        const [rows] = await pool.query('SELECT * FROM profiles WHERE username = ?', [username]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Profile not found in database' });
        }

        res.status(200).json(rows[0]);
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Fetch user's public repos from GitHub
const getRepos = async (req, res) => {
    const { username } = req.params;
    try {
        const response = await axios.get(`https://api.github.com/users/${username}/repos?sort=updated&per_page=30`);
        const repos = response.data.map(r => ({
            id: r.id,
            name: r.name,
            full_name: r.full_name,
            description: r.description,
            html_url: r.html_url,
            language: r.language,
            stargazers_count: r.stargazers_count,
            forks_count: r.forks_count,
            updated_at: r.updated_at
        }));
        res.status(200).json(repos);
    } catch (error) {
        if (error.response && error.response.status === 404) {
            return res.status(404).json({ error: 'GitHub user not found' });
        }
        res.status(500).json({ error: 'Failed to fetch repositories' });
    }
};

// Fetch user's followers from GitHub
const getFollowers = async (req, res) => {
    const { username } = req.params;
    try {
        const response = await axios.get(`https://api.github.com/users/${username}/followers?per_page=50`);
        const followers = response.data.map(u => ({
            login: u.login,
            avatar_url: u.avatar_url,
            html_url: u.html_url
        }));
        res.status(200).json(followers);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch followers' });
    }
};

// Fetch user's following from GitHub
const getFollowing = async (req, res) => {
    const { username } = req.params;
    try {
        const response = await axios.get(`https://api.github.com/users/${username}/following?per_page=50`);
        const following = response.data.map(u => ({
            login: u.login,
            avatar_url: u.avatar_url,
            html_url: u.html_url
        }));
        res.status(200).json(following);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch following' });
    }
};

// ── FEATURE 1: Developer Score ──────────────────────────────────────────────
// Scoring formula (max 100 pts):
//   Commits      → 50% (capped at 2000)
//   Active Days  → 40% (capped at 200)
//   Repos        → 10% (capped at 50)
const getDeveloperScore = async (req, res) => {
    const { username } = req.params;
    try {
        // Fetch basic profile
        const profileRes = await axios.get(`https://api.github.com/users/${username}`);
        const user = profileRes.data;

        // Scrape GitHub contributions for accurate commits and active days
        let totalCommits = 0;
        let activeDays = 0;
        try {
            const contribRes = await axios.get(`https://github.com/users/${username}/contributions`);
            const $ = cheerio.load(contribRes.data);
            
            $('td.ContributionCalendar-day').each((i, el) => {
                const level = $(el).attr('data-level');
                if (level && level !== '0') {
                    activeDays++;
                }
                const tooltipId = $(el).attr('id');
                if (tooltipId) {
                    const tooltipText = $(`tool-tip[for="${tooltipId}"]`).text();
                    const match = tooltipText.match(/^(\d+) contribution/);
                    if (match) {
                        totalCommits += parseInt(match[1], 10);
                    }
                }
            });
        } catch (scrapeErr) {
            console.error('Failed to scrape contributions:', scrapeErr.message);
            // fallback gracefully to 0 if scrape fails
        }

        // Score components
        const commitScore = Math.min((totalCommits / 2000) * 50, 50);
        const daysScore = Math.min((activeDays / 200) * 40, 40);
        const repoScore = Math.min((user.public_repos / 50) * 10, 10);

        const totalScore = Math.round(commitScore + daysScore + repoScore);

        // Percentile Labels
        let rank, rankColor;
        if      (totalScore >= 90) { rank = 'Top 1%';  rankColor = '#f59e0b'; } // Elite Gold
        else if (totalScore >= 75) { rank = 'Top 5%';  rankColor = '#6366f1'; } // Indigo
        else if (totalScore >= 50) { rank = 'Top 15%'; rankColor = '#0ea5e9'; } // Light Blue
        else if (totalScore >= 30) { rank = 'Top 30%'; rankColor = '#22c55e'; } // Green
        else if (totalScore >= 10) { rank = 'Top 50%'; rankColor = '#f43f5e'; } // Rose
        else                       { rank = 'Top 100%';rankColor = '#94a3b8'; } // Gray

        res.status(200).json({
            username,
            developerScore: totalScore,
            rank,
            rankColor,
            breakdown: {
                commits: { score: Math.round(commitScore), max: 50, value: totalCommits },
                activeDays: { score: Math.round(daysScore), max: 40, value: activeDays },
                repos: { score: Math.round(repoScore), max: 10, value: user.public_repos }
            }
        });

    } catch (error) {
        if (error.response && error.response.status === 404) {
            return res.status(404).json({ error: 'GitHub user not found' });
        }
        console.error('Failed to calc score:', error);
        res.status(500).json({ error: 'Failed to calculate developer score' });
    }
};

// ── FEATURE 2: Language Statistics ──────────────────────────────────────────
// Scans all public repos and returns language usage as percentages
const getLanguageStats = async (req, res) => {
    const { username } = req.params;
    try {
        // Fetch up to 100 repos
        const reposRes = await axios.get(
            `https://api.github.com/users/${username}/repos?per_page=100&sort=updated`
        );
        const repos = reposRes.data;

        // Count language occurrences (by repo count, not bytes — no extra API calls)
        const langMap = {};
        repos.forEach(repo => {
            if (repo.language) {
                langMap[repo.language] = (langMap[repo.language] || 0) + 1;
            }
        });

        const total = Object.values(langMap).reduce((a, b) => a + b, 0);

        if (total === 0) {
            return res.status(200).json({ username, languages: [], totalRepos: repos.length });
        }

        // Sort by count desc, compute percentage
        const languages = Object.entries(langMap)
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => ({
                name,
                count,
                percentage: Math.round((count / total) * 1000) / 10  // 1 decimal
            }));

        res.status(200).json({
            username,
            totalRepos: repos.length,
            reposWithLanguage: total,
            languages
        });

    } catch (error) {
        if (error.response && error.response.status === 404) {
            return res.status(404).json({ error: 'GitHub user not found' });
        }
        res.status(500).json({ error: 'Failed to fetch language statistics' });
    }
};

// ── FEATURE: Save/Unsave/Delete Profiles ─────────────────────────────────────

// Fetch all saved profiles
const getSavedProfiles = async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM profiles WHERE is_saved = TRUE ORDER BY analyzed_at DESC');
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching saved profiles:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Save a profile
const saveProfile = async (req, res) => {
    const { username } = req.params;
    try {
        const [result] = await pool.query('UPDATE profiles SET is_saved = TRUE WHERE username = ?', [username]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Profile not found in database' });
        }
        res.status(200).json({ message: 'Profile saved successfully' });
    } catch (error) {
        console.error('Error saving profile:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Unsave a profile
const unsaveProfile = async (req, res) => {
    const { username } = req.params;
    try {
        const [result] = await pool.query('UPDATE profiles SET is_saved = FALSE WHERE username = ?', [username]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Profile not found in database' });
        }
        res.status(200).json({ message: 'Profile unsaved successfully' });
    } catch (error) {
        console.error('Error unsaving profile:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Delete a profile entirely
const deleteProfile = async (req, res) => {
    const { username } = req.params;
    try {
        const [result] = await pool.query('DELETE FROM profiles WHERE username = ?', [username]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Profile not found in database' });
        }
        res.status(200).json({ message: 'Profile deleted successfully' });
    } catch (error) {
        console.error('Error deleting profile:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = {
    analyzeProfile,
    getAllProfiles,
    getProfile,
    getRepos,
    getFollowers,
    getFollowing,
    getDeveloperScore,
    getLanguageStats,
    getSavedProfiles,
    saveProfile,
    unsaveProfile,
    deleteProfile
};
