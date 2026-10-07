use suite_core::analytics::aging::{
    calculate_customer_aging, calculate_receivables_aging, UnpaidBillItem,
};
use suite_core::analytics::kpi::calculate_executive_kpis;
use suite_core::catalog::expiry::check_batch_expiry;
use suite_core::ffi::fast_path::calc_line_item_fast;
use suite_core::finance::invoicing::bill::calculate_bill;
use suite_core::finance::invoicing::item::{
    calculate_free_scheme_units, LineItemCalculated, LineItemInput,
};
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
    let items = vec![OrderItemInput {
        product_id: Some("p1".to_string()),
        ordered_qty: 10.0,
        received_qty: Some(8.0),
        unit_price: 50.0,
    }];

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
    let res = unsafe { calc_line_item_fast(100.0, 2.0, 10.0, 0.0, 18.0, 0, out.as_mut_ptr()) };
    assert_eq!(res, 0);
    assert_eq!(out[0], 200.0); // amount
    assert_eq!(out[1], 20.0); // disc1
    assert_eq!(out[2], 0.0); // disc2
    assert_eq!(out[3], 32.40); // gst (18% of 180 = 32.40)
    assert_eq!(out[4], 16.20); // sgst
    assert_eq!(out[5], 16.20); // cgst
    assert_eq!(out[6], 212.40); // final
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
    assert_eq!(
        tampered_report.tampered_entry_id,
        Some("tx_002".to_string())
    );
}

#[test]
fn test_indian_currency_words() {
    use suite_core::documents::words::{amount_in_indian_words, num_to_indian_words};

    assert_eq!(num_to_indian_words(0), "Zero");
    assert_eq!(num_to_indian_words(18), "Eighteen");
    assert_eq!(num_to_indian_words(95), "Ninety Five");
    assert_eq!(num_to_indian_words(120), "One Hundred and Twenty");
    assert_eq!(num_to_indian_words(1000), "One Thousand");
    assert_eq!(num_to_indian_words(100000), "One Lakh");
    assert_eq!(num_to_indian_words(1500000), "Fifteen Lakh");
    assert_eq!(num_to_indian_words(20000000), "Two Crore");

    assert_eq!(
        amount_in_indian_words(25450.75),
        "Twenty Five Thousand Four Hundred and Fifty and Seventy Five Paise Only"
    );
}

#[test]
fn test_native_invoice_pdf_generation() {
    use suite_core::documents::pdf::{render_invoice_pdf, InvoiceProductItem, InvoiceRenderData};

    let item1 = InvoiceProductItem {
        name: "PARACETAMOL 500MG TAB".to_string(),
        hsn: "30049011".to_string(),
        mfg: "CIPLA".to_string(),
        pack: "10 TAB".to_string(),
        batch_no: "BATCH-889".to_string(),
        exp_date: Some("2027-10-31".to_string()),
        qty: 50.0,
        free: 5.0,
        mrp: 35.0,
        rate: 28.0,
        amount: 1400.0,
        dis1: 5.0,
        dis2: 0.0,
        sgst_per: 6.0,
        sgst_val: 79.80,
        cgst_per: 6.0,
        cgst_val: 79.80,
        final_amt: 1489.60,
        is_gold: false,
    };

    let data = InvoiceRenderData {
        invoice_no: "INV-2026-0042".to_string(),
        invoice_date: Some("2026-10-03".to_string()),
        due_date: Some("2026-11-02".to_string()),
        lr_no: Some("LR-9988".to_string()),
        lr_date: Some("2026-10-03".to_string()),
        party_name: "APOLLO PHARMACY BHUBANESWAR".to_string(),
        address: "PLOT 102, JANPATH, SAHEED NAGAR, BHUBANESWAR".to_string(),
        phone: "9876543210".to_string(),
        licence_no: "20B-123456".to_string(),
        pan: "ABCDE1234F".to_string(),
        gstin: "21ABCDE1234F1Z5".to_string(),
        total_amount: 1400.0,
        total_discount: 70.0,
        total_sgst: 79.80,
        total_cgst: 79.80,
        round_off: 0.40,
        grand_total: 1490.0,
        previous_due: 0.0,
        products: vec![item1],
        duplex_print: false,
        export_mode: false,
        app_settings: Default::default(),
        customer_ledger_token: None,
        invoice_ledger_ref: None,
        customer_id: None,
        i_customer_id: None,
        bank_account_holder: Some("MD FAIZAL".to_string()),
        bank_account_number: Some("50100673684509".to_string()),
        bank_ifsc: Some("HDFC0000236".to_string()),
        bank_branch: Some("CUTTACK - ODISHA".to_string()),
    };

    let pdf_bytes = render_invoice_pdf(&data).expect("invoice PDF should render");

    // Validate standard PDF structure
    assert!(pdf_bytes.starts_with(b"%PDF-1.4"));
    assert!(pdf_bytes.ends_with(b"%%EOF\n"));

    let pdf_str = String::from_utf8_lossy(&pdf_bytes);
    assert!(pdf_str.contains("UTKAL CHEMICAL AUSHADHALAYA"));
    assert!(pdf_str.contains("GST INVOICE"));
    assert!(pdf_str.contains("INV-2026-0042"));
    assert!(pdf_str.contains("PARACETAMOL 500MG TAB"));
    assert!(pdf_str.contains("APOLLO PHARMACY BHUBANESWAR"));
    assert!(pdf_str.contains("Rs. One Thousand Four Hundred and Ninety Only"));
    assert!(pdf_str.contains("Bills not paid due date will attract 24% interest."));
    assert!(pdf_str.contains("Authorised Signatory"));
    assert!(!pdf_str.contains("Bank: HDFC Bank"));

    let mut long_invoice = data.clone();
    let template_item = long_invoice.products[0].clone();
    long_invoice.products = (0..100).map(|_| template_item.clone()).collect();
    long_invoice.total_amount *= 100.0;
    long_invoice.total_discount *= 100.0;
    long_invoice.total_sgst *= 100.0;
    long_invoice.total_cgst *= 100.0;
    long_invoice.round_off *= 100.0;
    long_invoice.grand_total *= 100.0;
    long_invoice.duplex_print = true;
    let long_pdf = render_invoice_pdf(&long_invoice).expect("long invoice PDF should render");
    let long_pdf_str = String::from_utf8_lossy(&long_pdf);
    assert_eq!(long_pdf_str.matches("PARACETAMOL 500MG TAB").count(), 100);
    assert_eq!(long_pdf_str.matches("/Type /Page ").count(), 5);
    assert_eq!(
        long_pdf_str
            .matches("/MediaBox [0 0 841.89 595.28]")
            .count(),
        4
    );
    assert_eq!(
        long_pdf_str
            .matches("/MediaBox [0 0 595.28 841.89]")
            .count(),
        1
    );
    assert!(long_pdf_str.contains("CONTINUED ON PAGE: 2"));
    assert!(long_pdf_str.contains("CONTINUED ON PAGE: 3"));
    assert!(long_pdf_str.contains("CONTINUED ON PAGE: 4"));
    assert!(long_pdf_str.contains("Authorised Signatory"));
    assert!(long_pdf_str.contains("Grand Total"));
    assert!(long_pdf_str.contains("BANK TRANSFER DETAILS"));
    assert!(long_pdf_str.contains("CUSTOMER PORTAL"));
    assert!(long_pdf_str.contains("UPI: 7749089400@hdfc"));
    assert!(long_pdf_str.contains("(01) Tj"));
    assert!(long_pdf_str.contains("(02) Tj"));
}

#[test]
fn test_image_header_and_dimensions() {
    use suite_core::storage::dimensions::{
        inspect_image_metadata, parse_image_dimensions, ImageFormat,
    };

    // 1. Mock 4K PNG Header (3840 x 2160)
    let png_header = vec![
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
        0x00, 0x00, 0x00, 0x0D, // IHDR chunk length = 13
        b'I', b'H', b'D', b'R', // "IHDR"
        0x00, 0x00, 0x0F, 0x00, // Width = 3840 (0x0F00)
        0x00, 0x00, 0x08, 0x70, // Height = 2160 (0x0870)
        0x08, 0x06, 0x00, 0x00, 0x00, // Bit depth, color type, etc.
    ];
    let (fmt, w, h) = parse_image_dimensions(&png_header).expect("Should parse PNG dimensions");
    assert_eq!(fmt, ImageFormat::Png);
    assert_eq!(w, 3840);
    assert_eq!(h, 2160);

    let meta = inspect_image_metadata(&png_header);
    assert_eq!(meta.format, "png");
    assert_eq!(meta.width, 3840);
    assert_eq!(meta.height, 2160);
    assert_eq!(meta.aspect_ratio, "16:9");
    assert_eq!(meta.resolution_label, "4K Ultra HD");
    assert!(meta.is_valid);

    // 2. Mock 1080p JPEG Header (1920 x 1080)
    let jpeg_header = vec![
        0xFF, 0xD8, 0xFF, 0xE0, // SOI + APP0 marker
        0x00, 0x10, // APP0 length = 16
        b'J', b'F', b'I', b'F', 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF,
        0xC0, // SOF0 marker
        0x00, 0x11, // Length = 17
        0x08, // Precision = 8
        0x04, 0x38, // Height = 1080 (0x0438)
        0x07, 0x80, // Width = 1920 (0x0780)
        0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    ];
    let (j_fmt, j_w, j_h) =
        parse_image_dimensions(&jpeg_header).expect("Should parse JPEG dimensions");
    assert_eq!(j_fmt, ImageFormat::Jpeg);
    assert_eq!(j_w, 1920);
    assert_eq!(j_h, 1080);

    let j_meta = inspect_image_metadata(&jpeg_header);
    assert_eq!(j_meta.format, "jpeg");
    assert_eq!(j_meta.resolution_label, "1080p Full HD");
    assert_eq!(j_meta.aspect_ratio, "16:9");

    // 3. Mock GIF Header (800 x 600)
    let gif_header = vec![
        b'G', b'I', b'F', b'8', b'9', b'a', 0x20, 0x03, // Width = 800 (0x0320)
        0x58, 0x02, // Height = 600 (0x0258)
        0x70, 0x00, 0x00,
    ];
    let (g_fmt, g_w, g_h) =
        parse_image_dimensions(&gif_header).expect("Should parse GIF dimensions");
    assert_eq!(g_fmt, ImageFormat::Gif);
    assert_eq!(g_w, 800);
    assert_eq!(g_h, 600);
    let g_meta = inspect_image_metadata(&gif_header);
    assert_eq!(g_meta.aspect_ratio, "4:3");
}

#[test]
fn test_wallpaper_asset_scan_and_fit() {
    use suite_core::storage::wallpaper::{calculate_fit_dimensions, scan_wallpaper_asset, FitMode};

    // Test thumbnail cover fit: 3840x2160 -> fit inside 480x270
    let fit_cover = calculate_fit_dimensions(3840, 2160, 480, 270, FitMode::Cover);
    assert_eq!(fit_cover.target_width, 480);
    assert_eq!(fit_cover.target_height, 270);

    // Test non-standard ratio: 3840x2400 (16:10) -> fit inside 480x270 (Cover)
    let fit_cover_16_10 = calculate_fit_dimensions(3840, 2400, 480, 270, FitMode::Cover);
    assert!(fit_cover_16_10.target_width >= 480);
    assert!(fit_cover_16_10.target_height >= 270);

    // Test full wallpaper scan on mock 4K PNG
    let png_4k = vec![
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, b'I', b'H', b'D',
        b'R', 0x00, 0x00, 0x0F, 0x00, // 3840
        0x00, 0x00, 0x08, 0x70, // 2160
        0x08, 0x06, 0x00, 0x00, 0x00,
    ];
    let scan = scan_wallpaper_asset(&png_4k);
    assert!(scan.is_valid);
    assert!(scan.is_4k_or_higher);
    assert_eq!(scan.resolution_label, "4K Ultra HD");
    assert_eq!(scan.recommended_category, "ultra-hd");
    assert!(!scan.checksum_sha256.is_empty());
}

#[test]
fn test_pharmaceutical_fuzzy_search_and_typo_tolerance() {
    use serde_json::json;
    use std::collections::HashMap;
    use suite_core::catalog::search::{search_catalog, SearchCatalogItem, SearchOptions};

    let catalog = vec![
        SearchCatalogItem {
            id: json!(101),
            name: "Paracetamol 500mg Tablets".to_string(),
            odia_name: Some("ପାରାସିଟାମଲ".to_string()),
            category_name: Some("Analgesic / Antipyretic".to_string()),
            classification: Some("Fever & Pain".to_string()),
            pack_size: Some("10x10 TAB".to_string()),
            mrp: Some(25.0),
            units_sold: Some(5000.0),
            extra: HashMap::new(),
        },
        SearchCatalogItem {
            id: json!(102),
            name: "Dolo 650 MG Tablet".to_string(),
            odia_name: None,
            category_name: Some("Analgesic".to_string()),
            classification: Some("Antipyretic".to_string()),
            pack_size: Some("15 TAB".to_string()),
            mrp: Some(34.0),
            units_sold: Some(8500.0),
            extra: HashMap::new(),
        },
        SearchCatalogItem {
            id: json!(103),
            name: "Amoxicillin Trihydrate 500mg".to_string(),
            odia_name: None,
            category_name: Some("Antibiotic".to_string()),
            classification: Some("Penicillin".to_string()),
            pack_size: Some("10 CAP".to_string()),
            mrp: Some(88.0),
            units_sold: Some(2100.0),
            extra: HashMap::new(),
        },
        SearchCatalogItem {
            id: json!(104),
            name: "Cetirizine 10mg Tablets".to_string(),
            odia_name: None,
            category_name: Some("Antiallergic".to_string()),
            classification: Some("Antihistamine".to_string()),
            pack_size: Some("10 TAB".to_string()),
            mrp: Some(19.5),
            units_sold: Some(4200.0),
            extra: HashMap::new(),
        },
        SearchCatalogItem {
            id: json!(105),
            name: "PAN-D Gastro-Resistant Capsule".to_string(),
            odia_name: None,
            category_name: Some("Antacid".to_string()),
            classification: Some("Pantoprazole + Domperidone".to_string()),
            pack_size: Some("15 CAP".to_string()),
            mrp: Some(210.0),
            units_sold: Some(9200.0),
            extra: HashMap::new(),
        },
        SearchCatalogItem {
            id: json!(106),
            name: "Augmentin 625 Duo Tablet".to_string(),
            odia_name: None,
            category_name: Some("Antibiotic".to_string()),
            classification: Some("Amoxycillin and Potassium Clavulanate".to_string()),
            pack_size: Some("10 TAB".to_string()),
            mrp: Some(204.0),
            units_sold: Some(7100.0),
            extra: HashMap::new(),
        },
    ];

    let opts = SearchOptions::default();

    // 1. Missing vowel typo: "paracetmol"
    let r1 = search_catalog("paracetmol", &catalog, &opts);
    assert!(!r1.is_empty(), "Should find Paracetamol with omitted vowel");
    assert_eq!(r1[0].item.name, "Paracetamol 500mg Tablets");

    // 2. Vowel substitution typo: "paracitamol"
    let r2 = search_catalog("paracitamol", &catalog, &opts);
    assert!(
        !r2.is_empty(),
        "Should find Paracetamol with vowel substitution"
    );
    assert_eq!(r2[0].item.name, "Paracetamol 500mg Tablets");

    // 3. Multi-token inverted order: "650 dolo"
    let r3 = search_catalog("650 dolo", &catalog, &opts);
    assert!(!r3.is_empty(), "Should match 650 dolo in inverted order");
    assert_eq!(r3[0].item.name, "Dolo 650 MG Tablet");

    // 4. Missing space and hyphen: "pand"
    let r4 = search_catalog("pand", &catalog, &opts);
    assert!(!r4.is_empty(), "Should match pand to PAN-D");
    assert_eq!(r4[0].item.name, "PAN-D Gastro-Resistant Capsule");

    // 5. Acronym: "pcm"
    let r5 = search_catalog("pcm", &catalog, &opts);
    assert!(!r5.is_empty(), "Acronym PCM should match Paracetamol");
    assert_eq!(r5[0].item.name, "Paracetamol 500mg Tablets");

    // 6. Generic/classification search: "amoxycillin"
    let r6 = search_catalog("amoxycillin", &catalog, &opts);
    assert!(
        !r6.is_empty(),
        "Classification amoxycillin should match Augmentin or Amoxicillin"
    );

    // 7. Typo in Cetirizine: "cetrizine"
    let r7 = search_catalog("cetrizine", &catalog, &opts);
    assert!(!r7.is_empty(), "Should match cetrizine to Cetirizine");
    assert_eq!(r7[0].item.name, "Cetirizine 10mg Tablets");
}

#[test]
fn test_payment_voucher_and_credit_note_generation() {
    use suite_core::documents::pdf::{render_payment_voucher_pdf, PaymentVoucherRenderData, VoucherType};
    use std::collections::HashMap;

    let voucher = PaymentVoucherRenderData {
        voucher_type: VoucherType::PaymentReceipt,
        reference_number: "PAY-260042".to_string(),
        payment_date: "2026-10-07".to_string(),
        customer_name: "Mahaveer Medical Hall".to_string(),
        customer_gstin: "21AABCM1234D1Z2".to_string(),
        customer_licence_no: "20B-1122, 21B-3344".to_string(),
        customer_pan: "AABCM1234D".to_string(),
        customer_phone: "9437112233".to_string(),
        customer_address: "Court Road, Aska, Ganjam".to_string(),
        amount: 8750.50,
        payment_method: "UPI (HDFC Bank)".to_string(),
        linked_invoice_no: Some("GST-260012".to_string()),
        linked_invoice_amount: Some(8750.50),
        current_outstanding_due: Some(0.0),
        account_status: Some("SETTLED".to_string()),
        aging_days: Some(0),
        due_percentage: Some(0.0),
        remarks: Some("Settlement of Bill GST-260012 via GPay".to_string()),
        customer_ledger_token: Some("ledger_sec_tok_99".to_string()),
        customer_id: Some(15),
        export_mode: false,
        due_bills: Vec::new(),
        app_settings: HashMap::new(),
    };

    let pdf_bytes = render_payment_voucher_pdf(&voucher).expect("Must generate payment voucher PDF");
    assert!(pdf_bytes.starts_with(b"%PDF-1.4"));
    let pdf_str = String::from_utf8_lossy(&pdf_bytes);

    assert!(pdf_str.contains("UTKAL CHEMICAL AUSHADHALAYA"));
    assert!(pdf_str.contains("PAYMENT RECEIPT"));
    assert!(pdf_str.contains("PAY-260042"));
    assert!(pdf_str.contains("Mahaveer Medical Hall"));
    assert!(pdf_str.contains("UPI"));
    assert!(pdf_str.contains("HDFC BANK"));
    assert!(pdf_str.contains("Bill #GST-260012 \\(Rs. 8,750.50\\)"));
    assert!(pdf_str.contains("SETTLED"));
    assert!(pdf_str.contains("CUSTOMER / RECEIVER SIGNATURE"));
    assert!(pdf_str.contains("Authorised Signatory"));

    // Ensure zero MARG branding or filler words
    assert!(!pdf_str.contains("MARG"));
    assert!(!pdf_str.contains("9437026823"));
    assert!(!pdf_str.contains("computer-generated document"));
}

