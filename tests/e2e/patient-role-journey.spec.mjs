import { roleJourney } from './role-journey-helper.mjs';

roleJourney({
  role: 'patient',
  allowed: ["dashboard","portal","appointments","lab_results","prescriptions","billing","messages"],
  denied: ["records","hr","audit","inventory"]
});
