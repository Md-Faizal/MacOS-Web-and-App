use serde::{Deserialize, Serialize};

/// High-precision currency representation stored in integer Paise (1 Rupee = 100 Paise).
/// Completely eliminates IEEE-754 binary floating-point drift across platforms.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Default, Serialize, Deserialize)]
pub struct Paise(pub i64);

impl Paise {
    pub const ZERO: Paise = Paise(0);

    #[inline]
    pub fn from_rupees(rupees: f64) -> Self {
        // Round half-up to nearest integer paise
        let paise = (rupees * 100.0).round() as i64;
        Paise(paise)
    }

    #[inline]
    pub fn to_rupees(&self) -> f64 {
        (self.0 as f64) / 100.0
    }

    #[inline]
    pub fn abs(&self) -> Self {
        Paise(self.0.abs())
    }

    #[inline]
    pub fn is_positive(&self) -> bool {
        self.0 > 0
    }

    #[inline]
    pub fn is_negative(&self) -> bool {
        self.0 < 0
    }

    #[inline]
    pub fn is_zero(&self) -> bool {
        self.0 == 0
    }
}

impl std::ops::Add for Paise {
    type Output = Self;
    #[inline]
    fn add(self, rhs: Self) -> Self {
        Paise(self.0 + rhs.0)
    }
}

impl std::ops::Sub for Paise {
    type Output = Self;
    #[inline]
    fn sub(self, rhs: Self) -> Self {
        Paise(self.0 - rhs.0)
    }
}

impl std::ops::Mul<i64> for Paise {
    type Output = Self;
    #[inline]
    fn mul(self, rhs: i64) -> Self {
        Paise(self.0 * rhs)
    }
}

impl std::ops::AddAssign for Paise {
    #[inline]
    fn add_assign(&mut self, rhs: Self) {
        self.0 += rhs.0;
    }
}

impl std::ops::SubAssign for Paise {
    #[inline]
    fn sub_assign(&mut self, rhs: Self) {
        self.0 -= rhs.0;
    }
}

/// Standard half-up currency rounding to 2 decimal places.
#[inline]
pub fn round2(val: f64) -> f64 {
    (val * 100.0).round() / 100.0
}

/// Tax representation type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TaxCalculationMode {
    /// Tax is exclusive (added on top of rate)
    Standard,
    /// Tax is reverse-embedded (rate is MRP, base rate is extracted via MRP / (1 + GST))
    ReverseGst,
    /// Tax exempt (0%)
    Exempt,
}
