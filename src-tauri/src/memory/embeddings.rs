use std::collections::HashMap;

/// Embedding dimension — number of hash buckets for bag-of-words.
/// This is a lightweight approach; can be upgraded to a neural model later.
const EMBEDDING_DIM: usize = 256;

/// Generate a bag-of-words embedding vector from text.
/// Uses feature hashing (hashing trick) to map tokens to a fixed-size vector.
/// This provides a reasonable baseline for cosine similarity search without
/// requiring an ONNX model or external API.
pub fn generate_embedding(text: &str) -> Vec<f32> {
    let mut vec = vec![0.0f32; EMBEDDING_DIM];
    let tokens = tokenize(text);
    let total = tokens.len() as f32;

    if total == 0.0 {
        return vec;
    }

    // Count token frequencies
    let mut counts: HashMap<&str, f32> = HashMap::new();
    for token in &tokens {
        *counts.entry(token).or_default() += 1.0;
    }

    // Hash tokens into buckets with TF values
    for (token, count) in &counts {
        let tf = count / total;
        let hash = simple_hash(token);
        let bucket = hash % EMBEDDING_DIM;
        // Use sign from a secondary hash to reduce collisions
        let sign = if (hash / EMBEDDING_DIM).is_multiple_of(2) {
            1.0
        } else {
            -1.0
        };
        vec[bucket] += tf * sign;
    }

    // Also hash bigrams for some sequence awareness
    for window in tokens.windows(2) {
        let bigram = format!("{}_{}", window[0], window[1]);
        let hash = simple_hash(&bigram);
        let bucket = hash % EMBEDDING_DIM;
        let sign = if (hash / EMBEDDING_DIM).is_multiple_of(2) {
            1.0
        } else {
            -1.0
        };
        vec[bucket] += (1.0 / total) * sign * 0.5;
    }

    // L2 normalize
    let norm: f32 = vec.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm > 0.0 {
        for x in &mut vec {
            *x /= norm;
        }
    }

    vec
}

/// Cosine similarity between two embedding vectors.
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f64 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }

    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();

    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }

    (dot / (norm_a * norm_b)) as f64
}

/// Serialize embedding to bytes for SQLite BLOB storage.
pub fn to_blob(embedding: &[f32]) -> Vec<u8> {
    embedding.iter().flat_map(|f| f.to_le_bytes()).collect()
}

/// Deserialize embedding from SQLite BLOB.
pub fn from_blob(blob: &[u8]) -> Vec<f32> {
    blob.chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect()
}

/// Simple tokenizer: lowercase, split on non-alphanumeric, filter short tokens.
fn tokenize(text: &str) -> Vec<&str> {
    text.split(|c: char| !c.is_alphanumeric() && c != '_')
        .filter(|s| s.len() >= 2)
        .collect()
}

/// FNV-1a inspired hash for strings (fast, decent distribution).
fn simple_hash(s: &str) -> usize {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in s.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash as usize
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedding_dimension() {
        let emb = generate_embedding("hello world");
        assert_eq!(emb.len(), EMBEDDING_DIM);
    }

    #[test]
    fn similar_texts_score_higher() {
        let a = generate_embedding("fix the authentication bug in login");
        let b = generate_embedding("repair the auth bug in the login page");
        let c = generate_embedding("deploy kubernetes cluster to production");

        let sim_ab = cosine_similarity(&a, &b);
        let sim_ac = cosine_similarity(&a, &c);

        assert!(
            sim_ab > sim_ac,
            "Similar texts should score higher: ab={} ac={}",
            sim_ab,
            sim_ac
        );
    }

    #[test]
    fn identical_texts_score_one() {
        let a = generate_embedding("exact same text");
        let sim = cosine_similarity(&a, &a);
        assert!(
            (sim - 1.0).abs() < 0.001,
            "Self-similarity should be ~1.0: {}",
            sim
        );
    }

    #[test]
    fn empty_text_embedding() {
        let emb = generate_embedding("");
        assert_eq!(emb.len(), EMBEDDING_DIM);
        // All zeros
        assert!(emb.iter().all(|x| *x == 0.0));
    }

    #[test]
    fn blob_round_trip() {
        let emb = generate_embedding("test embedding round trip");
        let blob = to_blob(&emb);
        let recovered = from_blob(&blob);
        assert_eq!(emb, recovered);
    }
}
