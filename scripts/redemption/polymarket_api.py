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
        Returns list of Position objects with redeemable=true.

        API endpoint: GET /positions?user={funder_address}&redeemable=true
        """
        # Build URL with query params (same as trading-service.ts)
        params = {
            'user': self.funder_address,
            'limit': '100',
            'sortBy': 'CURRENT',
            'sortDirection': 'DESC',
            'sizeThreshold': '0',
        }

        logger.info(f"Fetching positions from: {self.api_url}")
        logger.info(f"For user: {self.funder_address}")

        try:
            response = self.session.get(self.api_url, params=params, timeout=30)
            response.raise_for_status()

            data = response.json()

            # Response is array of positions
            if not isinstance(data, list):
                raise ValueError(f"Expected array, got {type(data)}")

            logger.info(f"Received {len(data)} total positions")

            # Filter only redeemable positions
            positions = []
            for item in data:
                # Check if redeemable
                if not item.get('redeemable', False):
                    continue

                # Get position size
                size = float(item.get('size', 0))
                if size <= 0:
                    continue

                # Extract fields (from Data API response format)
                position = Position(
                    asset=item.get('asset_id', item.get('token_id', '')),
                    balance=size,  # 'size' field from Data API
                    condition_id=item.get('condition_id', ''),
                    outcome_index=int(item.get('outcome', 0)),
                    market_slug=item.get('market', ''),
                    market_title=item.get('question', 'Unknown'),
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
