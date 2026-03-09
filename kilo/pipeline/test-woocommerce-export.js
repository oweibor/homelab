'use strict';

const { transformToWooCommerce } = require('./src/services/scraper/nextcloudWriter');

async function testWooCommerceExport() {
    const mockProduct = {
        title: 'Variable Gaming Mouse',
        sku: 'MOUSE-001',
        price: '49.99',
        description: 'A high-performance gaming mouse with interchangeable weights.',
        url: 'https://example.com/mouse',
        categories: ['Accessories', 'Gaming'],
        variants: [
            { name: 'Red LED', sku: 'MOUSE-001-RED', price: '49.99' },
            { name: 'Blue LED', sku: 'MOUSE-001-BLUE', price: '54.99' }
        ]
    };

    console.log('--- Starting WooCommerce Export Test ---');
    const rows = transformToWooCommerce(mockProduct);

    console.log('Total Rows Generated:', rows.length);
    console.log('Rows:', JSON.stringify(rows, null, 2));

    // Validations
    const parentRow = rows.find(r => r.Type === 'variable');
    const childRows = rows.filter(r => r.Type === 'variation');

    if (parentRow && parentRow.SKU === 'MOUSE-001') {
        console.log('✅ SUCCESS: Parent row correctly identified as "variable".');
    } else {
        console.log('❌ FAILURE: Parent row missing or incorrect.');
    }

    if (childRows.length === 2) {
        console.log('✅ SUCCESS: 2 variation rows generated.');
    } else {
        console.log('❌ FAILURE: Incorrect number of variation rows.');
    }

    const firstChild = childRows[0];
    if (firstChild.Parent === 'MOUSE-001') {
        console.log('✅ SUCCESS: Child row correctly linked to parent SKU.');
    } else {
        console.log('❌ FAILURE: Child row parent linkage failed.');
    }

    if (firstChild.Name.includes('Red LED')) {
        console.log('✅ SUCCESS: Child row name includes variant name.');
    } else {
        console.log('❌ FAILURE: Child row name incorrect.');
    }
}

testWooCommerceExport().catch(err => {
    console.error('Test crashed:', err);
    process.exit(1);
});
