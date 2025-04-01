const mongoose = require('mongoose');

const venueSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    capacity: {
        type: Number,
        required: true
    },
    features: [{
        type: String  // ['projector', 'audio_system', etc.]
    }],
    isAvailable: {
        type: Boolean,
        default: true
    }
});

module.exports = mongoose.model('Venue', venueSchema);