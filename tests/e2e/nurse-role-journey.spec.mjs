import { roleJourney } from './role-journey-helper.mjs';

roleJourney({
  role: 'nurse',
  allowed: ["dashboard","patients","nursing","vitals","medications"],
  denied: ["billing","records","hr"]
});
