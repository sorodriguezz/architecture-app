//! Todo el git de ArchFlow, sobre `git2` (libgit2) — sin depender de que haya un `git` en el PATH.
//!
//! El alcance es deliberadamente chico: la app no es un cliente git, solo necesita **versionar y
//! publicar los `.md` que genera**. Por eso hay init/clone/status/commit/push/pull y nada más.

use git2::{
    build::RepoBuilder, Cred, FetchOptions, IndexAddOption, PushOptions, RemoteCallbacks, Repository,
    Signature,
};
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoStatus {
    pub is_repo: bool,
    pub branch: String,
    pub remote_url: Option<String>,
    /// Rutas relativas con cambios (staged o no) respecto al HEAD.
    pub changed: Vec<String>,
    pub ahead: usize,
    pub behind: usize,
}

/// Credenciales para operaciones de red. El token se lee del keychain del SO en el sitio de
/// llamada; aquí solo se transporta.
#[derive(Clone, Default)]
pub struct GitAuth {
    pub username: String,
    pub token: String,
}

/// Devuelve callbacks que autentican con token (HTTPS) y, si no hay token, prueban el agente SSH.
/// Sin esto un `push` a GitHub falla con "authentication required" sin más detalle.
fn callbacks(auth: &GitAuth) -> RemoteCallbacks<'_> {
    let mut cb = RemoteCallbacks::new();
    cb.credentials(move |_url, username_from_url, allowed| {
        if allowed.contains(git2::CredentialType::USER_PASS_PLAINTEXT) && !auth.token.is_empty() {
            let user = if auth.username.is_empty() { "x-access-token" } else { &auth.username };
            return Cred::userpass_plaintext(user, &auth.token);
        }
        if allowed.contains(git2::CredentialType::SSH_KEY) {
            return Cred::ssh_key_from_agent(username_from_url.unwrap_or("git"));
        }
        Cred::default()
    });
    cb
}

pub fn open(path: &str) -> Result<Repository, String> {
    Repository::open(path).map_err(|e| format!("no es un repositorio git válido: {e}"))
}

pub fn init(path: &str) -> Result<(), String> {
    if Repository::open(path).is_ok() {
        return Ok(());
    }
    Repository::init(path).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn clone(url: &str, dest: &str, auth: &GitAuth) -> Result<(), String> {
    let mut fo = FetchOptions::new();
    fo.remote_callbacks(callbacks(auth));
    RepoBuilder::new().fetch_options(fo).clone(url, Path::new(dest)).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn status(path: &str) -> RepoStatus {
    let Ok(repo) = Repository::open(path) else {
        return RepoStatus {
            is_repo: false,
            branch: String::new(),
            remote_url: None,
            changed: Vec::new(),
            ahead: 0,
            behind: 0,
        };
    };

    let branch = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(str::to_string))
        // Un repo recién creado no tiene HEAD resoluble hasta el primer commit; reportar la rama
        // configurada evita mostrar un estado vacío que parece un error.
        .unwrap_or_else(|| "main".to_string());

    let remote_url = repo.find_remote("origin").ok().and_then(|r| r.url().map(str::to_string));

    let mut opts = git2::StatusOptions::new();
    opts.include_untracked(true).recurse_untracked_dirs(true);
    let changed = repo
        .statuses(Some(&mut opts))
        .map(|st| st.iter().filter_map(|e| e.path().map(str::to_string)).collect::<Vec<_>>())
        .unwrap_or_default();

    let (ahead, behind) = graph_diff(&repo).unwrap_or((0, 0));

    RepoStatus { is_repo: true, branch, remote_url, changed, ahead, behind }
}

fn graph_diff(repo: &Repository) -> Option<(usize, usize)> {
    let head = repo.head().ok()?;
    let local = head.target()?;
    let branch = head.shorthand()?;
    let upstream = repo.find_branch(branch, git2::BranchType::Local).ok()?.upstream().ok()?;
    let remote = upstream.get().target()?;
    repo.graph_ahead_behind(local, remote).ok()
}

/// Hace stage de rutas concretas (o de todo si `paths` viene vacío) y crea un commit.
/// Devuelve el sha corto.
pub fn commit(
    path: &str,
    message: &str,
    paths: &[String],
    name: &str,
    email: &str,
) -> Result<String, String> {
    let repo = open(path)?;
    let mut index = repo.index().map_err(|e| e.to_string())?;
    if paths.is_empty() {
        index.add_all(["*"].iter(), IndexAddOption::DEFAULT, None).map_err(|e| e.to_string())?;
    } else {
        for p in paths {
            index.add_path(Path::new(p)).map_err(|e| format!("{p}: {e}"))?;
        }
    }
    index.write().map_err(|e| e.to_string())?;
    let tree_id = index.write_tree().map_err(|e| e.to_string())?;
    let tree = repo.find_tree(tree_id).map_err(|e| e.to_string())?;

    // Prefiere la identidad del repo/global; los parámetros son el fallback de la app.
    let cfg = repo.config().map_err(|e| e.to_string())?;
    let sig_name = cfg.get_string("user.name").unwrap_or_else(|_| name.to_string());
    let sig_email = cfg.get_string("user.email").unwrap_or_else(|_| email.to_string());
    let sig = Signature::now(&sig_name, &sig_email).map_err(|e| e.to_string())?;

    let parents = match repo.head().ok().and_then(|h| h.target()) {
        Some(oid) => vec![repo.find_commit(oid).map_err(|e| e.to_string())?],
        // Primer commit del repo: sin padres.
        None => Vec::new(),
    };
    let parent_refs: Vec<&git2::Commit> = parents.iter().collect();

    let oid =
        repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &parent_refs).map_err(|e| e.to_string())?;
    Ok(oid.to_string()[..7].to_string())
}

pub fn push(path: &str, auth: &GitAuth) -> Result<(), String> {
    let repo = open(path)?;
    let head = repo.head().map_err(|e| e.to_string())?;
    let branch = head.shorthand().ok_or("HEAD detached: haz checkout de una rama")?;
    let mut remote =
        repo.find_remote("origin").map_err(|_| "el repo no tiene remoto 'origin' configurado".to_string())?;

    let mut po = PushOptions::new();
    po.remote_callbacks(callbacks(auth));
    // El `:` explícito con el mismo nombre crea la rama en el remoto si aún no existe.
    let refspec = format!("refs/heads/{branch}:refs/heads/{branch}");
    remote.push(&[refspec.as_str()], Some(&mut po)).map_err(|e| e.to_string())?;

    // Deja el upstream apuntando al remoto recién publicado para que ahead/behind funcione.
    if let Ok(mut b) = repo.find_branch(branch, git2::BranchType::Local) {
        let _ = b.set_upstream(Some(&format!("origin/{branch}")));
    }
    Ok(())
}

/// Pull en modo fast-forward. Un merge real necesita resolución de conflictos, que está fuera
/// del alcance de esta app — si no se puede avanzar en línea recta, se dice y el usuario lo
/// resuelve en su cliente git.
pub fn pull(path: &str, auth: &GitAuth) -> Result<String, String> {
    let repo = open(path)?;
    let head = repo.head().map_err(|e| e.to_string())?;
    let branch = head.shorthand().ok_or("HEAD detached")?.to_string();
    let mut remote =
        repo.find_remote("origin").map_err(|_| "el repo no tiene remoto 'origin' configurado".to_string())?;

    let mut fo = FetchOptions::new();
    fo.remote_callbacks(callbacks(auth));
    remote.fetch(&[branch.as_str()], Some(&mut fo), None).map_err(|e| e.to_string())?;

    let fetch_head = repo.find_reference("FETCH_HEAD").map_err(|e| e.to_string())?;
    let target = repo.reference_to_annotated_commit(&fetch_head).map_err(|e| e.to_string())?;
    let (analysis, _) = repo.merge_analysis(&[&target]).map_err(|e| e.to_string())?;

    if analysis.is_up_to_date() {
        return Ok("ya estaba al día".to_string());
    }
    if !analysis.is_fast_forward() {
        return Err(
            "el pull requiere un merge (hay commits divergentes) — resuélvelo en tu cliente git".to_string()
        );
    }

    let refname = format!("refs/heads/{branch}");
    let mut reference = repo.find_reference(&refname).map_err(|e| e.to_string())?;
    reference.set_target(target.id(), "archflow: fast-forward").map_err(|e| e.to_string())?;
    repo.set_head(&refname).map_err(|e| e.to_string())?;
    repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force())).map_err(|e| e.to_string())?;
    Ok(format!("actualizado a {}", &target.id().to_string()[..7]))
}

pub fn set_remote(path: &str, url: &str) -> Result<(), String> {
    let repo = open(path)?;
    // El `Remote` que devuelve `find_remote` toma prestado a `repo`; dejarlo vivo dentro del
    // `match` haría que el préstamo sobreviva al propio `repo` al final de la función.
    let exists = repo.find_remote("origin").is_ok();
    if exists {
        repo.remote_set_url("origin", url).map_err(|e| e.to_string())
    } else {
        repo.remote("origin", url).map(|_| ()).map_err(|e| e.to_string())
    }
}
