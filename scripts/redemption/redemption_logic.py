"""
Redemption logic: grouping positions by condition_id and calculating indexSets.
"""

from typing import List, Dict, Tuple
from dataclasses import dataclass
import logging
from .polymarket_api import Position

logger = logging.getLogger(__name__)


@dataclass
class RedemptionGroup:
    """Group of positions for single redemption transaction"""
    condition_id: str
    parent_collection_id: str  # Usually bytes32(0) for most markets
    index_sets: List[int]  # Calculated from outcome indices
    positions: List[Position]  # Original positions
    total_amount: int  # Total shares to redeem (in wei)


def calculate_index_set(outcome_index: int) -> int:
    """
    Calculate indexSet from outcome index.

    For binary markets (2 outcomes):
    - Outcome 0 (YES) → indexSet = 1 (binary: 01)
    - Outcome 1 (NO)  → indexSet = 2 (binary: 10)

    For multi-outcome markets:
    - indexSet = 2^outcome_index

    Example: Outcome 2 → indexSet = 4 (binary: 100)
    """
    return 1 << outcome_index  # Bitshift: 2^outcome_index


def group_positions_by_condition(positions: List[Position]) -> List[RedemptionGroup]:
    """
    Group positions by condition_id.
    Each condition can have multiple outcome positions that need redemption.

    Returns list of RedemptionGroup objects ready for redemption.
    """
    # Group by condition_id
    by_condition: Dict[str, List[Position]] = {}
    for pos in positions:
        if not pos.condition_id:
            logger.warning(f"Position {pos.asset} has no condition_id, skipping")
            continue

        if pos.condition_id not in by_condition:
            by_condition[pos.condition_id] = []
        by_condition[pos.condition_id].append(pos)

    redemption_groups = []

    for condition_id, condition_positions in by_condition.items():
        # Calculate indexSets for each outcome
        index_sets = []
        total_amount = 0

        for pos in condition_positions:
            index_set = calculate_index_set(pos.outcome_index)
            index_sets.append(index_set)

            # Convert balance to wei (USDC has 6 decimals on Polygon)
            amount_wei = int(pos.balance * 1e6)
            total_amount += amount_wei

        # Remove duplicates from index_sets and sort
        index_sets = sorted(list(set(index_sets)))

        # parentCollectionId is usually bytes32(0) for simple markets
        parent_collection_id = "0x" + "0" * 64

        group = RedemptionGroup(
            condition_id=condition_id,
            parent_collection_id=parent_collection_id,
            index_sets=index_sets,
            positions=condition_positions,
            total_amount=total_amount,
        )

        redemption_groups.append(group)

        logger.info(
            f"Condition {condition_id[:8]}...: "
            f"{len(index_sets)} outcomes, "
            f"{total_amount / 1e6:.2f} USDC to redeem"
        )

    return redemption_groups


def should_redeem_group(group: RedemptionGroup) -> Tuple[bool, str]:
    """
    Validate if group should be redeemed.
    Returns (should_redeem, reason)
    """
    # Minimum redemption amount (e.g., $0.01 to avoid dust)
    MIN_AMOUNT_USDC = 0.01

    if group.total_amount / 1e6 < MIN_AMOUNT_USDC:
        return False, f"Amount too small: ${group.total_amount / 1e6:.4f}"

    if not group.index_sets:
        return False, "No index sets calculated"

    if not group.condition_id:
        return False, "No condition ID"

    return True, "OK"
