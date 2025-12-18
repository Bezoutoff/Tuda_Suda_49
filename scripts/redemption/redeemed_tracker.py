"""
Tracker for already-redeemed positions.
Reads redemption.csv to build cache of successfully redeemed condition_ids.
"""

from pathlib import Path
from typing import Set
import csv
import logging

logger = logging.getLogger(__name__)


class RedeemedTracker:
    """
    Tracks condition_ids that have been successfully redeemed.

    Loads from CSV at startup and caches in memory.
    No writing needed - CSV logger handles persistence.
    """

    def __init__(self, csv_path: str):
        """
        Initialize tracker and load redeemed condition_ids from CSV.

        Args:
            csv_path: Path to redemption.csv file
        """
        self.csv_path = Path(csv_path)
        self._redeemed_conditions: Set[str] = set()
        self._load_from_csv()

    def _load_from_csv(self) -> None:
        """
        Load successfully redeemed condition_ids from CSV.
        Only includes entries with status='success'.

        Handles:
        - Missing file (first run)
        - Corrupted rows (skip and continue)
        - Empty CSV (just header)
        """
        if not self.csv_path.exists():
            logger.info(f"CSV файл не найден: {self.csv_path} (первый запуск?)")
            return

        success_count = 0
        error_count = 0

        try:
            with open(self.csv_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)

                for row_num, row in enumerate(reader, start=2):  # Start at 2 (header is row 1)
                    try:
                        condition_id = row.get('condition_id', '').strip()
                        status = row.get('status', '').strip()

                        # Only track successfully redeemed positions
                        if status == 'success' and condition_id:
                            self._redeemed_conditions.add(condition_id)
                            success_count += 1

                    except Exception as e:
                        # Skip corrupted row, don't crash
                        logger.warning(f"Пропуск поврежденной строки CSV {row_num}: {e}")
                        error_count += 1
                        continue

            logger.info(
                f"Загружено {success_count} ранее выкупленных условий из CSV "
                f"({error_count} строк пропущено)"
            )

        except Exception as e:
            logger.error(f"Ошибка загрузки выкупленных условий из CSV: {e}")
            logger.info("Начинаем с пустого tracker (все позиции будут обработаны)")

    def is_already_redeemed(self, condition_id: str) -> bool:
        """
        Check if condition_id was already successfully redeemed.

        Args:
            condition_id: Condition ID to check

        Returns:
            True if already redeemed, False otherwise
        """
        return condition_id in self._redeemed_conditions

    def mark_as_redeemed(self, condition_id: str) -> None:
        """
        Add condition_id to in-memory cache after successful redemption.

        Note: CSV logging is handled separately by CSVLogger.
        This just updates the in-memory cache to avoid re-processing
        in the same run (shouldn't happen, but defensive).

        Args:
            condition_id: Condition ID that was successfully redeemed
        """
        if condition_id not in self._redeemed_conditions:
            self._redeemed_conditions.add(condition_id)
            logger.debug(f"Помечен как выкупленный: {condition_id[:8]}...")

    def get_redeemed_count(self) -> int:
        """
        Get count of tracked redeemed conditions.

        Returns:
            Number of condition_ids in tracker
        """
        return len(self._redeemed_conditions)

    def get_redeemed_conditions(self) -> Set[str]:
        """
        Get set of all redeemed condition_ids (for debugging/reporting).

        Returns:
            Set of condition_id strings
        """
        return self._redeemed_conditions.copy()  # Return copy to prevent modification
