import { roleJourney } from './role-journey-helper.mjs';

roleJourney({
  role: 'radiographer',
  allowed: ["dashboard","radiology","upload"],
  denied: ["billing","records","hr"]
});
