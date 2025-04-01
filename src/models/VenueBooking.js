const mongoose = require('mongoose');

const venueBookingSchema = new mongoose.Schema({
    venue: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Venue',
        required: true
    },
    event: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event',
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
    status: {
        type: String,
        enum: ['temporary', 'confirmed', 'cancelled'],
        default: 'temporary'
    }
}, { timestamps: true });

module.exports = mongoose.model('VenueBooking', venueBookingSchema);