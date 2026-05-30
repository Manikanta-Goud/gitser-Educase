const express = require('express');
const router = express.Router();
const { analyzeProfile, getAllProfiles, getProfile, getRepos, getFollowers, getFollowing, getDeveloperScore, getLanguageStats, getSavedProfiles, saveProfile, unsaveProfile, deleteProfile } = require('../controllers/profileController');

// POST /api/profiles/analyze - Analyze and store profile
router.post('/analyze', analyzeProfile);

// GET /api/profiles - Fetch all stored profiles
router.get('/', getAllProfiles);

// GET /api/profiles/saved - Fetch saved profiles
router.get('/saved', getSavedProfiles);

// GET /api/profiles/:username/repos - Fetch repos from GitHub
router.get('/:username/repos', getRepos);

// GET /api/profiles/:username/followers - Fetch followers from GitHub
router.get('/:username/followers', getFollowers);

// GET /api/profiles/:username/following - Fetch following from GitHub
router.get('/:username/following', getFollowing);

// GET /api/profiles/:username/score - Developer score & rank
router.get('/:username/score', getDeveloperScore);

// GET /api/profiles/:username/languages - Language statistics
router.get('/:username/languages', getLanguageStats);

// GET /api/profiles/:username - Fetch data of a single profile (must be last)
router.get('/:username', getProfile);

// POST /api/profiles/:username/save - Save a profile
router.post('/:username/save', saveProfile);

// DELETE /api/profiles/:username/save - Unsave a profile
router.delete('/:username/save', unsaveProfile);

// DELETE /api/profiles/:username - Delete a profile entirely
router.delete('/:username', deleteProfile);

module.exports = router;
