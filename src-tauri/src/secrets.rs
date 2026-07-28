//! Credenciales en el almacén del sistema operativo (Credential Manager en Windows, Keychain en
//! macOS). Nunca en la base SQLite ni en un archivo de config: un `.db` se copia, se respalda y
//! se sube por accidente; el keychain no.

use keyring::Entry;

const SERVICE: &str = "ArchFlow";

pub fn set_secret(key: &str, value: &str) -> Result<(), String> {
    Entry::new(SERVICE, key).map_err(|e| e.to_string())?.set_password(value).map_err(|e| e.to_string())
}

pub fn get_secret(key: &str) -> Result<Option<String>, String> {
    let entry = Entry::new(SERVICE, key).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn delete_secret(key: &str) -> Result<(), String> {
    let entry = Entry::new(SERVICE, key).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Token de git (GitHub/ADO) usado para clonar y publicar.
pub const GIT_TOKEN: &str = "git-token";
/// Usuario asociado al token, cuando el proveedor lo exige.
pub const GIT_USER: &str = "git-user";
