#![allow(non_snake_case, dead_code)]

pub mod analytics;
pub mod catalog;
pub mod documents;
pub mod ffi;
pub mod finance;
pub mod inventory;
pub mod sales;
pub mod types;

// Re-exports for convenient top-level access
pub use analytics::aging::*;
pub use analytics::kpi::*;
pub use catalog::expiry::*;
pub use documents::*;
pub use finance::invoicing::*;
pub use finance::ledger::*;
pub use inventory::*;
pub use sales::orders::*;
pub use types::*;


