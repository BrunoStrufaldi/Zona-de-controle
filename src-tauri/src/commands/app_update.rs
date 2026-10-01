//! Atualização do app pelo GitHub Releases. O endereço é fixo (HTTPS) no
//! `tauri.conf.json` e nenhum command recebe URL ou arquivo: buscar é leitura;
//! instalar é outro command, que faz backup, baixa, confere a assinatura e só
//! então abre o instalador. Nada acontece sem o clique do usuário.

use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, State};
use tauri_plugin_updater::{Error as UpdaterError, UpdaterExt};

use crate::domain::app_update::{release_notes, AvailableUpdate, UpdateProgress, UpdateStage};
use crate::error::{AppError, AppResult};
use crate::services::app_update as service;
use crate::state::AppState;

/// Tempo máximo de cada pedido (a busca e o download do instalador, ~4 MB).
const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);

/// Procura uma versão maior que a instalada (somente leitura). Guarda a versão
/// encontrada para a instalação, que só aceita exatamente ela.
#[tauri::command]
pub async fn check_app_update(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<Option<AvailableUpdate>> {
    let updater = app
        .updater_builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|error| AppError::Update(check_message(&error)))?;
    let found = updater
        .check()
        .await
        .map_err(|error| AppError::Update(check_message(&error)))?;

    let available = found.as_ref().map(|update| AvailableUpdate {
        current_version: update.current_version.clone(),
        version: update.version.clone(),
        notes: release_notes(update.body.as_deref()),
    });
    *state
        .pending_update
        .lock()
        .map_err(|_| AppError::StatePoisoned)? = found;
    Ok(available)
}

/// Instala a versão encontrada na última busca: backup do banco → download →
/// assinatura conferida → auditoria → instalador. No Windows o app fecha e o
/// instalador o abre de novo; por isso o sucesso é auditado antes. Falhas em
/// qualquer etapa são auditadas e nada é instalado.
#[tauri::command]
pub async fn install_app_update(state: State<'_, AppState>, version: String) -> AppResult<()> {
    if cfg!(debug_assertions) {
        return Err(AppError::Update(
            "No modo de desenvolvimento não se instala atualização: use o app instalado.".into(),
        ));
    }
    let update = state
        .pending_update
        .lock()
        .map_err(|_| AppError::StatePoisoned)?
        .clone()
        .filter(|update| update.version == version)
        .ok_or_else(|| {
            AppError::Validation("Procure a atualização de novo antes de instalar.".into())
        })?;
    let (from, to) = (update.current_version.clone(), update.version.clone());
    let _guard = state.update_run.begin()?;

    let db = Arc::clone(&state.db);
    let backup_dir = state.backup_dir.clone();
    let (backup_from, backup_to) = (from.clone(), to.clone());
    let backup = tauri::async_runtime::spawn_blocking(move || {
        service::backup_before_install(&db, &backup_dir, &backup_from, &backup_to)
    })
    .await
    .map_err(|_| AppError::StatePoisoned)??;

    state.update_run.set_stage(UpdateStage::Downloading);
    let run = &state.update_run;
    let bytes = match update
        .download(|chunk, total| run.add_downloaded(chunk, total), || {})
        .await
    {
        Ok(bytes) => bytes,
        Err(error) => {
            let message = download_message(&error);
            service::record_install_failure(
                &state.db,
                &from,
                &to,
                UpdateStage::Downloading,
                &message,
            );
            return Err(AppError::Update(message));
        }
    };

    service::record_install_ready(&state.db, &from, &to, &backup)?;
    state.update_run.set_stage(UpdateStage::Installing);
    // No Windows, `install` abre o instalador e encerra o app aqui.
    update.install(bytes).map_err(|error| {
        let message = format!("O instalador não pôde ser aberto; nada foi instalado. ({error})");
        service::record_install_failure(&state.db, &from, &to, UpdateStage::Installing, &message);
        AppError::Update(message)
    })
}

/// Andamento da instalação em curso (`null` se nenhuma estiver rodando).
#[tauri::command]
pub async fn get_app_update_progress(
    state: State<'_, AppState>,
) -> AppResult<Option<UpdateProgress>> {
    state.update_run.progress()
}

fn check_message(error: &UpdaterError) -> String {
    match error {
        UpdaterError::ReleaseNotFound => "Nenhuma versão publicada foi encontrada.".into(),
        UpdaterError::Reqwest(_) | UpdaterError::Network(_) => {
            "Sem conexão com o servidor de atualizações. Confira a internet e tente de novo.".into()
        }
        UpdaterError::TargetNotFound(_) | UpdaterError::TargetsNotFound(_) => {
            "A versão publicada não tem instalador para este computador.".into()
        }
        other => format!("Não foi possível procurar atualizações. ({other})"),
    }
}

fn download_message(error: &UpdaterError) -> String {
    match error {
        UpdaterError::Minisign(_)
        | UpdaterError::Base64(_)
        | UpdaterError::SignatureUtf8(_)
        | UpdaterError::SignedVersionMismatch { .. }
        | UpdaterError::MissingSignedVersion => {
            "A assinatura da atualização não confere com a do app; nada foi instalado.".into()
        }
        UpdaterError::Reqwest(_) | UpdaterError::Network(_) => {
            "O download foi interrompido; nada foi instalado. Confira a internet e tente de novo."
                .into()
        }
        other => format!("Não foi possível baixar a atualização; nada foi instalado. ({other})"),
    }
}
