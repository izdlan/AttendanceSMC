# SMK Chukai Attendance System

A comprehensive attendance management system for SMK Chukai with barcode scanning, student management, and detailed reporting.

## Features

- 📊 **Barcode Scanning**: Quick student check-in
- 👥 **Student Management**: Add, edit, delete students
- 📈 **Attendance Reports**: Detailed attendance tracking
- ⚠️ **Absent/Late Tracking**: Automatic detection after 7:45 AM
- 🖨️ **Barcode Printing**: Individual and bulk barcode printing
- 📱 **Responsive Design**: Works on all devices
- 🔒 **2-Hour Cooldown**: Prevents accidental double check-ins

## Class Structure

Each form (Form 1-5) has 7 classes with meaningful names:
- **Advance** (A)
- **Brilliant** (B)
- **Creative** (C)
- **Dynamic** (D)
- **Excellent** (E)
- **Generous** (F)
- **Honest** (G)

## 🚀 Railway Deployment Guide

### Step 1: Prepare Your Code
✅ **Already Done**: Your code is ready for Railway deployment

### Step 2: Create Railway Account
1. Go to [railway.app](https://railway.app)
2. Click "Sign Up" 
3. Choose "Continue with GitHub"
4. Authorize Railway to access your GitHub account

### Step 3: Create New Project
1. Click "New Project"
2. Select "Deploy from GitHub repo"
3. Choose your repository (AttendanceSMC)
4. Railway will automatically detect Node.js

### Step 4: Add MySQL Database
1. In your project dashboard, click "New Service"
2. Select "Database" → "MySQL"
3. Railway will create a MySQL database
4. **Copy the connection details** (you'll need them in Step 5)

### Step 5: Configure Environment Variables
1. Go to your app service (not the database)
2. Click "Variables" tab
3. Add these variables (copy from your MySQL service):
   ```
   DB_HOST=your-mysql-host
   DB_USER=your-mysql-user
   DB_PASSWORD=your-mysql-password
   DB_NAME=your-mysql-database
   DB_PORT=3306
   ```

### Step 6: Deploy
- Railway will automatically deploy your app
- Your app will be live at: `https://your-app-name.railway.app`

### Step 7: Test Your App
1. Open your Railway URL
2. Test adding a student
3. Test barcode scanning
4. Test reports and exports

## Local Development

### Prerequisites
- Node.js (v18 or higher)
- XAMPP (for local MySQL)

### Installation
```bash
# Clone the repository
git clone <your-repo-url>
cd AttendanceSMC

# Install dependencies
npm install

# Start XAMPP MySQL service

# Start the application
npm start
```

### Local Access
- Open: `http://localhost:3000`

## Usage

### Adding Students
1. Go to "Manage Students" tab
2. Click "Add Student"
3. Fill in: Name, Form, Class
4. Student ID and barcode are auto-generated

### Scanning Attendance
1. Go to "Scan Attendance" tab
2. Scan student barcode or enter manually
3. System shows check-in status

### Printing Barcodes
1. **Individual**: Click "📊 Barcode" next to student
2. **Bulk**: Click "🖨️ Print All Barcodes"
3. **By Class**: Use filters then "🖨️ Print by Class"

### Reports
1. Go to "Reports" tab
2. Select date and report type
3. Use filters for specific forms/classes
4. Export to CSV

## Database Schema

### Students Table
- `id`: Primary key
- `student_id`: Unique student identifier
- `name`: Student full name
- `form`: Academic form (1-5)
- `class`: Class name (e.g., Advance, Brilliant)
- `barcode`: Scannable barcode

### Attendance Table
- `id`: Primary key
- `student_id`: Foreign key to students
- `date`: Attendance date
- `time_in`: Check-in time

### Forms Table
- `form`: Form number (1-5)
- `classes`: JSON array of class names

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_HOST` | MySQL host | localhost |
| `DB_USER` | MySQL username | root |
| `DB_PASSWORD` | MySQL password | (empty) |
| `DB_NAME` | Database name | attendance_smc |
| `DB_PORT` | MySQL port | 3307 |
| `PORT` | App port | 3000 |

## Railway Benefits

- ✅ **Automatic Deployments**: Updates when you push to GitHub
- ✅ **Built-in MySQL**: No separate database setup
- ✅ **SSL Certificate**: Automatic HTTPS
- ✅ **Custom Domain**: Can add your own domain
- ✅ **Free Tier**: 500 hours/month free
- ✅ **24/7 Uptime**: Always available
- ✅ **Automatic Backups**: Database backups included

## Troubleshooting

### Common Issues:
1. **Database Connection**: Check environment variables
2. **Port Issues**: Railway handles this automatically
3. **Build Errors**: Check Railway logs in dashboard

### Railway Dashboard:
- View logs: Go to your app service → "Deployments" → "View Logs"
- Check variables: Go to "Variables" tab
- Monitor usage: Go to "Settings" → "Usage"

## Support

For issues or questions:
- Check Railway dashboard logs
- Verify environment variables are set correctly
- Ensure MySQL service is running (Railway handles this)

## License

MIT License - feel free to use and modify for your school.