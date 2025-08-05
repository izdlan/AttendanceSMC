# 📚 GitHub Setup Guide

## 🚀 Step-by-Step GitHub Setup

### Step 1: Create GitHub Account
1. Go to [github.com](https://github.com)
2. Click "Sign up"
3. Enter your email, password, and username
4. Verify your email address

### Step 2: Install Git (if not already installed)
1. Download Git from [git-scm.com](https://git-scm.com)
2. Install with default settings
3. Open Command Prompt/PowerShell and verify:
   ```bash
   git --version
   ```

### Step 3: Configure Git
```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

### Step 4: Create New Repository on GitHub
1. Go to [github.com](https://github.com)
2. Click the "+" icon in the top right
3. Select "New repository"
4. Fill in:
   - **Repository name**: `AttendanceSMC`
   - **Description**: `SMK Chukai Attendance System`
   - **Visibility**: Public (recommended for Railway)
   - **Initialize**: Don't check any boxes
5. Click "Create repository"

### Step 5: Initialize Local Git Repository
```bash
# Navigate to your project folder
cd C:\Users\Windows 11\Desktop\AttendanceSMC

# Initialize git repository
git init

# Add all files to git
git add .

# Make first commit
git commit -m "Initial commit: SMK Chukai Attendance System"

# Add GitHub as remote origin
git remote add origin https://github.com/YOUR_USERNAME/AttendanceSMC.git

# Push to GitHub
git branch -M main
git push -u origin main
```

### Step 6: Verify Repository
1. Go to your GitHub repository URL
2. You should see all your files:
   - `server.js`
   - `package.json`
   - `railway.json`
   - `README.md`
   - `public/` folder
   - `.gitignore`

## 🔧 Common Git Commands

### Daily Workflow
```bash
# Check status
git status

# Add changes
git add .

# Commit changes
git commit -m "Description of changes"

# Push to GitHub
git push
```

### Update from GitHub
```bash
# Pull latest changes
git pull origin main
```

### Check Repository Info
```bash
# Check remote URL
git remote -v

# Check branch
git branch
```

## 📁 Files That Will Be Uploaded

### ✅ Included Files:
- `server.js` - Main application
- `package.json` - Dependencies
- `railway.json` - Railway configuration
- `README.md` - Documentation
- `DEPLOYMENT_CHECKLIST.md` - Deployment guide
- `GITHUB_SETUP.md` - This guide
- `.gitignore` - Excludes unnecessary files
- `public/` folder - All frontend files

### ❌ Excluded Files (by .gitignore):
- `node_modules/` - Dependencies (will be installed on Railway)
- `.env` - Environment variables (if exists)
- `*.log` - Log files
- `attendance.db` - Local database (deleted)

## 🚨 Important Notes

### Repository Settings
1. **Keep it Public**: Railway works better with public repositories
2. **Don't commit sensitive data**: Environment variables should be set on Railway
3. **Regular commits**: Commit and push changes regularly

### Before Pushing
Always check what you're uploading:
```bash
git status
git add .
git commit -m "Clear description of changes"
git push
```

## 🔗 Connect to Railway

After GitHub setup:
1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub account
3. Create new project
4. Select "Deploy from GitHub repo"
5. Choose your `AttendanceSMC` repository

## 📋 GitHub Checklist

### Before First Push:
- [ ] Git installed and configured
- [ ] GitHub account created
- [ ] Repository created on GitHub
- [ ] All files ready (no sensitive data)
- [ ] `.gitignore` file present

### After First Push:
- [ ] Files visible on GitHub
- [ ] Repository is public
- [ ] README.md displays correctly
- [ ] No sensitive files uploaded

### Before Railway Deployment:
- [ ] All code committed and pushed
- [ ] Repository is accessible to Railway
- [ ] No local database files
- [ ] Environment variables ready for Railway

## 🆘 Troubleshooting

### If Git Push Fails:
```bash
# Check remote URL
git remote -v

# If wrong URL, update it
git remote set-url origin https://github.com/YOUR_USERNAME/AttendanceSMC.git

# Try pushing again
git push -u origin main
```

### If Files Not Showing:
```bash
# Check what's staged
git status

# Add all files
git add .

# Commit
git commit -m "Add all files"

# Push
git push
```

### If Repository Not Found:
1. Check GitHub URL is correct
2. Ensure repository exists on GitHub
3. Verify you have access to the repository

## 🎉 Success!

Once your code is on GitHub:
1. ✅ Repository is public
2. ✅ All files are uploaded
3. ✅ README displays correctly
4. ✅ Ready for Railway deployment

**Next Step**: Follow the Railway deployment guide in `DEPLOYMENT_CHECKLIST.md` 