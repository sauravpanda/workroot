/// Structured error type for Tauri command handlers.
///
/// All variants serialize to a human-readable string via `Display` (which is
/// what Tauri sends to the frontend as the `Result<_, String>` error value).
/// The prefixed format (`[NOT_FOUND] …`) lets the frontend distinguish error
/// classes without parsing free-form strings.
#[derive(Debug)]
pub enum CommandError {
    /// A requested entity does not exist (project, worktree, profile …).
    NotFound(String),
    /// The caller supplied invalid input.
    Invalid(String),
    /// A database operation failed.
    Database(String),
    /// An I/O operation failed.
    Io(String),
    /// An external service or sub-process failed.
    External(String),
    /// A mutex was unavailable (lock contention, poisoned lock …).
    Lock(String),
}

impl std::fmt::Display for CommandError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotFound(msg) => write!(f, "[NOT_FOUND] {msg}"),
            Self::Invalid(msg) => write!(f, "[INVALID] {msg}"),
            Self::Database(msg) => write!(f, "[DATABASE] {msg}"),
            Self::Io(msg) => write!(f, "[IO] {msg}"),
            Self::External(msg) => write!(f, "[EXTERNAL] {msg}"),
            Self::Lock(msg) => write!(f, "[LOCK] {msg}"),
        }
    }
}

// Allow `?` from rusqlite errors in commands that return `Result<_, CommandError>`.
impl From<rusqlite::Error> for CommandError {
    fn from(e: rusqlite::Error) -> Self {
        Self::Database(e.to_string())
    }
}

impl From<std::io::Error> for CommandError {
    fn from(e: std::io::Error) -> Self {
        Self::Io(e.to_string())
    }
}

// Tauri expects `Result<T, String>` from commands, so provide a blanket
// conversion from CommandError into the serialized string.
impl From<CommandError> for String {
    fn from(e: CommandError) -> Self {
        e.to_string()
    }
}
