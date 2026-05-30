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

// ── FEATURE 1: Professional Developer Score ─────────────────────────────────
// 5-metric scoring system (max 100 pts):
//   1. Commit Consistency  → 25 pts (streak weeks, gaps analysis)
//   2. Commit Quality      → 20 pts (message length, descriptiveness)
//   3. Real Projects       → 20 pts (original repos with descriptions, topics, stars)
//   4. README Quality      → 20 pts (length, sections, code blocks, badges)
//   5. Code Quality        → 15 pts (config files, test folders, structure)

// Helper: Build axios config with optional GitHub token
function ghHeaders() {
    const headers = { 'Accept': 'application/vnd.github.v3+json' };
    if (process.env.GITHUB_TOKEN) {
        headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
    }
    return { headers };
}

const getDeveloperScore = async (req, res) => {
    const { username } = req.params;
    try {
        const config = ghHeaders();

        // ─── Parallel data fetch ───────────────────────────────────
        const [profileRes, reposRes, contribRes] = await Promise.all([
            axios.get(`https://api.github.com/users/${username}`, config),
            axios.get(`https://api.github.com/users/${username}/repos?per_page=100&sort=updated`, config),
            axios.get(`https://github.com/users/${username}/contributions`).catch(() => null)
        ]);

        const user = profileRes.data;
        const repos = reposRes.data;
        const ownRepos = repos.filter(r => !r.fork);

        // ═══════════════════════════════════════════════════════════
        // 1. COMMIT CONSISTENCY (max 25 pts)
        //    - Scrape contribution calendar
        //    - Count active weeks out of 52
        // ═══════════════════════════════════════════════════════════
        let activeDays = 0;
        let totalContributions = 0;
        let activeWeeks = 0;

        if (contribRes && contribRes.data) {
            const $ = cheerio.load(contribRes.data);
            const daysByWeek = {};
            let dayIndex = 0;

            $('td.ContributionCalendar-day').each((i, el) => {
                const level = $(el).attr('data-level');
                const weekNum = Math.floor(dayIndex / 7);
                if (level && level !== '0') {
                    activeDays++;
                    daysByWeek[weekNum] = true;
                }
                const tooltipId = $(el).attr('id');
                if (tooltipId) {
                    const tooltipText = $(`tool-tip[for="${tooltipId}"]`).text();
                    const match = tooltipText.match(/^(\d+) contribution/);
                    if (match) {
                        totalContributions += parseInt(match[1], 10);
                    }
                }
                dayIndex++;
            });
            activeWeeks = Object.keys(daysByWeek).length;
        }

        // Score: active weeks out of 52, with bonus for streaks
        const consistencyRatio = Math.min(activeWeeks / 40, 1); // 40+ weeks = perfect
        const consistencyScore = Math.round(consistencyRatio * 25);
        const consistencyDetail = `${activeWeeks}/52 weeks active, ${activeDays} days, ${totalContributions} contributions`;

        // ═══════════════════════════════════════════════════════════
        // 2. COMMIT QUALITY (max 20 pts)
        //    - Fetch recent commits from top 3 repos
        //    - Analyze message length & descriptiveness
        // ═══════════════════════════════════════════════════════════
        let commitQualityScore = 0;
        let commitQualityDetail = 'No commit data';

        try {
            // Pick top 3 most recently updated own repos
            const topRepos = ownRepos.slice(0, 3);
            let allMessages = [];

            const commitFetches = topRepos.map(r =>
                axios.get(`https://api.github.com/repos/${r.full_name}/commits?per_page=10`, config)
                    .then(res => res.data.map(c => c.commit.message))
                    .catch(() => [])
            );
            const results = await Promise.all(commitFetches);
            results.forEach(msgs => allMessages.push(...msgs));

            if (allMessages.length > 0) {
                // Analyze messages
                const avgLength = allMessages.reduce((s, m) => s + m.length, 0) / allMessages.length;
                const badKeywords = ['fix', 'update', 'test', 'wip', 'asdf', 'temp', 'stuff', 'changes', 'initial commit'];
                const goodMessages = allMessages.filter(m => {
                    const lower = m.toLowerCase().trim();
                    const isLongEnough = m.length > 15;
                    const isNotGeneric = !badKeywords.some(kw => lower === kw || lower === kw + 's');
                    return isLongEnough && isNotGeneric;
                });

                const qualityRatio = goodMessages.length / allMessages.length;
                const lengthBonus = Math.min(avgLength / 60, 1); // 60+ chars avg = perfect
                commitQualityScore = Math.round((qualityRatio * 14) + (lengthBonus * 6)); // max 20
                commitQualityDetail = `${goodMessages.length}/${allMessages.length} quality commits, avg ${Math.round(avgLength)} chars`;
            }
        } catch (err) {
            console.error('Commit quality error:', err.message);
        }

        // ═══════════════════════════════════════════════════════════
        // 3. REAL PROJECTS (max 20 pts)
        //    - Not forks
        //    - Has description
        //    - Has topics/tags
        //    - Has stars
        // ═══════════════════════════════════════════════════════════
        let realProjectCount = 0;
        let projectsWithDesc = 0;
        let projectsWithTopics = 0;
        let projectsWithStars = 0;

        ownRepos.forEach(r => {
            let isReal = false;
            if (r.description && r.description.length > 10) { projectsWithDesc++; isReal = true; }
            if (r.topics && r.topics.length > 0) { projectsWithTopics++; isReal = true; }
            if (r.stargazers_count > 0) { projectsWithStars++; isReal = true; }
            if (isReal) realProjectCount++;
        });

        const totalOwn = ownRepos.length || 1;
        const descRatio = projectsWithDesc / totalOwn;
        const topicRatio = projectsWithTopics / totalOwn;
        const starRatio = Math.min(projectsWithStars / 5, 1); // 5+ starred repos = max
        const realProjectsScore = Math.round((descRatio * 8) + (topicRatio * 6) + (starRatio * 6)); // max 20
        const realProjectsDetail = `${realProjectCount} real projects, ${projectsWithDesc} with desc, ${projectsWithTopics} with topics, ${projectsWithStars} starred`;

        // ═══════════════════════════════════════════════════════════
        // 4. README QUALITY (max 20 pts)
        //    - Check top 3 repos for README content
        //    - Length, headings, code blocks, images/badges
        // ═══════════════════════════════════════════════════════════
        let readmeScore = 0;
        let readmeDetail = 'No READMEs found';

        try {
            const topForReadme = ownRepos.filter(r => r.description).slice(0, 3);
            let readmeScores = [];

            const readmeFetches = topForReadme.map(r =>
                axios.get(`https://api.github.com/repos/${r.full_name}/readme`, config)
                    .then(res => {
                        const content = Buffer.from(res.data.content, 'base64').toString('utf-8');
                        return content;
                    })
                    .catch(() => null)
            );
            const readmes = await Promise.all(readmeFetches);

            readmes.forEach(content => {
                if (!content) return;
                let score = 0;
                // Length check (max 5 pts)
                if (content.length > 2000) score += 5;
                else if (content.length > 500) score += 3;
                else if (content.length > 100) score += 1;
                // Headings check (max 5 pts)
                const headings = (content.match(/^#{1,3}\s/gm) || []).length;
                score += Math.min(headings, 5);
                // Code blocks (max 4 pts)
                const codeBlocks = (content.match(/```/g) || []).length / 2;
                score += Math.min(Math.floor(codeBlocks), 4);
                // Badges/images (max 3 pts)
                const images = (content.match(/!\[/g) || []).length;
                score += Math.min(images, 3);
                // Links (max 3 pts)
                const links = (content.match(/\[.*?\]\(.*?\)/g) || []).length;
                score += Math.min(links, 3);

                readmeScores.push(Math.min(score, 20));
            });

            if (readmeScores.length > 0) {
                readmeScore = Math.round(readmeScores.reduce((a, b) => a + b, 0) / readmeScores.length);
                readmeDetail = `Analyzed ${readmeScores.length} READMEs, avg score ${readmeScore}/20`;
            }
        } catch (err) {
            console.error('README analysis error:', err.message);
        }

        // ═══════════════════════════════════════════════════════════
        // 5. CODE QUALITY (max 15 pts)
        //    - Check top 5 repos for professional config files
        //    - .gitignore, tests/, .eslintrc, CI config, etc.
        // ═══════════════════════════════════════════════════════════
        let codeQualityScore = 0;
        let codeQualityDetail = 'No repos analyzed';

        try {
            const topForCode = ownRepos.slice(0, 5);
            let totalSignals = 0;
            let maxSignals = 0;

            const codeFetches = topForCode.map(r =>
                axios.get(`https://api.github.com/repos/${r.full_name}/contents`, config)
                    .then(res => res.data.map(f => f.name.toLowerCase()))
                    .catch(() => [])
            );
            const fileListsArr = await Promise.all(codeFetches);

            fileListsArr.forEach(files => {
                if (files.length === 0) return;
                maxSignals += 6;

                // Check for professional signals
                if (files.some(f => f === '.gitignore')) totalSignals++;
                if (files.some(f => f.includes('readme'))) totalSignals++;
                if (files.some(f => f === 'package.json' || f === 'requirements.txt' || f === 'pom.xml' || f === 'cargo.toml' || f === 'go.mod')) totalSignals++;
                if (files.some(f => f.includes('test') || f.includes('spec') || f.includes('__test'))) totalSignals++;
                if (files.some(f => f.includes('eslint') || f.includes('prettier') || f.includes('.editorconfig') || f.includes('tsconfig'))) totalSignals++;
                if (files.some(f => f === '.github' || f.includes('dockerfile') || f.includes('docker-compose') || f === '.env.example')) totalSignals++;
            });

            if (maxSignals > 0) {
                codeQualityScore = Math.round((totalSignals / maxSignals) * 15);
                codeQualityDetail = `${totalSignals}/${maxSignals} quality signals across ${topForCode.length} repos`;
            }
        } catch (err) {
            console.error('Code quality error:', err.message);
        }

        // ═══════════════════════════════════════════════════════════
        // TOTAL SCORE & RANK
        // ═══════════════════════════════════════════════════════════
        const totalScore = Math.min(consistencyScore + commitQualityScore + realProjectsScore + readmeScore + codeQualityScore, 100);

        let rank, rankColor;
        if      (totalScore >= 90) { rank = 'Top 1%';   rankColor = '#f59e0b'; }
        else if (totalScore >= 75) { rank = 'Top 5%';   rankColor = '#6366f1'; }
        else if (totalScore >= 60) { rank = 'Top 10%';  rankColor = '#0ea5e9'; }
        else if (totalScore >= 45) { rank = 'Top 20%';  rankColor = '#22c55e'; }
        else if (totalScore >= 30) { rank = 'Top 35%';  rankColor = '#f43f5e'; }
        else if (totalScore >= 15) { rank = 'Top 50%';  rankColor = '#fb923c'; }
        else                       { rank = 'Top 100%'; rankColor = '#94a3b8'; }

        res.status(200).json({
            username,
            developerScore: totalScore,
            rank,
            rankColor,
            breakdown: {
                commitConsistency: { score: consistencyScore, max: 25, detail: consistencyDetail },
                commitQuality:     { score: commitQualityScore, max: 20, detail: commitQualityDetail },
                realProjects:      { score: realProjectsScore, max: 20, detail: realProjectsDetail },
                readmeQuality:     { score: readmeScore, max: 20, detail: readmeDetail },
                codeQuality:       { score: codeQualityScore, max: 15, detail: codeQualityDetail }
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
