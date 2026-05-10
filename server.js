const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const path = require('path');
const session = require('express-session');
const multer = require('multer'); // 1. Added Multer for file uploads
const fs = require('fs'); // 2. Added fs to create folders if they don't exist

const app = express();

app.use(cors());
app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); // Needed to read form data

// Configure Sessions
app.use(session({
    secret: 'veripass_super_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } 
}));

// --- MULTER UPLOAD CONFIGURATION ---
// Tell Multer where to save files and what to name them
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './public/uploads';
        // Create the folder automatically if it doesn't exist
        if (!fs.existsSync(dir)){
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        // Add a timestamp so files with the same name don't overwrite each other
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });
// -----------------------------------

// --- DATABASE CONNECTION SETUP ---
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root', 
    password: process.env.DB_PASSWORD || '241405', 
    database: process.env.DB_NAME || 'MediSparta',
    port: process.env.DB_PORT || 3306,
    ssl: {
        rejectUnauthorized: false
    }
});

db.connect((err) => {
    if (err) {
        console.error('Error connecting to the database: ', err);
        return;
    }
    console.log('Successfully connected to the Veripass MySQL database!');
});
// ---------------------------------

// --- 1. AUTHENTICATION ROUTES ---
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const query = "SELECT * FROM users WHERE email = ? AND password_hash = ?";
    
    db.query(query, [email, password], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'Database error' });

        if (results.length > 0) {
            req.session.user = {
                id: results[0].user_id,
                name: results[0].full_name,
                role: results[0].role // 'student', 'staff', or 'admin'
            };
            // Send the role back so the frontend knows where to redirect them!
            res.json({ success: true, message: 'Login successful!', role: results[0].role });
        } else {
            res.status(401).json({ success: false, message: 'Invalid email or password' });
        }
    });
});

app.get('/api/session-check', (req, res) => {
    if (req.session.user) {
        res.json({ loggedIn: true, user: req.session.user });
    } else {
        res.json({ loggedIn: false });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// --- 2. STUDENT ROUTES ---

// Route to handle document uploads
app.post('/api/upload', upload.single('document_file'), (req, res) => {
    // Security check: Must be logged in
    if (!req.session.user) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const studentId = req.session.user.id;
    const { docType, department, section } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    // Step 1: Create a new Transaction
    // Note: In a full system, you'd map "department" to an actual office_id. 
    // We will hardcode 1 for now to represent the testing office.
    const officeId = 1; 

    const transactionQuery = `INSERT INTO transactions (student_id, office_id, status) VALUES (?, ?, 'Submitted')`;
    
    db.query(transactionQuery, [studentId, officeId], (err, transResult) => {
        if (err) return res.status(500).json({ success: false, message: 'Failed to create transaction' });

        const transactionId = transResult.insertId;

        // Step 2: Save the File details in the Documents table
        const docQuery = `INSERT INTO documents (transaction_id, file_name, file_path, status) VALUES (?, ?, ?, 'Pending')`;
        // We save the relative path so the frontend can link to it later for downloads
        const filePath = `/uploads/${file.filename}`;

        db.query(docQuery, [transactionId, file.originalname, filePath], (err) => {
            if (err) return res.status(500).json({ success: false, message: 'Failed to save document record' });
            
            res.json({ success: true, message: 'Document submitted successfully!' });
        });
    });
});

// --- 3. STAFF ROUTES ---

// Fetch the queue for the Staff Dashboard
app.get('/api/staff/queue', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'staff') {
        return res.status(403).json({ success: false, message: 'Access denied. Staff only.' });
    }

    // Join transactions, users (to get student name), and documents (to get file name)
    const query = `
        SELECT t.transaction_id, u.full_name as student_name, d.file_name, d.file_path, t.submitted_at, t.status 
        FROM transactions t
        JOIN users u ON t.student_id = u.user_id
        JOIN documents d ON t.transaction_id = d.transaction_id
        WHERE t.status IN ('Submitted', 'Processing', 'Incomplete', 'Missing')
        ORDER BY t.submitted_at ASC
    `;

    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'Database error' });
        res.json({ success: true, queue: results });
    });
});

// --- NEW BACKEND ROUTES ---

// 1. Let Students fetch their own documents for their dashboard
app.get('/api/student/documents', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'student') return res.status(401).json({ success: false });

    const query = `
        SELECT t.transaction_id, d.file_name, t.submitted_at, t.status 
        FROM transactions t
        JOIN documents d ON t.transaction_id = d.transaction_id
        WHERE t.student_id = ?
        ORDER BY t.submitted_at DESC
    `;
    db.query(query, [req.session.user.id], (err, results) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, documents: results });
    });
});

// 2. Let Staff update the status of a document
app.post('/api/staff/update-status', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'staff') return res.status(403).json({ success: false });

    const { transactionId, status, remarks } = req.body;
    const staffId = req.session.user.id;

    // FIX: If the status is 'Valid', we stamp the completed_at time so we can calculate efficiency!
    let query = `UPDATE transactions SET status = ?, handled_by = ? WHERE transaction_id = ?`;
    if (status === 'Valid') {
        query = `UPDATE transactions SET status = ?, handled_by = ?, completed_at = CURRENT_TIMESTAMP WHERE transaction_id = ?`;
    }

    db.query(query, [status, staffId, transactionId], (err) => {
        if (err) return res.status(500).json({ success: false, message: 'Database error' });

        if (remarks) {
            db.query(`UPDATE documents SET remarks = ? WHERE transaction_id = ?`, [remarks, transactionId]);
        }
        res.json({ success: true, message: 'Status updated successfully!' });
    });
});

// 3. Fetch Data for Staff Dashboard Summary Cards
app.get('/api/staff/stats', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'staff') return res.status(403).json({ success: false });

    const query = `
        SELECT 
            SUM(CASE WHEN status = 'Submitted' THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN status IN ('Processing', 'Incomplete', 'Missing') THEN 1 ELSE 0 END) as processing,
            SUM(CASE WHEN status = 'Valid' AND DATE(completed_at) = CURDATE() THEN 1 ELSE 0 END) as completed_today,
            AVG(TIMESTAMPDIFF(SECOND, submitted_at, completed_at)) as avg_seconds
        FROM transactions
    `;

    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, stats: results[0] });
    });
});

// 3. Fetch Data for Student Dashboard Summary Cards
app.get('/api/student/stats', (req, res) => {
    // Security check: Must be a logged-in student
    if (!req.session.user || req.session.user.role !== 'student') return res.status(403).json({ success: false });

    const query = `
        SELECT 
            SUM(CASE WHEN status = 'Submitted' THEN 1 ELSE 0 END) as submitted,
            SUM(CASE WHEN status = 'Valid' THEN 1 ELSE 0 END) as approved,
            SUM(CASE WHEN status = 'Processing' THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN status IN ('Incomplete', 'Missing') THEN 1 ELSE 0 END) as rejected
        FROM transactions
        WHERE student_id = ?
    `;

    db.query(query, [req.session.user.id], (err, results) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, stats: results[0] });
    });
});

// 4. Fetch Processed History
app.get('/api/staff/processed-history', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'staff') return res.status(403).json({ success: false });

    const query = `
        SELECT t.transaction_id, u.full_name as student_name, d.file_name, t.completed_at, t.status 
        FROM transactions t
        JOIN users u ON t.student_id = u.user_id
        JOIN documents d ON t.transaction_id = d.transaction_id
        WHERE t.completed_at IS NOT NULL
        ORDER BY t.completed_at DESC
    `;

    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, history: results });
    });
});

// 5. Fetch Daily Chart Data
app.get('/api/staff/chart-data', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'staff') return res.status(403).json({ success: false });

    // Count how many 'Valid' documents were processed per day for the last 5 days
    const query = `
        SELECT DATE_FORMAT(completed_at, '%a') as day_name, COUNT(*) as daily_count
        FROM transactions
        WHERE status = 'Valid' AND completed_at >= DATE(NOW()) - INTERVAL 5 DAY
        GROUP BY DATE(completed_at), day_name
        ORDER BY DATE(completed_at) ASC
    `;

    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, chartData: results });
    });
});

// --- 4. ADMIN ROUTES ---

// Get all staff and admin users for the table
app.get('/api/admin/users', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ success: false });

    // TWEAK: Added u.office_id to the SELECT so the frontend can pre-fill the edit dropdown
    const query = `
        SELECT u.user_id, u.full_name, u.email, u.role, u.office_id, o.name as office_name
        FROM users u
        LEFT JOIN offices o ON u.office_id = o.office_id
        WHERE u.role IN ('staff', 'admin')
        ORDER BY u.user_id ASC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, users: results });
    });
});

// Update an existing staff account
app.put('/api/admin/users/:id', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ success: false });

    const userId = req.params.id;
    const { fullName, email, password, officeId } = req.body;

    // Security check: Only update if the user being edited is NOT an admin
    let query = `UPDATE users SET full_name = ?, email = ?, office_id = ? WHERE user_id = ? AND role != 'admin'`;
    let params = [fullName, email, officeId, userId];

    // If the admin typed in a new password, update that too
    if (password && password.trim() !== '') {
        query = `UPDATE users SET full_name = ?, email = ?, password_hash = ?, office_id = ? WHERE user_id = ? AND role != 'admin'`;
        params = [fullName, email, password, officeId, userId];
    }

    db.query(query, params, (err) => {
        if (err) {
            console.error("MySQL Update Error:", err);
            if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ success: false, message: 'Email already exists.' });
            return res.status(500).json({ success: false, message: 'Database error.' });
        }
        res.json({ success: true, message: 'Account updated successfully!' });
    });
});

// Create a new staff account
app.post('/api/admin/users', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ success: false });

    const { fullName, email, password, officeId } = req.body;
    
    // Insert the new user. Note: We hardcode 'staff' here because admins shouldn't accidentally make other admins from this basic form!
    const query = `INSERT INTO users (full_name, email, password_hash, role, office_id) VALUES (?, ?, ?, 'staff', ?)`;

    db.query(query, [fullName, email, password, officeId], (err) => {
        if (err) {
            // NEW: Print the exact error to your terminal so you can see what broke!
            console.error("MySQL Insert Error:", err); 

            // Check if the email is already taken
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ success: false, message: 'An account with that email already exists.' });
            }
            return res.status(500).json({ success: false, message: 'Database error. Check your server terminal for details.' });
        }
        res.json({ success: true, message: 'Staff account created successfully!' });
    });
});

// Get System Logs (Audit Trail)
app.get('/api/admin/logs', (req, res) => {
    // Security check
    if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ success: false });

    // Join transactions, documents, and TWO instances of users (one for student, one for staff)
    const query = `
        SELECT 
            t.transaction_id, 
            t.status, 
            t.completed_at, 
            d.file_name,
            u_student.full_name as student_name,
            u_staff.full_name as staff_name, 
            o.name as office_name
        FROM transactions t
        JOIN documents d ON t.transaction_id = d.transaction_id
        JOIN users u_student ON t.student_id = u_student.user_id
        JOIN users u_staff ON t.handled_by = u_staff.user_id
        LEFT JOIN offices o ON u_staff.office_id = o.office_id
        WHERE t.handled_by IS NOT NULL
        ORDER BY t.completed_at DESC
        LIMIT 100 -- Keep the page loading fast by only grabbing the last 100 actions
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error("Log fetch error:", err);
            return res.status(500).json({ success: false });
        }
        res.json({ success: true, logs: results });
    });
});

// Get Global Analytics (Compare Offices)
app.get('/api/admin/analytics', (req, res) => {
    // Security check
    if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ success: false });

    // Group the data by Office to compare their performance
    const query = `
        SELECT 
            o.name as office_name,
            COUNT(t.transaction_id) as total_processed,
            AVG(TIMESTAMPDIFF(SECOND, t.submitted_at, t.completed_at)) as avg_seconds
        FROM transactions t
        JOIN offices o ON t.office_id = o.office_id
        WHERE t.status = 'Valid' AND t.completed_at IS NOT NULL
        GROUP BY o.office_id, o.name
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error("Analytics fetch error:", err);
            return res.status(500).json({ success: false });
        }
        res.json({ success: true, analytics: results });
    });
});

// Serve static files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running live on http://localhost:${PORT}`);
});