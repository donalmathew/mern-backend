const express = require('express');
const router = express.Router();
const Venue = require('../models/Venue');
const VenueBooking = require('../models/VenueBooking');
const auth = require('../middleware/auth');

// Middleware to check if user is a venue manager
const isVenueManager = (req, res, next) => {
    if (!req.organization.isVenueManager) {
        return res.status(403).json({ message: 'Only venue managers can perform this action' });
    }
    next();
};

// Create a new venue (only venue manager)
router.post('/', auth, isVenueManager, async (req, res) => {
    try {
        const { name, capacity, features } = req.body;
        
        // Validate required fields
        if (!name || !capacity) {
            return res.status(400).json({ 
                message: 'Name and capacity are required fields' 
            });
        }
        
        // Validate capacity is a positive number
        if (isNaN(capacity) || capacity <= 0) {
            return res.status(400).json({ 
                message: 'Capacity must be a positive number' 
            });
        }
        
        // Check if venue with same name already exists
        const existingVenue = await Venue.findOne({ name });
        if (existingVenue) {
            return res.status(400).json({ 
                message: 'A venue with this name already exists' 
            });
        }
        
        const venue = new Venue({
            name,
            capacity,
            features: features || []
        });
        
        await venue.save();
        res.status(201).json(venue);
    } catch (error) {
        console.error('Error creating venue:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get all venues (accessible to all)
router.get('/', auth, async (req, res) => {
    try {
        const venues = await Venue.find();
        res.json(venues);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get venue by ID (accessible to all)
router.get('/:id', auth, async (req, res) => {
    try {
        const venue = await Venue.findById(req.params.id);
        
        if (!venue) {
            return res.status(404).json({ message: 'Venue not found' });
        }
        
        res.json(venue);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Update venue (only venue manager)
router.put('/:id', auth, isVenueManager, async (req, res) => {
    try {
        const { name, capacity, features, isAvailable } = req.body;
        const updates = {};
        
        if (name) updates.name = name;
        if (capacity) updates.capacity = capacity;
        if (features) updates.features = features;
        if (isAvailable !== undefined) updates.isAvailable = isAvailable;
        
        const venue = await Venue.findByIdAndUpdate(
            req.params.id,
            updates,
            { new: true }
        );
        
        if (!venue) {
            return res.status(404).json({ message: 'Venue not found' });
        }
        
        res.json(venue);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Delete venue (only venue manager)
router.delete('/:id', auth, isVenueManager, async (req, res) => {
    try {
        // Check if venue has any bookings
        const bookings = await VenueBooking.find({ 
            venue: req.params.id,
            status: { $in: ['temporary', 'confirmed'] }
        });
        
        if (bookings.length > 0) {
            return res.status(400).json({ 
                message: 'Cannot delete venue with active bookings' 
            });
        }
        
        const venue = await Venue.findByIdAndDelete(req.params.id);
        
        if (!venue) {
            return res.status(404).json({ message: 'Venue not found' });
        }
        
        res.json({ message: 'Venue deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get venue availability for a specific date range
router.get('/availability/:id', auth, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        if (!startDate || !endDate) {
            return res.status(400).json({ message: 'Start and end dates are required' });
        }
        
        const venue = await Venue.findById(req.params.id);
        
        if (!venue) {
            return res.status(404).json({ message: 'Venue not found' });
        }
        
        const bookings = await VenueBooking.find({
            venue: req.params.id,
            status: { $in: ['temporary', 'confirmed'] },
            startDateTime: { $lte: new Date(endDate) },
            endDateTime: { $gte: new Date(startDate) }
        }).populate('event');
        
        res.json({
            venue,
            bookings: bookings.map(booking => ({
                id: booking._id,
                eventId: booking.event._id,
                eventName: booking.event.name,
                startDateTime: booking.startDateTime,
                endDateTime: booking.endDateTime,
                status: booking.status
            }))
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

module.exports = router;