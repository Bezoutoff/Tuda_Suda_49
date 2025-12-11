/**
 * Analyze timing and save to CSV
 */

import * as fs from 'fs';
import * as path from 'path';

const CSV_FILE = path.join(__dirname, '..', 'latency.csv');
const OUTPUT_FILE = path.join(__dirname, '..', 'timing-analysis.csv');

interface AnalysisRow {
  num: number;
  slug: string;
  marketTime: string;
  acceptingTime: string;
  botAttemptTime: string;
  delaySeconds: number;
  latencyMs: number;
  status: string;
}

function parseCSVLine(line: string): string[] {
  return line.split(',');
}

function formatDateTime(date: Date): string {
  return date.toISOString().replace('T', ' ').replace('Z', '');
}

function main() {
  console.log('Создание CSV файла с анализом...\n');

  // Read CSV
  const csvContent = fs.readFileSync(CSV_FILE, 'utf-8');
  const lines = csvContent.trim().split('\n');

  const header = lines[0];
  const dataLines = lines.slice(1);

  // Parse header
  const headerCols = parseCSVLine(header);
  const serverTimeIdx = headerCols.indexOf('server_time_ms');
  const marketTimeIdx = headerCols.indexOf('market_time');
  const slugIdx = headerCols.indexOf('slug');
  const acceptingIdx = headerCols.indexOf('accepting_orders_timestamp');
  const latencyIdx = headerCols.indexOf('latency_ms');
  const statusIdx = headerCols.indexOf('status');

  // Parse data
  const results: AnalysisRow[] = [];

  for (const line of dataLines) {
    const cols = parseCSVLine(line);

    if (cols.length <= Math.max(serverTimeIdx, slugIdx, acceptingIdx, latencyIdx)) {
      continue;
    }

    const serverTimeMs = parseInt(cols[serverTimeIdx]);
    const marketTime = parseInt(cols[marketTimeIdx]);
    const slug = cols[slugIdx];
    const acceptingTimestamp = cols[acceptingIdx];
    const latencyMs = parseInt(cols[latencyIdx]);
    const status = cols[statusIdx];

    if (!acceptingTimestamp) {
      continue;
    }

    const botAttemptTime = new Date(serverTimeMs);
    const acceptingTime = new Date(acceptingTimestamp);
    const marketTimeDate = new Date(marketTime * 1000);

    // Calculate delay: accepting time - bot attempt time (in seconds)
    const delaySeconds = Math.round((acceptingTime.getTime() - serverTimeMs) / 1000);

    results.push({
      num: 0, // Will set later
      slug,
      marketTime: formatDateTime(marketTimeDate),
      acceptingTime: formatDateTime(acceptingTime),
      botAttemptTime: formatDateTime(botAttemptTime),
      delaySeconds,
      latencyMs,
      status,
    });
  }

  // Sort by delaySeconds
  results.sort((a, b) => a.delaySeconds - b.delaySeconds);

  // Set numbers
  results.forEach((r, i) => r.num = i + 1);

  // Write CSV
  const outputLines: string[] = [];

  // Header
  outputLines.push('Номер,Slug,Время маркета,Активация orderbook,Попытка бота,Задержка (сек),Latency (мс),Статус');

  // Data
  for (const r of results) {
    outputLines.push(`${r.num},${r.slug},${r.marketTime},${r.acceptingTime},${r.botAttemptTime},${r.delaySeconds},${r.latencyMs},${r.status}`);
  }

  fs.writeFileSync(OUTPUT_FILE, outputLines.join('\n') + '\n', 'utf-8');

  console.log(`✓ Таблица сохранена: ${OUTPUT_FILE}`);
  console.log(`✓ Всего строк: ${results.length}`);
  console.log('');
  console.log('Откройте файл в Excel или текстовом редакторе!');
}

main();
