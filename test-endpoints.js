async function testEndpoints() {
  const BASE_URL = 'http://localhost:4000/api';
  console.log(`Starting basic endpoint testing on ${BASE_URL}...\n`);

  const endpoints = [
    { method: 'GET', path: '/health', expected: 200 },
    { method: 'POST', path: '/auth/register', expected: 400 }, // missing body
    { method: 'POST', path: '/auth/login', expected: 400 }, // missing body
    { method: 'GET', path: '/auth/users/me', expected: 401 }, // missing token
    { method: 'GET', path: '/products', expected: 401 }, // missing token
    { method: 'GET', path: '/stores/123', expected: 401 }, // missing token
    { method: 'POST', path: '/checkout/initialize', expected: 401 }, // missing token
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(`${BASE_URL}${ep.path}`, {
        method: ep.method,
        headers: { 'Content-Type': 'application/json' },
        body: ep.method === 'POST' ? JSON.stringify({}) : undefined,
      });

      const data = await res.text();
      
      const success = res.status === ep.expected || (res.status >= 400 && res.status < 500 && ep.expected >= 400);

      console.log(`[${success ? 'PASS' : 'FAIL'}] ${ep.method} ${ep.path}`);
      console.log(`  Expected: ~${ep.expected}, Got: ${res.status}`);
      if (!success) {
        console.log(`  Response: ${data.substring(0, 100)}`);
      }
    } catch (error) {
      console.log(`[ERROR] ${ep.method} ${ep.path}`);
      console.log(`  ${error.message}`);
    }
  }
}

testEndpoints();
