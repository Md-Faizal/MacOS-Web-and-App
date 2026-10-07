use std::env;
use std::fs;
use std::process;

use suite_core::documents::pdf::{render_invoice_pdf, InvoiceRenderData};

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    if args.len() != 3 {
        return Err(format!(
            "Usage: cargo run --manifest-path shared/suite_core/Cargo.toml --example render_invoice_json -- <input.json> <output.pdf>"
        )
        .into());
    }

    let input = fs::read(&args[1])?;
    let invoice: InvoiceRenderData = serde_json::from_slice(&input)?;
    let pdf = render_invoice_pdf(&invoice)?;
    fs::write(&args[2], pdf)?;
    println!("Rust invoice PDF written to {}", args[2]);
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        process::exit(1);
    }
}
