const express = require('express');
const router = express.Router();
const VenueBooking = require('../models/VenueBooking');
const Event = require('../models/Event');
const Venue = require('../models/Venue');
const auth = require('../middleware/auth');

// Get all venue bookings (accessible to all)
router.get('/', auth, async (req, res) => {
    try {
        const bookings = await VenueBooking.find()
            .populate('venue')
            .populate({
                path: 'event',
                populate: {
                    path: 'createdBy',
                    model: 'Organization'
                }
            });
        
        res.json(bookings);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get venue bookings by date range (for calendar view)
router.get('/calendar', auth, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        if (!startDate) {
            return res.status(400).json({ message: 'Start date is required' });
        }
        
        const query = {
            startDateTime: { $gte: new Date(startDate) },
            status: { $in: ['temporary', 'confirmed'] }
        };
        
        if (endDate) {
            query.endDateTime = { $lte: new Date(endDate) };
        }
        
        const bookings = await VenueBooking.find(query)
            .populate('venue')
            .populate({
                path: 'event',
                populate: {
                    path: 'createdBy',
                    model: 'Organization'
                }
            });
        
        res.json(bookings);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get bookings for a specific venue
router.get('/venue/:venueId', auth, async (req, res) => {
    try {
        const bookings = await VenueBooking.find({ 
            venue: req.params.venueId,
            status: { $in: ['temporary', 'confirmed'] }
        })
            .populate('venue')
            .populate({
                path: 'event',
                populate: {
                    path: 'createdBy',
                    model: 'Organization'
                }
            });
        
        res.json(bookings);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get booking by ID
router.get('/:id', auth, async (req, res) => {
    try {
        const booking = await VenueBooking.findById(req.params.id)
            .populate('venue')
            .populate({
                path: 'event',
                populate: {
                    path: 'createdBy',
                    model: 'Organization'
                }
            });
        
        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }
        
        res.json(booking);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Update booking status (only venue manager)
router.put('/:id', auth, async (req, res) => {
    try {
        // Check if the organization is a venue manager
        if (!req.organization.isVenueManager) {
            return res.status(403).json({ message: 'Only venue managers can update bookings' });
        }
        
        const { status } = req.body;
        
        if (!['temporary', 'confirmed', 'cancelled'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }
        
        const booking = await VenueBooking.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true }
        ).populate('venue').populate('event');
        
        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }
        
        // If booking is cancelled, update the event status
        if (status === 'cancelled') {
            await Event.findByIdAndUpdate(
                booking.event._id,
                { status: 'cancelled' }
            );
        }
        
        // If booking is confirmed, update the event status
        if (status === 'confirmed') {
            await Event.findByIdAndUpdate(
                booking.event._id,
                { status: 'approved' }
            );
        }
        
        res.json(booking);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get bookings for a specific venue on a specific date
router.get('/check-availability/:venueId', auth, async (req, res) => {
    try {
        const { venueId } = req.params;
        const { date, startDateTime, endDateTime, excludeEventId } = req.query;
        
        // If date is provided, get all bookings for that date
        if (date) {
            const selectedDate = new Date(date);
            const startOfDay = new Date(selectedDate);
            startOfDay.setHours(0, 0, 0, 0);
            
            const endOfDay = new Date(selectedDate);
            endOfDay.setHours(23, 59, 59, 999);
            
            const bookings = await VenueBooking.find({
                venue: venueId,
                status: { $in: ['temporary', 'confirmed'] },
                startDateTime: { $lt: endOfDay },
                endDateTime: { $gt: startOfDay }
            }).populate('event');
            
            return res.json(bookings);
        }
        
        // If startDateTime and endDateTime are provided, check for conflicts
        if (startDateTime && endDateTime) {
            const startDate = new Date(startDateTime);
            const endDate = new Date(endDateTime);
            
            if (endDate <= startDate) {
                return res.status(400).json({ message: 'End time must be after start time' });
            }
            
            const venue = await Venue.findById(venueId);
            
            if (!venue) {
                return res.status(404).json({ message: 'Venue not found' });
            }
            
            const query = {
                venue: venueId,
                status: { $in: ['temporary', 'confirmed'] },
                $or: [
                    // New booking starts during an existing booking
                    {
                        startDateTime: { $lte: startDate },
                        endDateTime: { $gt: startDate }
                    },
                    // New booking ends during an existing booking
                    {
                        startDateTime: { $lt: endDate },
                        endDateTime: { $gte: endDate }
                    },
                    // New booking completely contains an existing booking
                    {
                        startDateTime: { $gte: startDate },
                        endDateTime: { $lte: endDate }
                    }
                ]
            };
            
            // Exclude the current event if editing
            if (excludeEventId) {
                query.event = { $ne: excludeEventId };
            }
            
            const conflictingBookings = await VenueBooking.find(query).populate('event');
            
            if (conflictingBookings.length > 0) {
                return res.json({ 
                    available: false,
                    conflictingEvents: conflictingBookings.map(booking => ({
                        eventName: booking.event.name,
                        startTime: booking.startDateTime,
                        endTime: booking.endDateTime
                    }))
                });
            }
            
            return res.json({ available: true });
        }
        
        return res.status(400).json({ message: 'Either date or startDateTime and endDateTime must be provided' });
    } catch (error) {
        console.error('Error checking venue availability:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

module.exports = router;