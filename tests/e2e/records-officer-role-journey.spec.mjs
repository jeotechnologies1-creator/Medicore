import { roleJourney } from './role-journey-helper.mjs';

roleJourney({
  role: 'records_officer',
  allowed: ["dashboard","records","vital_registry"],
  denied: ["billing","pharmacy","surgeries"]
});
