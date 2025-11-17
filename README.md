# Renotags Backend API

Standalone backend API server for the Renotags application. Can be deployed independently from the frontend.

## Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Set up admin user**:
   ```bash
   npm run setup:admin
   ```

4. **Start development server**:
   ```bash
   npm run dev
   ```

For detailed setup instructions, see [BACKEND_SETUP_GUIDE.md](./BACKEND_SETUP_GUIDE.md).

## Features

- RESTful API with Express.js
- MongoDB for all data storage (users, admin, referrals, tasks, events, logs)
- JWT-based authentication
- Rate limiting and security headers
- Comprehensive logging with Winston
- Email service integration
- Referral system
- Points management
- Ban system for user management
- Role-based access control (RBAC)
- Task management system
- Advanced analytics

## Project Structure

```
server/
├── src/
│   ├── config/          # Database configurations
│   ├── middleware/      # Express middleware (auth, rate limiting, etc.)
│   ├── models/          # Mongoose models
│   ├── routes/          # API routes
│   ├── services/        # Business logic services
│   ├── utils/           # Utility functions (logger, crash handler, etc.)
│   ├── validation/      # Zod schemas
│   └── scripts/         # Setup scripts
├── logs/                # Log files (auto-created)
├── dist/                # Compiled TypeScript
├── .env.example         # Environment variables template
├── BACKEND_SETUP_GUIDE.md  # Complete setup documentation
└── package.json
```

## Environment Variables

Required environment variables (see `.env.example` for template):

- `NODE_ENV` - Environment (development/production)
- `PORT` - Server port (default: 3001)
- `FRONTEND_URL` - Frontend URL for CORS
- `MONGODB_URI` - MongoDB connection string (MongoDB Atlas)
- `JWT_SECRET` - JWT secret key (min 32 characters)
- `JWT_EXPIRES_IN` - JWT expiration (default: 7d)
- `ADMIN_EMAIL` - Admin user email
- `ADMIN_PASSWORD` - Admin user password (min 12 characters)
- `LOG_LEVEL` - Logging level (error/warn/info/debug)

Optional:
- `EMAIL_HOST` - SMTP host
- `EMAIL_PORT` - SMTP port
- `EMAIL_USER` - SMTP username
- `EMAIL_PASS` - SMTP password
- `EMAIL_FROM` - Email sender address

## Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm run setup:admin` - Create/update admin user

## API Endpoints

### Health Check
- `GET /health` - Server health status

### Onboarding
- `POST /api/onboarding` - Submit waitlist signup
- `GET /api/onboarding/status/:email` - Check signup status

### Authentication
- `POST /api/auth/login` - User/Admin login
- `POST /api/auth/setup-password` - Set user password
- `GET /api/auth/verify-email` - Verify email address
- `GET /api/auth/me` - Get current user data
- `POST /api/auth/resend-verification` - Resend verification email

### User
- `GET /api/user/dashboard/:email` - Get user dashboard data
- `POST /api/user/renopays-tag` - Create renopays tag
- `POST /api/user/verify-telegram` - Verify Telegram account

### Referrals
- `GET /api/referrals/my-referrals` - Get user's referrals
- `POST /api/referrals/check-referral-completion` - Check referral status

### Admin
- `GET /api/admin/users` - Get all users (paginated)
- `GET /api/admin/users/:userId` - Get user details
- `POST /api/admin/users/:userId/ban` - Ban a user
- `POST /api/admin/users/:userId/unban` - Unban a user
- `GET /api/admin/stats` - Get dashboard statistics
- `GET /api/admin/analytics/users` - User analytics
- `GET /api/admin/analytics/tasks` - Task analytics
- `GET /api/admin/audit-logs` - Audit logs

### Tasks
- `GET /api/tasks` - Get all tasks
- `GET /api/tasks/:taskId` - Get task details
- `POST /api/tasks` - Create new task
- `PATCH /api/tasks/:taskId` - Update task
- `DELETE /api/tasks/:taskId` - Delete task

## Authentication

Protected routes require JWT token in Authorization header:
```
Authorization: Bearer <token>
```

## Response Format

**Success:**
```json
{
  "success": true,
  "data": { ... }
}
```

**Error:**
```json
{
  "success": false,
  "message": "Error message"
}
```

## Rate Limiting

- General routes: 100 requests per 15 minutes per IP
- Login routes: 5 requests per 15 minutes per IP

## Logging

Logs are stored in `server/logs/`:
- `combined.log` - All logs
- `error.log` - Error logs only
- `exceptions.log` - Uncaught exceptions
- `rejections.log` - Unhandled promise rejections

## Security

- Helmet.js for security headers
- Rate limiting on all API routes
- CORS configured for frontend origin
- Input validation with Zod
- MongoDB query sanitization (injection protection)
- JWT token authentication
- Password hashing with bcrypt
- Bot prevention (honeypot, fingerprinting)
- Audit logging for admin actions

## Database Schema

The backend uses MongoDB for all data storage:

- **Users**: User accounts, authentication, profiles
- **AdminUsers**: Admin accounts and permissions
- **Referrals**: Referral tracking and completion
- **Tasks**: Task definitions and management
- **UserTasks**: User task completions
- **OnboardingEvents**: Event logging and history
- **AuditLogs**: Admin action logging
- **BotDetection**: Bot prevention and tracking

Schema is automatically initialized on first connection.

## Frontend Integration

1. Set `VITE_API_URL` in frontend `.env`:
   ```env
   VITE_API_URL=http://localhost:3001
   ```

2. Ensure `FRONTEND_URL` in backend `.env` matches frontend URL

3. Frontend should include JWT token in requests:
   ```javascript
   fetch(`${API_URL}/api/user/dashboard/${email}`, {
     headers: {
       'Authorization': `Bearer ${token}`
     }
   })
   ```

## Production Deployment

See [BACKEND_SETUP_GUIDE.md](./BACKEND_SETUP_GUIDE.md) for detailed production deployment instructions.

Quick steps:
1. Set `NODE_ENV=production`
2. Configure production database URLs
3. Use strong secrets (JWT_SECRET, passwords)
4. Build: `npm run build`
5. Start: `npm start` (or use PM2)

## Troubleshooting

See [BACKEND_SETUP_GUIDE.md](./BACKEND_SETUP_GUIDE.md#troubleshooting) for common issues and solutions.

## License

See main project LICENSE file.
# Renotags-Server
# Renotags-Server
