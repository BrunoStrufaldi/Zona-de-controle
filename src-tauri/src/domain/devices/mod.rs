//! Dispositivos e bateria (Fase 3).
//!
//! No Windows não existe uma API única para bateria de periféricos. Cada fonte
//! é um [`BatteryProvider`] independente, e todos são SOMENTE LEITURA.
//! Nesta fase os providers são stubs: descrevem a si mesmos e não listam
//! nenhum dispositivo (nunca inventam leituras).

mod providers;
// Os tipos formam o contrato com o frontend; vários só serão construídos
// quando os providers reais forem implementados.
#[allow(dead_code)]
mod types;

pub use types::{DeviceBatteryInfo, ProviderDescriptor};

use crate::error::AppResult;

/// Fonte de informações de bateria. Implementações devem ser somente leitura.
pub trait BatteryProvider: Send + Sync {
    fn descriptor(&self) -> ProviderDescriptor;

    /// Lista os dispositivos conhecidos por este provider.
    fn list_devices(&self) -> AppResult<Vec<DeviceBatteryInfo>>;
}

/// Conjunto de providers registrados na inicialização do app.
pub struct BatteryProviderRegistry {
    providers: Vec<Box<dyn BatteryProvider>>,
}

impl BatteryProviderRegistry {
    pub fn with_default_providers() -> Self {
        Self {
            providers: vec![
                Box::new(providers::BluetoothBatteryProvider),
                Box::new(providers::XInputBatteryProvider),
                Box::new(providers::HidVendorProvider),
            ],
        }
    }

    pub fn descriptors(&self) -> Vec<ProviderDescriptor> {
        self.providers.iter().map(|p| p.descriptor()).collect()
    }

    /// Agrega os dispositivos de todos os providers.
    pub fn list_devices(&self) -> AppResult<Vec<DeviceBatteryInfo>> {
        let mut devices = Vec::new();
        for provider in &self.providers {
            devices.extend(provider.list_devices()?);
        }
        Ok(devices)
    }
}

#[cfg(test)]
mod tests {
    use super::types::ProviderStatus;
    use super::*;

    #[test]
    fn registers_the_three_planned_providers_without_fake_devices() {
        let registry = BatteryProviderRegistry::with_default_providers();

        let descriptors = registry.descriptors();
        assert_eq!(descriptors.len(), 3);
        assert!(descriptors
            .iter()
            .all(|d| d.status == ProviderStatus::Planned));
        assert!(registry.list_devices().unwrap().is_empty());
    }
}
