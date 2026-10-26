const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

function createMockD1() {
  const db = new DatabaseSync(':memory:');
  const schema = fs.readFileSync(path.join(__dirname, '..', 'backend', 'schema.sql'), 'utf8');
  db.exec(schema);

  return {
    prepare: (sql) => ({
      bind: (...params) => ({
        all: async () => ({ results: db.prepare(sql).all(...params) }),
        run: async () => {
          const info = db.prepare(sql).run(...params);
          return { success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } };
        }
      }),
      all: async () => ({ results: db.prepare(sql).all() }),
      run: async () => {
        const info = db.prepare(sql).run();
        return { success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } };
      }
    })
  };
}

console.log("Mock D1 created successfully!");
