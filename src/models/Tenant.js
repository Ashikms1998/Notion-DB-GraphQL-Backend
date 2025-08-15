import mongoose from "mongoose";

const tenantSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true },
  plan: { type: String, enum: ["Free", "Pro"], default: "Free" },
  createdAt: { type: Date, default: Date.now },
});

const Tenant = mongoose.model('Tenant',tenantSchema);

export default Tenant;