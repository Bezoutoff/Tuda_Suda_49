"""
Polymarket API client for fetching redeemable positions.
GET /balances/{address} endpoint.
"""

import requests
from typing import List
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class Position:
    """Represents a single position from API"""
    asset: str  # Token ID
    balance: float
    condition_id: str
    outcome_index: int
    market_slug: str
    market_title: str


class PolymarketAPI:
    """Client for Polymarket CLOB API"""

    def __init__(self, api_url: str, funder_address: str):
        self.api_url = api_url
        self.funder_address = funder_address
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'TudaSuda49-RedemptionBot/1.0'
        })

    def fetch_redeemable_positions(self) -> List[Position]:
        """
        Fetch all redeemable positions for funder address.
        Returns list of Position objects with balance > 0.

        API endpoint: GET /balances/{funder_address}
        """
        url = f"{self.api_url}/{self.funder_address}"
        logger.info(f"Fetching positions from: {url}")

        try:
            response = self.session.get(url, timeout=30)
            response.raise_for_status()

            data = response.json()

            # Response structure may vary - adapt based on actual API
            # Expected format: { "balances": [...] } or just [...]
            if isinstance(data, dict):
                balances = data.get('balances', data.get('data', []))
            else:
                balances = data

            logger.info(f"Received {len(balances)} balance records")

            positions = []
            for item in balances:
                # Only process positions with non-zero balance
                balance = float(item.get('balance', 0))
                if balance <= 0:
                    continue

                # Extract fields (adapt based on actual API response)
                position = Position(
                    asset=item.get('asset', ''),
                    balance=balance,
                    condition_id=item.get('condition_id', ''),
                    outcome_index=int(item.get('outcome', item.get('outcome_index', 0))),
                    market_slug=item.get('market', item.get('market_slug', '')),
                    market_title=item.get('market_title', item.get('question', 'Unknown')),
                )
                positions.append(position)

            logger.info(f"Found {len(positions)} positions with balance > 0")
            return positions

        except requests.Timeout:
            logger.error("API request timed out")
            raise
        except requests.HTTPError as e:
            logger.error(f"HTTP error: {e.response.status_code} - {e.response.text}")
            raise
        except requests.RequestException as e:
            logger.error(f"API request failed: {e}")
            raise
        except (KeyError, ValueError) as e:
            logger.error(f"Failed to parse API response: {e}")
            raise
