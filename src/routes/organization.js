const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Organization = require('../models/Organization');
const auth = require('../middleware/auth');

// Register a new organization
router.post('/register', async (req, res) => {
    try {
        const { name, orgId, password, parentOrganization } = req.body;

        // Check if organization already exists
        let organization = await Organization.findOne({ orgId });
        if (organization) {
            return res.status(400).json({ message: 'Organization already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new organization
        organization = new Organization({
            name,
            orgId,
            password: hashedPassword,
            parentOrganization
            // level and isVenueManager will be set automatically by the pre-save hook
        });

        await organization.save();

        // Create token
        const token = jwt.sign(
            { id: organization._id },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.status(201).json({
            organization: {
                id: organization._id,
                name: organization.name,
                orgId: organization.orgId,
                level: organization.level,
                isVenueManager: organization.isVenueManager
            },
            token
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Login organization
router.post('/login', async (req, res) => {
    try {
        const { orgId, password } = req.body;

        // Validate required fields
        if (!orgId || !password) {
            return res.status(400).json({ message: 'Organization ID and password are required' });
        }

        // Check if organization exists
        const organization = await Organization.findOne({ orgId });
        if (!organization) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Check password
        const isMatch = await bcrypt.compare(password, organization.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Create token
        const token = jwt.sign(
            { id: organization._id },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        console.log('Organization logged in:', {
            id: organization._id,
            name: organization.name,
            orgId: organization.orgId,
            level: organization.level
        });

        res.json({
            organization: {
                id: organization._id,
                name: organization.name,
                orgId: organization.orgId,
                level: organization.level,
                isVenueManager: organization.isVenueManager
            },
            token
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get current organization
router.get('/me', auth, async (req, res) => {
    try {
        const organization = await Organization.findById(req.organization._id);
        if (!organization) {
            return res.status(404).json({ message: 'Organization not found' });
        }
        
        res.json({
            id: organization._id,
            name: organization.name,
            orgId: organization.orgId,
            level: organization.level,
            isVenueManager: organization.isVenueManager
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get organization hierarchy
router.get('/hierarchy', auth, async (req, res) => {
    try {
        // Get all organizations
        const organizations = await Organization.find().lean();
        
        // Create a map for quick lookup
        const orgMap = new Map();
        organizations.forEach(org => {
            org.children = [];
            orgMap.set(org._id.toString(), org);
        });
        
        // Build the tree
        const root = organizations.find(org => org.level === 0); // Admin is root
        organizations.forEach(org => {
            if (org.parentOrganization) {
                const parentId = org.parentOrganization.toString();
                const parent = orgMap.get(parentId);
                if (parent) {
                    parent.children.push(org);
                }
            }
        });
        
        res.json(root);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get direct children of an organization
router.get('/children', auth, async (req, res) => {
    try {
        const children = await Organization.find({ parentOrganization: req.organization._id });
        res.json(children);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Create a child organization (only for level 0 admin)
router.post('/create-child', auth, async (req, res) => {
    try {
        // Check if the requesting organization is admin (level 0)
        if (req.organization.level !== 0) {
            return res.status(403).json({ message: 'Only admin can create organizations' });
        }

        const { name, orgId, password, parentOrganization } = req.body;

        // Validate required fields
        if (!name || !orgId || !password) {
            return res.status(400).json({ message: 'Name, organization ID, and password are required' });
        }

        // Validate organization ID format (alphanumeric)
        if (!/^[a-zA-Z0-9]+$/.test(orgId)) {
            return res.status(400).json({ message: 'Organization ID must be alphanumeric' });
        }

        // Check if organization already exists
        let organization = await Organization.findOne({ orgId });
        if (organization) {
            return res.status(400).json({ message: 'Organization already exists' });
        }

        // Validate parent organization if provided
        let parentOrg = null;
        if (parentOrganization) {
            parentOrg = await Organization.findById(parentOrganization);
            if (!parentOrg) {
                return res.status(400).json({ message: 'Parent organization not found' });
            }
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new organization
        organization = new Organization({
            name,
            orgId,
            password: hashedPassword,
            parentOrganization: parentOrganization || req.organization._id
        });

        await organization.save();
        console.log('Organization created:', {
            id: organization._id,
            name: organization.name,
            orgId: organization.orgId,
            level: organization.level,
            parentOrganization: organization.parentOrganization
        });

        res.status(201).json({
            id: organization._id,
            name: organization.name,
            orgId: organization.orgId,
            level: organization.level
        });
    } catch (error) {
        console.error('Error creating organization:', error);
        res.status(500).json({ 
            message: 'Server error: ' + error.message, 
            error: error.message,
            stack: error.stack
        });
    }
});

// Update an organization (only for level 0 admin)
router.put('/:id', auth, async (req, res) => {
    try {
        // Check if the requesting organization is admin (level 0)
        if (req.organization.level !== 0) {
            return res.status(403).json({ message: 'Only admin can update organizations' });
        }

        const { name, parentOrganization } = req.body;
        const updates = {};
        
        if (name) updates.name = name;
        if (parentOrganization) updates.parentOrganization = parentOrganization;

        const organization = await Organization.findByIdAndUpdate(
            req.params.id,
            updates,
            { new: true }
        );

        if (!organization) {
            return res.status(404).json({ message: 'Organization not found' });
        }

        res.json(organization);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Delete an organization (only for level 0 admin)
router.delete('/:id', auth, async (req, res) => {
    try {
        // Check if the requesting organization is admin (level 0)
        if (req.organization.level !== 0) {
            return res.status(403).json({ message: 'Only admin can delete organizations' });
        }

        const organization = await Organization.findByIdAndDelete(req.params.id);

        if (!organization) {
            return res.status(404).json({ message: 'Organization not found' });
        }

        res.json({ message: 'Organization deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

module.exports = router;