#!/usr/bin/env python3
"""
Latency visualization script for Polymarket API tests.
Reads latency.csv and generates graphs + statistics.

Usage:
    python scripts/plot_latency.py [path_to_csv]

If no path provided, uses ./latency.csv
"""

import sys
import pandas as pd
import matplotlib.pyplot as plt
from pathlib import Path

# Dark theme
plt.style.use('dark_background')

def main():
    # Get CSV path
    csv_path = sys.argv[1] if len(sys.argv) > 1 else 'latency.csv'

    if not Path(csv_path).exists():
        print(f"Error: {csv_path} not found")
        sys.exit(1)

    # Read CSV - columns are positional, header may not match data
    # Columns: server_time_ms(0), latency_ms(7), status(8)
    df = pd.read_csv(csv_path, header=None, skiprows=1,
                     usecols=[0, 7, 8],
                     names=['server_time_ms', 'latency_ms', 'status'])
    print(f"Loaded {len(df)} records from {csv_path}")

    # Convert server_time_ms to datetime
    df['time'] = pd.to_datetime(df['server_time_ms'], unit='ms')

    # Filter only successful requests (if status column exists)
    if 'status' in df.columns:
        success_df = df[df['status'] == 'success']
        print(f"Successful requests: {len(success_df)}")
    else:
        success_df = df

    # Statistics
    latency = success_df['latency_ms']
    print("\n" + "=" * 40)
    print("LATENCY STATISTICS")
    print("=" * 40)
    print(f"  Count:   {len(latency)}")
    print(f"  Min:     {latency.min()} ms")
    print(f"  Max:     {latency.max()} ms")
    print(f"  Mean:    {latency.mean():.1f} ms")
    print(f"  Median:  {latency.median():.0f} ms")
    print(f"  Std:     {latency.std():.1f} ms")
    print(f"  P95:     {latency.quantile(0.95):.0f} ms")
    print(f"  P99:     {latency.quantile(0.99):.0f} ms")
    print("=" * 40)

    # Create figure with 2 subplots
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(max(14, len(success_df) * 0.5), 10))

    # Plot 1: Latency over time with labels
    # Use index for x-axis to show each point separately
    x_positions = range(len(success_df))
    ax1.plot(x_positions, success_df['latency_ms'].values,
             marker='o', markersize=8, linestyle='-', linewidth=0.5, alpha=0.7)

    # Add latency value label for each point
    for i, (idx, row) in enumerate(success_df.iterrows()):
        ax1.annotate(f"{int(row['latency_ms'])}",
                     (i, row['latency_ms']),
                     textcoords="offset points",
                     xytext=(0, 8),
                     ha='center',
                     fontsize=8,
                     fontweight='bold')

    ax1.axhline(y=latency.mean(), color='r', linestyle='--', label=f'Mean: {latency.mean():.0f}ms')
    ax1.axhline(y=latency.median(), color='g', linestyle='--', label=f'Median: {latency.median():.0f}ms')

    # Set x-axis ticks to show time in HH:MM:SS.mmm format
    ax1.set_xticks(x_positions)
    time_labels = [t.strftime('%H:%M:%S') + f'.{t.microsecond // 1000:03d}'
                   for t in success_df['time']]
    ax1.set_xticklabels(time_labels, rotation=90, fontsize=7)

    ax1.set_xlabel('Time (HH:MM:SS.ms)')
    ax1.set_ylabel('Latency (ms)')
    ax1.set_title('API Latency Over Time (values in ms)')
    ax1.grid(True, alpha=0.3)
    ax1.legend()
    ax1.margins(x=0.02)

    # Plot 2: Histogram
    ax2.hist(latency, bins=30, edgecolor='black', alpha=0.7)
    ax2.axvline(x=latency.mean(), color='r', linestyle='--', label=f'Mean: {latency.mean():.0f}ms')
    ax2.axvline(x=latency.median(), color='g', linestyle='--', label=f'Median: {latency.median():.0f}ms')
    ax2.set_xlabel('Latency (ms)')
    ax2.set_ylabel('Frequency')
    ax2.set_title('Latency Distribution')
    ax2.legend()
    ax2.grid(True, alpha=0.3)

    plt.tight_layout()

    # Save plot
    output_path = Path(csv_path).stem + '_plot.png'
    plt.savefig(output_path, dpi=150)
    print(f"\nPlot saved to: {output_path}")

    # Show plot
    plt.show()

if __name__ == '__main__':
    main()
