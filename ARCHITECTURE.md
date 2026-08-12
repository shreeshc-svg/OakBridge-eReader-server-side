# Server Architecture Reference

This document outlines the internal structure, services, and security measures implemented in the Oakbridge E-Reader backend server.

---

## 1. Directory Structure

The server is built with a clean modular structure where each business concern (auth, books, cart, reader) has its own routes, controllers, and services:

```
src/
├── config/             # Config files, server env schemas, database connection parameters
├── db/                 # Drizzle schemas, migrations configuration, seed files
├── middlewares/        # Custom Express middlewares (JWT authentication, role guards)
├── modules/            # Core feature modules (Routes, Controllers, Services)
│   ├── auth/           # Login, sign-up, session validation APIs
│   ├── books/          # Book listings, details, download endpoints
│   ├── cart/           # Shopping cart and "Save for Later" business logic
│   ├── categories/     # Category listing and indexing controllers
│   ├── dashboard/      # Profile management, password reset routes
│   ├── institution/    # License validation, tenant quotas, domain white-lists
│   ├── library/        # Reading status history, started books trackers
│   ├── notifications/  # User messages, system alerts
│   ├── payments/       # Subscription plans, initiatePayment webhook validation
│   ├── reader/         # Page highlights, note persistence, bookmark CRUD API
│   ├── reviews/        # User reviews, ratings aggregate
│   ├── settings/       # Global toggles (e.g., disable_right_click permission)
│   └── superadmin/     # System admin metrics, user approval flows
├── utils/              # Crypto helper suites, logger formatters
└── server.ts           # Express application initialization and startup
```

---

## 2. Request Lifecycle

The server processes API requests using a structured middleware chain:

```
Request ---> [ CORS / Helmet ] ---> [ Rate Limiter ] ---> [ Auth Middleware ] ---> [ Controller ] ---> Response
                                                                |
                                                      (Validates JWT token,
                                                       attaches User model)
```

1. **Global Guards:** Sets HTTP headers (Helmet), checks CORS definitions, and processes request parameters.
2. **Auth Guard (`auth_middleware`):** Verifies the `Authorization: Bearer <JWT>` header, decodes the user identity, checks user permissions (e.g., role checks), and injects `req.user` into the pipeline.
3. **Controller Execution:** Delegates request parameters to the corresponding module controller.
4. **Service Layer:** Executes database transactions or calls external APIs.

---

## 3. Database Schema & Drizzle ORM

The server uses **PostgreSQL** configured via **Drizzle ORM** for type safety and fast execution:

```
   +-------------------+           +-------------------+
   |      users        |           |      books        |
   +-------------------+           +-------------------+
             |                               |
             | 1                             | 1
             +-------------+   +-------------+
                           |   |
                           v   v
                   +-------------------+
                   |    cart_items     |
                   | (saved_for_later) |
                   +-------------------+
```

- **Unified Cart Table (`cart_items`):** Tracks both active items (pending checkout) and bookmarked items (saved for later). Rows use an enum state (`'active' | 'saved_for_later'`) to toggle display modes inside the bookstore interface, reducing schema complexity.
- **Relational Integrity:** Drizzle schema relationships map direct foreign key constraints across tables (e.g., users, books, cart items, reader highlights, progress rows), ensuring cascaded cleanups when accounts are pruned.

---

## 4. DRM Security & Encryption Pipeline

To guarantee document security, the backend never serves plain PDF files. All manuscripts are encrypted at rest:

```
[Encrypted PDF File]
         |
         | (Admin uploads file)
         v
[AES-256-CBC Encryption] ---> Saved to disk/bucket
                                  |
                                  | (Client requests reading buffer)
                                  v
[Authorization & Subscription Verification] ---> Decrypts key ---> Serves encrypted file + DRM key set to Client
```

- **DRM Key Distribution:** When a client opens a book, it requests the DRM keys (`/books/drm-key?id=`). The server checks if the user has an active license (subscription or book purchase), and returns the key and initialization vector (IV) wrapped inside a secure, short-lived payload.
- **Decryption Offloading:** The server streams the encrypted binary file to the client. The actual decryption is performed entirely on the client side inside a secure worker context, reducing server CPU overhead and protecting network traffic.
- **Settings Sync:** Security settings (e.g., `disable_right_click`) are managed from the backend database settings table and synced on-demand to enforce copy protection dynamically across different user roles.
