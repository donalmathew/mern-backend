const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true
    },
    startDateTime: {
        type: Date,
        required: true
    },
    endDateTime: {
        type: Date,
        required: true
    },
    venue: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Venue',
        required: true
    },
    budget: {
        type: Number,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    expectedParticipants: {
        type: Number,
        required: true
    },
    requiredResources: [{
        type: String
    }],
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'needs_modification', 'cancelled'],
        default: 'pending'
    },
    venueBookingStatus: {
        type: String,
        enum: ['pending', 'temporary', 'confirmed', 'cancelled'],
        default: 'pending'
    },
    approvalChain: [{
        organization: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Organization'
        },
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected', 'needs_modification']
        },
        comments: String,
        timestamp: {
            type: Date,
            default: Date.now
        }
    }],
    modificationHistory: [{
        modifiedAt: {
            type: Date,
            default: Date.now
        },
        comments: String,
        requestedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Organization'
        }
    }]
}, { timestamps: true });

module.exports = mongoose.model('Event', eventSchema);