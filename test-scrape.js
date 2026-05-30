const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
    try {
        const { data } = await axios.get('https://github.com/users/goudb/contributions');
        const $ = cheerio.load(data);
        const heading = $('h2.f4.text-normal.mb-2').text();
        console.log("Heading:", heading.trim());
        
        let activeDays = 0;
        let totalCommits = 0;
        
        // Loop over the table cells
        $('td.ContributionCalendar-day').each((i, el) => {
            const level = $(el).attr('data-level');
            if (level && level !== '0') {
                activeDays++;
            }
            // Some tooltips hold the exact count, or sometimes the text of the span
            const tooltipId = $(el).attr('id');
            if (tooltipId) {
                const tooltipText = $(`tool-tip[for="${tooltipId}"]`).text();
                // e.g. "5 contributions on Dec 1, 2024"
                const match = tooltipText.match(/^(\d+) contribution/);
                if (match) {
                    totalCommits += parseInt(match[1], 10);
                }
            }
        });
        
        console.log("Active Days:", activeDays);
        console.log("Calculated Commits:", totalCommits);
    } catch (err) {
        console.error(err.message);
    }
}
test();
