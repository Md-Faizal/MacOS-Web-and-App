use super::report_table::{
    ColumnAlign, MultiPageTableReport, ReportCompanyHeader, ReportMeta, TableColumnDef,
    TableRowData,
};
use crate::types::round2;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// =============================================================================
// 1. AYUSH SCHEDULE T FINISHED GOODS DISTRIBUTION REGISTER
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AyushDispatchItem {
    pub date: String,
    pub invoice_no: String,
    pub customer_name: String,
    #[serde(default)]
    pub customer_town: String,
    #[serde(default)]
    pub customer_licence_no: String,
    #[serde(default)]
    pub customer_gstin: String,
    pub product_name: String,
    pub batch_no: String,
    #[serde(default)]
    pub pack_size: String,
    pub qty: f64,
    pub rate: f64,
    pub taxable_amount: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AyushDispatchRequest {
    #[serde(default)]
    pub period: String,
    #[serde(default)]
    pub generated_at: String,
    #[serde(default)]
    pub app_settings: HashMap<String, String>,
    pub items: Vec<AyushDispatchItem>,
}

pub fn render_ayush_dispatch_pdf(req: &AyushDispatchRequest) -> Result<Vec<u8>, String> {
    let company = ReportCompanyHeader::from_settings(&req.app_settings);

    let period_text = if req.period.trim().is_empty() {
        "All Records (YTD)".to_string()
    } else {
        req.period.clone()
    };

    let generated_at = if req.generated_at.trim().is_empty() {
        "Immediate System Snapshot".to_string()
    } else {
        req.generated_at.clone()
    };

    let meta = ReportMeta {
        report_title: "FINISHED GOODS DISTRIBUTION & DISPATCH REGISTER".to_string(),
        statutory_reference: "Mandatory Drug Traceability Register under Rule 157 & Schedule T (GMP), Drugs & Cosmetics Rules, 1945".to_string(),
        period_text,
        generated_at,
        statutory_declaration: "Certified that this distribution register is accurately maintained for drug recall traceability as per Schedule T Good Manufacturing Practices.".to_string(),
        signatory_title: "Competent Technical Person / Authorized Signatory".to_string(),
    };

    let columns = vec![
        TableColumnDef {
            header: "Sl.".to_string(),
            width: 26.0,
            align: ColumnAlign::Center,
        },
        TableColumnDef {
            header: "Date & Inv. No".to_string(),
            width: 76.0,
            align: ColumnAlign::Left,
        },
        TableColumnDef {
            header: "Customer & Destination".to_string(),
            width: 125.0,
            align: ColumnAlign::Left,
        },
        TableColumnDef {
            header: "Drug Lic. / GSTIN".to_string(),
            width: 90.0,
            align: ColumnAlign::Left,
        },
        TableColumnDef {
            header: "Formulation (Ayurvedic)".to_string(),
            width: 155.0,
            align: ColumnAlign::Left,
        },
        TableColumnDef {
            header: "Batch No.".to_string(),
            width: 62.0,
            align: ColumnAlign::Center,
        },
        TableColumnDef {
            header: "Pack Size".to_string(),
            width: 58.0,
            align: ColumnAlign::Center,
        },
        TableColumnDef {
            header: "Qty Disp.".to_string(),
            width: 45.0,
            align: ColumnAlign::Right,
        },
        TableColumnDef {
            header: "Rate (Rs)".to_string(),
            width: 55.0,
            align: ColumnAlign::Right,
        },
        TableColumnDef {
            header: "Taxable Amt (Rs)".to_string(),
            width: 76.0,
            align: ColumnAlign::Right,
        },
    ];

    let mut total_qty = 0.0;
    let mut total_taxable = 0.0;

    let rows: Vec<TableRowData> = req
        .items
        .iter()
        .enumerate()
        .map(|(idx, item)| {
            total_qty += item.qty;
            total_taxable += item.taxable_amount;

            let cust_display = if !item.customer_town.trim().is_empty() {
                format!("{}, {}", item.customer_name, item.customer_town)
            } else {
                item.customer_name.clone()
            };

            let lic_display = if !item.customer_licence_no.trim().is_empty() {
                item.customer_licence_no.clone()
            } else if !item.customer_gstin.trim().is_empty() {
                item.customer_gstin.clone()
            } else {
                "-".to_string()
            };

            let date_inv = format!("{} / {}", item.date, item.invoice_no);

            TableRowData {
                cells: vec![
                    format!("{}", idx + 1),
                    date_inv,
                    cust_display,
                    lic_display,
                    item.product_name.clone(),
                    item.batch_no.clone(),
                    item.pack_size.clone(),
                    format!("{:.0}", item.qty),
                    format!("{:.2}", item.rate),
                    format!("{:.2}", item.taxable_amount),
                ],
                is_highlighted: false,
            }
        })
        .collect();

    let summary_rows = vec![vec![
        "TOTALS:".to_string(),
        "".to_string(),
        "".to_string(),
        "".to_string(),
        format!("Total Line Items: {}", req.items.len()),
        "".to_string(),
        "".to_string(),
        format!("{:.0}", total_qty),
        "".to_string(),
        format!("{:.2}", round2(total_taxable)),
    ]];

    let report = MultiPageTableReport::new(company, meta, columns, rows, summary_rows, true);
    report.render_pdf()
}

// =============================================================================
// 2. GST TABLE 12 HSN-WISE OUTWARD SUMMARY
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GstHsnItem {
    pub hsn_code: String,
    pub description: String,
    #[serde(default = "default_uqc")]
    pub uqc: String,
    pub total_qty: f64,
    pub total_value: f64,
    pub taxable_value: f64,
    #[serde(default)]
    pub igst_amount: f64,
    #[serde(default)]
    pub cgst_amount: f64,
    #[serde(default)]
    pub sgst_amount: f64,
    #[serde(default)]
    pub cess_amount: f64,
}

fn default_uqc() -> String {
    "NOS".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GstHsnRequest {
    #[serde(default)]
    pub period: String,
    #[serde(default)]
    pub generated_at: String,
    #[serde(default)]
    pub app_settings: HashMap<String, String>,
    pub items: Vec<GstHsnItem>,
}

pub fn render_gst_hsn_pdf(req: &GstHsnRequest) -> Result<Vec<u8>, String> {
    let company = ReportCompanyHeader::from_settings(&req.app_settings);

    let period_text = if req.period.trim().is_empty() {
        "Current Financial Year".to_string()
    } else {
        req.period.clone()
    };

    let generated_at = if req.generated_at.trim().is_empty() {
        "Immediate System Snapshot".to_string()
    } else {
        req.generated_at.clone()
    };

    let meta = ReportMeta {
        report_title: "HSN-WISE SUMMARY OF OUTWARD SUPPLIES (TABLE 12 GSTR-1)".to_string(),
        statutory_reference: "Mandatory Statutory Filing Report under Section 37 of CGST Act, 2017 & Rule 59".to_string(),
        period_text,
        generated_at,
        statutory_declaration: "Certified that the HSN classification and values reported herein match books of accounts and invoices issued during the period.".to_string(),
        signatory_title: "Proprietor / Authorized Tax Signatory".to_string(),
    };

    let columns = vec![
        TableColumnDef {
            header: "Sl.".to_string(),
            width: 26.0,
            align: ColumnAlign::Center,
        },
        TableColumnDef {
            header: "HSN Code".to_string(),
            width: 68.0,
            align: ColumnAlign::Center,
        },
        TableColumnDef {
            header: "Commodity Description".to_string(),
            width: 175.0,
            align: ColumnAlign::Left,
        },
        TableColumnDef {
            header: "UQC".to_string(),
            width: 45.0,
            align: ColumnAlign::Center,
        },
        TableColumnDef {
            header: "Total Qty".to_string(),
            width: 60.0,
            align: ColumnAlign::Right,
        },
        TableColumnDef {
            header: "Total Value (Rs)".to_string(),
            width: 85.0,
            align: ColumnAlign::Right,
        },
        TableColumnDef {
            header: "Taxable Value (Rs)".to_string(),
            width: 85.0,
            align: ColumnAlign::Right,
        },
        TableColumnDef {
            header: "IGST (Rs)".to_string(),
            width: 65.0,
            align: ColumnAlign::Right,
        },
        TableColumnDef {
            header: "CGST (Rs)".to_string(),
            width: 65.0,
            align: ColumnAlign::Right,
        },
        TableColumnDef {
            header: "SGST (Rs)".to_string(),
            width: 65.0,
            align: ColumnAlign::Right,
        },
        TableColumnDef {
            header: "Cess (Rs)".to_string(),
            width: 40.0,
            align: ColumnAlign::Right,
        },
    ];

    let mut tot_qty = 0.0;
    let mut tot_val = 0.0;
    let mut tot_taxable = 0.0;
    let mut tot_igst = 0.0;
    let mut tot_cgst = 0.0;
    let mut tot_sgst = 0.0;
    let mut tot_cess = 0.0;

    let rows: Vec<TableRowData> = req
        .items
        .iter()
        .enumerate()
        .map(|(idx, item)| {
            tot_qty += item.total_qty;
            tot_val += item.total_value;
            tot_taxable += item.taxable_value;
            tot_igst += item.igst_amount;
            tot_cgst += item.cgst_amount;
            tot_sgst += item.sgst_amount;
            tot_cess += item.cess_amount;

            TableRowData {
                cells: vec![
                    format!("{}", idx + 1),
                    item.hsn_code.clone(),
                    item.description.clone(),
                    item.uqc.clone(),
                    format!("{:.0}", item.total_qty),
                    format!("{:.2}", item.total_value),
                    format!("{:.2}", item.taxable_value),
                    format!("{:.2}", item.igst_amount),
                    format!("{:.2}", item.cgst_amount),
                    format!("{:.2}", item.sgst_amount),
                    format!("{:.2}", item.cess_amount),
                ],
                is_highlighted: false,
            }
        })
        .collect();

    let summary_rows = vec![vec![
        "TOTAL:".to_string(),
        "".to_string(),
        format!("Distinct HSN Categories: {}", req.items.len()),
        "".to_string(),
        format!("{:.0}", tot_qty),
        format!("{:.2}", round2(tot_val)),
        format!("{:.2}", round2(tot_taxable)),
        format!("{:.2}", round2(tot_igst)),
        format!("{:.2}", round2(tot_cgst)),
        format!("{:.2}", round2(tot_sgst)),
        format!("{:.2}", round2(tot_cess)),
    ]];

    let report = MultiPageTableReport::new(company, meta, columns, rows, summary_rows, true);
    report.render_pdf()
}

// =============================================================================
// 3. GSTR-1 OUTWARD SUPPLIES RETURN SUMMARY (B2B, B2C, CREDIT NOTES)
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Gstr1SectionItem {
    pub table_number: String,
    pub description: String,
    pub count: i64,
    pub gross_value: f64,
    pub taxable_value: f64,
    #[serde(default)]
    pub igst: f64,
    #[serde(default)]
    pub cgst: f64,
    #[serde(default)]
    pub sgst: f64,
    #[serde(default)]
    pub cess: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Gstr1SummaryRequest {
    #[serde(default)]
    pub period: String,
    #[serde(default)]
    pub generated_at: String,
    #[serde(default)]
    pub app_settings: HashMap<String, String>,
    pub sections: Vec<Gstr1SectionItem>,
}

pub fn render_gstr1_summary_pdf(req: &Gstr1SummaryRequest) -> Result<Vec<u8>, String> {
    let company = ReportCompanyHeader::from_settings(&req.app_settings);

    let period_text = if req.period.trim().is_empty() {
        "Monthly Filing Period".to_string()
    } else {
        req.period.clone()
    };

    let generated_at = if req.generated_at.trim().is_empty() {
        "Immediate System Snapshot".to_string()
    } else {
        req.generated_at.clone()
    };

    let meta = ReportMeta {
        report_title: "GSTR-1 OUTWARD SUPPLIES SUMMARY & TAX LIABILITY".to_string(),
        statutory_reference: "Executive Audit Summary for Central / State GST Filing & Reconciliation".to_string(),
        period_text,
        generated_at,
        statutory_declaration: "Certified that this summary reconciles all invoices, credit notes, and amendments issued in the tax period.".to_string(),
        signatory_title: "Proprietor / Tax Administrator".to_string(),
    };

    let columns = vec![
        TableColumnDef {
            header: "Table".to_string(),
            width: 48.0,
            align: ColumnAlign::Center,
        },
        TableColumnDef {
            header: "Supply Nature / Section".to_string(),
            width: 220.0,
            align: ColumnAlign::Left,
        },
        TableColumnDef {
            header: "Vouchers".to_string(),
            width: 55.0,
            align: ColumnAlign::Center,
        },
        TableColumnDef {
            header: "Gross Value (Rs)".to_string(),
            width: 95.0,
            align: ColumnAlign::Right,
        },
        TableColumnDef {
            header: "Taxable Value (Rs)".to_string(),
            width: 95.0,
            align: ColumnAlign::Right,
        },
        TableColumnDef {
            header: "IGST (Rs)".to_string(),
            width: 72.0,
            align: ColumnAlign::Right,
        },
        TableColumnDef {
            header: "CGST (Rs)".to_string(),
            width: 72.0,
            align: ColumnAlign::Right,
        },
        TableColumnDef {
            header: "SGST (Rs)".to_string(),
            width: 72.0,
            align: ColumnAlign::Right,
        },
    ];

    let mut tot_count = 0;
    let mut tot_gross = 0.0;
    let mut tot_taxable = 0.0;
    let mut tot_igst = 0.0;
    let mut tot_cgst = 0.0;
    let mut tot_sgst = 0.0;

    let rows: Vec<TableRowData> = req
        .sections
        .iter()
        .map(|sec| {
            tot_count += sec.count;
            tot_gross += sec.gross_value;
            tot_taxable += sec.taxable_value;
            tot_igst += sec.igst;
            tot_cgst += sec.cgst;
            tot_sgst += sec.sgst;

            TableRowData {
                cells: vec![
                    sec.table_number.clone(),
                    sec.description.clone(),
                    format!("{}", sec.count),
                    format!("{:.2}", sec.gross_value),
                    format!("{:.2}", sec.taxable_value),
                    format!("{:.2}", sec.igst),
                    format!("{:.2}", sec.cgst),
                    format!("{:.2}", sec.sgst),
                ],
                is_highlighted: false,
            }
        })
        .collect();

    let summary_rows = vec![vec![
        "TOTAL:".to_string(),
        "Net Outward Liability".to_string(),
        format!("{}", tot_count),
        format!("{:.2}", round2(tot_gross)),
        format!("{:.2}", round2(tot_taxable)),
        format!("{:.2}", round2(tot_igst)),
        format!("{:.2}", round2(tot_cgst)),
        format!("{:.2}", round2(tot_sgst)),
    ]];

    let report = MultiPageTableReport::new(company, meta, columns, rows, summary_rows, true);
    report.render_pdf()
}

// =============================================================================
// 4. AYUSH BATCH EXPIRY & RETENTION SAMPLE REGISTER (RULE 161B & GMP)
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchExpiryItem {
    pub batch_no: String,
    pub product_name: String,
    #[serde(default)]
    pub pack_size: String,
    pub mfg_date: String,
    pub exp_date: String,
    #[serde(default)]
    pub units_produced: i64,
    #[serde(default)]
    pub units_sold: i64,
    #[serde(default)]
    pub balance_stock: i64,
    #[serde(default)]
    pub retained_samples: i64,
    #[serde(default)]
    pub days_to_expiry: i64,
    #[serde(default)]
    pub status: String, // "Active", "Near Expiry (<90d)", "Expired"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchExpiryRequest {
    #[serde(default)]
    pub as_of_date: String,
    #[serde(default)]
    pub generated_at: String,
    #[serde(default)]
    pub app_settings: HashMap<String, String>,
    pub items: Vec<BatchExpiryItem>,
}

pub fn render_batch_expiry_pdf(req: &BatchExpiryRequest) -> Result<Vec<u8>, String> {
    let company = ReportCompanyHeader::from_settings(&req.app_settings);

    let as_of = if req.as_of_date.trim().is_empty() {
        "Current Date".to_string()
    } else {
        req.as_of_date.clone()
    };

    let generated_at = if req.generated_at.trim().is_empty() {
        "Immediate System Snapshot".to_string()
    } else {
        req.generated_at.clone()
    };

    let meta = ReportMeta {
        report_title: "BATCH EXPIRY & RETENTION SAMPLE REGISTER (AYUSH RULE 161B)".to_string(),
        statutory_reference: "Quality Control & Shelf-Life Compliance Register under Schedule T (GMP) & Rule 161B".to_string(),
        period_text: format!("Audit As Of: {}", as_of),
        generated_at,
        statutory_declaration: "Certified that retention samples of all active batches are stored under prescribed temperature and control samples retained till 1 year post expiry.".to_string(),
        signatory_title: "Quality Control In-Charge / Technical Person".to_string(),
    };

    let columns = vec![
        TableColumnDef {
            header: "Sl.".to_string(),
            width: 26.0,
            align: ColumnAlign::Center,
        },
        TableColumnDef {
            header: "Batch No".to_string(),
            width: 68.0,
            align: ColumnAlign::Center,
        },
        TableColumnDef {
            header: "Product / Medicine Name".to_string(),
            width: 175.0,
            align: ColumnAlign::Left,
        },
        TableColumnDef {
            header: "Pack Size".to_string(),
            width: 55.0,
            align: ColumnAlign::Center,
        },
        TableColumnDef {
            header: "Mfg. Date".to_string(),
            width: 65.0,
            align: ColumnAlign::Center,
        },
        TableColumnDef {
            header: "Exp. Date".to_string(),
            width: 65.0,
            align: ColumnAlign::Center,
        },
        TableColumnDef {
            header: "Produced".to_string(),
            width: 52.0,
            align: ColumnAlign::Right,
        },
        TableColumnDef {
            header: "Dispatched".to_string(),
            width: 55.0,
            align: ColumnAlign::Right,
        },
        TableColumnDef {
            header: "Bal. Stock".to_string(),
            width: 55.0,
            align: ColumnAlign::Right,
        },
        TableColumnDef {
            header: "Retained".to_string(),
            width: 48.0,
            align: ColumnAlign::Right,
        },
        TableColumnDef {
            header: "Shelf Status".to_string(),
            width: 80.0,
            align: ColumnAlign::Center,
        },
    ];

    let mut tot_produced = 0;
    let mut tot_dispatched = 0;
    let mut tot_stock = 0;
    let mut tot_retained = 0;

    let rows: Vec<TableRowData> = req
        .items
        .iter()
        .enumerate()
        .map(|(idx, item)| {
            tot_produced += item.units_produced;
            tot_dispatched += item.units_sold;
            tot_stock += item.balance_stock;
            tot_retained += item.retained_samples;

            let is_alert = item.status.contains("Near") || item.status.contains("Expired");

            TableRowData {
                cells: vec![
                    format!("{}", idx + 1),
                    item.batch_no.clone(),
                    item.product_name.clone(),
                    item.pack_size.clone(),
                    item.mfg_date.clone(),
                    item.exp_date.clone(),
                    format!("{}", item.units_produced),
                    format!("{}", item.units_sold),
                    format!("{}", item.balance_stock),
                    format!("{}", item.retained_samples),
                    item.status.clone(),
                ],
                is_highlighted: is_alert,
            }
        })
        .collect();

    let summary_rows = vec![vec![
        "TOTAL:".to_string(),
        "".to_string(),
        format!("Total Batches Audited: {}", req.items.len()),
        "".to_string(),
        "".to_string(),
        "".to_string(),
        format!("{}", tot_produced),
        format!("{}", tot_dispatched),
        format!("{}", tot_stock),
        format!("{}", tot_retained),
        "".to_string(),
    ]];

    let report = MultiPageTableReport::new(company, meta, columns, rows, summary_rows, true);
    report.render_pdf()
}
