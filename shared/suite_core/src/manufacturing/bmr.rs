use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecipeItem {
    pub raw_material_id: i64,
    pub raw_material_name: String,
    pub uom: String,
    pub qty_per_std_batch: f64,
    pub stage: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecipeScalingRequest {
    pub std_batch_size: f64,
    pub planned_batch_size: f64,
    pub items: Vec<RecipeItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScaledDispensingItem {
    pub raw_material_id: i64,
    pub raw_material_name: String,
    pub uom: String,
    pub std_qty: f64,
    pub required_qty: f64,
    pub stage: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecipeScalingResponse {
    pub scale_factor: f64,
    pub planned_batch_size: f64,
    pub items: Vec<ScaledDispensingItem>,
}

/// Computes proportional ingredient requirements from Master Formula (BoM)
pub fn scale_recipe(req: &RecipeScalingRequest) -> Result<RecipeScalingResponse, String> {
    if req.std_batch_size <= 0.0 {
        return Err("Standard batch size must be greater than zero".to_string());
    }
    if req.planned_batch_size <= 0.0 {
        return Err("Planned batch size must be greater than zero".to_string());
    }

    let scale_factor = req.planned_batch_size / req.std_batch_size;
    let mut scaled_items = Vec::with_capacity(req.items.len());

    for item in &req.items {
        let required_qty = (item.qty_per_std_batch * scale_factor * 1000.0).round() / 1000.0;
        scaled_items.push(ScaledDispensingItem {
            raw_material_id: item.raw_material_id,
            raw_material_name: item.raw_material_name.clone(),
            uom: item.uom.clone(),
            std_qty: item.qty_per_std_batch,
            required_qty,
            stage: item.stage.clone(),
        });
    }

    Ok(RecipeScalingResponse {
        scale_factor: (scale_factor * 10000.0).round() / 10000.0,
        planned_batch_size: req.planned_batch_size,
        items: scaled_items,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YieldReconciliationRequest {
    pub planned_qty: f64,
    pub actual_output_qty: f64,
    #[serde(default = "default_expected_yield")]
    pub expected_yield_percent: f64,
    #[serde(default = "default_tolerance")]
    pub permissible_loss_percent: f64,
}

fn default_expected_yield() -> f64 {
    95.0
}

fn default_tolerance() -> f64 {
    5.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YieldReconciliationResponse {
    pub actual_yield_percent: f64,
    pub process_loss_qty: f64,
    pub process_loss_percent: f64,
    pub variance_percent: f64,
    pub is_within_tolerance: bool,
    pub audit_remark: String,
}

/// Reconciles output yield vs theoretical yield and flags deviations
pub fn reconcile_yield(req: &YieldReconciliationRequest) -> Result<YieldReconciliationResponse, String> {
    if req.planned_qty <= 0.0 {
        return Err("Planned quantity must be greater than zero".to_string());
    }
    if req.actual_output_qty < 0.0 {
        return Err("Actual output quantity cannot be negative".to_string());
    }

    let actual_yield_percent = ((req.actual_output_qty / req.planned_qty) * 100.0 * 100.0).round() / 100.0;
    let process_loss_qty = ((req.planned_qty - req.actual_output_qty).max(0.0) * 100.0).round() / 100.0;
    let process_loss_percent = ((process_loss_qty / req.planned_qty) * 100.0 * 100.0).round() / 100.0;
    
    let variance_percent = ((actual_yield_percent - req.expected_yield_percent).abs() * 100.0).round() / 100.0;
    let is_within_tolerance = variance_percent <= req.permissible_loss_percent;

    let audit_remark = if is_within_tolerance {
        format!(
            "Yield of {:.2}% conforms to expected target ({:.2}% ± {:.1}%)",
            actual_yield_percent, req.expected_yield_percent, req.permissible_loss_percent
        )
    } else {
        format!(
            "CRITICAL: Yield variance of {:.2}% exceeds permissible limit of {:.1}%. Requires Technical Person investigation.",
            variance_percent, req.permissible_loss_percent
        )
    };

    Ok(YieldReconciliationResponse {
        actual_yield_percent,
        process_loss_qty,
        process_loss_percent,
        variance_percent,
        is_within_tolerance,
        audit_remark,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchReleaseValidationRequest {
    pub batch_no: String,
    pub mfg_date: String,
    pub exp_date: String,
    pub planned_qty: f64,
    pub actual_output_qty: f64,
    pub yield_percent: f64,
    pub lab_name: String,
    pub lab_report_no: String,
    pub coa_date: String,
    pub coa_status: String,
    pub technical_person: String,
    pub retention_sample_qty: String,
    pub retention_location: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchReleaseValidationResponse {
    pub is_valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
    pub statutory_notes: Vec<String>,
}

/// Enforces statutory compliance before a batch can be released from quarantine to commercial sales
pub fn validate_batch_release(req: &BatchReleaseValidationRequest) -> BatchReleaseValidationResponse {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let mut statutory_notes = Vec::new();

    // 1. Batch identification checks
    if req.batch_no.trim().is_empty() {
        errors.push("Batch Number is mandatory for statutory traceability under Schedule T".to_string());
    }

    // 2. Dates check
    if req.mfg_date.trim().is_empty() || req.exp_date.trim().is_empty() {
        errors.push("Manufacturing Date and Expiry Date are statutory requirements (Rule 161)".to_string());
    } else if req.mfg_date >= req.exp_date {
        errors.push("Expiry Date must be later than Manufacturing Date".to_string());
    }

    // 3. Output check
    if req.actual_output_qty <= 0.0 {
        errors.push("Actual Output Quantity must be greater than zero before release".to_string());
    }

    // 4. Outsourced QC / Lab CoA Validation
    let coa_clean = req.coa_status.trim().to_uppercase();
    if coa_clean != "PASSED" && coa_clean != "CONFORMS" {
        errors.push(format!(
            "Batch cannot be released: Outsourced Lab CoA status is '{}'. Must be 'PASSED'.",
            req.coa_status
        ));
    }
    if req.lab_report_no.trim().is_empty() {
        errors.push("Certificate of Analysis (CoA) / Lab Report Number is mandatory under Form 48 / Rule 160".to_string());
    }
    if req.lab_name.trim().is_empty() {
        warnings.push("Approved Drug Testing Laboratory Name is recommended on statutory records".to_string());
    }

    // 5. Technical Person Signoff
    if req.technical_person.trim().is_empty() {
        errors.push("Competent Technical Person approval is mandatory for drug release under Rule 157".to_string());
    }

    // 6. Retention Sample (Rule 161B)
    if req.retention_sample_qty.trim().is_empty() {
        warnings.push("Physical retention sample quantity should be logged under Rule 161B (1-year post expiry)".to_string());
    } else {
        statutory_notes.push(format!(
            "Control sample ({} in {}) logged under Drugs & Cosmetics Rule 161B",
            req.retention_sample_qty,
            if req.retention_location.trim().is_empty() { "Factory Almirah" } else { &req.retention_location }
        ));
    }

    let is_valid = errors.is_empty();

    BatchReleaseValidationResponse {
        is_valid,
        errors,
        warnings,
        statutory_notes,
    }
}
