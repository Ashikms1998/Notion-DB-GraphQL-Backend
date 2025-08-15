import mongoose from "mongoose";

const databaseDefinitionSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  name: { type: String, required: true, trim: true },
  fields: [
    {
      name: { type: String, required: true }, 
      type: { type: String, enum: ['text','number','date','boolean','select','multi-select','relation'], required: true },
      options: [String],                               
      relation: { type: mongoose.Schema.Types.ObjectId, ref: 'DatabaseDefinition' }
    }
  ],
  isDeleted: { type: Boolean, default: false, index: true },
  createdAt: { type: Date, default: Date.now }
});

//Prevents two databases with the same name inside the same tenant.
//You could accidentally create multiple databases with the same name for the same tenant, which makes UI and logic confusing.

databaseDefinitionSchema.index({ tenantId: 1, name: 1 }, { unique: true });

const DatabaseDefinition = mongoose.model('DatabaseDefinition',databaseDefinitionSchema);

export default DatabaseDefinition;