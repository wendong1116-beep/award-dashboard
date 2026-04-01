import initSqlJs from 'sql.js';
import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, 'database.sqlite');
const EXCEL_PATH = '/Users/doudoudoudoudoudoudoudou/cc_test/各种印制大奖获奖明细最新.xls';

async function importData() {
    const SQL = await initSqlJs();

    // Load or create database
    let db;
    if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
    }

    // Create tables
    db.run(`
        CREATE TABLE IF NOT EXISTS awards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            year TEXT,
            region TEXT,
            product_name TEXT,
            award_level TEXT,
            photography_type TEXT,
            binding TEXT,
            publisher TEXT,
            features TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Clear existing data
    db.run("DELETE FROM awards");

    // Read Excel file
    const workbook = XLSX.readFile(EXCEL_PATH);
    const sheetNames = workbook.SheetNames.filter(n => n !== '兼容性报表');

    console.log('Processing sheets:', sheetNames);

    let totalImported = 0;

    // Column mappings for each sheet
    const mappings = {
        '美国印制大奖': {
            name: '美国印制大奖',
            year: '年度',
            region: '地区',
            product_name: '获奖产品',
            award_level: '等级',
            photography_type: '摄影',
            binding: '装订方式',
            publisher: '出版社',
            features: '设计、工艺、技术、装帧等 特点、亮点'
        },
        '香港印制大奖': {
            name: '香港印制大奖',
            year: '年度',
            region: '地区',
            product_name: '获奖产品',
            award_level: '等级',
            award_category: '奖项',
            photography_type: '',
            binding: '装订方式',
            publisher: '出版社',
            features: '设计、工艺、技术、装帧等 特点、亮点'
        },
        '中华印制大奖': {
            name: '中华印制大奖',
            year: '年份',
            region: '地区',
            product_name: '产品名',
            award_level: '等级',
            award_category: '奖项',
            photography_type: '',
            binding: '装订方式',
            publisher: '',
            features: '设计、工艺、技术、装帧等 特点、亮点'
        },
        '政府出版奖': {
            name: '政府出版奖',
            year: '年份',
            region: '地区',
            product_name: '获奖产品',
            award_level: '等级',
            photography_type: '',
            binding: '',
            publisher: '颁奖单位',
            features: '',
            award_category: '奖项'
        },
        '上海印制大奖': {
            name: '上海印制大奖',
            year: '年度',
            region: '地区',
            product_name: '获奖产品',
            award_level: '等级',
            photography_type: '',
            binding: '',
            publisher: '',
            features: ''
        },
        '中国最美的书': {
            name: '中国最美的书',
            year: '年度',
            region: '地区',
            product_name: '产品名',
            award_level: '',
            photography_type: '',
            binding: '',
            publisher: '',
            features: ''
        },
        '世界最美的书': {
            name: '世界最美的书',
            year: '年度',
            region: '地区',
            product_name: '产品名',
            award_level: '等级',
            photography_type: '',
            binding: '',
            publisher: '',
            features: ''
        },
        '金光印艺大奖': {
            name: '金光印艺大奖',
            year: '年度',
            region: '地区',
            product_name: '获奖产品',
            award_level: '等级',
            award_category: '奖项',
            photography_type: '',
            binding: '',
            publisher: '',
            features: ''
        },
        '亚洲印制大奖': {
            name: '亚洲印制大奖',
            year: '年度',
            region: '地区',
            product_name: '产品名',
            award_level: '等级',
            award_category: '奖项',
            photography_type: '',
            binding: '',
            publisher: '',
            features: ''
        },
        '全国书籍装帧大奖': {
            name: '全国书籍装帧大奖',
            year: '',
            region: '获奖单位',
            product_name: '获奖产品',
            award_level: '等级',
            photography_type: '',
            binding: '',
            publisher: '',
            features: ''
        },
        '红星奖': {
            name: '红星奖',
            year: '年度',
            region: '',
            product_name: '获奖作品',
            award_level: '等级',
            award_category: '奖项',
            photography_type: '',
            binding: '',
            publisher: '',
            features: ''
        }
    };

    for (const sheetName of sheetNames) {
        console.log(`\nProcessing: ${sheetName}`);
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (data.length === 0) continue;

        const mapping = mappings[sheetName];
        if (!mapping) {
            console.log(`  No mapping defined, skipping`);
            continue;
        }

        let sheetCount = 0;
        for (const row of data) {
            // Skip rows where key fields are empty
            const productName = row[mapping.product_name] || '';
            const awardLevel = row[mapping.award_level] || '';

            if (!productName && !awardLevel) continue;

            const record = {
                name: mapping.name,
                year: (row[mapping.year] || '').trim(),
                region: (row[mapping.region] || '').trim(),
                product_name: productName.trim(),
                award_level: awardLevel.trim(),
                award_category: (row[mapping.award_category] || '').trim(),
                photography_type: (row[mapping.photography_type] || '').trim(),
                binding: (row[mapping.binding] || '').trim(),
                publisher: (row[mapping.publisher] || '').trim(),
                features: (row[mapping.features] || '').trim()
            };

            db.run(`
                INSERT INTO awards (name, year, region, product_name, award_level, award_category, photography_type, binding, publisher, features)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [record.name, record.year, record.region, record.product_name, record.award_level, record.award_category || '', record.photography_type, record.binding, record.publisher, record.features]);

            sheetCount++;
        }

        console.log(`  Imported ${sheetCount} records`);
        totalImported += sheetCount;
    }

    // Create admin user if not exists
    const existing = db.exec("SELECT id FROM users WHERE username = 'admin'");
    if (existing.length === 0 || existing[0].values.length === 0) {
        const hash = bcrypt.hashSync('admin123', 10);
        db.run("INSERT INTO users (username, password) VALUES (?, ?)", ['admin', hash]);
        console.log('\nAdmin user created (admin/admin123)');
    }

    // Save database
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);

    // Verify
    const verify = db.exec("SELECT COUNT(*) as count FROM awards");
    console.log('\n=== Import Complete ===');
    console.log('Total records:', verify[0]?.values[0][0] || 0);

    const byAward = db.exec("SELECT name, COUNT(*) as count FROM awards GROUP BY name ORDER BY count DESC");
    if (byAward.length > 0) {
        console.log('\nRecords by award:');
        for (const row of byAward[0].values) {
            console.log(`  ${row[0]}: ${row[1]}`);
        }
    }

    db.close();
}

importData().catch(console.error);
