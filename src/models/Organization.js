const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    orgId: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    parentOrganization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        default: null
    },
    level: {
        type: Number,
        //required: true  // 0 for admin/venue manager, 1 for College, 2+ for child orgs
    },
    isVenueManager: {
        type: Boolean,
        default: false  // true only for level 0 org
    }
}, { timestamps: true });

// Add a pre-save hook to automatically calculate the level based on parent
organizationSchema.pre('save', async function(next) {
    try {
        if (this.isNew || this.isModified('parentOrganization')) {
            if (!this.parentOrganization) {
                // Root organization (level 0)
                this.level = 0;
                this.isVenueManager = true;
            } else {
                const parent = await this.constructor.findById(this.parentOrganization);
                if (!parent) {
                    return next(new Error('Parent organization not found'));
                }
                this.level = parent.level + 1;
                
                // Only level 0 can be venue manager
                if (this.level > 0) {
                    this.isVenueManager = false;
                }
            }
        }
        next();
    } catch (error) {
        console.error('Error in Organization pre-save hook:', error);
        next(error);
    }
});

module.exports = mongoose.model('Organization', organizationSchema);