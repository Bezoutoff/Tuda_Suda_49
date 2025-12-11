/**
 * Analyze timing between bot attempts and orderbook activation
 */

import * as fs from 'fs';
import * as path from 'path';

const CSV_FILE = path.join(__dirname, '..', 'latency.csv');

interface AnalysisRow {
  slug: string;
  marketTime: Date;
  acceptingTime: Date | null;
  botAttemptTime: Date;
  delaySeconds: number;  // Delay between orderbook activation and bot attempt
  latencyMs: number;
  status: string;
}

function parseCSVLine(line: string): string[] {
  return line.split(',');
}

function main() {
  console.log('='.repeat(80));
  console.log('АНАЛИЗ: Задержка между активацией orderbook и попыткой бота');
  console.log('='.repeat(80));
  console.log('');

  // Read CSV
  const csvContent = fs.readFileSync(CSV_FILE, 'utf-8');
  const lines = csvContent.trim().split('\n');

  if (lines.length === 0) {
    console.log('ERROR: CSV file is empty');
    process.exit(1);
  }

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

  if (serverTimeIdx === -1 || slugIdx === -1 || acceptingIdx === -1 || latencyIdx === -1) {
    console.log('ERROR: Required columns not found in CSV');
    process.exit(1);
  }

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
      // No accepting timestamp
      continue;
    }

    const botAttemptTime = new Date(serverTimeMs);
    const acceptingTime = new Date(acceptingTimestamp);
    const marketTimeDate = new Date(marketTime * 1000);

    // Calculate delay: accepting time - bot attempt time (in seconds)
    const delaySeconds = Math.round((acceptingTime.getTime() - serverTimeMs) / 1000);

    results.push({
      slug,
      marketTime: marketTimeDate,
      acceptingTime,
      botAttemptTime,
      delaySeconds,
      latencyMs,
      status,
    });
  }

  console.log(`Обработано: ${results.length} маркетов\n`);

  // Sort by delaySeconds (most negative = bot was earliest)
  results.sort((a, b) => a.delaySeconds - b.delaySeconds);

  // Print table
  console.log('┌─────┬──────────────────────────────┬─────────────┬─────────────┬─────────────┐');
  console.log('│  #  │ Slug                         │ Задержка    │ Latency (ms)│ Status      │');
  console.log('├─────┼──────────────────────────────┼─────────────┼─────────────┼─────────────┤');

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const num = `${i + 1}`.padStart(3);
    const slugShort = r.slug.padEnd(28);

    // Format delay
    let delayStr: string;
    if (r.delaySeconds < 0) {
      // Bot was BEFORE orderbook activation (good!)
      delayStr = `-${Math.abs(r.delaySeconds)}s (до)`;
    } else if (r.delaySeconds > 0) {
      // Bot was AFTER orderbook activation (bad!)
      delayStr = `+${r.delaySeconds}s (после)`;
    } else {
      delayStr = `0s (точно)`;
    }
    delayStr = delayStr.padEnd(11);

    const latencyStr = `${r.latencyMs}`.padStart(4);
    const statusStr = r.status === 'success' ? '✓ success' : '✗ failed';

    console.log(`│ ${num} │ ${slugShort} │ ${delayStr} │ ${latencyStr}        │ ${statusStr.padEnd(11)} │`);
  }

  console.log('└─────┴──────────────────────────────┴─────────────┴─────────────┴─────────────┘');
  console.log('');

  // Statistics
  const beforeCount = results.filter(r => r.delaySeconds < 0).length;
  const afterCount = results.filter(r => r.delaySeconds > 0).length;
  const exactCount = results.filter(r => r.delaySeconds === 0).length;

  const avgDelay = Math.round(results.reduce((sum, r) => sum + r.delaySeconds, 0) / results.length);
  const minDelay = Math.min(...results.map(r => r.delaySeconds));
  const maxDelay = Math.max(...results.map(r => r.delaySeconds));

  const avgLatency = Math.round(results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length);
  const minLatency = Math.min(...results.map(r => r.latencyMs));
  const maxLatency = Math.max(...results.map(r => r.latencyMs));

  console.log('СТАТИСТИКА:');
  console.log('─'.repeat(80));
  console.log('');
  console.log('Задержка бота относительно активации orderbook:');
  console.log(`  • Бот ДО активации:     ${beforeCount} (${Math.round(beforeCount / results.length * 100)}%)`);
  console.log(`  • Бот ПОСЛЕ активации:  ${afterCount} (${Math.round(afterCount / results.length * 100)}%)`);
  console.log(`  • Точно в момент:       ${exactCount}`);
  console.log('');
  console.log(`  • Средняя задержка:     ${avgDelay}s`);
  console.log(`  • Min задержка:         ${minDelay}s (самый ранний)`);
  console.log(`  • Max задержка:         ${maxDelay}s (самый поздний)`);
  console.log('');
  console.log('Latency HTTP запросов:');
  console.log(`  • Средний latency:      ${avgLatency}ms`);
  console.log(`  • Min latency:          ${minLatency}ms`);
  console.log(`  • Max latency:          ${maxLatency}ms`);
  console.log('');

  // Interpretation
  console.log('ИНТЕРПРЕТАЦИЯ:');
  console.log('─'.repeat(80));
  if (avgDelay > 0) {
    console.log(`⚠️  В среднем бот делает попытки на ${avgDelay}s ПОСЛЕ активации orderbook!`);
    console.log('    Это объясняет почему только 2 попытки - orderbook уже доступен.');
    console.log('');
    console.log('💡 РЕКОМЕНДАЦИЯ: Уменьшить DELAY_BEFORE_SPAM_MS или начинать spam раньше.');
  } else if (avgDelay < 0) {
    console.log(`✓ В среднем бот делает попытки на ${Math.abs(avgDelay)}s ДО активации orderbook!`);
    console.log('  Это хорошо - бот успевает спамить до активации.');
  } else {
    console.log('Бот делает попытки примерно в момент активации orderbook.');
  }
  console.log('');
}

main();
