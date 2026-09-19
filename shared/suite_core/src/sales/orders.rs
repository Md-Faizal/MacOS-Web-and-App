use crate::types::round2;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum OrderStage {
    #[serde(rename = "stage1")]
    Draft,
    #[serde(rename = "stage2")]
    QualityCheck,
    #[serde(rename = "stage3")]
    Delivered,
}

impl OrderStage {
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "stage2" | "quality_check" | "qc" => OrderStage::QualityCheck,
            "stage3" | "complete" | "delivered" => OrderStage::Delivered,
            _ => OrderStage::Draft,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            OrderStage::Draft => "stage1",
            OrderStage::QualityCheck => "stage2",
            OrderStage::Delivered => "stage3",
        }
    }

    pub fn can_transition_to(&self, next: OrderStage) -> bool {
        match (*self, next) {
            (OrderStage::Draft, OrderStage::QualityCheck) => true,
            (OrderStage::QualityCheck, OrderStage::Delivered) => true,
            (OrderStage::QualityCheck, OrderStage::Draft) => true, // Revert
            (OrderStage::Delivered, _) => false, // Delivered is final
            (a, b) if a == b => true,
            _ => false,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OrderItemInput {
    pub product_id: Option<String>,
    pub ordered_qty: f64,
    pub received_qty: Option<f64>,
    pub unit_price: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OrderFulfillmentSummary {
    pub total_ordered_qty: f64,
    pub total_delivered_qty: f64,
    pub total_ordered_val: f64,
    pub total_delivered_val: f64,
    pub total_lost_val: f64,
    pub fulfillment_ratio_percent: f64,
}

pub fn calculate_order_fulfillment(
    items: &[OrderItemInput],
    stage: OrderStage,
) -> OrderFulfillmentSummary {
    let mut total_ordered_qty = 0.0;
    let mut total_delivered_qty = 0.0;
    let mut total_lost_val = 0.0;
    let is_delivered = stage == OrderStage::Delivered;

    for item in items {
        let o_qty = if item.ordered_qty <= 0.0 { 1.0 } else { item.ordered_qty };
        let r_qty = if is_delivered {
            item.received_qty.unwrap_or(o_qty)
        } else {
            0.0
        };
        let lost_qty = if is_delivered {
            (o_qty - r_qty).max(0.0)
        } else {
            o_qty
        };

        total_ordered_qty += o_qty;
        total_delivered_qty += r_qty;
        total_lost_val += lost_qty * item.unit_price;
    }

    let total_ordered_val = items.iter().map(|i| i.ordered_qty * i.unit_price).sum();
    let total_delivered_val = items.iter().map(|i| {
        let r_qty = if is_delivered { i.received_qty.unwrap_or(i.ordered_qty) } else { 0.0 };
        r_qty * i.unit_price
    }).sum();

    let fulfillment_ratio = if total_ordered_qty > 0.0 {
        ((total_delivered_qty / total_ordered_qty) * 100.0 * 10.0).round() / 10.0
    } else {
        0.0
    };

    OrderFulfillmentSummary {
        total_ordered_qty,
        total_delivered_qty,
        total_ordered_val: round2(total_ordered_val),
        total_delivered_val: round2(total_delivered_val),
        total_lost_val: round2(total_lost_val),
        fulfillment_ratio_percent: fulfillment_ratio,
    }
}
