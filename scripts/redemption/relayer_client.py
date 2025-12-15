"""
Builder Relayer client for submitting redemption transactions.
Uses official py-builder-relayer-client SDK.
"""

import logging
from typing import Dict, Any, List
from web3 import Web3

# Import official Polymarket SDK
from py_builder_relayer_client import RelayClient, BuilderConfig, BuilderApiKeyCreds
from py_builder_relayer_client.data_models import SafeTransaction

logger = logging.getLogger(__name__)


class BuilderRelayerClient:
    """
    Client for Polymarket Builder Relayer using official SDK.
    """

    def __init__(
        self,
        relayer_url: str,
        private_key: str,
        api_key: str,
        secret: str,
        passphrase: str,
        chain_id: int = 137,
    ):
        self.relayer_url = relayer_url
        self.chain_id = chain_id

        # Initialize builder config
        builder_config = BuilderConfig(
            local_builder_creds=BuilderApiKeyCreds(
                key=api_key,
                secret=secret,
                passphrase=passphrase,
            )
        )

        # Initialize RelayClient (official SDK)
        self.client = RelayClient(
            relayer_url=relayer_url,
            chain_id=chain_id,
            private_key=private_key,
            builder_config=builder_config,
        )

        logger.info(f"Relayer client initialized (chain_id={chain_id})")

    def _build_redeem_calldata(
        self,
        ctf_contract: str,
        collateral_token: str,
        parent_collection_id: str,
        condition_id: str,
        index_sets: List[int],
    ) -> str:
        """
        Build calldata for redeemPositions() call.

        Function signature:
        redeemPositions(
            address collateralToken,
            bytes32 parentCollectionId,
            bytes32 conditionId,
            uint256[] indexSets
        )
        """
        w3 = Web3()

        # Function signature
        function_signature = "redeemPositions(address,bytes32,bytes32,uint256[])"
        function_selector = w3.keccak(text=function_signature)[:4]

        # Convert hex strings to bytes32
        parent_collection_bytes = bytes.fromhex(
            parent_collection_id[2:] if parent_collection_id.startswith('0x') else parent_collection_id
        )
        condition_bytes = bytes.fromhex(
            condition_id[2:] if condition_id.startswith('0x') else condition_id
        )

        # ABI encode parameters
        encoded_params = w3.codec.encode(
            ['address', 'bytes32', 'bytes32', 'uint256[]'],
            [
                Web3.to_checksum_address(collateral_token),
                parent_collection_bytes,
                condition_bytes,
                index_sets,
            ]
        )

        calldata = '0x' + function_selector.hex() + encoded_params.hex()
        return calldata

    def submit_redemption(
        self,
        ctf_contract: str,
        collateral_token: str,
        parent_collection_id: str,
        condition_id: str,
        index_sets: List[int],
    ) -> Dict[str, Any]:
        """
        Submit redemption transaction to Builder Relayer.

        Returns: {hash: tx_hash, ...}
        """
        logger.info(f"Submitting redemption for condition {condition_id[:8]}...")

        # Build calldata
        calldata = self._build_redeem_calldata(
            ctf_contract,
            collateral_token,
            parent_collection_id,
            condition_id,
            index_sets,
        )

        logger.debug(f"Calldata: {calldata}")

        # Create SafeTransaction
        txn = SafeTransaction(
            to=ctf_contract,
            data=calldata,
            value="0",
        )

        # Submit via RelayClient
        label = f"Redeem {condition_id[:8]}..."
        logger.debug(f"Executing transaction with label: {label}")

        try:
            response = self.client.execute([txn], label)

            # Wait for confirmation
            logger.debug("Waiting for transaction confirmation...")
            result = response.wait()

            # Extract transaction hash
            tx_hash = result.get('hash') or result.get('transactionHash', '')
            logger.info(f"Redemption successful: tx_hash={tx_hash}")

            return result

        except Exception as e:
            logger.error(f"Relayer execution failed: {e}")
            raise
