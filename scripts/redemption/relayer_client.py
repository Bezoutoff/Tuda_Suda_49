"""
Builder Relayer client for submitting redemption transactions.
Handles EIP-712 signing and authentication (similar to CLOB API).
"""

import time
import hmac
import hashlib
import base64
import json
from typing import Dict, Any, List
from web3 import Web3
from eth_account import Account
from eth_account.messages import encode_defunct
import requests
import logging

logger = logging.getLogger(__name__)


class BuilderRelayerClient:
    """
    Client for Polymarket Builder Relayer.
    Similar to CLOB API authentication.
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
        self.private_key = private_key
        self.api_key = api_key
        self.secret = secret
        self.passphrase = passphrase
        self.chain_id = chain_id

        # Initialize Web3 account
        self.account = Account.from_key(private_key)
        self.wallet_address = self.account.address

        logger.info(f"Relayer client initialized for wallet: {self.wallet_address}")

    def _build_redemption_calldata(
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
            IERC20 collateralToken,
            bytes32 parentCollectionId,
            bytes32 conditionId,
            uint256[] calldata indexSets
        )
        """
        w3 = Web3()

        # Function selector: first 4 bytes of keccak256 hash
        function_signature = "redeemPositions(address,bytes32,bytes32,uint256[])"
        function_selector = w3.keccak(text=function_signature)[:4]

        # Encode parameters
        # Convert hex strings to bytes
        parent_collection_bytes = bytes.fromhex(parent_collection_id[2:] if parent_collection_id.startswith('0x') else parent_collection_id)
        condition_bytes = bytes.fromhex(condition_id[2:] if condition_id.startswith('0x') else condition_id)

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

    def _create_auth_headers(self, method: str, path: str, body: str = '') -> Dict[str, str]:
        """
        Create authentication headers for Builder Relayer.
        Same as CLOB API authentication.

        IMPORTANT:
        - POLY_ADDRESS = wallet address (NOT funder!)
        - Signature must be URL-safe base64
        - Header names use UNDERSCORE not hyphen
        """
        timestamp = str(int(time.time()))

        # Create signature: HMAC-SHA256(timestamp + method + path + body, secret)
        message = timestamp + method + path + body
        signature = hmac.new(
            self.secret.encode('utf-8'),
            message.encode('utf-8'),
            hashlib.sha256
        ).digest()

        # Base64 encode (URL-safe: + → -, / → _)
        signature_b64 = base64.urlsafe_b64encode(signature).decode('utf-8')

        return {
            'POLY_ADDRESS': self.wallet_address,  # Wallet address, not funder
            'POLY_SIGNATURE': signature_b64,
            'POLY_TIMESTAMP': timestamp,
            'POLY_API_KEY': self.api_key,
            'POLY_PASSPHRASE': self.passphrase,
            'Content-Type': 'application/json',
        }

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

        NOTE: This uses direct transaction submission, not EIP-712.
        Polymarket CTF contract's redeemPositions() is a direct call,
        not a meta-transaction.

        Returns: {hash: tx_hash, ...}
        """
        logger.info(f"Submitting redemption for condition {condition_id[:8]}...")

        # Build calldata
        calldata = self._build_redemption_calldata(
            ctf_contract,
            collateral_token,
            parent_collection_id,
            condition_id,
            index_sets,
        )

        logger.debug(f"Calldata: {calldata}")

        # Use /execute endpoint (Relayer API) to submit transaction
        # https://docs.polymarket.com/developers/builders/relayer-client
        path = '/execute'

        # Build transaction object
        transaction = {
            'to': ctf_contract,
            'data': calldata,
            'value': '0',
        }

        payload = {
            'transactions': [transaction],
            'label': f'Redeem position {condition_id[:8]}...',
        }

        body = json.dumps(payload)
        headers = self._create_auth_headers('POST', path, body)

        # Submit to relayer
        url = self.relayer_url + path

        try:
            response = requests.post(
                url,
                headers=headers,
                data=body,
                timeout=30,
            )

            # Log response for debugging
            logger.debug(f"Response status: {response.status_code}")
            logger.debug(f"Response body: {response.text}")

            response.raise_for_status()

            result = response.json()
            logger.info(f"Redemption submitted: tx_hash={result.get('hash', 'unknown')}")
            return result

        except requests.HTTPError as e:
            logger.error(f"HTTP error {e.response.status_code}: {e.response.text}")
            raise
        except requests.RequestException as e:
            logger.error(f"Relayer request failed: {e}")
            raise

    def get_nonce(self, address: str) -> int:
        """
        Get current nonce for address.
        For now, use timestamp-based nonce.
        """
        return int(time.time() * 1000)
