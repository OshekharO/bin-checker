'use strict';

const { URL } = require('url');
const checker = require('../libs/javascript');

const JSON_CONTENT_TYPE = { 'Content-Type': 'application/json; charset=utf-8' };

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, JSON_CONTENT_TYPE);
  res.end(JSON.stringify(payload));
}

function normalizeDigits(value) {
  if (typeof value !== 'string') return null;
  const digits = value.replace(/\D/g, '');
  return digits || null;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Request body too large'));
      }
    });

    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });

    req.on('error', () => reject(new Error('Failed to read request body')));
  });
}

function parseBoolean(value, defaultValue = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lowered = value.toLowerCase();
    return lowered === 'true' || lowered === '1';
  }
  return defaultValue;
}

function createHandler() {
  return async function handler(req, res) {
    const method = req.method || 'GET';
    const requestUrl = new URL(req.url || '/', 'http://localhost');
    const pathname = requestUrl.pathname;

    if (method === 'GET' && pathname === '/health') {
      sendJson(res, 200, { status: 'ok' });
      return;
    }

    if (method === 'GET' && pathname === '/brands') {
      sendJson(res, 200, { brands: checker.listBrands() });
      return;
    }

    if (method === 'GET' && pathname.startsWith('/brands/')) {
      const scheme = decodeURIComponent(pathname.slice('/brands/'.length));
      const detailed = parseBoolean(requestUrl.searchParams.get('detailed'), false);
      const brand = detailed ? checker.getBrandInfoDetailed(scheme) : checker.getBrandInfo(scheme);

      if (!brand) {
        sendJson(res, 404, { error: 'Brand not found' });
        return;
      }

      sendJson(res, 200, brand);
      return;
    }

    if (method === 'POST' && pathname === '/support') {
      try {
        const body = await readJsonBody(req);
        const cardNumber = normalizeDigits(body.cardNumber);

        if (!cardNumber) {
          sendJson(res, 400, { error: 'cardNumber is required' });
          return;
        }

        sendJson(res, 200, { supported: checker.isSupported(cardNumber) });
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (method === 'POST' && pathname === '/luhn') {
      try {
        const body = await readJsonBody(req);
        const cardNumber = normalizeDigits(body.cardNumber);

        if (!cardNumber) {
          sendJson(res, 400, { error: 'cardNumber is required' });
          return;
        }

        sendJson(res, 200, { valid: checker.luhn(cardNumber) });
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (method === 'POST' && pathname === '/check') {
      try {
        const body = await readJsonBody(req);
        const cardNumber = normalizeDigits(body.cardNumber);

        if (!cardNumber) {
          sendJson(res, 400, { error: 'cardNumber is required' });
          return;
        }

        const detailed = parseBoolean(body.detailed, false);
        const supported = checker.isSupported(cardNumber);

        if (!supported) {
          sendJson(res, 200, {
            supported: false,
            luhnValid: checker.luhn(cardNumber),
            brand: null,
            cvvValid: null
          });
          return;
        }

        const brand = checker.findBrand(cardNumber, detailed);
        const response = {
          supported: true,
          luhnValid: checker.luhn(cardNumber),
          brand,
          cvvValid: null
        };

        const cvv = normalizeDigits(body.cvv);
        if (cvv) {
          response.cvvValid = checker.validateCvv(cvv, brand);
        }

        sendJson(res, 200, response);
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  };
}

module.exports = {
  createHandler,
  normalizeDigits,
  readJsonBody,
  parseBoolean
};
