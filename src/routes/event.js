const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const VenueBooking = require('../models/VenueBooking');
const Organization = require('../models/Organization');
const Venue = require('../models/Venue');
const auth = require('../middleware/auth');

// Create a new event
router.post('/', auth, async (req, res) => {
    try {
        const {
            name,
            startDateTime,
            endDateTime,
            venue,
            budget,
            description,
            expectedParticipants,
            requiredResources
        } = req.body;

        // Validate required fields
        if (!name || !startDateTime || !endDateTime || !venue || !budget || !description || !expectedParticipants) {
            return res.status(400).json({ 
                message: 'Missing required fields. Please provide name, startDateTime, endDateTime, venue, budget, description, and expectedParticipants.' 
            });
        }

        // Validate venue exists
        const venueExists = await Venue.findById(venue);
        if (!venueExists) {
            return res.status(400).json({ 
                message: 'Venue not found. Please select a valid venue.' 
            });
        }

        // Validate start and end times
        const startDate = new Date(startDateTime);
        const endDate = new Date(endDateTime);
        
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            return res.status(400).json({ 
                message: 'Invalid date format. Please provide valid dates.' 
            });
        }
        
        if (endDate <= startDate) {
            return res.status(400).json({ 
                message: 'End time must be after start time' 
            });
        }

        // Check venue availability
        const conflictingBookings = await VenueBooking.find({
            venue: venue,
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
        }).populate('event');

        if (conflictingBookings.length > 0) {
            return res.status(409).json({ 
                message: 'Venue is not available during the requested time slot',
                conflictingEvents: conflictingBookings.map(booking => ({
                    eventName: booking.event.name,
                    startTime: booking.startDateTime,
                    endTime: booking.endDateTime
                }))
            });
        }

        // Create the event
        const event = new Event({
            name,
            startDateTime,
            endDateTime,
            venue,
            budget,
            description,
            expectedParticipants,
            requiredResources,
            createdBy: req.organization._id
        });

        // Find parent organizations to create approval chain
        let currentOrg = await Organization.findById(req.organization._id);
        const approvalChain = [];
        
        // Build the approval chain up to level 1 (College)
        while (currentOrg.parentOrganization) {
            currentOrg = await Organization.findById(currentOrg.parentOrganization);
            if (!currentOrg) {
                console.error('Parent organization not found:', currentOrg.parentOrganization);
                break;
            }
            
            approvalChain.push({
                organization: currentOrg._id,
                status: 'pending'
            });
            
            // Stop at level 1 (College) as it's the final approver
            if (currentOrg.level === 1) {
                break;
            }
        }
        
        // If no approval chain was created (e.g., for level 0 or 1 orgs), 
        // and the creator is not level 1, add level 1 orgs as approvers
        if (approvalChain.length === 0 && req.organization.level !== 1) {
            const level1Orgs = await Organization.find({ level: 1 });
            level1Orgs.forEach(org => {
                approvalChain.push({
                    organization: org._id,
                    status: 'pending'
                });
            });
        }

        event.approvalChain = approvalChain;
        
        console.log('Created event with approval chain:', {
            eventId: event._id,
            createdBy: req.organization._id,
            creatorLevel: req.organization.level,
            approvalChain: approvalChain.map(a => ({
                organization: a.organization,
                status: a.status
            }))
        });

        // Create temporary venue booking
        const venueBooking = new VenueBooking({
            venue: venue,
            event: event._id,
            startDateTime: startDateTime,
            endDateTime: endDateTime,
            status: 'temporary'
        });

        await event.save();
        await venueBooking.save();

        res.status(201).json(event);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get events pending approval for an organization
router.get('/pending', auth, async (req, res) => {
    try {
        const events = await Event.find({
            'approvalChain.organization': req.organization._id,
            'approvalChain.status': 'pending',
            status: { $nin: ['cancelled', 'rejected'] }
        }).populate('createdBy venue');
        
        res.json(events);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get all events created by the organization
router.get('/my-events', auth, async (req, res) => {
    try {
        const events = await Event.find({ createdBy: req.organization._id })
            .populate('venue')
            .populate('approvalChain.organization');
        res.json(events);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get all events for a venue manager
router.get('/all', auth, async (req, res) => {
    try {
        // Check if the requesting organization is a venue manager
        if (!req.organization.isVenueManager) {
            return res.status(403).json({ message: 'Not authorized' });
        }
        
        const events = await Event.find()
            .populate('venue')
            .populate('createdBy')
            .populate('approvalChain.organization');
        
        res.json(events);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get events by date range (for calendar view)
router.get('/calendar', auth, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        if (!startDate) {
            return res.status(400).json({ message: 'Start date is required' });
        }
        
        const query = {
            startDateTime: { $gte: new Date(startDate) }
        };
        
        if (endDate) {
            query.endDateTime = { $lte: new Date(endDate) };
        }
        
        const events = await Event.find(query)
            .populate('venue')
            .populate('createdBy');
        
        res.json(events);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get event statistics
router.get('/stats', auth, async (req, res) => {
    try {
        console.log('Getting event stats for organization:', req.organization._id);
        const stats = {};
        
        // Get total events created by the organization
        if (req.organization.level >= 2) {
            stats.totalEvents = await Event.countDocuments({ createdBy: req.organization._id });
            stats.pendingEvents = await Event.countDocuments({ 
                createdBy: req.organization._id,
                status: 'pending'
            });
            stats.approvedEvents = await Event.countDocuments({ 
                createdBy: req.organization._id,
                status: 'approved'
            });
            stats.rejectedEvents = await Event.countDocuments({ 
                createdBy: req.organization._id,
                status: 'rejected'
            });
            stats.cancelledEvents = await Event.countDocuments({ 
                createdBy: req.organization._id,
                status: 'cancelled'
            });
        }
        
        // Get events pending approval for this organization
        if (req.organization.level <= 1) {
            stats.pendingEvents = await Event.countDocuments({
                'approvalChain.organization': req.organization._id,
                'approvalChain.status': 'pending',
                status: { $nin: ['cancelled', 'rejected'] }
            });
            
            // Get total events in the system for admin and level 1
            stats.totalEvents = await Event.countDocuments();
            stats.approvedEvents = await Event.countDocuments({ status: 'approved' });
            stats.rejectedEvents = await Event.countDocuments({ status: 'rejected' });
            stats.cancelledEvents = await Event.countDocuments({ status: 'cancelled' });
        }
        
        // Get venue-related stats for venue manager
        if (req.organization.isVenueManager) {
            stats.totalVenues = await Venue.countDocuments();
            stats.pendingBookings = await VenueBooking.countDocuments({ status: 'temporary' });
            stats.confirmedBookings = await VenueBooking.countDocuments({ status: 'confirmed' });
            
            // Get upcoming events (events in the next 7 days)
            const nextWeek = new Date();
            nextWeek.setDate(nextWeek.getDate() + 7);
            stats.upcomingEvents = await Event.countDocuments({
                startDateTime: { $gte: new Date(), $lte: nextWeek },
                status: 'approved'
            });
        }
        
        // Get total organizations for admin
        if (req.organization.level === 0) {
            stats.totalOrganizations = await Organization.countDocuments();
        }
        
        console.log('Event stats:', stats);
        res.json(stats);
    } catch (error) {
        console.error('Error getting event stats:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get recent events
router.get('/recent', auth, async (req, res) => {
    try {
        console.log('Getting recent events for organization:', req.organization._id);
        let query = {};
        
        // For regular organizations, show only their events
        if (req.organization.level >= 2) {
            query.createdBy = req.organization._id;
        }
        
        // For level 1 organizations, show events they need to approve and their own events
        if (req.organization.level === 1) {
            query = {
                $or: [
                    { createdBy: req.organization._id },
                    { 'approvalChain.organization': req.organization._id }
                ]
            };
        }
        
        // For admin, show all events
        // (no additional query needed for admin)
        
        const events = await Event.find(query)
            .sort({ createdAt: -1 })
            .limit(10)
            .populate('venue')
            .populate('createdBy');
        
        console.log('Recent events:', events.length);
        res.json(events);
    } catch (error) {
        console.error('Error getting recent events:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Approve or reject an event
router.put('/:eventId/review', auth, async (req, res) => {
    try {
        const { status, comments } = req.body; // status can be 'approved', 'rejected', or 'needs_modification'
        
        // Validate status
        if (!status || !['approved', 'rejected', 'needs_modification'].includes(status)) {
            return res.status(400).json({ 
                message: 'Invalid status. Status must be one of: approved, rejected, needs_modification' 
            });
        }
        
        const event = await Event.findById(req.params.eventId);

        if (!event) {
            return res.status(404).json({ message: 'Event not found' });
        }

        // Log for debugging
        console.log('Event approval request:', {
            eventId: event._id,
            organizationId: req.organization._id,
            organizationLevel: req.organization.level,
            status,
            comments,
            approvalChain: event.approvalChain.map(a => ({
                organization: a.organization,
                status: a.status
            }))
        });

        // Find the current organization's position in approval chain
        const approvalIndex = event.approvalChain.findIndex(
            a => a.organization.toString() === req.organization._id.toString()
        );

        // If organization is not in the approval chain but is level 1 or admin, allow them to review
        if (approvalIndex === -1 && req.organization.level <= 1) {
            console.log('Organization not in approval chain but has authority to review');
            // Add them to the approval chain
            event.approvalChain.push({
                organization: req.organization._id,
                status: 'pending',
                timestamp: new Date()
            });
            // Update the index
            const newIndex = event.approvalChain.length - 1;
            
            // Update the approval status
            event.approvalChain[newIndex].status = status;
            event.approvalChain[newIndex].comments = comments;
            event.approvalChain[newIndex].timestamp = new Date();
            
            // Handle status updates
            if (status === 'rejected' || status === 'needs_modification') {
                event.status = status;
                
                // If needs_modification, add to modification history
                if (status === 'needs_modification') {
                    if (!event.modificationHistory) {
                        event.modificationHistory = [];
                    }
                    
                    event.modificationHistory.push({
                        requestedBy: req.organization._id,
                        comments: comments,
                        modifiedAt: new Date()
                    });
                }
                
                // Cancel venue booking if rejected
                if (status === 'rejected') {
                    await VenueBooking.findOneAndUpdate(
                        { event: event._id },
                        { status: 'cancelled' }
                    );
                }
            } else if (status === 'approved' && req.organization.level === 1) {
                // Level 1 org is the final approver
                event.status = 'approved';
                // Confirm venue booking
                await VenueBooking.findOneAndUpdate(
                    { event: event._id },
                    { status: 'confirmed' }
                );
            }
        } else if (approvalIndex === -1) {
            return res.status(403).json({ message: 'Not authorized to review this event' });
        } else {
            // Update the approval status
            event.approvalChain[approvalIndex].status = status;
            event.approvalChain[approvalIndex].comments = comments;
            event.approvalChain[approvalIndex].timestamp = new Date();

            if (status === 'rejected' || status === 'needs_modification') {
                event.status = status;
                
                // If needs_modification, add to modification history
                if (status === 'needs_modification') {
                    if (!event.modificationHistory) {
                        event.modificationHistory = [];
                    }
                    
                    event.modificationHistory.push({
                        requestedBy: req.organization._id,
                        comments: comments,
                        modifiedAt: new Date()
                    });
                    
                    // Reset approval status for organizations that already approved
                    // but are at a lower level than the one requesting modifications
                    const reviewingOrg = await Organization.findById(req.organization._id);
                    
                    if (reviewingOrg) {
                        // Reset approvals for organizations with higher level numbers (lower in hierarchy)
                        event.approvalChain.forEach((approval, idx) => {
                            if (idx !== approvalIndex) { // Don't reset the current reviewer
                                const approvalOrgId = approval.organization.toString();
                                // Find the organization to get its level
                                Organization.findById(approvalOrgId).then(org => {
                                    if (org && org.level > reviewingOrg.level) {
                                        // Reset approval status for organizations lower in hierarchy
                                        approval.status = 'pending';
                                        approval.comments = `Reset due to modification request from ${reviewingOrg.name}`;
                                    }
                                }).catch(err => {
                                    console.error('Error finding organization:', err);
                                });
                            }
                        });
                    }
                }
                
                // Cancel venue booking if rejected
                if (status === 'rejected') {
                    await VenueBooking.findOneAndUpdate(
                        { event: event._id },
                        { status: 'cancelled' }
                    );
                }
            } else if (status === 'approved') {
                // Check if this is the last approval needed (level 1 organization)
                const reviewingOrg = await Organization.findById(req.organization._id);
                
                if (reviewingOrg.level === 1) {
                    // Level 1 org is the final approver
                    event.status = 'approved';
                    // Confirm venue booking
                    await VenueBooking.findOneAndUpdate(
                        { event: event._id },
                        { status: 'confirmed' }
                    );
                } else {
                    // Check if all approvals up to this point are approved
                    const allApproved = event.approvalChain
                        .slice(0, approvalIndex + 1)
                        .every(a => a.status === 'approved');
                    
                    if (!allApproved) {
                        event.status = 'pending';
                    }
                }
            }
        }

        await event.save();
        res.json(event);
    } catch (error) {
        console.error('Error reviewing event:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Cancel an event (only the creator can cancel)
router.put('/:id/cancel', auth, async (req, res) => {
    try {
        const event = await Event.findById(req.params.id);
        
        if (!event) {
            return res.status(404).json({ message: 'Event not found' });
        }
        
        // Check if the requesting organization is the creator
        if (!event.createdBy.equals(req.organization._id)) {
            return res.status(403).json({ message: 'Not authorized to cancel this event' });
        }
        
        event.status = 'cancelled';
        
        // Cancel venue booking
        await VenueBooking.findOneAndUpdate(
            { event: event._id },
            { status: 'cancelled' }
        );
        
        await event.save();
        res.json(event);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get event details
router.get('/:id', auth, async (req, res) => {
    try {
        const event = await Event.findById(req.params.id)
            .populate('venue')
            .populate('createdBy')
            .populate('approvalChain.organization');
        
        if (!event) {
            return res.status(404).json({ message: 'Event not found' });
        }
        
        res.json(event);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Update an event (only the creator can update)
router.put('/:id', auth, async (req, res) => {
    try {
        const event = await Event.findById(req.params.id);
        
        if (!event) {
            return res.status(404).json({ message: 'Event not found' });
        }
        
        // Check if the requesting organization is the creator
        if (!event.createdBy.equals(req.organization._id)) {
            return res.status(403).json({ message: 'Not authorized to update this event' });
        }
        
        // Extract fields from request body
        const {
            name,
            startDateTime,
            endDateTime,
            venue,
            budget,
            description,
            expectedParticipants,
            requiredResources,
            resetStatus
        } = req.body;
        
        // Update event fields
        if (name) event.name = name;
        if (startDateTime) event.startDateTime = startDateTime;
        if (endDateTime) event.endDateTime = endDateTime;
        if (venue) event.venue = venue;
        if (budget) event.budget = budget;
        if (description) event.description = description;
        if (expectedParticipants) event.expectedParticipants = expectedParticipants;
        if (requiredResources) event.requiredResources = requiredResources;
        
        // If the event was in needs_modification status, reset it to pending
        // and update the approval chain statuses
        if (resetStatus && event.status === 'needs_modification') {
            event.status = 'pending';
            
            // Add a modification entry
            if (!event.modificationHistory) {
                event.modificationHistory = [];
            }
            
            event.modificationHistory.push({
                requestedBy: req.organization._id,
                comments: 'Event modified as requested',
                modifiedAt: new Date()
            });
            
            console.log('Resetting event status to pending after modifications');
            
            // Update venue booking
            await VenueBooking.findOneAndUpdate(
                { event: event._id },
                { 
                    startDateTime: event.startDateTime,
                    endDateTime: event.endDateTime,
                    venue: event.venue,
                    status: 'temporary'
                }
            );
        }
        
        await event.save();
        
        // Return the updated event
        const updatedEvent = await Event.findById(req.params.id)
            .populate('venue')
            .populate('createdBy')
            .populate('approvalChain.organization');
            
        res.json(updatedEvent);
    } catch (error) {
        console.error('Error updating event:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

module.exports = router;