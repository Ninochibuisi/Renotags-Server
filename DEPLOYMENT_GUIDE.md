# 🚀 Complete Deployment Guide - Go Live with MongoDB Only

## ✅ Frontend Compatibility

**Your frontend will NOT break!** The API is 100% compatible:
- ✅ All endpoints are the same
- ✅ Response formats are identical
- ✅ Request formats unchanged
- ✅ JWT authentication works the same
- ✅ CORS configuration unchanged

The only change is internal (database layer) - your frontend won't notice any difference.

---

## 📋 Pre-Deployment Checklist

- [ ] MongoDB Atlas account created
- [ ] MongoDB connection string ready
- [ ] JWT secret generated
- [ ] Admin email and password ready
- [ ] Frontend URL determined
- [ ] Environment variables prepared

---

## 🗄️ Step 1: Setup MongoDB Atlas (Free Forever)

### 1.1 Create Account
1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register)
2. Sign up with email or Google/GitHub
3. Verify your email

### 1.2 Create Project
1. Click "New Project"
2. Name it: `Renotags Production`
3. Click "Create Project"

### 1.3 Create Free Cluster
1. Click "Build a Database"
2. Choose **FREE** (M0 Sandbox) - $0/month forever
3. Cloud Provider: AWS (or your preference)
4. Region: Choose closest to your deployment region
   - For US: `us-east-1` (N. Virginia)
   - For EU: `eu-west-1` (Ireland)
   - For Asia: `ap-southeast-1` (Singapore)
5. Cluster Name: `renotags-cluster` (or default)
6. Click "Create"

**Wait 3-5 minutes for cluster to provision**

### 1.4 Create Database User
1. Go to "Database Access" (left sidebar)
2. Click "Add New Database User"
3. Authentication Method: "Password"
4. Username: `renotags_user`
5. Password: Click "Autogenerate Secure Password" (SAVE THIS!)
6. Database User Privileges: "Atlas admin"
7. Click "Add User"

### 1.5 Configure Network Access
1. Go to "Network Access" (left sidebar)
2. Click "Add IP Address"
3. For development: Click "Allow Access from Anywhere" (`0.0.0.0/0`)
4. For production: Add your server IP only (more secure)
5. Click "Confirm"

### 1.6 Get Connection String
1. Go to "Database" → Click "Connect" on your cluster
2. Choose "Connect your application"
3. Driver: Node.js, Version: Latest
4. Copy the connection string:
   ```
   mongodb+srv://renotags_user:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
5. Replace `<password>` with your database user password
6. Add database name: `...mongodb.net/renotags?retryWrites=true&w=majority`

**Your final connection string should look like:**
```
mongodb+srv://renotags_user:YourPassword123@cluster0.xxxxx.mongodb.net/renotags?retryWrites=true&w=majority
```

---

## 🔐 Step 2: Generate JWT Secret

**Windows PowerShell:**
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Mac/Linux:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Copy the output** - you'll need it for `JWT_SECRET`

---

## 📝 Step 3: Prepare Environment Variables

Create your production `.env` file:

```env
# Server Configuration
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://your-frontend-domain.com

# MongoDB Atlas (Free)
MONGODB_URI=mongodb+srv://renotags_user:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/renotags?retryWrites=true&w=majority

# JWT Authentication
JWT_SECRET=YOUR_GENERATED_64_CHAR_HEX_STRING
JWT_EXPIRES_IN=7d

# Admin Account
ADMIN_EMAIL=admin@renotags.dev
ADMIN_PASSWORD=YourSecurePassword123!@#

# Logging
LOG_LEVEL=info

# Email (Optional - can skip for now)
# EMAIL_HOST=smtp.gmail.com
# EMAIL_PORT=587
# EMAIL_USER=your_email@gmail.com
# EMAIL_PASS=your_app_password
# EMAIL_FROM=noreply@renotags.dev
```

**Important:**
- Replace `YOUR_PASSWORD` with your MongoDB Atlas password
- Replace `YOUR_GENERATED_64_CHAR_HEX_STRING` with your JWT secret
- Replace `https://your-frontend-domain.com` with your actual frontend URL
- Use a strong admin password (12+ characters)

---

## 🚀 Step 4: Deploy to Production

### Option 1: Railway (Recommended - Easiest & Free)

Railway offers $5/month credit (enough for small apps).

#### 4.1 Setup Railway
1. Go to [Railway](https://railway.app)
2. Sign up with GitHub
3. Click "New Project"
4. Select "Deploy from GitHub repo"
5. Choose your repository
6. Select the `server` folder (or root if server is root)

#### 4.2 Configure Build
Railway auto-detects Node.js, but verify:
- **Root Directory:** `./server` (if server is in subfolder) or `/` (if root)
- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm start`

#### 4.3 Add Environment Variables
1. Go to your service → "Variables" tab
2. Click "New Variable"
3. Add each variable from your `.env` file:
   - `NODE_ENV` = `production`
   - `PORT` = `3001`
   - `FRONTEND_URL` = `https://your-frontend-domain.com`
   - `MONGODB_URI` = `mongodb+srv://...`
   - `JWT_SECRET` = `your_secret`
   - `JWT_EXPIRES_IN` = `7d`
   - `ADMIN_EMAIL` = `admin@renotags.dev`
   - `ADMIN_PASSWORD` = `your_password`
   - `LOG_LEVEL` = `info`

#### 4.4 Deploy
1. Railway automatically deploys on push to main branch
2. Or click "Deploy" button
3. Wait for deployment (2-5 minutes)
4. Your API will be available at: `https://your-app.up.railway.app`

#### 4.5 Setup Admin User
1. Go to Railway → Your Service → "Deployments"
2. Click on latest deployment → "View Logs"
3. Or use Railway CLI:
   ```bash
   # Install Railway CLI
   npm i -g @railway/cli
   
   # Login
   railway login
   
   # Link to your project
   railway link
   
   # Run admin setup
   railway run npm run setup:admin
   ```

#### 4.6 Get Your URL
- Railway provides: `https://your-app.up.railway.app`
- You can add custom domain later (Settings → Domains)

---

### Option 2: Render (Free Forever)

Render has a free tier but spins down after 15 minutes of inactivity.

#### 4.1 Create Web Service
1. Go to [Render](https://render.com)
2. Sign up with GitHub
3. Click "New +" → "Web Service"
4. Connect your repository

#### 4.2 Configure
- **Name:** `renotags-backend`
- **Region:** Choose closest
- **Branch:** `main` (or your default)
- **Root Directory:** `server` (if server is in subfolder)
- **Runtime:** `Node`
- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm start`

#### 4.3 Add Environment Variables
Go to "Environment" tab and add all variables (same as Railway)

#### 4.4 Deploy
1. Click "Create Web Service"
2. Wait for deployment (~5 minutes)
3. Your URL: `https://renotags-backend.onrender.com`

#### 4.5 Setup Admin
Use Render Shell:
```bash
render run npm run setup:admin
```

**Note:** Free tier spins down after inactivity. First request takes ~30 seconds.

---

### Option 3: Fly.io (Free Forever)

Fly.io gives you more control and better performance.

#### 4.1 Install Fly CLI

**Windows (PowerShell):**
```powershell
iwr https://fly.io/install.ps1 -useb | iex
```

**Mac/Linux:**
```bash
curl -L https://fly.io/install.sh | sh
```

#### 4.2 Login and Setup
```bash
fly auth login
cd server
fly launch
```

Follow prompts:
- App name: `renotags-backend`
- Region: Choose closest
- PostgreSQL: No (we're using MongoDB)
- Redis: No

#### 4.3 Set Secrets
```bash
fly secrets set NODE_ENV=production
fly secrets set PORT=3001
fly secrets set FRONTEND_URL=https://your-frontend.com
fly secrets set MONGODB_URI="mongodb+srv://..."
fly secrets set JWT_SECRET="your_secret"
fly secrets set JWT_EXPIRES_IN=7d
fly secrets set ADMIN_EMAIL=admin@renotags.dev
fly secrets set ADMIN_PASSWORD="your_password"
fly secrets set LOG_LEVEL=info
```

#### 4.4 Deploy
```bash
fly deploy
```

#### 4.5 Setup Admin
```bash
fly ssh console
npm run setup:admin
exit
```

---

## ✅ Step 5: Verify Deployment

### 5.1 Test Health Endpoint
```bash
curl https://your-api-url/health
```

Should return:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 123.456
}
```

### 5.2 Test API Endpoint
```bash
curl https://your-api-url/api/onboarding/status/test@example.com
```

### 5.3 Check Logs
- **Railway:** Deployments → View Logs
- **Render:** Logs tab
- **Fly.io:** `fly logs`

---

## 🔧 Step 6: Update Frontend

### 6.1 Update Frontend Environment
In your frontend `.env` or `.env.production`:

```env
VITE_API_URL=https://your-api-url
```

### 6.2 Update CORS
Make sure `FRONTEND_URL` in backend matches your frontend domain:
```env
FRONTEND_URL=https://your-frontend-domain.com
```

### 6.3 Rebuild Frontend
```bash
cd frontend
npm run build
```

---

## 🧪 Step 7: Test Everything

### 7.1 Test User Flow
1. ✅ Sign up via `/api/onboarding`
2. ✅ Set password via `/api/auth/setup-password`
3. ✅ Verify email via `/api/auth/verify-email`
4. ✅ Login via `/api/auth/login`
5. ✅ Get dashboard via `/api/user/dashboard/:email`
6. ✅ Create renopays tag via `/api/user/renopays-tag`

### 7.2 Test Admin Flow
1. ✅ Login as admin via `/api/auth/login`
2. ✅ Get users via `/api/admin/users`
3. ✅ Get stats via `/api/admin/stats`
4. ✅ View analytics via `/api/admin/analytics/users`

### 7.3 Test Referrals
1. ✅ Get referrals via `/api/referrals/my-referrals`
2. ✅ Check completion via `/api/referrals/check-referral-completion`

---

## 🔒 Step 8: Security Hardening

### 8.1 MongoDB Atlas Security
1. **Restrict IP Access:**
   - Go to Network Access
   - Remove `0.0.0.0/0`
   - Add only your server IP

2. **Enable Database Encryption:**
   - Already enabled by default in Atlas

3. **Regular Backups:**
   - Free tier: Manual backups
   - Consider upgrading for automated backups

### 8.2 Environment Variables
- ✅ Never commit `.env` to git
- ✅ Use strong passwords (12+ characters)
- ✅ Rotate JWT_SECRET periodically
- ✅ Use different secrets for dev/prod

### 8.3 HTTPS
- ✅ All hosting providers provide free SSL
- ✅ Ensure frontend uses HTTPS
- ✅ Update `FRONTEND_URL` to use `https://`

---

## 📊 Step 9: Monitoring

### 9.1 MongoDB Atlas Monitoring
1. Go to "Metrics" tab
2. Monitor:
   - Connection count
   - Database size
   - Query performance

### 9.2 Application Logs
- **Railway:** View logs in dashboard
- **Render:** Logs tab
- **Fly.io:** `fly logs` or dashboard

### 9.3 Health Checks
Set up monitoring to ping `/health` endpoint:
- UptimeRobot (free)
- Pingdom
- StatusCake

---

## 🆘 Troubleshooting

### Issue: MongoDB Connection Failed
**Error:** `MongoServerError: Authentication failed`

**Solutions:**
- Check `MONGODB_URI` is correct
- Verify password is URL-encoded (replace special chars with %XX)
- Check IP whitelist in MongoDB Atlas
- Ensure database user has proper permissions

### Issue: Server Won't Start
**Error:** `Environment validation failed`

**Solutions:**
- Check all required environment variables are set
- Verify `JWT_SECRET` is at least 32 characters
- Check `MONGODB_URI` format is correct
- Review logs for specific error

### Issue: Admin Setup Fails
**Error:** `Failed to connect to database`

**Solutions:**
- Ensure MongoDB connection is working
- Check `MONGODB_URI` is correct
- Verify IP whitelist includes your server IP
- Check admin credentials are valid

### Issue: CORS Errors
**Error:** `Access to fetch has been blocked by CORS`

**Solutions:**
- Verify `FRONTEND_URL` in backend matches frontend domain exactly
- Check frontend is using correct `VITE_API_URL`
- Ensure both use HTTPS in production

---

## 📈 Step 10: Scaling (When Needed)

### Free Tier Limits
- **MongoDB Atlas:** 512MB storage, shared cluster
- **Railway:** $5/month credit (~500 hours)
- **Render:** Free tier spins down after inactivity
- **Fly.io:** 3 shared VMs, 3GB storage

### When to Upgrade
- Database size > 512MB
- High traffic (>1000 requests/day)
- Need 24/7 uptime (Render free tier spins down)

### Upgrade Options
1. **MongoDB Atlas:** M10 cluster ($57/month) - dedicated, backups
2. **Railway:** Pay-as-you-go after $5 credit
3. **Render:** Paid plans start at $7/month
4. **Fly.io:** Pay for additional resources

---

## 🎉 You're Live!

Your backend is now deployed and ready to serve your frontend!

### Quick Reference

**API URL:** `https://your-api-url`
**Health Check:** `https://your-api-url/health`
**Frontend Config:** `VITE_API_URL=https://your-api-url`

### Next Steps
1. ✅ Test all endpoints
2. ✅ Monitor logs for errors
3. ✅ Set up health check monitoring
4. ✅ Configure custom domain (optional)
5. ✅ Set up automated backups (when upgrading)

---

## 📞 Support

If you encounter issues:
1. Check logs in your hosting dashboard
2. Verify environment variables are set correctly
3. Test MongoDB connection separately
4. Review this guide's troubleshooting section

**Happy deploying! 🚀**


