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
                class VARCHAR(10) NOT NULL,
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
                { form: 5, name: 'Form 5', classes: JSON.stringify(['Advance', 'Brilliant', 'Creative', 'Dynamic', 'Excellent', 'Generous', 'Honest']) }
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
        
        // Clean up any existing duplicate attendance records
        await cleanupDuplicateAttendance();
    } catch (error) {
        console.error('Error initializing database:', error);
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
                { form: 5, name: 'Form 5', classes: ['Advance', 'Brilliant', 'Creative', 'Dynamic', 'Excellent', 'Generous', 'Honest'] }
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
            res.status(400).json({ error: 'Invalid form' });
            return;
        }
        
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
        
        // Auto-generate student ID if not provided
        let finalStudentId = student_id;
        if (!finalStudentId) {
            const year = new Date().getFullYear();
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
                'Honest': 'G'
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
        const { barcode } = req.body;
        
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
        const currentTime = new Date().toTimeString().split(' ')[0];
        const currentDateTime = new Date();
        
        // Check if student already has attendance record for today
        const [attendanceRows] = await connection.execute(
            'SELECT * FROM attendance WHERE student_id = ? AND date = ?',
            [student.student_id, today]
        );

        if (attendanceRows.length > 0) {
            const attendance = attendanceRows[0];
            
            // Check for 2-hour cooldown on check-in
            const timeIn = new Date(`${today}T${attendance.time_in}`);
            const hoursSinceCheckIn = (currentDateTime - timeIn) / (1000 * 60 * 60);
            
            if (hoursSinceCheckIn < 2) {
                res.json({
                    message: `${student.name} already checked in today. Please wait ${(2 - hoursSinceCheckIn).toFixed(1)} hours before checking in again.`,
                    student: student,
                    action: 'cooldown_checkin',
                    remainingHours: (2 - hoursSinceCheckIn).toFixed(1)
                });
                return;
            }

            // Allow new check-in after cooldown period
            await connection.execute(
                'UPDATE attendance SET time_in = ? WHERE id = ?',
                [currentTime, attendance.id]
            );

            res.json({
                message: `${student.name} checked in again at ${currentTime}`,
                student: student,
                action: 'checkin',
                time: currentTime
            });
        } else {
            // Create new attendance record
            await connection.execute(
                'INSERT INTO attendance (student_id, date, time_in) VALUES (?, ?, ?)',
                [student.student_id, today, currentTime]
            );

            res.json({
                message: `${student.name} checked in at ${currentTime}`,
                student: student,
                action: 'checkin',
                time: currentTime
            });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get attendance for a specific date with optional filters
app.get('/api/attendance/:date', async (req, res) => {
    try {
        const { date } = req.params;
        const { form, class: studentClass } = req.query;
        
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
        
        query += ' ORDER BY s.name';
        
        const [rows] = await connection.execute(query, params);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get attendance statistics
app.get('/api/stats', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const currentTime = new Date().toTimeString().split(' ')[0];
        const cutoffTime = '07:45:00'; // 7:45 AM cutoff
        
        // Get basic stats
        const [rows] = await connection.execute(`
            SELECT 
                COUNT(DISTINCT s.id) as total_students,
                COUNT(DISTINCT a.student_id) as present_today,
                COUNT(DISTINCT a.student_id) as completed_today
            FROM students s
            LEFT JOIN attendance a ON s.student_id = a.student_id AND a.date = ?
        `, [today]);
        
        // Calculate absent/late students
        let absentLateCount = 0;
        
        if (currentTime >= cutoffTime) {
            // After 7:45 AM, count students who are absent or late
            const [absentLateRows] = await connection.execute(`
                SELECT COUNT(DISTINCT s.id) as absent_late_count
                FROM students s
                LEFT JOIN attendance a ON s.student_id = a.student_id AND a.date = ?
                WHERE a.student_id IS NULL OR a.time_in > ?
            `, [today, cutoffTime]);
            
            absentLateCount = absentLateRows[0].absent_late_count;
        }
        
        const stats = {
            ...rows[0],
            absent_late_today: absentLateCount
        };
        
        res.json(stats);
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