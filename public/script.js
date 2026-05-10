// Wait for the entire HTML document to load
document.addEventListener("DOMContentLoaded", async () => {
    
    // --- 1. GLOBAL ANIMATIONS ---
    const animatedElements = document.querySelectorAll('.animate-on-load');
    animatedElements.forEach((element, index) => {
        setTimeout(() => {
            element.classList.add('visible');
        }, index * 150); 
    });

    // --- 2. DYNAMIC HEADER INJECTION (For Dashboard Pages) ---
    const headerPlaceholder = document.getElementById('header-placeholder');
    if (headerPlaceholder) {
        try {
            // Check which page we are on to determine which header to load
            const currentPath = window.location.pathname;
            
            let headerFile = 'header.html'; // Default to student
            if (currentPath.includes('staff-')) {
                headerFile = 'staff-header.html';
            } else if (currentPath.includes('admin-')) {
                headerFile = 'admin-header.html';
            }
            
            const response = await fetch(headerFile);
            const data = await response.text();
            headerPlaceholder.innerHTML = data;

            // Highlight the correct nav link based on current URL
            document.querySelectorAll('.top-nav a').forEach(link => {
                link.classList.remove('active');
                if (link.getAttribute('href') === currentPath || (currentPath === '/' && link.getAttribute('href') === '/student-dashboard.html')) {
                    link.classList.add('active');
                }
            });

            // Attach the logout functionality AFTER the header is loaded
            document.getElementById('logout-btn').addEventListener('click', async () => {
                await fetch('/api/logout', { method: 'POST' });
                window.location.href = '/'; 
            });
        } catch (error) {
            console.error("Failed to load header:", error);
        }
    }

    // --- 3. SESSION SECURITY CHECK (For Dashboard Pages) ---
    // Only run this if we are NOT on the login page (assuming login page doesn't have the header)
    if (headerPlaceholder) {
        try {
            const response = await fetch('/api/session-check');
            const data = await response.json();
            if (!data.loggedIn) {
                alert("Unauthorized! Please log in first.");
                window.location.href = '/';
            }
        } catch (error) {
            console.error("Session check failed", error);
        }
    }
});

// --- 4. LOGIN LOGIC ---
const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email, password: password })
            });
            const data = await response.json();

            if (data.success) {
                // THE FIX: Check the specific role and route to the correct dashboard
                if (data.role === 'admin') {
                    window.location.href = '/admin-dashboard.html'; // Admins go here
                } else if (data.role === 'staff') {
                    window.location.href = '/staff-dashboard.html'; // Staff goes here
                } else {
                    window.location.href = '/student-dashboard.html'; // Students go here
                }
            } else {
                alert('Error: ' + data.message);
            }
        } catch (error) {
            console.error('Error logging in:', error);
            alert('Something went wrong. Please try again.');
        }
    });
}

// --- 5. ACTUAL UPLOAD PAGE LOGIC ---
const uploadForm = document.getElementById('file-upload-form');
if (uploadForm) {
    const modal = document.getElementById('success-modal');
    const fileInput = document.getElementById('file-upload');
    const dropZoneText = document.querySelector('.drop-zone-text');

    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault(); 
        
        // 1. Bundle up the file and text data using FormData (Required for Multer!)
        const formData = new FormData();
        formData.append('docType', document.getElementById('doc-type').value);
        formData.append('department', document.getElementById('department').value);
        formData.append('section', document.getElementById('section').value);
        formData.append('document_file', fileInput.files[0]);

        try {
            // 2. Send it to your Node.js server
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData // Note: Do NOT set 'Content-Type' manually when using FormData
            });
            
            const data = await response.json();
            if (data.success) {
                modal.style.display = 'flex'; // Show success modal
            } else {
                alert('Upload failed: ' + data.message);
            }
        } catch (err) {
            console.error('Upload Error:', err);
        }
    });

    document.getElementById('close-modal').addEventListener('click', () => {
        modal.style.display = 'none';
        uploadForm.reset(); 
        dropZoneText.innerText = "Drag & drop files or Browse"; 
    });

    fileInput.addEventListener('change', function(e) {
        if (e.target.files[0]) dropZoneText.innerText = e.target.files[0].name;
    });
}

// --- 6. DOCUMENT PAGE LOGIC (View Details Modal) ---
const detailsModal = document.getElementById('details-modal');
if (detailsModal) {
    const viewButtons = document.querySelectorAll('.view-details-btn');
    const closeDetailsBtn = document.getElementById('close-details-modal');

    // Add click event to all "View" buttons
    viewButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            detailsModal.style.display = 'flex';
        });
    });

    // Close the modal
    closeDetailsBtn.addEventListener('click', () => {
        detailsModal.style.display = 'none';
    });

    // Optional: Close modal if user clicks outside of the white box
    window.addEventListener('click', (e) => {
        if (e.target === detailsModal) {
            detailsModal.style.display = 'none';
        }
    });
}

// --- 7. FAQ PAGE LOGIC (Accordion) ---
const faqAccordion = document.getElementById('faq-accordion');
if (faqAccordion) {
    const faqItems = document.querySelectorAll('.faq-item');

    faqItems.forEach(item => {
        const questionBtn = item.querySelector('.faq-question');

        questionBtn.addEventListener('click', () => {
            // Check if the clicked item is already open
            const isActive = item.classList.contains('active');

            // Close all items first (for a clean accordion effect)
            faqItems.forEach(otherItem => {
                otherItem.classList.remove('active');
            });

            // If it wasn't active before, open it now
            if (!isActive) {
                item.classList.add('active');
            }
        });
    });
}

// --- 8. STAFF DASHBOARD & REVIEW LOGIC ---
const staffQueueBody = document.getElementById('staff-queue-body');
if (staffQueueBody) {
    const reviewModal = document.getElementById('review-modal');
    const reviewForm = document.getElementById('review-form');
    let currentTransactionId = null;

    // 1. Fetch the queue dynamically when the page loads
    async function loadQueue() {
        try {
            const response = await fetch('/api/staff/queue');
            const data = await response.json();
            
            if (data.success) {
                staffQueueBody.innerHTML = ''; // Clear loading text
                data.queue.forEach(doc => {
                    let colorClass = doc.status === 'Submitted' ? 'text-orange' : 
                                     doc.status === 'Processing' ? 'text-blue' : 'text-red';

                    let dateObj = new Date(doc.submitted_at);
                    let timeStr = dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

                    staffQueueBody.innerHTML += `
                        <tr>
                            <td>#${doc.transaction_id}</td>
                            <td>${doc.student_name}</td>
                            <td>${doc.file_name}</td>
                            <td>${timeStr}</td>
                            <td class="${colorClass}">${doc.status}</td>
                            <td>
                                <button class="btn-primary review-btn" 
                                    data-id="${doc.transaction_id}" 
                                    data-student="${doc.student_name}">
                                    Review
                                </button>
                            </td>
                        </tr>
                    `;
                });
            }
        } catch (error) {
            console.error("Failed to load queue:", error);
        }
    }
    loadQueue(); // Run the function!

    // 2. THE FIX: Bulletproof Event Delegation using .closest()
    staffQueueBody.addEventListener('click', (e) => {
        // .closest() ensures we get the button, even if you click the text inside it
        const reviewBtn = e.target.closest('.review-btn');
        
        if (reviewBtn) {
            e.preventDefault(); 
            console.log("✅ Review button clicked!"); // Debugging check
            
            currentTransactionId = reviewBtn.getAttribute('data-id');
            console.log("📌 Transaction ID loaded:", currentTransactionId); // Debugging check
            
            reviewModal.style.display = 'flex';
        }
    });

    // 3. Handle closing the modal
    document.getElementById('close-review-modal').addEventListener('click', () => {
        reviewModal.style.display = 'none';
        reviewForm.reset();
    });

    // 4. Save the Status Changes to the Database!
    reviewForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const status = document.getElementById('update-status').value;
        const remarks = document.getElementById('remarks').value;

        try {
            const res = await fetch('/api/staff/update-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transactionId: currentTransactionId, status, remarks })
            });

            const data = await res.json();
            if (data.success) {
                reviewModal.style.display = 'none';
                reviewForm.reset();
                loadQueue(); // Instantly reload the table to show the new status!
            } else {
                alert("Error updating status: " + data.message);
            }
        } catch (error) {
            console.error("Error updating status:", error);
        }
    });
}

// --- 9. DYNAMIC STAFF SUMMARY CARDS ---
const staffSummaryCards = document.querySelector('.summary-cards');
if (staffSummaryCards && window.location.pathname.includes('staff')) {
    async function loadStaffStats() {
        try {
            const res = await fetch('/api/staff/stats');
            const data = await res.json();
            
            if (data.success) {
                const stats = data.stats;
                
                // Format the average time (convert seconds to minutes and seconds)
                let avgTimeStr = "0m 0s";
                if (stats.avg_seconds) {
                    const mins = Math.floor(stats.avg_seconds / 60);
                    const secs = Math.round(stats.avg_seconds % 60);
                    avgTimeStr = `${mins}m ${secs}s`;
                }

                // Inject into the DOM (Works for both Dashboard and Analytics pages!)
                const cards = document.querySelectorAll('.summary-card h2');
                if (cards.length >= 4) {
                    cards[0].innerText = stats.pending || 0;
                    cards[1].innerText = stats.processing || 0;
                    cards[2].innerText = stats.completed_today || 0;
                    cards[3].innerText = avgTimeStr;
                }
            }
        } catch (err) {
            console.error("Failed to load stats", err);
        }
    }
    loadStaffStats();
}

// --- 10. STAFF PROCESSED HISTORY LOGIC (With Search & Filter) ---
if (window.location.pathname.includes('staff-processed') && document.querySelector('.status-table tbody')) {
    const historyBody = document.querySelector('.status-table tbody');
    const searchInput = document.querySelector('.search-bar');
    const filterDropdown = document.querySelector('.filter-dropdown');
    
    let allHistoryData = []; // Store the data globally so we can filter it

    async function loadHistory() {
        try {
            const res = await fetch('/api/staff/processed-history');
            const data = await res.json();

            if (data.success) {
                allHistoryData = data.history;
                renderHistoryTable(allHistoryData); // Draw the table
            }
        } catch (err) {
            console.error("Failed to load history", err);
        }
    }

    function renderHistoryTable(dataToRender) {
        historyBody.innerHTML = ''; // Clear current table

        if (dataToRender.length === 0) {
            historyBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #888;">No records found.</td></tr>`;
            return;
        }

        dataToRender.forEach(doc => {
            let colorClass = doc.status === 'Valid' ? 'text-green' : 'text-red';
            let dateObj = new Date(doc.completed_at);
            let timeStr = dateObj.toLocaleString([], {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'});

            historyBody.innerHTML += `
                <tr>
                    <td>#${doc.transaction_id}</td>
                    <td>${doc.student_name}</td>
                    <td>${doc.file_name}</td>
                    <td>${timeStr}</td>
                    <td class="${colorClass}">${doc.status}</td>
                    <td><button class="btn-outline-purple">View Record</button></td>
                </tr>
            `;
        });
    }

    // Filter Logic
    function applyFilters() {
        const searchTerm = searchInput.value.toLowerCase();
        const filterStatus = filterDropdown.value.toLowerCase();

        const filteredData = allHistoryData.filter(doc => {
            // Check if name or ID matches search
            const matchesSearch = doc.student_name.toLowerCase().includes(searchTerm) || 
                                  doc.transaction_id.toString().includes(searchTerm);
            
            // Check if status matches dropdown (ignore if "Filter Status" is selected)
            const matchesFilter = (filterStatus === "" || filterStatus === "filter status") ? true : doc.status.toLowerCase() === filterStatus;

            return matchesSearch && matchesFilter;
        });

        renderHistoryTable(filteredData);
    }

    // Attach Event Listeners to Search and Dropdown
    if (searchInput) searchInput.addEventListener('input', applyFilters);
    if (filterDropdown) filterDropdown.addEventListener('change', applyFilters);

    loadHistory(); // Run on page load
}

// --- 11. STAFF ANALYTICS DYNAMIC UI ---
if (window.location.pathname.includes('staff-analytics')) {
    
    // 1. Initialize Chart.js Bar Chart
    async function loadChart() {
        try {
            const res = await fetch('/api/staff/chart-data');
            const data = await res.json();

            if (data.success && data.chartData.length > 0) {
                // Extract the days and counts from the database response
                const labels = data.chartData.map(row => row.day_name);
                const counts = data.chartData.map(row => row.daily_count);

                const ctx = document.getElementById('processingChart').getContext('2d');
                new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: labels, 
                        datasets: [{
                            label: 'Documents Processed',
                            data: counts, 
                            backgroundColor: '#4A72A4',
                            borderRadius: 4,
                            maxBarThickness: 50 // <-- THE FIX: Prevents the giant bar!
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false, // Lets it stretch nicely in your layout
                        plugins: {
                            legend: {
                                display: false // Hides the "Documents Processed" label at the top to match your clean design
                            }
                        },
                        scales: {
                            y: { 
                                beginAtZero: true, 
                                ticks: { stepSize: 1 },
                                grid: { color: '#F0F0F0' }, // Soft horizontal lines
                                border: { display: false } // Removes the harsh black axis line
                            },
                            x: {
                                grid: { display: false }, // Removes vertical lines for a cleaner look
                                border: { display: false } 
                            }
                        }
                    }
                });
            } else {
                // Fallback if the database is entirely empty
                document.getElementById('processingChart').outerHTML = "<p style='color:#888; text-align:center;'>Not enough data yet.</p>";
            }
        } catch (err) {
            console.error("Failed to load chart data", err);
        }
    }
    loadChart();

    // 2. Generate Dynamic Alerts based on the Stats
    async function generateAlerts() {
        try {
            const res = await fetch('/api/staff/stats');
            const data = await res.json();
            
            if (data.success) {
                const stats = data.stats;
                const alertList = document.querySelector('.alert-list');
                alertList.innerHTML = ''; // Clear placeholder alerts

                // Rule 1: High Pending Queue
                if (stats.pending > 15) {
                    alertList.innerHTML += `<li><span class="alert-dot red"></span> High volume alert: ${stats.pending} documents are waiting for initial review.</li>`;
                } else {
                    alertList.innerHTML += `<li><span class="alert-dot green"></span> Queue volume is currently stable.</li>`;
                }

                // Rule 2: Wait time warnings
                if (stats.avg_seconds > 600) { // Over 10 minutes
                    alertList.innerHTML += `<li><span class="alert-dot orange"></span> Warning: Average wait times exceed 10 minutes. Consider allocating more staff.</li>`;
                } else if (stats.avg_seconds > 0) {
                    alertList.innerHTML += `<li><span class="alert-dot green"></span> Wait times are optimal and well below the 10-minute threshold.</li>`;
                }

                // Rule 3: Processing ratio
                if (stats.processing > 0) {
                    alertList.innerHTML += `<li><span class="alert-dot orange"></span> There are ${stats.processing} documents currently marked as Incomplete/Missing that require student action.</li>`;
                }
            }
        } catch (err) {
            console.error("Failed to load alerts", err);
        }
    }

    generateAlerts();
}

// --- 12. STUDENT DASHBOARD LOGIC (Cards & Table) ---
const studentDocsBody = document.getElementById('student-docs-body');

// Only run this script if we are actually on the student dashboard
if (window.location.pathname.includes('student-dashboard')) {

    // 1. Load Student Stats (Summary Cards)
    async function loadStudentStats() {
        try {
            const res = await fetch('/api/student/stats');
            const data = await res.json();
            
            if (data.success) {
                const stats = data.stats;
                
                // Select all the <h2> tags inside the summary cards
                const cards = document.querySelectorAll('.summary-card h2');
                
                if (cards.length >= 4) {
                    cards[0].innerText = stats.submitted || 0;
                    cards[1].innerText = stats.approved || 0;
                    cards[2].innerText = stats.pending || 0;
                    cards[3].innerText = stats.rejected || 0;
                }
            }
        } catch (err) {
            console.error("Failed to load student stats", err);
        }
    }

    // 2. Load Student Documents (The Main Table)
    async function loadStudentTable() {
        if (!studentDocsBody) return; // Failsafe if the table ID is missing
        
        try {
            const res = await fetch('/api/student/documents');
            const data = await res.json();
            
            if (data.success) {
                studentDocsBody.innerHTML = ''; // Clear out any loading text
                
                if(data.documents.length === 0) {
                    studentDocsBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #888;">No documents submitted yet.</td></tr>`;
                    return;
                }

                data.documents.forEach(doc => {
                    // Determine colors based on status
                    let colorClass = doc.status === 'Valid' ? 'text-green' : 
                                     (doc.status === 'Incomplete' || doc.status === 'Missing') ? 'text-red' : 'text-orange';
                    
                    // Format the date (DD/MM/YYYY)
                    let dateObj = new Date(doc.submitted_at);
                    let dateStr = dateObj.toLocaleDateString('en-GB'); 

                    // Swap the button based on the status (Download vs View)
                    let actionBtn = doc.status === 'Valid' 
                        ? `<button class="btn-outline-purple">☁ Download</button>`
                        : `<button class="btn-outline-orange view-details-btn">View</button>`;

                    // Clean up the file name (removes the multer timestamp for a cleaner look)
                    let cleanFileName = doc.file_name.split('-').pop() || doc.file_name;

                    studentDocsBody.innerHTML += `
                        <tr>
                            <td>${cleanFileName}</td>
                            <td>~5 minutes</td> 
                            <td>${dateStr}</td>
                            <td class="${colorClass}">${doc.status}</td>
                            <td>${actionBtn}</td>
                        </tr>
                    `;
                });
            }
        } catch (err) {
            console.error("Failed to load student table", err);
        }
    }

    // Run both functions immediately when the page loads!
    loadStudentStats();
    loadStudentTable();
}

// --- 13. FULL DOCUMENT PAGE LOGIC (Search & Filter) ---
if (window.location.pathname.includes('document.html') || window.location.pathname.includes('/document')) {
    const allDocsBody = document.getElementById('all-documents-body');
    const searchInput = document.getElementById('doc-search');
    const filterSelect = document.getElementById('doc-filter');
    const detailsModal = document.getElementById('details-modal');
    
    let allStudentData = []; // Store data globally for instant filtering

    async function loadAllDocuments() {
        if (!allDocsBody) return;
        try {
            const res = await fetch('/api/student/documents');
            const data = await res.json();
            
            if (data.success) {
                allStudentData = data.documents;
                renderDocsTable(allStudentData);
            }
        } catch (err) {
            console.error("Failed to load documents", err);
        }
    }

    function renderDocsTable(dataToRender) {
        allDocsBody.innerHTML = ''; 

        if (dataToRender.length === 0) {
            allDocsBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #888;">No documents found.</td></tr>`;
            return;
        }

        dataToRender.forEach(doc => {
            let colorClass = doc.status === 'Valid' ? 'text-green' : 
                             (doc.status === 'Incomplete' || doc.status === 'Missing') ? 'text-red' : 'text-orange';
            
            // Format the date (DD/MM/YYYY)
            let dateObj = new Date(doc.submitted_at);
            let dateStr = dateObj.toLocaleDateString('en-GB'); 

            let actionBtn = doc.status === 'Valid' 
                ? `<button class="btn-outline-purple">☁ Download</button>`
                : `<button class="btn-outline-orange view-details-btn" data-status="${doc.status}">View</button>`;

            let cleanFileName = doc.file_name.split('-').pop() || doc.file_name;

            allDocsBody.innerHTML += `
                <tr>
                    <td>${cleanFileName}</td>
                    <td>~5 minutes</td> 
                    <td>${dateStr}</td>
                    <td class="${colorClass}">${doc.status}</td>
                    <td>${actionBtn}</td>
                </tr>
            `;
        });
    }

    // Dynamic Filter & Search Function
    function applyStudentFilters() {
        const searchTerm = searchInput.value.toLowerCase();
        const filterVal = filterSelect.value.toLowerCase();

        const filteredData = allStudentData.filter(doc => {
            // 1. Check Search Bar (matches filename)
            const cleanFileName = (doc.file_name.split('-').pop() || doc.file_name).toLowerCase();
            const matchesSearch = cleanFileName.includes(searchTerm);
            
            // 2. Check Dropdown
            let matchesFilter = true;
            if (filterVal === 'valid') {
                matchesFilter = doc.status === 'Valid';
            } else if (filterVal === 'processing') {
                matchesFilter = (doc.status === 'Processing' || doc.status === 'Submitted');
            } else if (filterVal === 'incomplete') {
                matchesFilter = (doc.status === 'Incomplete' || doc.status === 'Missing');
            }

            return matchesSearch && matchesFilter;
        });

        renderDocsTable(filteredData);
    }

    // Attach listeners for instant feedback
    if (searchInput) searchInput.addEventListener('input', applyStudentFilters);
    if (filterSelect) filterSelect.addEventListener('change', applyStudentFilters);

    // Event Delegation for the "View" buttons (so the modal pops up on dynamically generated buttons)
    if (allDocsBody) {
        allDocsBody.addEventListener('click', (e) => {
            const viewBtn = e.target.closest('.view-details-btn');
            if (viewBtn && detailsModal) {
                detailsModal.style.display = 'flex';
            }
        });
    }

    // Close Modal Logic
    const closeBtn = document.getElementById('close-details-modal');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            detailsModal.style.display = 'none';
        });
    }

    loadAllDocuments(); // Run everything on page load
}

// --- 14. ADMIN DASHBOARD LOGIC (Manage Staff) ---
if (window.location.pathname.includes('admin-dashboard')) {
    const adminUsersBody = document.getElementById('admin-users-body');
    const addStaffModal = document.getElementById('add-staff-modal');
    const addStaffForm = document.getElementById('add-staff-form');
    
    // Edit Modal Elements
    const editStaffModal = document.getElementById('edit-staff-modal');
    const editStaffForm = document.getElementById('edit-staff-form');
    
    let allAdminUsers = []; // Store the user list globally so we can grab their data to edit

    // 1. Fetch and Display the Staff Roster
    async function loadAdminUsers() {
        if (!adminUsersBody) return;
        try {
            const res = await fetch('/api/admin/users');
            const data = await res.json();

            if (data.success) {
                allAdminUsers = data.users; // Save data to our global array
                adminUsersBody.innerHTML = '';
                
                data.users.forEach(user => {
                    let roleBadge = user.role === 'admin' 
                        ? `<span style="background: #FDEDEC; color: #E74C3C; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; font-weight:bold;">Admin</span>`
                        : `<span style="background: #E8F8F5; color: #1ABC9C; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; font-weight:bold;">Staff (${user.office_name || 'No Office'})</span>`;

                    // We added a specific class (edit-btn) and a data-id to the button
                    adminUsersBody.innerHTML += `
                        <tr>
                            <td>#${user.user_id}</td>
                            <td>${user.full_name}</td>
                            <td>${user.email}</td>
                            <td>${roleBadge}</td>
                            <td><button class="btn-outline-purple edit-btn" data-id="${user.user_id}">Edit</button></td>
                        </tr>
                    `;
                });
            }
        } catch (err) {
            console.error("Failed to load users", err);
        }
    }

    // 2. Handle Opening/Closing Modals
    const openAddBtn = document.getElementById('open-add-staff-modal');
    const closeAddBtn = document.getElementById('close-add-staff-modal');
    const closeEditBtn = document.getElementById('close-edit-staff-modal');
    
    if (openAddBtn) openAddBtn.addEventListener('click', () => addStaffModal.style.display = 'flex');
    if (closeAddBtn) closeAddBtn.addEventListener('click', () => { addStaffModal.style.display = 'none'; addStaffForm.reset(); });
    if (closeEditBtn) closeEditBtn.addEventListener('click', () => { editStaffModal.style.display = 'none'; editStaffForm.reset(); });

    // 3. Handle Clicks on the "Edit" Buttons using Event Delegation
    if (adminUsersBody) {
        adminUsersBody.addEventListener('click', (e) => {
            const editBtn = e.target.closest('.edit-btn');
            if (editBtn) {
                const userId = editBtn.getAttribute('data-id');
                // Find this specific user in our stored array
                const userToEdit = allAdminUsers.find(u => u.user_id == userId);

                if (userToEdit) {
                    // Prevent editing of Admin accounts
                    if (userToEdit.role === 'admin') {
                        alert("For security reasons, Master Admins cannot be edited from this panel.");
                        return;
                    }

                    // Pre-fill the modal with the user's data
                    document.getElementById('edit-user-id').value = userToEdit.user_id;
                    document.getElementById('edit-staff-name').value = userToEdit.full_name;
                    document.getElementById('edit-staff-email').value = userToEdit.email;
                    document.getElementById('edit-staff-office').value = userToEdit.office_id || 1;
                    
                    editStaffModal.style.display = 'flex';
                }
            }
        });
    }

    // 4. Submit Add Form
    if (addStaffForm) {
        addStaffForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fullName = document.getElementById('new-staff-name').value;
            const email = document.getElementById('new-staff-email').value;
            const password = document.getElementById('new-staff-password').value;
            const officeId = document.getElementById('new-staff-office').value;

            try {
                const res = await fetch('/api/admin/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fullName, email, password, officeId })
                });
                const data = await res.json();
                if (data.success) {
                    addStaffModal.style.display = 'none';
                    addStaffForm.reset();
                    loadAdminUsers();
                } else {
                    alert("Error: " + data.message);
                }
            } catch (err) { console.error("Error creating staff", err); }
        });
    }

    // 5. Submit Edit Form
    if (editStaffForm) {
        editStaffForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const userId = document.getElementById('edit-user-id').value;
            const fullName = document.getElementById('edit-staff-name').value;
            const email = document.getElementById('edit-staff-email').value;
            const password = document.getElementById('edit-staff-password').value;
            const officeId = document.getElementById('edit-staff-office').value;

            try {
                // Notice the PUT method and the userId attached to the URL
                const res = await fetch(`/api/admin/users/${userId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fullName, email, password, officeId })
                });
                const data = await res.json();
                if (data.success) {
                    editStaffModal.style.display = 'none';
                    editStaffForm.reset();
                    loadAdminUsers(); // Instantly reload table with updated data!
                } else {
                    alert("Error: " + data.message);
                }
            } catch (err) { console.error("Error updating staff", err); }
        });
    }

    loadAdminUsers(); 
}

// --- 15. ADMIN SYSTEM LOGS LOGIC ---
if (window.location.pathname.includes('admin-logs')) {
    const logsBody = document.getElementById('admin-logs-body');
    const logSearch = document.getElementById('log-search');
    let allLogs = [];

    async function loadSystemLogs() {
        if (!logsBody) return;
        try {
            const res = await fetch('/api/admin/logs');
            const data = await res.json();

            if (data.success) {
                allLogs = data.logs;
                renderLogsTable(allLogs);
            }
        } catch (err) {
            console.error("Failed to load logs", err);
        }
    }

    function renderLogsTable(dataToRender) {
        logsBody.innerHTML = '';
        
        if (dataToRender.length === 0) {
            logsBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #888;">No system activity recorded yet.</td></tr>`;
            return;
        }

        dataToRender.forEach(log => {
            let colorClass = log.status === 'Valid' ? 'text-green' : 'text-red';
            let dateObj = new Date(log.completed_at);
            let timeStr = dateObj.toLocaleString([], {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'});

            logsBody.innerHTML += `
                <tr>
                    <td>#${log.transaction_id}</td>
                    <td>${log.student_name}</td>
                    <td>${log.file_name.split('-').pop()}</td>
                    <td><strong>${log.staff_name}</strong> <br><span style="font-size: 0.8rem; color: #777;">${log.office_name}</span></td>
                    <td>${timeStr}</td>
                    <td class="${colorClass}">${log.status}</td>
                </tr>
            `;
        });
    }

    // Real-time Search Filter
    if (logSearch) {
        logSearch.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = allLogs.filter(log => 
                log.staff_name.toLowerCase().includes(term) ||
                log.student_name.toLowerCase().includes(term) ||
                log.transaction_id.toString().includes(term)
            );
            renderLogsTable(filtered);
        });
    }

    loadSystemLogs();
}

// --- 16. ADMIN GLOBAL ANALYTICS LOGIC ---
if (window.location.pathname.includes('admin-analytics')) {
    async function loadGlobalAnalytics() {
        try {
            const res = await fetch('/api/admin/analytics');
            const data = await res.json();

            if (data.success && data.analytics.length > 0) {
                // Prepare the data arrays for the charts
                const labels = data.analytics.map(row => row.office_name);
                const volumeData = data.analytics.map(row => row.total_processed);
                
                // Convert seconds to minutes for the wait time chart, rounded to 1 decimal
                const timeData = data.analytics.map(row => (row.avg_seconds / 60).toFixed(1));

                // 1. Draw Volume Chart (Blue Bars)
                const ctxVolume = document.getElementById('volumeChart').getContext('2d');
                new Chart(ctxVolume, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Total Processed',
                            data: volumeData,
                            backgroundColor: '#4A72A4',
                            borderRadius: 4,
                            maxBarThickness: 60
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: '#F0F0F0' }, border: { display: false } },
                            x: { grid: { display: false }, border: { display: false } }
                        }
                    }
                });

                // 2. Draw Time Chart (Orange Bars)
                const ctxTime = document.getElementById('timeChart').getContext('2d');
                new Chart(ctxTime, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Avg. Wait Time (Mins)',
                            data: timeData,
                            backgroundColor: '#E67E22', // Orange color to distinguish from volume
                            borderRadius: 4,
                            maxBarThickness: 60
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            y: { beginAtZero: true, grid: { color: '#F0F0F0' }, border: { display: false } },
                            x: { grid: { display: false }, border: { display: false } }
                        }
                    }
                });
            } else {
                // If there's no data at all yet
                document.querySelector('.review-grid').innerHTML = "<p style='color:#888; text-align:center; width: 100%;'>Not enough data to generate analytics yet. Process some documents first!</p>";
            }
        } catch (err) {
            console.error("Failed to load global analytics", err);
        }
    }

    loadGlobalAnalytics();
}

// --- 17. PASSWORD VISIBILITY TOGGLE ---
const togglePasswordBtn = document.getElementById('toggle-password');
const passwordInput = document.getElementById('password');

if (togglePasswordBtn && passwordInput) {
    togglePasswordBtn.addEventListener('click', function () {
        // 1. Toggle the input type between password and text
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        
        // 2. Swap the SVG icon
        const eyeIcon = document.getElementById('eye-icon');
        if (type === 'text') {
            // "Eye Off" Icon (Slash through it)
            eyeIcon.innerHTML = `
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                <line x1="1" y1="1" x2="23" y2="23"></line>
            `;
        } else {
            // Default "Eye Open" Icon
            eyeIcon.innerHTML = `
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
            `;
        }
    });
}