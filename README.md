# Oakbridge E-Reader Server

A robust, enterprise-grade backend built with TypeScript, Node.js, Express, Drizzle ORM, and PostgreSQL. It powers authentication, subscription verification, digital bookstore transactions, reading progress state synchronizations, and secure DRM key distribution.

## Core Services & APIs

- **Secure DRM Key Exchange:** Protects copyrighted manuscripts by generating temporary decryption key sets (AES keys and initialization vectors) matching authenticated user accounts.
- **Cart & Bookmark Management:** Implements transactional bookstore shopping carts and "Save for Later" bookmark structures synced directly to the PostgreSQL database.
- **Drizzle DB Migrations:** Provides schemas, type-safe database queries, and versioned migration files for schema evolution.
- **Redis Cache Integration:** Integrates Redis database caching for performance-critical resources and rate-limiting features.
- **Educational Institution Management:** Supports multi-tenant school/university license configurations, user registration limits, and resource tracking.
- **Secure File Download Stream:** Decrypts/serves files on-the-fly to verified subscribers.

## Tech Stack

- **Runtime:** Node.js (TypeScript)
- **Framework:** Express.js
- **Database ORM:** Drizzle ORM (PostgreSQL driver)
- **Caching & Session:** Redis
- **Security & Tokens:** JSON Web Tokens (JWT) + Cryptographic AES layers

## Setup & Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+ recommended)
- [PostgreSQL](https://www.postgresql.org/) database server running
- [Redis](https://redis.io/) server running

### Configuration

Create a `.env.development` file in the root directory (referencing `.env.example` if available) and define the following variables:

```env
PORT=8000
DATABASE_URL=postgresql://username:password@localhost:5432/oakbridge_db
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_jwt_secret_key
ENCRYPTION_KEY=your_manuscript_aes_key
```

### Installation

```bash
# Clone the repository and navigate to server folder
cd oakbridge-e-reader-server

# Install dependencies
npm install
```

### Database Migrations

Use Drizzle kit commands to generate and push schemas to your PostgreSQL server:

```bash
# Push schema updates directly to the database
npx drizzle-kit push
```

### Running Locally

```bash
# Run the development server with automatic file reload (tsx watch)
npm run dev
```

### Building for Production

```bash
# Compile TypeScript files to JavaScript inside the dist/ folder
npm run build
```
You can start the production build with:
```bash
npm run start
```
