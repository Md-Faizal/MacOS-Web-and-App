use suite_core::analytics::aging::{calculate_customer_aging, calculate_receivables_aging, UnpaidBillItem};
use suite_core::analytics::kpi::calculate_executive_kpis;
use suite_core::catalog::expiry::check_batch_expiry;
use suite_core::ffi::fast_path::calc_line_item_fast;
use suite_core::finance::invoicing::bill::calculate_bill;
use suite_core::finance::invoicing::item::{calculate_free_scheme_units, LineItemCalculated, LineItemInput};
use suite_core::finance::ledger::entry::{BillEntry, PaymentEntry};
use suite_core::finance::ledger::statement::generate_customer_statement;
use suite_core::sales::orders::{calculate_order_fulfillment, OrderItemInput, OrderStage};

#[test]
fn test_reverse_gst_calculation() {
    let item = LineItemInput {
        product_id: Some("prod_1".to_string()),
        product_name: "Paracetamol 500mg".to_string(),
        variant_id: None,
        batch_id: None,
        batch_no: Some("BATCH001".to_string()),
        rate: 100.0,
        qty: 1.0,
        disc1_percent: 0.0,
        disc2_percent: 0.0,
        gst_percent: 5.0,
        gst_reverse: true,
        scheme: None,
    };

    let result = LineItemCalculated::calculate(&item);

    // MRP 100 * (1 - 0.0477) = 95.23
    assert_eq!(result.rate, 95.23);
    assert_eq!(result.amount, 95.23);
    assert_eq!(result.gst_amount, 4.76);
    assert_eq!(result.sgst_amount, 2.38);
    assert_eq!(result.cgst_amount, 2.38);
    assert_eq!(result.final_amount, 99.99);
}

#[test]
fn test_cascading_discounts() {
    let item = LineItemInput {
        product_id: None,
        product_name: "Azithromycin 500".to_string(),
        variant_id: None,
        batch_id: None,
        batch_no: None,
        rate: 1000.0,
        qty: 2.0,
        disc1_percent: 10.0,
        disc2_percent: 5.0,
        gst_percent: 18.0,
        gst_reverse: false,
        scheme: None,
    };

    let result = LineItemCalculated::calculate(&item);

    // Rate: 1000, Qty: 2 -> Amount: 2000
    assert_eq!(result.amount, 2000.0);
    // Disc 1 (10%): 200.0 -> Rem: 1800
    assert_eq!(result.discount_1_amount, 200.0);
    // Disc 2 (5% of 1800): 90.0 -> Rem: 1710
    assert_eq!(result.discount_2_amount, 90.0);
    // GST (18% of 1710): 307.80
    assert_eq!(result.gst_amount, 307.80);
    assert_eq!(result.sgst_amount, 153.90);
    assert_eq!(result.cgst_amount, 153.90);
    // Final: 1710 + 307.80 = 2017.80
    assert_eq!(result.final_amount, 2017.80);
}

#[test]
fn test_scheme_free_bonus() {
    assert_eq!(calculate_free_scheme_units(12.0, "5+1"), 2.0);
    assert_eq!(calculate_free_scheme_units(25.0, "10+2"), 4.0);
    assert_eq!(calculate_free_scheme_units(4.0, "5+1"), 0.0);
}

#[test]
fn test_round_off_summary() {
    let items = vec![
        LineItemInput {
            product_id: None,
            product_name: "Item A".to_string(),
            variant_id: None,
            batch_id: None,
            batch_no: None,
            rate: 55.45,
            qty: 3.0,
            disc1_percent: 0.0,
            disc2_percent: 0.0,
            gst_percent: 12.0,
            gst_reverse: false,
            scheme: None,
        },
        LineItemInput {
            product_id: None,
            product_name: "Item B".to_string(),
            variant_id: None,
            batch_id: None,
            batch_no: None,
            rate: 120.10,
            qty: 1.0,
            disc1_percent: 5.0,
            disc2_percent: 0.0,
            gst_percent: 18.0,
            gst_reverse: false,
            scheme: None,
        },
    ];

    let res = calculate_bill(&items, 150.0, true);
    assert!(res.success);
    assert_eq!(res.previous_due, 150.0);
    // grand_total should be integer rounded
    assert_eq!(res.summary.grand_total, res.summary.grand_total.round());
    assert_eq!(res.projected_due, 150.0 + res.summary.grand_total);
}

#[test]
fn test_fifo_debt_allocation_and_statement() {
    let bills = vec![
        BillEntry {
            id: "bill_1".to_string(),
            customer_id: "cust_1".to_string(),
            invoice_no: "INV-001".to_string(),
            date: "2026-01-01".to_string(),
            due_date: None,
            grand_total: 1000.0,
        },
        BillEntry {
            id: "bill_2".to_string(),
            customer_id: "cust_1".to_string(),
            invoice_no: "INV-002".to_string(),
            date: "2026-01-10".to_string(),
            due_date: None,
            grand_total: 2000.0,
        },
    ];

    let payments = vec![
        PaymentEntry {
            id: "pmt_1".to_string(),
            customer_id: "cust_1".to_string(),
            reference_no: "REC-001".to_string(),
            date: "2026-01-15".to_string(),
            amount: 1000.0,
            is_credit_note: false,
            payment_medium: Some("Cash".to_string()),
        },
        PaymentEntry {
            id: "pmt_2".to_string(),
            customer_id: "cust_1".to_string(),
            reference_no: "REC-002".to_string(),
            date: "2026-01-20".to_string(),
            amount: 1500.0,
            is_credit_note: false,
            payment_medium: Some("UPI".to_string()),
        },
    ];

    // Opening balance of 500
    // Total purchases: 500 (op) + 1000 + 2000 = 3500
    // Total collected: 1000 + 1500 = 2500
    // Current due: 3500 - 2500 = 1000
    let res = generate_customer_statement(500.0, &bills, &payments, 20475);

    assert_eq!(res.summary.total_purchases, 3500.0);
    assert_eq!(res.summary.total_collected, 2500.0);
    assert_eq!(res.summary.current_due, 1000.0);
    assert_eq!(res.summary.total_settled, 2500.0);

    let fifo = res.fifo_result.unwrap();
    let b1 = fifo.bill_settlements.get("bill_1").unwrap();
    assert!(b1.settled);
    assert_eq!(b1.remaining, 0.0);

    let b2 = fifo.bill_settlements.get("bill_2").unwrap();
    assert!(!b2.settled);
    assert_eq!(b2.remaining, 1000.0);
    assert_eq!(b2.paid, 1000.0);
}

#[test]
fn test_analytics_aging_decoupled() {
    let unpaid = vec![
        UnpaidBillItem {
            bill_id: "b1".to_string(),
            days_elapsed: 5,
            remaining_amount: 100.0,
        },
        UnpaidBillItem {
            bill_id: "b2".to_string(),
            days_elapsed: 12,
            remaining_amount: 200.0,
        },
        UnpaidBillItem {
            bill_id: "b3".to_string(),
            days_elapsed: 25,
            remaining_amount: 300.0,
        },
        UnpaidBillItem {
            bill_id: "b4".to_string(),
            days_elapsed: 45,
            remaining_amount: 400.0,
        },
    ];

    // Customer ledger granular aging: 0-7, 8-15, 16-30, >30
    let aging = calculate_customer_aging(&unpaid, 500.0);
    assert_eq!(aging.ageing_0_to_7, 100.0);
    assert_eq!(aging.ageing_8_to_15, 200.0);
    assert_eq!(aging.ageing_16_to_30, 300.0);
    // >30 has 400 + 500 (opening balance) = 900
    assert_eq!(aging.ageing_over_30, 900.0);
    assert_eq!(aging.total, 1500.0);

    // Executive macro aging: 0-30, 31-60, 61+
    let macro_aging = calculate_receivables_aging(&unpaid);
    assert_eq!(macro_aging.outstanding0to30, 600.0); // 100 + 200 + 300
    assert_eq!(macro_aging.outstanding31to60, 400.0); // 400
    assert_eq!(macro_aging.outstanding61Plus, 0.0);
    assert_eq!(macro_aging.totalOutstanding, 1000.0);
}

#[test]
fn test_executive_kpis() {
    let billed = vec![1000.0, 2000.0, 3000.0];
    let collected = vec![1000.0, 1500.0];
    let kpis = calculate_executive_kpis(&billed, &collected, 0.0, 500.0);

    assert_eq!(kpis.total_billed, 6000.0);
    assert_eq!(kpis.total_collected, 2500.0);
    assert_eq!(kpis.amount_due, 3500.0);
    assert_eq!(kpis.overdue_amount, 500.0);
    assert_eq!(kpis.collection_rate_percent, 41.7);
}

#[test]
fn test_order_fulfillment() {
    let items = vec![
        OrderItemInput {
            product_id: Some("p1".to_string()),
            ordered_qty: 10.0,
            received_qty: Some(8.0),
            unit_price: 50.0,
        },
    ];

    let draft = calculate_order_fulfillment(&items, OrderStage::Draft);
    assert_eq!(draft.total_ordered_qty, 10.0);
    assert_eq!(draft.total_delivered_qty, 0.0);
    assert_eq!(draft.total_lost_val, 500.0);

    let delivered = calculate_order_fulfillment(&items, OrderStage::Delivered);
    assert_eq!(delivered.total_delivered_qty, 8.0);
    assert_eq!(delivered.total_delivered_val, 400.0);
    assert_eq!(delivered.total_lost_val, 100.0);
    assert_eq!(delivered.fulfillment_ratio_percent, 80.0);
}

#[test]
fn test_batch_expiry() {
    // Current date ~ Jan 1 2026
    let days_2026 = 20454;
    let exp_near = check_batch_expiry("03/26", days_2026);
    assert!(!exp_near.is_expired);
    assert!(exp_near.is_near_expiry);

    let exp_past = check_batch_expiry("12/24", days_2026);
    assert!(exp_past.is_expired);
}

#[test]
fn test_fast_path_c_abi() {
    let mut out = [0.0f64; 7];
    let res = unsafe {
        calc_line_item_fast(
            100.0, 2.0, 10.0, 0.0, 18.0, 0,
            out.as_mut_ptr(),
        )
    };
    assert_eq!(res, 0);
    assert_eq!(out[0], 200.0); // amount
    assert_eq!(out[1], 20.0);  // disc1
    assert_eq!(out[2], 0.0);   // disc2
    assert_eq!(out[3], 32.40); // gst (18% of 180 = 32.40)
    assert_eq!(out[4], 16.20); // sgst
    assert_eq!(out[5], 16.20); // cgst
    assert_eq!(out[6], 212.40);// final
}

#[test]
fn test_fefo_batch_stock_depletion() {
    use suite_core::inventory::depletion::{
        deplete_inventory_batches, BatchStockItem, DepletionOptions, DepletionStrategy,
    };

    let batches = vec![
        BatchStockItem {
            batch_id: Some("b_1".to_string()),
            batch_no: "BATCH-2027-06".to_string(),
            expiry_date: Some("2027-06-30".to_string()),
            current_stock: 50.0,
            mrp: Some(120.0),
            rate: Some(100.0),
            created_at: Some(1),
        },
        BatchStockItem {
            batch_id: Some("b_2".to_string()),
            batch_no: "BATCH-2026-11".to_string(),
            expiry_date: Some("2026-11-30".to_string()),
            current_stock: 10.0,
            mrp: Some(120.0),
            rate: Some(100.0),
            created_at: Some(2),
        },
        BatchStockItem {
            batch_id: Some("b_3".to_string()),
            batch_no: "BATCH-2027-01".to_string(),
            expiry_date: Some("2027-01-31".to_string()),
            current_stock: 20.0,
            mrp: Some(120.0),
            rate: Some(100.0),
            created_at: Some(3),
        },
    ];

    let options = DepletionOptions {
        strategy: DepletionStrategy::FEFO,
        allow_expired: false,
        current_date_days: Some(20454), // ~2026
    };

    // Request 25 units: should consume all 10 of BATCH-2026-11, and 15 of BATCH-2027-01
    let result = deplete_inventory_batches(25.0, &batches, &options);

    assert!(result.success);
    assert!(result.is_fully_allocated);
    assert_eq!(result.allocated_qty, 25.0);
    assert_eq!(result.unfulfilled_qty, 0.0);
    assert_eq!(result.allocations.len(), 2);

    // First allocation must be the earliest expiring batch (2026-11)
    assert_eq!(result.allocations[0].batch_no, "BATCH-2026-11");
    assert_eq!(result.allocations[0].qty_deducted, 10.0);
    assert_eq!(result.allocations[0].remaining_in_batch, 0.0);

    // Second allocation from 2027-01
    assert_eq!(result.allocations[1].batch_no, "BATCH-2027-01");
    assert_eq!(result.allocations[1].qty_deducted, 15.0);
    assert_eq!(result.allocations[1].remaining_in_batch, 5.0);
}

#[test]
fn test_fefo_insufficient_stock_and_expired_handling() {
    use suite_core::inventory::depletion::{
        deplete_inventory_batches, BatchStockItem, DepletionOptions, DepletionStrategy,
    };

    let batches = vec![
        // Expired batch in 2024
        BatchStockItem {
            batch_id: Some("b_old".to_string()),
            batch_no: "EXPIRED-2024".to_string(),
            expiry_date: Some("2024-12-31".to_string()),
            current_stock: 100.0,
            mrp: Some(50.0),
            rate: Some(40.0),
            created_at: Some(1),
        },
        // Fresh batch in 2027
        BatchStockItem {
            batch_id: Some("b_good".to_string()),
            batch_no: "FRESH-2027".to_string(),
            expiry_date: Some("2027-12-31".to_string()),
            current_stock: 15.0,
            mrp: Some(60.0),
            rate: Some(50.0),
            created_at: Some(2),
        },
    ];

    let options = DepletionOptions {
        strategy: DepletionStrategy::FEFO,
        allow_expired: false,
        current_date_days: Some(20454), // ~2026
    };

    // Request 20 units: expired batch must be ignored! Only 15 units available
    let result = deplete_inventory_batches(20.0, &batches, &options);

    assert!(result.success);
    assert!(!result.is_fully_allocated);
    assert_eq!(result.allocated_qty, 15.0);
    assert_eq!(result.unfulfilled_qty, 5.0);
    assert_eq!(result.allocations.len(), 1);
    assert_eq!(result.allocations[0].batch_no, "FRESH-2027");
}

#[test]
fn test_invoice_sequencing_and_gap_detection() {
    use suite_core::finance::ledger::sequencing::{
        audit_invoice_numbering, format_invoice_number, parse_invoice_number, InvoiceSequenceConfig,
    };

    // 1. Formatting & Parsing
    let config = InvoiceSequenceConfig {
        prefix: "INV".to_string(),
        year: Some("2026-27".to_string()),
        separator: "/".to_string(),
        padding: 4,
    };
    let formatted = format_invoice_number(&config, 42);
    assert_eq!(formatted, "INV/2026-27/0042");

    let parsed = parse_invoice_number(&formatted).expect("Should parse invoice number");
    assert_eq!(parsed.prefix, "INV");
    assert_eq!(parsed.year, Some("2026-27".to_string()));
    assert_eq!(parsed.sequence_num, 42);

    // 2. Continuous sequence
    let perfect_series = vec![
        "INV-0001".to_string(),
        "INV-0002".to_string(),
        "INV-0003".to_string(),
        "INV-0004".to_string(),
    ];
    let audit_perfect = audit_invoice_numbering(&perfect_series);
    assert!(audit_perfect.is_strictly_sequential);
    assert_eq!(audit_perfect.missing_numbers.len(), 0);
    assert_eq!(audit_perfect.duplicate_numbers.len(), 0);
    assert_eq!(audit_perfect.min_seq, Some(1));
    assert_eq!(audit_perfect.max_seq, Some(4));
    assert_eq!(audit_perfect.next_available_number, 5);

    // 3. Gaps and Duplicates
    let flawed_series = vec![
        "INV-0001".to_string(),
        "INV-0002".to_string(),
        "INV-0002".to_string(), // duplicate
        "INV-0005".to_string(), // gap: missing 3, 4
    ];
    let audit_flawed = audit_invoice_numbering(&flawed_series);
    assert!(!audit_flawed.is_strictly_sequential);
    assert_eq!(audit_flawed.duplicate_numbers, vec![2]);
    assert_eq!(audit_flawed.missing_numbers, vec![3, 4]);
    assert_eq!(audit_flawed.next_available_number, 6);
}

#[test]
fn test_ledger_cryptographic_hash_chain_and_tamper_detection() {
    use suite_core::finance::ledger::sequencing::{
        compute_ledger_entry_hash, verify_ledger_chain, LedgerAuditEntry, DEFAULT_GENESIS_HASH,
    };

    let mut entry1 = LedgerAuditEntry {
        entry_id: "tx_001".to_string(),
        invoice_no: Some("INV-0001".to_string()),
        party_id: "cust_101".to_string(),
        party_name: Some("Apollo Pharmacy".to_string()),
        amount: 1500.50,
        timestamp: 1775200000,
        entry_type: "invoice".to_string(),
        stored_hash: None,
    };
    let hash1 = compute_ledger_entry_hash(DEFAULT_GENESIS_HASH, &entry1);
    entry1.stored_hash = Some(hash1.clone());

    let mut entry2 = LedgerAuditEntry {
        entry_id: "tx_002".to_string(),
        invoice_no: None,
        party_id: "cust_101".to_string(),
        party_name: Some("Apollo Pharmacy".to_string()),
        amount: 1000.00,
        timestamp: 1775203600,
        entry_type: "payment".to_string(),
        stored_hash: None,
    };
    let hash2 = compute_ledger_entry_hash(&hash1, &entry2);
    entry2.stored_hash = Some(hash2.clone());

    let mut entry3 = LedgerAuditEntry {
        entry_id: "tx_003".to_string(),
        invoice_no: Some("INV-0002".to_string()),
        party_id: "cust_102".to_string(),
        party_name: Some("MedPlus".to_string()),
        amount: 720.00,
        timestamp: 1775207200,
        entry_type: "invoice".to_string(),
        stored_hash: None,
    };
    let hash3 = compute_ledger_entry_hash(&hash2, &entry3);
    entry3.stored_hash = Some(hash3.clone());

    let mut chain = vec![entry1, entry2, entry3];

    // 1. Valid chain verification
    let valid_report = verify_ledger_chain(&chain, None);
    assert!(valid_report.is_valid);
    assert_eq!(valid_report.total_entries, 3);
    assert_eq!(valid_report.tampered_index, None);
    assert_eq!(valid_report.head_hash, hash3);

    // 2. Tamper entry 2 amount (fraud simulation: change from 1000.00 to 100.00)
    chain[1].amount = 100.00;
    let tampered_report = verify_ledger_chain(&chain, None);
    assert!(!tampered_report.is_valid);
    assert_eq!(tampered_report.tampered_index, Some(1));
    assert_eq!(tampered_report.tampered_entry_id, Some("tx_002".to_string()));
}


