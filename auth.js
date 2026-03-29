import bcrypt from 'bcryptjs';
import initSqlJs from 'sql.js';
import fs from 'fs';

const DB_PATH = './database.sqlite';
let db = null;

async function getDB() {
    if (!db) {
        const SQL = await initSqlJs();
        if (fs.existsSync(DB_PATH)) {
            const buffer = fs.readFileSync(DB_PATH);
            db = new SQL.Database(buffer);
        } else {
            db = new SQL.Database();
        }
    }
    return db;
}

// In-memory session map: token -> true
const sessions = new Map();

function generateToken() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 32; i++) {
        token += chars[Math.floor(Math.random() * chars.length)];
    }
    return token;
}

export const login = async (username, password) => {
    const config = (await import('./config.js')).default;
    if (username === config.admin.username) {
        const database = await getDB();
        const result = database.exec("SELECT * FROM users WHERE username = ?", [username]);
        if (result.length > 0 && result[0].values.length > 0) {
            const cols = result[0].columns;
            const user = {};
            cols.forEach((col, i) => user[col] = result[0].values[0][i]);
            if (bcrypt.compareSync(password, user.password)) {
                const token = generateToken();
                sessions.set(token, true);
                return token;
            }
        }
    }
    return null;
};

export const logout = (token) => {
    if (token) sessions.delete(token);
};

export const logoutAll = () => {
    sessions.clear();
};

export const requireAuth = (req, res, next) => {
    const header = req.headers['authorization'] || req.headers['Authorization'];
    const token = header && header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token || !sessions.has(token)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    req.token = token;
    next();
};

export const isAuthenticated = (token) => {
    if (!token) return false;
    return sessions.has(token);
};
