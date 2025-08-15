import mongoose from 'mongoose'

const userSchema = new mongoose.Schema({

    tenantId: {
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Tenant', 
        required: true, 
        index: true 
    },

    username:{
        type:String,
        required:true,
        unique:true
    },
    email:{
        type:String,
        required:true,
        unique:true
    },
    password:{
        type:String,
        required:true
    },
    role: {
        type: String,
        enum: ['Admin', 'Editor','Viewer'],
        default: 'Viewer',
        index:true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
    }
)

//Ensures no two users in the same tenant have the same email or username.

userSchema.index({ tenantId: 1, email: 1 }, { unique: true });
userSchema.index({ tenantId: 1, username: 1 }, { unique: true });

const User = mongoose.model('User',userSchema);

export default User;