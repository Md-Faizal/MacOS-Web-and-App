use suite_core::documents::pdf::{render_bmr_dossier_pdf, BmrDispensingRow, BmrDossierRequest};
use suite_core::manufacturing::{
    reconcile_yield, scale_recipe, validate_batch_release, BatchReleaseValidationRequest,
    RecipeItem, RecipeScalingRequest, YieldReconciliationRequest,
};

#[test]
fn test_scale_recipe() {
    let req = RecipeScalingRequest {
        std_batch_size: 100.0,
        planned_batch_size: 250.0,
        items: vec![
            RecipeItem {
                raw_material_id: 1,
                raw_material_name: "Dashamoola Root".to_string(),
                uom: "KG".to_string(),
                qty_per_std_batch: 25.0,
                stage: "Decoction".to_string(),
            },
            RecipeItem {
                raw_material_id: 2,
                raw_material_name: "Jaggery (Guda)".to_string(),
                uom: "KG".to_string(),
                qty_per_std_batch: 50.0,
                stage: "Base Mixing".to_string(),
            },
        ],
    };

    let resp = scale_recipe(&req).expect("Scaling should succeed");
    assert_eq!(resp.scale_factor, 2.5);
    assert_eq!(resp.items.len(), 2);
    assert_eq!(resp.items[0].required_qty, 62.5); // 25 * 2.5
    assert_eq!(resp.items[1].required_qty, 125.0); // 50 * 2.5
}

#[test]
fn test_reconcile_yield() {
    let req = YieldReconciliationRequest {
        planned_qty: 200.0,
        actual_output_qty: 194.0,
        expected_yield_percent: 95.0,
        permissible_loss_percent: 5.0,
    };

    let resp = reconcile_yield(&req).expect("Reconciliation should succeed");
    assert_eq!(resp.actual_yield_percent, 97.0);
    assert_eq!(resp.process_loss_qty, 6.0);
    assert_eq!(resp.process_loss_percent, 3.0);
    assert!(resp.is_within_tolerance);
}

#[test]
fn test_validate_batch_release() {
    let req = BatchReleaseValidationRequest {
        batch_no: "PBR-1026".to_string(),
        mfg_date: "2026-10-01".to_string(),
        exp_date: "2029-09-30".to_string(),
        planned_qty: 100.0,
        actual_output_qty: 96.0,
        yield_percent: 96.0,
        lab_name: "State Drug Testing Laboratory".to_string(),
        lab_report_no: "SDTL/AYUR/2026/849".to_string(),
        coa_date: "2026-10-08".to_string(),
        coa_status: "PASSED".to_string(),
        technical_person: "Dr. K. C. Mohapatra (BAMS)".to_string(),
        retention_sample_qty: "2 x 450ml".to_string(),
        retention_location: "Almirah Rack B-2".to_string(),
    };

    let resp = validate_batch_release(&req);
    assert!(resp.is_valid, "Batch should be valid for release: {:?}", resp.errors);
    assert!(resp.errors.is_empty());
}

#[test]
fn test_render_bmr_dossier_pdf() {
    let req = BmrDossierRequest {
        batch_no: "AKR-1026".to_string(),
        product_name: "AMLAPITTA KUTHARA RASA".to_string(),
        pharmacopoeial_ref: "Bhaishajya Ratnavali, Amlapitta Rogadhikara".to_string(),
        mfg_date: "2026-10-01".to_string(),
        exp_date: "2029-09-30".to_string(),
        planned_qty: "50,000 Vati".to_string(),
        actual_output_qty: "48,800 Vati".to_string(),
        pack_size: "100 Vati Bottle".to_string(),
        mrp: "185.00".to_string(),
        yield_percent: "97.6".to_string(),
        status: "RELEASED".to_string(),
        lab_name: "Government Drug Testing Lab / Form 48 Approved".to_string(),
        lab_report_no: "GDTL/2026/9102".to_string(),
        coa_date: "2026-10-08".to_string(),
        coa_status: "PASSED".to_string(),
        technical_person: "Competent Technical Person (AYUSH)".to_string(),
        retention_sample_qty: "2 Bottles (100 Vati)".to_string(),
        retention_location: "QC Control Sample Almirah #3".to_string(),
        dispensing_items: vec![
            BmrDispensingRow {
                sl: "1".to_string(),
                ingredient_name: "Shuddha Parada (Purified Mercury)".to_string(),
                stage: "Kajjali".to_string(),
                std_qty: "1.00 KG".to_string(),
                actual_qty: "1.00 KG".to_string(),
                verified_by: "Approved Chemist".to_string(),
            },
            BmrDispensingRow {
                sl: "2".to_string(),
                ingredient_name: "Shuddha Gandhaka (Purified Sulphur)".to_string(),
                stage: "Kajjali".to_string(),
                std_qty: "1.00 KG".to_string(),
                actual_qty: "1.00 KG".to_string(),
                verified_by: "Approved Chemist".to_string(),
            },
        ],
        process_logs: Vec::new(),
        app_settings: std::collections::HashMap::new(),
    };

    let pdf_bytes = render_bmr_dossier_pdf(&req).expect("BMR Dossier PDF should render successfully");
    assert!(!pdf_bytes.is_empty());
    assert!(pdf_bytes.starts_with(b"%PDF-1.4"));
}
