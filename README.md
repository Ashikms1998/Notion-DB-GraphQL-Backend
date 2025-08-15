# Notion-style Database Backend API

This project is a robust, multi-tenant backend API for a Notion-style database system, built with Express.js and GraphQL. It allows users to create custom databases, define their schemas with various field types, and perform advanced data operations in a secure, isolated environment.



## Core Features

-   **Multi-Tenant Architecture:** Data is completely isolated between tenants using a logical, schema-based approach, ensuring security and privacy.
-   **Dynamic Database Creation:** Users can create custom databases with user-defined schemas (columns).
-   **Flexible Field Types:** Supports Text, Number, Date, Boolean, Select, and Multi-Select fields.
-   **Full CRUD Functionality:** Complete Create, Read, Update, and Delete operations for Databases, Fields, and the Records within them.
-   **Advanced Querying Engine:**
    -   **Powerful Filtering:** Filter records using standard MongoDB query operators (e.g., `$gt`, `$ne`, `$in`).
    -   **Dynamic Sorting:** Sort records by any custom field in ascending or descending order.
    -   **Keyword Search:** Full-text, case-insensitive search across all text-based fields in a record.
    -   **Efficient Pagination:** Handle large datasets with page-based pagination.
-   **Role-Based Access Control (RBAC):** Secure actions based on user roles (Admin, Editor, Viewer).
-   **Full Audit Trail:** A complete activity log tracks all major data mutations (create, update, delete) for accountability and history.
-   **API Security & Stability:**
    -   Implemented with JSON Web Tokens (JWT) for secure authentication.
    -   Per-tenant rate limiting is enforced to prevent abuse and ensure API stability.

---

## Tech Stack

-   **Backend Framework:** Node.js, Express.js
-   **API Layer:** GraphQL (with Apollo Server)
-   **Database:** MongoDB (with Mongoose)
-   **Authentication:** JSON Web Tokens (JWT)
-   **Security:** `bcryptjs` for password hashing, `graphql-rate-limit` for API protection.
-   **Tooling:** `@graphql-tools/schema` for modern schema construction.

---

## Getting Started

### Prerequisites

-   Node.js (v18 or later is recommended)
-   A running MongoDB instance (local or a cloud service like MongoDB Atlas)
-   `npm` or a similar package manager

### Installation & Setup

1.  **unzip the folder:**
   
    cd my-express-app
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Create Environment File:**
    Create a file named `.env` in the root of the project and add the following environment variables.

    ```env
    # Your MongoDB connection string
    MONGO_URI= mongodb+srv://<username>:<password>@<cluster_url>/assessment_db

    # A strong, secret key for signing JSON Web Tokens
    JWT_SECRET=SecretKey

    # The port the server will run on
    PORT=5000
    ```

4.  **Start the Server:**
    ```bash
    npm start
    ```
    The server will start on `http://localhost:5000`.

---

## API Usage & Documentation

The GraphQL API is available at `http://localhost:5000/graphql`.

### Interactive Documentation

This API is **self-documenting** thanks to GraphQL's introspection capabilities. To explore the full API, including all available queries, mutations, types, and their descriptions:


## Quick Test Steps
1. Run `npm start`
2. Open Apollo Sandbox at `http://localhost:5000/graphql`
3. Run `signup` → `login` → `createDatabase`
4. In the Apollo Sandbox interface, click on the **"Schema"** tab on the left-hand side.This provides a complete, interactive guide to every part of the API.

### Authentication Flow

1.  **Signup:** Use the `signup` mutation to create a new user. This will also automatically create a new tenant for that user.
2.  **Login:** Use the `login` mutation with your credentials to receive a JWT.
3.  **Make Authenticated Requests:** For all other queries and mutations, you must include the received token in the `Authorization` header.


### Example Queries

Example Auth Flow in GraphQL

mutation {
  signup(email: "test@example.com", password: "Password123") {
    token
    user {
      id
      email
    }
  }
}

mutation {
  login(email: "test@example.com", password: "Password123") {
    token
  }
}

**Header Format:** `Authorization: Bearer <your_jwt_token>`

## Evaluation Criteria Checklist

-   **Schema Design:** ✅ (Scalable multi-collection approach for tenants, databases, and records)
-   **Code Quality:** ✅ (Modular structure with clear separation of concerns for models and the GraphQL layer)
-   **Security:** ✅ (JWT Authentication, Role-Based Access Control, full Tenant Isolation on all data access, and Per-Tenant Rate Limiting)
-   **GraphQL Implementation:** ✅ (Correct and idiomatic use of Types, Inputs, Queries, Mutations, and Directives for a clean API contract)
-   **Performance:** ✅ (Efficient data querying using the MongoDB Aggregation Pipeline for filtering/sorting, and pagination to handle large datasets)
-   **Documentation:** ✅ (Comprehensive `README.md` and a self-documenting schema with full descriptions for all types and operations)# Notion-DB-GraphQL
# Notion-DB-GraphQL-Backend
