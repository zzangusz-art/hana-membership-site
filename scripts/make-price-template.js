'use strict';
// 시세 업로드 엑셀 양식을 파일로 생성: node scripts/make-price-template.js [출력경로]
require('dotenv').config();
const fs = require('fs');
const { seedIfEmpty } = require('./seed');
seedIfEmpty();
const prices = require('../lib/prices');
const out = process.argv[2] || 'hana-price-template.xlsx';
fs.writeFileSync(out, prices.buildTemplate());
console.log('생성:', out);
