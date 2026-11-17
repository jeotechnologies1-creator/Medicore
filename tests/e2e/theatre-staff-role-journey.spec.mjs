import { roleJourney } from './role-journey-helper.mjs';

roleJourney({
  role: 'theatre_staff',
  allowed: ["dashboard","surgeries"],
  denied: ["billing","records","hr"]
});
