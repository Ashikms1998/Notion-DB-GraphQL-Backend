import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Tenant from "../models/Tenant.js";
import { UserInputError } from "apollo-server-express";
import { AuthenticationError, ForbiddenError } from "apollo-server-express";
import DatabaseDefinition from "../models/databaseDefinition.js";
import Record from "../models/Record.js";
import mongoose from "mongoose";
import ActivityLog from "../models/ActivityLog.js";

const resolvers = {
  Query: {
    hello: () => "Hello, world! Your GraphQL API is working.",

    databases: async (_, __, context) => {
      if (!context.user) {
        throw new AuthenticationError(
          "You must be logged in to view databases."
        );
      }

      // Find all databases that match the tenantId from the user's token.
      const userDatabases = await DatabaseDefinition.find({
        tenantId: context.user.tenantId,
        isDeleted: false,
      });

      return userDatabases;
    },

    // Resolver for fetching a single database
    database: async (_, { id }, context) => {
      if (!context.user) {
        throw new AuthenticationError(
          "You must be logged in to view a database."
        );
      }

      // Find a single database that matches BOTH the provided ID AND the user's tenantId.
      const singleDatabase = await DatabaseDefinition.findOne({
        _id: id,
        tenantId: context.user.tenantId, // This prevents users from seeing other tenants' data
        isDeleted: false,
      });

      if (!singleDatabase) {
        throw new Error(
          "Database not found or you don't have permission to view it."
        );
      }

      return singleDatabase;
    },

    records: async (
      _,
      { databaseId, filter, sort, page, limit, search },
      context
    ) => {
      if (!context.user)
        throw new AuthenticationError("You must be logged in.");

      // We now start with an empty aggregation pipeline array.

      const pipeline = [];

      //Match documents securely. This is our base filter.

      pipeline.push({
        $match: {
          databaseId: new mongoose.Types.ObjectId(databaseId),
          tenantId: context.user.tenantId,
          isDeleted: false,
        },
      });

      //Keyword Search (if provided)

      if (search) {
        // First, find the database definition to identify which fields are text-based.
        const dbDefinition = await DatabaseDefinition.findById(databaseId);
        if (dbDefinition) {
          const textFields = dbDefinition.fields
            .filter((field) => field.type === "text")
            .map((field) => field.name);

          if (textFields.length > 0) {
            // Create an $or condition to search across all text fields.
            const searchOrConditions = textFields.map((fieldName) => ({
              [`values.${fieldName}`]: { $regex: search, $options: "i" },
            }));

            pipeline.push({ $match: { $or: searchOrConditions } });
          }
        }
      }

      // --- ADD NEW FILTER STAGES ---

      //Add user's filter conditions, if they exist.
      // We add another $match stage for the user's custom filter.
      if (filter) {
        const filterQuery = {};
        for (const [fieldName, condition] of Object.entries(filter)) {
          filterQuery[`values.${fieldName}`] = condition;
        }
        pipeline.push({ $match: filterQuery });
      }

      if (sort) {
        const sortOrder = sort.order.toLowerCase() === "desc" ? -1 : 1;
        pipeline.push({
          $sort: {
            [`values.${sort.field}`]: sortOrder,
          },
        });
      }

      // --- ADD NEW PAGINATION STAGES ---

      // Set default values for pagination
      const pageNum = page && page > 0 ? page : 1;
      const limitNum = limit && limit > 0 ? limit : 20; // Default limit of 20 records
      const skipNum = (pageNum - 1) * limitNum;

      //Skip documents for previous pages
      pipeline.push({ $skip: skipNum });

      //Limit the number of documents for the current page
      pipeline.push({ $limit: limitNum });

      // Execute the entire aggregation pipeline.
      const recordsFromDB = await Record.aggregate(pipeline);

      //Format the results. The output of .aggregate() is a plain JS object,
      const formattedRecords = recordsFromDB.map((record) => ({
        ...record,
        values: Array.from(Object.entries(record.values || {})).map(
          ([field, value]) => ({
            field,
            value,
          })
        ),
      }));

      return formattedRecords;
    },
    record: async (_, { id }, context) => {
      if (!context.user)
        throw new AuthenticationError("You must be logged in.");

      // 1. Fetch the raw record from the database
      const recordFromDB = await Record.findOne({
        _id: id,
        tenantId: context.user.tenantId,
      });

      if (!recordFromDB) {
        return null; // Or throw an error
      }

      // 2. Manually format the single record to match the GraphQL schema shape
      const formattedRecord = {
        ...recordFromDB.toObject(),
        values: Array.from(recordFromDB.values.entries()).map(
          ([field, value]) => ({
            field,
            value,
          })
        ),
      };

      return formattedRecord;
    },

    activityLogs: async (_, { limit, page }, context) => {
      if (!context.user)
        throw new AuthenticationError("You must be logged in.");

      //Pagination Logic
      const pageNum = page && page > 0 ? page : 1;
      const limitNum = limit && limit > 0 ? limit : 25;
      const skipNum = (pageNum - 1) * limitNum;

      //Fetch logs for the current tenant only, sorted by most recent first
      const logs = await ActivityLog.find({ tenantId: context.user.tenantId })
        .sort({ createdAt: -1 })
        .skip(skipNum)
        .limit(limitNum);

      return logs;
    },
  },

  Mutation: {
    login: async (_, { email, password }) => {
      const user = await User.findOne({ email });
      if (!user) {
        throw new UserInputError("Invalid Credentials");
      }
      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        throw new UserInputError("Invalid credentials");
      }

      const token = jwt.sign(
        { id: user._id, role: user.role, tenantId: user.tenantId },
        process.env.JWT_SECRET,
        { expiresIn: "1d" }
      );

      return {
        token,
        user,
      };
    },

    signup: async (_, { username, email, password }) => {
      if (!username || !email || !password) {
        throw new UserInputError(
          "Please provide username, email, and password."
        );
      }

      const existingUser = await User.findOne({ email });
      if (existingUser) {
        throw new UserInputError("User with this email already exists.");
      }

      // Create a new Tenant for the user.
      // Every new signup creates a new isolated workspace.

      const newTenant = new Tenant({ name: `${username}'s Workspace` });
      await newTenant.save();

      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Create the new user and assign them to the new tenant as an Admin.
      const newUser = new User({
        username,
        email,
        password: hashedPassword,
        tenantId: newTenant._id,
        role: "Admin", // The first user of a tenant is always an Admin
      });
      await newUser.save();

      const token = jwt.sign(
        { id: newUser._id, role: newUser.role, tenantId: newUser.tenantId },
        process.env.JWT_SECRET,
        { expiresIn: "1d" }
      );

      return {
        token,
        user: newUser,
      };
    },

    createDatabase: async (_, { name }, context) => {
      if (!context.user) {
        throw new AuthenticationError(
          "You must be logged in to create a database."
        );
      }

      if (context.user.role !== "Admin") {
        throw new ForbiddenError(
          "You are not authorized to perform this action. Admin role required."
        );
      }

      if (!name || name.trim() === "") {
        throw new UserInputError("Database name cannot be empty.");
      }

      //The Core Logic to create the database
      try {
        const newDatabase = new DatabaseDefinition({
          name: name,
          tenantId: context.user.tenantId,
          fields: [],
        });

        await newDatabase.save();

        // --- ADDING LOGGING STEP ---

        await ActivityLog.create({
          tenantId: context.user.tenantId,
          userId: context.user._id,
          action: "CREATE_DATABASE",
          details: {
            databaseId: newDatabase._id,
            databaseName: newDatabase.name,
          },
        });

        return newDatabase;
      } catch (error) {
        if (error.code === 11000) {
          throw new UserInputError(
            "A database with this name already exists in your tenant."
          );
        }
        throw new Error("An error occurred while creating the database.");
      }
    },

    updateDatabase: async (_, { id, name }, context) => {
      if (!context.user) {
        throw new AuthenticationError("You must be logged in.");
      }
      if (context.user.role !== "Admin") {
        throw new ForbiddenError(
          "You are not authorized to perform this action."
        );
      }

      if (!name || name.trim() === "") {
        throw new UserInputError("Database name cannot be empty.");
      }

      try {
        // Here is the critical security step. We build a query that looks for a document
        // matching BOTH the database ID AND the user's tenantId from the token.
        const updatedDatabase = await DatabaseDefinition.findOneAndUpdate(
          { _id: id, tenantId: context.user.tenantId }, // QUERY: Find a DB with this ID that I OWN.
          { $set: { name: name } },
          { new: true }
        );

        if (!updatedDatabase) {
          throw new Error(
            "Database not found or you don't have permission to modify it."
          );
        }
        // --- ADDING LOGGING STEP ---

        await ActivityLog.create({
          tenantId: context.user.tenantId,
          userId: context.user._id,
          action: "UPDATE_DATABASE",
          details: {
            databaseId: updatedDatabase._id,
            databaseName: updatedDatabase.name,
          },
        });

        return updatedDatabase;
      } catch (error) {
        if (error.code === 11000) {
          throw new UserInputError(
            "Another database with this name already exists in your tenant."
          );
        }

        throw error;
      }
    },
    deleteDatabase: async (_, { id }, context) => {
      if (!context.user) {
        throw new AuthenticationError("You must be logged in.");
      }
      if (context.user.role !== "Admin") {
        throw new ForbiddenError(
          "You are not authorized to perform this action."
        );
      }

      // The Core Logic: Find and "update" to soft delete
      // We use findOneAndUpdate to set the isDeleted flag to true.
      const deletedDatabase = await DatabaseDefinition.findOneAndUpdate(
        { _id: id, tenantId: context.user.tenantId },
        { $set: { isDeleted: true } }
      );

      if (!deletedDatabase) {
        throw new Error(
          "Database not found or you don't have permission to delete it."
        );
      }

      // --- ADDING LOGGING STEP ---

      await ActivityLog.create({
        tenantId: context.user.tenantId,
        userId: context.user._id,
        action: "DELETE_DATABASE",
        details: {
          databaseId: deletedDatabase._id,
          databaseName: deletedDatabase.name,
        },
      });

      return true;
    },

    createField: async (_, { databaseId, field }, context) => {
      if (!context.user) {
        throw new AuthenticationError("You must be logged in.");
      }
      if (context.user.role !== "Admin") {
        throw new ForbiddenError(
          "You are not authorized to modify database schemas."
        );
      }

      // 2. Find the parent database
      const database = await DatabaseDefinition.findOne({
        _id: databaseId,
        tenantId: context.user.tenantId,
      });
      // Check if the database exists AND if its tenantId matches the user's tenantId.

      if (!database) {
        throw new ForbiddenError(
          "Database not found or you don't have permission to modify it."
        );
      }

      //Check for duplicate field names within this database
      const fieldExists = database.fields.some(
        (f) => f.name.toLowerCase() === field.name.toLowerCase()
      );
      if (fieldExists) {
        throw new UserInputError(
          `A field named "${field.name}" already exists in this database.`
        );
      }

      //The Core Logic: Add the new field to the array
      // Mongoose subdocuments are automatically assigned an _id.
      database.fields.push(field);

      await database.save();

      // --- ADDING LOGGING STEP ---

      await ActivityLog.create({
        tenantId: context.user.tenantId,
        userId: context.user._id,
        action: "CREATE_FIELD",
        details: { databaseId: database._id, databaseName: database.name },
      });

      return database;
    },

    updateField: async (_, { databaseId, fieldId, field }, context) => {
      if (!context.user)
        throw new AuthenticationError("You must be logged in.");
      if (context.user.role !== "Admin")
        throw new ForbiddenError("You are not authorized to modify schemas.");

      const database = await DatabaseDefinition.findOne({
        _id: databaseId,
        tenantId: context.user.tenantId,
      });

      if (!database) {
        throw new ForbiddenError(
          "Database not found or you don't have permission to modify it."
        );
      }

      // Find the specific field within the 'fields' array

      const fieldToUpdate = database.fields.id(fieldId);

      if (!fieldToUpdate) {
        throw new UserInputError("Field not found in this database.");
      }

      const otherFieldExists = database.fields.some(
        (f) =>
          f.name.toLowerCase() === field.name.toLowerCase() &&
          f._id.toString() !== fieldId
      );
      if (otherFieldExists) {
        throw new UserInputError(
          `Another field named "${field.name}" already exists in this database.`
        );
      }

      fieldToUpdate.set(field);

      await database.save();
      // --- ADDING LOGGING STEP ---

      await ActivityLog.create({
        tenantId: context.user.tenantId,
        userId: context.user._id,
        action: "UPDATE_FIELD",
        details: { databaseId: database._id, databaseName: database.name },
      });
      return database;
    },

    deleteField: async (_, { databaseId, fieldId }, context) => {
      if (!context.user)
        throw new AuthenticationError("You must be logged in.");
      if (context.user.role !== "Admin")
        throw new ForbiddenError("You are not authorized to modify schemas.");

      //Find the parent database securely
      const database = await DatabaseDefinition.findOne({
        _id: databaseId,
        tenantId: context.user.tenantId,
      });

      if (!database) {
        throw new ForbiddenError(
          "Database not found or you don't have permission to modify it."
        );
      }

      // Find the field to remove
      const fieldToRemove = database.fields.id(fieldId);
      if (!fieldToRemove) {
        throw new UserInputError("Field not found in this database.");
      }

      // Remove the sub-document from the array
      fieldToRemove.remove();

      // Save the parent document
      await database.save();
      // --- ADDING LOGGING STEP ---

      await ActivityLog.create({
        tenantId: context.user.tenantId,
        userId: context.user._id,
        action: "DELETE_FIELD",
        details: { databaseId: database._id, databaseName: database.name },
      });
      return database;
    },

    createRecord: async (_, { databaseId, values }, context) => {
      if (!context.user)
        throw new AuthenticationError("You must be logged in.");
      if (!["Editor", "Admin"].includes(context.user.role)) {
        throw new ForbiddenError("You are not authorized to create records.");
      }

      const database = await DatabaseDefinition.findOne({
        _id: databaseId,
        tenantId: context.user.tenantId,
      });
      if (!database) {
        throw new ForbiddenError(
          "Database not found or you don't have permission."
        );
      }

      //Validate incoming values against the database's field schema
      const validatedValues = new Map();
      for (const field of database.fields) {
        const providedValue = values[field.name];

        if (providedValue !== undefined) {
          validatedValues.set(field.name, providedValue);
        }
      }

      //Create and save the new record
      const newRecord = new Record({
        databaseId,
        tenantId: context.user.tenantId,
        values: validatedValues,
      });

      await newRecord.save();

      // --- ADDING LOGGING STEP ---

      await ActivityLog.create({
        tenantId: context.user.tenantId,
        userId: context.user._id,
        action: "CREATE_RECORD",
        details: { databaseId: databaseId, recordId: newRecord._id },
      });

      // We need to format the response to match the GraphQL Record type
      // Mongoose Map needs to be converted to an array of objects
      const formattedRecord = {
        ...newRecord.toObject(),
        values: Array.from(newRecord.values.entries()).map(
          ([field, value]) => ({ field, value })
        ),
      };

      return formattedRecord;
    },

    updateRecord: async (_, { id, values }, context) => {
      // 1. Authentication & Authorization
      if (!context.user)
        throw new AuthenticationError("You must be logged in.");
      if (!["Editor", "Admin"].includes(context.user.role)) {
        throw new ForbiddenError("You are not authorized to edit records.");
      }

      // 2. Find the record securely, ensuring it belongs to the user's tenant
      const record = await Record.findOne({
        _id: id,
        tenantId: context.user.tenantId,
      });

      if (!record) {
        throw new UserInputError(
          "Record not found or you don't have permission."
        );
      }

      // We could add validation here against the DatabaseDefinition, but for now we'll keep it simple

      // 3. Apply the new values to the record's Map
      for (const [key, value] of Object.entries(values)) {
        record.values.set(key, value);
      }

      // 4. Update the 'updatedAt' timestamp
      record.updatedAt = new Date();

      // 5. Save the updated record
      await record.save();

      // --- ADDING LOGGING STEP ---

      await ActivityLog.create({
        tenantId: context.user.tenantId,
        userId: context.user._id,
        action: "UPDATE_RECORD",
        details: { recordId: record._id },
      });

      // 6. Format the response to match the GraphQL schema
      const formattedRecord = {
        ...record.toObject(),
        values: Array.from(record.values.entries()).map(([field, value]) => ({
          field,
          value,
        })),
      };

      return formattedRecord;
    },

    deleteRecord: async (_, { id }, context) => {
      if (!context.user)
        throw new AuthenticationError("You must be logged in.");
      if (!["Editor", "Admin"].includes(context.user.role)) {
        throw new ForbiddenError("You are not authorized to delete records.");
      }

      //Find the record and update it to be soft-deleted
      const result = await Record.findOneAndUpdate(
        { _id: id, tenantId: context.user.tenantId },
        { $set: { isDeleted: true, updatedAt: new Date() } }
      );

      //Check if the operation found a document to "delete"
      if (!result) {
        throw new UserInputError(
          "Record not found or you don't have permission."
        );
      }

      // --- ADDING LOGGING STEP ---

      await ActivityLog.create({
        tenantId: context.user.tenantId,
        userId: context.user._id,
        action: "DELETE_RECORD",
        details: { recordId: result._id, databaseId: result.databaseId },
      });

      return true;
    },
  },
};

export default resolvers;
