// AuthService wrapper for the Vercel API
let currentUser = null;
let currentProfile = null;
const authListeners = [];

// Initialize
function initApp() {
    // Try to restore from session/local storage if needed
    const saved = localStorage.getItem('funguild_user');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            currentUser = data.profile;
            currentProfile = data.profile;
        } catch (e) {
            localStorage.removeItem('funguild_user');
        }
    }
    notifyListeners();
}

// Subscribe to auth state changes
function subscribeToAuth(callback) {
    authListeners.push(callback);
    callback(currentUser);
}

function notifyListeners() {
    authListeners.forEach(cb => cb(currentUser));
}

// Register User
async function register(email, password, justification) {
    const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'register', email, password, justification })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Registration failed');

    // After register, we log them in
    return login(email, password);
}

// Login
async function login(email, password) {
    const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', email, password })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Login failed');

    currentUser = data.profile;
    currentProfile = data.profile;
    localStorage.setItem('funguild_user', JSON.stringify({ profile: data.profile }));

    notifyListeners();
    return currentUser;
}

// Logout
async function logout() {
    currentUser = null;
    currentProfile = null;
    localStorage.removeItem('funguild_user');
    notifyListeners();
}

// Get Full Profile
async function getProfile() {
    // Return cached profile
    return currentProfile;
}

// Export for global usage
window.AuthService = {
    initApp,
    register,
    login,
    logout,
    getProfile,
    subscribeToAuth,
    get user() { return currentUser; }
};
