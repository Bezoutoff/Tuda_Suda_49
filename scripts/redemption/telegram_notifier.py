"""
Telegram notifications via HTTP API.
Sends messages to existing Telegram bot (no separate bot process).
"""

import requests
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class TelegramNotifier:
    """Send notifications to Telegram via HTTP API"""

    def __init__(self, bot_token: Optional[str], chat_id: Optional[str]):
        self.bot_token = bot_token
        self.chat_id = chat_id
        self.api_url = f"https://api.telegram.org/bot{bot_token}" if bot_token else None

    def send_message(self, text: str, parse_mode: str = 'Markdown') -> bool:
        """Send message to Telegram chat"""
        if not self.bot_token or not self.chat_id:
            logger.warning("Telegram not configured, skipping notification")
            return False

        url = f"{self.api_url}/sendMessage"
        payload = {
            'chat_id': self.chat_id,
            'text': text,
            'parse_mode': parse_mode,
        }

        try:
            response = requests.post(url, json=payload, timeout=10)
            response.raise_for_status()
            logger.info("Telegram notification sent")
            return True
        except Exception as e:
            logger.error(f"Failed to send Telegram notification: {e}")
            return False

    def notify_check_start(self, timestamp: str) -> None:
        """Notify that redemption check is starting"""
        text = f"🔍 *Redemption Check Started*\n\n_Time: {timestamp}_"
        self.send_message(text)

    def notify_positions_found(self, count: int, total_usdc: float) -> None:
        """Notify that redeemable positions were found"""
        text = (
            f"💰 *Found Redeemable Positions*\n\n"
            f"Count: {count} conditions\n"
            f"Total: ${total_usdc:.2f} USDC\n\n"
            f"_Proceeding with redemption..._"
        )
        self.send_message(text)

    def notify_redemption_success(
        self,
        condition_id: str,
        amount_usdc: float,
        tx_hash: str,
    ) -> None:
        """Notify successful redemption"""
        short_condition = condition_id[:16] + '...' if len(condition_id) > 16 else condition_id
        short_tx = tx_hash[:16] + '...' if len(tx_hash) > 16 else tx_hash

        text = (
            f"✅ *Redemption Successful*\n\n"
            f"Condition: `{short_condition}`\n"
            f"Amount: ${amount_usdc:.2f} USDC\n"
            f"TX: [{short_tx}](https://polygonscan.com/tx/{tx_hash})\n"
        )
        self.send_message(text)

    def notify_redemption_error(
        self,
        condition_id: str,
        error: str,
    ) -> None:
        """Notify redemption error"""
        short_condition = condition_id[:16] + '...' if len(condition_id) > 16 else condition_id

        text = (
            f"❌ *Redemption Failed*\n\n"
            f"Condition: `{short_condition}`\n"
            f"Error: {error}\n"
        )
        self.send_message(text)

    def notify_no_positions(self) -> None:
        """Notify that no positions need redemption"""
        text = "ℹ️ *Redemption Check Complete*\n\nNo positions to redeem."
        self.send_message(text)
