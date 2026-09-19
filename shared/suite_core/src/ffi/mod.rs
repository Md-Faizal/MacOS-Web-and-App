pub mod fast_path;
#[cfg(not(target_arch = "wasm32"))]
pub mod jni;
pub mod wasm;

pub use fast_path::*;
#[cfg(not(target_arch = "wasm32"))]
pub use jni::*;
pub use wasm::*;
