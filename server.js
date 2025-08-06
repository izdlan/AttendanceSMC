const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
// Environment variables are handled by Railway

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Health check endpoint for Railway
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'Attendance system is running' });
});

// MySQL connection configuration
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'attendance_smc',
    port: process.env.DB_PORT || 3307
};

let connection;

async function connectToMySQL() {
    try {
        // First connect without database to create it if it doesn't exist
        const tempConnection = await mysql.createConnection({
            host: dbConfig.host,
            user: dbConfig.user,
            password: dbConfig.password,
            port: dbConfig.port
        });

        // Create database if it doesn't exist
        await tempConnection.execute(`CREATE DATABASE IF NOT EXISTS ${dbConfig.database}`);
        await tempConnection.end();

        // Connect to the database
        connection = await mysql.createConnection(dbConfig);
        console.log('Connected to MySQL (XAMPP)');
        
        // Initialize database tables
        await initializeDatabase();
        
        return connection;
    } catch (error) {
        console.error('Failed to connect to MySQL:', error);
        process.exit(1);
    }
}

async function initializeDatabase() {
    try {
        // Create students table
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS students (
                id INT AUTO_INCREMENT PRIMARY KEY,
                student_id VARCHAR(50) UNIQUE NOT NULL,
                name VARCHAR(100) NOT NULL,
                form INT NOT NULL,
                class VARCHAR(50) NOT NULL,
                barcode VARCHAR(100) UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create attendance table
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS attendance (
                id INT AUTO_INCREMENT PRIMARY KEY,
                student_id VARCHAR(50) NOT NULL,
                date DATE NOT NULL,
                time_in TIME,
                status VARCHAR(20) DEFAULT 'present',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (student_id) REFERENCES students(student_id)
            )
        `);

        // Create forms table
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS forms (
                id INT AUTO_INCREMENT PRIMARY KEY,
                form INT NOT NULL,
                name VARCHAR(50) NOT NULL,
                classes JSON NOT NULL
            )
        `);

        // Check if forms data exists, if not, insert it
        const [existingForms] = await connection.execute('SELECT COUNT(*) as count FROM forms');
        
        if (existingForms[0].count === 0) {
            console.log('No forms data found, inserting default forms...');
            
            // Insert forms data
            const formsData = [
                { form: 1, name: 'Form 1', classes: JSON.stringify(['Advance', 'Brilliant', 'Creative', 'Dynamic', 'Excellent', 'Generous', 'Honest']) },
                { form: 2, name: 'Form 2', classes: JSON.stringify(['Advance', 'Brilliant', 'Creative', 'Dynamic', 'Excellent', 'Generous', 'Honest']) },
                { form: 3, name: 'Form 3', classes: JSON.stringify(['Advance', 'Brilliant', 'Creative', 'Dynamic', 'Excellent', 'Generous', 'Honest']) },
                { form: 4, name: 'Form 4', classes: JSON.stringify(['Advance', 'Brilliant', 'Creative', 'Dynamic', 'Excellent', 'Generous', 'Honest']) },
                { form: 5, name: 'Form 5', classes: JSON.stringify(['Advance', 'Brilliant', 'Creative', 'Dynamic', 'Excellent', 'Generous', 'Honest']) },
                { form: 63, name: 'Form 63', classes: JSON.stringify(['Al Ghazali', 'Al Idrisi', 'Al Qazwani']) },
                { form: 61, name: 'Form 61', classes: JSON.stringify(['Ibnu Battutah', 'Ibnu Khaldun', 'Ibnu Qayyum']) }
            ];

            for (const formData of formsData) {
                await connection.execute(
                    'INSERT INTO forms (form, name, classes) VALUES (?, ?, ?)',
                    [formData.form, formData.name, formData.classes]
                );
            }
            console.log('Forms data inserted successfully');
        } else {
            console.log('Forms data already exists');
        }

        console.log('Database initialized successfully');
        
        // Run database migration if needed
        await migrateDatabase();
        
        // Clean up any existing duplicate attendance records
        await cleanupDuplicateAttendance();
    } catch (error) {
        console.error('Error initializing database:', error);
    }
}

async function migrateDatabase() {
    try {
        console.log('Starting database migration...');
        
        // Check if students table needs migration
        const [columns] = await connection.execute(`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'students' AND COLUMN_NAME = 'form'
        `, [dbConfig.database]);
        
        if (columns.length > 0 && columns[0].DATA_TYPE === 'int') {
            console.log('Migrating students table form column from INT to VARCHAR...');
            
            // Update students table form column
            await connection.execute(`
                ALTER TABLE students 
                MODIFY COLUMN form VARCHAR(10) NOT NULL
            `);
            
            console.log('Students table migration completed');
        }
        
        // Check if forms table needs migration
        const [formColumns] = await connection.execute(`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'forms' AND COLUMN_NAME = 'form'
        `, [dbConfig.database]);
        
        if (formColumns.length > 0 && formColumns[0].DATA_TYPE === 'int') {
            console.log('Migrating forms table form column from INT to VARCHAR...');
            
            // Update forms table form column
            await connection.execute(`
                ALTER TABLE forms 
                MODIFY COLUMN form VARCHAR(10) NOT NULL
            `);
            
            console.log('Forms table migration completed');
        }
        
        // Check if students table class column needs migration
        const [classColumns] = await connection.execute(`
            SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'students' AND COLUMN_NAME = 'class'
        `, [dbConfig.database]);
        
        if (classColumns.length > 0 && classColumns[0].CHARACTER_MAXIMUM_LENGTH < 50) {
            console.log('Migrating students table class column to VARCHAR(50)...');
            
            // Update students table class column
            await connection.execute(`
                ALTER TABLE students 
                MODIFY COLUMN class VARCHAR(50) NOT NULL
            `);
            
            console.log('Students table class column migration completed');
        }
        
        console.log('Database migration completed successfully');
        
    } catch (error) {
        console.error('Error during database migration:', error);
        // Continue with normal operation even if migration fails
    }
}

// Clean up duplicate attendance records
async function cleanupDuplicateAttendance() {
    try {
        console.log('Cleaning up duplicate attendance records...');
        
        // Find and remove duplicate records, keeping only the latest one per student per day
        await connection.execute(`
            DELETE a1 FROM attendance a1
            INNER JOIN attendance a2 
            WHERE a1.id < a2.id 
            AND a1.student_id = a2.student_id 
            AND a1.date = a2.date
        `);
        
        console.log('Duplicate attendance records cleaned up');
    } catch (error) {
        console.error('Error cleaning up duplicate attendance:', error);
    }
}

// Reset daily counts at midnight
function resetDailyCounts() {
    console.log('Daily counts reset at midnight');
    // The counts will automatically reset when the day changes
    // since we calculate them based on the current date
}

// Schedule daily reset at midnight
function scheduleDailyReset() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0); // Next midnight
    
    const timeUntilMidnight = midnight.getTime() - now.getTime();
    
    // Schedule the reset
    setTimeout(() => {
        resetDailyCounts();
        // Schedule the next reset (24 hours later)
        setInterval(resetDailyCounts, 24 * 60 * 60 * 1000);
    }, timeUntilMidnight);
    
    console.log(`Daily reset scheduled for ${midnight.toLocaleString()}`);
}

// Initialize daily reset schedule
scheduleDailyReset();

// API Routes

// Get all forms and classes
app.get('/api/forms', async (req, res) => {
    try {
        const [rows] = await connection.execute('SELECT * FROM forms ORDER BY form');
        
        if (rows.length === 0) {
            // If no forms data exists, return default data
            console.log('No forms data in database, returning default forms');
            const defaultForms = [
                { form: 1, name: 'Form 1', classes: ['Advance', 'Brilliant', 'Creative', 'Dynamic', 'Excellent', 'Generous', 'Honest'] },
                { form: 2, name: 'Form 2', classes: ['Advance', 'Brilliant', 'Creative', 'Dynamic', 'Excellent', 'Generous', 'Honest'] },
                { form: 3, name: 'Form 3', classes: ['Advance', 'Brilliant', 'Creative', 'Dynamic', 'Excellent', 'Generous', 'Honest'] },
                { form: 4, name: 'Form 4', classes: ['Advance', 'Brilliant', 'Creative', 'Dynamic', 'Excellent', 'Generous', 'Honest'] },
                { form: 5, name: 'Form 5', classes: ['Advance', 'Brilliant', 'Creative', 'Dynamic', 'Excellent', 'Generous', 'Honest'] },
                { form: 63, name: 'Form 63', classes: ['Al Ghazali', 'Al Idrisi', 'Al Qazwani'] },
                { form: 61, name: 'Form 61', classes: ['Ibnu Battutah', 'Ibnu Khaldun', 'Ibnu Qayyum'] }
            ];
            res.json(defaultForms);
            return;
        }
        
        const forms = rows.map(row => {
            let classes;
            try {
                // Try to parse as JSON first
                classes = JSON.parse(row.classes);
            } catch (parseError) {
                // If JSON parsing fails, try comma-separated string
                console.log('JSON parse failed for form', row.form, 'classes:', row.classes);
                if (typeof row.classes === 'string' && row.classes.includes(',')) {
                    classes = row.classes.split(',').map(c => c.trim());
                } else {
                    // Fallback to default classes
                    classes = ['Advance', 'Brilliant', 'Creative', 'Dynamic', 'Excellent', 'Generous', 'Honest'];
                }
            }
            
            return {
                form: row.form,
                name: row.name,
                classes: classes
            };
        });
        
        console.log('Forms API returning:', forms);
        res.json(forms);
    } catch (error) {
        console.error('Error in /api/forms:', error);
        // Return default forms data as fallback
        const defaultForms = [
            { form: 1, name: 'Form 1', classes: ['Advance', 'Brilliant', 'Creative', 'Dynamic', 'Excellent', 'Generous', 'Honest'] },
            { form: 2, name: 'Form 2', classes: ['Advance', 'Brilliant', 'Creative', 'Dynamic', 'Excellent', 'Generous', 'Honest'] },
            { form: 3, name: 'Form 3', classes: ['Advance', 'Brilliant', 'Creative', 'Dynamic', 'Excellent', 'Generous', 'Honest'] },
            { form: 4, name: 'Form 4', classes: ['Advance', 'Brilliant', 'Creative', 'Dynamic', 'Excellent', 'Generous', 'Honest'] },
            { form: 5, name: 'Form 5', classes: ['Advance', 'Brilliant', 'Creative', 'Dynamic', 'Excellent', 'Generous', 'Honest'] }
        ];
        res.json(defaultForms);
    }
});

// Get all students
app.get('/api/students', async (req, res) => {
    try {
        const { form, class: studentClass } = req.query;
        let query = 'SELECT * FROM students';
        let params = [];
        
        if (form || studentClass) {
            query += ' WHERE';
            if (form) {
                query += ' form = ?';
                params.push(parseInt(form));
            }
            if (studentClass) {
                if (form) query += ' AND';
                query += ' class = ?';
                params.push(studentClass);
            }
        }
        
        query += ' ORDER BY name';
        
        const [rows] = await connection.execute(query, params);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add new student
app.post('/api/students', async (req, res) => {
    try {
        const { student_id, name, form, class: studentClass } = req.body;
        
        if (!name || !form || !studentClass) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }
        
        // Validate form and class
        const [formRows] = await connection.execute(
            'SELECT classes FROM forms WHERE form = ?',
            [parseInt(form)]
        );
        
        if (formRows.length === 0) {
            // Fallback validation for new forms that might not be in database yet
            const fallbackForms = {
                63: ['Al Ghazali', 'Al Idrisi', 'Al Qazwani'],
                61: ['Ibnu Battutah', 'Ibnu Khaldun', 'Ibnu Qayyum']
            };
            
            if (fallbackForms[form] && fallbackForms[form].includes(studentClass)) {
                // Valid form and class combination, proceed
                console.log('Using fallback validation for form:', form, 'class:', studentClass);
            } else {
                res.status(400).json({ error: 'Invalid form' });
                return;
            }
        } else {
            let classes;
            try {
                // Try to parse as JSON first
                classes = JSON.parse(formRows[0].classes);
            } catch (parseError) {
                // If JSON parsing fails, try comma-separated string
                console.log('JSON parse failed for form validation, classes:', formRows[0].classes);
                if (typeof formRows[0].classes === 'string' && formRows[0].classes.includes(',')) {
                    classes = formRows[0].classes.split(',').map(c => c.trim());
                } else {
                    // Fallback to default classes
                    classes = ['Advance', 'Brilliant', 'Creative', 'Dynamic', 'Excellent', 'Generous', 'Honest'];
                }
            }
            
            if (!classes.includes(studentClass)) {
                res.status(400).json({ error: 'Invalid class for this form' });
                return;
            }
        }
        
        // Auto-generate student ID if not provided
        let finalStudentId = student_id;
        if (!finalStudentId) {
            const year = new Date().getFullYear();
            
            // Handle numeric form values
            const formNum = parseInt(form);
            
            // Get the next sequence number for this form and class
            const [countRows] = await connection.execute(
                'SELECT COUNT(*) as count FROM students WHERE form = ? AND class = ?',
                [formNum, studentClass]
            );
            const sequence = countRows[0].count + 1;

            // Map class names to letters for student ID
            const classLetterMap = {
                'Advance': 'A',
                'Brilliant': 'B', 
                'Creative': 'C',
                'Dynamic': 'D',
                'Excellent': 'E',
                'Generous': 'F',
                'Honest': 'G',
                'Al Ghazali': 'H',
                'Al Idrisi': 'I',
                'Al Qazwani': 'J',
                'Ibnu Battutah': 'K',
                'Ibnu Khaldun': 'L',
                'Ibnu Qayyum': 'M'
            };
            const classLetter = classLetterMap[studentClass] || 'X';

            finalStudentId = `${year}${formNum.toString().padStart(2, '0')}${classLetter}${sequence.toString().padStart(3, '0')}`;
        }
        
        // Generate barcode
        const barcode = `SMK${finalStudentId}`;
        
        const [result] = await connection.execute(
            'INSERT INTO students (student_id, name, form, class, barcode) VALUES (?, ?, ?, ?, ?)',
            [finalStudentId, name, parseInt(form), studentClass, barcode]
        );
        
        const student = {
            id: result.insertId,
            student_id: finalStudentId,
            name,
            form: parseInt(form),
            class: studentClass,
            barcode
        };
        
        res.json(student);
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(400).json({ error: 'Student ID or barcode already exists' });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

// Record attendance by barcode scan
app.post('/api/attendance/scan', async (req, res) => {
    try {
        const { barcode, clientTime } = req.body;
        
        if (!barcode) {
            res.status(400).json({ error: 'Barcode is required' });
            return;
        }
        
        // Find the student by barcode
        const [studentRows] = await connection.execute(
            'SELECT * FROM students WHERE barcode = ?',
            [barcode]
        );
        
        if (studentRows.length === 0) {
            res.status(404).json({ error: 'Student not found' });
            return;
        }
        
        const student = studentRows[0];
        const today = new Date().toISOString().split('T')[0];
        
        // Use client time if provided, otherwise use server time
        let currentTime;
        if (clientTime) {
            currentTime = clientTime;
        } else {
            // Use server's current time but ensure it's in local timezone
            const now = new Date();
            currentTime = now.toLocaleTimeString('en-US', { 
                hour12: false,
                timeZone: 'Asia/Kuala_Lumpur' // Malaysia timezone
            });
        }
        
        // Parse current time to get hours and minutes
        const [hours, minutes] = currentTime.split(':').map(Number);
        const currentTimeInMinutes = hours * 60 + minutes;
        
        // Define time boundaries
        const CHECK_IN_START = 5 * 60; // 5:00 AM in minutes
        const LATE_START = 7 * 60 + 30; // 7:30 AM in minutes
        const CHECK_IN_END = 9 * 60; // 9:00 AM in minutes
        
        // Check if current time is within check-in window
        if (currentTimeInMinutes < CHECK_IN_START) {
            res.json({
                message: `Check-in is only allowed from 5:00 AM to 9:00 AM. Current time: ${currentTime}`,
                student: student,
                action: 'early_checkin',
                time: currentTime
            });
            return;
        }
        
        if (currentTimeInMinutes > CHECK_IN_END) {
            res.json({
                message: `Check-in period has ended at 9:00 AM. You are marked as absent. Current time: ${currentTime}`,
                student: student,
                action: 'late_checkin',
                time: currentTime
            });
            return;
        }
        
        // Determine status based on time
        let status = 'present';
        if (currentTimeInMinutes >= LATE_START) {
            status = 'late';
        }
        
        // Check if student already has attendance record for today
        const [attendanceRows] = await connection.execute(
            'SELECT * FROM attendance WHERE student_id = ? AND date = ?',
            [student.student_id, today]
        );

        if (attendanceRows.length > 0) {
            res.json({
                message: `${student.name} has already checked in today. Only one check-in per day is allowed.`,
                student: student,
                action: 'duplicate_checkin',
                time: currentTime
            });
            return;
        }
        
        // Create new attendance record
        await connection.execute(
            'INSERT INTO attendance (student_id, date, time_in, status) VALUES (?, ?, ?, ?)',
            [student.student_id, today, currentTime, status]
        );

        const statusMessage = status === 'late' ? 'LATE' : 'PRESENT';
        res.json({
            message: `${student.name} checked in at ${currentTime} - Status: ${statusMessage}`,
            student: student,
            action: 'checkin',
            time: currentTime,
            status: status
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get attendance for a specific date with optional filters (including status)
app.get('/api/attendance/:date', async (req, res) => {
    try {
        const { date } = req.params;
        const { form, class: studentClass, status } = req.query;
        
        let query = `
            SELECT a.*, s.name, s.class, s.form 
            FROM attendance a 
            JOIN students s ON a.student_id = s.student_id 
            WHERE a.date = ?
        `;
        const params = [date];
        
        if (form) {
            query += ' AND s.form = ?';
            params.push(parseInt(form));
        }
        
        if (studentClass) {
            query += ' AND s.class = ?';
            params.push(studentClass);
        }
        
        if (status) {
            query += ' AND a.status = ?';
            params.push(status);
        }
        
        query += ' ORDER BY s.name';
        
        const [rows] = await connection.execute(query, params);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get absent students for a specific date
app.get('/api/absent/:date', async (req, res) => {
    try {
        const { date } = req.params;
        const { form, class: studentClass } = req.query;
        
        // Check if the requested date is today
        const today = new Date().toISOString().split('T')[0];
        const isToday = date === today;
        
        let query = `
            SELECT s.name, s.student_id, s.form, s.class
            FROM students s 
            LEFT JOIN attendance a ON s.student_id = a.student_id AND a.date = ?
            WHERE a.student_id IS NULL
        `;
        const params = [date];
        
        if (form) {
            query += ' AND s.form = ?';
            params.push(parseInt(form));
        }
        
        if (studentClass) {
            query += ' AND s.class = ?';
            params.push(studentClass);
        }
        
        query += ' ORDER BY s.name';
        
        const [rows] = await connection.execute(query, params);
        
        // If it's today, check if it's after 9 AM before returning absent students
        if (isToday) {
            const currentTime = new Date().toLocaleTimeString('en-US', { 
                hour12: false,
                timeZone: 'Asia/Kuala_Lumpur'
            });
            
            // Parse current time to get hours and minutes
            const [hours, minutes] = currentTime.split(':').map(Number);
            const currentTimeInMinutes = hours * 60 + minutes;
            const CHECK_IN_END = 9 * 60; // 9:00 AM in minutes
            
            // Only return absent students if it's after 9 AM
            if (currentTimeInMinutes < CHECK_IN_END) {
                res.json([]);
                return;
            }
        }
        
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get attendance statistics
app.get('/api/stats', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const currentTime = new Date().toLocaleTimeString('en-US', { 
            hour12: false,
            timeZone: 'Asia/Kuala_Lumpur'
        });
        
        // Parse current time to get hours and minutes
        const [hours, minutes] = currentTime.split(':').map(Number);
        const currentTimeInMinutes = hours * 60 + minutes;
        
        // Define time boundaries
        const CHECK_IN_END = 9 * 60; // 9:00 AM in minutes
        
        // Get total students
        const [totalStudents] = await connection.execute('SELECT COUNT(*) as count FROM students');
        
        // Get present students today
        const [presentToday] = await connection.execute(
            'SELECT COUNT(*) as count FROM attendance WHERE date = ? AND status = "present"',
            [today]
        );
        
        // Get late students today
        const [lateToday] = await connection.execute(
            'SELECT COUNT(*) as count FROM attendance WHERE date = ? AND status = "late"',
            [today]
        );
        
        // Calculate absent students - only after 9 AM
        let absentToday = 0;
        if (currentTimeInMinutes >= CHECK_IN_END) {
            // After 9 AM, count students who haven't checked in
            const [absentTodayResult] = await connection.execute(`
                SELECT COUNT(*) as count 
                FROM students s 
                LEFT JOIN attendance a ON s.student_id = a.student_id AND a.date = ?
                WHERE a.student_id IS NULL
            `, [today]);
            absentToday = absentTodayResult[0].count;
        }
        
        res.json({
            total_students: totalStudents[0].count,
            present_today: presentToday[0].count,
            late_today: lateToday[0].count,
            absent_today: absentToday
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get absent/late report for a specific date with optional filters
app.get('/api/absent-late/:date', async (req, res) => {
    try {
        const { date } = req.params;
        const { form, class: studentClass } = req.query;
        const cutoffTime = '07:45:00'; // 7:45 AM cutoff
        
        let query = `
            SELECT s.*, 
                   CASE 
                       WHEN a.student_id IS NULL THEN 'Absent'
                       WHEN a.time_in > ? THEN 'Late'
                       ELSE 'Present'
                   END as status,
                   a.time_in as check_in_time
            FROM students s
            LEFT JOIN attendance a ON s.student_id = a.student_id AND a.date = ?
            WHERE (a.student_id IS NULL OR a.time_in > ?)
        `;
        const params = [cutoffTime, date, cutoffTime];
        
        if (form) {
            query += ' AND s.form = ?';
            params.push(parseInt(form));
        }
        
        if (studentClass) {
            query += ' AND s.class = ?';
            params.push(studentClass);
        }
        
        query += ' ORDER BY s.name';
        
        const [rows] = await connection.execute(query, params);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete attendance records for a student
app.delete('/api/students/:id/attendance', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Get the student ID
        const [studentRows] = await connection.execute(
            'SELECT student_id FROM students WHERE id = ?',
            [id]
        );
        
        if (studentRows.length === 0) {
            res.status(404).json({ error: 'Student not found' });
            return;
        }
        
        const studentId = studentRows[0].student_id;
        
        // Delete all attendance records for this student
        const [result] = await connection.execute(
            'DELETE FROM attendance WHERE student_id = ?',
            [studentId]
        );
        
        res.json({ 
            message: `Deleted ${result.affectedRows} attendance records for student`,
            deletedCount: result.affectedRows
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete student with cascade option
app.delete('/api/students/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { cascade } = req.query; // Add cascade=true to delete attendance records too
        
        // First, get the student to check if they have attendance records
        const [studentRows] = await connection.execute(
            'SELECT student_id FROM students WHERE id = ?',
            [id]
        );
        
        if (studentRows.length === 0) {
            res.status(404).json({ error: 'Student not found' });
            return;
        }
        
        const studentId = studentRows[0].student_id;
        
        // Check if student has attendance records
        const [attendanceRows] = await connection.execute(
            'SELECT COUNT(*) as count FROM attendance WHERE student_id = ?',
            [studentId]
        );
        
        if (attendanceRows[0].count > 0) {
            if (cascade === 'true') {
                // Delete attendance records first
                await connection.execute(
                    'DELETE FROM attendance WHERE student_id = ?',
                    [studentId]
                );
            } else {
                res.status(400).json({ 
                    error: 'Cannot delete student with attendance records. Use cascade=true to delete attendance records as well.' 
                });
                return;
            }
        }
        
        // Delete the student
        const [result] = await connection.execute(
            'DELETE FROM students WHERE id = ?',
            [id]
        );
        
        res.json({ message: 'Student deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update student
app.put('/api/students/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, form, class: studentClass } = req.body;
        
        if (!name || !form || !studentClass) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }
        
        // Validate form and class
        const [formRows] = await connection.execute(
            'SELECT classes FROM forms WHERE form = ?',
            [parseInt(form)]
        );
        
        if (formRows.length === 0) {
            res.status(400).json({ error: 'Invalid form' });
            return;
        }
        
        let classes;
        try {
            // Try to parse as JSON first
            classes = JSON.parse(formRows[0].classes);
        } catch (parseError) {
            // If JSON parsing fails, try comma-separated string
            console.log('JSON parse failed for form validation in update, classes:', formRows[0].classes);
            if (typeof formRows[0].classes === 'string' && formRows[0].classes.includes(',')) {
                classes = formRows[0].classes.split(',').map(c => c.trim());
            } else {
                // Fallback to default classes
                classes = ['Advance', 'Brilliant', 'Creative', 'Dynamic', 'Excellent', 'Generous', 'Honest'];
            }
        }
        
        if (!classes.includes(studentClass)) {
            res.status(400).json({ error: 'Invalid class for this form' });
            return;
        }
        
        const [result] = await connection.execute(
            'UPDATE students SET name = ?, form = ?, class = ? WHERE id = ?',
            [name, parseInt(form), studentClass, id]
        );
        
        if (result.affectedRows === 0) {
            res.status(404).json({ error: 'Student not found' });
            return;
        }
        
        res.json({ message: 'Student updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
async function startServer() {
    await connectToMySQL();
    
    app.listen(PORT, () => {
        console.log(`SMK Chukai Attendance System running on http://localhost:${PORT}`);
        console.log('Press Ctrl+C to stop the server');
    });
    
    // Graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\nShutting down server...');
        if (connection) {
            await connection.end();
            console.log('MySQL connection closed.');
        }
        process.exit(0);
    });
}

startServer().catch(console.error);