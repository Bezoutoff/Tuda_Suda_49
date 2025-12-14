"""
CSV logger for redemption results.
Similar to updown-bot.csv format.
"""

import csv
from pathlib import Path
from datetime import datetime
from typing import Optional, List
import logging

logger = logging.getLogger(__name__)


class CSVLogger:
    """Log redemption results to CSV file"""

    def __init__(self, csv_path: str):
        self.csv_path = Path(csv_path)
        self._ensure_file_exists()

    def _ensure_file_exists(self) -> None:
        """Create CSV file with header if it doesn't exist"""
        if not self.csv_path.exists():
            # Create parent directory
            self.csv_path.parent.mkdir(parents=True, exist_ok=True)

            # Write header
            with open(self.csv_path, 'w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerow([
                    'timestamp',
                    'condition_id',
                    'parent_collection_id',
                    'index_sets',
                    'amount_usdc',
                    'status',
                    'tx_hash',
                    'error',
                ])
            logger.info(f"Created CSV log file: {self.csv_path}")

    def log_redemption(
        self,
        condition_id: str,
        parent_collection_id: str,
        index_sets: List[int],
        amount_usdc: float,
        status: str,
        tx_hash: Optional[str] = None,
        error: Optional[str] = None,
    ) -> None:
        """Log single redemption result"""
        timestamp = datetime.now().isoformat()

        with open(self.csv_path, 'a', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow([
                timestamp,
                condition_id,
                parent_collection_id,
                '|'.join(map(str, index_sets)),  # Join with pipe: 1|2
                f"{amount_usdc:.6f}",
                status,
                tx_hash or '',
                error or '',
            ])

        logger.info(f"Logged redemption: {condition_id[:8]}... → {status}")
