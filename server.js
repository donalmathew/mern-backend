const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./src/config/db');

// Load environment variables
dotenv.config();

// Create Express app
const app = express();

// Connect to MongoDB
connectDB();
// const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/event-manager';
// mongoose.connect(mongoURI, {
//   useNewUrlParser: true,
//   useUnifiedTopology: true,
// }).then(() => console.log('MongoDB connected'))
//   .catch(err => console.log('MongoDB connection error:', err));

// Middleware
app.use(cors());
app.use(express.json());

// Routes
const organizationRoutes = require('./src/routes/organization');
app.use('/api/organizations', organizationRoutes);
const venueRoutes = require('./src/routes/venue');
app.use('/api/venues', venueRoutes);
const eventRoutes = require('./src/routes/event');
app.use('/api/events', eventRoutes);
const venueBookingRoutes = require('./src/routes/venueBooking');
app.use('/api/venue-bookings', venueBookingRoutes);

// Basic route for testing
app.get('/', (req, res) => {
    res.json({ message: 'Welcome to Event Permission Manager API' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});