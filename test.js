// Extended test - also verify the new endpoints
const axios = require('axios');

async function runTests() {
    console.log('=== Testing new GITSER V2 Endpoints ===\n');

    console.log('Testing GET /api/profiles/torvalds/repos ...');
    try {
        const res = await axios.get('http://localhost:5000/api/profiles/torvalds/repos');
        console.log(`SUCCESS: Found ${res.data.length} repos. First: "${res.data[0].name}" (⭐ ${res.data[0].stargazers_count})`);
    } catch (e) {
        console.error('ERROR:', e.response ? e.response.data : e.message);
    }

    console.log('\nTesting GET /api/profiles/torvalds/followers ...');
    try {
        const res = await axios.get('http://localhost:5000/api/profiles/torvalds/followers');
        console.log(`SUCCESS: Found ${res.data.length} followers. First: "${res.data[0].login}"`);
    } catch (e) {
        console.error('ERROR:', e.response ? e.response.data : e.message);
    }

    console.log('\nTesting GET /api/profiles/torvalds/following ...');
    try {
        const res = await axios.get('http://localhost:5000/api/profiles/torvalds/following');
        console.log(`SUCCESS: Found ${res.data.length} following.`);
    } catch (e) {
        console.error('ERROR:', e.response ? e.response.data : e.message);
    }
}

runTests();
