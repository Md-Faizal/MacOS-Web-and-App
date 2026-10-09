use suite_core::documents::pdf::{
    render_ayush_dispatch_pdf, render_batch_expiry_pdf, render_gst_hsn_pdf,
    render_gstr1_summary_pdf, AyushDispatchItem, AyushDispatchRequest, BatchExpiryItem,
    BatchExpiryRequest, GstHsnItem, GstHsnRequest, Gstr1SectionItem, Gstr1SummaryRequest,
};
use std::collections::HashMap;

fn sample_settings() -> HashMap<String, String> {
    let mut map = HashMap::new();
    map.insert("company_name".to_string(), "UTKAL CHEMICAL AUSHADHALAYA".to_string());
    map.insert("company_address_factory".to_string(), "Binaba Marg, Aska, Ganjam, Odisha - 761110".to_string());
    map.insert("company_address_office".to_string(), "D1, Basera Complex, Dumduma, BBSR - 751019".to_string());
    map.insert("company_ayush_licence".to_string(), "Form 25D/26D-AYUSH-GA/04".to_string());
    map.insert("company_gstin".to_string(), "21AIDPF4446J1ZL".to_string());
    map.insert("company_pan".to_string(), "AIDPF4446J".to_string());
    map.insert("company_phone".to_string(), "06822273304 / 943933330".to_string());
    map
}

#[test]
fn test_render_ayush_dispatch_multipage_pdf() {
    let mut items = Vec::new();
    // Generate 35 items to force multi-page splitting
    for i in 1..=35 {
        items.push(AyushDispatchItem {
            date: format!("2026-05-{:02}", (i % 28) + 1),
            invoice_no: format!("INV-2026-{:04}", i),
            customer_name: format!("Customer Medical Store {:02}", i),
            customer_town: "Berhampur".to_string(),
            customer_licence_no: format!("DL-2045/B/{:02}", i),
            customer_gstin: "21AAACG0000X1Z5".to_string(),
            product_name: if i % 2 == 0 {
                "Draksharishta (Special)".to_string()
            } else {
                "Triphala Churna Premium".to_string()
            },
            batch_no: format!("DK-{:03}", i),
            pack_size: "450 ml".to_string(),
            qty: (i * 10) as f64,
            rate: 145.0,
            taxable_amount: (i * 10) as f64 * 145.0,
        });
    }

    let req = AyushDispatchRequest {
        period: "FY 2026-27 (Q1)".to_string(),
        generated_at: "2026-10-09 18:30 IST".to_string(),
        app_settings: sample_settings(),
        items,
    };

    let pdf_bytes = render_ayush_dispatch_pdf(&req).expect("AYUSH Dispatch PDF should render successfully");
    assert!(!pdf_bytes.is_empty(), "PDF bytes should not be empty");
    assert!(pdf_bytes.starts_with(b"%PDF-1.4"), "PDF must start with valid PDF-1.4 header");
}

#[test]
fn test_render_gst_hsn_pdf() {
    let items = vec![
        GstHsnItem {
            hsn_code: "30039011".to_string(),
            description: "Ayurvedic Medicaments (Classical Asava & Arishta)".to_string(),
            uqc: "BTL".to_string(),
            total_qty: 12500.0,
            total_value: 1812500.0,
            taxable_value: 1618303.57,
            igst_amount: 0.0,
            cgst_amount: 97098.21,
            sgst_amount: 97098.21,
            cess_amount: 0.0,
        },
        GstHsnItem {
            hsn_code: "30049011".to_string(),
            description: "Ayurvedic Medicaments (Proprietary Churna & Vati)".to_string(),
            uqc: "PAC".to_string(),
            total_qty: 8400.0,
            total_value: 520800.0,
            taxable_value: 465000.0,
            igst_amount: 0.0,
            cgst_amount: 27900.0,
            sgst_amount: 27900.0,
            cess_amount: 0.0,
        },
    ];

    let req = GstHsnRequest {
        period: "April 2026 to March 2027".to_string(),
        generated_at: "2026-10-09 18:30 IST".to_string(),
        app_settings: sample_settings(),
        items,
    };

    let pdf_bytes = render_gst_hsn_pdf(&req).expect("GST HSN PDF should render successfully");
    assert!(!pdf_bytes.is_empty());
    assert!(pdf_bytes.starts_with(b"%PDF-1.4"));
}

#[test]
fn test_render_gstr1_summary_pdf() {
    let sections = vec![
        Gstr1SectionItem {
            table_number: "4A".to_string(),
            description: "B2B Regular Invoices (Registered Buyers)".to_string(),
            count: 48,
            gross_value: 2333300.0,
            taxable_value: 2083303.57,
            igst: 0.0,
            cgst: 124998.21,
            sgst: 124998.21,
            cess: 0.0,
        },
        Gstr1SectionItem {
            table_number: "7".to_string(),
            description: "B2C Others (Retail Clinic Counters)".to_string(),
            count: 142,
            gross_value: 420000.0,
            taxable_value: 375000.0,
            igst: 0.0,
            cgst: 22500.0,
            sgst: 22500.0,
            cess: 0.0,
        },
        Gstr1SectionItem {
            table_number: "9B".to_string(),
            description: "Credit Notes / Breakage Returns (Registered)".to_string(),
            count: 3,
            gross_value: -15000.0,
            taxable_value: -13392.86,
            igst: 0.0,
            cgst: -803.57,
            sgst: -803.57,
            cess: 0.0,
        },
    ];

    let req = Gstr1SummaryRequest {
        period: "Q1 FY 2026-27".to_string(),
        generated_at: "2026-10-09 18:30 IST".to_string(),
        app_settings: sample_settings(),
        sections,
    };

    let pdf_bytes = render_gstr1_summary_pdf(&req).expect("GSTR-1 Summary PDF should render successfully");
    assert!(!pdf_bytes.is_empty());
    assert!(pdf_bytes.starts_with(b"%PDF-1.4"));
}

#[test]
fn test_render_batch_expiry_pdf() {
    let items = vec![
        BatchExpiryItem {
            batch_no: "DK-2024-01".to_string(),
            product_name: "Draksharishta (Classical)".to_string(),
            pack_size: "450 ml".to_string(),
            mfg_date: "2024-03-01".to_string(),
            exp_date: "2029-02-28".to_string(),
            units_produced: 5000,
            units_sold: 4800,
            balance_stock: 200,
            retained_samples: 10,
            days_to_expiry: 870,
            status: "Active".to_string(),
        },
        BatchExpiryItem {
            batch_no: "TP-2023-08".to_string(),
            product_name: "Triphala Churna".to_string(),
            pack_size: "100 g".to_string(),
            mfg_date: "2023-11-01".to_string(),
            exp_date: "2025-10-31".to_string(),
            units_produced: 2000,
            units_sold: 1950,
            balance_stock: 50,
            retained_samples: 5,
            days_to_expiry: 22,
            status: "Near Expiry (<90d)".to_string(),
        },
    ];

    let req = BatchExpiryRequest {
        as_of_date: "2025-10-09".to_string(),
        generated_at: "2026-10-09 18:30 IST".to_string(),
        app_settings: sample_settings(),
        items,
    };

    let pdf_bytes = render_batch_expiry_pdf(&req).expect("Batch Expiry PDF should render successfully");
    assert!(!pdf_bytes.is_empty());
    assert!(pdf_bytes.starts_with(b"%PDF-1.4"));
}
