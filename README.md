# 🏠 BlockRent: Peer-to-Peer Rental Marketplace

Welcome to BlockRent, a decentralized peer-to-peer rental platform built on the Stacks blockchain! This project tackles real-world challenges in the rental market, such as trust issues, fake identities, payment disputes, and lack of transparency. By leveraging blockchain-verified tenant IDs and smart contracts, BlockRent enables secure, direct rentals between landlords and tenants without intermediaries, reducing fraud and ensuring verifiable accountability.

## ✨ Features

🔑 Blockchain-verified tenant identities to prevent fake IDs and build trust  
🏡 Easy property listings with immutable details  
📅 Secure booking and automated rental agreements  
💰 Escrow-based payments for safe transactions  
⭐ Reputation system with on-chain reviews  
⚖️ Built-in dispute resolution mechanism  
🔒 Insurance claims for property damage  
📊 Transparent audit trails for all interactions  

## 🛠 How It Works

BlockRent uses Clarity smart contracts on the Stacks blockchain to create a trustless ecosystem. Users interact via a simple dApp interface, where tenants prove their identity on-chain, landlords list properties, and all transactions are automated and verifiable.

**For Tenants**  
- Register and verify your ID using the IdentityVerificationContract (e.g., via a hashed government ID or KYC oracle).  
- Browse listings and book via the BookingContract.  
- Pay into escrow using STX or wrapped BTC.  
- After the rental, leave a review to build your reputation.  

**For Landlords**  
- Register properties with details like location, amenities, and pricing in the PropertyRegistryContract.  
- Approve bookings and receive payments from escrow upon successful completion.  
- File disputes or insurance claims if needed.  
- View tenant reputations before approving.  

**Verification and Security**  
- All IDs are hashed and timestamped for privacy and immutability.  
- Disputes are resolved via on-chain voting or arbitration in the DisputeArbitrationContract.  
- The system prevents double-bookings and ensures funds are released only after check-out confirmation.  

That's it! A seamless, fraud-resistant rental experience powered by blockchain.

## 📜 Smart Contracts Overview

BlockRent is composed of 8 interconnected Clarity smart contracts, each handling a specific aspect of the marketplace for modularity and security:

1. **IdentityVerificationContract**: Handles tenant ID registration and verification using hashed proofs (e.g., integrating with oracles for real-world ID checks). Ensures only verified users can book rentals.  
2. **UserRegistryContract**: Manages user profiles for both tenants and landlords, linking verified IDs to wallet addresses and tracking basic info like contact hashes.  
3. **PropertyRegistryContract**: Allows landlords to list and update properties with immutable metadata (e.g., address hash, availability calendar). Prevents unauthorized edits.  
4. **BookingContract**: Creates and manages rental agreements, including dates, terms, and automated status updates (e.g., pending, active, completed).  
5. **PaymentEscrowContract**: Secures deposits and payments in escrow, releasing funds to landlords only after tenant check-out and no disputes. Supports refunds for cancellations.  
6. **ReputationContract**: Tracks ratings and reviews post-rental, calculating on-chain reputation scores to influence future bookings.  
7. **DisputeArbitrationContract**: Enables filing disputes with evidence uploads (hashes), and resolves them via timed voting or oracle inputs.  
8. **InsuranceClaimContract**: Manages optional damage insurance pools, allowing claims with verifiable proofs and automated payouts from a shared fund.  

These contracts interact seamlessly (e.g., BookingContract calls PaymentEscrowContract), ensuring the entire system is decentralized and tamper-proof. Deploy them on Stacks for a fully functional P2P rental marketplace!