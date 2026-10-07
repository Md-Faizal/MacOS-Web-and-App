/// Indian currency numbering and words conversion (Lakhs and Crores)
/// Native implementation for invoice PDF generation

const UNITS: [&str; 20] = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"
];

const TENS: [&str; 10] = [
    "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"
];

fn two_digits(n: u64) -> String {
    let n = n as usize;
    if n < 20 {
        UNITS[n].to_string()
    } else {
        let t = TENS[n / 10];
        let u = UNITS[n % 10];
        if !u.is_empty() {
            format!("{} {}", t, u)
        } else {
            t.to_string()
        }
    }
}

pub fn num_to_indian_words(mut n: u64) -> String {
    if n == 0 {
        return "Zero".to_string();
    }

    let mut parts = Vec::new();

    let crore = n / 10_000_000;
    n %= 10_000_000;
    if crore > 0 {
        let words = if crore < 100 {
            two_digits(crore)
        } else {
            num_to_indian_words(crore)
        };
        parts.push(format!("{} Crore", words));
    }

    let lakh = n / 100_000;
    n %= 100_000;
    if lakh > 0 {
        parts.push(format!("{} Lakh", two_digits(lakh)));
    }

    let thousand = n / 1_000;
    n %= 1_000;
    if thousand > 0 {
        parts.push(format!("{} Thousand", two_digits(thousand)));
    }

    let hundred = n / 100;
    let rest = n % 100;
    if hundred > 0 {
        parts.push(format!("{} Hundred", UNITS[hundred as usize]));
    }

    if rest > 0 {
        if !parts.is_empty() {
            parts.push(format!("and {}", two_digits(rest)));
        } else {
            parts.push(two_digits(rest));
        }
    }

    parts.join(" ")
}

pub fn amount_in_indian_words(val: f64) -> String {
    let rounded = (val * 100.0).round() / 100.0;
    let rupees = rounded.floor() as u64;
    let paise = ((rounded - rupees as f64) * 100.0).round() as u64;

    let mut words = num_to_indian_words(rupees);
    if paise > 0 {
        words.push_str(&format!(" and {} Paise", num_to_indian_words(paise)));
    }
    words.push_str(" Only");
    words
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_words_conversions() {
        assert_eq!(num_to_indian_words(0), "Zero");
        assert_eq!(num_to_indian_words(5), "Five");
        assert_eq!(num_to_indian_words(25), "Twenty Five");
        assert_eq!(num_to_indian_words(100), "One Hundred");
        assert_eq!(num_to_indian_words(105), "One Hundred and Five");
        assert_eq!(num_to_indian_words(1500), "One Thousand Five Hundred");
        assert_eq!(num_to_indian_words(100000), "One Lakh");
        assert_eq!(num_to_indian_words(25000000), "Two Crore Fifty Lakh");

        assert_eq!(
            amount_in_indian_words(1500.50),
            "One Thousand Five Hundred and Fifty Paise Only"
        );
        assert_eq!(
            amount_in_indian_words(450.00),
            "Four Hundred and Fifty Only"
        );
    }
}
