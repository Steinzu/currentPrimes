import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';
import fs from 'fs';

// Function to fetch and parse the HTML content
async function fetchAndParseHTML(url) {
    try {
        const response = await fetch(url);
        const htmlContent = await response.text();
        return new JSDOM(htmlContent).window.document;
    } catch (error) {
        console.error('Error fetching or parsing the HTML content:', error);
        return null;
    }
}

// Function to find subtable data by title
function findSubTableData(document, subTableTitle) {
    const tables = document.querySelectorAll('th');
    let targetTableStart = Array.from(tables).find(th => th.textContent.trim() === subTableTitle);

    if (!targetTableStart) {
        console.error(`Subtable not found: ${subTableTitle}`);
        return [];
    }

    // Extract rows of the subtable
    let rows = [];
    let currentRow = targetTableStart.parentElement.nextElementSibling;

    while (currentRow && !currentRow.classList.contains('blank-row')) {
        if (!currentRow.querySelector('th') && currentRow.querySelector('td').textContent.includes("Relic")) {
            rows.push(currentRow.querySelector('td').textContent.trim());
        }
        currentRow = currentRow.nextElementSibling;
    }

    return rows;
}

// Function to find relic table data
function findRelicTableData(document, relicName) {
    const tables = document.querySelectorAll('th');
    let targetTableStart = Array.from(tables).find(th => th.textContent.trim() === `${relicName} (Intact)`);

    if (!targetTableStart) {
        console.error(`Relic table not found: ${relicName} (Intact)`);
        return [];
    }

    // Extract rows of the relic table
    let rows = [];
    let currentRow = targetTableStart.parentElement.nextElementSibling;

    while (currentRow && !currentRow.classList.contains('blank-row')) {
        const cells = currentRow.querySelectorAll('td');
        if (cells.length > 0) {
            let item = cells[0].textContent.trim();
            let rarityText = cells[1].textContent.trim();

            let rarity = '';
            if (rarityText.includes('25.33%')) {
                rarity = 'Common';
            } else if (rarityText.includes('11.00%')) {
                rarity = 'Uncommon';
            } else if (rarityText.includes('2.00%')) {
                rarity = 'Rare';
            }

            rows.push({ item, rarity });
        }
        currentRow = currentRow.nextElementSibling;
    }

    return rows;
}

// Function to extract data from specific subtables
async function extractSubTableData(url, subTableTitles) {
    const document = await fetchAndParseHTML(url);
    if (!document) return {};

    let results = {};
    for (const title of subTableTitles) {
        results[title] = findSubTableData(document, title);
    }

    let relicData = {};
    for (const subTable in results) {
        for (const relic of results[subTable]) {
            relicData[relic] = findRelicTableData(document, relic);
        }
    }

    return relicData;
}

// Function to clean and order relics
function cleanAndOrderRelics(relicsData) {
    let relicsSet = new Set();

    for (const key in relicsData) {
        relicsData[key].forEach(relic => relicsSet.add(relic.item));
    }

    return Array.from(relicsSet).sort((a, b) => {
        const order = ['Lith', 'Meso', 'Neo', 'Axi'];
        const [typeA, typeB] = [a.split(' ')[0], b.split(' ')[0]];

        if (typeA === typeB) {
            return a.localeCompare(b);
        }
        return order.indexOf(typeA) - order.indexOf(typeB);
    });
}

// Function to extract complete primes
function extractPrimes(relicData) {
    let primes = {};

    for (const relic in relicData) {
        relicData[relic].forEach(({ item, rarity }) => {
            if (!item.includes('Forma') && item.includes('Prime')) {
                const primeName = item.split(' Prime')[0] + ' Prime';
                if (!primes[primeName]) {
                    primes[primeName] = [];
                }
                primes[primeName].push({ item, rarity, source: relic });
            }
        });
    }

    return primes;
}

// Function to generate Markdown file
function generateMarkdown(primes, relicData, relicLocations) {
    const currentDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    let markdown = `# Generated on ${currentDate}\n\n# Primes\n\n`;

    // Sort primes alphabetically
    const sortedPrimes = Object.keys(primes).sort();

    sortedPrimes.forEach(prime => {
        markdown += `- ${prime}\n`;
        const sortedItems = primes[prime].sort((a, b) => {
            const rarityOrder = ['Rare', 'Uncommon', 'Common'];
            return rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity);
        });
        sortedItems.forEach(({ item, rarity, source }) => {
            markdown += `  - ${item} (${rarity}) -> ${source}\n`;
        });
    });

    markdown += '\n# Relics\n\n';

    for (const relic in relicData) {
        markdown += `## ${relic}\n\n`;
        relicData[relic].forEach(({ item, rarity }) => {
            markdown += `- ${item} (${rarity})\n`;
        });
        markdown += `\n**Location**: ${relicLocations[relic.split(' ')[0]]}\n\n`;
    }

    return markdown;
}

// Main execution
const url = 'https://warframe-web-assets.nyc3.cdn.digitaloceanspaces.com/uploads/cms/hnfvc0o3jnfvc873njb03enrf56.html';
const subTableTitles = ['Void/Hepit (Capture)', 'Void/Ukko (Capture)', 'Lua/Apollo (Disruption)'];
const relicLocations = {
    'Lith': 'Void/Hepit (Capture)',
    'Meso': 'Void/Ukko (Capture)',
    'Neo': 'Void/Ukko (Capture), Lua/Apollo (Disruption)',
    'Axi': 'Lua/Apollo (Disruption)'
};

extractSubTableData(url, subTableTitles).then(data => {
    const cleanRelics = cleanAndOrderRelics(data);
    const primes = extractPrimes(data);
    const markdownContent = generateMarkdown(primes, data, relicLocations);
    fs.writeFileSync('currentPrimes.md', markdownContent);
    console.log('Markdown file has been generated as currentPrimes.md');
});
