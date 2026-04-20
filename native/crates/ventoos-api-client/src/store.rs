use std::path::Path;
use std::sync::Mutex;

use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::models::{Collection, CreateCollectionReq, UpdateCollectionReq, Folder, CreateFolderReq, UpdateFolderReq, ApiRequest, CreateApiRequestReq, UpdateApiRequestReq, Environment, CreateEnvironmentReq, UpdateEnvironmentReq, HistoryQuery, HistoryEntry};

/// `SQLite` storage layer for the API Client application.
pub struct ApiClientStore {
    conn: Mutex<Connection>,
}

impl ApiClientStore {
    /// Open (or create) the API-client database inside `data_dir/apps/api-client/`.
    pub fn open(data_dir: &Path) -> Result<Self, rusqlite::Error> {
        let db_dir = data_dir.join("apps").join("api-client");
        std::fs::create_dir_all(&db_dir)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
        let conn = Connection::open(db_dir.join("data.db"))?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
        let store = Self {
            conn: Mutex::new(conn),
        };
        store.run_migrations()?;
        Ok(store)
    }

    fn run_migrations(&self) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().expect("lock poisoned");
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS collections (
                id            TEXT PRIMARY KEY,
                name          TEXT NOT NULL,
                description   TEXT,
                auth          TEXT,
                headers       TEXT,
                variables     TEXT,
                pre_request_script TEXT,
                test_script   TEXT,
                sort_order    INTEGER NOT NULL DEFAULT 0,
                created_at    TEXT NOT NULL,
                updated_at    TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS folders (
                id               TEXT PRIMARY KEY,
                collection_id    TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
                parent_folder_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
                name             TEXT NOT NULL,
                description      TEXT,
                auth             TEXT,
                headers          TEXT,
                variables        TEXT,
                pre_request_script TEXT,
                test_script      TEXT,
                sort_order       INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS requests (
                id               TEXT PRIMARY KEY,
                collection_id    TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
                folder_id        TEXT REFERENCES folders(id) ON DELETE SET NULL,
                name             TEXT NOT NULL,
                method           TEXT NOT NULL DEFAULT 'GET',
                url              TEXT NOT NULL DEFAULT '',
                params           TEXT,
                headers          TEXT,
                body             TEXT,
                auth             TEXT,
                pre_request_script TEXT,
                test_script      TEXT,
                variables        TEXT,
                description      TEXT,
                sort_order       INTEGER NOT NULL DEFAULT 0,
                created_at       TEXT NOT NULL,
                updated_at       TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS environments (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                variables   TEXT NOT NULL DEFAULT '[]',
                is_global   INTEGER NOT NULL DEFAULT 0,
                sort_order  INTEGER NOT NULL DEFAULT 0,
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS history (
                id          TEXT PRIMARY KEY,
                request     TEXT NOT NULL,
                response    TEXT,
                duration_ms INTEGER,
                starred     INTEGER NOT NULL DEFAULT 0,
                created_at  TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS cookies (
                id        TEXT PRIMARY KEY,
                domain    TEXT NOT NULL,
                name      TEXT NOT NULL,
                value     TEXT NOT NULL,
                path      TEXT NOT NULL DEFAULT '/',
                expires   TEXT,
                http_only INTEGER NOT NULL DEFAULT 0,
                secure    INTEGER NOT NULL DEFAULT 0,
                same_site TEXT
            );
            ",
        )?;
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Collections
    // -----------------------------------------------------------------------

    pub fn list_collections(&self) -> Result<Vec<Collection>, rusqlite::Error> {
        let conn = self.conn.lock().expect("lock poisoned");
        let mut stmt = conn.prepare(
            "SELECT id, name, description, auth, headers, variables,
                    pre_request_script, test_script, sort_order, created_at, updated_at
             FROM collections ORDER BY sort_order, created_at",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(Collection {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                auth: parse_json_opt(row.get::<_, Option<String>>(3)?),
                headers: parse_json_opt(row.get::<_, Option<String>>(4)?),
                variables: parse_json_opt(row.get::<_, Option<String>>(5)?),
                pre_request_script: row.get(6)?,
                test_script: row.get(7)?,
                sort_order: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })?;
        rows.collect()
    }

    pub fn get_collection(&self, id: &str) -> Result<Option<Collection>, rusqlite::Error> {
        let conn = self.conn.lock().expect("lock poisoned");
        let mut stmt = conn.prepare(
            "SELECT id, name, description, auth, headers, variables,
                    pre_request_script, test_script, sort_order, created_at, updated_at
             FROM collections WHERE id = ?1",
        )?;
        let mut rows = stmt.query_map(params![id], |row| {
            Ok(Collection {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                auth: parse_json_opt(row.get::<_, Option<String>>(3)?),
                headers: parse_json_opt(row.get::<_, Option<String>>(4)?),
                variables: parse_json_opt(row.get::<_, Option<String>>(5)?),
                pre_request_script: row.get(6)?,
                test_script: row.get(7)?,
                sort_order: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })?;
        match rows.next() {
            Some(r) => Ok(Some(r?)),
            None => Ok(None),
        }
    }

    pub fn create_collection(&self, req: &CreateCollectionReq) -> Result<Collection, rusqlite::Error> {
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let conn = self.conn.lock().expect("lock poisoned");

        let max_order: i32 = conn
            .query_row("SELECT COALESCE(MAX(sort_order), -1) FROM collections", [], |r| r.get(0))?;

        conn.execute(
            "INSERT INTO collections (id, name, description, auth, headers, variables,
                pre_request_script, test_script, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                id,
                req.name,
                req.description,
                json_opt_str(&req.auth),
                json_opt_str(&req.headers),
                json_opt_str(&req.variables),
                req.pre_request_script,
                req.test_script,
                max_order + 1,
                now,
                now,
            ],
        )?;

        Ok(Collection {
            id,
            name: req.name.clone(),
            description: req.description.clone(),
            auth: req.auth.clone(),
            headers: req.headers.clone(),
            variables: req.variables.clone(),
            pre_request_script: req.pre_request_script.clone(),
            test_script: req.test_script.clone(),
            sort_order: max_order + 1,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub fn update_collection(
        &self,
        id: &str,
        req: &UpdateCollectionReq,
    ) -> Result<Option<Collection>, rusqlite::Error> {
        let now = chrono::Utc::now().to_rfc3339();
        let conn = self.conn.lock().expect("lock poisoned");

        let existing = {
            let mut stmt = conn.prepare("SELECT id FROM collections WHERE id = ?1")?;
            stmt.exists(params![id])?
        };
        if !existing {
            return Ok(None);
        }

        if let Some(name) = &req.name {
            conn.execute("UPDATE collections SET name = ?1, updated_at = ?2 WHERE id = ?3", params![name, now, id])?;
        }
        if let Some(desc) = &req.description {
            conn.execute("UPDATE collections SET description = ?1, updated_at = ?2 WHERE id = ?3", params![desc, now, id])?;
        }
        if let Some(auth) = &req.auth {
            conn.execute("UPDATE collections SET auth = ?1, updated_at = ?2 WHERE id = ?3", params![auth.to_string(), now, id])?;
        }
        if let Some(headers) = &req.headers {
            conn.execute("UPDATE collections SET headers = ?1, updated_at = ?2 WHERE id = ?3", params![headers.to_string(), now, id])?;
        }
        if let Some(variables) = &req.variables {
            conn.execute("UPDATE collections SET variables = ?1, updated_at = ?2 WHERE id = ?3", params![variables.to_string(), now, id])?;
        }
        if let Some(prs) = &req.pre_request_script {
            conn.execute("UPDATE collections SET pre_request_script = ?1, updated_at = ?2 WHERE id = ?3", params![prs, now, id])?;
        }
        if let Some(ts) = &req.test_script {
            conn.execute("UPDATE collections SET test_script = ?1, updated_at = ?2 WHERE id = ?3", params![ts, now, id])?;
        }
        if let Some(order) = req.sort_order {
            conn.execute("UPDATE collections SET sort_order = ?1, updated_at = ?2 WHERE id = ?3", params![order, now, id])?;
        }

        drop(conn);
        self.get_collection(id)
    }

    pub fn delete_collection(&self, id: &str) -> Result<bool, rusqlite::Error> {
        let conn = self.conn.lock().expect("lock poisoned");
        let count = conn.execute("DELETE FROM collections WHERE id = ?1", params![id])?;
        Ok(count > 0)
    }

    // -----------------------------------------------------------------------
    // Folders
    // -----------------------------------------------------------------------

    pub fn list_folders_by_collection(&self, collection_id: &str) -> Result<Vec<Folder>, rusqlite::Error> {
        let conn = self.conn.lock().expect("lock poisoned");
        let mut stmt = conn.prepare(
            "SELECT id, collection_id, parent_folder_id, name, description, auth, headers,
                    variables, pre_request_script, test_script, sort_order
             FROM folders WHERE collection_id = ?1 ORDER BY sort_order",
        )?;
        let rows = stmt.query_map(params![collection_id], |row| {
            Ok(Folder {
                id: row.get(0)?,
                collection_id: row.get(1)?,
                parent_folder_id: row.get(2)?,
                name: row.get(3)?,
                description: row.get(4)?,
                auth: parse_json_opt(row.get::<_, Option<String>>(5)?),
                headers: parse_json_opt(row.get::<_, Option<String>>(6)?),
                variables: parse_json_opt(row.get::<_, Option<String>>(7)?),
                pre_request_script: row.get(8)?,
                test_script: row.get(9)?,
                sort_order: row.get(10)?,
            })
        })?;
        rows.collect()
    }

    pub fn create_folder(&self, req: &CreateFolderReq) -> Result<Folder, rusqlite::Error> {
        let id = Uuid::new_v4().to_string();
        let conn = self.conn.lock().expect("lock poisoned");

        let max_order: i32 = conn.query_row(
            "SELECT COALESCE(MAX(sort_order), -1) FROM folders WHERE collection_id = ?1",
            params![req.collection_id],
            |r| r.get(0),
        )?;

        conn.execute(
            "INSERT INTO folders (id, collection_id, parent_folder_id, name, description, auth,
                headers, variables, pre_request_script, test_script, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                id,
                req.collection_id,
                req.parent_folder_id,
                req.name,
                req.description,
                json_opt_str(&req.auth),
                json_opt_str(&req.headers),
                json_opt_str(&req.variables),
                req.pre_request_script,
                req.test_script,
                max_order + 1,
            ],
        )?;

        Ok(Folder {
            id,
            collection_id: req.collection_id.clone(),
            parent_folder_id: req.parent_folder_id.clone(),
            name: req.name.clone(),
            description: req.description.clone(),
            auth: req.auth.clone(),
            headers: req.headers.clone(),
            variables: req.variables.clone(),
            pre_request_script: req.pre_request_script.clone(),
            test_script: req.test_script.clone(),
            sort_order: max_order + 1,
        })
    }

    pub fn update_folder(&self, id: &str, req: &UpdateFolderReq) -> Result<Option<Folder>, rusqlite::Error> {
        let conn = self.conn.lock().expect("lock poisoned");
        let existing = conn.prepare("SELECT id FROM folders WHERE id = ?1")?.exists(params![id])?;
        if !existing {
            return Ok(None);
        }

        if let Some(name) = &req.name {
            conn.execute("UPDATE folders SET name = ?1 WHERE id = ?2", params![name, id])?;
        }
        if let Some(desc) = &req.description {
            conn.execute("UPDATE folders SET description = ?1 WHERE id = ?2", params![desc, id])?;
        }
        if let Some(auth) = &req.auth {
            conn.execute("UPDATE folders SET auth = ?1 WHERE id = ?2", params![auth.to_string(), id])?;
        }
        if let Some(headers) = &req.headers {
            conn.execute("UPDATE folders SET headers = ?1 WHERE id = ?2", params![headers.to_string(), id])?;
        }
        if let Some(variables) = &req.variables {
            conn.execute("UPDATE folders SET variables = ?1 WHERE id = ?2", params![variables.to_string(), id])?;
        }
        if let Some(prs) = &req.pre_request_script {
            conn.execute("UPDATE folders SET pre_request_script = ?1 WHERE id = ?2", params![prs, id])?;
        }
        if let Some(ts) = &req.test_script {
            conn.execute("UPDATE folders SET test_script = ?1 WHERE id = ?2", params![ts, id])?;
        }
        if let Some(pfid) = &req.parent_folder_id {
            conn.execute("UPDATE folders SET parent_folder_id = ?1 WHERE id = ?2", params![pfid, id])?;
        }
        if let Some(order) = req.sort_order {
            conn.execute("UPDATE folders SET sort_order = ?1 WHERE id = ?2", params![order, id])?;
        }

        // Re-read
        let mut stmt = conn.prepare(
            "SELECT id, collection_id, parent_folder_id, name, description, auth, headers,
                    variables, pre_request_script, test_script, sort_order
             FROM folders WHERE id = ?1",
        )?;
        let mut rows = stmt.query_map(params![id], |row| {
            Ok(Folder {
                id: row.get(0)?,
                collection_id: row.get(1)?,
                parent_folder_id: row.get(2)?,
                name: row.get(3)?,
                description: row.get(4)?,
                auth: parse_json_opt(row.get::<_, Option<String>>(5)?),
                headers: parse_json_opt(row.get::<_, Option<String>>(6)?),
                variables: parse_json_opt(row.get::<_, Option<String>>(7)?),
                pre_request_script: row.get(8)?,
                test_script: row.get(9)?,
                sort_order: row.get(10)?,
            })
        })?;
        match rows.next() {
            Some(r) => Ok(Some(r?)),
            None => Ok(None),
        }
    }

    pub fn delete_folder(&self, id: &str) -> Result<bool, rusqlite::Error> {
        let conn = self.conn.lock().expect("lock poisoned");
        let count = conn.execute("DELETE FROM folders WHERE id = ?1", params![id])?;
        Ok(count > 0)
    }

    // -----------------------------------------------------------------------
    // Requests
    // -----------------------------------------------------------------------

    pub fn list_requests_by_collection(&self, collection_id: &str) -> Result<Vec<ApiRequest>, rusqlite::Error> {
        let conn = self.conn.lock().expect("lock poisoned");
        let mut stmt = conn.prepare(
            "SELECT id, collection_id, folder_id, name, method, url, params, headers, body,
                    auth, pre_request_script, test_script, variables, description, sort_order,
                    created_at, updated_at
             FROM requests WHERE collection_id = ?1 ORDER BY sort_order",
        )?;
        let rows = stmt.query_map(params![collection_id], row_to_request)?;
        rows.collect()
    }

    pub fn get_request(&self, id: &str) -> Result<Option<ApiRequest>, rusqlite::Error> {
        let conn = self.conn.lock().expect("lock poisoned");
        let mut stmt = conn.prepare(
            "SELECT id, collection_id, folder_id, name, method, url, params, headers, body,
                    auth, pre_request_script, test_script, variables, description, sort_order,
                    created_at, updated_at
             FROM requests WHERE id = ?1",
        )?;
        let mut rows = stmt.query_map(params![id], row_to_request)?;
        match rows.next() {
            Some(r) => Ok(Some(r?)),
            None => Ok(None),
        }
    }

    pub fn create_request(&self, req: &CreateApiRequestReq) -> Result<ApiRequest, rusqlite::Error> {
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let conn = self.conn.lock().expect("lock poisoned");

        let max_order: i32 = conn.query_row(
            "SELECT COALESCE(MAX(sort_order), -1) FROM requests WHERE collection_id = ?1",
            params![req.collection_id],
            |r| r.get(0),
        )?;

        conn.execute(
            "INSERT INTO requests (id, collection_id, folder_id, name, method, url, params, headers,
                body, auth, pre_request_script, test_script, variables, description, sort_order,
                created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
            params![
                id,
                req.collection_id,
                req.folder_id,
                req.name,
                req.method,
                req.url,
                json_opt_str(&req.params),
                json_opt_str(&req.headers),
                json_opt_str(&req.body),
                json_opt_str(&req.auth),
                req.pre_request_script,
                req.test_script,
                json_opt_str(&req.variables),
                req.description,
                max_order + 1,
                now,
                now,
            ],
        )?;

        Ok(ApiRequest {
            id,
            collection_id: req.collection_id.clone(),
            folder_id: req.folder_id.clone(),
            name: req.name.clone(),
            method: req.method.clone(),
            url: req.url.clone(),
            params: req.params.clone(),
            headers: req.headers.clone(),
            body: req.body.clone(),
            auth: req.auth.clone(),
            pre_request_script: req.pre_request_script.clone(),
            test_script: req.test_script.clone(),
            variables: req.variables.clone(),
            description: req.description.clone(),
            sort_order: max_order + 1,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub fn update_request(
        &self,
        id: &str,
        req: &UpdateApiRequestReq,
    ) -> Result<Option<ApiRequest>, rusqlite::Error> {
        let now = chrono::Utc::now().to_rfc3339();
        let conn = self.conn.lock().expect("lock poisoned");
        let existing = conn.prepare("SELECT id FROM requests WHERE id = ?1")?.exists(params![id])?;
        if !existing {
            return Ok(None);
        }

        macro_rules! update_field {
            ($field:ident, $col:expr) => {
                if let Some(val) = &req.$field {
                    conn.execute(
                        &format!("UPDATE requests SET {} = ?1, updated_at = ?2 WHERE id = ?3", $col),
                        params![val, now, id],
                    )?;
                }
            };
        }
        macro_rules! update_json_field {
            ($field:ident, $col:expr) => {
                if let Some(val) = &req.$field {
                    conn.execute(
                        &format!("UPDATE requests SET {} = ?1, updated_at = ?2 WHERE id = ?3", $col),
                        params![val.to_string(), now, id],
                    )?;
                }
            };
        }

        update_field!(name, "name");
        update_field!(method, "method");
        update_field!(url, "url");
        update_field!(folder_id, "folder_id");
        update_json_field!(params, "params");
        update_json_field!(headers, "headers");
        update_json_field!(body, "body");
        update_json_field!(auth, "auth");
        update_field!(pre_request_script, "pre_request_script");
        update_field!(test_script, "test_script");
        update_json_field!(variables, "variables");
        update_field!(description, "description");
        if let Some(order) = req.sort_order {
            conn.execute(
                "UPDATE requests SET sort_order = ?1, updated_at = ?2 WHERE id = ?3",
                params![order, now, id],
            )?;
        }

        drop(conn);
        self.get_request(id)
    }

    pub fn delete_request(&self, id: &str) -> Result<bool, rusqlite::Error> {
        let conn = self.conn.lock().expect("lock poisoned");
        let count = conn.execute("DELETE FROM requests WHERE id = ?1", params![id])?;
        Ok(count > 0)
    }

    pub fn duplicate_request(&self, id: &str) -> Result<Option<ApiRequest>, rusqlite::Error> {
        let original = self.get_request(id)?;
        let Some(orig) = original else {
            return Ok(None);
        };

        let new_id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let conn = self.conn.lock().expect("lock poisoned");

        conn.execute(
            "INSERT INTO requests (id, collection_id, folder_id, name, method, url, params, headers,
                body, auth, pre_request_script, test_script, variables, description, sort_order,
                created_at, updated_at)
             SELECT ?1, collection_id, folder_id, name || ' (copy)', method, url, params, headers,
                body, auth, pre_request_script, test_script, variables, description, sort_order + 1,
                ?2, ?3
             FROM requests WHERE id = ?4",
            params![new_id, now, now, orig.id],
        )?;

        drop(conn);
        self.get_request(&new_id)
    }

    // -----------------------------------------------------------------------
    // Environments
    // -----------------------------------------------------------------------

    pub fn list_environments(&self) -> Result<Vec<Environment>, rusqlite::Error> {
        let conn = self.conn.lock().expect("lock poisoned");
        let mut stmt = conn.prepare(
            "SELECT id, name, variables, is_global, sort_order, created_at, updated_at
             FROM environments ORDER BY is_global DESC, sort_order, created_at",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(Environment {
                id: row.get(0)?,
                name: row.get(1)?,
                variables: serde_json::from_str(&row.get::<_, String>(2)?).unwrap_or_default(),
                is_global: row.get::<_, i32>(3)? != 0,
                sort_order: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?;
        rows.collect()
    }

    pub fn create_environment(&self, req: &CreateEnvironmentReq) -> Result<Environment, rusqlite::Error> {
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let conn = self.conn.lock().expect("lock poisoned");

        let max_order: i32 = conn
            .query_row("SELECT COALESCE(MAX(sort_order), -1) FROM environments", [], |r| r.get(0))?;

        conn.execute(
            "INSERT INTO environments (id, name, variables, is_global, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                id,
                req.name,
                req.variables.to_string(),
                i32::from(req.is_global),
                max_order + 1,
                now,
                now,
            ],
        )?;

        Ok(Environment {
            id,
            name: req.name.clone(),
            variables: req.variables.clone(),
            is_global: req.is_global,
            sort_order: max_order + 1,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub fn update_environment(
        &self,
        id: &str,
        req: &UpdateEnvironmentReq,
    ) -> Result<Option<Environment>, rusqlite::Error> {
        let now = chrono::Utc::now().to_rfc3339();
        let conn = self.conn.lock().expect("lock poisoned");
        let existing = conn.prepare("SELECT id FROM environments WHERE id = ?1")?.exists(params![id])?;
        if !existing {
            return Ok(None);
        }

        if let Some(name) = &req.name {
            conn.execute("UPDATE environments SET name = ?1, updated_at = ?2 WHERE id = ?3", params![name, now, id])?;
        }
        if let Some(vars) = &req.variables {
            conn.execute("UPDATE environments SET variables = ?1, updated_at = ?2 WHERE id = ?3", params![vars.to_string(), now, id])?;
        }
        if let Some(ig) = req.is_global {
            conn.execute("UPDATE environments SET is_global = ?1, updated_at = ?2 WHERE id = ?3", params![i32::from(ig), now, id])?;
        }
        if let Some(order) = req.sort_order {
            conn.execute("UPDATE environments SET sort_order = ?1, updated_at = ?2 WHERE id = ?3", params![order, now, id])?;
        }

        let mut stmt = conn.prepare(
            "SELECT id, name, variables, is_global, sort_order, created_at, updated_at
             FROM environments WHERE id = ?1",
        )?;
        let mut rows = stmt.query_map(params![id], |row| {
            Ok(Environment {
                id: row.get(0)?,
                name: row.get(1)?,
                variables: serde_json::from_str(&row.get::<_, String>(2)?).unwrap_or_default(),
                is_global: row.get::<_, i32>(3)? != 0,
                sort_order: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?;
        match rows.next() {
            Some(r) => Ok(Some(r?)),
            None => Ok(None),
        }
    }

    pub fn delete_environment(&self, id: &str) -> Result<bool, rusqlite::Error> {
        let conn = self.conn.lock().expect("lock poisoned");
        let count = conn.execute("DELETE FROM environments WHERE id = ?1", params![id])?;
        Ok(count > 0)
    }

    // -----------------------------------------------------------------------
    // History
    // -----------------------------------------------------------------------

    pub fn list_history(&self, query: &HistoryQuery) -> Result<Vec<HistoryEntry>, rusqlite::Error> {
        let conn = self.conn.lock().expect("lock poisoned");
        let (sql, star_filter) = match query.starred {
            Some(true) => (
                "SELECT id, request, response, duration_ms, starred, created_at
                 FROM history WHERE starred = 1 ORDER BY created_at DESC LIMIT ?1 OFFSET ?2",
                false,
            ),
            _ => (
                "SELECT id, request, response, duration_ms, starred, created_at
                 FROM history ORDER BY created_at DESC LIMIT ?1 OFFSET ?2",
                false,
            ),
        };
        let _ = star_filter;
        let mut stmt = conn.prepare(sql)?;
        let rows = stmt.query_map(params![query.limit, query.offset], |row| {
            Ok(HistoryEntry {
                id: row.get(0)?,
                request: serde_json::from_str(&row.get::<_, String>(1)?).unwrap_or_default(),
                response: row
                    .get::<_, Option<String>>(2)?
                    .and_then(|s| serde_json::from_str(&s).ok()),
                duration_ms: row.get(3)?,
                starred: row.get::<_, i32>(4)? != 0,
                created_at: row.get(5)?,
            })
        })?;
        rows.collect()
    }

    pub fn add_history(&self, entry: &HistoryEntry) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().expect("lock poisoned");
        conn.execute(
            "INSERT INTO history (id, request, response, duration_ms, starred, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                entry.id,
                entry.request.to_string(),
                entry.response.as_ref().map(std::string::ToString::to_string),
                entry.duration_ms,
                i32::from(entry.starred),
                entry.created_at,
            ],
        )?;
        Ok(())
    }

    pub fn delete_history_entry(&self, id: &str) -> Result<bool, rusqlite::Error> {
        let conn = self.conn.lock().expect("lock poisoned");
        let count = conn.execute("DELETE FROM history WHERE id = ?1", params![id])?;
        Ok(count > 0)
    }

    pub fn clear_history(&self) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().expect("lock poisoned");
        conn.execute("DELETE FROM history WHERE starred = 0", [])?;
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Bulk insert (for imports)
    // -----------------------------------------------------------------------

    pub fn import_collection(
        &self,
        collection: &Collection,
        folders: &[Folder],
        requests: &[ApiRequest],
    ) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().expect("lock poisoned");
        conn.execute(
            "INSERT INTO collections (id, name, description, auth, headers, variables,
                pre_request_script, test_script, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                collection.id,
                collection.name,
                collection.description,
                json_opt_str(&collection.auth),
                json_opt_str(&collection.headers),
                json_opt_str(&collection.variables),
                collection.pre_request_script,
                collection.test_script,
                collection.sort_order,
                collection.created_at,
                collection.updated_at,
            ],
        )?;

        for folder in folders {
            conn.execute(
                "INSERT INTO folders (id, collection_id, parent_folder_id, name, description, auth,
                    headers, variables, pre_request_script, test_script, sort_order)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                params![
                    folder.id,
                    folder.collection_id,
                    folder.parent_folder_id,
                    folder.name,
                    folder.description,
                    json_opt_str(&folder.auth),
                    json_opt_str(&folder.headers),
                    json_opt_str(&folder.variables),
                    folder.pre_request_script,
                    folder.test_script,
                    folder.sort_order,
                ],
            )?;
        }

        for request in requests {
            conn.execute(
                "INSERT INTO requests (id, collection_id, folder_id, name, method, url, params,
                    headers, body, auth, pre_request_script, test_script, variables, description,
                    sort_order, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
                params![
                    request.id,
                    request.collection_id,
                    request.folder_id,
                    request.name,
                    request.method,
                    request.url,
                    json_opt_str(&request.params),
                    json_opt_str(&request.headers),
                    json_opt_str(&request.body),
                    json_opt_str(&request.auth),
                    request.pre_request_script,
                    request.test_script,
                    json_opt_str(&request.variables),
                    request.description,
                    request.sort_order,
                    request.created_at,
                    request.updated_at,
                ],
            )?;
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn parse_json_opt(s: Option<String>) -> Option<serde_json::Value> {
    s.and_then(|raw| serde_json::from_str(&raw).ok())
}

#[allow(clippy::ref_option)]
fn json_opt_str(v: &Option<serde_json::Value>) -> Option<String> {
    v.as_ref().map(std::string::ToString::to_string)
}

fn row_to_request(row: &rusqlite::Row<'_>) -> Result<ApiRequest, rusqlite::Error> {
    Ok(ApiRequest {
        id: row.get(0)?,
        collection_id: row.get(1)?,
        folder_id: row.get(2)?,
        name: row.get(3)?,
        method: row.get(4)?,
        url: row.get(5)?,
        params: parse_json_opt(row.get::<_, Option<String>>(6)?),
        headers: parse_json_opt(row.get::<_, Option<String>>(7)?),
        body: parse_json_opt(row.get::<_, Option<String>>(8)?),
        auth: parse_json_opt(row.get::<_, Option<String>>(9)?),
        pre_request_script: row.get(10)?,
        test_script: row.get(11)?,
        variables: parse_json_opt(row.get::<_, Option<String>>(12)?),
        description: row.get(13)?,
        sort_order: row.get(14)?,
        created_at: row.get(15)?,
        updated_at: row.get(16)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_store() -> (ApiClientStore, tempfile::TempDir) {
        let dir = tempfile::tempdir().unwrap();
        let store = ApiClientStore::open(dir.path()).unwrap();
        (store, dir)
    }

    #[test]
    fn test_create_and_list_collections() {
        let (store, _dir) = test_store();
        let col = store
            .create_collection(&CreateCollectionReq {
                name: "Test".into(),
                description: None,
                auth: None,
                headers: None,
                variables: None,
                pre_request_script: None,
                test_script: None,
            })
            .unwrap();
        assert_eq!(col.name, "Test");

        let list = store.list_collections().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, col.id);
    }

    #[test]
    fn test_crud_requests() {
        let (store, _dir) = test_store();
        let col = store
            .create_collection(&CreateCollectionReq {
                name: "C1".into(),
                description: None,
                auth: None,
                headers: None,
                variables: None,
                pre_request_script: None,
                test_script: None,
            })
            .unwrap();

        let req = store
            .create_request(&CreateApiRequestReq {
                collection_id: col.id.clone(),
                folder_id: None,
                name: "Get Users".into(),
                method: "GET".into(),
                url: "https://api.example.com/users".into(),
                params: None,
                headers: None,
                body: None,
                auth: None,
                pre_request_script: None,
                test_script: None,
                variables: None,
                description: None,
            })
            .unwrap();

        let fetched = store.get_request(&req.id).unwrap().unwrap();
        assert_eq!(fetched.name, "Get Users");

        let dup = store.duplicate_request(&req.id).unwrap().unwrap();
        assert_ne!(dup.id, req.id);
        assert!(dup.name.contains("copy"));

        assert!(store.delete_request(&req.id).unwrap());
        assert!(store.get_request(&req.id).unwrap().is_none());
    }

    #[test]
    fn test_environments() {
        let (store, _dir) = test_store();
        let env = store
            .create_environment(&CreateEnvironmentReq {
                name: "Dev".into(),
                variables: serde_json::json!([{"key": "host", "value": "localhost"}]),
                is_global: false,
            })
            .unwrap();
        assert_eq!(env.name, "Dev");

        let list = store.list_environments().unwrap();
        assert_eq!(list.len(), 1);

        assert!(store.delete_environment(&env.id).unwrap());
        assert!(store.list_environments().unwrap().is_empty());
    }

    #[test]
    fn test_history() {
        let (store, _dir) = test_store();
        let entry = HistoryEntry {
            id: Uuid::new_v4().to_string(),
            request: serde_json::json!({"method": "GET", "url": "https://example.com"}),
            response: Some(serde_json::json!({"status": 200})),
            duration_ms: Some(150),
            starred: false,
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        store.add_history(&entry).unwrap();

        let list = store
            .list_history(&HistoryQuery {
                limit: 50,
                offset: 0,
                starred: None,
            })
            .unwrap();
        assert_eq!(list.len(), 1);

        store.clear_history().unwrap();
        assert!(store
            .list_history(&HistoryQuery {
                limit: 50,
                offset: 0,
                starred: None,
            })
            .unwrap()
            .is_empty());
    }
}
