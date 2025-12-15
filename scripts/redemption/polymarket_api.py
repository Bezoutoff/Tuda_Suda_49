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

            # Debug: log first position to see structure
            if len(data) > 0:
                logger.debug(f"First position sample: {data[0]}")

            # Filter only redeemable positions
            positions = []
            redeemable_count = 0
            for item in data:
                # Check if redeemable (API uses camelCase: redeemable)
                if not item.get('redeemable', False):
                    continue

                redeemable_count += 1

                # Get position size
                size = float(item.get('size', 0))
                if size <= 0:
                    logger.debug(f"Skipping position with size={size}")
                    continue

                # Parse outcome - API returns string like "Yes", "No", "0", "1"
                outcome_str = item.get('outcome', '0')
                try:
                    # Try to convert to int (for markets with numeric outcomes)
                    outcome_index = int(outcome_str)
                except ValueError:
                    # Handle string outcomes: "Yes" -> 0, "No" -> 1
                    outcome_index = 1 if outcome_str.lower() in ['no', 'down'] else 0

                # Extract fields (API uses camelCase)
                position = Position(
                    asset=item.get('asset', ''),
                    balance=size,
                    condition_id=item.get('conditionId', ''),
                    outcome_index=outcome_index,
                    market_slug=item.get('slug', ''),
                    market_title=item.get('title', 'Unknown'),
                )

                logger.debug(f"Position: {position.market_slug} - {position.market_title}, "
                           f"outcome={outcome_str}, size={size}")

                positions.append(position)

            logger.info(f"Found {redeemable_count} redeemable positions, {len(positions)} with balance > 0")
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
