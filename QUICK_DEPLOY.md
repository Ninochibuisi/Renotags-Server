# ⚡ Quick Deploy Guide - 5 Minutes to Live

## 🎯 Frontend Compatibility

**✅ Your frontend will NOT break!** All API endpoints and response formats are identical. Only the internal database changed.

---

## 🚀 Fastest Way to Go Live (Railway)

### 1. Setup MongoDB Atlas (2 minutes)
1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register)
2. Create free account → New Project → Build Database
3. Choose **FREE** (M0) cluster
4. Create database user (save password!)
5. Network Access: Allow from anywhere (`0.0.0.0/0`)
6. Get connection string: Connect → Connect your application
7. Format: `mongodb+srv://user:password@cluster.mongodb.net/renotags?retryWrites=true&w=majority`

### 2. Generate JWT Secret (10 seconds)
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Copy the output.

### 3. Deploy to Railway (2 minutes)
1. Go to [Railway](https://railway.app) → Sign up with GitHub
2. New Project → Deploy from GitHub repo
3. Select your repository → `server` folder
4. Go to Variables tab → Add these:

```env
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://your-frontend.com
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/renotags?retryWrites=true&w=majority
JWT_SECRET=your_generated_secret_here
JWT_EXPIRES_IN=7d
ADMIN_EMAIL=admin@renotags.dev
ADMIN_PASSWORD=YourSecurePassword123!@#
LOG_LEVEL=info
```

5. Railway auto-deploys → Get your URL: `https://your-app.up.railway.app`

### 4. Setup Admin (30 seconds)
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and setup
railway login
railway link
railway run npm run setup:admin
```

### 5. Update Frontend (30 seconds)
In your frontend `.env`:
```env
VITE_API_URL=https://your-app.up.railway.app
```

**Done! Your backend is live! 🎉**

---

## ✅ Verify It Works

```bash
# Health check
curl https://your-app.up.railway.app/health

# Should return: {"status":"ok",...}
```

---

## 📋 Complete Guide

For detailed instructions, troubleshooting, and other hosting options, see [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)

---

## 🆘 Quick Troubleshooting

**MongoDB connection failed?**
- Check connection string format
- Verify password is correct
- Check IP whitelist in Atlas

**Server won't start?**
- Check all environment variables are set
- Verify JWT_SECRET is 64 characters
- Check logs in Railway dashboard

**CORS errors?**
- Make sure `FRONTEND_URL` matches your frontend domain exactly
- Both should use HTTPS in production

---

**Total time: ~5 minutes to go live! 🚀**


