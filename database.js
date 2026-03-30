import initSqlJs from 'sql.js';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';

let db = null;
const DB_PATH = './database.sqlite';

async function initDB() {
    const SQL = await initSqlJs();

    try {
        if (fs.existsSync(DB_PATH)) {
            const buffer = fs.readFileSync(DB_PATH);
            db = new SQL.Database(buffer);
        } else {
            db = new SQL.Database();
        }
    } catch (e) {
        db = new SQL.Database();
    }

    db.run(`
        CREATE TABLE IF NOT EXISTS awards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            year TEXT,
            region TEXT,
            product_name TEXT,
            award_level TEXT,
            award_category TEXT,
            photography_type TEXT,
            binding TEXT,
            publisher TEXT,
            features TEXT,
            image_url TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Add award_category column if it doesn't exist (for existing databases)
    try { db.run("ALTER TABLE awards ADD COLUMN award_category TEXT"); } catch (e) {}

    // Add image_url column if it doesn't exist
    try { db.run("ALTER TABLE awards ADD COLUMN image_url TEXT"); } catch (e) {}

    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    const existing = db.exec("SELECT id FROM users WHERE username = '" + config.admin.username + "'");
    if (existing.length === 0 || existing[0].values.length === 0) {
        const hash = bcrypt.hashSync(config.admin.password, 10);
        db.run("INSERT INTO users (username, password) VALUES (?, ?)", [config.admin.username, hash]);
        console.log('Admin user created');
    }

    // Auto-import from data.json if awards table is empty (Railway ephemeral filesystem)
    const countResult = db.exec("SELECT COUNT(*) FROM awards");
    const count = countResult[0]?.values[0]?.[0] || 0;
    if (count === 0) {
        console.log('Awards table empty, auto-importing from data.json...');
        try {
            const dataPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data.json');
            if (fs.existsSync(dataPath)) {
                const raw = fs.readFileSync(dataPath, 'utf-8');
                const data = JSON.parse(raw);
                let imported = 0;
                for (const row of (data.records || [])) {
                    const name = row['来源'] || row['奖项'] || '';
                    if (!name) continue;
                    // Extract year from "2002年第53届美国印制大奖" → "2002"
                    const yearMatch = String(row['奖项'] || '').match(/^(\d{4})/);
                    const year = yearMatch ? yearMatch[1] : '';
                    db.run(
                        `INSERT INTO awards (name, year, region, product_name, award_level, photography_type, binding, publisher, features)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            name, year,
                            row['获奖单位'] || row['颁奖单位'] || '',
                            row['获奖产品'] || row['产品名'] || '',
                            row['奖别'] || '',
                            row['摄影'] || '',
                            row['装订方式'] || '',
                            row['出版社'] || '',
                            row['设计、工艺、技术、装帧等 特点、亮点'] || ''
                        ]
                    );
                    imported++;
                }
                console.log(`Auto-imported ${imported} records from data.json`);
            }
        } catch (e) {
            console.error('Auto-import failed:', e.message);
        }
    }

    saveDB();
    return db;
}

function saveDB() {
    if (db) {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(DB_PATH, buffer);
    }
}

function queryAll(sql, params = []) {
    const result = db.exec(sql, params);
    if (result.length === 0) return [];
    const cols = result[0].columns;
    return result[0].values.map(row => {
        const obj = {};
        cols.forEach((c, i) => obj[c] = row[i]);
        return obj;
    });
}

function queryOne(sql, params = []) {
    const results = queryAll(sql, params);
    return results[0] || null;
}

function run(sql, params = []) {
    db.run(sql, params);
    const lid = db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0];
    saveDB();
    return { lastInsertRowid: lid };
}

function getImages(data) {
    if (!data.image_url) return [];
    try { return JSON.parse(data.image_url); } catch { return []; }
}

function serializeImages(arr) {
    return JSON.stringify(arr || []);
}

// Awards CRUD
export const getAllAwards = () => {
    return queryAll('SELECT * FROM awards ORDER BY id DESC');
};

export const getAwardByName = (name) => {
    return queryAll('SELECT * FROM awards WHERE name = ? ORDER BY id DESC', [name]);
};

export const getProductById = (id) => {
    const row = queryOne('SELECT * FROM awards WHERE id = ?', [id]);
    if (row) row.images = getImages(row);
    return row;
};

export const getStatsByAward = (name) => {
    const byYear = queryAll(
        "SELECT year, COUNT(*) as count FROM awards WHERE name = ? AND year IS NOT NULL AND year != '' GROUP BY year ORDER BY year DESC",
        [name]
    );
    const byRegion = queryAll(
        "SELECT region, COUNT(*) as count FROM awards WHERE name = ? AND region IS NOT NULL AND region != '' GROUP BY region ORDER BY count DESC",
        [name]
    );
    const byLevel = queryAll(
        "SELECT award_level, COUNT(*) as count FROM awards WHERE name = ? AND award_level IS NOT NULL AND award_level != '' GROUP BY award_level",
        [name]
    );
    const byCategory = queryAll(
        "SELECT award_category, COUNT(*) as count FROM awards WHERE name = ? AND award_category IS NOT NULL AND award_category != '' GROUP BY award_category",
        [name]
    );
    return { byYear, byRegion, byLevel, byCategory };
};

export const getAwardNames = () => {
    return queryAll('SELECT DISTINCT name FROM awards ORDER BY name').map(r => r.name);
};

export const addAward = (data) => {
    const images = Array.isArray(data.images) ? serializeImages(data.images) : (data.image_url || '');
    const result = run(
        'INSERT INTO awards (name, year, region, product_name, award_level, award_category, photography_type, binding, publisher, features, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [data.name || '', data.year || '', data.region || '', data.product_name || '', data.award_level || '', data.award_category || '', data.photography_type || '', data.binding || '', data.publisher || '', data.features || '', images]
    );
    return result.lastInsertRowid;
};

export const updateAward = (id, data) => {
    const images = Array.isArray(data.images) ? serializeImages(data.images) : (data.image_url || '');
    run('UPDATE awards SET name=?, year=?, region=?, product_name=?, award_level=?, award_category=?, photography_type=?, binding=?, publisher=?, features=?, image_url=? WHERE id=?',
        [data.name, data.year, data.region, data.product_name, data.award_level, data.award_category || '', data.photography_type || '', data.binding || '', data.publisher || '', data.features || '', images, id]);
};

export const deleteAward = (id) => {
    run('DELETE FROM awards WHERE id = ?', [id]);
};

export const importAwards = (name, records) => {
    for (const r of records) {
        run(
            'INSERT INTO awards (name, year, region, product_name, award_level, award_category, photography_type, binding, publisher, features) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                name,
                r['年份'] || r['奖项'] || '',
                r['获奖单位'] || r['颁奖单位'] || '',
                r['获奖产品'] || r['产品名'] || r['获奖项目'] || '',
                r['奖别'] || r['奖项明细'] || '',
                r['奖项'] || '',
                r['摄影'] || r['类别'] || r['类别.1'] || '',
                r['装订方式'] || '',
                r['出版社'] || '',
                r['设计、工艺、技术、装帧等 特点、亮点'] || ''
            ]
        );
    }
    return records.length;
};

export const searchAwards = (keyword) => {
    const kw = '%' + keyword + '%';
    return queryAll("SELECT * FROM awards WHERE product_name LIKE ? OR name LIKE ? OR award_level LIKE ? ORDER BY id DESC LIMIT 100", [kw, kw, kw]);
};

export const getYearsByAward = (name) => {
    return queryAll(
        "SELECT DISTINCT year FROM awards WHERE name = ? AND year IS NOT NULL AND year != '' ORDER BY year DESC",
        [name]
    );
};

export const getProductsByFilter = (filter = {}) => {
    let sql = 'SELECT * FROM awards WHERE 1=1';
    const params = [];
    if (filter.name) {
        sql += ' AND name = ?';
        params.push(filter.name);
    }
    if (filter.year) {
        sql += ' AND year = ?';
        params.push(filter.year);
    }
    if (filter.search) {
        sql += ' AND product_name LIKE ?';
        params.push('%' + filter.search + '%');
    }
    sql += ' ORDER BY id DESC';
    return queryAll(sql, params);
};

export const getOverallStats = () => {
    const total = queryOne('SELECT COUNT(*) as count FROM awards')?.count || 0;
    const awards = queryAll('SELECT DISTINCT name FROM awards').map(r => r.name);
    const regionCount = queryOne("SELECT COUNT(DISTINCT region) as count FROM awards WHERE region IS NOT NULL AND region != ''")?.count || 0;
    return { total, awardCount: awards.length, awards, regionCount };
};

export { initDB, saveDB };
export default { getAllAwards, getAwardByName, getProductById, getStatsByAward, getAwardNames, addAward, updateAward, deleteAward, importAwards, searchAwards, getOverallStats, getYearsByAward, getProductsByFilter, initDB, saveDB };
