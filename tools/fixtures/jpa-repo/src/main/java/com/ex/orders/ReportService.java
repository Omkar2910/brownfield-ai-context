package com.ex.orders;

class ReportService {
    // update customers here later
    private static final String TOTALS = "SELECT c.name, count(*) FROM customers c " +
        "JOIN orders o ON o.customer_id = c.id GROUP BY c.name";
}
