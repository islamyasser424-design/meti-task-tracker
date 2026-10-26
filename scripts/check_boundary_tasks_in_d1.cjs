const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const backupPath = path.join(__dirname, '..', 'backups', 'd1_backup_pre_migration.sql');
const sqlContent = fs.readFileSync(backupPath, 'utf8');
const db = new DatabaseSync(':memory:');
db.exec(sqlContent);

const taskRahma = db.prepare("SELECT * FROM task_submissions WHERE task_id = '1466273467'").all();
console.log("Looking for task 1466273467 in D1 backup:", taskRahma);

const taskKerolos = db.prepare("SELECT * FROM task_submissions WHERE task_id = '1466329775'").all();
console.log("Looking for task 1466329775 (Kerolos Hany) in D1 backup:", taskKerolos);

const taskZakaria = db.prepare("SELECT * FROM task_submissions WHERE task_id = '1466329776'").all();
console.log("Looking for task 1466329776 (Zakaria Naguib) in D1 backup:", taskZakaria);

const taskYousef = db.prepare("SELECT * FROM task_submissions WHERE task_id = '1466329780'").all();
console.log("Looking for task 1466329780 (Yousef Abdallah) in D1 backup:", taskYousef);
