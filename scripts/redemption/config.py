"""
Configuration loader for Polymarket Redemption Bot.
Loads credentials from .env file (similar to src/config.ts).
"""

import os
from dotenv import load_dotenv
from dataclasses import dataclass
from typing import Optional
from eth_account import Account


@dataclass
class RedemptionConfig:
    """Configuration for redemption bot"""
    # Wallet credentials
    private_key: str
    wallet_address: str
    funder_address: str

    # Builder Relayer credentials (same as CLOB)
    api_key: str
    secret: str
    passphrase: str

    # API endpoints
    balances_api_url: str = "https://clob.polymarket.com/balances"
    relayer_api_url: str = "https://clob.polymarket.com"  # Use CLOB for now, may need different endpoint

    # CTF contract and USDC
    ctf_contract: str = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045"
    collateral_token: str = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"  # USDC on Polygon
    chain_id: int = 137  # Polygon

    # Telegram (optional)
    telegram_bot_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None

    # Logging
    csv_log_path: str = "./logs/redemption.csv"
    log_file_path: str = "./logs/redemption-bot.log"


def load_config() -> RedemptionConfig:
    """
    Load configuration from .env file.
    Similar to src/config.ts:55-64.
    """
    load_dotenv()

    # Required fields
    private_key = os.getenv('PK')
    if not private_key:
        raise ValueError("PK not found in .env")

    # Add 0x prefix if missing
    if not private_key.startswith('0x'):
        private_key = '0x' + private_key

    # Derive wallet address from private key
    account = Account.from_key(private_key)
    wallet_address = account.address

    # Funder address (proxy wallet for Polymarket)
    funder_address = os.getenv('FUNDER')
    if not funder_address:
        raise ValueError("FUNDER not found in .env")

    # Builder Relayer credentials (same as CLOB)
    api_key = os.getenv('CLOB_API_KEY')
    secret = os.getenv('CLOB_SECRET')
    passphrase = os.getenv('CLOB_PASS_PHRASE')

    if not all([api_key, secret, passphrase]):
        raise ValueError("Missing Builder Relayer credentials (CLOB_API_KEY, CLOB_SECRET, CLOB_PASS_PHRASE)")

    # Telegram (optional)
    telegram_bot_token = os.getenv('TELEGRAM_BOT_TOKEN')
    telegram_admin_ids = os.getenv('TELEGRAM_ADMIN_ID')
    telegram_chat_id = telegram_admin_ids.split(',')[0] if telegram_admin_ids else None

    return RedemptionConfig(
        private_key=private_key,
        wallet_address=wallet_address,
        funder_address=funder_address,
        api_key=api_key,
        secret=secret,
        passphrase=passphrase,
        telegram_bot_token=telegram_bot_token,
        telegram_chat_id=telegram_chat_id,
    )


def validate_config(config: RedemptionConfig) -> list[str]:
    """
    Validate configuration, return list of errors.
    Similar to src/config.ts:69-100.
    """
    errors = []

    if not config.private_key or len(config.private_key) != 66:
        errors.append("Invalid private key (must be 64 hex chars + 0x prefix)")

    if not config.wallet_address or not config.wallet_address.startswith('0x'):
        errors.append("Invalid wallet address")

    if not config.funder_address or not config.funder_address.startswith('0x'):
        errors.append("Invalid funder address")

    if not config.api_key or not config.secret or not config.passphrase:
        errors.append("Missing Builder Relayer credentials")

    return errors
