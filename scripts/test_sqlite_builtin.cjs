const { DatabaseSync } = require('node:sqlite');
console.log('Testing node:sqlite:');
const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
db.exec("INSERT INTO test (name) VALUES ('hello')");
const row = db.prepare('SELECT * FROM test').get();
console.log('Success! Result:', row);
