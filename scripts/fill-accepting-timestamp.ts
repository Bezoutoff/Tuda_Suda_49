/**
 * Script to fill acceptingOrdersTimestamp column in latency.csv
 *
 * Reads existing CSV, fetches acceptingOrdersTimestamp from Gamma API for each slug,
 * and updates the CSV with the new column.
 */

import * as fs from 'fs';
import * as path from 'path';

const CSV_FILE = path.join(__dirname, '..', 'latency.csv');
const BACKUP_FILE = path.join(__dirname, '..', 'latency.csv.backup');
const DELAY_MS = 500; // Delay between API requests to avoid rate limiting

interface CSVRow {
  server_time_ms: string;
  market_time: string;
  sec_to_market: string;
  slug: string;
  accepting_orders_timestamp?: string;
  side: string;
  price: string;
  size: string;
  latency_ms: string;
  status: string;
  order_id: string;
  attempt: string;
  total_attempts: string;
  success_count: string;
  first_success_attempt: string;
  min_ms: string;
  max_ms: string;
  avg_ms: string;
  median_ms: string;
  source: string;
}

// Fetch acceptingOrdersTimestamp from Gamma API
async function fetchAcceptingOrdersTimestamp(slug: string): Promise<string | undefined> {
  try {
    const url = `https://gamma-api.polymarket.com/events/slug/${slug}`;
    console.log(`  Fetching: ${slug}...`);

    const response = await fetch(url);
    if (!response.ok) {
      console.log(`  ⚠️  Failed to fetch ${slug}: ${response.status}`);
      return undefined;
    }

    const data = await response.json() as any;

    // Extract acceptingOrdersTimestamp from markets[0]
    if (data.markets && Array.isArray(data.markets) && data.markets[0]) {
      const timestamp = data.markets[0].acceptingOrdersTimestamp;
      if (timestamp) {
        console.log(`  ✓ Found timestamp: ${timestamp}`);
        return timestamp;
      } else {
        console.log(`  ⚠️  No acceptingOrdersTimestamp in response`);
      }
    } else {
      console.log(`  ⚠️  No markets array in response`);
    }

    return undefined;
  } catch (error: any) {
    console.log(`  ❌ Error fetching ${slug}: ${error.message}`);
    return undefined;
  }
}

// Parse CSV line
function parseCSVLine(line: string): string[] {
  return line.split(',');
}

// Format CSV line
function formatCSVLine(values: string[]): string {
  return values.join(',');
}

// Main function
async function main() {
  console.log('='.repeat(60));
  console.log('Fill acceptingOrdersTimestamp in latency.csv');
  console.log('='.repeat(60));
  console.log('');

  // Check if CSV exists
  if (!fs.existsSync(CSV_FILE)) {
    console.log(`ERROR: CSV file not found: ${CSV_FILE}`);
    process.exit(1);
  }

  // Create backup
  console.log('Creating backup...');
  fs.copyFileSync(CSV_FILE, BACKUP_FILE);
  console.log(`Backup created: ${BACKUP_FILE}`);
  console.log('');

  // Read CSV
  console.log('Reading CSV...');
  const csvContent = fs.readFileSync(CSV_FILE, 'utf-8');
  const lines = csvContent.trim().split('\n');

  if (lines.length === 0) {
    console.log('ERROR: CSV file is empty');
    process.exit(1);
  }

  const header = lines[0];
  const dataLines = lines.slice(1);

  console.log(`Found ${dataLines.length} data rows`);
  console.log('');

  // Check current header format
  const headerCols = parseCSVLine(header);
  console.log(`Current header has ${headerCols.length} columns`);

  let hasAcceptingTimestamp = false;
  let slugIndex = -1;

  for (let i = 0; i < headerCols.length; i++) {
    if (headerCols[i] === 'slug') slugIndex = i;
    if (headerCols[i] === 'accepting_orders_timestamp') hasAcceptingTimestamp = true;
  }

  if (slugIndex === -1) {
    console.log('ERROR: No "slug" column found in header');
    process.exit(1);
  }

  // Prepare new header
  let newHeader: string;
  if (!hasAcceptingTimestamp) {
    console.log('Adding "accepting_orders_timestamp" column to header...');
    const newHeaderCols = [...headerCols];
    newHeaderCols.splice(slugIndex + 1, 0, 'accepting_orders_timestamp');
    newHeader = formatCSVLine(newHeaderCols);
  } else {
    console.log('Header already has "accepting_orders_timestamp" column');
    newHeader = header;
  }
  console.log('');

  // Collect unique slugs
  const slugs = new Set<string>();
  for (const line of dataLines) {
    const cols = parseCSVLine(line);
    if (cols.length > slugIndex) {
      slugs.add(cols[slugIndex]);
    }
  }

  console.log(`Found ${slugs.size} unique slugs`);
  console.log('');

  // Fetch timestamps for all slugs
  console.log('Fetching timestamps from Gamma API...');
  const timestampMap = new Map<string, string | undefined>();

  let count = 0;
  for (const slug of slugs) {
    count++;
    console.log(`[${count}/${slugs.size}] ${slug}`);

    const timestamp = await fetchAcceptingOrdersTimestamp(slug);
    timestampMap.set(slug, timestamp);

    // Delay to avoid rate limiting
    if (count < slugs.size) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }
  console.log('');

  // Update CSV lines
  console.log('Updating CSV lines...');
  const newLines: string[] = [newHeader];

  for (const line of dataLines) {
    const cols = parseCSVLine(line);

    if (cols.length <= slugIndex) {
      // Invalid line, keep as is
      newLines.push(line);
      continue;
    }

    const slug = cols[slugIndex];
    const timestamp = timestampMap.get(slug) || '';

    let newCols: string[];
    if (!hasAcceptingTimestamp) {
      // Insert timestamp after slug
      newCols = [...cols];
      newCols.splice(slugIndex + 1, 0, timestamp);
    } else {
      // Replace existing timestamp (if column exists)
      newCols = [...cols];
      if (newCols.length > slugIndex + 1) {
        newCols[slugIndex + 1] = timestamp;
      }
    }

    newLines.push(formatCSVLine(newCols));
  }

  // Write updated CSV
  console.log('Writing updated CSV...');
  fs.writeFileSync(CSV_FILE, newLines.join('\n') + '\n');
  console.log('');

  // Summary
  console.log('='.repeat(60));
  console.log('DONE!');
  console.log('='.repeat(60));
  console.log(`Updated CSV: ${CSV_FILE}`);
  console.log(`Backup: ${BACKUP_FILE}`);
  console.log(`Total rows: ${dataLines.length}`);
  console.log(`Unique slugs: ${slugs.size}`);

  const foundCount = Array.from(timestampMap.values()).filter(t => t).length;
  console.log(`Timestamps found: ${foundCount}/${slugs.size}`);
  console.log(`Timestamps missing: ${slugs.size - foundCount}/${slugs.size}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
