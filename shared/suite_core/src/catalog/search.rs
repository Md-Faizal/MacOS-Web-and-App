use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::HashMap;

/// Representation of a product item passed in for fuzzy searching.
/// Preserves any extra JSON fields through `extra` flattening.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchCatalogItem {
    #[serde(default)]
    pub id: serde_json::Value,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub odia_name: Option<String>,
    #[serde(default)]
    pub category_name: Option<String>,
    #[serde(default)]
    pub classification: Option<String>,
    #[serde(default)]
    pub pack_size: Option<String>,
    #[serde(default)]
    pub mrp: Option<f64>,
    #[serde(default)]
    pub units_sold: Option<f64>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchOptions {
    #[serde(default = "default_min_score")]
    pub min_score: f64,
    #[serde(default = "default_limit")]
    pub limit: usize,
}

fn default_min_score() -> f64 {
    20.0
}

fn default_limit() -> usize {
    50
}

impl Default for SearchOptions {
    fn default() -> Self {
        Self {
            min_score: default_min_score(),
            limit: default_limit(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResultItem {
    pub item: SearchCatalogItem,
    pub score: f64,
    pub matched_field: String,
    pub is_exact: bool,
}

/// Computes the true Damerau-Levenshtein distance between two byte/char sequences,
/// accounting for insertions, deletions, substitutions, and adjacent transpositions.
pub fn damerau_levenshtein(s1: &str, s2: &str) -> usize {
    let a: Vec<char> = s1.chars().collect();
    let b: Vec<char> = s2.chars().collect();
    let len_a = a.len();
    let len_b = b.len();

    if len_a == 0 {
        return len_b;
    }
    if len_b == 0 {
        return len_a;
    }

    let mut d = vec![vec![0usize; len_b + 1]; len_a + 1];

    for i in 0..=len_a {
        d[i][0] = i;
    }
    for j in 0..=len_b {
        d[0][j] = j;
    }

    for i in 1..=len_a {
        for j in 1..=len_b {
            let cost = if a[i - 1] == b[j - 1] { 0 } else { 1 };

            let deletion = d[i - 1][j] + 1;
            let insertion = d[i][j - 1] + 1;
            let substitution = d[i - 1][j - 1] + cost;

            let mut min_val = deletion.min(insertion).min(substitution);

            // Adjacent character transposition
            if i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1] {
                let transposition = d[i - 2][j - 2] + cost;
                if transposition < min_val {
                    min_val = transposition;
                }
            }

            d[i][j] = min_val;
        }
    }

    d[len_a][len_b]
}

/// Normalizes text for pharmaceutical search:
/// - Lowercase
/// - Replaces symbols, hyphens, slashes, punctuation with spaces
/// - Collapses whitespace
pub fn normalize_search_text(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut last_was_space = true;

    for ch in input.chars() {
        if ch.is_alphanumeric() {
            for lower_ch in ch.to_lowercase() {
                out.push(lower_ch);
            }
            last_was_space = false;
        } else if !last_was_space {
            out.push(' ');
            last_was_space = true;
        }
    }

    out.trim().to_string()
}

/// Breaks text into alphanumeric search tokens.
pub fn tokenize(input: &str) -> Vec<String> {
    normalize_search_text(input)
        .split_whitespace()
        .map(|s| s.to_string())
        .collect()
}

/// Collapses duplicate adjacent letters for phonetic typo tolerance:
/// e.g. "amoxiciillin" -> "amoxicilin", "pantaprazole" -> "pantaprazol"
pub fn collapse_repeats(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut last_char = None;
    for c in s.chars() {
        if Some(c) != last_char {
            out.push(c);
            last_char = Some(c);
        }
    }
    out
}

/// Calculates token-to-token similarity score between query token `q` and target token `t`.
/// Returns score between 0.0 and 100.0.
pub fn score_token_match(q: &str, t: &str) -> f64 {
    if q.is_empty() || t.is_empty() {
        return 0.0;
    }

    // Exact equality
    if q == t {
        return 100.0;
    }

    // Prefix match: query token is start of target word (e.g. "para" in "paracetamol")
    if t.starts_with(q) {
        let ratio = q.len() as f64 / t.len() as f64;
        return 80.0 + (ratio * 18.0); // 80 to 98
    }

    // Substring match: query token is contained inside target word
    if t.contains(q) {
        let ratio = q.len() as f64 / t.len() as f64;
        return 60.0 + (ratio * 15.0);
    }

    // Target is prefix of query token (user typed extra chars)
    if q.starts_with(t) && t.len() >= 3 {
        return 65.0;
    }

    // Damerau-Levenshtein distance calculation
    let max_len = q.len().max(t.len());
    let dist = damerau_levenshtein(q, t);

    // Dynamic threshold based on word length
    let allowed_distance = if max_len <= 3 {
        1
    } else if max_len <= 6 {
        2
    } else if max_len <= 10 {
        3
    } else {
        4
    };

    if dist <= allowed_distance {
        let similarity = 1.0 - (dist as f64 / max_len as f64);
        let score = similarity * 85.0;
        return score.max(0.0);
    }

    // Repeated consonant / vowel collapse check (e.g., amoxiciillin vs amoxicillin)
    let q_collapsed = collapse_repeats(q);
    let t_collapsed = collapse_repeats(t);
    if q_collapsed == t_collapsed {
        return 80.0;
    }
    let collapsed_dist = damerau_levenshtein(&q_collapsed, &t_collapsed);
    if collapsed_dist <= 1 && max_len >= 5 {
        return 60.0;
    }

    // Medical abbreviation / consonant subsequence match:
    // e.g. "pcm" -> "paracetamol", "amx" -> "amoxicillin", "ctz" -> "cetirizine"
    if q == "pcm" && (t.starts_with("paracetamol") || t.starts_with("paracit")) {
        return 90.0;
    }

    if q.len() >= 2 && q.len() <= 6 && t.len() >= q.len() {
        let mut q_chars = q.chars();
        let mut expected = q_chars.next();
        let mut matched_first = false;

        for (idx, ch) in t.chars().enumerate() {
            if Some(ch) == expected {
                if idx == 0 {
                    matched_first = true;
                }
                expected = q_chars.next();
                if expected.is_none() {
                    break;
                }
            }
        }

        if expected.is_none() && matched_first {
            return 75.0;
        }
    }

    0.0
}

/// Checks acronym match: e.g. "pcm" for "Paracetamol", "pan d" for "Pantoprazole Domperidone"
pub fn matches_acronym(query_token: &str, target_words: &[String]) -> bool {
    if query_token.len() < 2 || target_words.len() < query_token.len() {
        return false;
    }
    let mut word_idx = 0;
    for q_char in query_token.chars() {
        let mut matched = false;
        while word_idx < target_words.len() {
            if let Some(first_char) = target_words[word_idx].chars().next() {
                if first_char == q_char {
                    matched = true;
                    word_idx += 1;
                    break;
                }
            }
            word_idx += 1;
        }
        if !matched {
            return false;
        }
    }
    true
}

/// Evaluates how well a query string matches a given target text.
/// Returns score between 0.0 and 100.0, plus boolean indicating exact/prefix match.
pub fn match_query_against_target(query: &str, target: &str) -> (f64, bool) {
    let clean_query = normalize_search_text(query);
    let clean_target = normalize_search_text(target);

    if clean_query.is_empty() || clean_target.is_empty() {
        return (0.0, false);
    }

    // Exact normalized match
    if clean_query == clean_target {
        return (100.0, true);
    }

    // Full target starts with full query
    if clean_target.starts_with(&clean_query) {
        let ratio = clean_query.len() as f64 / clean_target.len() as f64;
        return (90.0 + (ratio * 9.0), true);
    }

    // Full target contains full query sequence
    if clean_target.contains(&clean_query) {
        let ratio = clean_query.len() as f64 / clean_target.len() as f64;
        return (75.0 + (ratio * 15.0), false);
    }

    // No-space matching: e.g. "dolo650" matching "dolo 650" or "augmentin625" matching "augmentin 625"
    let compact_query: String = clean_query.chars().filter(|c| !c.is_whitespace()).collect();
    let compact_target: String = clean_target.chars().filter(|c| !c.is_whitespace()).collect();
    if compact_target == compact_query {
        return (95.0, true);
    }
    if compact_target.starts_with(&compact_query) {
        return (88.0, true);
    }
    if compact_target.contains(&compact_query) {
        return (82.0, false);
    }

    // Token-bag matching: every token in the query should find a matching token in target
    let query_tokens = tokenize(&clean_query);
    let target_tokens = tokenize(&clean_target);

    if query_tokens.is_empty() || target_tokens.is_empty() {
        return (0.0, false);
    }

    // Acronym check on first token or full query
    if query_tokens.len() == 1 && matches_acronym(&query_tokens[0], &target_tokens) {
        return (70.0, false);
    }

    let mut total_token_score = 0.0;
    let mut all_tokens_matched = true;

    for q_tok in &query_tokens {
        let mut best_tok_score = 0.0;
        for t_tok in &target_tokens {
            let s = score_token_match(q_tok, t_tok);
            if s > best_tok_score {
                best_tok_score = s;
            }
        }

        if best_tok_score < 40.0 {
            all_tokens_matched = false;
        }
        total_token_score += best_tok_score;
    }

    let avg_token_score = total_token_score / query_tokens.len() as f64;

    if all_tokens_matched {
        // Boost for complete token-bag coverage
        let coverage_bonus = (query_tokens.len() as f64 / target_tokens.len() as f64) * 10.0;
        let final_score = (avg_token_score * 0.90 + coverage_bonus).min(98.0);
        return (final_score, false);
    }

    // If query has multiple tokens, allow 1 minor mismatch if other tokens match strongly
    if query_tokens.len() > 1 && avg_token_score >= 50.0 {
        return (avg_token_score * 0.70, false);
    }

    (0.0, false)
}

/// Searches and ranks a catalog of products against a search query using
/// high-precision multi-token typo-tolerant fuzzy matching.
pub fn search_catalog(
    query: &str,
    catalog: &[SearchCatalogItem],
    options: &SearchOptions,
) -> Vec<SearchResultItem> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return catalog
            .iter()
            .take(options.limit)
            .map(|item| SearchResultItem {
                item: item.clone(),
                score: 100.0,
                matched_field: "default".to_string(),
                is_exact: false,
            })
            .collect();
    }

    let mut results: Vec<SearchResultItem> = Vec::new();

    for item in catalog {
        let mut best_score = 0.0;
        let mut best_field = "name";
        let mut is_exact = false;

        // 1. Primary Name Match (weight: 1.0)
        let (name_score, name_exact) = match_query_against_target(trimmed, &item.name);
        if name_score > best_score {
            best_score = name_score;
            best_field = "name";
            is_exact = name_exact;
        }

        // 2. Odia Name Match (weight: 0.95)
        if let Some(odia) = &item.odia_name {
            let (odia_score, odia_exact) = match_query_against_target(trimmed, odia);
            let weighted = odia_score * 0.95;
            if weighted > best_score {
                best_score = weighted;
                best_field = "odia_name";
                is_exact = odia_exact;
            }
        }

        // 3. Category Match (weight: 0.75)
        if let Some(cat) = &item.category_name {
            let (cat_score, _) = match_query_against_target(trimmed, cat);
            let weighted = cat_score * 0.75;
            if weighted > best_score {
                best_score = weighted;
                best_field = "category";
                is_exact = false;
            }
        }

        // 4. Classification / Generic Match (weight: 0.85)
        if let Some(cls) = &item.classification {
            let (cls_score, _) = match_query_against_target(trimmed, cls);
            let weighted = cls_score * 0.85;
            if weighted > best_score {
                best_score = weighted;
                best_field = "classification";
                is_exact = false;
            }
        }

        // 5. Pack Size Match (weight: 0.70)
        if let Some(pack) = &item.pack_size {
            let (pack_score, _) = match_query_against_target(trimmed, pack);
            let weighted = pack_score * 0.70;
            if weighted > best_score {
                best_score = weighted;
                best_field = "pack_size";
                is_exact = false;
            }
        }

        // Tie-break / popularity boost (subtle, up to +3 points based on units sold)
        let popularity_boost = item
            .units_sold
            .map(|u| (u.log10().max(0.0) * 1.0).min(3.0))
            .unwrap_or(0.0);

        let final_score = best_score + popularity_boost;

        if final_score >= options.min_score {
            results.push(SearchResultItem {
                item: item.clone(),
                score: final_score,
                matched_field: best_field.to_string(),
                is_exact,
            });
        }
    }

    // Sort descending by score. If equal, sort alphabetically by product name.
    results.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(Ordering::Equal)
            .then_with(|| a.item.name.cmp(&b.item.name))
    });

    if results.len() > options.limit {
        results.truncate(options.limit);
    }

    results
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn sample_catalog() -> Vec<SearchCatalogItem> {
        vec![
            SearchCatalogItem {
                id: json!(1),
                name: "Paracetamol 500mg Tablets".to_string(),
                odia_name: Some("ପାରାସିଟାମଲ".to_string()),
                category_name: Some("Analgesic".to_string()),
                classification: Some("Antipyretic".to_string()),
                pack_size: Some("10x10 TAB".to_string()),
                mrp: Some(25.50),
                units_sold: Some(1500.0),
                extra: HashMap::new(),
            },
            SearchCatalogItem {
                id: json!(2),
                name: "Dolo 650 MG Tablet".to_string(),
                odia_name: None,
                category_name: Some("Analgesic".to_string()),
                classification: Some("Antipyretic".to_string()),
                pack_size: Some("15 TAB".to_string()),
                mrp: Some(34.00),
                units_sold: Some(3200.0),
                extra: HashMap::new(),
            },
            SearchCatalogItem {
                id: json!(3),
                name: "Amoxicillin Trihydrate 500mg".to_string(),
                odia_name: None,
                category_name: Some("Antibiotic".to_string()),
                classification: Some("Penicillin".to_string()),
                pack_size: Some("10 CAP".to_string()),
                mrp: Some(85.00),
                units_sold: Some(800.0),
                extra: HashMap::new(),
            },
            SearchCatalogItem {
                id: json!(4),
                name: "Cetirizine Hydrochloride 10mg".to_string(),
                odia_name: None,
                category_name: Some("Antiallergic".to_string()),
                classification: Some("Antihistamine".to_string()),
                pack_size: Some("10 TAB".to_string()),
                mrp: Some(18.00),
                units_sold: Some(2100.0),
                extra: HashMap::new(),
            },
            SearchCatalogItem {
                id: json!(5),
                name: "Augmentin 625 Duo Tablet".to_string(),
                odia_name: None,
                category_name: Some("Antibiotic".to_string()),
                classification: Some("Amoxicillin + Clavulanic Acid".to_string()),
                pack_size: Some("10 TAB".to_string()),
                mrp: Some(205.00),
                units_sold: Some(2500.0),
                extra: HashMap::new(),
            },
            SearchCatalogItem {
                id: json!(6),
                name: "Pantoprazole Gastro-Resistant 40mg".to_string(),
                odia_name: None,
                category_name: Some("Antacid".to_string()),
                classification: Some("PPI".to_string()),
                pack_size: Some("10 TAB".to_string()),
                mrp: Some(95.00),
                units_sold: Some(1200.0),
                extra: HashMap::new(),
            },
            SearchCatalogItem {
                id: json!(7),
                name: "PAN-D Capsule".to_string(),
                odia_name: None,
                category_name: Some("Antacid".to_string()),
                classification: Some("Pantoprazole + Domperidone".to_string()),
                pack_size: Some("15 CAP".to_string()),
                mrp: Some(199.00),
                units_sold: Some(4000.0),
                extra: HashMap::new(),
            },
        ]
    }

    #[test]
    fn test_damerau_levenshtein() {
        assert_eq!(damerau_levenshtein("paracetamol", "paracetmol"), 1); // 1 deletion
        assert_eq!(damerau_levenshtein("paracetamol", "paracitamol"), 1); // 1 substitution
        assert_eq!(damerau_levenshtein("cetirizine", "cetrizine"), 1); // 1 deletion
        assert_eq!(damerau_levenshtein("amoxicillin", "amoxiciillin"), 1); // 1 insertion
        assert_eq!(damerau_levenshtein("meftal", "mefatl"), 1); // 1 transposition
    }

    #[test]
    fn test_typo_paracetamol_tolerance() {
        let catalog = sample_catalog();
        let options = SearchOptions::default();

        // 1. Missing vowel: "paracetmol"
        let res1 = search_catalog("paracetmol", &catalog, &options);
        assert!(!res1.is_empty(), "Should match paracetmol with typo");
        assert_eq!(res1[0].item.name, "Paracetamol 500mg Tablets");

        // 2. Vowel substitution: "paracitamol"
        let res2 = search_catalog("paracitamol", &catalog, &options);
        assert!(!res2.is_empty(), "Should match paracitamol with substitution");
        assert_eq!(res2[0].item.name, "Paracetamol 500mg Tablets");

        // 3. Typo in Cetirizine: "cetrizine"
        let res3 = search_catalog("cetrizine", &catalog, &options);
        assert!(!res3.is_empty(), "Should match cetrizine");
        assert_eq!(res3[0].item.name, "Cetirizine Hydrochloride 10mg");
    }

    #[test]
    fn test_multi_token_inverted_order() {
        let catalog = sample_catalog();
        let options = SearchOptions::default();

        // Query "650 dolo" for "Dolo 650 MG Tablet"
        let res = search_catalog("650 dolo", &catalog, &options);
        assert!(!res.is_empty());
        assert_eq!(res[0].item.name, "Dolo 650 MG Tablet");
        assert!(res[0].score >= 80.0);
    }

    #[test]
    fn test_no_space_and_hyphens() {
        let catalog = sample_catalog();
        let options = SearchOptions::default();

        // "augmentin625" -> "Augmentin 625 Duo Tablet"
        let res1 = search_catalog("augmentin625", &catalog, &options);
        assert!(!res1.is_empty());
        assert_eq!(res1[0].item.name, "Augmentin 625 Duo Tablet");

        // "pand" -> "PAN-D Capsule"
        let res2 = search_catalog("pand", &catalog, &options);
        assert!(!res2.is_empty());
        assert_eq!(res2[0].item.name, "PAN-D Capsule");
    }

    #[test]
    fn test_composition_and_classification_search() {
        let catalog = sample_catalog();
        let options = SearchOptions::default();

        // Search by classification "Antipyretic"
        let res = search_catalog("antipyretic", &catalog, &options);
        assert!(res.len() >= 2);
    }
}
