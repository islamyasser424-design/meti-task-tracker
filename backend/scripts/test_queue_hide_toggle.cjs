const fs = require('fs');
const path = require('path');

const envLines = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8').split('\n');
const env = {};
envLines.forEach(l => {
  const m = l.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (m) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
});

async function run() {
  const worker = (await import('../src/index.js')).default;
  console.log('--- Testing /api/analytics/dataset ---');
  const dsReq = new Request('https://api.local/api/analytics/dataset?limit=50', {
    method: 'GET',
    headers: { 'Origin': 'https://islamyasser424.github.io' }
  });
  const dsRes = await worker.fetch(dsReq, env);
  const dsData = await dsRes.json();
  console.log('Dataset count:', dsData.count);
  console.log('Sample rows timestamps:', dsData.rows.slice(0, 3).map(r => ({ id: r.id, ts: r.timestamp, queue: r.queue_name, src: r.source })));

  console.log('\n--- Testing /api/queues list ---');
  const qReq = new Request('https://api.local/api/queues', {
    method: 'GET',
    headers: { 'Origin': 'https://islamyasser424.github.io' }
  });
  const qRes = await worker.fetch(qReq, env);
  const qData = await qRes.json();
  console.log('qRes status:', qRes.status, 'qData:', qData);
  const testQueue = qData.queues[0];
  console.log('First queue before toggle:', { id: testQueue.id, name: testQueue.name, is_hidden: testQueue.is_hidden, type: typeof testQueue.is_hidden });

  // Login as admin to get token
  const loginReq = new Request('https://api.local/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': 'https://islamyasser424.github.io' },
    body: JSON.stringify({ username: 'admin', password: 'Meti@123456' })
  });
  const loginRes = await worker.fetch(loginReq, env);
  const loginData = await loginRes.json();
  const token = loginData.token;

  console.log('\n--- Toggling queue to hidden (is_hidden = 1) ---');
  const hideReq = new Request(`https://api.local/api/queues/${testQueue.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'Origin': 'https://islamyasser424.github.io' },
    body: JSON.stringify({ is_hidden: 1 })
  });
  const hideRes = await worker.fetch(hideReq, env);
  const hideData = await hideRes.json();
  console.log('Hide response:', hideData);

  // Check queues list again
  const qRes2 = await worker.fetch(qReq, env);
  const qData2 = await qRes2.json();
  const testQueue2 = qData2.queues.find(q => q.id === testQueue.id);
  console.log('Queue after hiding:', { id: testQueue2.id, name: testQueue2.name, is_hidden: testQueue2.is_hidden });

  console.log('\n--- Toggling queue back to visible (is_hidden = 0) ---');
  const showReq = new Request(`https://api.local/api/queues/${testQueue.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'Origin': 'https://islamyasser424.github.io' },
    body: JSON.stringify({ is_hidden: 0 })
  });
  const showRes = await worker.fetch(showReq, env);
  const showData = await showRes.json();
  console.log('Show response:', showData);

  const qRes3 = await worker.fetch(qReq, env);
  const qData3 = await qRes3.json();
  const testQueue3 = qData3.queues.find(q => q.id === testQueue.id);
  console.log('Queue after showing:', { id: testQueue3.id, name: testQueue3.name, is_hidden: testQueue3.is_hidden });
}

run().catch(console.error);
