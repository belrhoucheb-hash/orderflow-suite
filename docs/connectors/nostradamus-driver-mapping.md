# Nostradamus Driver Mapping

OrderFlow gebruikt het bestaande chauffeursmodel als primaire structuur. Nostradamus vult dat model aan.

## Tab Mapping

| Nostradamus | OrderFlow doel | Bestaand? | Opmerking |
| --- | --- | --- | --- |
| Details | `drivers` basis- en contactvelden | Ja | Naam, email, telefoon, geboortedatum, adres, noodcontact, personeelsnummer |
| Contract | `drivers` arbeidsvelden | Ja | `employment_type`, `hire_date`, `termination_date`, `contract_hours_per_week` |
| Uren | `driver_external_hours` + `driver_actual_hours_per_week` | Ja | Feitelijke uren apart van geplande uren uit trips |
| Verlof | `driver_availability` | Ja | Dagstatus `verlof`, inclusief reden en optionele uren |
| Ziekte | `driver_availability` | Ja | Dagstatus `ziek`, inclusief reden en optionele uren |
| Bestanden | `driver_documents` | Nieuw | Algemene personeelsbestanden, los van certificaatbestanden |

## Existing Driver Fields

### Details -> `drivers`

- `name`
- `email`
- `phone`
- `birth_date`
- `street`
- `house_number`
- `house_number_suffix`
- `zipcode`
- `city`
- `country`
- `emergency_contact_name`
- `emergency_contact_relation`
- `emergency_contact_phone`
- `personnel_number`

### Contract -> `drivers`

- `employment_type`
- `hire_date`
- `termination_date`
- `contract_hours_per_week`

### Availability / Planning

- `driver_availability.status`
- `driver_availability.hours_available`
- `driver_availability.reason`
- `driver_schedules` blijft de roosterbron; verlof/ziekte uit Nostradamus kan later worden doorvertaald naar roosterregels als dat gewenst is.

## Fallback

Ruwe brondata blijft beschikbaar in `driver_external_personnel_cards` voor debugging en voor velden die nog geen definitieve plek hebben in OrderFlow.
