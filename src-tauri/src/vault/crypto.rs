use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use rand::{rngs::OsRng, RngCore};

const KEYRING_SERVICE: &str = "com.workroot.app";
const KEYRING_VAULT_USER: &str = "vault_master_key";
const NONCE_SIZE: usize = 12;

/// Retrieves the master encryption key from the OS keychain,
/// generating a new one on first use.
fn get_or_create_key() -> Result<[u8; 32], String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_VAULT_USER)
        .map_err(|e| format!("Keyring error: {}", e))?;

    match entry.get_password() {
        Ok(key_b64) => {
            let key_bytes = BASE64
                .decode(&key_b64)
                .map_err(|e| format!("Invalid key encoding: {}", e))?;
            if key_bytes.len() != 32 {
                return Err("Invalid key length in keychain".into());
            }
            let mut key = [0u8; 32];
            key.copy_from_slice(&key_bytes);
            Ok(key)
        }
        Err(_) => {
            let mut key = [0u8; 32];
            OsRng.fill_bytes(&mut key);
            let key_b64 = BASE64.encode(key);
            entry
                .set_password(&key_b64)
                .map_err(|e| format!("Failed to store key: {}", e))?;
            Ok(key)
        }
    }
}

/// Encrypts a plaintext string using AES-256-GCM with the master key.
/// Returns a base64-encoded string containing nonce + ciphertext.
pub fn encrypt(plaintext: &str) -> Result<String, String> {
    let key = get_or_create_key()?;
    encrypt_with_key(plaintext, &key)
}

/// Decrypts a base64-encoded ciphertext using AES-256-GCM with the master key.
pub fn decrypt(encrypted: &str) -> Result<String, String> {
    let key = get_or_create_key()?;
    decrypt_with_key(encrypted, &key)
}

/// Encrypts with a provided key (used for testing without keychain).
pub fn encrypt_with_key(plaintext: &str, key: &[u8; 32]) -> Result<String, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| format!("Cipher init error: {}", e))?;

    let mut nonce_bytes = [0u8; NONCE_SIZE];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| format!("Encryption error: {}", e))?;

    let mut combined = Vec::with_capacity(NONCE_SIZE + ciphertext.len());
    combined.extend_from_slice(&nonce_bytes);
    combined.extend_from_slice(&ciphertext);

    Ok(BASE64.encode(&combined))
}

/// Decrypts with a provided key (used for testing without keychain).
pub fn decrypt_with_key(encrypted: &str, key: &[u8; 32]) -> Result<String, String> {
    let combined = BASE64
        .decode(encrypted)
        .map_err(|e| format!("Invalid base64: {}", e))?;

    if combined.len() < NONCE_SIZE {
        return Err("Encrypted data too short".into());
    }

    let (nonce_bytes, ciphertext) = combined.split_at(NONCE_SIZE);
    let nonce = Nonce::from_slice(nonce_bytes);

    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| format!("Cipher init error: {}", e))?;

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| format!("Decryption error: {}", e))?;

    String::from_utf8(plaintext).map_err(|e| format!("Invalid UTF-8: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypt_decrypt_round_trip() {
        let key = [42u8; 32];
        let plaintext = "my-secret-api-key-12345";

        let encrypted = encrypt_with_key(plaintext, &key).unwrap();
        assert_ne!(encrypted, plaintext);

        let decrypted = decrypt_with_key(&encrypted, &key).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn different_nonces_produce_different_ciphertext() {
        let key = [42u8; 32];
        let plaintext = "same-plaintext";

        let enc1 = encrypt_with_key(plaintext, &key).unwrap();
        let enc2 = encrypt_with_key(plaintext, &key).unwrap();

        assert_ne!(enc1, enc2);
        assert_eq!(decrypt_with_key(&enc1, &key).unwrap(), plaintext);
        assert_eq!(decrypt_with_key(&enc2, &key).unwrap(), plaintext);
    }

    #[test]
    fn wrong_key_fails() {
        let key1 = [42u8; 32];
        let key2 = [99u8; 32];

        let encrypted = encrypt_with_key("secret", &key1).unwrap();
        assert!(decrypt_with_key(&encrypted, &key2).is_err());
    }

    #[test]
    fn empty_string_round_trip() {
        let key = [42u8; 32];
        let encrypted = encrypt_with_key("", &key).unwrap();
        assert_eq!(decrypt_with_key(&encrypted, &key).unwrap(), "");
    }

    #[test]
    fn unicode_round_trip() {
        let key = [42u8; 32];
        let plaintext = "Hello \u{4e16}\u{754c}! \u{1f30d}";
        let encrypted = encrypt_with_key(plaintext, &key).unwrap();
        assert_eq!(decrypt_with_key(&encrypted, &key).unwrap(), plaintext);
    }
}
