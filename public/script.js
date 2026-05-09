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
            
            // FIX: Now it checks if ANY part of the URL contains "staff-"
            const isStaffPage = currentPath.includes('staff-'); 
            
            // Fetch staff-header.html for staff, header.html for students
            const headerFile = isStaffPage ? 'staff-header.html' : 'header.html';
            
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
                // Check the role sent from the database and redirect accordingly!
                if (data.role === 'staff' || data.role === 'admin') {
                    window.location.href = '/staff-dashboard.html';
                } else {
                    window.location.href = '/student-dashboard.html';
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
    
    // 1. Animate the CSS Bar Chart
    const bars = document.querySelectorAll('.bar');
    // Start them at 0%
    bars.forEach(bar => {
        const targetHeight = bar.style.height;
        bar.style.height = '0%';
        // Animate up to their target height
        setTimeout(() => {
            bar.style.height = targetHeight;
        }, 300);
    });

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


