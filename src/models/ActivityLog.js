
import mongoose from 'mongoose';

const activityLogSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: {
    type: String,
    required: true,
    enum: [
      'CREATE_DATABASE', 'DELETE_DATABASE','UPDATE_DATABASE',
      'CREATE_FIELD', 'UPDATE_FIELD', 'DELETE_FIELD',
      'CREATE_RECORD', 'UPDATE_RECORD', 'DELETE_RECORD'
    ]
  },
  details: { type: mongoose.Schema.Types.Mixed }, // since it is not always string we have multiple datatypes to save
  createdAt: { type: Date, default: Date.now }
});

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);
export default ActivityLog;