import express from "express";
import dotenv from "dotenv";
import mongoose, { Schema } from "mongoose";
import cors from "cors";
import { ApolloServer } from "apollo-server-express";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import User from "./models/User.js";
import jwt from "jsonwebtoken";
import resolvers from "./graphql/resolvers.js";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { mapSchema, getDirective, MapperKind } from "@graphql-tools/utils";
import { createRateLimitRule } from "graphql-rate-limit";

dotenv.config();

//Create the rate limit rule instance
// This is more direct. It creates a rule we can apply manually.

const rateLimitRule = createRateLimitRule({
  identify: (context) =>
    context.user ? context.user.tenantId.toString() : context.req.ip,
});

const app = express();

const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected!"))
  .catch((err) => {
    console.error("MongoDB connection error:", err);
  });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const typeDefs = readFileSync(
  path.join(__dirname, "graphql", "schema.graphql"),
  "utf-8"
);

async function startServer() {
  //Build the schema with the transformation ---
  let schema = makeExecutableSchema({ typeDefs, resolvers });

  // This is the new, correct way to apply the directive's logic
  schema = mapSchema(schema, {
    [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
      const rateLimitDirective = getDirective(
        schema,
        fieldConfig,
        "rateLimit"
      )?.[0];
      if (rateLimitDirective) {
        const { max, window } = rateLimitDirective;
        // This is the key part: we create a specific rule for this field
        const rule = rateLimitRule({ max, window });
        // And then we "wrap" the original resolver with our rate limit logic
        fieldConfig.resolve = rule(fieldConfig.resolve);
      }
      return fieldConfig;
    },
  });

  const server = new ApolloServer({
    schema,

    context: async ({ req }) => {
      let token;
      if (
        req.headers.authorization &&
        req.headers.authorization.startsWith("Bearer")
      ) {
        token = req.headers.authorization.split(" ")[1];
      }
      if (!token) {
        return {};
      }

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const currentUser = await User.findById(decoded.id).select("-password");

        // Attach the user to the context object
        // Now, every resolver can access `context.user`
        return { user: currentUser };
      } catch (error) {
        // If the token is invalid or expired, they are not authenticated.
        console.error("Invalid token:", error.message);
        return {};
      }
    },
  });

  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  await server.start();
  server.applyMiddleware({ app });

  app.get("/", (req, res) => {
    res.send("Hello World, GraphQL endpoint is at /graphql");
  });

  app.use((req, res, next) => {
    const error = new Error(`Not Found - ${req.originalUrl}`);
    res.status(404);
    next(error);
  });

  app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(statusCode).json({
      success: false,
      statusCode,
      message,
    });
  });

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(
      `GraphQL endpoint ready at http://localhost:${PORT}${server.graphqlPath}`
    );
  });
}
startServer();
