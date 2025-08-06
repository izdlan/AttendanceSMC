// Global variables
let scanHistory = [];
let students = [];
let forms = [];
let cameraStream = null;
let isCameraActive = false;
let isProcessingScan = false; // Prevent multiple simultaneous scans
let currentScannedBarcode = null; // Store the currently scanned barcode for confirmation
let currentScannedStudent = null; // Store the scanned student data

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    // Set today's date as default
    document.getElementById('reportDate').value = new Date().toISOString().split('T')[0];
    
    // Load initial data
    loadForms();
    loadStats();
    loadStudents();
    
    // Set up barcode scanner input
    setupBarcodeScanner();
    
    // Set up camera UI
    setupCameraUI();
    
    // Load today's attendance report by default
    loadAttendanceReport();
    
    // Set up search functionality
    setupSearch();
    
    console.log('SMK Chukai Attendance System initialized');
});

// Tab functionality
function showTab(tabName) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Remove active class from all tab buttons
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active');
    });
    
    // Show selected tab content
    document.getElementById(tabName).classList.add('active');
    
    // Add active class to clicked tab button
    event.target.classList.add('active');
    
    // Handle camera for scan tab
    if (tabName === 'scan') {
        setTimeout(() => {
            document.getElementById('barcodeInput').focus();
            // Auto-start camera on mobile devices when scan tab is active
            if (isMobileDevice() && !isCameraActive) {
                startCamera();
            }
        }, 100);
    } else {
        // Stop camera when leaving scan tab
        if (isCameraActive) {
            stopCamera();
        }
    }
}

// Setup barcode scanner
function setupBarcodeScanner() {
    const barcodeInput = document.getElementById('barcodeInput');
    let barcodeBuffer = '';
    let lastKeystroke = 0;
    let submitTimeout = null;
    
    // Handle barcode scanner input
    barcodeInput.addEventListener('input', function(e) {
        const currentTime = new Date().getTime();
        
        // Clear any existing timeout
        if (submitTimeout) {
            clearTimeout(submitTimeout);
        }
        
        // If time between keystrokes is less than 50ms, it's likely from a scanner
        if (currentTime - lastKeystroke < 50) {
            barcodeBuffer += e.target.value.slice(-1);
        } else {
            barcodeBuffer = e.target.value;
        }
        
        lastKeystroke = currentTime;
        
        // Auto-submit after a brief delay (for scanners that don't send Enter)
        submitTimeout = setTimeout(() => {
            if (barcodeBuffer && currentTime - lastKeystroke >= 100) {
                processBarcode(barcodeBuffer);
                barcodeInput.value = '';
                barcodeBuffer = '';
            }
        }, 1000); // 1 second delay for auto-submit - better user experience
    });
    
    // Handle Enter key for manual input
    barcodeInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && e.target.value.trim()) {
            // Clear the auto-submit timeout since Enter was pressed
            if (submitTimeout) {
                clearTimeout(submitTimeout);
            }
            processBarcode(e.target.value.trim());
            e.target.value = '';
            barcodeBuffer = '';
        }
    });
    
    // Keep focus on barcode input
    barcodeInput.addEventListener('blur', function() {
        setTimeout(() => {
            if (document.getElementById('scan').classList.contains('active')) {
                this.focus();
            }
        }, 100);
    });
    
    // Handle Enter key for manual input field
    const manualInput = document.getElementById('manualBarcode');
    manualInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            submitManualBarcode();
        }
    });
}

// Handle manual barcode input
function submitManualBarcode() {
    const manualInput = document.getElementById('manualBarcode');
    const barcode = manualInput.value.trim();
    
    if (barcode) {
        processBarcode(barcode);
        manualInput.value = '';
    }
}

// Add auto-submit for manual input as well
document.addEventListener('DOMContentLoaded', function() {
    const manualInput = document.getElementById('manualBarcode');
    let manualSubmitTimeout = null;
    
    if (manualInput) {
        manualInput.addEventListener('input', function(e) {
            const currentTime = new Date().getTime();
            
            // Clear any existing timeout
            if (manualSubmitTimeout) {
                clearTimeout(manualSubmitTimeout);
            }
            
            // Auto-submit after 1 second of no typing
            manualSubmitTimeout = setTimeout(() => {
                const barcode = e.target.value.trim();
                if (barcode) {
                    processBarcode(barcode);
                    e.target.value = '';
                }
            }, 1000);
        });
        
        // Handle Enter key for manual input
        manualInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && e.target.value.trim()) {
                // Clear the auto-submit timeout since Enter was pressed
                if (manualSubmitTimeout) {
                    clearTimeout(manualSubmitTimeout);
                }
                processBarcode(e.target.value.trim());
                e.target.value = '';
            }
        });
    }
});

// Process barcode scan
async function processBarcode(barcode) {
    if (!barcode || barcode.trim() === '') {
        showToast('Please scan a valid barcode', 'error');
        return;
    }
    
    // Prevent multiple simultaneous scans
    if (isProcessingScan) {
        console.log('Scan already in progress, ignoring duplicate scan');
        return;
    }
    
    isProcessingScan = true;
    
    try {
        showToast('Processing scan...', 'info');
        
        // Get current client time
        const now = new Date();
        const clientTime = now.toLocaleTimeString('en-US', { 
            hour12: false,
            timeZone: 'Asia/Kuala_Lumpur' // Malaysia timezone
        });
        
        const response = await fetch('/api/attendance/scan', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                barcode: barcode.trim(),
                clientTime: clientTime
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            // Add to scan history
            const scanEntry = {
                student: result.student,
                action: result.action,
                time: result.time || new Date().toLocaleTimeString(),
                message: result.message
            };
            
            scanHistory.unshift(scanEntry);
            if (scanHistory.length > 10) {
                scanHistory = scanHistory.slice(0, 10);
            }
            
            updateScanHistory();
            loadStats();
            
            // Handle different action types
            if (result.action === 'cooldown_checkout' || result.action === 'cooldown_checkin') {
                showToast(result.message, 'warning');
            } else if (result.action === 'early_checkin' || result.action === 'late_checkin' || result.action === 'duplicate_checkin') {
                showToast(result.message, 'warning');
            } else {
                showToast(result.message, 'success');
                // Play success sound (if available)
                playSuccessSound();
            }
            
        } else {
            showToast(result.error || 'Scan failed', 'error');
        }
        
    } catch (error) {
        console.error('Scan error:', error);
        showToast('Connection error. Please try again.', 'error');
    } finally {
        // Reset the processing flag after a delay
        setTimeout(() => {
            isProcessingScan = false;
        }, 2000); // 2 second cooldown to prevent rapid duplicate scans
    }
    
    // Refocus on barcode input
    setTimeout(() => {
        document.getElementById('barcodeInput').focus();
    }, 100);
}

// Update scan history display
function updateScanHistory() {
    const historyContainer = document.getElementById('scanHistory');
    
    if (scanHistory.length === 0) {
        historyContainer.innerHTML = '<p style="color: #666; text-align: center;">No recent activity</p>';
        return;
    }
    
    historyContainer.innerHTML = scanHistory.map(entry => {
        let actionClass = entry.action;
        let icon = '';
        
        // Add appropriate icons and styling for different actions
        switch(entry.action) {
            case 'checkin':
                icon = '✅';
                break;
            case 'early_checkin':
                icon = '⏰';
                actionClass += ' cooldown-message';
                break;
            case 'late_checkin':
                icon = '🚫';
                actionClass += ' cooldown-message';
                break;
            case 'duplicate_checkin':
                icon = '⚠️';
                actionClass += ' cooldown-message';
                break;
            case 'cooldown_checkin':
                icon = '⏳';
                actionClass += ' cooldown-message';
                break;
            default:
                icon = '📝';
        }
        
        return `
            <div class="scan-entry ${actionClass}">
                <div class="student-name">${entry.student.name}</div>
                <div class="scan-action ${entry.action.includes('cooldown') || entry.action.includes('early') || entry.action.includes('late') || entry.action.includes('duplicate') ? 'cooldown-message' : ''}">
                    ${icon} ${entry.message}
                </div>
                <div class="scan-time">${entry.time}</div>
            </div>
        `;
    }).join('');
}

// Load forms data
async function loadForms() {
    try {
        console.log('Loading forms from API...');
        const response = await fetch('/api/forms');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        forms = await response.json();
        console.log('Forms loaded successfully:', forms);
        
        // Check if we have all the expected forms (including T6S3 and T6S1)
        const expectedForms = ['1', '2', '3', '4', '5', 'T6S3', 'T6S1'];
        const loadedFormIds = forms.map(f => f.form.toString());
        const missingForms = expectedForms.filter(f => !loadedFormIds.includes(f));
        
        if (missingForms.length > 0) {
            console.warn('Missing forms from API:', missingForms, 'Using fallback data');
            throw new Error('Incomplete forms data from API');
        }
        
        // Load classes after forms are loaded
        loadClasses();
        
    } catch (error) {
        console.error('Error loading forms:', error);
        // Fallback forms data if API fails
        forms = [
            { form: 1, classes: ['Advance', 'Brilliant', 'Creative', 'Dynamic', 'Excellent', 'Generous', 'Honest'] },
            { form: 2, classes: ['Advance', 'Brilliant', 'Creative', 'Dynamic', 'Excellent', 'Generous', 'Honest'] },
            { form: 3, classes: ['Advance', 'Brilliant', 'Creative', 'Dynamic', 'Excellent', 'Generous', 'Honest'] },
            { form: 4, classes: ['Advance', 'Brilliant', 'Creative', 'Dynamic', 'Excellent', 'Generous', 'Honest'] },
            { form: 5, classes: ['Advance', 'Brilliant', 'Creative', 'Dynamic', 'Excellent', 'Generous', 'Honest'] },
            { form: 63, classes: ['Al Ghazali', 'Al Idrisi', 'Al Qazwani'] },
            { form: 61, classes: ['Ibnu Battutah', 'Ibnu Khaldun', 'Ibnu Qayyum'] }
        ];
        console.log('Using fallback forms data:', forms);
        loadClasses();
    }
}

// Load classes based on selected form
function loadClasses() {
    const formSelect = document.getElementById('studentForm');
    const classSelect = document.getElementById('studentClass');
    const filterFormSelect = document.getElementById('filterForm');
    const filterClassSelect = document.getElementById('filterClass');
    
    const selectedForm = parseInt(formSelect.value);
    const filterForm = parseInt(filterFormSelect.value);
    
    console.log('Loading classes for form:', selectedForm, 'Forms data:', forms);
    console.log('Forms array length:', forms.length);
    
    // Clear class options
    classSelect.innerHTML = '<option value="">Select Class</option>';
    filterClassSelect.innerHTML = '<option value="">All Classes</option>';
    
    if (selectedForm && forms.length > 0) {
        // Handle numeric form values
        console.log('Looking for form:', selectedForm, 'Type:', typeof selectedForm);
        const formData = forms.find(f => {
            console.log('Comparing with form:', f.form, 'Type:', typeof f.form, 'Match:', f.form === selectedForm);
            return f.form === selectedForm;
        });
        console.log('Found form data:', formData);
        console.log('Available forms:', forms.map(f => f.form));
        
        if (formData && formData.classes) {
            console.log('Loading classes for form', selectedForm, ':', formData.classes);
            formData.classes.forEach(className => {
                const option = document.createElement('option');
                option.value = className;
                option.textContent = className;
                classSelect.appendChild(option);
            });
            console.log('Loaded classes for form', selectedForm, ':', formData.classes);
        } else {
            console.warn('No form data found for form:', selectedForm);
            console.warn('Available forms:', forms.map(f => ({ form: f.form, classes: f.classes })));
        }
    }
    
    if (filterForm && forms.length > 0) {
        // Handle numeric form values
        const formData = forms.find(f => f.form === filterForm);
        if (formData && formData.classes) {
            formData.classes.forEach(className => {
                const option = document.createElement('option');
                option.value = className;
                option.textContent = className;
                filterClassSelect.appendChild(option);
            });
        }
    } else if (!filterForm && forms.length > 0) {
        // Show all classes in logical order when no form is selected
        const allClasses = [];
        
        // Add Form 1-5 classes in order
        for (let form = 1; form <= 5; form++) {
            const formData = forms.find(f => f.form === form);
            if (formData && formData.classes) {
                formData.classes.forEach(className => {
                    allClasses.push({
                        value: className,
                        text: `Form ${form} ${className}`,
                        form: form
                    });
                });
            }
        }
        
        // Add Form 6S3 classes
        const form63Data = forms.find(f => f.form === 63);
        if (form63Data && form63Data.classes) {
            form63Data.classes.forEach(className => {
                allClasses.push({
                    value: className,
                    text: `Form 6S3 ${className}`,
                    form: 63
                });
            });
        }
        
        // Add Form 6S1 classes
        const form61Data = forms.find(f => f.form === 61);
        if (form61Data && form61Data.classes) {
            form61Data.classes.forEach(className => {
                allClasses.push({
                    value: className,
                    text: `Form 6S1 ${className}`,
                    form: 61
                });
            });
        }
        
        // Add all classes to filter dropdown
        allClasses.forEach(classInfo => {
            const option = document.createElement('option');
            option.value = classInfo.value;
            option.textContent = classInfo.text;
            filterClassSelect.appendChild(option);
        });
    }
}

// Load statistics
async function loadStats() {
    try {
        const response = await fetch('/api/stats');
        const stats = await response.json();
        
        document.getElementById('totalStudents').textContent = stats.total_students || 0;
        document.getElementById('presentToday').textContent = stats.present_today || 0;
        document.getElementById('lateToday').textContent = stats.late_today || 0;
        document.getElementById('absentToday').textContent = stats.absent_today || 0;
        
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Student management functions
function showAddStudentForm() {
    document.getElementById('addStudentForm').classList.remove('hidden');
    document.getElementById('studentName').focus();
}

function hideAddStudentForm() {
    document.getElementById('addStudentForm').classList.add('hidden');
    document.getElementById('addStudentForm').querySelector('form').reset();
    document.getElementById('studentClass').innerHTML = '<option value="">Select Class</option>';
}

async function addStudent(event) {
    event.preventDefault();
    
    const studentNameElement = document.getElementById('studentName');
    const studentFormElement = document.getElementById('studentForm');
    const studentClassElement = document.getElementById('studentClass');
    
    if (!studentNameElement || !studentFormElement || !studentClassElement) {
        console.error('Form elements not found');
        showToast('Form elements not found', 'error');
        return;
    }
    
    const studentName = studentNameElement.value.trim();
    const studentForm = studentFormElement.value;
    const studentClass = studentClassElement.value.trim();
    
    console.log('Form values:', { studentName, studentForm, studentClass });
    
    if (!studentName || !studentForm || !studentClass) {
        console.log('Validation failed:', { studentName, studentForm, studentClass });
        showToast('Please fill in all fields', 'error');
        return;
    }
    
    // Student ID will be auto-generated on the server
    
    try {
        const response = await fetch('/api/students', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: studentName,
                form: parseInt(studentForm),
                class: studentClass
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showToast(`Student ${studentName} added successfully`, 'success');
            hideAddStudentForm();
            loadStudents();
            loadStats();
        } else {
            showToast(result.error || 'Failed to add student', 'error');
        }
        
    } catch (error) {
        console.error('Error adding student:', error);
        showToast('Connection error. Please try again.', 'error');
    }
}

// Load students list with filters
async function loadStudents() {
    try {
        const filterForm = document.getElementById('filterForm').value;
        const filterClass = document.getElementById('filterClass').value;
        
        let url = '/api/students';
        const params = new URLSearchParams();
        
        if (filterForm) params.append('form', filterForm);
        if (filterClass) params.append('class', filterClass);
        
        if (params.toString()) {
            url += '?' + params.toString();
        }
        
        const response = await fetch(url);
        students = await response.json();
        displayStudents(students);
    } catch (error) {
        console.error('Error loading students:', error);
        showToast('Failed to load students', 'error');
    }
}

// Bulk import functions
function showBulkImportForm() {
    document.getElementById('bulkImportForm').classList.remove('hidden');
    document.getElementById('addStudentForm').classList.add('hidden');
}

function hideBulkImportForm() {
    document.getElementById('bulkImportForm').classList.add('hidden');
    document.getElementById('bulkImportForm').querySelector('form').reset();
}

async function bulkImportStudents(event) {
    event.preventDefault();
    
    const fileInput = document.getElementById('csvFile');
    const file = fileInput.files[0];
    
    if (!file) {
        showToast('Please select a CSV file', 'error');
        return;
    }
    
    if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
        showToast('Please select a valid CSV file', 'error');
        return;
    }
    
    try {
        const text = await file.text();
        const lines = text.split('\n');
        
        if (lines.length < 2) {
            showToast('CSV file must have at least a header row and one data row', 'error');
            return;
        }
        
        // Parse header
        const header = lines[0].split(',').map(h => h.trim().toLowerCase());
        const nameIndex = header.indexOf('name');
        const formIndex = header.indexOf('form');
        const classIndex = header.indexOf('class');
        
        if (nameIndex === -1 || formIndex === -1 || classIndex === -1) {
            showToast('CSV must have columns: Name, Form, Class', 'error');
            return;
        }
        
        // Parse data rows
        const students = [];
        let successCount = 0;
        let errorCount = 0;
        const errors = [];
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const values = line.split(',').map(v => v.trim());
            if (values.length < 3) continue;
            
            const name = values[nameIndex];
            const form = parseInt(values[formIndex]);
            const className = values[classIndex];
            
            if (!name || !form || !className) {
                errorCount++;
                errors.push(`Row ${i + 1}: Missing required data`);
                continue;
            }
            
            // Validate form
            const validForms = [1, 2, 3, 4, 5, 63, 61];
            if (!validForms.includes(form)) {
                errorCount++;
                errors.push(`Row ${i + 1}: Invalid form ${form}`);
                continue;
            }
            
            // Validate class based on form
            const formData = forms.find(f => f.form === form);
            if (!formData || !formData.classes.includes(className)) {
                errorCount++;
                errors.push(`Row ${i + 1}: Invalid class "${className}" for form ${form}`);
                continue;
            }
            
            students.push({ name, form, class: className });
        }
        
        if (students.length === 0) {
            showToast('No valid students found in CSV file', 'error');
            return;
        }
        
        // Import students
        showToast(`Importing ${students.length} students...`, 'info');
        
        for (const student of students) {
            try {
                const response = await fetch('/api/students', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        name: student.name,
                        form: student.form,
                        class: student.class
                    })
                });
                
                if (response.ok) {
                    successCount++;
                } else {
                    const result = await response.json();
                    errorCount++;
                    errors.push(`${student.name}: ${result.error || 'Failed to add'}`);
                }
            } catch (error) {
                errorCount++;
                errors.push(`${student.name}: Connection error`);
            }
        }
        
        // Show results
        if (successCount > 0) {
            showToast(`Successfully imported ${successCount} students`, 'success');
            loadStudents();
            loadStats();
        }
        
        if (errorCount > 0) {
            console.error('Import errors:', errors);
            showToast(`${errorCount} students failed to import. Check console for details.`, 'warning');
        }
        
        hideBulkImportForm();
        
    } catch (error) {
        console.error('Error processing CSV:', error);
        showToast('Error processing CSV file', 'error');
    }
}

// Filter students
function filterStudents() {
    const searchTerm = document.getElementById('searchStudents').value.toLowerCase();
    const filterForm = document.getElementById('filterForm').value;
    const filterClass = document.getElementById('filterClass').value;
    
    console.log('Filtering with:', { searchTerm, filterForm, filterClass });
    
    // If we have form/class filters, reload from server
    if (filterForm || filterClass) {
        loadStudents();
        return;
    }
    
    // Otherwise, filter locally
    let filteredStudents = students;
    
    // Apply search filter
    if (searchTerm) {
        filteredStudents = filteredStudents.filter(student => 
            student.name.toLowerCase().includes(searchTerm) ||
            student.student_id.toLowerCase().includes(searchTerm) ||
            student.class.toLowerCase().includes(searchTerm)
        );
    }
    
    displayStudents(filteredStudents);
}

// Sort students by form and class in logical order
function sortStudentsByFormAndClass(students) {
    // Define the logical order of forms
    const formOrder = [1, 2, 3, 4, 5, 63, 61]; // Form 1-5, then 6S3 (63), then 6S1 (61)
    
    // Define class order for each form
    const classOrder = {
        1: ['Advance', 'Brilliant', 'Creative', 'Dynamic', 'Excellent', 'Generous', 'Honest'],
        2: ['Advance', 'Brilliant', 'Creative', 'Dynamic', 'Excellent', 'Generous', 'Honest'],
        3: ['Advance', 'Brilliant', 'Creative', 'Dynamic', 'Excellent', 'Generous', 'Honest'],
        4: ['Advance', 'Brilliant', 'Creative', 'Dynamic', 'Excellent', 'Generous', 'Honest'],
        5: ['Advance', 'Brilliant', 'Creative', 'Dynamic', 'Excellent', 'Generous', 'Honest'],
        63: ['Al Ghazali', 'Al Idrisi', 'Al Qazwani'],
        61: ['Ibnu Battutah', 'Ibnu Khaldun', 'Ibnu Qayyum']
    };
    
    return students.sort((a, b) => {
        // First, sort by form order
        const formA = formOrder.indexOf(a.form);
        const formB = formOrder.indexOf(b.form);
        
        if (formA !== formB) {
            return formA - formB;
        }
        
        // If same form, sort by class order
        const classOrderForForm = classOrder[a.form] || [];
        const classA = classOrderForForm.indexOf(a.class);
        const classB = classOrderForForm.indexOf(b.class);
        
        if (classA !== classB) {
            return classA - classB;
        }
        
        // If same form and class, sort by name
        return a.name.localeCompare(b.name);
    });
}

// Display students
function displayStudents(studentsToShow) {
    const studentsList = document.getElementById('studentsList');
    
    if (studentsToShow.length === 0) {
        studentsList.innerHTML = '<p style="color: #666; text-align: center;">No students found</p>';
        return;
    }
    
    // Sort students by form and class before displaying
    const sortedStudents = sortStudentsByFormAndClass(studentsToShow);
    
    studentsList.innerHTML = sortedStudents.map(student => `
        <div class="student-card">
            <div class="student-info">
                <h4>${student.name}</h4>
                <p><strong>ID:</strong> ${student.student_id} | <strong>Form:</strong> ${student.form} | <strong>Class:</strong> ${student.class}</p>
                <p><strong>Barcode:</strong> ${student.barcode}</p>
            </div>
            <div class="student-actions">
                <button class="btn-small btn-info" onclick="showStudentBarcode('${student.barcode}', '${student.name}', '${student.student_id}', '${student.class}', ${student.form})">
                    <i class="fas fa-qrcode"></i> Show Barcode
                </button>
                <button class="btn-small btn-warning" onclick="editStudent(${student.id}, '${student.name}', ${student.form}, '${student.class}')">
                    <i class="fas fa-edit"></i> Edit
                </button>
                <button class="btn-small btn-danger" onclick="deleteStudent(${student.id}, '${student.name}')">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </div>
        </div>
    `).join('');
}

// Edit student
function editStudent(id, name, form, className) {
    // For now, we'll just show a simple edit form
    const newName = prompt('Enter new name for student:', name);
    const newForm = prompt('Enter new form (1-5):', form);
    const newClass = prompt('Enter new class:', className);
    
    if (newName && newForm && newClass) {
        updateStudent(id, newName, parseInt(newForm), newClass);
    }
}

// Update student
async function updateStudent(id, name, form, className) {
    try {
        const response = await fetch(`/api/students/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: name,
                form: form,
                class: className
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showToast('Student updated successfully', 'success');
            loadStudents();
        } else {
            showToast(result.error || 'Failed to update student', 'error');
        }
        
    } catch (error) {
        console.error('Error updating student:', error);
        showToast('Connection error. Please try again.', 'error');
    }
}

// Delete student
async function deleteStudent(id, name) {
    if (!confirm(`Are you sure you want to delete ${name}?`)) {
        return;
    }
    
    try {
        let response = await fetch(`/api/students/${id}`, {
            method: 'DELETE'
        });
        
        let result = await response.json();
        
        if (response.ok) {
            showToast('Student deleted successfully', 'success');
            loadStudents();
            loadStats();
        } else if (response.status === 400 && result.error.includes('attendance records')) {
            // Ask user if they want to delete attendance records too
            if (confirm(`${result.error}\n\nDo you want to delete all attendance records for this student as well?`)) {
                response = await fetch(`/api/students/${id}?cascade=true`, {
                    method: 'DELETE'
                });
                
                result = await response.json();
                
                if (response.ok) {
                    showToast('Student and all attendance records deleted successfully', 'success');
                    loadStudents();
                    loadStats();
                } else {
                    showToast(result.error || 'Failed to delete student', 'error');
                }
            }
        } else {
            showToast(result.error || 'Failed to delete student', 'error');
        }
        
    } catch (error) {
        console.error('Error deleting student:', error);
        showToast('Connection error. Please try again.', 'error');
    }
}

// Setup search functionality
function setupSearch() {
    const searchInput = document.getElementById('searchStudents');
    const filterFormSelect = document.getElementById('filterForm');
    const filterClassSelect = document.getElementById('filterClass');
    
    searchInput.addEventListener('input', function() {
        filterStudents();
    });
    
    // Add event listeners for filter dropdowns
    if (filterFormSelect) {
        filterFormSelect.addEventListener('change', function() {
            console.log('Form filter changed to:', this.value);
            loadClasses(); // Update class options
            loadStudents(); // Reload students
        });
    }
    
    if (filterClassSelect) {
        filterClassSelect.addEventListener('change', function() {
            console.log('Class filter changed to:', this.value);
            loadStudents(); // Reload students
        });
    }
    
    // Add event listener for student form dropdown
    const studentFormSelect = document.getElementById('studentForm');
    if (studentFormSelect) {
        studentFormSelect.addEventListener('change', function() {
            console.log('Student form changed to:', this.value);
            loadClasses(); // Update class options
        });
    }
    
    // Add event listeners for report filters
    const reportFilterFormSelect = document.getElementById('reportFilterForm');
    const reportFilterClassSelect = document.getElementById('reportFilterClass');
    
    if (reportFilterFormSelect) {
        reportFilterFormSelect.addEventListener('change', function() {
            console.log('Report form filter changed to:', this.value);
            loadReportClasses(); // Update report class options
        });
    }
    
    if (reportFilterClassSelect) {
        reportFilterClassSelect.addEventListener('change', function() {
            console.log('Report class filter changed to:', this.value);
        });
    }
}

// Show student barcode modal
function showStudentBarcode(barcode, name, studentId, studentClass, form) {
    const modal = document.getElementById('barcodeModal');
    const barcodeDisplay = document.getElementById('barcodeDisplay');
    const studentInfo = document.getElementById('studentInfo');
    
    // Generate barcode using JsBarcode
    barcodeDisplay.innerHTML = '<svg id="barcode"></svg>';
    JsBarcode("#barcode", barcode, {
        format: "CODE128",
        width: 2,
        height: 80,
        displayValue: true,
        fontSize: 16,
        textMargin: 10
    });
    
    // Display student info with download button
    studentInfo.innerHTML = `
        <h4>${name}</h4>
        <p><strong>Student ID:</strong> ${studentId}</p>
        <p><strong>Form:</strong> ${form}</p>
        <p><strong>Class:</strong> ${studentClass}</p>
        <p><strong>Barcode:</strong> ${barcode}</p>
        <div style="margin-top: 20px; text-align: center;">
            <button class="btn-primary" onclick="downloadSingleBarcode('${barcode}', '${name}', '${studentId}', '${studentClass}', ${form})">
                <i class="fas fa-download"></i> Download Barcode
            </button>
        </div>
    `;
    
    modal.style.display = 'block';
}

// Close barcode modal
function closeBarcodeModal() {
    document.getElementById('barcodeModal').style.display = 'none';
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('barcodeModal');
    if (event.target == modal) {
        modal.style.display = 'none';
    }
}

// Load attendance report with filters
async function loadAttendanceReport() {
    const reportDate = document.getElementById('reportDate').value;
    const reportType = document.getElementById('reportType').value;
    const filterForm = document.getElementById('reportFilterForm').value;
    const filterClass = document.getElementById('reportFilterClass').value;
    
    if (!reportDate) {
        showToast('Please select a date', 'error');
        return;
    }
    
    try {
        let url = '';
        if (reportType === 'attendance') {
            url = `/api/attendance/${reportDate}`;
        } else {
            url = `/api/absent-late/${reportDate}`;
        }
        
        // Add filters to URL
        const params = new URLSearchParams();
        if (filterForm) params.append('form', filterForm);
        if (filterClass) params.append('class', filterClass);
        
        if (params.toString()) {
            url += '?' + params.toString();
        }
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (reportType === 'attendance') {
            displayAttendanceReport(data, reportDate);
        } else {
            displayAbsentLateReport(data, reportDate);
        }
        
    } catch (error) {
        console.error('Error loading report:', error);
        showToast('Failed to load report', 'error');
    }
}

// Display attendance report
function displayAttendanceReport(attendance, date) {
    const reportContainer = document.getElementById('attendanceReport');
    
    if (attendance.length === 0) {
        reportContainer.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #666;">
                <i class="fas fa-calendar-times" style="font-size: 3em; margin-bottom: 20px;"></i>
                <h3>No attendance records found for ${new Date(date).toLocaleDateString()}</h3>
            </div>
        `;
        return;
    }
    
    const table = `
        <table class="attendance-table">
            <thead>
                <tr>
                    <th><i class="fas fa-user"></i> Student Name</th>
                    <th><i class="fas fa-id-card"></i> Student ID</th>
                    <th><i class="fas fa-graduation-cap"></i> Form</th>
                    <th><i class="fas fa-users"></i> Class</th>
                    <th><i class="fas fa-clock"></i> Time In</th>
                    <th><i class="fas fa-check-circle"></i> Status</th>
                </tr>
            </thead>
            <tbody>
                ${attendance.map(record => {
                    let statusClass = 'status-present';
                    let statusText = 'Present';
                    
                    if (record.status === 'late') {
                        statusClass = 'status-late';
                        statusText = 'LATE';
                    } else if (!record.time_in) {
                        statusClass = 'status-absent';
                        statusText = 'Absent';
                    }
                    
                    return `
                        <tr>
                            <td>${record.name}</td>
                            <td>${record.student_id}</td>
                            <td>Form ${record.form}</td>
                            <td>${record.class}</td>
                            <td>${record.time_in || '-'}</td>
                            <td>
                                <span class="status-badge ${statusClass}">
                                    ${statusText}
                                </span>
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
        
        <div style="margin-top: 20px; text-align: center;">
            <button class="btn-primary" onclick="exportAttendance('${date}')">
                <i class="fas fa-download"></i> Export to CSV
            </button>
        </div>
    `;
    
    reportContainer.innerHTML = table;
}

// Export attendance to CSV
async function exportAttendance(date) {
    try {
        const response = await fetch(`/api/attendance/${date}`);
        const attendance = await response.json();
        
        if (attendance.length === 0) {
            showToast('No data to export', 'warning');
            return;
        }
        
        // Create CSV content
        const headers = ['Student Name', 'Student ID', 'Form', 'Class', 'Time In', 'Status'];
        const csvContent = [
            headers.join(','),
            ...attendance.map(record => [
                `"${record.name}"`,
                record.student_id,
                `Form ${record.form}`,
                `"${record.class}"`,
                record.time_in || '',
                record.time_in ? 'Present' : 'Absent'
            ].join(','))
        ].join('\n');
        
        // Download CSV file
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `attendance_${date}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        showToast('Attendance report exported successfully', 'success');
        
    } catch (error) {
        console.error('Error exporting attendance:', error);
        showToast('Failed to export attendance report', 'error');
    }
}

// Export all student barcodes for printing
async function exportAllBarcodes() {
    await exportBarcodesByFilter();
}

// Export barcodes by specific class
async function exportBarcodesByClass() {
    const filterForm = document.getElementById('filterForm').value;
    const filterClass = document.getElementById('filterClass').value;
    
    if (!filterForm && !filterClass) {
        showToast('Please select a form and/or class to print barcodes', 'error');
        return;
    }
    
    await exportBarcodesByFilter(filterForm, filterClass);
}

// Export barcodes with optional filtering
async function exportBarcodesByFilter(formFilter = null, classFilter = null) {
    try {
        let url = '/api/students';
        const params = [];
        
        // Build query parameters for filtering
        if (formFilter || classFilter) {
            url += '?';
            if (formFilter) {
                url += 'form=' + formFilter;
                params.push('form=' + formFilter);
            }
            if (classFilter) {
                if (formFilter) url += '&';
                url += 'class=' + classFilter;
                params.push('class=' + classFilter);
            }
        }
        
        const response = await fetch(url);
        const students = await response.json();
        
        if (students.length === 0) {
            showToast('No students found for the selected criteria', 'error');
            return;
        }
        
        // Create filter description
        let filterDescription = 'All Students';
        if (formFilter && classFilter) {
            filterDescription = `Form ${formFilter}, Class ${classFilter}`;
        } else if (formFilter) {
            filterDescription = `Form ${formFilter}`;
        } else if (classFilter) {
            filterDescription = `Class ${classFilter}`;
        }
        
        // Create printable HTML
        let printContent = `
            <html>
            <head>
                <title>Student Barcodes - ${filterDescription} - SMK Chukai</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    .header { text-align: center; margin-bottom: 30px; }
                    .filter-info { background: #f0f0f0; padding: 10px; margin-bottom: 20px; border-radius: 5px; }
                    .barcode-item { 
                        border: 1px solid #ccc; 
                        margin: 10px 0; 
                        padding: 15px; 
                        page-break-inside: avoid;
                        text-align: center;
                    }
                    .student-info { margin-bottom: 10px; }
                    .barcode-container { margin: 10px 0; }
                    .summary { margin-top: 20px; padding: 10px; background: #e8f4fd; border-radius: 5px; }
                    @media print {
                        .barcode-item { page-break-inside: avoid; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>Student Barcodes - SMK Chukai</h1>
                    <h2>${filterDescription}</h2>
                    <p>Generated on: ${new Date().toLocaleDateString()}</p>
                </div>
                
                <div class="filter-info">
                    <strong>Filter:</strong> ${filterDescription} | <strong>Total Students:</strong> ${students.length}
                </div>
        `;
        
        students.forEach((student, index) => {
            printContent += `
                <div class="barcode-item">
                    <div class="student-info">
                        <h3>${student.name}</h3>
                        <p><strong>ID:</strong> ${student.student_id} | <strong>Form:</strong> ${student.form} | <strong>Class:</strong> ${student.class}</p>
                    </div>
                    <div class="barcode-container">
                        <svg id="barcode-${index}"></svg>
                    </div>
                </div>
            `;
        });
        
        printContent += `
                <div class="summary">
                    <p><strong>Summary:</strong></p>
                    <p>• Total Students: ${students.length}</p>
                    <p>• Filter: ${filterDescription}</p>
                    <p>• Generated: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
                </div>
            </body>
            <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
            <script>
                ${students.map((student, index) => `
                    JsBarcode("#barcode-${index}", "${student.barcode}", {
                        format: "CODE128",
                        width: 2,
                        height: 60,
                        displayValue: true,
                        fontSize: 14,
                        textMargin: 5
                    });
                `).join('')}
            </script>
            </html>
        `;
        
        // Open in new window for printing
        const printWindow = window.open('', '_blank');
        printWindow.document.write(printContent);
        printWindow.document.close();
        printWindow.focus();
        
        // Auto-print after a short delay
        setTimeout(() => {
            printWindow.print();
        }, 500);
        
        showToast(`Barcode export for ${filterDescription} opened in new window`, 'success');
        
    } catch (error) {
        console.error('Error exporting barcodes:', error);
        showToast('Failed to export barcodes', 'error');
    }
}

// Show toast notification
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Play success sound (optional)
function playSuccessSound() {
    try {
        // Create a simple success beep using Web Audio API
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.2);
    } catch (error) {
        // Ignore if Web Audio API is not supported
        console.log('Audio not supported');
    }
}

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    // Alt + S: Focus on scan tab
    if (e.altKey && e.key === 's') {
        e.preventDefault();
        document.querySelector('[onclick="showTab(\'scan\')"]').click();
    }
    
    // Alt + T: Focus on students tab
    if (e.altKey && e.key === 't') {
        e.preventDefault();
        document.querySelector('[onclick="showTab(\'students\')"]').click();
    }
    
    // Alt + R: Focus on reports tab
    if (e.altKey && e.key === 'r') {
        e.preventDefault();
        document.querySelector('[onclick="showTab(\'reports\')"]').click();
    }
    
    // Escape: Close modal
    if (e.key === 'Escape') {
        closeBarcodeModal();
    }
});

// Auto-refresh stats every 30 seconds
setInterval(loadStats, 30000);

// Show absent/late report
async function showAbsentLateReport() {
    const today = new Date().toISOString().split('T')[0];
    
    try {
        const response = await fetch(`/api/absent-late/${today}`);
        const absentLateData = await response.json();
        
        if (absentLateData.length === 0) {
            showToast('No absent or late students today', 'info');
            return;
        }
        
        // Create modal content
        let modalContent = `
            <div class="modal" id="absentLateModal" style="display: block;">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3><i class="fas fa-exclamation-triangle"></i> Absent/Late Report - ${new Date().toLocaleDateString()}</h3>
                        <span class="close" onclick="closeAbsentLateModal()">&times;</span>
                    </div>
                    <div class="modal-body">
                        <div style="margin-bottom: 20px;">
                            <strong>Total:</strong> ${absentLateData.length} students
                        </div>
                        <table class="attendance-table">
                            <thead>
                                <tr>
                                    <th><i class="fas fa-user"></i> Student Name</th>
                                    <th><i class="fas fa-id-card"></i> Student ID</th>
                                    <th><i class="fas fa-graduation-cap"></i> Form</th>
                                    <th><i class="fas fa-users"></i> Class</th>
                                    <th><i class="fas fa-clock"></i> Check-in Time</th>
                                    <th><i class="fas fa-exclamation-triangle"></i> Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${absentLateData.map(student => `
                                    <tr>
                                        <td>${student.name}</td>
                                        <td>${student.student_id}</td>
                                        <td>Form ${student.form}</td>
                                        <td>${student.class}</td>
                                        <td>${student.check_in_time || 'Not checked in'}</td>
                                        <td>
                                            <span class="status-badge ${student.status === 'Absent' ? 'status-absent' : 'status-late'}">
                                                ${student.status}
                                            </span>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                        <div style="margin-top: 20px; text-align: center;">
                            <button class="btn-primary" onclick="exportAbsentLateReport('${today}')">
                                <i class="fas fa-download"></i> Export to CSV
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Add modal to page
        document.body.insertAdjacentHTML('beforeend', modalContent);
        
    } catch (error) {
        console.error('Error loading absent/late report:', error);
        showToast('Failed to load absent/late report', 'error');
    }
}

// Close absent/late modal
function closeAbsentLateModal() {
    const modal = document.getElementById('absentLateModal');
    if (modal) {
        modal.remove();
    }
}

// Export absent/late report to CSV
async function exportAbsentLateReport(date) {
    try {
        const response = await fetch(`/api/absent-late/${date}`);
        const absentLateData = await response.json();
        
        if (absentLateData.length === 0) {
            showToast('No data to export', 'warning');
            return;
        }
        
        // Create CSV content
        const headers = ['Student Name', 'Student ID', 'Form', 'Class', 'Check-in Time', 'Status'];
        const csvContent = [
            headers.join(','),
            ...absentLateData.map(student => [
                `"${student.name}"`,
                student.student_id,
                `Form ${student.form}`,
                `"${student.class}"`,
                student.check_in_time || 'Not checked in',
                student.status
            ].join(','))
        ].join('\n');
        
        // Download CSV file
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `absent_late_${date}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        showToast('Absent/Late report exported successfully', 'success');
        
    } catch (error) {
        console.error('Error exporting absent/late report:', error);
        showToast('Failed to export absent/late report', 'error');
    }
}

// Display absent/late report in reports section
function displayAbsentLateReport(data, date) {
    const reportContainer = document.getElementById('attendanceReport');
    
    if (data.length === 0) {
        reportContainer.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #666;">
                <i class="fas fa-check-circle" style="font-size: 3em; margin-bottom: 20px; color: #28a745;"></i>
                <h3>No absent or late students found for ${new Date(date).toLocaleDateString()}</h3>
            </div>
        `;
        return;
    }
    
    const table = `
        <table class="attendance-table">
            <thead>
                <tr>
                    <th><i class="fas fa-user"></i> Student Name</th>
                    <th><i class="fas fa-id-card"></i> Student ID</th>
                    <th><i class="fas fa-graduation-cap"></i> Form</th>
                    <th><i class="fas fa-users"></i> Class</th>
                    <th><i class="fas fa-clock"></i> Check-in Time</th>
                    <th><i class="fas fa-exclamation-triangle"></i> Status</th>
                </tr>
            </thead>
            <tbody>
                ${data.map(student => `
                    <tr>
                        <td>${student.name}</td>
                        <td>${student.student_id}</td>
                        <td>Form ${student.form}</td>
                        <td>${student.class}</td>
                        <td>${student.check_in_time || 'Not checked in'}</td>
                        <td>
                            <span class="status-badge ${student.status === 'Absent' ? 'status-absent' : 'status-late'}">
                                ${student.status}
                            </span>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        
        <div style="margin-top: 20px; text-align: center;">
            <button class="btn-primary" onclick="exportFilteredReport('${date}')">
                <i class="fas fa-download"></i> Export to CSV
            </button>
        </div>
    `;
    
    reportContainer.innerHTML = table;
}

// Export filtered report to CSV
async function exportFilteredReport(date) {
    const reportType = document.getElementById('reportType').value;
    const filterForm = document.getElementById('reportFilterForm').value;
    const filterClass = document.getElementById('reportFilterClass').value;
    
    try {
        let url = '';
        if (reportType === 'attendance') {
            url = `/api/attendance/${date}`;
        } else {
            url = `/api/absent-late/${date}`;
        }
        
        // Add filters to URL
        const params = new URLSearchParams();
        if (filterForm) params.append('form', filterForm);
        if (filterClass) params.append('class', filterClass);
        
        if (params.toString()) {
            url += '?' + params.toString();
        }
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.length === 0) {
            showToast('No data to export', 'warning');
            return;
        }
        
        // Create CSV content based on report type
        let headers, csvContent;
        
        if (reportType === 'attendance') {
            headers = ['Student Name', 'Student ID', 'Form', 'Class', 'Time In', 'Status'];
            csvContent = [
                headers.join(','),
                ...data.map(record => [
                    `"${record.name}"`,
                    record.student_id,
                    `Form ${record.form}`,
                    `"${record.class}"`,
                    record.time_in || '',
                    record.time_in ? 'Present' : 'Absent'
                ].join(','))
            ].join('\n');
        } else {
            headers = ['Student Name', 'Student ID', 'Form', 'Class', 'Check-in Time', 'Status'];
            csvContent = [
                headers.join(','),
                ...data.map(student => [
                    `"${student.name}"`,
                    student.student_id,
                    `Form ${student.form}`,
                    `"${student.class}"`,
                    student.check_in_time || 'Not checked in',
                    student.status
                ].join(','))
            ].join('\n');
        }
        
        // Create filter description for filename
        let filterDescription = '';
        if (filterForm && filterClass) {
            filterDescription = `_Form${filterForm}_${filterClass}`;
        } else if (filterForm) {
            filterDescription = `_Form${filterForm}`;
        } else if (filterClass) {
            filterDescription = `_${filterClass}`;
        }
        
        // Download CSV file
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url2 = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url2;
        a.download = `${reportType}_${date}${filterDescription}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url2);
        
        showToast(`${reportType} report exported successfully`, 'success');
        
    } catch (error) {
        console.error('Error exporting filtered report:', error);
        showToast('Failed to export report', 'error');
    }
}

// Load classes for report filters
function loadReportClasses() {
    const filterFormSelect = document.getElementById('reportFilterForm');
    const filterClassSelect = document.getElementById('reportFilterClass');
    
    const selectedForm = parseInt(filterFormSelect.value);
    
    // Clear class options
    filterClassSelect.innerHTML = '<option value="">All Classes</option>';
    
    if (selectedForm && forms.length > 0) {
        const formData = forms.find(f => f.form === selectedForm);
        if (formData) {
            formData.classes.forEach(className => {
                const option = document.createElement('option');
                option.value = className;
                option.textContent = className;
                filterClassSelect.appendChild(option);
            });
        }
    }
}

// Download single student barcode
function downloadSingleBarcode(barcode, name, studentId, studentClass, form) {
    try {
        // Create printable HTML for single barcode
        const printContent = `
            <html>
            <head>
                <title>Student Barcode - ${name}</title>
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        margin: 20px; 
                        text-align: center;
                    }
                    .barcode-container { 
                        border: 2px solid #333; 
                        padding: 20px; 
                        margin: 20px auto;
                        max-width: 400px;
                        background: white;
                    }
                    .student-info { 
                        margin-bottom: 20px; 
                        text-align: center;
                    }
                    .student-name {
                        font-size: 1.5em;
                        font-weight: bold;
                        margin-bottom: 10px;
                    }
                    .student-details {
                        font-size: 1em;
                        color: #666;
                        margin-bottom: 5px;
                    }
                    .barcode-section {
                        margin: 20px 0;
                        text-align: center;
                    }
                    @media print {
                        .barcode-container { 
                            page-break-inside: avoid; 
                            border: 2px solid #333;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="barcode-container">
                    <div class="student-info">
                        <div class="student-name">${name}</div>
                        <div class="student-details"><strong>Student ID:</strong> ${studentId}</div>
                        <div class="student-details"><strong>Form:</strong> ${form}</div>
                        <div class="student-details"><strong>Class:</strong> ${studentClass}</div>
                        <div class="student-details"><strong>Barcode:</strong> ${barcode}</div>
                    </div>
                    <div class="barcode-section">
                        <svg id="single-barcode"></svg>
                    </div>
                </div>
            </body>
            <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
            <script>
                JsBarcode("#single-barcode", "${barcode}", {
                    format: "CODE128",
                    width: 2,
                    height: 80,
                    displayValue: true,
                    fontSize: 16,
                    textMargin: 10
                });
            </script>
            </html>
        `;
        
        // Open in new window for printing
        const printWindow = window.open('', '_blank');
        printWindow.document.write(printContent);
        printWindow.document.close();
        printWindow.focus();
        
        // Auto-print after a short delay
        setTimeout(() => {
            printWindow.print();
        }, 500);
        
        showToast(`Barcode for ${name} opened for printing`, 'success');
        
    } catch (error) {
        console.error('Error downloading barcode:', error);
        showToast('Failed to download barcode', 'error');
    }
}

// Camera Barcode Scanning Functions
async function startCamera() {
    try {
        // Check if device supports camera
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showToast('Camera not supported on this device', 'error');
            return;
        }

        // Request camera permission
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: 'environment', // Use back camera on mobile
                width: { ideal: 1280 },
                height: { ideal: 720 }
            } 
        });

        cameraStream = stream;
        isCameraActive = true;

        // Show camera UI
        document.getElementById('cameraVideo').classList.remove('hidden');
        document.getElementById('cameraOverlay').classList.remove('hidden');
        document.getElementById('cameraStatus').classList.remove('hidden');

        // Set video source
        const video = document.getElementById('cameraVideo');
        video.srcObject = stream;
        video.play();

        // Start barcode detection
        startBarcodeDetection();

        showToast('Camera started successfully', 'success');

    } catch (error) {
        console.error('Camera error:', error);
        if (error.name === 'NotAllowedError') {
            showToast('Camera permission denied. Please allow camera access.', 'error');
        } else if (error.name === 'NotFoundError') {
            showToast('No camera found on this device', 'error');
        } else {
            showToast('Failed to start camera: ' + error.message, 'error');
        }
    }
}

function stopCamera() {
    if (cameraStream) {
        // Stop all tracks
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }

    isCameraActive = false;

    // Hide camera UI
    document.getElementById('cameraVideo').classList.add('hidden');
    document.getElementById('cameraOverlay').classList.add('hidden');
    document.getElementById('cameraStatus').classList.add('hidden');

    // Hide confirmation popup if visible
    hideConfirmationPopup();

    // Stop barcode detection
    if (typeof Quagga !== 'undefined') {
        Quagga.stop();
    }

    showToast('Camera stopped', 'info');
}

function startBarcodeDetection() {
    if (typeof Quagga === 'undefined') {
        console.error('Quagga library not loaded');
        return;
    }

    Quagga.init({
        inputStream: {
            name: "Live",
            type: "LiveStream",
            target: document.getElementById('cameraVideo'),
            constraints: {
                width: 640,
                height: 480,
                facingMode: "environment"
            },
        },
        locator: {
            patchSize: "medium",
            halfSample: true
        },
        numOfWorkers: 2,
        frequency: 10,
        decoder: {
            readers: [
                "code_128_reader",
                "ean_reader",
                "ean_8_reader",
                "code_39_reader",
                "code_39_vin_reader",
                "codabar_reader",
                "upc_reader",
                "upc_e_reader"
            ]
        },
        locate: true
    }, function(err) {
        if (err) {
            console.error('Quagga initialization failed:', err);
            showToast('Failed to initialize barcode scanner', 'error');
            return;
        }
        console.log('Quagga initialized successfully');
        Quagga.start();
    });

    Quagga.onDetected(function(result) {
        const code = result.codeResult.code;
        console.log('Barcode detected:', code);
        
        // Store the scanned barcode and show confirmation popup
        currentScannedBarcode = code;
        showConfirmationPopup(code);
        
        // Play success sound
        playSuccessSound();
    });

    Quagga.onProcessed(function(result) {
        if (result) {
            if (result.codeResult && result.codeResult.code) {
                console.log('Processing barcode:', result.codeResult.code);
            }
        }
    });
}

// Check if device is mobile
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Setup camera UI for mobile devices
function setupCameraUI() {
    const cameraScanner = document.getElementById('cameraScanner');
    if (isMobileDevice()) {
        cameraScanner.style.display = 'block';
        // Auto-start camera when on mobile
        setTimeout(() => {
            if (document.getElementById('scan').classList.contains('active')) {
                startCamera();
            }
        }, 1000);
    } else {
        cameraScanner.style.display = 'none';
    }
}

// Show late report
async function showLateReport() {
    const today = new Date().toISOString().split('T')[0];
    
    try {
        const response = await fetch(`/api/attendance/${today}?status=late`);
        const lateData = await response.json();
        
        if (lateData.length === 0) {
            showToast('No late students today', 'info');
            return;
        }
        
        // Create modal content
        let modalContent = `
            <div class="modal" id="lateModal" style="display: block;">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3><i class="fas fa-clock"></i> Late Report - ${new Date().toLocaleDateString()}</h3>
                        <span class="close" onclick="closeLateModal()">&times;</span>
                    </div>
                    <div class="modal-body">
                        <div style="margin-bottom: 20px;">
                            <strong>Total Late:</strong> ${lateData.length} students
                        </div>
                        <table class="attendance-table">
                            <thead>
                                <tr>
                                    <th><i class="fas fa-user"></i> Student Name</th>
                                    <th><i class="fas fa-id-card"></i> Student ID</th>
                                    <th><i class="fas fa-graduation-cap"></i> Form</th>
                                    <th><i class="fas fa-users"></i> Class</th>
                                    <th><i class="fas fa-clock"></i> Check-in Time</th>
                                    <th><i class="fas fa-exclamation-triangle"></i> Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${lateData.map(student => `
                                    <tr>
                                        <td>${student.name}</td>
                                        <td>${student.student_id}</td>
                                        <td>Form ${student.form}</td>
                                        <td>${student.class}</td>
                                        <td>${student.time_in || 'Not checked in'}</td>
                                        <td>
                                            <span class="status-badge status-late">
                                                LATE
                                            </span>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                        <div style="margin-top: 20px; text-align: center;">
                            <button class="btn-primary" onclick="exportLateReport('${today}')">
                                <i class="fas fa-download"></i> Export to CSV
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Add modal to page
        document.body.insertAdjacentHTML('beforeend', modalContent);
        
    } catch (error) {
        console.error('Error loading late report:', error);
        showToast('Failed to load late report', 'error');
    }
}

// Close late modal
function closeLateModal() {
    const modal = document.getElementById('lateModal');
    if (modal) {
        modal.remove();
    }
}

// Export late report to CSV
async function exportLateReport(date) {
    try {
        const response = await fetch(`/api/attendance/${date}?status=late`);
        const lateData = await response.json();
        
        if (lateData.length === 0) {
            showToast('No data to export', 'warning');
            return;
        }
        
        // Create CSV content
        const headers = ['Student Name', 'Student ID', 'Form', 'Class', 'Check-in Time', 'Status'];
        const csvContent = [
            headers.join(','),
            ...lateData.map(student => [
                `"${student.name}"`,
                student.student_id,
                `Form ${student.form}`,
                `"${student.class}"`,
                student.time_in || 'Not checked in',
                'LATE'
            ].join(','))
        ].join('\n');
        
        // Download CSV file
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `late_report_${date}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        showToast('Late report exported successfully', 'success');
        
    } catch (error) {
        console.error('Error exporting late report:', error);
        showToast('Failed to export late report', 'error');
    }
}

// Show absent report
async function showAbsentReport() {
    const today = new Date().toISOString().split('T')[0];
    
    try {
        const response = await fetch(`/api/absent/${today}`);
        const absentData = await response.json();
        
        if (absentData.length === 0) {
            const currentTime = new Date().toLocaleTimeString('en-US', { 
                hour12: false,
                timeZone: 'Asia/Kuala_Lumpur'
            });
            
            // Parse current time to get hours and minutes
            const [hours, minutes] = currentTime.split(':').map(Number);
            const currentTimeInMinutes = hours * 60 + minutes;
            const CHECK_IN_END = 9 * 60; // 9:00 AM in minutes
            
            if (currentTimeInMinutes < CHECK_IN_END) {
                showToast('Absent students will be calculated after 9:00 AM', 'info');
            } else {
                showToast('No absent students today', 'info');
            }
            return;
        }
        
        // Create modal content
        let modalContent = `
            <div class="modal" id="absentModal" style="display: block;">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3><i class="fas fa-exclamation-triangle"></i> Absent Report - ${new Date().toLocaleDateString()}</h3>
                        <span class="close" onclick="closeAbsentModal()">&times;</span>
                    </div>
                    <div class="modal-body">
                        <div style="margin-bottom: 20px;">
                            <strong>Total Absent:</strong> ${absentData.length} students
                        </div>
                        <table class="attendance-table">
                            <thead>
                                <tr>
                                    <th><i class="fas fa-user"></i> Student Name</th>
                                    <th><i class="fas fa-id-card"></i> Student ID</th>
                                    <th><i class="fas fa-graduation-cap"></i> Form</th>
                                    <th><i class="fas fa-users"></i> Class</th>
                                    <th><i class="fas fa-clock"></i> Check-in Time</th>
                                    <th><i class="fas fa-exclamation-triangle"></i> Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${absentData.map(student => `
                                    <tr>
                                        <td>${student.name}</td>
                                        <td>${student.student_id}</td>
                                        <td>Form ${student.form}</td>
                                        <td>${student.class}</td>
                                        <td>Not checked in</td>
                                        <td>
                                            <span class="status-badge status-absent">
                                                ABSENT
                                            </span>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                        <div style="margin-top: 20px; text-align: center;">
                            <button class="btn-primary" onclick="exportAbsentReport('${today}')">
                                <i class="fas fa-download"></i> Export to CSV
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Add modal to page
        document.body.insertAdjacentHTML('beforeend', modalContent);
        
    } catch (error) {
        console.error('Error loading absent report:', error);
        showToast('Failed to load absent report', 'error');
    }
}

// Close absent modal
function closeAbsentModal() {
    const modal = document.getElementById('absentModal');
    if (modal) {
        modal.remove();
    }
}

// Export absent report to CSV
async function exportAbsentReport(date) {
    try {
        const response = await fetch(`/api/absent/${date}`);
        const absentData = await response.json();
        
        if (absentData.length === 0) {
            showToast('No data to export', 'warning');
            return;
        }
        
        // Create CSV content
        const headers = ['Student Name', 'Student ID', 'Form', 'Class', 'Check-in Time', 'Status'];
        const csvContent = [
            headers.join(','),
            ...absentData.map(student => [
                `"${student.name}"`,
                student.student_id,
                `Form ${student.form}`,
                `"${student.class}"`,
                'Not checked in',
                'ABSENT'
            ].join(','))
        ].join('\n');
        
        // Download CSV file
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `absent_report_${date}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        showToast('Absent report exported successfully', 'success');
        
    } catch (error) {
        console.error('Error exporting absent report:', error);
        showToast('Failed to export absent report', 'error');
    }
}

// Setup confirmation popup event listeners
function setupConfirmationPopup() {
    const confirmBtn = document.getElementById('confirmBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    
    confirmBtn.addEventListener('click', function() {
        if (currentScannedBarcode && currentScannedStudent) {
            // Process the confirmed barcode
            processBarcode(currentScannedBarcode);
            hideConfirmationPopup();
        }
    });
    
    cancelBtn.addEventListener('click', function() {
        hideConfirmationPopup();
        // Restart camera for next scan
        if (isCameraActive) {
            startBarcodeDetection();
        }
    });
}

// Show confirmation popup
function showConfirmationPopup(barcode) {
    const popup = document.getElementById('confirmationPopup');
    const popupTitle = document.getElementById('popupTitle');
    const popupMessage = document.getElementById('popupMessage');
    
    // Find student info for the barcode
    const student = students.find(s => s.barcode === barcode);
    
    if (student) {
        popupTitle.textContent = 'Student Found!';
        popupMessage.textContent = `${student.name} (${student.student_id}) - Form ${student.form} ${student.class}`;
        currentScannedStudent = student;
    } else {
        popupTitle.textContent = 'Unknown Barcode';
        popupMessage.textContent = `Barcode: ${barcode}`;
        currentScannedStudent = null;
    }
    
    // Show popup
    popup.classList.add('show');
    
    // Play success sound
    playSuccessSound();
}

// Hide confirmation popup
function hideConfirmationPopup() {
    const popup = document.getElementById('confirmationPopup');
    popup.classList.remove('show');
    
    // Clear current scan data
    currentScannedBarcode = null;
    currentScannedStudent = null;
}

