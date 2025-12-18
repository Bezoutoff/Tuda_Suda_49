#!/usr/bin/env python3
"""
Polymarket Redemption Bot - Main Entry Point

Automatically redeems completed positions on Polymarket.
Runs periodically via systemd timer (every 60 minutes).
"""

import sys
import logging
from datetime import datetime
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from redemption.config import load_config, validate_config
from redemption.polymarket_api import PolymarketAPI
from redemption.redemption_logic import group_positions_by_condition, should_redeem_group
from redemption.relayer_client import BuilderRelayerClient
from redemption.telegram_notifier import TelegramNotifier
from redemption.csv_logger import CSVLogger


def setup_logging(log_file_path: str) -> None:
    """Configure logging to both file and stdout"""
    # Create logs directory if needed
    log_file = Path(log_file_path)
    log_file.parent.mkdir(parents=True, exist_ok=True)

    # Configure logging
    logging.basicConfig(
        level=logging.DEBUG,  # Changed to DEBUG for troubleshooting
        format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(log_file_path),
        ]
    )


def main() -> int:
    """Main execution flow"""
    logger = logging.getLogger(__name__)

    logger.info("=" * 60)
    logger.info("Polymarket Redemption Bot - Starting")
    logger.info("=" * 60)

    try:
        # 1. Load configuration
        logger.info("Loading configuration...")
        config = load_config()

        # Setup logging with config
        setup_logging(config.log_file_path)

        errors = validate_config(config)
        if errors:
            for error in errors:
                logger.error(f"Config error: {error}")
            return 1

        logger.info(f"Wallet: {config.wallet_address}")
        logger.info(f"Funder: {config.funder_address}")

        # 2. Initialize components
        logger.info("Initializing components...")
        api_client = PolymarketAPI(config.positions_api_url, config.funder_address)
        relayer_client = BuilderRelayerClient(
            config.relayer_api_url,
            config.private_key,
            config.builder_api_key,
            config.builder_secret,
            config.builder_passphrase,
            config.chain_id,
        )
        telegram = TelegramNotifier(config.telegram_bot_token, config.telegram_chat_id)
        csv_logger = CSVLogger(config.csv_log_path)

        # 3. Notify start
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        telegram.notify_check_start(timestamp)

        # 4. Fetch redeemable positions
        logger.info("Fetching redeemable positions...")
        positions = api_client.fetch_redeemable_positions()

        if not positions:
            logger.info("No positions to redeem")
            telegram.notify_no_positions()
            return 0

        # 5. Group by condition_id
        logger.info("Grouping positions by condition...")
        redemption_groups = group_positions_by_condition(positions)

        total_usdc = sum(g.total_amount / 1e6 for g in redemption_groups)
        logger.info(f"Found {len(redemption_groups)} conditions, ${total_usdc:.2f} USDC")
        telegram.notify_positions_found(len(redemption_groups), total_usdc)

        # 6. Process each redemption group
        success_count = 0
        error_count = 0

        for group in redemption_groups:
            # Validate group
            should_redeem, reason = should_redeem_group(group)
            if not should_redeem:
                logger.warning(f"Skipping {group.condition_id[:8]}...: {reason}")
                continue

            try:
                # Submit redemption
                logger.info(f"Processing redemption for {group.condition_id[:8]}...")
                result = relayer_client.submit_redemption(
                    ctf_contract=config.ctf_contract,
                    collateral_token=config.collateral_token,
                    parent_collection_id=group.parent_collection_id,
                    condition_id=group.condition_id,
                    index_sets=group.index_sets,
                )

                tx_hash = result.get('hash', result.get('transactionHash', ''))
                amount_usdc = group.total_amount / 1e6

                # Log success
                csv_logger.log_redemption(
                    condition_id=group.condition_id,
                    parent_collection_id=group.parent_collection_id,
                    index_sets=group.index_sets,
                    amount_usdc=amount_usdc,
                    status='success',
                    tx_hash=tx_hash,
                )

                telegram.notify_redemption_success(
                    group.condition_id,
                    amount_usdc,
                    tx_hash,
                )

                success_count += 1
                logger.info(f"✓ Redemption successful: {group.condition_id[:8]}...")

            except Exception as e:
                error_msg = str(e)
                logger.error(f"Redemption failed for {group.condition_id[:8]}...: {error_msg}")

                # Log error
                csv_logger.log_redemption(
                    condition_id=group.condition_id,
                    parent_collection_id=group.parent_collection_id,
                    index_sets=group.index_sets,
                    amount_usdc=group.total_amount / 1e6,
                    status='error',
                    error=error_msg,
                )

                telegram.notify_redemption_error(group.condition_id, error_msg)
                error_count += 1

        # 7. Summary
        logger.info("=" * 60)
        logger.info(f"Redemption complete: {success_count} success, {error_count} errors")
        logger.info("=" * 60)

        return 0 if error_count == 0 else 1

    except Exception as e:
        logger.exception(f"Fatal error: {e}")
        return 1


if __name__ == '__main__':
    sys.exit(main())
