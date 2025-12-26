# API Documentation

## Overview

The FunGuild application uses serverless API functions deployed on Vercel. Currently, the API provides authentication endpoints for user management.

## Base URL

- **Production**: `https://your-app.vercel.app/api`
- **Development**: `http://localhost:3000/api`

## Endpoints

### POST /api/auth

Authentication endpoint for user registration and login.

#### Request

**Headers:**
```
Content-Type: application/json
```

**Body:**

For registration:
```json
{
  "action": "register",
  "email": "user@example.com",
  "password": "securepassword",
  "justification": "Reason for access"
}
```

For login:
```json
{
  "action": "login",
  "email": "user@example.com",
  "password": "securepassword"
}
```

#### Response

**Registration Success (201):**
```json
{
  "message": "User registered successfully"
}
```

**Login Success (200):**
```json
{
  "profile": {
    "email": "user@example.com",
    "can_edit": false,
    "is_approved": true,
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

**Error Responses:**

- **400 Bad Request**: Invalid action or user already exists
- **401 Unauthorized**: Invalid credentials
- **405 Method Not Allowed**: Non-POST request
- **500 Internal Server Error**: Server error

## Authentication Flow

### Registration

1. User submits registration form with email, password, and justification
2. API checks if user already exists
3. Password is hashed using bcrypt (10 rounds)
4. User record created with `is_approved: false` and `can_edit: false`
5. Admin must approve user before they can access the application

### Login

1. User submits login form with email and password
2. API retrieves user from database
3. Password is verified using bcrypt
4. User profile returned (without password hash)
5. Frontend stores user state in memory

## Database

The API uses MongoDB for user management:

**Collection**: `users`

**Schema**:
```javascript
{
  email: String,           // User email (unique)
  password_hash: String,   // Bcrypt hashed password
  can_edit: Boolean,       // Permission to edit data
  is_approved: Boolean,    // Admin approval status
  justification: String,   // User's access justification
  created_at: Date        // Registration timestamp
}
```

## Environment Variables

Required environment variables:

```bash
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/
MONGO_DB=fungiDataBase
```

## Security Considerations

### Current Implementation

- ✅ Passwords hashed with bcrypt
- ✅ User approval workflow
- ✅ Connection pooling for MongoDB
- ⚠️ No JWT tokens (sessions stored client-side)
- ⚠️ No rate limiting
- ⚠️ No email verification

### Recommended Improvements

1. **Implement JWT**: Use JSON Web Tokens for stateless authentication
2. **Add Rate Limiting**: Prevent brute force attacks
3. **Email Verification**: Verify email addresses before approval
4. **HTTPS Only**: Enforce secure connections
5. **Session Timeout**: Implement automatic logout
6. **Password Requirements**: Enforce strong password policies

## Error Handling

All API errors follow this format:

```json
{
  "message": "Error description"
}
```

Common error messages:

- `"Method Not Allowed"` - Non-POST request
- `"User already exists"` - Email already registered
- `"Invalid credentials"` - Wrong email or password
- `"Invalid action"` - Unknown action parameter
- `"Internal Server Error"` - Server-side error

## Testing

### Using cURL

**Register a user:**
```bash
curl -X POST http://localhost:3000/api/auth \
  -H "Content-Type: application/json" \
  -d '{
    "action": "register",
    "email": "test@example.com",
    "password": "testpass123",
    "justification": "Testing the API"
  }'
```

**Login:**
```bash
curl -X POST http://localhost:3000/api/auth \
  -H "Content-Type: application/json" \
  -d '{
    "action": "login",
    "email": "test@example.com",
    "password": "testpass123"
  }'
```

## Related Documentation

- [Web Interface](./04-web-interface.md) - How the frontend uses this API
- [Deployment](./06-deployment.md) - How to deploy the API
