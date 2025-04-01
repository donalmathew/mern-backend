const jwt = require('jsonwebtoken');
const Organization = require('../models/Organization');

const auth = async (req, res, next) => {
    try {
        // Get token from header
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ message: 'No authentication token, access denied' });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Find organization
        const organization = await Organization.findById(decoded.id);
        
        if (!organization) {
            return res.status(401).json({ message: 'Organization not found' });
        }

        // Add organization to request object
        req.organization = organization;
        next();
    } catch (error) {
        res.status(401).json({ message: 'Token is invalid' });
    }
};

module.exports = auth;