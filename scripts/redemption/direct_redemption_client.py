"""
Direct CTF contract redemption client using web3.py.
Official approach per Polymarket documentation.
https://docs.polymarket.com/developers/CTF/redeem
"""

from web3 import Web3
from eth_account import Account
from typing import List, Dict, Any
import logging

logger = logging.getLogger(__name__)

# CTF Contract ABI (только redeemPositions function)
CTF_ABI = [
    {
        "inputs": [
            {"name": "collateralToken", "type": "address"},
            {"name": "parentCollectionId", "type": "bytes32"},
            {"name": "conditionId", "type": "bytes32"},
            {"name": "indexSets", "type": "uint256[]"}
        ],
        "name": "redeemPositions",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
]


class DirectRedemptionClient:
    """Direct CTF contract calls via web3.py"""

    def __init__(
        self,
        rpc_url: str,
        private_key: str,
        ctf_contract_address: str,
        chain_id: int = 137
    ):
        self.w3 = Web3(Web3.HTTPProvider(rpc_url))
        self.account = Account.from_key(private_key)
        self.ctf_contract = self.w3.eth.contract(
            address=Web3.to_checksum_address(ctf_contract_address),
            abi=CTF_ABI
        )
        self.chain_id = chain_id

        logger.info(f"Direct redemption client initialized")
        logger.info(f"Wallet: {self.account.address}")
        logger.info(f"CTF Contract: {ctf_contract_address}")

    def submit_redemption(
        self,
        ctf_contract: str,  # Ignored, using self.ctf_contract
        collateral_token: str,
        parent_collection_id: str,
        condition_id: str,
        index_sets: List[int],
    ) -> Dict[str, Any]:
        """
        Submit redemption transaction directly to CTF contract.

        Returns: {hash: tx_hash, status: 'success'}
        """
        logger.info(f"Building redemption transaction for {condition_id[:8]}...")

        # Check MATIC balance
        matic_balance = self.w3.eth.get_balance(self.account.address)
        matic_balance_eth = self.w3.from_wei(matic_balance, 'ether')
        logger.info(f"MATIC balance: {matic_balance_eth:.4f}")

        if matic_balance == 0:
            raise Exception("No MATIC for gas! Add MATIC to wallet.")

        # Get current gas price (with 10% buffer)
        gas_price = int(self.w3.eth.gas_price * 1.1)

        # Build transaction
        txn = self.ctf_contract.functions.redeemPositions(
            Web3.to_checksum_address(collateral_token),
            bytes.fromhex(parent_collection_id.replace('0x', '')),
            bytes.fromhex(condition_id.replace('0x', '')),
            index_sets
        ).build_transaction({
            'from': self.account.address,
            'gas': 500000,  # Estimate, will be adjusted
            'gasPrice': gas_price,
            'nonce': self.w3.eth.get_transaction_count(self.account.address),
            'chainId': self.chain_id,
        })

        # Estimate gas (more accurate)
        try:
            gas_estimate = self.w3.eth.estimate_gas(txn)
            txn['gas'] = int(gas_estimate * 1.2)  # +20% buffer
            logger.debug(f"Gas estimate: {gas_estimate}, using: {txn['gas']}")
        except Exception as e:
            logger.warning(f"Gas estimation failed: {e}, using default 500000")

        # Sign transaction
        signed_txn = self.account.sign_transaction(txn)

        # Send transaction
        logger.info(f"Sending transaction...")
        tx_hash = self.w3.eth.send_raw_transaction(signed_txn.raw_transaction)
        tx_hash_hex = tx_hash.hex()

        logger.info(f"Transaction sent: {tx_hash_hex}")
        logger.info("Waiting for confirmation...")

        # Wait for receipt (with timeout)
        try:
            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

            if receipt['status'] == 1:
                logger.info(f"✓ Transaction confirmed: {tx_hash_hex}")
                return {
                    'hash': tx_hash_hex,
                    'transactionHash': tx_hash_hex,
                    'status': 'success',
                    'blockNumber': receipt['blockNumber'],
                    'gasUsed': receipt['gasUsed'],
                }
            else:
                raise Exception(f"Transaction failed (status=0): {tx_hash_hex}")

        except Exception as e:
            logger.error(f"Transaction confirmation failed: {e}")
            raise
