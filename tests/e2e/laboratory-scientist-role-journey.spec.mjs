import { roleJourney } from './role-journey-helper.mjs';

roleJourney({
  role: 'laboratory_scientist',
  allowed: ["dashboard","laboratory","results","blood_bank"],
  denied: ["billing","records","hr"]
});
