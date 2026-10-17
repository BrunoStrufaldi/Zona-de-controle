//! Planos de energia: identificação pelos GUIDs do Windows e a sugestão.
//!
//! Decisão do usuário: a sugestão é sempre o **Alto desempenho** quando ele
//! existe e não está ativo (inclusive no lugar de um plano personalizado).

use serde::Serialize;

pub const BALANCED: &str = "381b4222-f694-41f0-9685-ff5bb260df2e";
pub const HIGH_PERFORMANCE: &str = "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c";
pub const POWER_SAVER: &str = "a1841308-3541-4fab-bc81-f71556f20b4a";
/// Modelo do "Desempenho Máximo". As cópias que o Windows cria a partir dele
/// ganham outro GUID e aparecem como personalizadas (o nome é do usuário).
pub const ULTIMATE_PERFORMANCE: &str = "e9a42b02-d5df-448d-aa00-03f14749eb61";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PlanKind {
    Balanced,
    HighPerformance,
    PowerSaver,
    UltimatePerformance,
    Custom,
}

pub fn plan_kind(guid: &str) -> PlanKind {
    match guid.to_ascii_lowercase().as_str() {
        BALANCED => PlanKind::Balanced,
        HIGH_PERFORMANCE => PlanKind::HighPerformance,
        POWER_SAVER => PlanKind::PowerSaver,
        ULTIMATE_PERFORMANCE => PlanKind::UltimatePerformance,
        _ => PlanKind::Custom,
    }
}

/// Plano como o Windows informa (GUID e nome, já localizado).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RawPowerPlan {
    pub guid: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RawPower {
    pub plans: Vec<RawPowerPlan>,
    pub active_guid: Option<String>,
    /// Modern Standby (S0): o Windows usa "modos de energia", não planos.
    pub modern_standby: bool,
    pub has_battery: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PowerPlan {
    /// GUID em minúsculas.
    pub guid: String,
    pub name: String,
    pub kind: PlanKind,
    pub active: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PowerStatus {
    pub plans: Vec<PowerPlan>,
    pub modern_standby: bool,
    pub has_battery: bool,
}

impl PowerStatus {
    pub fn from_raw(raw: RawPower) -> Self {
        let active = raw.active_guid.map(|guid| guid.to_ascii_lowercase());
        let plans = raw
            .plans
            .into_iter()
            .map(|plan| {
                let guid = plan.guid.to_ascii_lowercase();
                PowerPlan {
                    kind: plan_kind(&guid),
                    active: active.as_deref() == Some(guid.as_str()),
                    name: plan.name,
                    guid,
                }
            })
            .collect();
        Self {
            plans,
            modern_standby: raw.modern_standby,
            has_battery: raw.has_battery,
        }
    }

    pub fn active(&self) -> Option<&PowerPlan> {
        self.plans.iter().find(|plan| plan.active)
    }

    /// O Alto desempenho, se existir e não estiver ativo. Com Modern Standby
    /// não há troca de plano (o Windows ignora os planos).
    pub fn suggestion(&self) -> Option<&PowerPlan> {
        if self.modern_standby {
            return None;
        }
        self.plans
            .iter()
            .find(|plan| plan.kind == PlanKind::HighPerformance && !plan.active)
    }
}

/// Partes de um GUID `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` (para gravar o plano ativo).
pub fn parse_guid(text: &str) -> Option<(u32, u16, u16, [u8; 8])> {
    let parts: Vec<&str> = text.trim().split('-').collect();
    let lengths: Vec<usize> = parts.iter().map(|part| part.len()).collect();
    if lengths != [8, 4, 4, 4, 12]
        || !text
            .trim()
            .chars()
            .all(|c| c == '-' || c.is_ascii_hexdigit())
    {
        return None;
    }
    let data1 = u32::from_str_radix(parts[0], 16).ok()?;
    let data2 = u16::from_str_radix(parts[1], 16).ok()?;
    let data3 = u16::from_str_radix(parts[2], 16).ok()?;
    let tail = format!("{}{}", parts[3], parts[4]);
    let mut data4 = [0u8; 8];
    for (index, byte) in data4.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&tail[index * 2..index * 2 + 2], 16).ok()?;
    }
    Some((data1, data2, data3, data4))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_guids() {
        assert_eq!(
            parse_guid(HIGH_PERFORMANCE),
            Some((
                0x8c5e7fda,
                0xe8bf,
                0x4a96,
                [0x9a, 0x85, 0xa6, 0xe2, 0x3a, 0x8c, 0x63, 0x5c]
            ))
        );
        assert_eq!(
            parse_guid("8C5E7FDA-E8BF-4A96-9A85-A6E23A8C635C"),
            parse_guid(HIGH_PERFORMANCE)
        );
        assert_eq!(parse_guid("8c5e7fda-e8bf-4a96-9a85"), None);
        assert_eq!(parse_guid("zc5e7fda-e8bf-4a96-9a85-a6e23a8c635c"), None);
        assert_eq!(parse_guid("+c5e7fda-e8bf-4a96-9a85-a6e23a8c635c"), None);
    }

    const CUSTOM: &str = "d9a0ec84-2b20-44aa-aa4a-29bb9427be75";

    fn raw(active: &str) -> RawPower {
        RawPower {
            plans: [
                (BALANCED, "Equilibrado"),
                (HIGH_PERFORMANCE, "Alto desempenho"),
                (POWER_SAVER, "Economia de energia"),
                (CUSTOM, "Desempenho Máximo"),
            ]
            .into_iter()
            .map(|(guid, name)| RawPowerPlan {
                guid: guid.to_ascii_uppercase(),
                name: name.into(),
            })
            .collect(),
            active_guid: Some(active.into()),
            modern_standby: false,
            has_battery: false,
        }
    }

    #[test]
    fn identifies_windows_plans_and_customs() {
        let status = PowerStatus::from_raw(raw(BALANCED));
        let kinds: Vec<PlanKind> = status.plans.iter().map(|plan| plan.kind).collect();
        assert_eq!(
            kinds,
            [
                PlanKind::Balanced,
                PlanKind::HighPerformance,
                PlanKind::PowerSaver,
                PlanKind::Custom
            ]
        );
        assert_eq!(status.plans[0].guid, BALANCED, "GUID em minúsculas");
        assert_eq!(
            plan_kind(ULTIMATE_PERFORMANCE),
            PlanKind::UltimatePerformance
        );
    }

    #[test]
    fn always_suggests_high_performance_when_not_active() {
        for active in [BALANCED, POWER_SAVER, CUSTOM] {
            let status = PowerStatus::from_raw(raw(active));
            assert_eq!(
                status.suggestion().map(|plan| plan.guid.as_str()),
                Some(HIGH_PERFORMANCE),
                "ativo: {active}"
            );
        }
        let status = PowerStatus::from_raw(raw(HIGH_PERFORMANCE));
        assert_eq!(status.active().unwrap().guid, HIGH_PERFORMANCE);
        assert_eq!(status.suggestion(), None);
    }

    #[test]
    fn no_suggestion_without_the_plan_or_with_modern_standby() {
        let mut without = raw(BALANCED);
        without
            .plans
            .retain(|plan| plan_kind(&plan.guid) != PlanKind::HighPerformance);
        assert_eq!(PowerStatus::from_raw(without).suggestion(), None);

        let mut standby = raw(BALANCED);
        standby.modern_standby = true;
        assert_eq!(PowerStatus::from_raw(standby).suggestion(), None);
    }

    #[test]
    fn unknown_active_plan() {
        let mut unknown = raw(BALANCED);
        unknown.active_guid = None;
        let status = PowerStatus::from_raw(unknown);
        assert_eq!(status.active(), None);
        assert!(status.suggestion().is_some());
    }
}
