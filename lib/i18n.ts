/**
 * Frontline copy goes through t(). English is the only catalog shipped.
 * Spanish is a slot: add keys to `es` and the site locale setting will use them.
 */
const en: Record<string, string> = {
  "app.name": "Yardline",
  "nav.yard": "Yard",
  "nav.doors": "Doors",
  "nav.gate": "Gate",
  "nav.setup": "Setup",
  "nav.onboard": "Guided",
  "nav.events": "Events",
  "nav.simulator": "Simulator",
  "nav.tv": "TV",
  "sync.allSent": "All sent",
  "sync.sending": "Sending",
  "sync.offline": "Offline.",
  "sync.saved": "saved on this tablet",
  "sync.review": "needs review",
  "gate.title": "Gate check-in",
  "gate.newArrival": "New arrival",
  "gate.checkIn": "Check in",
  "gate.checkOut": "Check out",
  "gate.arrived": "Arrived",
  "gate.editTime": "Edit time",
  "gate.find": "Find expected arrival",
  "gate.noAppointment": "No appointment",
  "gate.trailer": "Trailer number",
  "gate.trailerHelp": "Read it off the trailer, not the paperwork.",
  "gate.loaded": "Loaded",
  "gate.empty": "Empty",
  "gate.seal": "Seal number",
  "gate.sealPrompt": "Type the seal number you see",
  "gate.noSeal": "No seal",
  "gate.checkSeal": "Check seal",
  "gate.reenter": "Re-enter seal",
  "gate.hold": "Hold trailer",
  "gate.accept": "Accept with reason",
  "gate.sealMismatch": "Seal does not match",
  "gate.expected": "Expected",
  "gate.found": "Found on trailer",
  "gate.reefer": "Reefer check",
  "gate.unitRunning": "Unit running",
  "gate.yes": "Yes",
  "gate.no": "No",
  "gate.setPoint": "Set point",
  "gate.display": "Display reads",
  "gate.fuel": "Fuel",
  "gate.inRange": "In range",
  "gate.temp": "TEMP",
  "gate.lowFuel": "Low fuel",
  "gate.unitOff": "Unit off",
  "gate.useSpot": "Use",
  "gate.chooseAnother": "Choose another",
  "gate.confirmOut": "Confirm check-out",
  "gate.goBack": "Go back",
  "gate.savedLocal": "Saved on this tablet",
  "yard.map": "Map",
  "yard.list": "List",
  "yard.search": "Find trailer or SCAC",
  "role.gate": "Gate",
  "role.office": "Office",
  "role.admin": "Admin",
};

const es: Record<string, string> = {};

export type Locale = "en" | "es";

export function t(key: string, locale: Locale = "en"): string {
  if (locale === "es" && es[key]) return es[key];
  return en[key] ?? key;
}
