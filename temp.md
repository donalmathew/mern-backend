I'll provide a comprehensive testing guide with dummy data for testing your updated API endpoints in Postman. This will help you verify that all the changes work correctly.

# Postman Testing Guide for Venue Management System

Here's how to test the updated functionality using Postman with sample data for each endpoint.

## 1. Setup Authentication

First, let's create an organization and get a token:

### Register an Organization (College - Level 0)

**POST** `/api/organizations/register`
```json
{
  "name": "College of Engineering",
  "orgId": "COE001",
  "password": "password123",
  "level": 0,
  "isVenueManager": false
}
```

### Register CGPU (Venue Manager)

**POST** `/api/organizations/register`
```json
{
  "name": "CGPU",
  "orgId": "CGPU001",
  "password": "password123",
  "parentOrganization": "[college_id_from_previous_response]",
  "level": 2,
  "isVenueManager": true
}
```

### Register IEEE (Student Organization)

**POST** `/api/organizations/register`
```json
{
  "name": "IEEE Student Branch",
  "orgId": "IEEE001",
  "password": "password123",
  "parentOrganization": "[college_id_from_previous_response]",
  "level": 1,
  "isVenueManager": false
}
```

### Login (to get token)

**POST** `/api/organizations/login`
```json
{
  "orgId": "CGPU001",
  "password": "password123"
}
```

Save the token from the response to use in subsequent requests.

## 2. Create Venues (as CGPU)

Create a few test venues:

### Create Venue 1

**POST** `/api/venues`  
**Headers**: `Authorization: Bearer [your_token]`
```json
{
  "name": "Main Auditorium",
  "capacity": 500,
  "features": ["projector", "sound system", "air conditioning"]
}
```

### Create Venue 2

**POST** `/api/venues`  
**Headers**: `Authorization: Bearer [your_token]`
```json
{
  "name": "Seminar Hall A",
  "capacity": 100,
  "features": ["projector", "whiteboard"]
}
```

### Create Venue 3

**POST** `/api/venues`  
**Headers**: `Authorization: Bearer [your_token]`
```json
{
  "name": "Classroom 101",
  "capacity": 60,
  "features": ["whiteboard", "air conditioning"]
}
```

## 3. Test Venue Availability Check

### Check Venue Availability (No conflicts)

**GET** `/api/venue-bookings/check-availability/[venue_id]?startDate=2025-03-10T09:00:00.000Z&endDate=2025-03-10T12:00:00.000Z`  
**Headers**: `Authorization: Bearer [your_token]`

This should return a response indicating the venue is available.

## 4. Create Events (Test Venue Booking)

Now login as IEEE to create events:

**POST** `/api/organizations/login`
```json
{
  "orgId": "IEEE001",
  "password": "password123"
}
```

Save the IEEE token.

### Create Event 1

**POST** `/api/events`  
**Headers**: `Authorization: Bearer [ieee_token]`
```json
{
  "name": "Technical Workshop",
  "startDateTime": "2025-03-15T10:00:00.000Z",
  "endDateTime": "2025-03-15T13:00:00.000Z",
  "venue": "[venue_id_for_seminar_hall]",
  "budget": 5000,
  "description": "A workshop on the latest web technologies",
  "expectedParticipants": 80,
  "requiredResources": ["projector", "whiteboard", "refreshments"]
}
```

### Create Event 2

**POST** `/api/events`  
**Headers**: `Authorization: Bearer [ieee_token]`
```json
{
  "name": "Guest Lecture",
  "startDateTime": "2025-03-20T14:00:00.000Z",
  "endDateTime": "2025-03-20T16:00:00.000Z",
  "venue": "[venue_id_for_main_auditorium]",
  "budget": 8000,
  "description": "Lecture by industry expert on AI trends",
  "expectedParticipants": 250,
  "requiredResources": ["projector", "microphones", "refreshments"]
}
```

## 5. Test Conflicting Events

Let's try to create an event that conflicts with an existing one:

**POST** `/api/events`  
**Headers**: `Authorization: Bearer [ieee_token]`
```json
{
  "name": "Conflicting Event",
  "startDateTime": "2025-03-15T11:00:00.000Z",  
  "endDateTime": "2025-03-15T14:00:00.000Z",
  "venue": "[venue_id_for_seminar_hall]",  
  "budget": 3000,
  "description": "This should fail due to overlapping with Technical Workshop",
  "expectedParticipants": 50,
  "requiredResources": ["projector"]
}
```

This should return a 409 Conflict response with details about the conflicting event.

## 6. Test Viewing Venue Bookings

### View All Bookings

**GET** `/api/venue-bookings`  
**Headers**: `Authorization: Bearer [your_token]`

### View Bookings for a Specific Venue

**GET** `/api/venue-bookings/venue/[venue_id]`  
**Headers**: `Authorization: Bearer [your_token]`

### View Bookings for a Date Range

**GET** `/api/venue-bookings/date-range?startDate=2025-03-01T00:00:00.000Z&endDate=2025-03-31T23:59:59.000Z`  
**Headers**: `Authorization: Bearer [your_token]`

### Get Venue Availability Calendar

**GET** `/api/venue-bookings/venue-availability?startDate=2025-03-01T00:00:00.000Z&endDate=2025-03-31T23:59:59.000Z`  
**Headers**: `Authorization: Bearer [your_token]`

## 7. Test Event Approval Flow

Log in as College to approve events:

**POST** `/api/organizations/login`
```json
{
  "orgId": "COE001",
  "password": "password123"
}
```

Save the College token.

### View Pending Events

**GET** `/api/events/pending`  
**Headers**: `Authorization: Bearer [college_token]`

### Approve an Event

**PUT** `/api/events/[event_id]/review`  
**Headers**: `Authorization: Bearer [college_token]`
```json
{
  "status": "approved",
  "comments": "Event approved by College administration"
}
```

### Check if Venue Booking Status Updated

**GET** `/api/venue-bookings`  
**Headers**: `Authorization: Bearer [your_token]`

Verify that the booking status changed from "temporary" to "confirmed" for the approved event.

## 8. Test Event Cancellation

Log back in as IEEE:

**POST** `/api/organizations/login`
```json
{
  "orgId": "IEEE001",
  "password": "password123"
}
```

### Get My Events

**GET** `/api/events/my-events`  
**Headers**: `Authorization: Bearer [ieee_token]`

### Cancel an Event

**PUT** `/api/events/[event_id]/cancel`  
**Headers**: `Authorization: Bearer [ieee_token]`

### Verify Venue is Available Again

**GET** `/api/venue-bookings/check-availability/[venue_id]?startDate=[event_start_time]&endDate=[event_end_time]`  
**Headers**: `Authorization: Bearer [your_token]`

## Notes for Testing:

1. Replace all placeholder values like `[venue_id]`, `[event_id]`, and `[your_token]` with actual values from previous responses.

2. The dates are in ISO format (YYYY-MM-DDTHH:MM:SS.sssZ) - adjust them as needed for your testing.

3. For each request, verify that:
   - The response status code is correct (200 for success, 400/403/409 for expected errors)
   - The response body contains the expected data
   - Any related database changes are reflected in subsequent GET requests

4. To test concurrency and race conditions, you might want to:
   - Try to book the same venue for overlapping times from different user accounts
   - Cancel an event that's been approved and verify the venue is freed
   - Approve an event that's already been cancelled

This comprehensive testing plan will help you verify that all the venue management and booking features are working correctly with the new changes you've implemented.