/** Standalone local sample API. Run only for development: node server/sampleCustomerApi.js */
import { createServer } from 'node:http';
const host = '127.0.0.1', port = 5098;
const customers = {
    '1234567890123': { fullName: 'Sample Customer', mobile: '03000000000', email: 'sample@example.local', segment: 'Retail', status: 'Active' },
    '9876543210987': { fullName: 'Test Customer', mobile: '03111111111', email: 'test@example.local', segment: 'Premium', status: 'Active' }
};
createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json');
    res.setHeader('cache-control', 'no-store');
    const path = new URL(req.url, `http://${host}:${port}`).pathname;
    if (req.method === 'GET' && path.startsWith('/customers/')) {
        const id = decodeURIComponent(path.split('/')[2] || '');
        const row = customers[id];
        res.statusCode = row ? 200 : 404;
        res.end(JSON.stringify(row ? { success: true, data: { cnic: id, ...row }, meta: { source: 'local-sample' } } : { success: false, message: 'Sample customer not found' }));
        return;
    }
    if (req.method === 'POST' && path === '/customer-enquiry') {
        let body = '';
        for await (const chunk of req)
            body += chunk;
        let input;
        try {
            input = JSON.parse(body);
        }
        catch {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
            return;
        }
        const row = customers[input.cnic];
        res.statusCode = row ? 200 : 404;
        res.end(JSON.stringify(row ? { success: true, data: { cnic: input.cnic, ...row }, meta: { source: 'local-sample' } } : { success: false, message: 'Sample customer not found' }));
        return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
}).listen(port, host, () => console.log(`Sample customer API at http://${host}:${port}`));
