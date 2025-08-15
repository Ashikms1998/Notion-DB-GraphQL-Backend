import mongoose from "mongoose";

const recordSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  databaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'DatabaseDefinition', required: true, index: true },
  values: { type: Map, of: mongoose.Schema.Types.Mixed },
  isDeleted: { type: Boolean, default: false, index: true },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now, index: true }
});

//indexed these values for easy lookup pourposes so easily be able to find which have these two

recordSchema.index({ tenantId: 1, databaseId: 1 });


const Record = mongoose.model('Record',recordSchema);

export default Record;