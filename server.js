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
    host: 'localhost',       
    user: 'root',            
    password: '241405', // REPLACE with your actual DB password (was 241405)
    database: 'veripass'  
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

// Serve static files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running live on http://localhost:${PORT}`);
});