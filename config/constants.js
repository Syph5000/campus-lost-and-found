module.exports = {
    // Only an administrator may delete a report, and only once it is confirmed
    // (a claim was approved, or the item was handed back). To also let admins
    // remove open reports (spam, duplicates), add 'lost' and 'found' here.
    DELETABLE_STATUSES: ['claimed', 'returned'],

    CATEGORIES: [
        'Electronics',
        'School Supplies',
        'Clothing',
        'Accessories',
        'Documents',
        'Personal Items',
        'Other'
    ]
};
