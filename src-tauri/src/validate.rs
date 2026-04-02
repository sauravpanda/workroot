/// Input validation helpers for Tauri command handlers.
///
/// All functions return `Result<(), String>` so they can be called with `?`
/// inside any command that returns `Result<T, String>`.

const MAX_NAME_LEN: usize = 255;
const MAX_PATH_LEN: usize = 4096;
const MAX_ENV_KEY_LEN: usize = 256;
const MAX_ENV_VALUE_LEN: usize = 65536; // 64 KiB

/// Validates that a string is non-empty and not pure whitespace.
pub fn nonempty(value: &str, field: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        return Err(format!("{} must not be empty", field));
    }
    Ok(())
}

/// Validates a project name: non-empty, max 255 chars, no null bytes.
pub fn project_name(name: &str) -> Result<(), String> {
    nonempty(name, "Project name")?;
    if name.len() > MAX_NAME_LEN {
        return Err(format!(
            "Project name must be at most {} characters",
            MAX_NAME_LEN
        ));
    }
    if name.contains('\0') {
        return Err("Project name must not contain null bytes".into());
    }
    Ok(())
}

/// Validates a filesystem path: non-empty, max 4096 chars, no null bytes.
pub fn path(p: &str, field: &str) -> Result<(), String> {
    nonempty(p, field)?;
    if p.len() > MAX_PATH_LEN {
        return Err(format!(
            "{} must be at most {} characters",
            field, MAX_PATH_LEN
        ));
    }
    if p.contains('\0') {
        return Err(format!("{} must not contain null bytes", field));
    }
    Ok(())
}

/// Validates a git branch name.
///
/// Rules based on `git check-ref-format`:
/// - Non-empty
/// - Max 255 chars
/// - No ASCII control chars, space, `~`, `^`, `:`, `?`, `*`, `[`, `\`
/// - Cannot start or end with `/` or `.`
/// - Cannot contain `..` or `@{`
/// - Cannot be exactly `@`
pub fn branch_name(name: &str) -> Result<(), String> {
    nonempty(name, "Branch name")?;

    if name.len() > MAX_NAME_LEN {
        return Err(format!(
            "Branch name must be at most {} characters",
            MAX_NAME_LEN
        ));
    }

    if name == "@" {
        return Err("Branch name cannot be '@'".into());
    }

    if name.starts_with('/') || name.ends_with('/') {
        return Err("Branch name cannot start or end with '/'".into());
    }

    if name.starts_with('.') || name.ends_with('.') {
        return Err("Branch name cannot start or end with '.'".into());
    }

    if name.ends_with(".lock") {
        return Err("Branch name cannot end with '.lock'".into());
    }

    if name.contains("..") || name.contains("@{") {
        return Err("Branch name cannot contain '..' or '@{'".into());
    }

    let forbidden: &[char] = &[
        '\0', ' ', '~', '^', ':', '?', '*', '[', '\\',
    ];
    for ch in forbidden {
        if name.contains(*ch) {
            return Err(format!(
                "Branch name cannot contain '{}'",
                ch.escape_default()
            ));
        }
    }

    // No ASCII control characters
    if name.chars().any(|c| c.is_ascii_control()) {
        return Err("Branch name cannot contain control characters".into());
    }

    Ok(())
}

/// Validates an environment variable key: non-empty, max 256 chars,
/// contains only alphanumeric chars and underscores, does not start with a digit.
pub fn env_key(key: &str) -> Result<(), String> {
    nonempty(key, "Environment variable name")?;

    if key.len() > MAX_ENV_KEY_LEN {
        return Err(format!(
            "Environment variable name must be at most {} characters",
            MAX_ENV_KEY_LEN
        ));
    }

    if key.starts_with(|c: char| c.is_ascii_digit()) {
        return Err("Environment variable name cannot start with a digit".into());
    }

    if !key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return Err(
            "Environment variable name can only contain letters, digits, and underscores".into(),
        );
    }

    Ok(())
}

/// Validates an environment variable value: max 64 KiB, no null bytes.
pub fn env_value(value: &str) -> Result<(), String> {
    if value.len() > MAX_ENV_VALUE_LEN {
        return Err(format!(
            "Environment variable value must be at most {} bytes",
            MAX_ENV_VALUE_LEN
        ));
    }
    if value.contains('\0') {
        return Err("Environment variable value must not contain null bytes".into());
    }
    Ok(())
}

/// Validates a profile name: non-empty, max 255 chars, no null bytes.
pub fn profile_name(name: &str) -> Result<(), String> {
    nonempty(name, "Profile name")?;
    if name.len() > MAX_NAME_LEN {
        return Err(format!(
            "Profile name must be at most {} characters",
            MAX_NAME_LEN
        ));
    }
    if name.contains('\0') {
        return Err("Profile name must not contain null bytes".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn branch_name_rejects_empty() {
        assert!(branch_name("").is_err());
        assert!(branch_name("   ").is_err());
    }

    #[test]
    fn branch_name_rejects_control_chars() {
        assert!(branch_name("feat\x00null").is_err());
        assert!(branch_name("feat\x01ctrl").is_err());
    }

    #[test]
    fn branch_name_rejects_forbidden_chars() {
        for ch in [' ', '~', '^', ':', '?', '*', '[', '\\'] {
            let bad = format!("feat{ch}foo");
            assert!(branch_name(&bad).is_err(), "should reject '{bad}'");
        }
    }

    #[test]
    fn branch_name_rejects_dotdot() {
        assert!(branch_name("feat..bar").is_err());
    }

    #[test]
    fn branch_name_accepts_valid() {
        assert!(branch_name("feat/my-feature").is_ok());
        assert!(branch_name("fix/issue-123").is_ok());
        assert!(branch_name("release/v1.2.3").is_ok());
        assert!(branch_name("main").is_ok());
    }

    #[test]
    fn env_key_rejects_invalid() {
        assert!(env_key("").is_err());
        assert!(env_key("1STARTS_WITH_DIGIT").is_err());
        assert!(env_key("HAS SPACE").is_err());
        assert!(env_key("HAS-DASH").is_err());
    }

    #[test]
    fn env_key_accepts_valid() {
        assert!(env_key("MY_VAR").is_ok());
        assert!(env_key("_PRIVATE").is_ok());
        assert!(env_key("VAR123").is_ok());
    }
}
